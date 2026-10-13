import { Module } from '@nestjs/common';
import { OpenproviderAuth } from './providers/openprovider/openprovider.auth';
import { OpenproviderClient } from './providers/openprovider/openprovider.client';
import { OpenproviderProvider } from './providers/openprovider/openprovider.provider';
import { RegistrarRegistry } from './registrar-registry.service';
@Module({
  providers: [
    OpenproviderAuth,
    OpenproviderClient,
    OpenproviderProvider,
    RegistrarRegistry,
  ],
  exports: [RegistrarRegistry],
})
export class RegistrarsModule {}
