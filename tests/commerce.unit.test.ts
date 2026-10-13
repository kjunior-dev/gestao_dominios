import { priceSchema } from '@devtrust/contracts';
import 'reflect-metadata';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@devtrust/database';
import {
  parseDomains,
  normalizeDomain,
} from '../apps/api/src/modules/domains/domain-name';
import { calculatePrice } from '../apps/api/src/modules/pricing/pricing.service';
import { OpenproviderClient } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.client';
import { OpenproviderAuth } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.auth';
import { OpenproviderProvider } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.provider';
import { parseExactJson } from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.types';
import {
  mapStatus,
  supplierMoney,
} from '../apps/api/src/modules/registrars/providers/openprovider/openprovider.mapper';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
const policy = {
  marginType: 'MARKUP' as const,
  marginValue: new Prisma.Decimal('20'),
  minimumPriceMinor: 0n,
  additionalCostMinor: 0n,
  roundingIncrementMinor: 1n,
};
afterEach(() => vi.unstubAllGlobals());
describe('Domain normalization and exact pricing', () => {
  it('normalizes whitespace, case and IDNA', () => {
    expect(normalizeDomain('  CAFÉ.COM ')).toBe('xn--caf-dma.com');
  });
  it('recognizes configured compound extensions', () => {
    expect(parseDomains('Brand.co.uk', undefined, ['uk', 'co.uk'])[0]).toEqual({
      name: 'brand',
      extension: 'co.uk',
      domainName: 'brand.co.uk',
    });
  });
  it.each([
    'https://localhost/path',
    'a b.com',
    'a..com',
    '-a.com',
    'a-.com',
    'a.com/',
    'a@com',
    'a%2ecom',
    'a'.repeat(64) + '.com',
  ])('rejects malformed/URL input %s', (v) => {
    expect(() => normalizeDomain(v)).toThrow();
  });
  it('rejects unsupported TLD and subdomains', () => {
    expect(() => parseDomains('a.invalid', undefined, ['com'])).toThrow();
    expect(() => parseDomains('sub.a.com', undefined, ['com'])).toThrow();
  });
  it('calculates markup separately from gross margin', () => {
    expect(calculatePrice('1000', '1', policy)).toBe('1200');
    expect(
      calculatePrice('1000', '1', { ...policy, marginType: 'GROSS_MARGIN' }),
    ).toBe('1250');
  });
  it('applies fixed margin, additional cost and deterministic upward rounding', () => {
    expect(
      calculatePrice('1001', '1', {
        ...policy,
        marginType: 'FIXED',
        marginValue: new Prisma.Decimal('2.50'),
        additionalCostMinor: 10n,
        roundingIncrementMinor: 100n,
      }),
    ).toBe('1300');
  });
  it('enforces a minimum and rejects invalid gross margin', () => {
    expect(
      calculatePrice('1', '1', { ...policy, minimumPriceMinor: 1000n }),
    ).toBe('1000');
    expect(() =>
      calculatePrice('1', '1', {
        ...policy,
        marginType: 'GROSS_MARGIN',
        marginValue: new Prisma.Decimal(100),
      }),
    ).toThrow();
  });
  it('converts currencies with an exact administered rate', () => {
    expect(
      calculatePrice('1000', '110.265', {
        ...policy,
        marginValue: new Prisma.Decimal(0),
      }),
    ).toBe('110265');
  });
  it('preserves numeric wire lexemes including large amounts', () => {
    expect(
      parseExactJson('{"price":1234567890123.45,"text":"price 123.45"}'),
    ).toEqual({ price: '1234567890123.45', text: 'price 123.45' });
    expect(supplierMoney('1234567890123.45', 'EUR').minor).toBe(
      '123456789012345',
    );
  });
  it('rejects malformed commercial integers and margins without throwing', () => {
    const base = {
      tldId: '11111111-1111-4111-8111-111111111111',
      registrarId: '22222222-2222-4222-8222-222222222222',
      periodYears: 1,
      supplierCurrency: 'CVE',
      supplierCostMinor: '1000',
      marginType: 'GROSS_MARGIN',
      marginValue: '20',
      effectiveUntil: new Date(Date.now() + 60000).toISOString(),
    };
    expect(
      priceSchema.safeParse({ ...base, marginValue: 'invalid' }).success,
    ).toBe(false);
    expect(
      priceSchema.safeParse({ ...base, roundingIncrementMinor: 'invalid' })
        .success,
    ).toBe(false);
    expect(priceSchema.safeParse({ ...base, marginValue: '100' }).success).toBe(
      false,
    );
  });
  it('maps only documented availability statuses', () => {
    expect(mapStatus('free')).toBe('AVAILABLE');
    expect(mapStatus('active')).toBe('REGISTERED');
    expect(mapStatus('anything')).toBe('UNKNOWN');
  });
});
function setup() {
  const cache = new Map<string, string>();
  const redis = {
    get: vi.fn(async (k: string) => cache.get(k) || null),
    exists: vi.fn(async (k: string) => (cache.has(k) ? 1 : 0)),
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && cache.has(k)) return null;
      cache.set(k, v);
      return 'OK';
    }),
    eval: vi.fn(
      async (script: string, _num: number, k: string, owner?: string) => {
        if (script.includes('INCR')) return 1;
        if (cache.get(k) === owner) cache.delete(k);
        return 1;
      },
    ),
  };
  const runtime = {
    env: {
      OPENPROVIDER_ENABLED: true,
      OPENPROVIDER_BASE_URL: 'https://api.openprovider.eu/v1',
      OPENPROVIDER_USERNAME: 'CONTRACT_TEST_ONLY',
      OPENPROVIDER_PASSWORD: randomBytes(20).toString('hex'),
      OPENPROVIDER_TIMEOUT_MS: 100,
      OPENPROVIDER_TOKEN_TTL_SECONDS: 3600,
      OPENPROVIDER_REQUESTS_PER_MINUTE: 60,
      TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    },
    redis,
    logger: { info: vi.fn(), warn: vi.fn() },
  } as unknown as RuntimeService;
  const client = new OpenproviderClient(runtime),
    auth = new OpenproviderAuth(runtime, client),
    provider = new OpenproviderProvider(auth, client);
  return { runtime, client, auth, provider, cache };
}
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ code: 0, data }), { status });
const domain = {
  name: 'contract',
  extension: 'com',
  domainName: 'contract.com',
};
describe('Official Openprovider read-only contracts (mocked transport)', () => {
  it('authenticates once, encrypts cached bearer token, batches availability and separates premium', async () => {
    const { provider, cache } = setup();
    const calls = vi
      .fn()
      .mockResolvedValueOnce(response({ token: 'mock-token' }))
      .mockImplementation(async () =>
        response({
          results: [
            {
              domain: 'contract.com',
              status: 'free',
              is_premium: true,
              premium: { currency: 'EUR', price: { create: 125.5 } },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', calls);
    const first = await provider.checkAvailability({ domains: [domain] });
    await provider.checkAvailability({ domains: [domain] });
    expect(first[0]).toMatchObject({
      status: 'AVAILABLE',
      isPremium: true,
      premiumCost: { minor: '12550', currency: 'EUR' },
    });
    expect(calls).toHaveBeenCalledTimes(3);
    expect([...cache.values()].join()).not.toContain('mock-token');
    expect(JSON.parse(calls.mock.calls[1][1].body)).toEqual({
      domains: [{ name: 'contract', extension: 'com' }],
      with_price: true,
    });
  });
  it('rejects invalid credentials without exposing descriptions', async () => {
    const { auth } = setup();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"code":10000,"desc":"sensitive password"}', {
          status: 401,
        }),
      ),
    );
    await expect(auth.token()).rejects.toMatchObject({ code: 'PROVIDER_AUTH' });
  });
  it('refreshes an expired bearer once on HTTP 401', async () => {
    const { provider } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ token: 'old' }))
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(
        response({
          results: [
            { domain: 'contract.com', status: 'active', is_premium: false },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await provider.checkAvailability({ domains: [domain] }))[0].status,
    ).toBe('REGISTERED');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('maps unexpected response to a controlled error', async () => {
    const { provider } = setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ token: 't' }))
        .mockResolvedValueOnce(response({ results: 'broken' })),
    );
    await expect(
      provider.checkAvailability({ domains: [domain] }),
    ).rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE' });
  });
  it('never marks an unrecognized status or missing result available', async () => {
    const { provider } = setup();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response({ token: 't' }))
        .mockResolvedValueOnce(
          response({
            results: [
              { domain: 'contract.com', status: 'pending', is_premium: false },
            ],
          }),
        ),
    );
    expect(
      (await provider.checkAvailability({ domains: [domain] }))[0].status,
    ).toBe('UNKNOWN');
  });
  it('retries transient 503 within bounded attempts', async () => {
    const { client } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ token: 't' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.send('/auth/login', 'POST', {})).resolves.toEqual({
      token: 't',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('handles timeouts after three attempts', async () => {
    const { client } = setup();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.send('/auth/login', 'POST', {})).rejects.toMatchObject({
      code: 'PROVIDER_TIMEOUT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it('does not retry rate limits and respects a shared cooldown', async () => {
    const { client } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response('{}', { status: 429, headers: { 'retry-after': '60' } }),
      );
    vi.stubGlobal('fetch', fetchMock);
    await expect(client.send('/auth/login', 'POST', {})).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
    });
    await expect(client.send('/auth/login', 'POST', {})).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMIT',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('reports supplier unavailability without fabricating results', async () => {
    const { client } = setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({}, 503)));
    await expect(client.send('/auth/login', 'POST', {})).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
  it('does not retry documented authentication failures wrapped in HTTP 500', async () => {
    const { auth } = setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"code":900,"desc":"sensitive external text"}', {
        status: 500,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(auth.token()).rejects.toMatchObject({ code: 'PROVIDER_AUTH' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('renews a token after documented envelope code 196', async () => {
    const { provider } = setup();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response({ token: 'old' }))
      .mockResolvedValueOnce(new Response('{"code":196}', { status: 500 }))
      .mockResolvedValueOnce(response({ token: 'new' }))
      .mockResolvedValueOnce(
        response({
          results: [
            { domain: 'contract.com', status: 'free', is_premium: false },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    expect(
      (await provider.checkAvailability({ domains: [domain] }))[0].status,
    ).toBe('AVAILABLE');
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
  it('rejects arbitrary URL capabilities', async () => {
    const { client } = setup();
    await expect(client.send('/http://localhost', 'GET')).rejects.toMatchObject(
      { code: 'CAPABILITY_UNSUPPORTED' },
    );
  });
  it('uses the official per-TLD price shape and refuses unsupported periods', async () => {
    const { provider } = setup();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(response({ token: 't' }))
      .mockImplementation(async () =>
        response({
          min_period: 1,
          prices: {
            create_price: { reseller: { price: 10.25, currency: 'EUR' } },
          },
        }),
      );
    vi.stubGlobal('fetch', mock);
    expect(
      await provider.getTldPricing({ extension: 'com', periodYears: 1 }),
    ).toEqual({ cost: { minor: '1025', currency: 'EUR' }, isPremium: false });
    await expect(
      provider.getTldPricing({ extension: 'com', periodYears: 2 }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
  });
  it('reads domain-specific period pricing and paginated catalog contracts', async () => {
    const { provider } = setup();
    const mock = vi
      .fn()
      .mockResolvedValueOnce(response({ token: 't' }))
      .mockResolvedValueOnce(
        response({
          is_premium: true,
          price: { reseller: { currency: 'EUR', price: 100.25 } },
        }),
      )
      .mockResolvedValueOnce(
        response({
          total: 1,
          results: [
            {
              name: 'com',
              status: 'ACT',
              min_period: 1,
              max_period: 10,
              renew_available: true,
              transfer_available: true,
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', mock);
    expect(
      await provider.getTldPricing({
        name: 'contract',
        extension: 'com',
        periodYears: 2,
      }),
    ).toEqual({ cost: { minor: '10025', currency: 'EUR' }, isPremium: true });
    expect(mock.mock.calls[1][0]).toContain('period=2');
    expect((await provider.getSupportedTlds())[0].extension).toBe('com');
  });
});
