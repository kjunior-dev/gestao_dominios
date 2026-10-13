import {
  Inject,
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  HttpCode,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { domainCheckSchema, paginationSchema } from '@devtrust/contracts';
import { Public, RequirePermission, AuthRequest } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { DatabaseService } from '../../common/database.service';
import { DomainsService } from './domains.service';
@ApiTags('Domains')
@Controller()
export class DomainsController {
  constructor(
    @Inject(DomainsService) private domains: DomainsService,
    @Inject(DatabaseService) private db: DatabaseService,
  ) {}
  @Public() @Get('tlds') catalog() {
    return this.domains.publicCatalog();
  }
  @Public()
  @Post('domains/check')
  @HttpCode(200)
  @ApiInput(domainCheckSchema)
  async check(
    @Body(new SchemaPipe(domainCheckSchema))
    body: z.infer<typeof domainCheckSchema>,
    @Req() req: AuthRequest,
  ) {
    await this.domains.throttle(req.ip || 'unknown');
    return (await this.domains.search(body)).results;
  }
  @RequirePermission('audit.read')
  @Get('admin/domain-search/logs')
  async logs(
    @Query(new SchemaPipe(paginationSchema))
    q: z.infer<typeof paginationSchema>,
  ) {
    const where = { normalizedQuery: { contains: q.search } };
    const [items, total] = await Promise.all([
      this.db.domainSearchLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      this.db.domainSearchLog.count({ where }),
    ]);
    return { items, total, page: q.page, pageSize: q.pageSize };
  }
  @RequirePermission('audit.read')
  @Get('admin/domain-search/metrics')
  metrics() {
    return this.domains.metrics();
  }
}
