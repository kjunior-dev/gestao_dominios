import type { OrderStatus, Prisma } from '@devtrust/database';
import { CommerceError } from './config';
export const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: [
    'PAYMENT_PROCESSING',
    'PAID',
    'FAILED',
    'CANCELLED',
    'MANUAL_REVIEW',
  ],
  PAYMENT_PROCESSING: ['PAID', 'FAILED', 'CANCELLED', 'MANUAL_REVIEW'],
  PAID: ['PROVISIONING', 'REFUND_PENDING', 'MANUAL_REVIEW'],
  PROVISIONING: [
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'FAILED',
    'MANUAL_REVIEW',
    'REFUND_PENDING',
  ],
  COMPLETED: ['REFUND_PENDING'],
  PARTIALLY_COMPLETED: [
    'COMPLETED',
    'PROVISIONING',
    'MANUAL_REVIEW',
    'REFUND_PENDING',
  ],
  FAILED: ['REFUND_PENDING', 'MANUAL_REVIEW'],
  CANCELLED: ['MANUAL_REVIEW'],
  REFUND_PENDING: ['REFUNDED', 'PARTIALLY_COMPLETED', 'MANUAL_REVIEW'],
  REFUNDED: [],
  MANUAL_REVIEW: [
    'PROVISIONING',
    'COMPLETED',
    'PARTIALLY_COMPLETED',
    'REFUND_PENDING',
    'REFUNDED',
  ],
};
export async function lock(tx: Prisma.TransactionClient, key: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
}
export async function transition(
  tx: Prisma.TransactionClient,
  id: string,
  to: OrderStatus,
  reason: string,
  actorUserId?: string,
) {
  await lock(tx, 'order:' + id);
  const order = await tx.order.findUniqueOrThrow({ where: { id } });
  if (order.status === to) return order;
  if (!transitions[order.status].includes(to))
    throw new CommerceError('INVALID_ORDER_TRANSITION');
  const changed = await tx.order.update({
    where: { id },
    data: { status: to },
  });
  await tx.orderTransition.create({
    data: {
      orderId: id,
      fromStatus: order.status,
      toStatus: to,
      reason,
      actorUserId,
    },
  });
  await tx.auditLog.create({
    data: {
      actorUserId,
      organizationId: order.organizationId,
      action: 'order.transition',
      resourceType: 'Order',
      resourceId: id,
      metadata: { from: order.status, to, reason },
    },
  });
  return changed;
}
export async function outbox(
  tx: Prisma.TransactionClient,
  topic: string,
  key: string,
  payload: Prisma.InputJsonObject,
) {
  return tx.commerceOutbox.upsert({
    where: { deduplicationKey: key },
    create: { topic, deduplicationKey: key, payload },
    update: {},
  });
}
export async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  type: string,
  subject: string,
) {
  const n = await tx.notification.create({ data: { userId, type, subject } });
  await outbox(tx, 'email-notifications', 'notification-' + n.id, {
    notificationId: n.id,
  });
}
