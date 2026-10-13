import { Inject, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeService } from '../../../../common/runtime.service';
import { digest } from '../../../../common/crypto';
import { RegistrarError } from '../../domain/registrar.types';
import { envelopeSchema, parseExactJson } from './openprovider.types';
@Injectable()
export class OpenproviderClient {
  constructor(@Inject(RuntimeService) private runtime: RuntimeService) {}
  async send(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    token?: string,
  ): Promise<unknown> {
    const e = this.runtime.env;
    if (!e.OPENPROVIDER_ENABLED) throw new RegistrarError('PROVIDER_DISABLED');
    if (
      !/^\/(auth\/login|domains\/(check|prices)|tlds(?:\/[a-z0-9.-]+)?)(?:\?|$)/.test(
        path,
      )
    )
      throw new RegistrarError('CAPABILITY_UNSUPPORTED');
    const scope = digest(e.OPENPROVIDER_BASE_URL + e.OPENPROVIDER_USERNAME);
    if (await this.runtime.redis.exists('op:cooldown:' + scope))
      throw new RegistrarError('PROVIDER_RATE_LIMIT');
    for (let attempt = 0; attempt < 3; attempt++) {
      const count = Number(
        await this.runtime.redis.eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n",
          1,
          'op:rate:' + scope,
        ),
      );
      if (count > e.OPENPROVIDER_REQUESTS_PER_MINUTE)
        throw new RegistrarError('PROVIDER_RATE_LIMIT');
      const started = Date.now();
      try {
        const response = await fetch(e.OPENPROVIDER_BASE_URL + path, {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(e.OPENPROVIDER_TIMEOUT_MS),
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        if (response.status === 401 || response.status === 403)
          throw new RegistrarError('PROVIDER_AUTH');
        if (response.status === 429) {
          const retry = response.headers.get('retry-after');
          const seconds =
            retry && /^\d+$/.test(retry)
              ? Math.min(1200, Math.max(1, Number(retry)))
              : 60;
          await this.runtime.redis.set(
            'op:cooldown:' + scope,
            '1',
            'EX',
            seconds,
          );
          throw new RegistrarError('PROVIDER_RATE_LIMIT');
        }
        const raw = await response.text();
        if (raw.length > 2000000)
          throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
        let envelope;
        try {
          envelope = envelopeSchema.parse(parseExactJson(raw));
        } catch {
          if (response.status >= 500)
            throw new RegistrarError('PROVIDER_UNAVAILABLE', true);
          throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
        }
        if ([190, 196, 900, 901, 902].includes(envelope.code))
          throw new RegistrarError('PROVIDER_AUTH');
        if (envelope.code === 911 || envelope.code === 349)
          throw new RegistrarError('CAPABILITY_UNSUPPORTED');
        if (envelope.maintenance)
          throw new RegistrarError('PROVIDER_UNAVAILABLE', true);
        if (envelope.code === 196) throw new RegistrarError('PROVIDER_AUTH');
        if (envelope.code === 50 || envelope.code === 4007) {
          await this.runtime.redis.set('op:cooldown:' + scope, '1', 'EX', 300);
          throw new RegistrarError('PROVIDER_RATE_LIMIT');
        }
        if (
          response.status >= 500 ||
          envelope.code === 4004 ||
          envelope.code === 4005
        )
          throw new RegistrarError('PROVIDER_UNAVAILABLE', true);
        if (!response.ok) throw new RegistrarError('PROVIDER_REJECTED');
        if (envelope.code !== 0)
          throw new RegistrarError(
            path === '/auth/login' ? 'PROVIDER_AUTH' : 'PROVIDER_REJECTED',
          );
        this.runtime.logger.info({
          event: 'registrar.request',
          provider: 'openprovider',
          operation: path.split('?')[0],
          durationMs: Date.now() - started,
        });
        return envelope.data;
      } catch (error) {
        const failure =
          error instanceof RegistrarError
            ? error
            : new RegistrarError(
                error instanceof Error && error.name === 'TimeoutError'
                  ? 'PROVIDER_TIMEOUT'
                  : 'PROVIDER_UNAVAILABLE',
                true,
              );
        this.runtime.logger.warn({
          event: 'registrar.error',
          provider: 'openprovider',
          code: failure.code,
          durationMs: Date.now() - started,
        });
        if (!failure.transient || attempt === 2) throw failure;
        await delay(100 * 2 ** attempt);
      }
    }
    throw new RegistrarError('PROVIDER_UNAVAILABLE');
  }
}
