import { CommerceAdminController } from './commerce-admin.controller';
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
@Module({ controllers: [CommerceAdminController, AdminController] })
export class AdminModule {}
