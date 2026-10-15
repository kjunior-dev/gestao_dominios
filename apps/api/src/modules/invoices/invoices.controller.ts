import {
  Controller,
  Get,
  Inject,
  Req,
  Res,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthRequest, AccountScoped } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { InvoicesService } from './invoices.service';
import { serialize } from '../checkout/commerce-access.service';
@ApiTags('Internal billing documents')
@AccountScoped()
@Controller('invoices')
export class InvoicesController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(InvoicesService) private service: InvoicesService,
  ) {}
  @Get() async list(@Req() r: AuthRequest) {
    return serialize(
      await this.db.invoice.findMany({
        where: {
          order: {
            customerId: r.user.id,
            organization: {
              status: 'ACTIVE',
              members: { some: { userId: r.user.id } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
    );
  }
  @Get(':id') get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.view(r.user.id, id);
  }
  @Get(':id/pdf') async pdf(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    res
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition':
          'attachment; filename="devtrust-internal-' + id + '.pdf"',
        'Cache-Control': 'private, no-store',
      })
      .send(await this.service.pdf(r.user.id, id));
  }
}
