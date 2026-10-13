import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
  Res,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import { cartItemSchema, cartPeriodSchema } from '@devtrust/contracts';
import {
  OptionalAccount,
  AccountScoped,
  AuthRequest,
} from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { CartService } from './cart.service';
@ApiTags('Cart')
@OptionalAccount()
@AccountScoped()
@Controller('cart')
export class CartController {
  constructor(@Inject(CartService) private cart: CartService) {}
  @Get() async get(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cart = await this.cart.resolve(req, res);
    return this.cart.view(cart.id);
  }
  @Post('items') @ApiInput(cartItemSchema) add(
    @Req() req: AuthRequest,
    @Body(new SchemaPipe(cartItemSchema)) body: z.infer<typeof cartItemSchema>,
  ) {
    return this.cart.put(req, body.domainName, body.registrationYears);
  }
  @Patch('items/:id') @ApiInput(cartPeriodSchema) update(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new SchemaPipe(cartPeriodSchema))
    body: z.infer<typeof cartPeriodSchema>,
  ) {
    return this.cart.put(req, '', body.registrationYears, id);
  }
  @Delete('items/:id') remove(
    @Req() req: AuthRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.cart.remove(req, id);
  }
  @Delete() clear(@Req() req: AuthRequest) {
    return this.cart.remove(req);
  }
}
