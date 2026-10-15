import { RegistrarError } from '@devtrust/registrars';
import type {
  PrismaClient,
  OrderItem,
  Order,
  DomainContact,
  DomainRegistration,
  RegistrationStatus,
} from '@devtrust/database';
import type Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { CommerceConfig, CommerceError, assertRegistration } from './config';
import { PaymentProvider, paymentEventSchema } from './payments';
import {
  DomainRegistrationProvider,
  RegistrarRegistrationRequest,
  RegistrarRegistrationResult,
} from './registration';
import { lock, transition, outbox, notify } from './lifecycle';
export const commerceQueues = [
  'payment-confirmation',
  'domain-registration',
  'domain-reconciliation',
  'payment-reconciliation',
  'invoice-generation',
  'email-notifications',
  'refund-processing',
] as const;
export type CommerceTopic = (typeof commerceQueues)[number];
export type CommerceJob = { outboxId: string };
export class CommerceProcessor {
  constructor(
    readonly db: PrismaClient,
    readonly redis: Redis,
    readonly config: CommerceConfig,
    readonly payment: PaymentProvider,
    readonly registration: DomainRegistrationProvider,
    readonly logger: { info: (o: object) => void; error: (o: object) => void },
  ) {}
  async process(job: CommerceJob) {
    const row = await this.db.commerceOutbox.findUniqueOrThrow({
      where: { id: job.outboxId },
    });
    if (row.completedAt) return { duplicate: true };
    const p = row.payload as Record<string, string>;
    switch (row.topic) {
      case 'payment-confirmation':
        await this.confirm(p.eventId);
        break;
      case 'payment-reconciliation':
        await this.paymentReconcile(p.paymentId);
        break;
      case 'domain-registration':
        await this.register(p.registrationId, false);
        break;
      case 'domain-reconciliation':
        await this.register(p.registrationId, true);
        break;
      case 'invoice-generation':
        await this.invoice(p.orderId);
        break;
      case 'refund-processing':
        await this.refund(p.refundId);
        break;
      case 'email-notifications':
        throw new CommerceError('EMAIL_PROCESSOR_REQUIRED');
      default:
        throw new CommerceError('UNKNOWN_JOB');
    }
    await this.db.commerceOutbox.update({
      where: { id: row.id },
      data: { completedAt: new Date(), lastErrorCode: null },
    });
    return { duplicate: false };
  }
  async confirm(eventId: string) {
    await this.db.$transaction(async (tx) => {
      const event = await tx.paymentEvent.findUniqueOrThrow({
        where: { id: eventId },
        include: { payment: { include: { order: true } } },
      });
      await lock(tx, 'order:' + event.payment.orderId);
      const current = await tx.paymentEvent.findUniqueOrThrow({
        where: { id: eventId },
      });
      if (current.processedAt) return;
      if (!current.verified) throw new CommerceError('UNVERIFIED_PAYMENT');
      const data = paymentEventSchema.parse(current.payload);
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: current.paymentId },
        include: { order: { include: { items: true } } },
      });
      if (
        data.externalPaymentId !== payment.providerPaymentId ||
        data.orderId !== payment.orderId ||
        data.amountMinor !== payment.amountMinor.toString() ||
        data.currency !== payment.currency ||
        payment.amountMinor !== payment.order.totalMinor
      )
        throw new CommerceError('PAYMENT_AMOUNT_OR_REFERENCE_MISMATCH');
      if (data.status === 'PAID' && !payment.paidAt) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'PAID', paidAt: new Date() },
        });
        if (
          ['CANCELLED', 'FAILED', 'REFUNDED'].includes(payment.order.status) ||
          payment.order.expiresAt <= new Date()
        ) {
          if (payment.order.status !== 'REFUNDED')
            await transition(
              tx,
              payment.orderId,
              'MANUAL_REVIEW',
              'LATE_PAYMENT',
            );
        } else {
          await transition(
            tx,
            payment.orderId,
            'PAID',
            'VERIFIED_' + payment.environment + '_PAYMENT',
          );
          for (const item of payment.order.items) {
            const registration = await tx.domainRegistration.findUniqueOrThrow({
              where: { orderItemId: item.id },
            });
            await outbox(
              tx,
              'domain-registration',
              'register-' + registration.id,
              { registrationId: registration.id },
            );
          }
          await outbox(tx, 'invoice-generation', 'invoice-' + payment.orderId, {
            orderId: payment.orderId,
          });
        }
        await notify(
          tx,
          payment.order.customerId,
          'PAYMENT_CONFIRMED',
          'Pagamento confirmado (' + payment.environment + ')',
        );
      } else if (data.status === 'DECLINED' && !payment.paidAt) {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'DECLINED' },
        });
        if (
          ['PENDING_PAYMENT', 'PAYMENT_PROCESSING'].includes(
            payment.order.status,
          )
        )
          await transition(tx, payment.orderId, 'FAILED', 'PAYMENT_DECLINED');
        await notify(
          tx,
          payment.order.customerId,
          'PAYMENT_FAILED',
          'Pagamento recusado',
        );
      }
      await tx.paymentEvent.update({
        where: { id: eventId },
        data: { processedAt: new Date() },
      });
    });
  }
  async paymentReconcile(id: string) {
    let p = await this.db.payment.findUniqueOrThrow({ where: { id } });
    if (
      p.paidAt ||
      ['DECLINED', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(p.status)
    )
      return;
    if (!p.providerPaymentId) {
      if (
        p.status === 'UNKNOWN' &&
        this.payment.supportsIdempotency?.create !== true
      )
        throw new CommerceError('PAYMENT_CREATE_REQUIRES_MANUAL_REVIEW');
      const result = await this.payment.createPayment({
        paymentId: p.id,
        orderId: p.orderId,
        amountMinor: p.amountMinor.toString(),
        currency: p.currency,
        idempotencyKey: p.id,
      });
      p = await this.db.payment.update({
        where: { id },
        data: {
          providerPaymentId: result.externalPaymentId,
          status: result.status,
        },
      });
    }
    const result = await this.payment.getPaymentStatus(p.providerPaymentId!);
    if (
      result.amountMinor !== p.amountMinor.toString() ||
      result.currency !== p.currency ||
      result.orderId !== p.orderId
    )
      throw new CommerceError('PAYMENT_RECONCILIATION_MISMATCH');
    const events = await this.db.paymentEvent.findMany({
      where: { paymentId: id, verified: true, processedAt: null },
      select: { id: true },
    });
    for (const event of events) await this.confirm(event.id);
  }
  private request(
    r: DomainRegistration & {
      item: OrderItem & {
        order: Order;
        contact: DomainContact;
        tld: { extension: string };
      };
    },
  ): RegistrarRegistrationRequest {
    const snap = r.item.quoteSnapshot as Record<string, string>;
    return {
      domainName: r.item.domainName,
      name: r.item.domainName.slice(0, -r.item.tld.extension.length - 1),
      extension: r.item.tld.extension,
      years: r.item.registrationYears,
      handle: '',
      nameservers: r.item.nameservers as string[],
      isPremium: r.item.isPremium,
      maximumSupplierCostMinor: r.item.supplierCostMinor.toString(),
      supplierCurrency: snap.supplierCurrency,
      idempotencyKey: r.idempotencyKey,
    };
  }
  async register(id: string, reconcile: boolean) {
    const owner = randomUUID(),
      key = 'commerce:register:' + id;
    if (!(await this.redis.set(key, owner, 'PX', 180000, 'NX')))
      throw new CommerceError('REGISTRATION_BUSY');
    try {
      const r = await this.db.domainRegistration.findUniqueOrThrow({
        where: { id },
        include: {
          item: { include: { order: true, contact: true, tld: true } },
          registrar: true,
        },
      });
      if (r.status === 'COMPLETED') return;
      const mismatch =
        (r.item.order.environment === 'MOCK' &&
          ['sandbox', 'live'].includes(this.config.DOMAIN_REGISTRATION_MODE)) ||
        (r.item.order.environment === 'SANDBOX' &&
          this.config.OPENPROVIDER_BASE_URL !==
            'https://api.sandbox.openprovider.nl/v1beta') ||
        (r.item.order.environment === 'LIVE' &&
          this.config.OPENPROVIDER_BASE_URL !==
            'https://api.openprovider.eu/v1');
      if (mismatch) {
        await this.record(
          id,
          'MANUAL_REVIEW',
          'REGISTRAR_ENVIRONMENT_MISMATCH',
        );
        return;
      }
      if (
        !reconcile &&
        ['FAILED', 'MANUAL_REVIEW', 'BLOCKED'].includes(r.status)
      )
        return;
      const request = this.request(r);
      if (
        r.item.order.environment !== 'MOCK' &&
        r.registrar.code !== 'openprovider'
      ) {
        await this.record(
          id,
          'MANUAL_REVIEW',
          'REGISTRATION_PROVIDER_UNSUPPORTED',
        );
        return;
      }
      if (reconcile || ['SUBMITTED', 'UNKNOWN', 'PENDING'].includes(r.status)) {
        let found: RegistrarRegistrationResult | null = null;
        try {
          found = r.externalRegistrationId
            ? await this.registration.getDomainStatus(r.externalRegistrationId)
            : await this.registration.findExistingRegistration({
                domainName: request.domainName,
                idempotencyKey: r.idempotencyKey,
              });
        } catch {
          await this.record(id, 'UNKNOWN', 'RECONCILIATION_UNAVAILABLE');
          return;
        }
        if (found) await this.finish(id, found);
        else
          await this.record(
            id,
            'MANUAL_REVIEW',
            'REGISTRATION_RESULT_UNCONFIRMED',
          );
        return;
      }
      try {
        assertRegistration(this.config, r.item.order.environment);
      } catch (e) {
        await this.record(
          id,
          'BLOCKED',
          e instanceof CommerceError ? e.code : 'REGISTRATION_DISABLED',
        );
        return;
      }
      const paid = await this.db.payment.findFirst({
        where: {
          orderId: r.item.orderId,
          paidAt: { not: null },
          environment: r.item.order.environment === 'LIVE' ? 'LIVE' : 'MOCK',
          status: 'PAID',
        },
      });
      if (!paid || paid.amountMinor !== r.item.order.totalMinor) {
        await this.record(id, 'BLOCKED', 'VERIFIED_PAYMENT_REQUIRED');
        return;
      }
      const link = await this.db.tldRegistrar.findUnique({
        where: {
          tldId_registrarId: {
            tldId: r.item.tldId,
            registrarId: r.registrarId,
          },
        },
      });
      const policy = link?.registrationPolicy as
        { approved?: boolean; requiresAdditionalData?: boolean } | undefined;
      if (
        !link?.isActive ||
        !link.supportsRegistration ||
        r.registrar.status !== 'ACTIVE' ||
        !policy?.approved ||
        policy.requiresAdditionalData !== false
      ) {
        await this.record(
          id,
          'MANUAL_REVIEW',
          'TLD_REGISTRATION_POLICY_REQUIRED',
        );
        return;
      }
      if (request.isPremium && !r.item.premiumAccepted) {
        await this.record(id, 'MANUAL_REVIEW', 'PREMIUM_ACCEPTANCE_REQUIRED');
        return;
      }
      await this.db.$transaction(async (tx) => {
        await transition(
          tx,
          r.item.orderId,
          'PROVISIONING',
          'REGISTRATION_STARTED',
        );
        await notify(
          tx,
          r.item.order.customerId,
          'REGISTRATION_STARTED',
          'Registo de domínio iniciado (' + r.item.order.environment + ')',
        );
      });
      const mapping = await this.db.$transaction(async (tx) => {
        await lock(tx, 'contact:' + r.item.domainContactId);
        return tx.registrarContactMapping.upsert({
          where: {
            registrarId_domainContactId: {
              registrarId: r.registrarId,
              domainContactId: r.item.domainContactId,
            },
          },
          create: {
            registrarId: r.registrarId,
            domainContactId: r.item.domainContactId,
          },
          update: {},
        });
      });
      if (mapping.externalHandle) {
        const mockHandle = mapping.externalHandle.startsWith('mock-contact-');
        if (mockHandle !== (r.item.order.environment === 'MOCK')) {
          await this.record(
            id,
            'MANUAL_REVIEW',
            'CONTACT_ENVIRONMENT_MISMATCH',
          );
          return;
        }
        request.handle = mapping.externalHandle;
      } else {
        if (mapping.status !== 'READY') {
          await this.record(id, 'MANUAL_REVIEW', 'CONTACT_RESULT_UNCONFIRMED');
          return;
        }
        const claimed = await this.db.registrarContactMapping.updateMany({
          where: { id: mapping.id, status: 'READY' },
          data: { status: 'SUBMITTED' },
        });
        if (!claimed.count) {
          await this.record(id, 'MANUAL_REVIEW', 'CONTACT_IN_PROGRESS');
          return;
        }
        try {
          const contact = await this.registration.createContact(r.item.contact);
          await this.db.registrarContactMapping.update({
            where: { id: mapping.id },
            data: { externalHandle: contact.handle, status: 'COMPLETED' },
          });
          request.handle = contact.handle;
        } catch {
          await this.db.registrarContactMapping.update({
            where: { id: mapping.id },
            data: { status: 'UNKNOWN' },
          });
          await this.record(id, 'MANUAL_REVIEW', 'CONTACT_RESULT_UNCONFIRMED');
          return;
        }
      }
      let check;
      try {
        check = await this.registration.check(request);
      } catch {
        await this.record(id, 'MANUAL_REVIEW', 'FINAL_QUOTE_UNAVAILABLE');
        return;
      }
      if (!check.available) {
        await this.record(id, 'FAILED', 'DOMAIN_UNAVAILABLE');
        return;
      }
      if (
        check.currency !== request.supplierCurrency ||
        BigInt(check.costMinor) > BigInt(request.maximumSupplierCostMinor) ||
        check.isPremium !== request.isPremium
      ) {
        await this.record(
          id,
          'MANUAL_REVIEW',
          'SUPPLIER_COST_EXCEEDS_AUTHORIZATION',
        );
        return;
      }
      const claimed = await this.db.$transaction(async (tx) => {
        await lock(tx, 'order:' + r.item.orderId);
        await lock(tx, 'registration:' + id);
        const eligible = await tx.payment.findFirst({
          where: {
            orderId: r.item.orderId,
            status: 'PAID',
            paidAt: { not: null },
          },
        });
        const reserved = await tx.refund.count({
          where: {
            payment: { orderId: r.item.orderId },
            status: { in: ['APPROVED', 'PROCESSING', 'UNKNOWN', 'COMPLETED'] },
          },
        });
        if (!eligible || reserved)
          throw new CommerceError('REFUND_OR_PAYMENT_CHANGED');
        const count = await tx.domainRegistration.updateMany({
          where: { id, status: { in: ['READY', 'BLOCKED'] } },
          data: { status: 'SUBMITTED', attemptCount: { increment: 1 } },
        });
        if (!count.count) return false;
        await tx.domainOperation.upsert({
          where: { idempotencyKey: r.idempotencyKey },
          create: {
            orderItemId: r.orderItemId,
            operationType: 'REGISTER',
            idempotencyKey: r.idempotencyKey,
            status: 'SUBMITTED',
            attemptCount: 1,
          },
          update: { status: 'SUBMITTED', attemptCount: { increment: 1 } },
        });
        await tx.orderItem.update({
          where: { id: r.orderItemId },
          data: {
            status: 'SUBMITTED',
            supplierCostMinor: BigInt(check.costMinor),
          },
        });
        await tx.auditLog.create({
          data: {
            organizationId: r.item.order.organizationId,
            action: 'registration.intent_submitted',
            resourceType: 'DomainRegistration',
            resourceId: id,
            metadata: {
              attempt: r.attemptCount + 1,
              supplierCostMinor: check.costMinor,
              currency: check.currency,
            },
          },
        });
        return true;
      });
      if (!claimed) return;
      let result;
      try {
        result = await this.registration.registerDomain(request);
      } catch (error) {
        if (
          error instanceof RegistrarError &&
          [
            'PROVIDER_INSUFFICIENT_BALANCE',
            'PROVIDER_DOMAIN_UNAVAILABLE',
            'PROVIDER_CONTACT_INVALID',
            'PROVIDER_CONTRACT_REQUIRED',
          ].includes(error.code)
        ) {
          await this.record(id, 'FAILED', error.code);
          return;
        }

        await this.db.$transaction(async (tx) => {
          await tx.domainRegistration.update({
            where: { id },
            data: {
              status: 'UNKNOWN',
              lastErrorCode: 'REGISTRATION_RESULT_UNCONFIRMED',
            },
          });
          await tx.orderItem.update({
            where: { id: r.orderItemId },
            data: { status: 'UNKNOWN' },
          });
          await outbox(tx, 'domain-reconciliation', 'reconcile-' + id, {
            registrationId: id,
          });
          await transition(
            tx,
            r.item.orderId,
            'MANUAL_REVIEW',
            'REGISTRATION_RESULT_UNCONFIRMED',
          );
        });
        return;
      }
      await this.finish(id, result);
    } finally {
      await this.redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0",
        1,
        key,
        owner,
      );
    }
  }
  async record(id: string, status: RegistrationStatus, code: string) {
    await this.db.$transaction(async (tx) => {
      const r = await tx.domainRegistration.findUniqueOrThrow({
        where: { id },
        include: { item: { include: { order: true } } },
      });
      await tx.domainRegistration.update({
        where: { id },
        data: { status, lastErrorCode: code },
      });
      await tx.orderItem.update({
        where: { id: r.orderItemId },
        data: { status },
      });
      await tx.domainOperation.updateMany({
        where: { orderItemId: r.orderItemId },
        data: { status, lastError: code },
      });
      await tx.auditLog.create({
        data: {
          organizationId: r.item.order.organizationId,
          action: 'registration.status',
          resourceType: 'DomainRegistration',
          resourceId: id,
          metadata: { status, code },
        },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: r.item.orderId },
      });
      const allFailed = items.every((i) => i.status === 'FAILED');
      const partial = items.some((i) => i.status === 'COMPLETED');
      const target = partial
        ? 'PARTIALLY_COMPLETED'
        : allFailed
          ? 'FAILED'
          : 'MANUAL_REVIEW';
      if (r.item.order.status === 'PAID')
        await transition(
          tx,
          r.item.orderId,
          'PROVISIONING',
          'REGISTRATION_EVALUATION',
        );
      if (r.item.order.status !== 'REFUNDED')
        await transition(tx, r.item.orderId, target, code);
      await notify(
        tx,
        r.item.order.customerId,
        status === 'FAILED' ? 'REGISTRATION_FAILED' : 'REGISTRATION_PENDING',
        status === 'FAILED' ? 'Registo falhou' : 'Registo aguarda intervenção',
      );
    });
  }
  async finish(id: string, result: RegistrarRegistrationResult) {
    await this.db.$transaction(async (tx) => {
      const r = await tx.domainRegistration.findUniqueOrThrow({
        where: { id },
        include: { item: { include: { order: true } } },
      });
      await lock(tx, 'order:' + r.item.orderId);
      if (r.status === 'COMPLETED') return;
      if (result.status !== 'ACTIVE') {
        await tx.domainRegistration.update({
          where: { id },
          data: {
            status: result.status === 'PENDING' ? 'PENDING' : 'UNKNOWN',
            externalRegistrationId: result.id,
          },
        });
        await tx.orderItem.update({
          where: { id: r.orderItemId },
          data: { status: result.status === 'PENDING' ? 'PENDING' : 'UNKNOWN' },
        });
        await transition(
          tx,
          r.item.orderId,
          'MANUAL_REVIEW',
          'REGISTRATION_PENDING',
        );
        await notify(
          tx,
          r.item.order.customerId,
          'REGISTRATION_PENDING',
          'Registo pendente',
        );
        return;
      }
      const domain = await tx.managedDomain.create({
        data: {
          organizationId: r.item.order.organizationId,
          domainName: r.item.domainName,
          environment: r.item.order.environment === 'LIVE' ? 'LIVE' : 'MOCK',
          status: 'ACTIVE',
          registeredAt: result.registeredAt,
          expiresAt: result.expiresAt,
        },
      });
      await tx.domainRegistration.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          externalRegistrationId: result.id,
          domainId: domain.id,
          completedAt: new Date(),
          lastErrorCode: null,
        },
      });
      await tx.orderItem.update({
        where: { id: r.orderItemId },
        data: { status: 'COMPLETED' },
      });
      await tx.domainOperation.updateMany({
        where: { orderItemId: r.orderItemId },
        data: {
          status: 'COMPLETED',
          externalReference: result.id,
          completedAt: new Date(),
        },
      });
      const items = await tx.orderItem.findMany({
        where: { orderId: r.item.orderId },
      });
      const target = items.every((i) => i.status === 'COMPLETED')
        ? 'COMPLETED'
        : items.some((i) =>
              ['FAILED', 'MANUAL_REVIEW', 'BLOCKED'].includes(i.status),
            )
          ? 'PARTIALLY_COMPLETED'
          : 'PROVISIONING';
      await transition(tx, r.item.orderId, target, 'REGISTRATION_CONFIRMED');
      await notify(
        tx,
        r.item.order.customerId,
        'DOMAIN_REGISTERED',
        'Domínio registado (' + r.item.order.environment + ')',
      );
    });
  }
  async invoice(orderId: string) {
    await this.db.$transaction(async (tx) => {
      await lock(tx, 'invoice:' + orderId);
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      const paid = await tx.payment.findFirst({
        where: { orderId, paidAt: { not: null } },
      });
      if (!paid) throw new CommerceError('PAID_ORDER_REQUIRED');
      const existing = await tx.invoice.findUnique({ where: { orderId } });
      if (existing) return;
      await tx.invoice.create({
        data: {
          orderId,
          invoiceNumber: 'INT-' + order.orderNumber,
          subtotalMinor: order.subtotalMinor,
          taxMinor: order.taxMinor,
          totalMinor: order.totalMinor,
          currency: order.currency,
          issuedAt: new Date(),
          status: order.environment === 'MOCK' ? 'INTERNAL_TEST' : 'INTERNAL',
        },
      });
      await notify(
        tx,
        order.customerId,
        'INVOICE_AVAILABLE',
        'Comprovativo interno disponível',
      );
    });
  }
  async refund(id: string) {
    const r = await this.db.refund.findUniqueOrThrow({
      where: { id },
      include: { payment: { include: { order: true } } },
    });
    if (r.status === 'COMPLETED' || r.status === 'REJECTED') return;
    if (!['APPROVED', 'PROCESSING'].includes(r.status))
      throw new CommerceError('REFUND_APPROVAL_REQUIRED');
    if (
      r.status === 'PROCESSING' &&
      this.payment.supportsIdempotency?.refund !== true
    )
      throw new CommerceError('REFUND_REQUIRES_MANUAL_REVIEW');
    await this.db.refund.update({
      where: { id },
      data: { status: 'PROCESSING' },
    });
    let result;
    try {
      result = await this.payment.refundPayment({
        externalPaymentId: r.payment.providerPaymentId!,
        amountMinor: r.amountMinor.toString(),
        currency: r.currency,
        idempotencyKey: r.id,
      });
    } catch {
      await this.db.refund.update({
        where: { id },
        data: { status: 'UNKNOWN' },
      });
      return;
    }
    await this.db.$transaction(async (tx) => {
      await lock(tx, 'order:' + r.payment.orderId);
      const current = await tx.refund.findUniqueOrThrow({ where: { id } });
      if (current.status === 'COMPLETED') return;
      await tx.refund.update({
        where: { id },
        data: {
          status: result.status === 'COMPLETED' ? 'COMPLETED' : 'UNKNOWN',
          providerRefundId: result.externalRefundId,
        },
      });
      if (result.status !== 'COMPLETED') return;
      const total = await tx.refund.aggregate({
        where: { paymentId: r.paymentId, status: 'COMPLETED' },
        _sum: { amountMinor: true },
      });
      const full = total._sum.amountMinor === r.payment.amountMinor;
      await tx.payment.update({
        where: { id: r.paymentId },
        data: { status: full ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
      });
      await transition(
        tx,
        r.payment.orderId,
        full ? 'REFUNDED' : 'MANUAL_REVIEW',
        full ? 'REFUND_CONFIRMED' : 'PARTIAL_REFUND_CONFIRMED',
        r.approvedBy || undefined,
      );
      await notify(
        tx,
        r.payment.order.customerId,
        'REFUND_COMPLETED',
        'Reembolso concluído (' + r.payment.environment + ')',
      );
    });
  }
}
export function createCommerceQueues(url: string) {
  return new Map(
    commerceQueues.map((topic) => [
      topic,
      new Queue(topic, {
        connection: { url },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: { age: 86400, count: 10000 },
          removeOnFail: false,
        },
      }),
    ]),
  );
}
export async function publishOutbox(
  db: PrismaClient,
  queues: Map<CommerceTopic, Queue>,
) {
  const pending = await db.commerceOutbox.findMany({
    where: { publishedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  for (const row of pending) {
    const queue = queues.get(row.topic as CommerceTopic);
    if (!queue) continue;
    try {
      await queue.add(row.topic, { outboxId: row.id }, { jobId: row.id });
      await db.commerceOutbox.update({
        where: { id: row.id },
        data: {
          publishedAt: new Date(),
          attempts: { increment: 1 },
          lastErrorCode: null,
        },
      });
    } catch {
      await db.commerceOutbox.update({
        where: { id: row.id },
        data: {
          attempts: { increment: 1 },
          lastErrorCode: 'QUEUE_UNAVAILABLE',
        },
      });
    }
  }
}
export function createCommerceWorkers(
  url: string,
  processor: CommerceProcessor,
  email: (id: string) => Promise<unknown>,
) {
  return commerceQueues.map((topic) => {
    const worker = new Worker<CommerceJob>(
      topic,
      async (job) => {
        if (topic === 'email-notifications') {
          const row = await processor.db.commerceOutbox.findUniqueOrThrow({
            where: { id: job.data.outboxId },
          });
          if (row.completedAt) return;
          await email(
            (row.payload as { notificationId: string }).notificationId,
          );
          await processor.db.commerceOutbox.update({
            where: { id: row.id },
            data: { completedAt: new Date() },
          });
          return;
        }
        return processor.process(job.data);
      },
      { connection: { url }, concurrency: 2, lockDuration: 180000 },
    );
    worker.on('failed', (job) => {
      processor.logger.error({
        event: 'commerce.job_failed',
        topic,
        jobId: job?.id,
      });
      if (job)
        void processor.db.commerceOutbox
          .update({
            where: { id: job.data.outboxId },
            data: { lastErrorCode: 'JOB_FAILED' },
          })
          .catch(() => undefined);
    });
    worker.on('error', () =>
      processor.logger.error({ event: 'commerce.worker_error', topic }),
    );
    return worker;
  });
}
