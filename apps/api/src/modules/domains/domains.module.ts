import { Module } from '@nestjs/common';
import { RegistrarsModule } from '../registrars/registrars.module';
import { PricingModule } from '../pricing/pricing.module';
import { DomainsService } from './domains.service';
import { DomainsController } from './domains.controller';
import { AvailabilityCache } from './availability-cache.service';
@Module({
  imports: [RegistrarsModule, PricingModule],
  providers: [DomainsService, AvailabilityCache],
  controllers: [DomainsController],
  exports: [DomainsService],
})
export class DomainsModule {}
