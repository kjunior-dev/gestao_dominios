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
import { refundSchema } from '@devtrust/contracts';
import { AuthRequest, AccountScoped } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { RefundsService } from './refunds.service';
@ApiTags('Refunds')
@AccountScoped()
@Controller('refunds')
export class RefundsController {
  constructor(@Inject(RefundsService) private service: RefundsService) {}
  @Post() @ApiInput(refundSchema) request(
    @Req() r: AuthRequest,
    @Body(new SchemaPipe(refundSchema)) b: z.infer<typeof refundSchema>,
  ) {
    return this.service.request(r.user.id, b);
  }
  @Get(':id') get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(r.user.id, id);
  }
}
