import {
  Controller,
  Get,
  Patch,
  Inject,
  Req,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { billingSchema } from '@devtrust/contracts';
import { AuthRequest, AccountScoped } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { CommerceAccessService } from '../checkout/commerce-access.service';
@ApiTags('Billing profiles')
@AccountScoped()
@Controller('billing')
export class BillingController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get() async get(
    @Req() r: AuthRequest,
    @Query('organizationId', ParseUUIDPipe) id: string,
  ) {
    await this.access.organization(r.user.id, id, 'orders.read');
    return this.db.billingProfile.findUnique({ where: { organizationId: id } });
  }
  @Patch() @ApiInput(billingSchema) update(
    @Req() r: AuthRequest,
    @Query('organizationId', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(billingSchema)) body: z.infer<typeof billingSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.access.organization(r.user.id, id, 'orders.manage', tx);
      const profile = await tx.billingProfile.upsert({
        where: { organizationId: id },
        create: { ...body, organizationId: id },
        update: body,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          organizationId: id,
          action: 'billing.profile_updated',
          resourceType: 'BillingProfile',
          resourceId: profile.id,
          metadata: {},
        },
      });
      return profile;
    });
  }
}
