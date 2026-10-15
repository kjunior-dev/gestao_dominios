import { Module } from '@nestjs/common';
import { DomainContactsController } from './domain-contacts.controller';
@Module({ controllers: [DomainContactsController] })
export class DomainContactsModule {}
