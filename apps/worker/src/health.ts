import Redis from 'ioredis';
import { PrismaClient } from '@devtrust/database';
async function main() {
  const redis = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: 1 }),
    db = new PrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    if (!(await redis.get('worker:heartbeat')))
      throw new Error('Missing worker heartbeat');
  } finally {
    await redis.quit();
    await db.$disconnect();
  }
}
main().catch(() => {
  process.exitCode = 1;
});
