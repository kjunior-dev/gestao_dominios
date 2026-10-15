import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { z } from 'zod/v3';
import { refundSchema, refundDecisionSchema } from '@devtrust/contracts';
import { lock, transition, outbox, notify } from '@devtrust/commerce';
import { DatabaseService } from '../../common/database.service';
import {
  CommerceAccessService,
  serialize,
} from '../checkout/commerce-access.service';
@Injectable()
export class RefundsService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  async get(userId: string, id: string) {
    const r = await this.db.refund.findUnique({
      where: { id },
      include: { payment: true },
    });
    if (!r) throw new NotFoundException('Reembolso não encontrado');
    await this.access.order(userId, r.payment.orderId);
    return serialize({ ...r, payment: undefined });
  }
  async request(userId: string, body: z.infer<typeof refundSchema>) {
    const p = await this.db.payment.findUnique({
      where: { id: body.paymentId },
    });
    if (!p) throw new NotFoundException('Pagamento não encontrado');
    await this.access.order(userId, p.orderId);
    return serialize(
      await this.db.$transaction(async (tx) => {
        await lock(tx, 'order:' + p.orderId);
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: p.id },
          include: { order: { include: { items: true } } },
        });
        await this.access.organization(
          userId,
          current.order.organizationId,
          'orders.manage',
          tx,
        );
        const existing = await tx.refund.findUnique({
          where: {
            paymentId_idempotencyKey: {
              paymentId: p.id,
              idempotencyKey: body.idempotencyKey,
            },
          },
        });
        if (existing) {
          if (
            existing.amountMinor.toString() !== body.amountMinor ||
            existing.reason !== body.reason
          )
            throw new ConflictException('Chave de idempotência já utilizada');
          return existing;
        }
        if (
          !current.paidAt ||
          !['PAID', 'PARTIALLY_REFUNDED'].includes(current.status)
        )
          throw new ConflictException('Pagamento confirmado necessário');
        const reserved = await tx.refund.aggregate({
          where: { paymentId: p.id, status: { not: 'REJECTED' } },
          _sum: { amountMinor: true },
        });
        if (
          (reserved._sum.amountMinor || 0n) + BigInt(body.amountMinor) >
          current.amountMinor
        )
          throw new ConflictException('Montante excede o saldo reembolsável');
        const refund = await tx.refund.create({
          data: {
            paymentId: p.id,
            idempotencyKey: body.idempotencyKey,
            amountMinor: BigInt(body.amountMinor),
            currency: p.currency,
            reason: body.reason,
            requestedBy: userId,
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: userId,
            organizationId: current.order.organizationId,
            action: 'refund.requested',
            resourceType: 'Refund',
            resourceId: refund.id,
            metadata: { amountMinor: body.amountMinor, currency: p.currency },
          },
        });
        await notify(
          tx,
          current.order.customerId,
          'REFUND_REQUESTED',
          'Pedido de reembolso recebido',
        );
        return refund;
      }),
    );
  }
  async decide(
    actorId: string,
    id: string,
    body: z.infer<typeof refundDecisionSchema>,
  ) {
    return serialize(
      await this.db.$transaction(async (tx) => {
        const initial = await tx.refund.findUniqueOrThrow({
          where: { id },
          include: {
            payment: {
              include: {
                order: {
                  include: { items: { include: { registration: true } } },
                },
              },
            },
          },
        });
        await lock(tx, 'order:' + initial.payment.orderId);
        const r = await tx.refund.findUniqueOrThrow({
          where: { id },
          include: {
            payment: {
              include: {
                order: {
                  include: { items: { include: { registration: true } } },
                },
              },
            },
          },
        });
        if (r.requestedBy === actorId)
          throw new ForbiddenException('A aprovação exige outro operador');
        if (r.status !== 'REQUESTED')
          throw new ConflictException('Pedido já decidido');
        if (
          body.decision === 'APPROVE' &&
          r.payment.order.items.some(
            (i) =>
              ['COMPLETED', 'SUBMITTED', 'PENDING', 'UNKNOWN'].includes(
                i.status,
              ) ||
              Boolean(
                i.registration &&
                i.registration.attemptCount > 0 &&
                i.registration.status !== 'FAILED',
              ),
          )
        )
          throw new ConflictException(
            'Registo concluído ou incerto: confirme condições comerciais antes de reembolsar',
          );
        const approved = body.decision === 'APPROVE';
        const result = await tx.refund.update({
          where: { id },
          data: {
            status: approved ? 'APPROVED' : 'REJECTED',
            approvedBy: actorId,
            approvedAt: new Date(),
          },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: actorId,
            organizationId: r.payment.order.organizationId,
            action: approved ? 'refund.approved' : 'refund.rejected',
            resourceType: 'Refund',
            resourceId: id,
            metadata: { reason: body.reason },
          },
        });
        if (approved) {
          await transition(
            tx,
            r.payment.orderId,
            'REFUND_PENDING',
            'REFUND_APPROVED',
            actorId,
          );
          await outbox(tx, 'refund-processing', 'refund-' + id, {
            refundId: id,
          });
        }
        return result;
      }),
    );
  }
}
