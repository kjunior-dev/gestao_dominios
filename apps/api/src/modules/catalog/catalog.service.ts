import {
  Inject,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@devtrust/database';
import { z } from 'zod/v3';
import {
  tldSchema,
  priceSchema,
  exchangeRateSchema,
} from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { AuditService } from '../audit/audit.service';
import { RegistrarRegistry } from '../registrars/registrar-registry.service';
import { RegistrarError } from '../registrars/domain/registrar.types';
import { PricingService, calculatePrice } from '../pricing/pricing.service';
import { normalizeDomain } from '../domains/domain-name';
export const exactView = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === 'bigint' ? v.toString() : v,
    ),
  );
@Injectable()
export class CatalogService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(AuditService) private audit: AuditService,
    @Inject(RegistrarRegistry) private registry: RegistrarRegistry,
    @Inject(PricingService) private pricing: PricingService,
  ) {}
  async tlds(
    page: number,
    pageSize: number,
    search: string,
    registrarId?: string,
  ) {
    const where = {
      extension: { contains: search },
      ...(registrarId ? { registrars: { some: { registrarId } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.db.tld.findMany({
        where,
        include: {
          registrars: { include: { registrar: true } },
          prices: { where: { isActive: true } },
        },
        orderBy: { extension: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.tld.count({ where }),
    ]);
    return exactView({ items, total, page, pageSize });
  }
  async tld(id: string) {
    const tld = await this.db.tld.findUnique({
      where: { id },
      include: {
        registrars: { include: { registrar: true } },
        prices: { orderBy: { effectiveFrom: 'desc' }, take: 50 },
      },
    });
    if (!tld) throw new NotFoundException('Extensão não encontrada');
    return exactView(tld);
  }
  async saveTld(input: z.infer<typeof tldSchema>, actor: string, id?: string) {
    if (normalizeDomain(input.extension) !== input.extension)
      throw new BadRequestException('Configure a extensão em Punycode');
    if (input.extension === 'cv' && input.isActive)
      throw new BadRequestException(
        '.cv não está disponível para registo nesta fase',
      );
    const registrar = await this.db.registrar.findUnique({
      where: { id: input.registrarId },
    });
    if (!registrar) throw new BadRequestException('Fornecedor inválido');
    const existing = id
      ? await this.db.tld.findUnique({ where: { id } })
      : null;
    if (id && !existing) throw new NotFoundException('Extensão não encontrada');
    if (existing && existing.extension !== input.extension)
      throw new BadRequestException('A extensão é imutável');
    const {
      extension,
      displayName,
      isActive,
      isFeatured,
      registrarId,
      ...link
    } = input;
    return this.db.$transaction(async (tx) => {
      const tld = id
        ? await tx.tld.update({
            where: { id },
            data: { displayName, isActive, isFeatured },
          })
        : await tx.tld.create({
            data: { extension, displayName, isActive, isFeatured },
          });
      await tx.tldRegistrar.upsert({
        where: { tldId_registrarId: { tldId: tld.id, registrarId } },
        create: { ...link, tldId: tld.id, registrarId, isActive },
        update: { ...link, isActive },
      });
      await this.audit.record(
        'catalog.tld_updated',
        'Tld',
        actor,
        tld.id,
        undefined,
        { status: isActive ? 'ACTIVE' : 'DISABLED' },
        tx,
      );
      return tld;
    });
  }
  async savePrice(input: z.infer<typeof priceSchema>, actor: string) {
    const link = await this.db.tldRegistrar.findUnique({
      where: {
        tldId_registrarId: {
          tldId: input.tldId,
          registrarId: input.registrarId,
        },
      },
    });
    if (
      !link ||
      input.periodYears < link.minimumPeriod ||
      input.periodYears > link.maximumPeriod
    )
      throw new BadRequestException('Período ou fornecedor inválido');
    if (new Date(input.effectiveUntil) <= new Date())
      throw new BadRequestException('A validade deve estar no futuro');
    const rate = await this.pricing.rate(
      input.supplierCurrency,
      input.currency,
    );
    const data = {
      ...input,
      marginValue: new Prisma.Decimal(input.marginValue),
      supplierCostMinor: BigInt(input.supplierCostMinor),
      minimumPriceMinor: BigInt(input.minimumPriceMinor),
      additionalCostMinor: BigInt(input.additionalCostMinor),
      roundingIncrementMinor: BigInt(input.roundingIncrementMinor),
      effectiveUntil: new Date(input.effectiveUntil),
    };
    const sellingPriceMinor = BigInt(
      calculatePrice(input.supplierCostMinor, rate.rate, data),
    );
    return exactView(
      await this.db.$transaction(async (tx) => {
        const scope =
          input.tldId + input.registrarId + input.periodYears + input.currency;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
        await tx.tldPrice.updateMany({
          where: {
            tldId: input.tldId,
            registrarId: input.registrarId,
            periodYears: input.periodYears,
            currency: input.currency,
            operation: 'REGISTER',
            isActive: true,
          },
          data: { isActive: false },
        });
        const price = await tx.tldPrice.create({
          data: { ...data, sellingPriceMinor },
        });
        await this.audit.record(
          'pricing.version_created',
          'TldPrice',
          actor,
          price.id,
          undefined,
          {
            sellingPriceMinor: sellingPriceMinor.toString(),
            currency: input.currency,
            marginType: input.marginType,
            marginValue: input.marginValue,
          },
          tx,
        );
        return price;
      }),
    );
  }
  async prices(page: number, pageSize: number, registrarId?: string) {
    const where = { isActive: true, ...(registrarId ? { registrarId } : {}) };
    const [items, total] = await Promise.all([
      this.db.tldPrice.findMany({
        where,
        include: { tld: true, registrar: true },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.db.tldPrice.count({ where }),
    ]);
    return exactView({
      items: items.map((p) => ({
        ...p,
        isStale: p.effectiveUntil <= new Date(),
      })),
      total,
      page,
      pageSize,
    });
  }
  async exchangeRates() {
    return exactView(
      await this.db.exchangeRate.findMany({
        orderBy: { fetchedAt: 'desc' },
        take: 100,
      }),
    );
  }
  async saveRate(input: z.infer<typeof exchangeRateSchema>, actor: string) {
    if (new Date(input.expiresAt) <= new Date())
      throw new BadRequestException('Taxa expirada');
    return exactView(
      await this.db.$transaction(async (tx) => {
        const rate = await tx.exchangeRate.create({
          data: {
            ...input,
            source: 'MANUAL: ' + input.source,
            expiresAt: new Date(input.expiresAt),
          },
        });
        await this.audit.record(
          'pricing.exchange_rate_created',
          'ExchangeRate',
          actor,
          rate.id,
          undefined,
          { source: rate.source, rate: input.rate },
          tx,
        );
        return rate;
      }),
    );
  }
  async registrars() {
    const list = await this.db.registrar.findMany({ orderBy: { code: 'asc' } });
    return list.map((r) => ({
      ...r,
      configured:
        r.code === 'openprovider' && this.runtime.env.OPENPROVIDER_ENABLED,
      environment:
        r.code === 'openprovider'
          ? this.runtime.env.OPENPROVIDER_BASE_URL
          : null,
    }));
  }
  async syncCatalog(actor: string) {
    const registrar = await this.db.registrar.findUnique({
      where: { code: 'openprovider' },
    });
    if (!registrar)
      throw new UnprocessableEntityException('Execute o seed do catálogo');
    try {
      const supported = await this.registry
        .get(registrar.code)
        .getSupportedTlds();
      await this.db.$transaction(
        async (tx) => {
          for (const t of supported) {
            const extension = normalizeDomain(t.extension);
            if (extension === 'cv') continue;
            const tld = await tx.tld.upsert({
              where: { extension },
              create: {
                extension,
                displayName: '.' + extension,
                isActive: false,
              },
              update: {},
            });
            await tx.tldRegistrar.upsert({
              where: {
                tldId_registrarId: { tldId: tld.id, registrarId: registrar.id },
              },
              create: {
                tldId: tld.id,
                registrarId: registrar.id,
                minimumPeriod: t.minimumPeriod,
                maximumPeriod: t.maximumPeriod,
                supportsRegistration: t.supportsRegistration,
                supportsTransfer: t.supportsTransfer,
                supportsRenewal: t.supportsRenewal,
                lastSyncedAt: new Date(),
                isActive: false,
              },
              update: {
                minimumPeriod: t.minimumPeriod,
                maximumPeriod: t.maximumPeriod,
                supportsRegistration: t.supportsRegistration,
                supportsTransfer: t.supportsTransfer,
                supportsRenewal: t.supportsRenewal,
                lastSyncedAt: new Date(),
              },
            });
          }
          await tx.registrar.update({
            where: { id: registrar.id },
            data: { lastSyncedAt: new Date(), lastErrorCode: null },
          });
          await this.audit.record(
            'catalog.synced',
            'Registrar',
            actor,
            registrar.id,
            undefined,
            { count: supported.length },
            tx,
          );
        },
        { timeout: 60000 },
      );
      return { count: supported.length };
    } catch (e) {
      const code = e instanceof RegistrarError ? e.code : 'SYNC_FAILED';
      await this.db.registrar.update({
        where: { id: registrar.id },
        data: { lastErrorCode: code },
      });
      throw new UnprocessableEntityException(
        'Sincronização indisponível: ' + code,
      );
    }
  }
  async syncPrice(priceId: string, actor: string) {
    const price = await this.db.tldPrice.findUnique({
      where: { id: priceId },
      include: { tld: true, registrar: true },
    });
    if (!price) throw new NotFoundException('Preço não encontrado');
    try {
      const supplier = await this.registry
        .get(price.registrar.code)
        .getTldPricing({
          extension: price.tld.extension,
          periodYears: price.periodYears,
        });
      return this.savePrice(
        {
          tldId: price.tldId,
          registrarId: price.registrarId,
          periodYears: price.periodYears,
          supplierCurrency: supplier.cost.currency,
          currency: price.currency as 'CVE' | 'EUR' | 'USD',
          supplierCostMinor: supplier.cost.minor,
          marginType: price.marginType,
          marginValue: price.marginValue.toString(),
          minimumPriceMinor: price.minimumPriceMinor.toString(),
          additionalCostMinor: price.additionalCostMinor.toString(),
          roundingIncrementMinor: price.roundingIncrementMinor.toString(),
          effectiveUntil: price.effectiveUntil.toISOString(),
        },
        actor,
      );
    } catch (e) {
      if (e instanceof RegistrarError)
        throw new UnprocessableEntityException(
          'Sincronização indisponível: ' + e.code,
        );
      throw e;
    }
  }
}
