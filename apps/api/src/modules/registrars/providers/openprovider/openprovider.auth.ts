import { Inject, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeService } from '../../../../common/runtime.service';
import {
  digest,
  encrypt,
  decrypt,
  randomToken,
} from '../../../../common/crypto';
import { RegistrarError } from '../../domain/registrar.types';
import { OpenproviderClient } from './openprovider.client';
import { loginDataSchema } from './openprovider.types';
@Injectable()
export class OpenproviderAuth {
  constructor(
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(OpenproviderClient) private client: OpenproviderClient,
  ) {}
  private get key() {
    const e = this.runtime.env;
    return (
      'op:auth:' +
      digest(
        JSON.stringify([
          e.OPENPROVIDER_BASE_URL,
          e.OPENPROVIDER_USERNAME,
          e.OPENPROVIDER_PASSWORD,
          digest(e.TOTP_ENCRYPTION_KEY),
        ]),
      )
    );
  }
  private async cached(): Promise<string | null> {
    const raw = await this.runtime.redis.get(this.key);
    if (!raw) return null;
    try {
      return loginDataSchema.parse({
        token: decrypt(raw, this.runtime.env.TOTP_ENCRYPTION_KEY, 'registrar'),
      }).token;
    } catch {
      await this.remove(raw);
      this.runtime.logger.warn({
        event: 'registrar.token_cache',
        status: 'corrupt',
        provider: 'openprovider',
      });
      return null;
    }
  }
  private async remove(raw: string) {
    return this.runtime.redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0",
      1,
      this.key,
      raw,
    );
  }
  async cacheStatus() {
    return {
      present: Boolean(await this.runtime.redis.exists(this.key)),
      ttlSeconds: await this.runtime.redis.ttl(this.key),
      lockPresent: Boolean(await this.runtime.redis.exists(this.key + ':lock')),
    };
  }
  async invalidate(token: string) {
    const raw = await this.runtime.redis.get(this.key);
    if (!raw) return;
    let matches = false;
    try {
      matches =
        decrypt(raw, this.runtime.env.TOTP_ENCRYPTION_KEY, 'registrar') ===
        token;
    } catch {
      matches = true;
    }
    if (matches) {
      const removed = await this.remove(raw);
      this.runtime.logger.info({
        event: 'registrar.token_cache',
        status: removed ? 'invalidated' : 'replaced',
        provider: 'openprovider',
      });
    }
  }
  async token(): Promise<string> {
    if (!this.runtime.env.OPENPROVIDER_ENABLED)
      throw new RegistrarError('PROVIDER_DISABLED');
    const key = this.key,
      lock = key + ':lock',
      owner = randomToken();
    for (let n = 0; n < 350; n++) {
      const cached = await this.cached();
      if (cached) {
        this.runtime.logger.info({
          event: 'registrar.token_cache',
          status: 'hit',
          provider: 'openprovider',
        });
        return cached;
      }
      if (await this.runtime.redis.set(lock, owner, 'PX', 100000, 'NX')) {
        try {
          const existing = await this.cached();
          if (existing) return existing;
          this.runtime.logger.info({
            event: 'registrar.token_cache',
            status: 'miss',
            provider: 'openprovider',
          });
          const e = this.runtime.env;
          const data = loginDataSchema.parse(
            await this.client.send('/auth/login', 'POST', {
              username: e.OPENPROVIDER_USERNAME,
              password: e.OPENPROVIDER_PASSWORD,
            }),
          );
          await this.runtime.redis.set(
            key,
            encrypt(data.token, e.TOTP_ENCRYPTION_KEY, 'registrar'),
            'EX',
            e.OPENPROVIDER_TOKEN_TTL_SECONDS,
          );
          this.runtime.logger.info({
            event: 'registrar.token_cache',
            status: 'stored',
            ttlSeconds: e.OPENPROVIDER_TOKEN_TTL_SECONDS,
            provider: 'openprovider',
          });
          return data.token;
        } catch (error) {
          if (error instanceof RegistrarError) throw error;
          throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
        } finally {
          await this.runtime.redis.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0",
            1,
            lock,
            owner,
          );
        }
      }
      await delay(100);
    }
    throw new RegistrarError('PROVIDER_BUSY');
  }
}
