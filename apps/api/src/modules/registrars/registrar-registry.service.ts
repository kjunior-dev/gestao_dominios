import { Inject, Injectable } from '@nestjs/common';
import { RegistrarProvider } from './domain/registrar-provider.interface';
import { RegistrarError } from './domain/registrar.types';
import { OpenproviderProvider } from './providers/openprovider/openprovider.provider';
@Injectable()
export class RegistrarRegistry {
  private providers: Map<string, RegistrarProvider>;
  constructor(@Inject(OpenproviderProvider) provider: OpenproviderProvider) {
    this.providers = new Map([[provider.providerCode, provider]]);
  }
  get(code: string): RegistrarProvider {
    const provider = this.providers.get(code);
    if (!provider) throw new RegistrarError('CAPABILITY_UNSUPPORTED');
    return provider;
  }
}
