import { Inject, Injectable } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import { RuntimeService } from '../../common/runtime.service';
import { digest, randomToken } from '../../common/crypto';
import { RegistrarProvider } from '../registrars/domain/registrar-provider.interface';
import {
  AvailabilityResult,
  DomainParts,
  RegistrarError,
} from '../registrars/domain/registrar.types';
@Injectable()
export class AvailabilityCache {
  constructor(@Inject(RuntimeService) private runtime: RuntimeService) {}
  private key(provider: RegistrarProvider, domain: DomainParts) {
    return (
      'domains:raw:v1:' +
      digest(
        JSON.stringify({
          provider: provider.providerCode,
          environment: this.runtime.env.OPENPROVIDER_BASE_URL,
          domain: domain.domainName,
          script: domain.idnScript || '',
        }),
      )
    );
  }
  async check(
    provider: RegistrarProvider,
    domains: DomainParts[],
    force = false,
  ): Promise<{ result: AvailabilityResult; cacheHit: boolean }[]> {
    if (
      provider.providerCode === 'openprovider' &&
      !this.runtime.env.OPENPROVIDER_ENABLED
    )
      throw new RegistrarError('PROVIDER_DISABLED');
    const started = Date.now();
    const r = this.runtime.redis,
      enabled = this.runtime.env.DOMAIN_CACHE_ENABLED;
    const output = new Map<
      string,
      { result: AvailabilityResult; cacheHit: boolean }
    >();
    const owned: { domain: DomainParts; key: string; owner: string }[] = [];
    const waiting: DomainParts[] = [];
    try {
      for (const domain of domains) {
        const key = this.key(provider, domain),
          cached = enabled && !force ? await r.get(key) : null;
        if (cached) {
          output.set(domain.domainName, {
            result: JSON.parse(cached),
            cacheHit: true,
          });
          continue;
        }
        const owner = randomToken();
        if (!enabled || (await r.set(key + ':lock', owner, 'PX', 100000, 'NX')))
          owned.push({ domain, key, owner });
        else waiting.push(domain);
      }
      if (owned.length) {
        const results = await provider.checkAvailability({
          domains: owned.map((x) => x.domain),
        });
        for (const { domain, key } of owned) {
          const result = results.find(
            (x) => x.domainName === domain.domainName,
          ) || {
            domainName: domain.domainName,
            status: 'UNKNOWN' as const,
            isPremium: false,
            checkedAt: new Date().toISOString(),
          };
          output.set(domain.domainName, { result, cacheHit: false });
          if (enabled && result.status !== 'UNKNOWN')
            await r.set(
              key,
              JSON.stringify(result),
              'EX',
              result.status === 'AVAILABLE'
                ? this.runtime.env.DOMAIN_AVAILABLE_TTL_SECONDS
                : this.runtime.env.DOMAIN_UNAVAILABLE_TTL_SECONDS,
            );
        }
      }
      for (const domain of waiting) {
        const key = this.key(provider, domain);
        let result: AvailabilityResult | undefined;
        for (let n = 0; n < 350; n++) {
          if (!(await r.exists(key + ':lock'))) {
            const raw = await r.get(key);
            if (raw) result = JSON.parse(raw);
            break;
          }
          await delay(100);
        }
        if (force && result && new Date(result.checkedAt).getTime() < started)
          result = undefined;
        if (!result) throw new RegistrarError('PROVIDER_BUSY');
        output.set(domain.domainName, { result, cacheHit: !force });
      }
      return domains.map((d) => output.get(d.domainName)!);
    } finally {
      for (const { key, owner } of owned)
        if (enabled)
          await r.eval(
            "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end;return 0",
            1,
            key + ':lock',
            owner,
          );
    }
  }
}
