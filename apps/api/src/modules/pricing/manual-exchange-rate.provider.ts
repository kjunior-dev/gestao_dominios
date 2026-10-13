import {
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
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
    if (!rate)
      throw new UnprocessableEntityException(
        'Taxa de câmbio válida indisponível',
      );
    return {
      rate: rate.rate.toString(),
      expiresAt: rate.expiresAt,
      id: rate.id,
    };
  }
}
