import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Prisma, TldPrice } from '@devtrust/database';
import { CommercialQuote, priceSchema } from '@devtrust/contracts';
import {
  PricingService,
  calculatePrice,
} from '../apps/api/src/modules/pricing/pricing.service';
import { DatabaseService } from '../apps/api/src/common/database.service';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
import { ManualExchangeRateProvider } from '../apps/api/src/modules/pricing/manual-exchange-rate.provider';

function setup() {
  const policy = {
    id: '11111111-1111-4111-8111-111111111111',
    supplierCostMinor: 1000n,
    supplierCurrency: 'EUR',
    currency: 'CVE',
    marginType: 'MARKUP',
    marginValue: new Prisma.Decimal('20'),
    minimumPriceMinor: 0n,
    additionalCostMinor: 0n,
    roundingIncrementMinor: 100n,
    manualSellingPriceMinor: null,
    effectiveUntil: new Date(Date.now() + 600000),
  } as TldPrice;
  const db = {
    tldPrice: { findFirst: vi.fn(async () => policy) },
    exchangeRate: {
      findFirst: vi.fn(async () => ({
        rate: new Prisma.Decimal('110.265'),
        id: 'fx',
        expiresAt: new Date(Date.now() + 60000),
      })),
    },
  };
  const runtime = {
    env: {
      QUOTE_TTL_SECONDS: 300,
      TOTP_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    },
  } as RuntimeService;
  const exchange = new ManualExchangeRateProvider(
    db as unknown as DatabaseService,
  );
  return {
    policy,
    db,
    service: new PricingService(
      db as unknown as DatabaseService,
      runtime,
      exchange,
    ),
  };
}
const quote: CommercialQuote = {
  priceMinor: '1200',
  currency: 'CVE',
  periodYears: 2,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
  priceVersion: '11111111-1111-4111-8111-111111111111',
};
describe('Central pricing and signed acceptance', () => {
  it('converts the total period cost and limits validity to the exchange rate', async () => {
    const { service } = setup();
    const result = await service.quote('tld', 'registrar', 2, {
      minor: '2247',
      currency: 'EUR',
    });
    expect(result.quote.priceMinor).toBe('297400');
    expect(
      new Date(result.quote.expiresAt).getTime() - Date.now(),
    ).toBeLessThanOrEqual(60000);
    expect(JSON.stringify(result.quote)).not.toContain('supplier');
    expect(result.snapshot.supplierCostMinor).toBe('2247');
  });
  it('uses authorized manual sale for standard and ignores it for premium', async () => {
    const { service, policy } = setup();
    policy.manualSellingPriceMinor = 999n;
    expect((await service.quote('t', 'r', 1)).quote.priceMinor).toBe('999');
    expect(
      (
        await service.quote(
          't',
          'r',
          1,
          { minor: '1000', currency: 'EUR' },
          true,
        )
      ).quote.priceMinor,
    ).toBe('132400');
  });
  it('reports a missing policy instead of using a supplier cost as sale', async () => {
    const { service, db } = setup();
    db.tldPrice.findFirst.mockResolvedValueOnce(null as unknown as TldPrice);
    await expect(
      service.quote('t', 'r', 1, { minor: '1000', currency: 'CVE' }),
    ).rejects.toMatchObject({ code: 'PRICE_POLICY_UNAVAILABLE' });
  });
  it('reports absent exchange and rejects nonpositive configured rates', async () => {
    const { service, db } = setup();
    db.exchangeRate.findFirst
      .mockResolvedValueOnce(null as never)
      .mockResolvedValueOnce(null as never);
    await expect(service.quote('t', 'r', 1)).rejects.toMatchObject({
      code: 'EXCHANGE_RATE_UNAVAILABLE',
    });
    db.exchangeRate.findFirst.mockResolvedValueOnce({
      rate: new Prisma.Decimal(0),
      id: 'bad',
      expiresAt: new Date(Date.now() + 60000),
    });
    await expect(service.quote('t', 'r', 1)).rejects.toMatchObject({
      code: 'INVALID_EXCHANGE_RATE',
    });
  });
  it('verifies a quote without revealing acquisition costs', () => {
    const { service } = setup();
    const token = service.signQuote('example.com', 'openprovider', true, quote);
    expect(() =>
      service.verifyQuote(token, 'example.com', 'openprovider', true, quote),
    ).not.toThrow();
    expect(
      Buffer.from(token.split('.')[0], 'base64url').toString(),
    ).not.toContain('supplier');
  });
  it.each([
    { priceMinor: '1' },
    { currency: 'EUR' },
    { periodYears: 1 },
    { priceVersion: '22222222-2222-4222-8222-222222222222' },
  ])('rejects changed sale terms %o', (change) => {
    const { service } = setup();
    const token = service.signQuote('example.com', 'openprovider', true, quote);
    expect(() =>
      service.verifyQuote(token, 'example.com', 'openprovider', true, {
        ...quote,
        ...change,
      } as CommercialQuote),
    ).toThrow('Cotação');
  });
  it('rejects forged, expired, wrong-domain and wrong-premium acceptance', () => {
    const { service } = setup();
    const token = service.signQuote('example.com', 'openprovider', true, quote);
    for (const invalid of [
      token + 'a',
      'invalid',
      service.signQuote('example.com', 'openprovider', true, {
        ...quote,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ]) {
      expect(() =>
        service.verifyQuote(
          invalid,
          'example.com',
          'openprovider',
          true,
          quote,
        ),
      ).toThrow();
    }
    expect(() =>
      service.verifyQuote(token, 'other.com', 'openprovider', true, quote),
    ).toThrow();
    expect(() =>
      service.verifyQuote(token, 'example.com', 'openprovider', false, quote),
    ).toThrow();
  });
  it('requires a reason for manual sale and restricts sale currency to CVE', () => {
    const input = {
      tldId: quote.priceVersion,
      registrarId: quote.priceVersion,
      periodYears: 1,
      supplierCurrency: 'EUR',
      supplierCostMinor: '1000',
      marginType: 'MARKUP',
      marginValue: '20',
      effectiveUntil: quote.expiresAt,
    };
    expect(
      priceSchema.safeParse({ ...input, manualSellingPriceMinor: '100' })
        .success,
    ).toBe(false);
    expect(
      priceSchema.safeParse({
        ...input,
        manualSellingPriceMinor: '100',
        changeReason: 'Preço autorizado',
      }).success,
    ).toBe(true);
    expect(priceSchema.safeParse({ ...input, currency: 'EUR' }).success).toBe(
      false,
    );
  });
  it.each([
    ['-1', '1'],
    ['100', '0'],
    ['100', '-1'],
    ['NaN', '1'],
  ])('rejects invalid financial inputs %s / %s', (cost, rate) => {
    expect(() => calculatePrice(cost, rate, setup().policy)).toThrow();
  });
});
