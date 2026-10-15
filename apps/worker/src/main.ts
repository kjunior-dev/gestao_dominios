import {
  commerceEnvironmentSchema,
  CommerceProcessor,
  MockPaymentProvider,
  MockRegistrationProvider,
  OpenproviderRegistrationProvider,
  createCommerceQueues,
  createCommerceWorkers,
  publishOutbox,
  outbox,
} from '@devtrust/commerce';
import { OpenproviderAuth, OpenproviderClient } from '@devtrust/registrars';
import { createHash } from 'node:crypto';
import { processNotification } from './processor';
import { pruneCommerce } from './maintenance';
import 'dotenv/config';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaClient } from '@devtrust/database';
import { z } from 'zod/v3';
import pino from 'pino';
import { createNotificationWorker } from './worker';
const env = commerceEnvironmentSchema
  .extend({
    DOMAIN_LOG_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .min(1)
      .max(90)
      .default(30),
    OPENPROVIDER_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    OPENPROVIDER_BASE_URL: z
      .enum([
        'https://api.openprovider.eu/v1',
        'https://api.sandbox.openprovider.nl/v1beta',
      ])
      .default('https://api.openprovider.eu/v1'),
    OPENPROVIDER_USERNAME: z.string().optional(),
    OPENPROVIDER_PASSWORD: z.string().optional(),
    OPENPROVIDER_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(30000)
      .default(10000),
    OPENPROVIDER_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(60)
      .max(86400)
      .default(3600),
    OPENPROVIDER_REQUESTS_PER_MINUTE: z.coerce
      .number()
      .int()
      .min(1)
      .max(600)
      .default(60),
    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),
    TOTP_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/),
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    DEV_MAILBOX_DIR: z.string().default('.local/mailbox'),
  })
  .parse(process.env);
if (env.NODE_ENV === 'production')
  throw new Error(
    'Development notification transport is disabled in production. Configure a production transactional transport before deployment.',
  );
const logger = pino(),
  db = new PrismaClient(),
  connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
connection.on('error', () => logger.error({ event: 'redis.connection.error' }));
const queue = new Queue('notifications', {
  connection: { url: env.REDIS_URL },
});
const worker = createNotificationWorker({
  url: env.REDIS_URL,
  db,
  key: env.TOTP_ENCRYPTION_KEY,
  mailbox: env.DEV_MAILBOX_DIR,
  logger,
});
const config = {
  ...env,
  MOCK_WEBHOOK_SECRET:
    env.MOCK_WEBHOOK_SECRET ||
    createHash('sha256')
      .update('mock-webhook:' + env.TOTP_ENCRYPTION_KEY)
      .digest('hex'),
};
const registrarRuntime = { env, redis: connection, logger };
const client = new OpenproviderClient(registrarRuntime),
  auth = new OpenproviderAuth(registrarRuntime, client);
const registration =
  env.DOMAIN_REGISTRATION_MODE === 'sandbox' ||
  env.DOMAIN_REGISTRATION_MODE === 'live'
    ? new OpenproviderRegistrationProvider(config, auth, client)
    : new MockRegistrationProvider(config);
const commerce = new CommerceProcessor(
  db,
  connection,
  config,
  new MockPaymentProvider(config, db),
  registration,
  logger,
);
const commerceQueues = createCommerceQueues(env.REDIS_URL);
const commerceWorkers = createCommerceWorkers(env.REDIS_URL, commerce, (id) =>
  processNotification(
    { notificationId: id },
    db,
    env.TOTP_ENCRYPTION_KEY,
    env.DEV_MAILBOX_DIR,
    connection,
  ),
);
let publishing = false;
const outboxTimer = setInterval(() => {
  if (publishing) return;
  publishing = true;
  void publishOutbox(db, commerceQueues)
    .catch(() => logger.error({ event: 'commerce.outbox_failed' }))
    .finally(() => {
      publishing = false;
    });
}, 1000);
const reconciliationTimer = setInterval(
  () =>
    void db
      .$transaction(async (tx) => {
        const regs = await tx.domainRegistration.findMany({
          where: {
            status: { in: ['SUBMITTED', 'UNKNOWN', 'PENDING'] },
            requestedAt: { lt: new Date(Date.now() - 180000) },
          },
          take: 100,
        });
        for (const reg of regs)
          await outbox(
            tx,
            'domain-reconciliation',
            'poll-' + reg.id + '-' + Math.floor(Date.now() / 60000),
            { registrationId: reg.id },
          );
        const payments = await tx.payment.findMany({
          where: { status: { in: ['PROCESSING', 'UNKNOWN'] } },
          take: 100,
        });
        for (const payment of payments)
          await outbox(
            tx,
            'payment-reconciliation',
            'poll-payment-' + payment.id + '-' + Math.floor(Date.now() / 60000),
            { paymentId: payment.id },
          );
      })
      .catch(() => logger.error({ event: 'commerce.reconciliation_failed' })),
  60000,
);
async function tick() {
  await connection.set('worker:heartbeat', new Date().toISOString(), 'EX', 30);
  const pending = await db.notification.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: new Date(Date.now() - 5000) },
    },
    take: 100,
  });
  for (const n of pending)
    await queue.add(
      'deliver',
      { notificationId: n.id },
      {
        jobId: n.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
}
const maintain = () =>
  pruneCommerce(db, env.DOMAIN_LOG_RETENTION_DAYS).catch(() =>
    logger.error({ event: 'commerce.retention_failed' }),
  );
const maintenanceTimer = setInterval(() => void maintain(), 3600000);
void maintain();
const timer = setInterval(
  () =>
    void tick().catch(() => logger.error({ event: 'worker.health_failed' })),
  10000,
);
void tick().catch(() => logger.error({ event: 'worker.health_failed' }));
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  clearInterval(outboxTimer);
  clearInterval(reconciliationTimer);
  await Promise.all(commerceWorkers.map((w) => w.close()));
  await Promise.all([...commerceQueues.values()].map((q) => q.close()));
  clearInterval(maintenanceTimer);
  await worker.close();
  await queue.close();
  await connection.del('worker:heartbeat');
  await connection.quit();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
