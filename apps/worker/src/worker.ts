import Redis from 'ioredis';
import { Worker } from 'bullmq';
import type { PrismaClient } from '@devtrust/database';
import type { NotificationJob } from '@devtrust/contracts';
import type { Logger } from 'pino';
import { processNotification } from './processor';
export function createNotificationWorker({
  url,
  db,
  key,
  mailbox,
  logger,
  name = 'notifications',
}: {
  url: string;
  db: PrismaClient;
  key: string;
  mailbox: string;
  logger: Logger;
  name?: string;
}) {
  const delivery = new Redis(url, { maxRetriesPerRequest: 1 });
  delivery.on('error', () =>
    logger.error({ event: 'delivery.connection.error' }),
  );
  const worker = new Worker<NotificationJob>(
    name,
    (job) => processNotification(job.data, db, key, mailbox, delivery),
    { connection: { url }, concurrency: 4 },
  );
  worker.on('completed', (job) =>
    logger.info({
      event: 'notification.processed',
      jobId: job.id,
      transport: 'development',
    }),
  );
  worker.on('failed', (job) => {
    logger.error({
      event: 'notification.failed',
      jobId: job?.id,
      attempt: job?.attemptsMade,
    });
    if (job && job.attemptsMade >= (job.opts.attempts || 1))
      void db.notification
        .updateMany({
          where: { id: job.data.notificationId, status: { not: 'SENT' } },
          data: { status: 'FAILED' },
        })
        .catch(() =>
          logger.error({ event: 'notification.failure_record_failed' }),
        );
  });
  worker.on('error', () => logger.error({ event: 'worker.error' }));
  worker.on('closed', () => delivery.disconnect());
  return worker;
}
