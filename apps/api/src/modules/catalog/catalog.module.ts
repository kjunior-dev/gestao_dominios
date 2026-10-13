import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { RegistrarsModule } from '../registrars/registrars.module';
import { PricingModule } from '../pricing/pricing.module';
@Module({
  imports: [RegistrarsModule, PricingModule],
  providers: [CatalogService],
  controllers: [CatalogController],
})
export class CatalogModule {}
