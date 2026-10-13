import {
  Controller,
  Inject,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod/v3';
import {
  tldSchema,
  priceSchema,
  exchangeRateSchema,
  paginationSchema,
} from '@devtrust/contracts';
import { RequirePermission, AuthRequest } from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput, ApiPagination } from '../../common/openapi';
import { CatalogService } from './catalog.service';
const querySchema = paginationSchema.extend({
  registrarId: z.string().uuid().optional(),
});
@ApiTags('Commercial administration')
@RequirePermission('pricing.manage')
@Controller('admin')
export class CatalogController {
  constructor(@Inject(CatalogService) private catalog: CatalogService) {}
  @Get('tlds') @ApiPagination() tlds(
    @Query(new SchemaPipe(querySchema)) q: z.infer<typeof querySchema>,
  ) {
    return this.catalog.tlds(q.page, q.pageSize, q.search, q.registrarId);
  }
  @Get('tlds/:id') tld(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.catalog.tld(id);
  }
  @Post('tlds') @ApiInput(tldSchema) create(
    @Body(new SchemaPipe(tldSchema)) body: z.infer<typeof tldSchema>,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveTld(body, req.user.id);
  }
  @Patch('tlds/:id') @ApiInput(tldSchema) update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new SchemaPipe(tldSchema)) body: z.infer<typeof tldSchema>,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveTld(body, req.user.id, id);
  }
  @Get('pricing') @ApiPagination() prices(
    @Query(new SchemaPipe(querySchema)) q: z.infer<typeof querySchema>,
  ) {
    return this.catalog.prices(q.page, q.pageSize, q.registrarId);
  }
  @Post('pricing') @ApiInput(priceSchema) price(
    @Body(new SchemaPipe(priceSchema)) body: z.infer<typeof priceSchema>,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.savePrice(body, req.user.id);
  }
  @Post('pricing/:id/sync') syncPrice(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.syncPrice(id, req.user.id);
  }
  @Get('exchange-rates') rates() {
    return this.catalog.exchangeRates();
  }
  @Post('exchange-rates') @ApiInput(exchangeRateSchema) rate(
    @Body(new SchemaPipe(exchangeRateSchema))
    body: z.infer<typeof exchangeRateSchema>,
    @Req() req: AuthRequest,
  ) {
    return this.catalog.saveRate(body, req.user.id);
  }
  @Get('registrars') registrars() {
    return this.catalog.registrars();
  }
  @RequirePermission('system.manage')
  @Post('registrars/openprovider/sync')
  sync(@Req() req: AuthRequest) {
    return this.catalog.syncCatalog(req.user.id);
  }
}
