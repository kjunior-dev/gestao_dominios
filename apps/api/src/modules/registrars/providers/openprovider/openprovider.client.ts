import { Inject, Injectable } from '@nestjs/common';
import { RuntimeService } from '../../../../common/runtime.service';
import { OpenproviderClient as SharedOpenproviderClient } from '@devtrust/registrars';
@Injectable()
export class OpenproviderClient extends SharedOpenproviderClient {
  constructor(@Inject(RuntimeService) runtime: RuntimeService) {
    super(runtime);
  }
}
