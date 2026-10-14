import 'reflect-metadata';
import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
import { OpenproviderAuth } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.auth';
import { OpenproviderClient } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.client';
import { digest } from '../apps/api/src/common/crypto';

describe('Openprovider encrypted token cache with isolated real Redis', () => {
  let runtime: RuntimeService;
  let auth: OpenproviderAuth;
  let key: string;
  beforeEach(async () => {
    if (
      process.env.NODE_ENV !== 'test' ||
      !new URL(process.env.REDIS_URL || '').pathname.endsWith('/1')
    )
      throw new Error('Requires isolated test Redis database 1');
    runtime = new RuntimeService();
    const env = runtime.env;
    env.OPENPROVIDER_ENABLED = true;
    env.OPENPROVIDER_USERNAME = randomBytes(16).toString('hex');
    env.OPENPROVIDER_PASSWORD = randomBytes(20).toString('hex');
    env.TOTP_ENCRYPTION_KEY = randomBytes(32).toString('hex');
    env.OPENPROVIDER_TOKEN_TTL_SECONDS = 60;
    auth = new OpenproviderAuth(runtime, new OpenproviderClient(runtime));
    key =
      'op:auth:' +
      digest(
        JSON.stringify([
          env.OPENPROVIDER_BASE_URL,
          env.OPENPROVIDER_USERNAME,
          env.OPENPROVIDER_PASSWORD,
          digest(env.TOTP_ENCRYPTION_KEY),
        ]),
      );
    await runtime.redis.ping();
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    if (runtime) {
      const scope = digest(
        JSON.stringify([
          runtime.env.OPENPROVIDER_BASE_URL,
          runtime.env.OPENPROVIDER_USERNAME,
        ]),
      );
      await runtime.redis.del(
        key,
        key + ':lock',
        'op:rate:' + scope,
        'op:login-rate:' + scope,
        'op:cooldown:' + scope,
      );
      await runtime.onModuleDestroy();
    }
  });
  it('encrypts the bearer, sets TTL, and coalesces concurrent logins', async () => {
    const token = randomBytes(24).toString('hex');
    const transport = vi.fn(async () => {
      await delay(20);
      return new Response(JSON.stringify({ code: 0, data: { token } }));
    });
    vi.stubGlobal('fetch', transport);
    expect(
      await Promise.all([
        auth.token(),
        auth.token(),
        auth.token(),
        auth.token(),
      ]),
    ).toEqual([token, token, token, token]);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(await runtime.redis.get(key)).not.toContain(token);
    expect(await auth.cacheStatus()).toMatchObject({
      present: true,
      lockPresent: false,
    });
    expect(await runtime.redis.ttl(key)).toBeGreaterThan(0);
    expect(await runtime.redis.ttl(key)).toBeLessThanOrEqual(60);
  });
  it('renews after cache expiration and protects a replacement from stale invalidation', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"code":0,"data":{"token":"contract-old"}}'),
      )
      .mockResolvedValueOnce(
        new Response('{"code":0,"data":{"token":"contract-new"}}'),
      );
    vi.stubGlobal('fetch', transport);
    await auth.token();
    await runtime.redis.pexpire(key, 1);
    await delay(10);
    expect(await auth.token()).toBe('contract-new');
    await auth.invalidate('contract-old');
    expect(await auth.token()).toBe('contract-new');
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('removes corrupted ciphertext and releases the lock after a failed login', async () => {
    await runtime.redis.set(key, 'corrupted', 'EX', 60);
    const transport = vi
      .fn()
      .mockResolvedValue(new Response('{"code":196}', { status: 500 }));
    vi.stubGlobal('fetch', transport);
    await expect(auth.token()).rejects.toMatchObject({
      code: 'PROVIDER_LOGIN_REJECTED',
    });
    expect(await auth.cacheStatus()).toMatchObject({
      present: false,
      lockPresent: false,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
