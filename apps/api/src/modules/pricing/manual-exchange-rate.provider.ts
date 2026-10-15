import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@devtrust/database';
import { PricingError } from './pricing-error';
import { DatabaseService } from '../../common/database.service';
import {
  ExchangeRateProvider,
  ValidExchangeRate,
} from './exchange-rate-provider.interface';
@Injectable()
export class ManualExchangeRateProvider implements ExchangeRateProvider {
  readonly code = 'manual';
  constructor(@Inject(DatabaseService) private db: DatabaseService) {}
  async getRate(
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<ValidExchangeRate> {
    if (baseCurrency === targetCurrency)
      return { rate: '1', expiresAt: new Date('9999-01-01'), id: null };
    const rate = await this.db.exchangeRate.findFirst({
      where: { baseCurrency, targetCurrency, expiresAt: { gt: new Date() } },
      orderBy: { fetchedAt: 'desc' },
    });
    if (!rate) {
      const previous = await this.db.exchangeRate.findFirst({
        where: { baseCurrency, targetCurrency },
        orderBy: { fetchedAt: 'desc' },
      });
      throw new PricingError(
        previous ? 'EXCHANGE_RATE_EXPIRED' : 'EXCHANGE_RATE_UNAVAILABLE',
      );
    }
    if (!new Prisma.Decimal(rate.rate).gt(0))
      throw new PricingError('INVALID_EXCHANGE_RATE');
    return {
      rate: rate.rate.toString(),
      expiresAt: rate.expiresAt,
      id: rate.id,
    };
  }
}
