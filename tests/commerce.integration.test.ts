import 'reflect-metadata';
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  vi,
} from 'vitest';
import type { INestApplication } from '@nestjs/common';
import supertest from 'supertest';
import { randomBytes } from 'node:crypto';
import { hash, argon2id } from '../apps/api/node_modules/argon2';
import { Prisma } from '@devtrust/database';
import { createApp } from '../apps/api/src/bootstrap';
import { DatabaseService } from '../apps/api/src/common/database.service';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
import { RegistrarRegistry } from '../apps/api/src/modules/registrars/registrar-registry.service';
import type { RegistrarProvider } from '../apps/api/src/modules/registrars/domain/registrar-provider.interface';
import { RegistrarError } from '../apps/api/src/modules/registrars/domain/registrar.types';
import { PricingService } from '../apps/api/src/modules/pricing/pricing.service';
import { digest } from '../apps/api/src/common/crypto';
let app: INestApplication,
  db: DatabaseService,
  runtime: RuntimeService,
  pricing: PricingService,
  registry: RegistrarRegistry;
let registrarId: string, tldId: string, adminId: string, customerId: string;
const origin = process.env.APP_URL!,
  password = randomBytes(24).toString('hex');
const agent = () => supertest.agent(app.getHttpServer());
type Agent = ReturnType<typeof agent>;
let admin: Agent, customer: Agent, adminCsrf: string, customerCsrf: string;
const cookie = (response: supertest.Response, name: string) =>
  (response.headers['set-cookie'] as unknown as string[])
    .find((c) => c.startsWith(name + '='))!
    .split(';')[0]
    .split('=')[1];
function mutation(
  a: Agent,
  path: string,
  body: object = {},
  method: 'post' | 'patch' | 'delete' = 'post',
  csrf?: string,
  guest = false,
) {
  let req = a[method]('/api/v1' + path)
    .set('Origin', origin)
    .send(body);
  if (csrf) req = req.set(guest ? 'X-Cart-CSRF-Token' : 'X-CSRF-Token', csrf);
  return req;
}
const provider: RegistrarProvider = {
  providerCode: 'contract-test',
  checkAvailability: vi.fn(
    async (request: Parameters<RegistrarProvider['checkAvailability']>[0]) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return request.domains.map((d) => ({
        domainName: d.domainName,
        status:
          d.name === 'occupied'
            ? ('REGISTERED' as const)
            : ('AVAILABLE' as const),
        isPremium: d.name === 'premium',
        checkedAt: new Date().toISOString(),
      }));
    },
  ),
  getTldPricing: vi.fn(
    async (request: Parameters<RegistrarProvider['getTldPricing']>[0]) => ({
      cost: {
        minor: (
          (request.name === 'premium' ? 100000n : 1000n) *
          BigInt(request.periodYears)
        ).toString(),
        currency: 'CVE' as const,
      },
      isPremium: request.name === 'premium',
    }),
  ),
  getSupportedTlds: vi.fn(async () => []),
};
async function auth(email: string) {
  const a = agent(),
    res = await mutation(a, '/auth/login', { email, password });
  expect(res.status).toBe(200);
  return { a, csrf: cookie(res, 'dt_csrf') };
}
async function adminSession(userId: string) {
  const token = randomBytes(32).toString('hex'),
    csrf = randomBytes(32).toString('hex');
  await db.session.create({
    data: {
      userId,
      tokenHash: digest(token),
      csrfHash: digest(csrf),
      expiresAt: new Date(Date.now() + 3600000),
      mfaVerified: true,
    },
  });
  const a = agent();
  a.jar.setCookie('dt_session=' + token);
  return { a, csrf };
}
beforeAll(async () => {
  if (
    process.env.NODE_ENV !== 'test' ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test') ||
    !process.env.REDIS_URL?.endsWith('/1')
  )
    throw new Error('Isolated test environment required');
  app = await createApp();
  db = app.get(DatabaseService);
  runtime = app.get(RuntimeService);
  pricing = app.get(PricingService);
  registry = app.get(RegistrarRegistry);
  await db.$executeRawUnsafe(
    'TRUNCATE "CartItem", "Cart", "DomainSearchLog", "ExchangeRate", "TldPrice", "TldRegistrar", "Tld", "Registrar" CASCADE',
  );
  const registrar = await db.registrar.create({
    data: {
      code: 'contract-test',
      name: 'CONTRACT TEST ONLY',
      status: 'ACTIVE',
      configurationReference: 'tests:mock',
    },
  });
  registrarId = registrar.id;
  for (const extension of ['com', 'co.uk']) {
    const t = await db.tld.create({
      data: {
        extension,
        displayName: 'TEST .' + extension,
        isActive: true,
        isFeatured: true,
        registrars: {
          create: {
            registrarId,
            isActive: true,
            supportsRegistration: true,
            maximumPeriod: 3,
          },
        },
      },
    });
    if (extension === 'com') tldId = t.id;
    for (const periodYears of [1, 2, 3])
      await db.tldPrice.create({
        data: {
          tldId: t.id,
          registrarId,
          periodYears,
          supplierCurrency: 'CVE',
          currency: 'CVE',
          supplierCostMinor: 1000n * BigInt(periodYears),
          sellingPriceMinor: 1200n * BigInt(periodYears),
          marginType: 'MARKUP',
          marginValue: new Prisma.Decimal(20),
          effectiveUntil: new Date(Date.now() + 86400000),
        },
      });
  }
  const passwordHash = await hash(password, { type: argon2id });
  const adminUser = await db.user.create({
    data: {
      email: 'commerce-admin-' + Date.now() + '@example.test',
      passwordHash,
      firstName: 'Admin',
      lastName: 'Test',
      globalRole: 'ADMIN',
    },
  });
  adminId = adminUser.id;
  const user = await db.user.create({
    data: {
      email: 'commerce-customer-' + Date.now() + '@example.test',
      passwordHash,
      firstName: 'Customer',
      lastName: 'Test',
    },
  });
  customerId = user.id;
  ({ a: admin, csrf: adminCsrf } = await adminSession(adminId));
  ({ a: customer, csrf: customerCsrf } = await auth(user.email));
  vi.spyOn(registry, 'get').mockReturnValue(provider);
});
beforeEach(async () => {
  vi.mocked(provider.checkAvailability).mockClear();
  for (const pattern of ['rate:*', 'domain:rate:*', 'domains:raw:*']) {
    const keys = await runtime.redis.keys(pattern);
    if (keys.length) await runtime.redis.del(...keys);
  }
});
afterAll(async () => {
  vi.restoreAllMocks();
  await app?.close();
});
describe('Phase 2 catalog, real Redis cache and security', () => {
  it('publishes only customer prices without supplier costs', async () => {
    const res = await agent().get('/api/v1/tlds');
    expect(res.status).toBe(200);
    expect(res.body[0].price.currency).toBe('CVE');
    expect(JSON.stringify(res.body)).not.toContain('supplierCost');
  });
  it('batches extensions, maps real contract responses and caches raw availability', async () => {
    const a = agent();
    const first = await mutation(a, '/domains/check', {
      query: 'Brand',
      extensions: ['com', 'co.uk'],
    });
    expect(first.status).toBe(200);
    expect(first.body).toHaveLength(2);
    expect(first.body[0].quote.priceMinor).toBe('1200');
    expect(first.body[0].cacheHit).toBe(false);
    const second = await mutation(a, '/domains/check', {
      query: 'brand',
      extensions: ['com', 'co.uk'],
    });
    expect(second.body[0].cacheHit).toBe(true);
    expect(provider.checkAvailability).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(second.body)).not.toContain('supplierCost');
  });
  it('coalesces concurrent requests to prevent a stampede', async () => {
    const requests = await Promise.all(
      Array.from({ length: 4 }, () =>
        mutation(agent(), '/domains/check', {
          query: 'stampede',
          extensions: ['com'],
        }),
      ),
    );
    expect(requests.every((r) => r.status === 200)).toBe(true);
    expect(provider.checkAvailability).toHaveBeenCalledTimes(1);
  });
  it('handles occupied and premium independently', async () => {
    const occupied = await mutation(agent(), '/domains/check', {
      query: 'occupied.com',
    });
    expect(occupied.body[0]).toMatchObject({
      status: 'REGISTERED',
      quote: null,
      isPremium: false,
    });
    const premium = await mutation(agent(), '/domains/check', {
      query: 'premium.com',
    });
    expect(premium.body[0]).toMatchObject({
      status: 'AVAILABLE',
      isPremium: true,
      quote: { priceMinor: '120000' },
    });
  });
  it('maps supplier failures to UNKNOWN, never AVAILABLE', async () => {
    vi.mocked(provider.checkAvailability).mockRejectedValueOnce(
      new RegistrarError('PROVIDER_TIMEOUT'),
    );
    const res = await mutation(agent(), '/domains/check', {
      query: 'timeout.com',
    });
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({
      status: 'UNKNOWN',
      quote: null,
      errorCode: 'PROVIDER_TIMEOUT',
    });
  });
  it('fails safely when Openprovider is disabled without credentials', async () => {
    const actual = new (
      await import('../apps/api/src/modules/registrars/providers/openprovider/openprovider.provider')
    ).OpenproviderProvider(
      new (
        await import('../apps/api/src/modules/registrars/providers/openprovider/openprovider.auth')
      ).OpenproviderAuth(
        runtime,
        new (
          await import('../apps/api/src/modules/registrars/providers/openprovider/openprovider.client')
        ).OpenproviderClient(runtime),
      ),
      new (
        await import('../apps/api/src/modules/registrars/providers/openprovider/openprovider.client')
      ).OpenproviderClient(runtime),
    );
    await expect(
      actual.checkAvailability({
        domains: [
          { name: 'disabled', extension: 'com', domainName: 'disabled.com' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_DISABLED' });
  });
  it.each([
    { query: 'https://127.0.0.1/admin' },
    { query: 'a.invalid' },
    { query: 'a'.repeat(64) + '.com' },
    { query: 'a', extensions: ['com'], unitPriceMinor: '1' },
    { query: 'a', extensions: Array(11).fill('com') },
  ])('rejects malformed, unsupported or abusive payload %j', async (body) => {
    expect((await mutation(agent(), '/domains/check', body)).status).toBe(400);
  });
  it('rate limits searches independently of general API requests', async () => {
    await runtime.redis.set(
      'domain:rate:' + digest('::ffff:127.0.0.1'),
      String(runtime.env.DOMAIN_SEARCHES_PER_MINUTE),
      'EX',
      60,
    );
    await runtime.redis.set(
      'domain:rate:' + digest('127.0.0.1'),
      String(runtime.env.DOMAIN_SEARCHES_PER_MINUTE),
      'EX',
      60,
    );
    expect(
      (await mutation(agent(), '/domains/check', { query: 'limited.com' }))
        .status,
    ).toBe(429);
  });
  it('blocks customer catalog administration', async () => {
    expect((await customer.get('/api/v1/admin/tlds')).status).toBe(403);
    expect(
      (await mutation(customer, '/admin/pricing', {}, 'post', customerCsrf))
        .status,
    ).toBe(403);
  });
  it('creates, edits and filters TLDs with audit', async () => {
    const created = await mutation(
      admin,
      '/admin/tlds',
      { extension: 'net', displayName: '.net', registrarId, isActive: false },
      'post',
      adminCsrf,
    );
    expect(created.status).toBe(201);
    const id = created.body.id;
    expect(
      (
        await mutation(
          admin,
          '/admin/tlds/' + id,
          {
            extension: 'net',
            displayName: 'Network',
            registrarId,
            isActive: false,
            isFeatured: true,
          },
          'patch',
          adminCsrf,
        )
      ).status,
    ).toBe(200);
    const res = await admin.get(
      '/api/v1/admin/tlds?search=net&registrarId=' + registrarId,
    );
    expect(res.body.total).toBe(1);
    expect(
      await db.auditLog.count({
        where: { resourceId: id, action: 'catalog.tld_updated' },
      }),
    ).toBe(2);
  });
  it('syncs only supported catalog contracts, keeps new extensions inactive and enforces system permission', async () => {
    const r = await db.registrar.create({
      data: {
        code: 'openprovider',
        name: 'Openprovider contract fixture',
        status: 'ACTIVE',
        configurationReference: 'tests:mock',
      },
    });
    vi.mocked(provider.getSupportedTlds).mockResolvedValueOnce([
      {
        extension: 'org',
        minimumPeriod: 1,
        maximumPeriod: 5,
        supportsRegistration: true,
        supportsTransfer: true,
        supportsRenewal: true,
      },
    ]);
    expect(
      (
        await mutation(
          admin,
          '/admin/registrars/openprovider/sync',
          {},
          'post',
          adminCsrf,
        )
      ).status,
    ).toBe(403);
    await db.user.update({
      where: { id: adminId },
      data: { globalRole: 'SUPER_ADMIN' },
    });
    try {
      const res = await mutation(
        admin,
        '/admin/registrars/openprovider/sync',
        {},
        'post',
        adminCsrf,
      );
      expect(res.status).toBe(201);
      expect(res.body.count).toBe(1);
      const tld = await db.tld.findUniqueOrThrow({
        where: { extension: 'org' },
        include: { registrars: true },
      });
      expect(tld.isActive).toBe(false);
      expect(tld.registrars[0].maximumPeriod).toBe(5);
      expect(
        (await db.registrar.findUniqueOrThrow({ where: { id: r.id } }))
          .lastSyncedAt,
      ).not.toBeNull();
    } finally {
      await db.user.update({
        where: { id: adminId },
        data: { globalRole: 'ADMIN' },
      });
    }
  });
  it('prevents duplicate extension and invalid period relationships', async () => {
    await expect(
      db.tld.create({ data: { extension: 'com', displayName: 'Duplicate' } }),
    ).rejects.toThrow();
    await expect(
      db.tldRegistrar.updateMany({
        where: { tldId },
        data: { minimumPeriod: 4, maximumPeriod: 1 },
      }),
    ).rejects.toThrow();
  });
  it('versions manual commercial prices and audits the change', async () => {
    const res = await mutation(
      admin,
      '/admin/pricing',
      {
        tldId,
        registrarId,
        periodYears: 1,
        supplierCurrency: 'CVE',
        currency: 'CVE',
        supplierCostMinor: '1000',
        marginType: 'MARKUP',
        marginValue: '30',
        effectiveUntil: new Date(Date.now() + 86400000).toISOString(),
      },
      'post',
      adminCsrf,
    );
    expect(res.status).toBe(201);
    expect(res.body.sellingPriceMinor).toBe('1300');
    expect(
      await db.tldPrice.count({
        where: { tldId, periodYears: 1, isActive: true },
      }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: { resourceId: res.body.id, action: 'pricing.version_created' },
      }),
    ).toBe(1);
  });
  it('blocks missing/expired exchange rates and prices', async () => {
    await expect(pricing.rate('EUR', 'CVE')).rejects.toThrow('Taxa');
    const rate = await mutation(
      admin,
      '/admin/exchange-rates',
      {
        baseCurrency: 'EUR',
        targetCurrency: 'CVE',
        rate: '110.265',
        source: 'CONTRACT TEST ONLY',
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
      'post',
      adminCsrf,
    );
    expect(rate.status).toBe(201);
    expect((await pricing.rate('EUR', 'CVE')).rate).toBe('110.265');
    await db.exchangeRate.update({
      where: { id: rate.body.id },
      data: {
        fetchedAt: new Date(Date.now() - 10000),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expect(pricing.rate('EUR', 'CVE')).rejects.toThrow('Taxa');
    const price = await db.tldPrice.findFirstOrThrow({
      where: { tldId, periodYears: 3, isActive: true },
    });
    await db.tldPrice.update({
      where: { id: price.id },
      data: {
        effectiveFrom: new Date(Date.now() - 10000),
        effectiveUntil: new Date(Date.now() - 1000),
      },
    });
    await expect(pricing.quote(tldId, registrarId, 3)).rejects.toThrow('Preço');
    await db.tldPrice.update({
      where: { id: price.id },
      data: { effectiveUntil: new Date(Date.now() + 86400000) },
    });
  });
  it('reports database-derived metrics and sanitized technical history', async () => {
    const res = await admin.get('/api/v1/admin/domain-search/metrics');
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(await db.domainSearchLog.count());
    expect(res.body.cacheHits).toBeGreaterThan(0);
    expect(res.body.externalErrors).toBeGreaterThan(0);
    const history = await admin.get(
      '/api/v1/admin/domain-search/logs?pageSize=2',
    );
    expect(history.status).toBe(200);
    expect(history.body.items).toHaveLength(2);
    expect(history.body.total).toBe(res.body.total);
    const log = await db.domainSearchLog.findFirstOrThrow();
    expect(log).not.toHaveProperty('ipAddress');
  });
});
describe('Commerce retention worker', () => {
  it('removes old technical history and expired carts while preserving current rows', async () => {
    const { pruneCommerce } = await import('../apps/worker/src/maintenance');
    const old = await db.domainSearchLog.create({
      data: {
        normalizedQuery: 'retention.com',
        extension: 'com',
        registrarCode: 'contract-test',
        status: 'UNKNOWN',
        cacheHit: false,
        responseTimeMs: 1,
        createdAt: new Date(Date.now() - 40 * 86400000),
      },
    });
    const expired = await db.cart.create({
      data: {
        sessionIdentifier: digest(randomBytes(32).toString('hex')),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const fresh = await db.domainSearchLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 86400000) } },
    });
    const removed = await pruneCommerce(db, 30);
    expect(removed.searches).toBe(1);
    expect(
      await db.domainSearchLog.findUnique({ where: { id: old.id } }),
    ).toBeNull();
    expect(await db.cart.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await db.domainSearchLog.count()).toBe(fresh);
  });
});
describe('Persistent guest/customer carts and server-only quotes', () => {
  let guest: Agent, guestCsrf: string, itemId: string;
  it('initializes secure guest identity with HttpOnly cookie and separate CSRF', async () => {
    guest = agent();
    const res = await guest.get('/api/v1/cart');
    expect(res.status).toBe(200);
    guestCsrf = cookie(res, 'dt_cart_csrf');
    expect(
      (res.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('dt_cart='),
      ),
    ).toContain('HttpOnly');
    expect(
      await db.cart.findUnique({ where: { id: res.body.id } }),
    ).not.toHaveProperty('token');
    expect(
      (await mutation(guest, '/cart/items', { domainName: 'cart.com' })).status,
    ).toBe(403);
  });
  it('adds, persists and prevents duplicate items', async () => {
    const first = await mutation(
      guest,
      '/cart/items',
      { domainName: 'cart.com' },
      'post',
      guestCsrf,
      true,
    );
    expect(first.status).toBe(201);
    itemId = first.body.items[0].id;
    expect(first.body.items).toHaveLength(1);
    expect(first.body.subtotalMinor).toBe('1300');
    const duplicate = await mutation(
      guest,
      '/cart/items',
      { domainName: 'CART.COM' },
      'post',
      guestCsrf,
      true,
    );
    expect(duplicate.body.items).toHaveLength(1);
    expect((await guest.get('/api/v1/cart')).body.items[0].id).toBe(itemId);
    expect(JSON.stringify(first.body)).not.toContain('supplierCost');
  });
  it('updates period by rechecking provider and recalculates total', async () => {
    const res = await mutation(
      guest,
      '/cart/items/' + itemId,
      { registrationYears: 2 },
      'patch',
      guestCsrf,
      true,
    );
    expect(res.status).toBe(200);
    expect(res.body.subtotalMinor).toBe('2400');
    expect(provider.checkAvailability).toHaveBeenCalledTimes(1);
  });
  it('rejects client-supplied price/currency and unavailable domains', async () => {
    expect(
      (
        await mutation(
          guest,
          '/cart/items',
          { domainName: 'manipulate.com', unitPriceMinor: '1' },
          'post',
          guestCsrf,
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await mutation(
          guest,
          '/cart/items',
          { domainName: 'occupied.com' },
          'post',
          guestCsrf,
          true,
        )
      ).status,
    ).toBe(409);
  });
  it('quotes premium independently without registering or buying it', async () => {
    const res = await mutation(
      guest,
      '/cart/items',
      { domainName: 'premium.com' },
      'post',
      guestCsrf,
      true,
    );
    expect(res.status).toBe(201);
    expect(
      res.body.items.find((i: { isPremium: boolean }) => i.isPremium)
        .unitPriceMinor,
    ).toBe('130000');
  });
  it('isolates cart items across guests and authenticated users', async () => {
    const other = agent(),
      res = await other.get('/api/v1/cart'),
      csrf = cookie(res, 'dt_cart_csrf');
    expect(
      (await mutation(other, '/cart/items/' + itemId, {}, 'delete', csrf, true))
        .status,
    ).toBe(404);
    expect(
      (
        await mutation(
          customer,
          '/cart/items/' + itemId,
          { registrationYears: 1 },
          'patch',
          customerCsrf,
        )
      ).status,
    ).toBe(404);
  });
  it('marks expired quotes and requires explicit revalidation', async () => {
    await db.cartItem.update({
      where: { id: itemId },
      data: { quoteExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await guest.get('/api/v1/cart')).body.requiresRevalidation).toBe(
      true,
    );
    expect(
      (
        await mutation(
          guest,
          '/cart/items/' + itemId,
          { registrationYears: 2 },
          'patch',
          guestCsrf,
          true,
        )
      ).body.requiresRevalidation,
    ).toBe(false);
  });
  it('merges a guest cart on login without leaking guest access', async () => {
    const user = await db.user.findUniqueOrThrow({ where: { id: customerId } });
    const login = await mutation(guest, '/auth/login', {
      email: user.email,
      password,
    });
    expect(login.status).toBe(200);
    const cart = await guest.get('/api/v1/cart');
    expect(cart.body.items).toHaveLength(2);
    expect(
      (await db.cart.findUniqueOrThrow({ where: { id: cart.body.id } })).userId,
    ).toBe(customerId);
    itemId = cart.body.items.find(
      (i: { domainName: string }) => i.domainName === 'cart.com',
    ).id;
    customerCsrf = cookie(login, 'dt_csrf');
    customer = guest;
  });
  it('removes and clears owned items', async () => {
    expect(
      (
        await mutation(
          customer,
          '/cart/items/' + itemId,
          {},
          'delete',
          customerCsrf,
        )
      ).body.items,
    ).toHaveLength(1);
    expect(
      (await mutation(customer, '/cart', {}, 'delete', customerCsrf)).body
        .items,
    ).toHaveLength(0);
  });
  it('rejects mutations after cart expiry and resets on a fresh read', async () => {
    const cart = await db.cart.findUniqueOrThrow({
      where: { userId: customerId },
    });
    await db.cart.update({
      where: { id: cart.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(
      (
        await mutation(
          customer,
          '/cart/items',
          { domainName: 'expired.com' },
          'post',
          customerCsrf,
        )
      ).status,
    ).toBe(410);
    expect((await customer.get('/api/v1/cart')).body.items).toHaveLength(0);
  });
});
