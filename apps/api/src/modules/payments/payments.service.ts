import { PaymentProviderRegistry } from './providers/payment-provider.registry';
import {
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  MockPaymentProvider,
  CommerceError,
  assertMock,
  lock,
  outbox,
  transition,
  paymentEventSchema,
  VerifiedPaymentEvent,
} from '@devtrust/commerce';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { randomToken } from '../../common/crypto';
import {
  CommerceAccessService,
  serialize,
} from '../checkout/commerce-access.service';
@Injectable()
export class PaymentsService {
  readonly provider: MockPaymentProvider;
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
    @Inject(PaymentProviderRegistry) registry: PaymentProviderRegistry,
  ) {
    this.provider = registry.mock;
  }
  async create(userId: string, orderId: string) {
    assertMock(this.runtime.env);
    await this.access.order(userId, orderId);
    const payment = await this.db.$transaction(async (tx) => {
      await lock(tx, 'order:' + orderId);
      const order = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      if (order.environment === 'LIVE')
        throw new ConflictException(
          'Um pagamento mock não pode financiar uma encomenda live',
        );
      await this.access.organization(
        userId,
        order.organizationId,
        'orders.manage',
        tx,
      );
      const existing = await tx.payment.findUnique({
        where: { orderId_provider: { orderId, provider: 'mock' } },
      });
      if (existing) return existing;
      if (order.status !== 'PENDING_PAYMENT' || order.expiresAt <= new Date())
        throw new ConflictException('Encomenda não aceita novos pagamentos');
      const p = await tx.payment.create({
        data: {
          orderId,
          provider: 'mock',
          amountMinor: order.totalMinor,
          currency: order.currency,
          environment: 'MOCK',
        },
      });
      await transition(
        tx,
        orderId,
        'PAYMENT_PROCESSING',
        'MOCK_PAYMENT_STARTED',
        userId,
      );
      await outbox(tx, 'payment-reconciliation', 'payment-' + p.id, {
        paymentId: p.id,
      });
      return p;
    });
    if (!payment.providerPaymentId) {
      try {
        const result = await this.provider.createPayment({
          paymentId: payment.id,
          orderId,
          amountMinor: payment.amountMinor.toString(),
          currency: payment.currency,
          idempotencyKey: payment.id,
        });
        await this.db.payment.updateMany({
          where: { id: payment.id, providerPaymentId: null },
          data: {
            providerPaymentId: result.externalPaymentId,
            status: result.status,
          },
        });
      } catch {
        await this.db.payment.updateMany({
          where: { id: payment.id, providerPaymentId: null },
          data: { status: 'UNKNOWN' },
        });
      }
    }
    return serialize(
      await this.db.payment.findUniqueOrThrow({ where: { id: payment.id } }),
    );
  }
  async get(userId: string, id: string) {
    const p = await this.db.payment.findUnique({
      where: { id },
      include: { refunds: true },
    });
    if (!p) throw new NotFoundException('Pagamento não encontrado');
    await this.access.order(userId, p.orderId);
    return serialize(p);
  }
  async event(event: VerifiedPaymentEvent) {
    const p = await this.db.payment.findUnique({
      where: { providerPaymentId: event.externalPaymentId },
      include: { order: true },
    });
    if (
      !p ||
      p.provider !== 'mock' ||
      p.order.environment === 'LIVE' ||
      p.environment !== 'MOCK' ||
      p.orderId !== event.orderId ||
      p.amountMinor.toString() !== event.amountMinor ||
      p.currency !== event.currency ||
      p.order.totalMinor !== p.amountMinor
    )
      throw new CommerceError('PAYMENT_AMOUNT_OR_REFERENCE_MISMATCH', 400);
    await this.db.$transaction(async (tx) => {
      await lock(tx, 'payment-event:' + event.eventId);
      const old = await tx.paymentEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: 'mock',
            providerEventId: event.eventId,
          },
        },
      });
      if (old) {
        if (old.payloadHash !== event.payloadHash || old.paymentId !== p.id)
          throw new CommerceError('WEBHOOK_EVENT_CONFLICT', 409);
        return;
      }
      const data = paymentEventSchema.parse({
        eventId: event.eventId,
        externalPaymentId: event.externalPaymentId,
        orderId: event.orderId,
        amountMinor: event.amountMinor,
        currency: event.currency,
        status: event.status,
      });
      const stored = await tx.paymentEvent.create({
        data: {
          paymentId: p.id,
          provider: 'mock',
          providerEventId: event.eventId,
          eventType: event.status,
          verified: true,
          payloadHash: event.payloadHash,
          payload: data,
        },
      });
      await outbox(tx, 'payment-confirmation', 'event-' + stored.id, {
        eventId: stored.id,
      });
    });
    return { accepted: true };
  }
  async simulate(userId: string, id: string, outcome: 'PAID' | 'DECLINED') {
    assertMock(this.runtime.env);
    const p = await this.get(userId, id);
    const raw = Buffer.from(
      JSON.stringify({
        eventId: 'mock-' + randomToken(),
        externalPaymentId: p.providerPaymentId,
        orderId: p.orderId,
        amountMinor: p.amountMinor,
        currency: p.currency,
        status: outcome,
      }),
    );
    const timestamp = Math.floor(Date.now() / 1000).toString();
    return this.event(
      await this.provider.verifyWebhook({
        rawBody: raw,
        timestamp,
        signature: this.provider.sign(raw, timestamp),
      }),
    );
  }
}
