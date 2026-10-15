import {
  Controller,
  Get,
  Post,
  Inject,
  Req,
  Body,
  Param,
  ParseUUIDPipe,
  NotFoundException,
  RawBodyRequest,
} from '@nestjs/common';
import { ApiTags, ApiHeader } from '@nestjs/swagger';
import { paymentEventSchema } from '@devtrust/commerce';
import { z } from 'zod/v3';
import { paymentCreateSchema, mockPaymentSchema } from '@devtrust/contracts';
import {
  AuthRequest,
  AccountScoped,
  PaymentWebhook,
} from '../../common/security';
import { SchemaPipe } from '../../common/validation.pipe';
import { ApiInput } from '../../common/openapi';
import { PaymentsService } from './payments.service';
import { DatabaseService } from '../../common/database.service';
import { serialize } from '../checkout/commerce-access.service';
@ApiTags('Payments')
@AccountScoped()
@Controller('payments')
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private service: PaymentsService,
    @Inject(DatabaseService) private db: DatabaseService,
  ) {}
  @Post() @ApiInput(paymentCreateSchema) create(
    @Req() r: AuthRequest,
    @Body(new SchemaPipe(paymentCreateSchema))
    b: z.infer<typeof paymentCreateSchema>,
  ) {
    return this.service.create(r.user.id, b.orderId);
  }
  @Get() async list(@Req() r: AuthRequest) {
    return serialize(
      await this.db.payment.findMany({
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
    return this.service.get(r.user.id, id);
  }
  @Post(':id/mock-confirm') @ApiInput(mockPaymentSchema) simulate(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new SchemaPipe(mockPaymentSchema))
    b: z.infer<typeof mockPaymentSchema>,
  ) {
    return this.service.simulate(r.user.id, id, b.outcome);
  }
  @Post('webhooks/:provider')
  @PaymentWebhook()
  @ApiInput(paymentEventSchema)
  @ApiHeader({
    name: 'X-Payment-Signature',
    required: true,
    description:
      'HMAC-SHA256 do timestamp, ponto e payload bruto; apenas provider mock nesta entrega.',
  })
  @ApiHeader({
    name: 'X-Payment-Timestamp',
    required: true,
    description: 'Segundos Unix; tolerância máxima de 300 segundos.',
  })
  async webhook(
    @Req() r: RawBodyRequest<AuthRequest>,
    @Param('provider') provider: string,
  ) {
    if (provider !== 'mock')
      throw new NotFoundException('Fornecedor não suportado');
    const event = await this.service.provider.verifyWebhook({
      rawBody: r.rawBody || Buffer.alloc(0),
      signature:
        typeof r.headers['x-payment-signature'] === 'string'
          ? r.headers['x-payment-signature']
          : undefined,
      timestamp:
        typeof r.headers['x-payment-timestamp'] === 'string'
          ? r.headers['x-payment-timestamp']
          : undefined,
    });
    return this.service.event(event);
  }
}
