import { describe, it, expect, vi, afterEach } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  MockPaymentProvider,
  commerceEnvironmentSchema,
  assertMock,
  assertRegistration,
  transitions,
  internalReceiptPdf,
  notificationTemplate,
  OpenproviderRegistrationProvider,
} from '../packages/commerce/src';
import {
  checkoutSchema,
  refundSchema,
  domainContactSchema,
} from '@devtrust/contracts';
import {
  OpenproviderAuth,
  OpenproviderClient,
  RegistrarRuntime,
} from '../packages/registrars';
const config = () => ({
  ...commerceEnvironmentSchema.parse({
    MOCK_WEBHOOK_SECRET: randomBytes(32).toString('hex'),
    OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED: 'true',
  }),
  NODE_ENV: 'test',
  OPENPROVIDER_BASE_URL: 'https://api.sandbox.openprovider.nl/v1beta',
});
const event = () => ({
  eventId: randomUUID(),
  externalPaymentId: 'mock-' + randomUUID(),
  orderId: randomUUID(),
  amountMinor: '1200',
  currency: 'CVE',
  status: 'PAID',
});
afterEach(() => vi.unstubAllGlobals());
describe('Financial safeguards and mock gateway', () => {
  it('defaults to mock payments, disabled registration and no live transactions', () => {
    expect(commerceEnvironmentSchema.parse({})).toMatchObject({
      PAYMENTS_MODE: 'mock',
      DOMAIN_REGISTRATION_MODE: 'disabled',
      LIVE_TRANSACTIONS_ENABLED: false,
    });
  });
  it('blocks mock payments in production', () => {
    expect(() => assertMock({ ...config(), NODE_ENV: 'production' })).toThrow(
      'MOCK_PAYMENT_DISABLED',
    );
  });
  it('cannot enable live purchases by changing flags or NODE_ENV', () => {
    expect(() =>
      assertRegistration(
        {
          ...config(),
          NODE_ENV: 'production',
          DOMAIN_REGISTRATION_MODE: 'live',
          LIVE_TRANSACTIONS_ENABLED: true,
        },
        'LIVE',
      ),
    ).toThrow('LIVE_GATEWAY_NOT_APPROVED');
  });
  it('rejects a production base in sandbox mode', () => {
    expect(() =>
      assertRegistration(
        {
          ...config(),
          DOMAIN_REGISTRATION_MODE: 'sandbox',
          OPENPROVIDER_BASE_URL: 'https://api.openprovider.eu/v1',
        },
        'SANDBOX',
      ),
    ).toThrow('SANDBOX_CONFIGURATION_REQUIRED');
  });
  it('does not admit arbitrary completion or refund transitions', () => {
    expect(transitions.PENDING_PAYMENT).not.toContain('COMPLETED');
    expect(transitions.PAID).not.toContain('COMPLETED');
    expect(transitions.REFUNDED).toEqual([]);
    expect(transitions.REFUND_PENDING).toContain('REFUNDED');
  });
  it('uses deterministic mock references and refunds', async () => {
    const p = new MockPaymentProvider(config());
    const request = {
      paymentId: randomUUID(),
      orderId: randomUUID(),
      amountMinor: '1200',
      currency: 'CVE',
      idempotencyKey: randomUUID(),
    };
    expect(await p.createPayment(request)).toEqual(
      await p.createPayment(request),
    );
    const r = {
      externalPaymentId: 'mock-contract',
      amountMinor: '500',
      currency: 'CVE',
      idempotencyKey: randomUUID(),
    };
    expect(await p.refundPayment(r)).toEqual(await p.refundPayment(r));
  });
  it.each(['PAID', 'DECLINED'])(
    'verifies authenticated %s events',
    async (status) => {
      const p = new MockPaymentProvider(config()),
        data = { ...event(), status },
        rawBody = Buffer.from(JSON.stringify(data)),
        timestamp = Math.floor(Date.now() / 1000).toString();
      expect(
        await p.verifyWebhook({
          rawBody,
          timestamp,
          signature: p.sign(rawBody, timestamp),
        }),
      ).toMatchObject({ ...data, verified: true });
    },
  );
  it('rejects signatures, replay timestamps and modified payloads', async () => {
    const p = new MockPaymentProvider(config()),
      rawBody = Buffer.from(JSON.stringify(event())),
      timestamp = Math.floor(Date.now() / 1000).toString(),
      signature = p.sign(rawBody, timestamp);
    await expect(
      p.verifyWebhook({ rawBody, timestamp, signature: '0'.repeat(64) }),
    ).rejects.toThrow('INVALID_WEBHOOK');
    await expect(
      p.verifyWebhook({
        rawBody: Buffer.concat([rawBody, Buffer.from(' ')]),
        timestamp,
        signature,
      }),
    ).rejects.toThrow('INVALID_WEBHOOK');
    await expect(
      p.verifyWebhook({
        rawBody,
        timestamp: String(Number(timestamp) - 301),
        signature,
      }),
    ).rejects.toThrow('INVALID_WEBHOOK');
  });
  it('rejects frontend prices and unsupported contact fields', () => {
    expect(checkoutSchema.safeParse({ totalMinor: '1' }).success).toBe(false);
    expect(
      refundSchema.safeParse({
        paymentId: randomUUID(),
        amountMinor: '-1',
        reason: 'Invalid refund',
        idempotencyKey: randomUUID(),
      }).success,
    ).toBe(false);
    expect(domainContactSchema.safeParse({ password: 'secret' }).success).toBe(
      false,
    );
  });
  it('creates a valid PDF structure marked internal and mock', () => {
    const pdf = internalReceiptPdf({
      number: 'INT-CONTRACT',
      orderNumber: 'DT-CONTRACT',
      environment: 'MOCK',
      legalName: 'Test',
      lines: [{ domainName: 'contract.test', years: 1, priceMinor: '1200' }],
      subtotalMinor: '1200',
      taxMinor: '0',
      totalMinor: '1200',
      currency: 'CVE',
    });
    expect(pdf.toString()).toContain('%PDF-1.4');
    expect(pdf.toString()).toContain('SEM VALIDADE FISCAL');
    expect(pdf.toString()).toContain('AMBIENTE MOCK');
    expect(pdf.toString()).toContain('12.00 CVE');
    const offset = Number(/startxref\n(\d+)/.exec(pdf.toString())![1]);
    expect(pdf.subarray(offset, offset + 4).toString()).toBe('xref');
  });
  it('escapes email content and rejects script links', () => {
    const t = notificationTemplate(
      'ORDER_CREATED',
      '<script>',
      'javascript:alert(1)',
    );
    expect(t.html).not.toContain('<script>');
    expect(t.html).not.toContain('href="javascript:');
    expect(t.html).toContain('&lt;script&gt;');
    expect(t.text).toContain('DevTrust');
  });
});
function transport() {
  const cache = new Map<string, string>();
  const runtime = {
    env: {
      ...config(),
      DOMAIN_REGISTRATION_MODE: 'sandbox',
      OPENPROVIDER_ENABLED: true,
      OPENPROVIDER_USERNAME: randomBytes(16).toString('hex'),
      OPENPROVIDER_PASSWORD: randomBytes(20).toString('hex'),
      OPENPROVIDER_TIMEOUT_MS: 100,
      OPENPROVIDER_TOKEN_TTL_SECONDS: 60,
      OPENPROVIDER_REQUESTS_PER_MINUTE: 60,
      TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    },
    redis: {
      get: async (k: string) => cache.get(k) || null,
      set: async (k: string, v: string, ...args: unknown[]) => {
        if (args.includes('NX') && cache.has(k)) return null;
        cache.set(k, v);
        return 'OK';
      },
      exists: async () => 0,
      eval: async (
        script: string,
        _count: number,
        k: string,
        expected: string,
      ) => {
        if (script.includes('INCR')) return 1;
        if (cache.get(k) === expected) cache.delete(k);
        return 1;
      },
    },
    logger: { info: vi.fn(), warn: vi.fn() },
  } as unknown as RegistrarRuntime;
  const client = new OpenproviderClient(runtime),
    auth = new OpenproviderAuth(runtime, client);
  return {
    runtime,
    client,
    provider: new OpenproviderRegistrationProvider(
      { ...config(), DOMAIN_REGISTRATION_MODE: 'sandbox' },
      auth,
      client,
    ),
  };
}
describe('Documented Openprovider registration contracts, mocked sandbox transport', () => {
  it('never retries a timed-out registration POST', async () => {
    const { client } = transport();
    const fetch = vi
      .fn()
      .mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    vi.stubGlobal('fetch', fetch);
    await expect(
      client.send('/domains', 'POST', {}, 'contract-token', {
        environment: 'SANDBOX',
        approved: false,
      }),
    ).rejects.toThrow('PROVIDER_TIMEOUT');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('blocks writes with no explicit mode and sandbox permit', async () => {
    const { client, runtime } = transport();
    runtime.env.DOMAIN_REGISTRATION_MODE = 'disabled';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      client.send('/domains', 'POST', {}, 'contract-token'),
    ).rejects.toThrow('REGISTRATION_DISABLED');
    await expect(
      client.send('/domains?trace=contract', 'POST', {}, 'contract-token'),
    ).rejects.toThrow('REGISTRATION_DISABLED');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('maps registration and status contracts, transmitting exact premium fees', async () => {
    const { provider } = transport();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('{"code":0,"data":{"token":"contract-token"}}'),
      )
      .mockResolvedValueOnce(new Response('{"code":0,"data":{"id":123}}'))
      .mockResolvedValueOnce(
        new Response(
          '{"code":0,"data":{"id":123,"status":"ACT","creation_date":"2026-10-14 00:00:00","expiration_date":"2027-10-14 00:00:00"}}',
        ),
      );
    vi.stubGlobal('fetch', fetch);
    expect(
      await provider.registerDomain({
        domainName: 'contract.com',
        name: 'contract',
        extension: 'com',
        years: 1,
        handle: 'CONTRACT-HANDLE',
        nameservers: ['ns1.example.test', 'ns2.example.test'],
        isPremium: true,
        maximumSupplierCostMinor: '999999999999999',
        supplierCurrency: 'EUR',
        idempotencyKey: randomUUID(),
      }),
    ).toMatchObject({ id: '123', status: 'ACTIVE' });
    const body = fetch.mock.calls[1][1].body as string;
    expect(body).toContain('"accept_premium_fee":9999999999999.99');
    expect(body).toContain('"autorenew":"off"');
  });
  it('looks up only exact domain and intention comments during reconciliation', async () => {
    const { provider } = transport(),
      idempotencyKey = randomUUID();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('{"code":0,"data":{"token":"contract-token"}}'),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              code: 0,
              data: {
                total: 1,
                results: [
                  {
                    id: 123,
                    status: 'ACT',
                    domain: { name: 'contract', extension: 'com' },
                    comments: 'different-intention',
                  },
                ],
              },
            }),
          ),
        ),
    );
    expect(
      await provider.findExistingRegistration({
        domainName: 'contract.com',
        idempotencyKey,
      }),
    ).toBeNull();
  });
});

describe('Known registration rejection diagnostics', () => {
  it('classifies documented balance and domain rejection even inside HTTP 500', async () => {
    const { classifyOpenproviderFailure } =
      await import('../packages/registrars');
    expect(classifyOpenproviderFailure(500, 310, false, true)?.code).toBe(
      'PROVIDER_INSUFFICIENT_BALANCE',
    );
    expect(classifyOpenproviderFailure(500, 311, false, true)?.code).toBe(
      'PROVIDER_DOMAIN_UNAVAILABLE',
    );
    expect(classifyOpenproviderFailure(500, 331, false, true)?.code).toBe(
      'PROVIDER_CONTACT_INVALID',
    );
  });
});
