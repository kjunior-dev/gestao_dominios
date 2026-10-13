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
  let value = new D(cost).mul(rate).add(policy.additionalCostMinor.toString());
  const margin = new D(policy.marginValue.toString());
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
    if (!policy)
      throw new UnprocessableEntityException(
        'Preço comercial válido indisponível',
      );
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
      priceMinor: calculatePrice(supplier.minor, fx.rate, policy),
      currency: 'CVE',
      periodYears,
      expiresAt: expiresAt.toISOString(),
      priceVersion: policy.id,
    };
    const snapshot = {
      ...quote,
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
    return { quote, snapshot };
  }
}
