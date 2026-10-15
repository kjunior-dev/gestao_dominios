import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Body,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { checkoutSchema } from '@devtrust/contracts';
import { AuthRequest, AccountScoped } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { CheckoutService } from './checkout.service';
import { CommerceAccessService, orderView } from './commerce-access.service';
@ApiTags('Checkout')
@AccountScoped()
@Controller('checkout')
export class CheckoutController {
  constructor(
    @Inject(CheckoutService) private service: CheckoutService,
    @Inject(CommerceAccessService) private access: CommerceAccessService,
  ) {}
  @Get('config') config() {
    return this.service.config();
  }
  @Post() @ApiInput(checkoutSchema) create(
    @Req() r: AuthRequest,
    @Body(new SchemaPipe(checkoutSchema)) body: z.infer<typeof checkoutSchema>,
  ) {
    return this.service.create(r.user.id, body);
  }
  @Get(':id') async get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return orderView(await this.access.order(r.user.id, id));
  }
}
