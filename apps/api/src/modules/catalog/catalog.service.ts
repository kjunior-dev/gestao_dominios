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
  supplierPriceRequestSchema,
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
  async supplierCost(input: z.infer<typeof supplierPriceRequestSchema>) {
    const link = await this.db.tldRegistrar.findUnique({
      where: {
        tldId_registrarId: {
          tldId: input.tldId,
          registrarId: input.registrarId,
        },
      },
      include: { tld: true, registrar: true },
    });
    if (
      !link ||
      input.periodYears < link.minimumPeriod ||
      input.periodYears > link.maximumPeriod
    )
      throw new BadRequestException('Período ou fornecedor inválido');
    try {
      const supplier = await this.registry
        .get(link.registrar.code)
        .getTldPricing({
          extension: link.tld.extension,
          periodYears: input.periodYears,
          operation: input.operation,
        });
      if (supplier.isPremium)
        throw new RegistrarError('INVALID_STANDARD_PRICE');
      return {
        supplierCostMinor: supplier.cost.minor,
        supplierCurrency: supplier.cost.currency,
        fetchedAt: new Date().toISOString(),
      };
    } catch (e) {
      const code = e instanceof RegistrarError ? e.code : 'PRICE_SYNC_FAILED';
      throw new UnprocessableEntityException({
        code,
        message:
          'Custo indisponível: ' +
          code +
          '. Para períodos sem preço standard, configure um custo manual verificado.',
      });
    }
  }
  async savePrice(
    input: z.infer<typeof priceSchema>,
    actor: string,
    isActive = true,
    syncSourceId?: string,
  ) {
    let syncedAt: Date | null = null;
    if (input.costSource === 'API') {
      const supplier = await this.supplierCost(input);
      input = {
        ...input,
        supplierCostMinor: supplier.supplierCostMinor,
        supplierCurrency: supplier.supplierCurrency,
      };
      syncedAt = new Date(supplier.fetchedAt);
    }
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
      manualSellingPriceMinor:
        input.manualSellingPriceMinor == null
          ? null
          : BigInt(input.manualSellingPriceMinor),
      lastSyncAttemptAt: syncedAt,
      lastSyncedAt: syncedAt,
      marginValue: new Prisma.Decimal(input.marginValue),
      supplierCostMinor: BigInt(input.supplierCostMinor),
      minimumPriceMinor: BigInt(input.minimumPriceMinor),
      additionalCostMinor: BigInt(input.additionalCostMinor),
      roundingIncrementMinor: BigInt(input.roundingIncrementMinor),
      effectiveUntil: new Date(input.effectiveUntil),
    };
    const sellingPriceMinor = BigInt(
      input.manualSellingPriceMinor ??
        calculatePrice(input.supplierCostMinor, rate.rate, data),
    );
    return exactView(
      await this.db.$transaction(async (tx) => {
        const scope =
          input.tldId +
          input.registrarId +
          input.operation +
          input.periodYears +
          input.currency;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
        const publishActive = syncSourceId
          ? (
              await tx.tldPrice.findUniqueOrThrow({
                where: { id: syncSourceId },
              })
            ).isActive
          : isActive;
        if (publishActive)
          await tx.tldPrice.updateMany({
            where: {
              tldId: input.tldId,
              registrarId: input.registrarId,
              periodYears: input.periodYears,
              currency: input.currency,
              operation: input.operation,
              isActive: true,
            },
            data: { isActive: false },
          });
        const price = await tx.tldPrice.create({
          data: { ...data, sellingPriceMinor, isActive: publishActive },
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
            costSource: input.costSource,
            changeReason: input.changeReason ?? null,
            manualSellingPriceMinor: input.manualSellingPriceMinor ?? null,
            operation: input.operation,
          },
          tx,
        );
        return price;
      }),
    );
  }
  async prices(page: number, pageSize: number, registrarId?: string) {
    const where = { ...(registrarId ? { registrarId } : {}) };
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
  async setPriceState(id: string, isActive: boolean, actor: string) {
    return exactView(
      await this.db.$transaction(async (tx) => {
        const price = await tx.tldPrice.findUnique({ where: { id } });
        if (!price) throw new NotFoundException('Preço não encontrado');
        const scope =
          price.tldId +
          price.registrarId +
          price.operation +
          price.periodYears +
          price.currency;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scope},0))`;
        if (isActive && price.effectiveUntil <= new Date())
          throw new BadRequestException('Renove a validade antes de ativar');
        if (isActive) {
          await this.pricing.rate(price.supplierCurrency, price.currency);
          await tx.tldPrice.updateMany({
            where: {
              tldId: price.tldId,
              registrarId: price.registrarId,
              operation: price.operation,
              periodYears: price.periodYears,
              currency: price.currency,
              isActive: true,
            },
            data: { isActive: false },
          });
        }
        const updated = await tx.tldPrice.update({
          where: { id },
          data: { isActive },
        });
        await this.audit.record(
          'pricing.state_changed',
          'TldPrice',
          actor,
          id,
          undefined,
          { isActive },
          tx,
        );
        return updated;
      }),
    );
  }
  async syncPrice(priceId: string, actor: string) {
    const price = await this.db.tldPrice.findUnique({ where: { id: priceId } });
    if (!price) throw new NotFoundException('Preço não encontrado');
    await this.db.tldPrice.update({
      where: { id: priceId },
      data: { lastSyncAttemptAt: new Date() },
    });
    try {
      const result = await this.savePrice(
        {
          tldId: price.tldId,
          registrarId: price.registrarId,
          periodYears: price.periodYears,
          operation: price.operation,
          costSource: 'API',
          currency: 'CVE',
          supplierCurrency: price.supplierCurrency as 'CVE' | 'EUR' | 'USD',
          supplierCostMinor: price.supplierCostMinor.toString(),
          marginType: price.marginType,
          marginValue: price.marginValue.toString(),
          minimumPriceMinor: price.minimumPriceMinor.toString(),
          additionalCostMinor: price.additionalCostMinor.toString(),
          roundingIncrementMinor: price.roundingIncrementMinor.toString(),
          manualSellingPriceMinor:
            price.manualSellingPriceMinor?.toString() ?? null,
          changeReason: price.changeReason ?? undefined,
          effectiveUntil: price.effectiveUntil.toISOString(),
        },
        actor,
        price.isActive,
        priceId,
      );
      await this.db.tldPrice.update({
        where: { id: priceId },
        data: { lastSyncedAt: new Date(), lastSyncErrorCode: null },
      });
      return result;
    } catch (e) {
      const response =
        e instanceof UnprocessableEntityException ? e.getResponse() : null;
      const code =
        e instanceof RegistrarError
          ? e.code
          : response && typeof response === 'object' && 'code' in response
            ? String(response.code)
            : 'PRICE_SYNC_FAILED';
      await this.db.tldPrice.update({
        where: { id: priceId },
        data: { lastSyncErrorCode: code },
      });
      throw e;
    }
  }
}
