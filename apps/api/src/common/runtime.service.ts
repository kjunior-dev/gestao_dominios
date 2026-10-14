import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';
import { Queue } from 'bullmq';
import pino from 'pino';
import { environment } from '../config/environment';
@Injectable()
export class RuntimeService implements OnModuleDestroy, OnModuleInit {
  readonly env = environment();
  readonly logger = pino({
    redact: [
      'username',
      'OPENPROVIDER_USERNAME',
      'OPENPROVIDER_PASSWORD',
      '*.password',
      '*.token',
      '*.secret',
      'password',
      'token',
      'secret',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
  });
  readonly redis = new Redis(this.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  readonly notifications = new Queue('notifications', {
    connection: { url: this.env.REDIS_URL },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 1000,
    },
  });
  constructor() {
    this.notifications.on('error', () =>
      this.logger.error({ event: 'queue.connection.error' }),
    );
    this.redis.on('error', () =>
      this.logger.error({ event: 'redis.connection.error' }),
    );
  }
  async onModuleInit() {
    await this.redis.ping();
    this.logger.info({
      event: 'registrar.configuration',
      provider: 'openprovider',
      enabled: this.env.OPENPROVIDER_ENABLED,
      baseUrl: this.env.OPENPROVIDER_BASE_URL,
      usernamePresent: Boolean(this.env.OPENPROVIDER_USERNAME),
      passwordPresent: Boolean(this.env.OPENPROVIDER_PASSWORD),
    });
  }
  async onModuleDestroy() {
    await this.notifications.close();
    await this.redis.quit();
  }
}
