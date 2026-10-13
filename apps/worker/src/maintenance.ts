import type { PrismaClient } from '@devtrust/database';
export async function pruneCommerce(
  db: PrismaClient,
  retentionDays: number,
  now = new Date(),
) {
  const searches = await db.domainSearchLog.deleteMany({
    where: {
      createdAt: { lt: new Date(now.getTime() - retentionDays * 86400000) },
    },
  });
  const carts = await db.cart.deleteMany({ where: { expiresAt: { lt: now } } });
  return { searches: searches.count, carts: carts.count };
}
