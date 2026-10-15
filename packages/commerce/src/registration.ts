import type { DomainContact } from '@devtrust/database';
import { Prisma } from '@devtrust/database';
import {
  OpenproviderAuth,
  OpenproviderClient,
  RegistrarError,
  checkDataSchema,
  priceDataSchema,
} from '@devtrust/registrars';
import { z } from 'zod/v3';
import { assertRegistration, CommerceConfig, CommerceError } from './config';
export type RegistrarContactRequest = DomainContact;
export type RegistrarContactResult = { handle: string };
export type RegistrarRegistrationRequest = {
  domainName: string;
  name: string;
  extension: string;
  years: number;
  handle: string;
  nameservers: string[];
  isPremium: boolean;
  maximumSupplierCostMinor: string;
  supplierCurrency: string;
  idempotencyKey: string;
};
export type RegistrarRegistrationResult = {
  id: string;
  status: 'ACTIVE' | 'PENDING' | 'UNKNOWN';
  registeredAt?: Date;
  expiresAt?: Date;
};
export type RegistrarDomainStatus = RegistrarRegistrationResult;
export type RegistrationLookupRequest = {
  domainName: string;
  idempotencyKey: string;
};
export interface DomainRegistrationProvider {
  createContact(r: RegistrarContactRequest): Promise<RegistrarContactResult>;
  registerDomain(
    r: RegistrarRegistrationRequest,
  ): Promise<RegistrarRegistrationResult>;
  getDomainStatus(id: string): Promise<RegistrarDomainStatus>;
  findExistingRegistration(
    r: RegistrationLookupRequest,
  ): Promise<RegistrarRegistrationResult | null>;
  check(r: RegistrarRegistrationRequest): Promise<{
    available: boolean;
    costMinor: string;
    currency: string;
    isPremium: boolean;
  }>;
}
const externalId = z
  .union([z.string().regex(/^\d+$/), z.number().int().positive()])
  .transform(String);
const domainSchema = z.object({
  id: externalId,
  status: z.string(),
  comments: z.string().optional(),
  creation_date: z.string().optional(),
  expiration_date: z.string().optional(),
  domain: z.object({ name: z.string(), extension: z.string() }).optional(),
});
function date(value?: string) {
  if (!value || value.startsWith('0000')) return undefined;
  const d = new Date(value.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? undefined : d;
}
function mapDomain(raw: unknown): RegistrarRegistrationResult {
  const d = domainSchema.parse(raw);
  return {
    id: d.id,
    status:
      d.status === 'ACT'
        ? 'ACTIVE'
        : ['REQ', 'PRE', 'REG', 'PEN'].includes(d.status)
          ? 'PENDING'
          : 'UNKNOWN',
    registeredAt: date(d.creation_date),
    expiresAt: date(d.expiration_date),
  };
}
export class OpenproviderRegistrationProvider implements DomainRegistrationProvider {
  constructor(
    private config: CommerceConfig,
    private auth: OpenproviderAuth,
    private client: OpenproviderClient,
  ) {}
  private async read(
    path: string,
    method: 'GET' | 'POST' = 'GET',
    body?: unknown,
  ) {
    let token = await this.auth.token();
    try {
      return await this.client.send(path, method, body, token);
    } catch (e) {
      if (
        !(e instanceof RegistrarError) ||
        e.code !== 'PROVIDER_TOKEN_REJECTED'
      )
        throw e;
      await this.auth.invalidate(token);
      token = await this.auth.token();
      try {
        return await this.client.send(path, method, body, token);
      } catch (second) {
        if (
          second instanceof RegistrarError &&
          second.code === 'PROVIDER_TOKEN_REJECTED'
        )
          await this.auth.invalidate(token);
        throw second;
      }
    }
  }
  private async write(path: string, body: unknown) {
    const environment =
      this.config.DOMAIN_REGISTRATION_MODE === 'sandbox' ? 'SANDBOX' : 'LIVE';
    assertRegistration(this.config, environment);
    return this.client.send(path, 'POST', body, await this.auth.token(), {
      environment,
      approved: false,
    });
  }
  async createContact(r: RegistrarContactRequest) {
    const raw = await this.write('/customers', {
      name: {
        first_name: r.firstName,
        last_name: r.lastName,
        initials: r.firstName[0] + r.lastName[0],
      },
      email: r.email,
      ...(r.companyName ? { company_name: r.companyName } : {}),
      address: {
        street: r.address,
        number: r.addressNumber,
        city: r.city,
        state: r.region || '',
        zipcode: r.postalCode,
        country: r.countryCode,
      },
      phone: {
        country_code: r.phoneCountryCode,
        area_code: '',
        subscriber_number: r.phone,
      },
      comments: 'DevTrust contact ' + r.id,
    });
    return z.object({ handle: z.string().min(1).max(100) }).parse(raw);
  }
  async registerDomain(r: RegistrarRegistrationRequest) {
    const cost = BigInt(r.maximumSupplierCostMinor);
    const fee =
      (cost / 100n).toString() +
      '.' +
      (cost % 100n).toString().padStart(2, '0');
    const raw = await this.write('/domains', {
      domain: { name: r.name, extension: r.extension },
      period: r.years,
      owner_handle: r.handle,
      admin_handle: r.handle,
      tech_handle: r.handle,
      billing_handle: r.handle,
      name_servers: r.nameservers.map((name) => ({ name })),
      ...(r.isPremium ? { accept_premium_fee: fee } : {}),
      autorenew: 'off',
      is_private_whois_enabled: false,
      is_spamexperts_enabled: false,
      is_sectigo_dns_enabled: false,
      is_easy_dmarc_enabled: false,
      comments: r.idempotencyKey,
    });
    const d = z.object({ id: externalId }).parse(raw);
    return this.getDomainStatus(d.id);
  }
  async getDomainStatus(id: string) {
    if (!/^\d+$/.test(id))
      throw new CommerceError('INVALID_REGISTRAR_REFERENCE');
    return mapDomain(await this.read('/domains/' + id));
  }
  async findExistingRegistration(r: RegistrationLookupRequest) {
    const result = z
      .object({ results: z.array(domainSchema), total: z.coerce.number() })
      .parse(
        await this.read(
          '/domains?' +
            new URLSearchParams({ full_name: r.domainName, limit: '100' }),
        ),
      );
    const matches = result.results.filter(
      (d) =>
        d.domain &&
        d.domain.name + '.' + d.domain.extension === r.domainName &&
        d.comments === r.idempotencyKey,
    );
    if (matches.length !== 1) return null;
    return mapDomain(matches[0]);
  }
  async check(r: RegistrarRegistrationRequest) {
    const availability = checkDataSchema.parse(
      await this.read('/domains/check', 'POST', {
        domains: [{ name: r.name, extension: r.extension }],
        with_price: true,
      }),
    );
    const match = availability.results.find((d) => d.domain === r.domainName);
    const quote = priceDataSchema.parse(
      await this.read(
        '/domains/prices?' +
          new URLSearchParams({
            'domain.name': r.name,
            'domain.extension': r.extension,
            operation: 'create',
            period: String(r.years),
          }),
      ),
    );
    const minor = new Prisma.Decimal(quote.price.reseller.price).mul(100);
    if (!minor.isInteger()) throw new CommerceError('INVALID_SUPPLIER_PRICE');
    return {
      available: match?.status === 'free',
      costMinor: minor.toFixed(0),
      currency: quote.price.reseller.currency,
      isPremium: quote.is_premium || Boolean(match?.is_premium),
    };
  }
}
export class MockRegistrationProvider implements DomainRegistrationProvider {
  private records = new Map<string, RegistrarRegistrationResult>();
  constructor(private config: CommerceConfig) {}
  async createContact(r: RegistrarContactRequest) {
    assertRegistration(this.config, 'MOCK');
    return { handle: 'mock-contact-' + r.id };
  }
  async check(r: RegistrarRegistrationRequest) {
    assertRegistration(this.config, 'MOCK');
    return {
      available: true,
      costMinor: r.maximumSupplierCostMinor,
      currency: r.supplierCurrency,
      isPremium: r.isPremium,
    };
  }
  async registerDomain(r: RegistrarRegistrationRequest) {
    assertRegistration(this.config, 'MOCK');
    const existing = this.records.get(r.idempotencyKey);
    if (existing) return existing;
    const result: RegistrarRegistrationResult = {
      id: 'mock-domain-' + r.idempotencyKey,
      status: 'ACTIVE',
      registeredAt: new Date(),
      expiresAt: new Date(Date.now() + r.years * 365 * 86400000),
    };
    this.records.set(r.idempotencyKey, result);
    return result;
  }
  async getDomainStatus(id: string) {
    const found = [...this.records.values()].find((d) => d.id === id);
    if (!found) throw new CommerceError('MOCK_DOMAIN_UNKNOWN');
    return found;
  }
  async findExistingRegistration(r: RegistrationLookupRequest) {
    return this.records.get(r.idempotencyKey) || null;
  }
}
