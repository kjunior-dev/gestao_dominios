import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { domainContactSchema } from '@devtrust/contracts';
import { AuthRequest, AccountScoped } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { DatabaseService } from '../../common/database.service';
import { CommerceAccessService } from '../checkout/commerce-access.service';
@ApiTags('Domain contacts')
@AccountScoped()
@Controller('domain-contacts')
export class DomainContactsController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get() async list(
    @Req() r: AuthRequest,
    @Query('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    await this.access.organization(r.user.id, organizationId, 'orders.read');
    return this.db.domainContact.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Post() @ApiInput(domainContactSchema) async create(
    @Req() r: AuthRequest,
    @Body(new SchemaPipe(domainContactSchema))
    b: z.infer<typeof domainContactSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.access.organization(
        r.user.id,
        b.organizationId,
        'orders.manage',
        tx,
      );
      const c = await tx.domainContact.create({ data: b });
      await tx.auditLog.create({
        data: {
          actorUserId: r.user.id,
          organizationId: b.organizationId,
          action: 'contact.created',
          resourceType: 'DomainContact',
          resourceId: c.id,
          metadata: {},
        },
      });
      return c;
    });
  }
}
