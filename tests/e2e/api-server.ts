import 'reflect-metadata';
import { RegistrarError } from '../../apps/api/src/modules/registrars/domain/registrar.types';
import { createApp } from '../../apps/api/src/bootstrap';
import { DatabaseService } from '../../apps/api/src/common/database.service';
import { RegistrarRegistry } from '../../apps/api/src/modules/registrars/registrar-registry.service';
import type { RegistrarProvider } from '../../apps/api/src/modules/registrars/domain/registrar-provider.interface';
async function main() {
  if (
    process.env.NODE_ENV !== 'test' ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test') ||
    !process.env.REDIS_URL?.endsWith('/1')
  )
    throw new Error('Only an isolated E2E database is allowed');
  const app = await createApp(),
    db = app.get(DatabaseService);
  await db.$executeRawUnsafe(
    'TRUNCATE "CartItem", "Cart", "DomainSearchLog", "ExchangeRate", "TldPrice", "TldRegistrar", "Tld", "Registrar" CASCADE',
  );
  const registrar = await db.registrar.create({
    data: {
      code: 'e2e-contract',
      name: 'E2E CONTRACT MOCK ONLY',
      status: 'ACTIVE',
      configurationReference: 'tests:e2e-contract',
    },
  });
  for (const extension of ['com', 'net']) {
    const tld = await db.tld.create({
      data: {
        extension,
        displayName: 'E2E CONTRACT .' + extension,
        isActive: true,
        isFeatured: true,
        registrars: {
          create: {
            registrarId: registrar.id,
            isActive: true,
            supportsRegistration: true,
            maximumPeriod: 3,
            registrationPolicy: {
              approved: true,
              requiresAdditionalData: false,
            },
          },
        },
      },
    });
    for (const periodYears of [1, 2, 3])
      await db.tldPrice.create({
        data: {
          tldId: tld.id,
          registrarId: registrar.id,
          periodYears,
          supplierCurrency: 'CVE',
          currency: 'CVE',
          supplierCostMinor: 1000n * BigInt(periodYears),
          sellingPriceMinor: 1200n * BigInt(periodYears),
          marginType: 'MARKUP',
          marginValue: '20',
          effectiveUntil: new Date(Date.now() + 86400000),
        },
      });
  }
  const provider: RegistrarProvider = {
    providerCode: 'e2e-contract',
    async checkAvailability({ domains }) {
      return domains.map((d) => ({
        domainName: d.domainName,
        status: d.name === 'occupied' ? 'REGISTERED' : 'AVAILABLE',
        isPremium: d.name === 'premium',
        checkedAt: new Date().toISOString(),
      }));
    },
    async getTldPricing({ periodYears, name }) {
      if (name === 'noquote')
        throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
      return {
        cost: {
          minor: (
            (name === 'premium' ? 100000n : 1000n) * BigInt(periodYears)
          ).toString(),
          currency: 'CVE',
        },
        isPremium: name === 'premium',
      };
    },
    async getSupportedTlds() {
      return [];
    },
  };
  const registry = app.get(RegistrarRegistry);
  registry.get = (code) => {
    if (code !== 'e2e-contract')
      throw new Error('Unmocked provider is forbidden in E2E');
    return provider;
  };
  await app.listen(Number(process.env.API_PORT || 4400), 'localhost');
}
void main();
