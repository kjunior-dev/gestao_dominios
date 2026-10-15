import { Module } from '@nestjs/common';
import { ManagedDomainsController } from './managed-domains.controller';
@Module({ controllers: [ManagedDomainsController] })
export class DomainRegistrationModule {}
