import {
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database.service';
import { organizationPermissions, Permission } from '@devtrust/contracts';
import type { Prisma } from '@devtrust/database';
@Injectable()
export class CommerceAccessService {
  constructor(@Inject(DatabaseService) readonly db: DatabaseService) {}
  async organization(
    userId: string,
    organizationId: string,
    permission: Permission,
    tx: Prisma.TransactionClient = this.db,
  ) {
    const member = await tx.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: { organization: true },
    });
    if (
      !member ||
      member.organization.status !== 'ACTIVE' ||
      !organizationPermissions[member.role].includes(permission)
    )
      throw new ForbiddenException('Sem permissão nesta organização');
    return member;
  }
  async order(userId: string, id: string) {
    const order = await this.db.order.findFirst({
      where: { id, customerId: userId },
      include: {
        items: true,
        payments: { include: { refunds: true } },
        transitions: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Encomenda não encontrada');
    await this.organization(userId, order.organizationId, 'orders.read');
    return order;
  }
}
export const serialize = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
export function orderView(
  order: Awaited<ReturnType<CommerceAccessService['order']>>,
) {
  return serialize({
    ...order,
    billingSnapshot: undefined,
    requestHash: undefined,
    idempotencyKey: undefined,
    items: order.items.map((i) => ({
      id: i.id,
      domainName: i.domainName,
      registrationYears: i.registrationYears,
      salePriceMinor: i.salePriceMinor,
      currency: i.currency,
      status: i.status,
      isPremium: i.isPremium,
    })),
    payments: order.payments.map((p) => ({
      id: p.id,
      status: p.status,
      amountMinor: p.amountMinor,
      currency: p.currency,
      provider: p.provider,
      environment: p.environment,
      paidAt: p.paidAt,
      refunds: p.refunds.map((r) => ({
        id: r.id,
        status: r.status,
        amountMinor: r.amountMinor,
        currency: r.currency,
        reason: r.reason,
        createdAt: r.createdAt,
      })),
    })),
  });
}
