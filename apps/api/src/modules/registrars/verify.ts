import 'reflect-metadata';
import { RuntimeService } from '../../common/runtime.service';
import { OpenproviderClient } from './providers/openprovider/openprovider.client';
import { OpenproviderAuth } from './providers/openprovider/openprovider.auth';
import { OpenproviderProvider } from './providers/openprovider/openprovider.provider';
import { RegistrarError } from './domain/registrar.types';
async function main() {
  const runtime = new RuntimeService();
  try {
    await runtime.onModuleInit();
    const client = new OpenproviderClient(runtime),
      auth = new OpenproviderAuth(runtime, client),
      provider = new OpenproviderProvider(auth, client);
    console.log(
      JSON.stringify({
        event: 'registrar.cache_status',
        ...(await auth.cacheStatus()),
      }),
    );
    if (process.argv.includes('--auth-only')) {
      await auth.token();
      console.log(
        JSON.stringify({
          event: 'registrar.authentication_verified',
          ...(await auth.cacheStatus()),
        }),
      );
      return;
    }
    const results = await provider.checkAvailability({
      domains: [
        { name: 'example', extension: 'com', domainName: 'example.com' },
      ],
    });
    console.log(
      JSON.stringify({
        provider: provider.providerCode,
        environment: runtime.env.OPENPROVIDER_BASE_URL,
        results,
      }),
    );
    if (results.some((r) => r.status === 'UNKNOWN')) process.exitCode = 1;
  } catch (e) {
    console.error(
      JSON.stringify({
        event: 'registrar.verification_failed',
        ...(e instanceof RegistrarError ? e.diagnostic : {}),
        code:
          e instanceof RegistrarError
            ? e.code
            : 'CONFIGURATION_OR_CONNECTION_ERROR',
      }),
    );
    process.exitCode = 1;
  } finally {
    await runtime.onModuleDestroy();
  }
}
void main();
