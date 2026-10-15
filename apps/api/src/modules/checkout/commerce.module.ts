import { PaymentProviderRegistry } from '../payments/providers/payment-provider.registry';
import { Global, Module } from '@nestjs/common';
import { DomainsModule } from '../domains/domains.module';
import { CheckoutService } from './checkout.service';
import { CommerceAccessService } from './commerce-access.service';
import { PaymentsService } from '../payments/payments.service';
import { RefundsService } from '../refunds/refunds.service';
import { InvoicesService } from '../invoices/invoices.service';
@Global()
@Module({
  imports: [DomainsModule],
  providers: [
    PaymentProviderRegistry,
    CommerceAccessService,
    CheckoutService,
    PaymentsService,
    RefundsService,
    InvoicesService,
  ],
  exports: [
    PaymentProviderRegistry,
    CommerceAccessService,
    CheckoutService,
    PaymentsService,
    RefundsService,
    InvoicesService,
  ],
})
export class CommerceModule {}
