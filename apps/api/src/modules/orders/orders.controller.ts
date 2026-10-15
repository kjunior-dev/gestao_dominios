import {
  Controller,
  Get,
  Inject,
  Req,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { commerceListSchema } from '@devtrust/contracts';
import { AuthRequest, AccountScoped } from '../../common/security';
import { DatabaseService } from '../../common/database.service';
import { SchemaPipe } from '../../common/validation.pipe';
import {
  CommerceAccessService,
  orderView,
} from '../checkout/commerce-access.service';
@ApiTags('Orders')
@AccountScoped()
@Controller('orders')
export class OrdersController {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get() async list(
    @Req() r: AuthRequest,
    @Query(new SchemaPipe(commerceListSchema))
    q: z.infer<typeof commerceListSchema>,
  ) {
    const where = {
      customerId: r.user.id,
      organization: {
        status: 'ACTIVE' as const,
        members: { some: { userId: r.user.id } },
      },
      orderNumber: { contains: q.search, mode: 'insensitive' as const },
      ...(q.environment ? { environment: q.environment } : {}),
    };
    const items = await this.db.order.findMany({
      where,
      include: {
        items: true,
        payments: { include: { refunds: true } },
        transitions: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    });
    return {
      items: items.map(orderView),
      total: await this.db.order.count({ where }),
      page: q.page,
      pageSize: q.pageSize,
    };
  }
  @Get(':id') async get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return orderView(await this.access.order(r.user.id, id));
  }
}
