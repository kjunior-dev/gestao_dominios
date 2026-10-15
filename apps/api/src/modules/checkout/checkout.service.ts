import {
  Inject,
  Injectable,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@devtrust/database';
import { z } from 'zod/v3';
import { checkoutSchema } from '@devtrust/contracts';
import { CommerceError, lock, notify, assertMock } from '@devtrust/commerce';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { digest, randomToken } from '../../common/crypto';
import { DomainsService } from '../domains/domains.service';
import { CommerceAccessService, orderView } from './commerce-access.service';
@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(DomainsService) private domains: DomainsService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  config() {
    const e = this.runtime.env;
    return {
      paymentsMode: e.PAYMENTS_MODE,
      registrationMode: e.DOMAIN_REGISTRATION_MODE,
      liveTransactionsEnabled: e.LIVE_TRANSACTIONS_ENABLED,
      liveReady: false,
      termsVersion: e.CHECKOUT_TERMS_VERSION,
      taxBasisPoints: e.BILLING_TAX_BASIS_POINTS,
      billingMode: e.BILLING_MODE,
      emailMode: e.EMAIL_MODE,
    };
  }
  async create(userId: string, body: z.infer<typeof checkoutSchema>) {
    assertMock(this.runtime.env);
    const hash = digest(JSON.stringify(body));
    const existing = await this.db.order.findUnique({
      where: {
        customerId_idempotencyKey: {
          customerId: userId,
          idempotencyKey: body.idempotencyKey,
        },
      },
    });
    if (existing) {
      if (existing.requestHash !== hash)
        throw new ConflictException(
          'Chave de idempotência já utilizada noutro pedido',
        );
      return orderView(await this.access.order(userId, existing.id));
    }
    await this.access.organization(
      userId,
      body.organizationId,
      'orders.manage',
    );
    if (body.termsVersion !== this.runtime.env.CHECKOUT_TERMS_VERSION)
      throw new ConflictException('Confirme a versão atual dos termos');
    const contact = await this.db.domainContact.findFirst({
      where: { id: body.contactId, organizationId: body.organizationId },
    });
    if (!contact || contact.contactType !== 'OWNER')
      throw new ConflictException('Contacto não pertence à organização');
    const cart = await this.db.cart.findUnique({
      where: { userId },
      include: { items: true },
    });
    if (
      !cart ||
      cart.status !== 'OPEN' ||
      cart.expiresAt <= new Date() ||
      !cart.items.length
    )
      throw new ConflictException('Carrinho vazio ou expirado');
    if (
      cart.currency !== 'CVE' ||
      cart.items.some((i) => i.currency !== cart.currency)
    )
      throw new ConflictException(
        'Moeda do carrinho incompatível. Atualize as cotações.',
      );
    if (cart.items.some((i) => i.quoteExpiresAt <= new Date()))
      throw new ConflictException(
        'Cotação expirada. Atualize os itens do carrinho.',
      );
    if (cart.items.length > 20)
      throw new ConflictException('Limite de itens excedido');
    const snapshots = new Map<string, Record<string, unknown>>();
    for (const item of cart.items) {
      const check = await this.domains.search(
          { query: item.domainName, registrationYears: item.registrationYears },
          userId,
          true,
        ),
        result = check.results[0],
        snap = check.snapshots.get(item.domainName);
      if (!result || result.status !== 'AVAILABLE' || !result.quote || !snap)
        throw new ServiceUnavailableException(
          'Não foi possível confirmar disponibilidade e preço de ' +
            item.domainName,
        );
      if (
        result.quote.priceMinor !== item.unitPriceMinor.toString() ||
        result.quote.currency !== item.currency ||
        result.registrarCode !== item.registrarCode ||
        result.isPremium !== item.isPremium
      )
        throw new ConflictException(
          'Preço alterado. Atualize o carrinho e confirme novamente.',
        );
      if (new Date(result.quote.expiresAt) <= new Date())
        throw new ConflictException('Cotação expirada');
      if (
        result.isPremium &&
        (!body.acceptPremium ||
          (item.priceSnapshot as Record<string, unknown>).premiumAccepted !==
            true)
      )
        throw new ConflictException('Confirme explicitamente as taxas premium');
      snapshots.set(item.id, snap);
    }
    const id = await this.db.$transaction(async (tx) => {
      await lock(tx, userId);
      await lock(tx, cart.id);
      await lock(tx, 'checkout:' + userId + ':' + body.idempotencyKey);
      const repeat = await tx.order.findUnique({
        where: {
          customerId_idempotencyKey: {
            customerId: userId,
            idempotencyKey: body.idempotencyKey,
          },
        },
      });
      if (repeat) {
        if (repeat.requestHash !== hash)
          throw new CommerceError('IDEMPOTENCY_CONFLICT');
        return repeat.id;
      }
      await this.access.organization(
        userId,
        body.organizationId,
        'orders.manage',
        tx,
      );
      const current = await tx.cart.findUniqueOrThrow({
        where: { id: cart.id },
        include: { items: true },
      });
      if (
        current.status !== 'OPEN' ||
        current.expiresAt <= new Date() ||
        digest(JSON.stringify(serializeCart(current.items))) !==
          digest(JSON.stringify(serializeCart(cart.items)))
      )
        throw new ConflictException('Carrinho alterado durante a confirmação');
      if (
        !(await tx.domainContact.findFirst({
          where: { id: body.contactId, organizationId: body.organizationId },
        }))
      )
        throw new ConflictException('Contacto inválido');
      if (
        current.items.some((i) => i.quoteExpiresAt <= new Date()) ||
        [...snapshots.values()].some(
          (s) => new Date(String(s.expiresAt)) <= new Date(),
        )
      )
        throw new ConflictException('Cotação expirada durante a confirmação');
      const subtotal = cart.items.reduce((n, i) => n + i.unitPriceMinor, 0n),
        tax =
          (subtotal * BigInt(this.runtime.env.BILLING_TAX_BASIS_POINTS) +
            9999n) /
          10000n;
      if (subtotal + tax > 999999999999999n)
        throw new ConflictException(
          'Total da encomenda excede o limite suportado',
        );
      const order = await tx.order.create({
        data: {
          orderNumber:
            'DT-' +
            new Date().getUTCFullYear() +
            '-' +
            randomToken().slice(0, 16).toUpperCase(),
          organizationId: body.organizationId,
          customerId: userId,
          idempotencyKey: body.idempotencyKey,
          requestHash: hash,
          environment:
            this.runtime.env.DOMAIN_REGISTRATION_MODE === 'sandbox'
              ? 'SANDBOX'
              : 'MOCK',
          subtotalMinor: subtotal,
          taxMinor: tax,
          totalMinor: subtotal + tax,
          currency: 'CVE',
          billingSnapshot: body.billing,
          termsVersion: body.termsVersion,
          termsAcceptedAt: new Date(),
          expiresAt: new Date(Date.now() + 30 * 60000),
        },
      });
      await tx.billingProfile.upsert({
        where: { organizationId: body.organizationId },
        create: { ...body.billing, organizationId: body.organizationId },
        update: body.billing,
      });
      for (const item of cart.items) {
        const snap = snapshots.get(item.id)!,
          registrar = await tx.registrar.findUniqueOrThrow({
            where: { code: item.registrarCode },
          });
        const line = await tx.orderItem.create({
          data: {
            orderId: order.id,
            tldId: item.tldId,
            domainContactId: body.contactId,
            domainName: item.domainName,
            registrationYears: item.registrationYears,
            supplierCostMinor: BigInt(String(snap.supplierCostMinor)),
            supplierCurrency: String(snap.supplierCurrency),
            salePriceMinor: item.unitPriceMinor,
            currency: item.currency,
            quoteSnapshot: snap as Prisma.InputJsonObject,
            nameservers: body.nameservers,
            isPremium: item.isPremium,
            premiumAccepted: body.acceptPremium,
          },
        });
        await tx.domainRegistration.create({
          data: {
            orderItemId: line.id,
            registrarId: registrar.id,
            idempotencyKey: 'devtrust-' + line.id,
          },
        });
      }
      await tx.orderTransition.create({
        data: {
          orderId: order.id,
          fromStatus: 'DRAFT',
          toStatus: 'PENDING_PAYMENT',
          reason: 'CHECKOUT_CONFIRMED',
          actorUserId: userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: userId,
          organizationId: body.organizationId,
          action: 'checkout.created',
          resourceType: 'Order',
          resourceId: order.id,
          metadata: {
            environment: order.environment,
            totalMinor: order.totalMinor.toString(),
            currency: order.currency,
          },
        },
      });
      await notify(
        tx,
        userId,
        'ORDER_CREATED',
        'Encomenda criada (' + order.environment + ')',
      );
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return order.id;
    });
    return orderView(await this.access.order(userId, id));
  }
}
function serializeCart(items: unknown) {
  return JSON.parse(
    JSON.stringify(items, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}
