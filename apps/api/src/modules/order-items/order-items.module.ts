import { Module } from '@nestjs/common';
import { OrderItemsController } from './order-items.controller';
@Module({ controllers: [OrderItemsController] })
export class OrderItemsModule {}
