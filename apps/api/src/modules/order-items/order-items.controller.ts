import {
  Controller,
  Get,
  Inject,
  Req,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthRequest, AccountScoped } from '../../common/security';
import {
  CommerceAccessService,
  orderView,
} from '../checkout/commerce-access.service';
@ApiTags('Order items')
@AccountScoped()
@Controller('orders/:orderId/items')
export class OrderItemsController {
  constructor(
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get() async list(
    @Req() r: AuthRequest,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return orderView(await this.access.order(r.user.id, id)).items;
  }
}
