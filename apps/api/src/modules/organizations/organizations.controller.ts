import { OrganizationScoped } from '../../common/security';
import { Inject } from '@nestjs/common';
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { organizationSchema } from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { AuthRequest } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { AuthorizationService } from '../roles/authorization.service';
import { AuditService } from '../audit/audit.service';
const organizationBody = {
  schema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string' as const },
      slug: { type: 'string' as const },
      type: { type: 'string' as const, enum: ['INDIVIDUAL', 'BUSINESS'] },
      country: { type: 'string' as const },
      taxId: { type: 'string' as const },
    },
  },
};
@ApiTags('Organizations')
@OrganizationScoped()
@Controller('organizations')
export class OrganizationsController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(AuthorizationService) private authorization: AuthorizationService,
    @Inject(AuditService) private audit: AuditService,
  ) {}
  @Get() async list(@Req() req: AuthRequest) {
    const memberships = await this.db.organizationMember.findMany({
      where: { userId: req.user.id },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.organization, role: m.role }));
  }
  @Post() @ApiBody(organizationBody) create(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(organizationSchema))
    body: z.infer<typeof organizationSchema>,
  ) {
    return this.db.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          ...body,
          members: { create: { userId: req.user.id, role: 'OWNER' } },
        },
      });
      await this.audit.record(
        'organizations.created',
        'Organization',
        req.user.id,
        organization.id,
        organization.id,
        {},
        tx,
      );
      return { ...organization, role: 'OWNER' };
    });
  }
  @Get(':id') async get(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const member = await this.authorization.organization(
      req.user.id,
      id,
      'organizations.read',
    );
    return { ...member.organization, role: member.role };
  }
  @Patch(':id') @ApiBody(organizationBody) async update(
    @Req() req: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(organizationSchema.partial()))
    body: Partial<z.infer<typeof organizationSchema>>,
  ) {
    return this.db.$transaction(async (tx) => {
      await this.authorization.organization(
        req.user.id,
        id,
        'organizations.update',
        tx,
      );
      const org = await tx.organization.update({ where: { id }, data: body });
      await this.audit.record(
        'organizations.updated',
        'Organization',
        req.user.id,
        id,
        id,
        {},
        tx,
      );
      return org;
    });
  }
}
