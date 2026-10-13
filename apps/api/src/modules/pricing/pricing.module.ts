import { ManualExchangeRateProvider } from './manual-exchange-rate.provider';
import { Module } from '@nestjs/common';
import { PricingService } from './pricing.service';
@Module({
  providers: [PricingService, ManualExchangeRateProvider],
  exports: [PricingService],
})
export class PricingModule {}
