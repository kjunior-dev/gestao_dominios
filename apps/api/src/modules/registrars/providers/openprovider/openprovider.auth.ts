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
import { z } from 'zod/v3';
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
        e.OPENPROVIDER_BASE_URL +
          e.OPENPROVIDER_USERNAME +
          e.OPENPROVIDER_PASSWORD,
      )
    );
  }
  async invalidate(token: string) {
    const raw = await this.runtime.redis.get(this.key);
    if (
      raw &&
      decrypt(raw, this.runtime.env.TOTP_ENCRYPTION_KEY, 'registrar') === token
    )
      await this.runtime.redis.eval(
        "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0",
        1,
        this.key,
        raw,
      );
  }
  async token(): Promise<string> {
    if (!this.runtime.env.OPENPROVIDER_ENABLED)
      throw new RegistrarError('PROVIDER_DISABLED');
    const key = this.key,
      lock = key + ':lock',
      owner = randomToken();
    for (let n = 0; n < 350; n++) {
      const cached = await this.runtime.redis.get(key);
      if (cached)
        return decrypt(
          cached,
          this.runtime.env.TOTP_ENCRYPTION_KEY,
          'registrar',
        );
      if (await this.runtime.redis.set(lock, owner, 'PX', 100000, 'NX')) {
        try {
          const e = this.runtime.env;
          const data = z.object({ token: z.string().min(1).max(10000) }).parse(
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
