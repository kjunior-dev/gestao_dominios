import { Inject, Injectable } from '@nestjs/common';
import {
  MockPaymentProvider,
  PaymentProvider,
  CommerceError,
} from '@devtrust/commerce';
import { DatabaseService } from '../../../common/database.service';
import { RuntimeService } from '../../../common/runtime.service';
import { digest } from '../../../common/crypto';
@Injectable()
export class PaymentProviderRegistry {
  private providers: Map<string, PaymentProvider>;
  readonly mock: MockPaymentProvider;
  constructor(
    @Inject(DatabaseService) db: DatabaseService,
    @Inject(RuntimeService) runtime: RuntimeService,
  ) {
    this.mock = new MockPaymentProvider(
      {
        ...runtime.env,
        MOCK_WEBHOOK_SECRET:
          runtime.env.MOCK_WEBHOOK_SECRET ||
          digest('mock-webhook:' + runtime.env.TOTP_ENCRYPTION_KEY),
      },
      db,
    );
    this.providers = new Map([['mock', this.mock]]);
  }
  get(code: string): PaymentProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new CommerceError('PAYMENT_PROVIDER_UNSUPPORTED', 404);
    return provider;
  }
}
