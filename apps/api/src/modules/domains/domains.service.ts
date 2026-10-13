import {
  Inject,
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod/v3';
import {
  domainCheckSchema,
  DomainResult,
  PublicTld,
} from '@devtrust/contracts';
import { DatabaseService } from '../../common/database.service';
import { RuntimeService } from '../../common/runtime.service';
import { digest } from '../../common/crypto';
import { RegistrarRegistry } from '../registrars/registrar-registry.service';
import { RegistrarError } from '../registrars/domain/registrar.types';
import { PricingService } from '../pricing/pricing.service';
import { AvailabilityCache } from './availability-cache.service';
import { parseDomains } from './domain-name';
@Injectable()
export class DomainsService {
  constructor(
    @Inject(DatabaseService) private db: DatabaseService,
    @Inject(RuntimeService) private runtime: RuntimeService,
    @Inject(RegistrarRegistry) private registry: RegistrarRegistry,
    @Inject(PricingService) private pricing: PricingService,
    @Inject(AvailabilityCache) private cache: AvailabilityCache,
  ) {}
  async throttle(ip: string) {
    const count = Number(
      await this.runtime.redis.eval(
        "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],60) end;return n",
        1,
        'domain:rate:' + digest(ip),
      ),
    );
    if (count > this.runtime.env.DOMAIN_SEARCHES_PER_MINUTE)
      throw new HttpException(
        'Limite de pesquisas atingido. Tente mais tarde.',
        429,
      );
  }
  private catalog() {
    return this.db.tld.findMany({
      where: {
        isActive: true,
        registrars: {
          some: {
            isActive: true,
            supportsRegistration: true,
            registrar: { status: 'ACTIVE' },
          },
        },
      },
      include: {
        registrars: {
          where: {
            isActive: true,
            supportsRegistration: true,
            registrar: { status: 'ACTIVE' },
          },
          include: { registrar: true },
          orderBy: { priority: 'asc' },
        },
      },
      orderBy: [{ isFeatured: 'desc' }, { extension: 'asc' }],
      take: 200,
    });
  }
  async publicCatalog(): Promise<PublicTld[]> {
    const list = await this.catalog();
    return Promise.all(
      list.map(async (t) => {
        const link = t.registrars[0];
        let price = null;
        try {
          price = (
            await this.pricing.quote(t.id, link.registrarId, link.minimumPeriod)
          ).quote;
        } catch {
          /* No valid published quote. */
        }
        return {
          id: t.id,
          extension: t.extension,
          displayName: t.displayName,
          isFeatured: t.isFeatured,
          minimumPeriod: link.minimumPeriod,
          maximumPeriod: link.maximumPeriod,
          price,
        };
      }),
    );
  }
  async search(
    input: z.infer<typeof domainCheckSchema>,
    userId?: string,
    force = false,
  ) {
    const catalog = await this.catalog();
    if (!catalog.length)
      throw new ServiceUnavailableException(
        'A pesquisa de domínios ainda não está disponível.',
      );
    const parts = parseDomains(
      input.query,
      input.extensions,
      catalog.map((t) => t.extension),
    );
    const groups = new Map<string, typeof parts>();
    for (const p of parts) {
      const t = catalog.find((t) => t.extension === p.extension)!,
        link = t.registrars[0];
      if (
        input.registrationYears < link.minimumPeriod ||
        input.registrationYears > link.maximumPeriod
      )
        throw new BadRequestException(
          'Período não suportado para .' + p.extension,
        );
      p.idnScript = link.idnScript;
      groups.set(link.registrar.code, [
        ...(groups.get(link.registrar.code) || []),
        p,
      ]);
    }
    const results: DomainResult[] = [];
    for (const [registrarCode, domains] of groups) {
      const started = Date.now();
      let checked: Awaited<ReturnType<AvailabilityCache['check']>> = [],
        failure: string | null = null;
      try {
        checked = await this.cache.check(
          this.registry.get(registrarCode),
          domains,
          force,
        );
      } catch (e) {
        failure = e instanceof RegistrarError ? e.code : 'SEARCH_UNAVAILABLE';
      }
      for (const p of domains) {
        const t = catalog.find((t) => t.extension === p.extension)!,
          link = t.registrars[0],
          raw = checked.find((x) => x.result.domainName === p.domainName);
        const result: DomainResult = {
          domainName: p.domainName,
          tldId: t.id,
          extension: p.extension,
          registrarCode,
          status: raw?.result.status || 'UNKNOWN',
          isPremium: raw?.result.isPremium ?? false,
          cacheHit: raw?.cacheHit ?? false,
          checkedAt: raw?.result.checkedAt || new Date().toISOString(),
          quote: null,
          errorCode: failure,
        };
        let snapshot: Record<string, unknown> | null = null;
        if (result.status === 'AVAILABLE')
          try {
            const price = await this.registry.get(registrarCode).getTldPricing({
              extension: p.extension,
              name: p.name,
              periodYears: input.registrationYears,
              idnScript: p.idnScript,
            });
            result.isPremium = result.isPremium || price.isPremium;
            const commercial = await this.pricing.quote(
              t.id,
              link.registrarId,
              input.registrationYears,
              price.cost,
            );
            result.quote = commercial.quote;
            snapshot = commercial.snapshot;
          } catch (e) {
            result.errorCode =
              e instanceof RegistrarError ? e.code : 'PRICE_UNAVAILABLE';
          }
        if (result.status === 'UNKNOWN' && !result.errorCode)
          result.errorCode = 'PROVIDER_UNKNOWN_STATUS';
        await this.db.domainSearchLog.create({
          data: {
            userId,
            normalizedQuery: p.domainName,
            extension: p.extension,
            registrarCode,
            status: result.status,
            isPremium: result.isPremium,
            cacheHit: result.cacheHit,
            responseTimeMs: Date.now() - started,
            errorCode: result.errorCode,
          },
        });
        results.push(result);
        if (force && domains.length === 1 && parts.length === 1)
          return { results, snapshots: new Map([[p.domainName, snapshot]]) };
      }
    }
    return {
      results,
      snapshots: new Map<string, Record<string, unknown> | null>(),
    };
  }
  async metrics() {
    const since = new Date(
      Date.now() - this.runtime.env.DOMAIN_LOG_RETENTION_DAYS * 86400000,
    );
    const where = { createdAt: { gte: since } },
      total = await this.db.domainSearchLog.count({ where });
    const [success, cacheHits, errors, timing, extensions] = await Promise.all([
      this.db.domainSearchLog.count({
        where: { ...where, status: { not: 'UNKNOWN' } },
      }),
      this.db.domainSearchLog.count({ where: { ...where, cacheHit: true } }),
      this.db.domainSearchLog.count({
        where: { ...where, errorCode: { startsWith: 'PROVIDER_' } },
      }),
      this.db.domainSearchLog.aggregate({
        where,
        _avg: { responseTimeMs: true },
      }),
      this.db.domainSearchLog.groupBy({
        by: ['extension'],
        where,
        _count: true,
        orderBy: { _count: { extension: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      total,
      success,
      cacheHits,
      externalErrors: errors,
      averageResponseTimeMs: timing._avg.responseTimeMs || 0,
      successRate: total ? success / total : 0,
      cacheHitRate: total ? cacheHits / total : 0,
      retentionDays: this.runtime.env.DOMAIN_LOG_RETENTION_DAYS,
      extensions,
    };
  }
}
