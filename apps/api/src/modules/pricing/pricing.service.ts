import { PricingError } from './pricing-error';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { z } from 'zod/v3';
import { ManualExchangeRateProvider } from './manual-exchange-rate.provider';
import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, TldPrice } from '@devtrust/database';
import { CommercialQuote } from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { SupplierMoney } from '../registrars/domain/registrar.types';
Prisma.Decimal.set({ precision: 60 });
export function calculatePrice(
  cost: string,
  rate: string,
  policy: Pick<
    TldPrice,
    | 'marginType'
    | 'marginValue'
    | 'minimumPriceMinor'
    | 'additionalCostMinor'
    | 'roundingIncrementMinor'
  >,
): string {
  const D = Prisma.Decimal;
  const acquisition = new D(cost),
    fx = new D(rate);
  if (
    !acquisition.isFinite() ||
    acquisition.isNegative() ||
    !acquisition.isInteger() ||
    !fx.isFinite() ||
    !fx.gt(0)
  )
    throw new PricingError('INVALID_PRICE_INPUT');
  let value = acquisition.mul(fx).add(policy.additionalCostMinor.toString());
  const margin = new D(policy.marginValue.toString());
  if (!margin.isFinite() || margin.isNegative())
    throw new PricingError('INVALID_MARGIN');
  if (policy.marginType === 'FIXED') value = value.add(margin.mul(100));
  else if (policy.marginType === 'MARKUP')
    value = value.mul(new D(1).add(margin.div(100)));
  else {
    if (margin.gte(100))
      throw new UnprocessableEntityException('Margem bruta inválida');
    value = value.div(new D(1).sub(margin.div(100)));
  }
  value = D.max(value, policy.minimumPriceMinor.toString());
  const step = new D(policy.roundingIncrementMinor.toString());
  if (!step.gt(0))
    throw new UnprocessableEntityException('Arredondamento inválido');
  value = value.div(step).ceil().mul(step);
  if (value.gt('999999999999999'))
    throw new UnprocessableEntityException('Preço excede o limite');
  return value.toFixed(0);
}
const signedQuoteSchema = z
  .object({
    domainName: z.string(),
    registrarCode: z.string(),
    isPremium: z.boolean(),
    priceMinor: z.string().regex(/^\d{1,15}$/),
    currency: z.literal('CVE'),
    periodYears: z.number().int().min(1).max(10),
    expiresAt: z.string().datetime(),
    priceVersion: z.string().uuid(),
  })
  .strict();
@Injectable()
export class PricingService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(ManualExchangeRateProvider)
    private exchange: ManualExchangeRateProvider,
  ) {}
  rate(baseCurrency: string, targetCurrency: string) {
    return this.exchange.getRate(baseCurrency, targetCurrency);
  }
  async quote(
    tldId: string,
    registrarId: string,
    periodYears: number,
    cost?: SupplierMoney,
    isPremium = false,
  ) {
    const now = new Date();
    const policy = await this.db.tldPrice.findFirst({
      where: {
        tldId,
        registrarId,
        periodYears,
        operation: 'REGISTER',
        isActive: true,
        effectiveFrom: { lte: now },
        effectiveUntil: { gt: now },
        currency: 'CVE',
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!policy) {
      const previous = await this.db.tldPrice.findFirst({
        where: {
          tldId,
          registrarId,
          periodYears,
          operation: 'REGISTER',
          currency: 'CVE',
        },
        orderBy: { effectiveFrom: 'desc' },
      });
      throw new PricingError(
        previous && previous.effectiveUntil <= now
          ? 'PRICE_POLICY_EXPIRED'
          : previous?.isActive === false
            ? 'PRICE_POLICY_DISABLED'
            : 'PRICE_POLICY_UNAVAILABLE',
      );
    }
    const supplier = cost || {
      minor: policy.supplierCostMinor.toString(),
      currency: policy.supplierCurrency,
    };
    const fx = await this.rate(supplier.currency, policy.currency);
    const expiresAt = new Date(
      Math.min(
        now.getTime() + this.runtime.env.QUOTE_TTL_SECONDS * 1000,
        policy.effectiveUntil.getTime(),
        fx.expiresAt.getTime(),
      ),
    );
    const quote: CommercialQuote = {
      priceMinor:
        !isPremium && policy.manualSellingPriceMinor != null
          ? policy.manualSellingPriceMinor.toString()
          : calculatePrice(supplier.minor, fx.rate, policy),
      currency: 'CVE',
      periodYears,
      expiresAt: expiresAt.toISOString(),
      priceVersion: policy.id,
    };
    const snapshot = {
      ...quote,
      manualSellingPriceMinor: !isPremium
        ? (policy.manualSellingPriceMinor?.toString() ?? null)
        : null,
      supplierCostMinor: supplier.minor,
      supplierCurrency: supplier.currency,
      exchangeRate: fx.rate,
      exchangeRateId: fx.id,
      marginType: policy.marginType,
      marginValue: policy.marginValue.toString(),
      additionalCostMinor: policy.additionalCostMinor.toString(),
      minimumPriceMinor: policy.minimumPriceMinor.toString(),
      roundingIncrementMinor: policy.roundingIncrementMinor.toString(),
    };
    if (expiresAt <= new Date()) throw new PricingError('QUOTE_EXPIRED');
    return { quote, snapshot };
  }
  signQuote(
    domainName: string,
    registrarCode: string,
    isPremium: boolean,
    quote: CommercialQuote,
  ) {
    const value = {
      priceMinor: quote.priceMinor,
      currency: quote.currency,
      periodYears: quote.periodYears,
      expiresAt: quote.expiresAt,
      priceVersion: quote.priceVersion,
    };
    const payload = Buffer.from(
      JSON.stringify({ domainName, registrarCode, isPremium, ...value }),
    ).toString('base64url');
    return payload + '.' + this.signature(payload);
  }
  private signature(payload: string) {
    return createHmac(
      'sha256',
      Buffer.from(this.runtime.env.TOTP_ENCRYPTION_KEY, 'hex'),
    )
      .update('devtrust:domain-quote:v1:' + payload)
      .digest('base64url');
  }
  verifyQuote(
    token: string,
    domainName: string,
    registrarCode: string,
    isPremium: boolean,
    quote: CommercialQuote,
  ) {
    try {
      const [payload, mac, extra] = token.split('.');
      if (!payload || !mac || extra) throw new Error();
      const actual = Buffer.from(mac),
        expected = Buffer.from(this.signature(payload));
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        throw new Error();
      const signed = signedQuoteSchema.parse(
        JSON.parse(Buffer.from(payload, 'base64url').toString()),
      );
      if (new Date(signed.expiresAt) <= new Date()) throw new Error();
      if (
        signed.domainName !== domainName ||
        signed.registrarCode !== registrarCode ||
        signed.isPremium !== isPremium ||
        signed.priceMinor !== quote.priceMinor ||
        signed.currency !== quote.currency ||
        signed.periodYears !== quote.periodYears ||
        signed.priceVersion !== quote.priceVersion
      )
        throw new Error();
    } catch {
      throw new ConflictException({
        code: 'QUOTE_CHANGED_OR_EXPIRED',
        message: 'Cotação alterada ou expirada. Pesquise e confirme novamente.',
      });
    }
  }
}
