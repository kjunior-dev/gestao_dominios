import {Inject, Injectable} from '@nestjs/common';
import {z} from 'zod/v3';
import {RegistrarProvider} from '../../domain/registrar-provider.interface';
import {
    AvailabilityRequest,
    AvailabilityResult,
    PricingRequest,
    RegistrarPricing,
    SupportedTld,
    RegistrarError,
} from '../../domain/registrar.types';
import {OpenproviderAuth} from './openprovider.auth';
import {OpenproviderClient} from './openprovider.client';
import {
    checkDataSchema,
    priceDataSchema,
    supportedTldSchema,
    moneySchema,
} from './openprovider.types';
import {mapStatus, supplierMoney} from './openprovider.mapper';

@Injectable()
export class OpenproviderProvider implements RegistrarProvider {
    readonly providerCode = 'openprovider';

    constructor(
        @Inject(OpenproviderAuth) private auth: OpenproviderAuth,
        @Inject(OpenproviderClient) private client: OpenproviderClient,
    ) {
    }

    private async call(path: string, method: 'GET' | 'POST', body?: unknown) {
        const token = await this.auth.token();
        try {
            return await this.client.send(path, method, body, token);
        } catch (e) {
            if (!(e instanceof RegistrarError) || e.code !== 'PROVIDER_AUTH') throw e;
            await this.auth.invalidate(token);
            return this.client.send(path, method, body, await this.auth.token());
        }
    }

    async checkAvailability(
        request: AvailabilityRequest,
    ): Promise<AvailabilityResult[]> {
        // IDN scripts may differ per TLD. Group before batch calls; never infer language.
        const groups = new Map<string, typeof request.domains>();
        for (const domain of request.domains) {
            const script = domain.idnScript || '';
            groups.set(script, [...(groups.get(script) || []), domain]);
        }
        const mapped: AvailabilityResult[] = [];
        for (const [script, domains] of groups) {
            const raw = await this.call('/domains/check', 'POST', {
                domains: domains.map((d) => ({name: d.name, extension: d.extension})),
                with_price: true,
                ...(script ? {additional_data: {idn_script: script}} : {}),
            });
            const parsed = checkDataSchema.safeParse(raw);
            if (!parsed.success)
                throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
            for (const domain of domains) {
                const matches = parsed.data.results.filter(
                    (r) => r.domain.toLowerCase() === domain.domainName,
                );
                const result = matches.length === 1 ? matches[0] : undefined;
                mapped.push({
                    domainName: domain.domainName,
                    status: result ? mapStatus(result.status) : 'UNKNOWN',
                    isPremium: result?.is_premium ?? false,
                    checkedAt: new Date().toISOString(),
                    ...(result?.is_premium && result.premium
                        ? {
                            premiumCost: supplierMoney(
                                result.premium.price.create,
                                result.premium.currency,
                            ),
                        }
                        : {}),
                });
            }
        }
        return mapped;
    }

    async getTldPricing(request: PricingRequest): Promise<RegistrarPricing> {
        if (request.name) {
            const query = new URLSearchParams({
                'domain.name': request.name,
                'domain.extension': request.extension,
                operation: 'create',
                period: String(request.periodYears),
                ...(request.idnScript
                    ? {'additional_data.idn_script': request.idnScript}
                    : {}),
            });
            const parsed = priceDataSchema.safeParse(
                await this.call('/domains/prices?' + query, 'GET'),
            );
            if (!parsed.success)
                throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
            return {
                cost: supplierMoney(
                    parsed.data.price.reseller.price,
                    parsed.data.price.reseller.currency,
                ),
                isPremium: parsed.data.is_premium,
            };
        }
        const schema = z.object({
            min_period: z.coerce.number().int(),
            prices: z.object({create_price: z.object({reseller: moneySchema})}),
        });
        const parsed = schema.safeParse(
            await this.call(
                '/tlds/' + encodeURIComponent(request.extension) + '?with_price=true',
                'GET',
            ),
        );
        if (!parsed.success) throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
        if (request.periodYears !== parsed.data.min_period)
            throw new RegistrarError('CAPABILITY_UNSUPPORTED');
        const price = parsed.data.prices.create_price.reseller;
        return {
            cost: supplierMoney(price.price, price.currency),
            isPremium: false,
        };
    }

    async getSupportedTlds(): Promise<SupportedTld[]> {
        const results: SupportedTld[] = [];
        for (let offset = 0; offset < 10000; offset += 100) {
            const parsed = z
                .object({
                    results: z.array(supportedTldSchema),
                    total: z.coerce.number().int(),
                })
                .safeParse(
                    await this.call(
                        '/tlds?limit=100&offset=' + offset + '&status=ACT',
                        'GET',
                    ),
                );
            if (!parsed.success)
                throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
            for (const t of parsed.data.results)
                results.push({
                    extension: t.name,
                    minimumPeriod: t.min_period,
                    maximumPeriod: t.max_period,
                    supportsRegistration: t.status === 'ACT',
                    supportsTransfer: t.transfer_available ?? false,
                    supportsRenewal: t.renew_available ?? false,
                });
            if (offset + parsed.data.results.length >= parsed.data.total)
                return results;
            if (parsed.data.results.length === 0)
                throw new RegistrarError('PROVIDER_INVALID_RESPONSE');
        }
        throw new RegistrarError('PROVIDER_CATALOG_LIMIT');
    }
}
