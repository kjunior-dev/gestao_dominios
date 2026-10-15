import {
  Controller,
  Get,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthRequest, AccountScoped } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { CommerceAccessService } from '../checkout/commerce-access.service';
@ApiTags('Managed domains')
@AccountScoped()
@Controller('domains')
export class ManagedDomainsController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.db.managedDomain.findMany({
      where: {
        organization: {
          status: 'ACTIVE',
          members: { some: { userId: r.user.id } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
  @Get(':id') async get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const d = await this.db.managedDomain.findUnique({ where: { id } });
    if (!d) throw new NotFoundException('Domínio não encontrado');
    await this.access.organization(r.user.id, d.organizationId, 'domains.read');
    return d;
  }
}
