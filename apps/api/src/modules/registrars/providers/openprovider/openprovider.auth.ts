import { Inject, Injectable } from '@nestjs/common';
import { RuntimeService } from '../../../../common/runtime.service';
import { OpenproviderAuth as SharedOpenproviderAuth } from '@devtrust/registrars';
import { OpenproviderClient } from './openprovider.client';
@Injectable()
export class OpenproviderAuth extends SharedOpenproviderAuth {
  constructor(
    @Inject(RuntimeService) runtime: RuntimeService,
    @Inject(OpenproviderClient) client: OpenproviderClient,
  ) {
    super(runtime, client);
  }
}
