import { Module } from '@nestjs/common';
import { RefundsController } from './refunds.controller';
@Module({ controllers: [RefundsController] })
export class RefundsModule {}
