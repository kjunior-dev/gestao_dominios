import { test as base, expect } from '@playwright/test';
import Redis from '../../apps/api/node_modules/ioredis';

// Each browser scenario has an independent request budget, just like integration tests.
// Only the isolated test Redis database may be touched; application limits stay unchanged.
export const test = base.extend<{ requestBudget: void }>({
  requestBudget: [
    async ({ baseURL }, use) => {
      const url = new URL(process.env.REDIS_URL || 'redis://invalid');
      if (
        process.env.NODE_ENV !== 'test' ||
        url.pathname !== '/1' ||
        !new URL(
          process.env.DATABASE_URL || 'postgresql://invalid',
        ).pathname.endsWith('_test') ||
        !baseURL ||
        !['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname)
      )
        throw new Error(
          'E2E request isolation requires the local test environment',
        );
      const redis = new Redis(url.toString(), { maxRetriesPerRequest: 1 });
      try {
        for (const pattern of ['rate:*', 'domain:rate:*']) {
          const keys = await redis.keys(pattern);
          if (keys.length) await redis.del(...keys);
        }
      } finally {
        await redis.quit();
      }
      await use();
    },
    { auto: true },
  ],
});
export { expect };
