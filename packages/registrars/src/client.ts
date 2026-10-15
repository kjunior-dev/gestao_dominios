import type { RegistrarRuntime } from './runtime';
import { setTimeout as delay } from 'node:timers/promises';
import { digest } from './crypto';
import { RegistrarError, RegistrarDiagnostic } from './types';
import {
  envelopeSchema,
  parseExactJson,
  classifyOpenproviderFailure,
} from './wire';

export class OpenproviderClient {
  constructor(private runtime: RegistrarRuntime) {}

  async send(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
    token?: string,
    write?: { environment: 'SANDBOX' | 'LIVE'; approved: boolean },
  ): Promise<unknown> {
    const e = this.runtime.env;
    if (!e.OPENPROVIDER_ENABLED) throw new RegistrarError('PROVIDER_DISABLED');
    const resource = path.split('?')[0];
    const mutation =
      method === 'POST' && ['/customers', '/domains'].includes(resource);
    if (
      !mutation &&
      ((method === 'POST' &&
        !['/auth/login', '/domains/check'].includes(resource)) ||
        (method === 'GET' &&
          ['/auth/login', '/domains/check'].includes(resource)))
    )
      throw new RegistrarError('CAPABILITY_UNSUPPORTED');
    if (mutation) {
      const sandbox =
        e.DOMAIN_REGISTRATION_MODE === 'sandbox' &&
        e.OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED === true &&
        e.OPENPROVIDER_BASE_URL ===
          'https://api.sandbox.openprovider.nl/v1beta' &&
        write?.environment === 'SANDBOX';
      const live =
        e.DOMAIN_REGISTRATION_MODE === 'live' &&
        e.LIVE_TRANSACTIONS_ENABLED === true &&
        write?.environment === 'LIVE' &&
        write.approved;
      if (!sandbox && !live) throw new RegistrarError('REGISTRATION_DISABLED');
    } else if (
      !/^\/(auth\/login|domains(?:\/(check|prices|[0-9]+))?|tlds(?:\/[a-z0-9.-]+)?)(?:\?|$)/.test(
        path,
      ) ||
      (resource === '/domains' && method !== 'GET')
    )
      throw new RegistrarError('CAPABILITY_UNSUPPORTED');
    const attempts = mutation ? 1 : 3;
    const operation = path
      .split('?')[0]
      .replace(/^\/tlds\/.+$/, '/tlds/:extension')
      .replace(/^\/domains\/[0-9]+$/, '/domains/:id');
    const login = operation === '/auth/login',
      scope = digest(
        JSON.stringify([e.OPENPROVIDER_BASE_URL, e.OPENPROVIDER_USERNAME]),
      );
    if (await this.runtime.redis.exists('op:cooldown:' + scope))
      throw new RegistrarError('PROVIDER_RATE_LIMIT');
    for (let attempt = 0; attempt < attempts; attempt++) {
      const count = Number(
        await this.runtime.redis.eval(
          "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n",
          1,
          'op:rate:' + scope,
        ),
      );
      if (count > e.OPENPROVIDER_REQUESTS_PER_MINUTE)
        throw new RegistrarError('PROVIDER_RATE_LIMIT');
      if (login) {
        const logins = Number(
          await this.runtime.redis.eval(
            "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n",
            1,
            'op:login-rate:' + scope,
          ),
        );
        if (logins > 30) throw new RegistrarError('PROVIDER_RATE_LIMIT');
      }
      const started = Date.now();
      let diagnostic: RegistrarDiagnostic = { operation };
      try {
        const response = await fetch(e.OPENPROVIDER_BASE_URL + path, {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(e.OPENPROVIDER_TIMEOUT_MS),
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: 'Bearer ' + token } : {}),
          },
          ...(body
            ? {
                body: JSON.stringify(body).replace(
                  /"accept_premium_fee":"(\d{1,15}\.\d{2})"/g,
                  '"accept_premium_fee":$1',
                ),
              }
            : {}),
        });
        diagnostic = { operation, httpStatus: response.status };
        const raw = await response.text();
        if (raw.length > 2000000)
          throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
            ...diagnostic,
            category: 'response',
          });
        let envelope;
        try {
          envelope = envelopeSchema.safeParse(parseExactJson(raw));
        } catch {
          envelope = null;
        }
        const parsed = envelope?.success ? envelope.data : undefined;
        diagnostic = {
          ...diagnostic,
          ...(parsed ? { providerCode: parsed.code } : {}),
        };
        const failure = classifyOpenproviderFailure(
          response.status,
          parsed?.code,
          login,
          Boolean(token),
          parsed?.maintenance,
        );
        if (failure) {
          if (failure.code === 'PROVIDER_RATE_LIMIT') {
            const retry = response.headers.get('retry-after');
            const seconds =
              retry && /^\d+$/.test(retry)
                ? Math.min(1200, Math.max(1, Number(retry)))
                : parsed?.code === 4007
                  ? 300
                  : 60;
            await this.runtime.redis.set(
              'op:cooldown:' + scope,
              '1',
              'EX',
              seconds,
            );
          }
          // A successful HTTP response with an invalid envelope is a contract failure.
          if (!parsed && response.ok)
            throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
              ...diagnostic,
              category: 'response',
            });
          throw new RegistrarError(failure.code, failure.transient, {
            ...failure.diagnostic,
            operation,
          });
        }
        if (!parsed)
          throw new RegistrarError('PROVIDER_INVALID_RESPONSE', false, {
            ...diagnostic,
            category: 'response',
          });
        this.runtime.logger.info({
          event: 'registrar.request',
          provider: 'openprovider',
          operation,
          method,
          httpStatus: response.status,
          providerCode: parsed.code,
          attempt: attempt + 1,
          durationMs: Date.now() - started,
        });
        return parsed.data;
      } catch (error) {
        const failure =
          error instanceof RegistrarError
            ? error
            : new RegistrarError(
                error instanceof Error && error.name === 'TimeoutError'
                  ? 'PROVIDER_TIMEOUT'
                  : 'PROVIDER_UNAVAILABLE',
                true,
                {
                  ...diagnostic,
                  category: 'transient',
                },
              );
        this.runtime.logger.warn({
          event: 'registrar.error',
          provider: 'openprovider',
          ...failure.diagnostic,
          operation,
          method,
          code: failure.code,
          attempt: attempt + 1,
          willRetry: failure.transient && attempt < attempts - 1,
          durationMs: Date.now() - started,
        });
        if (!failure.transient || attempt === attempts - 1) throw failure;
        await delay(100 * 2 ** attempt);
      }
    }
    throw new RegistrarError('PROVIDER_UNAVAILABLE');
  }
}
