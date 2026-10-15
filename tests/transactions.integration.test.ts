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
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  CommerceProcessor,
  MockPaymentProvider,
  MockRegistrationProvider,
  createCommerceQueues,
  createCommerceWorkers,
  publishOutbox,
} from '../packages/commerce/src';
import { createApp } from '../apps/api/src/bootstrap';
import { DatabaseService } from '../apps/api/src/common/database.service';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
import { RegistrarRegistry } from '../apps/api/src/modules/registrars/registrar-registry.service';
import { PaymentsService } from '../apps/api/src/modules/payments/payments.service';
import { digest } from '../apps/api/src/common/crypto';
let app: INestApplication,
  db: DatabaseService,
  runtime: RuntimeService,
  processor: CommerceProcessor,
  registration: MockRegistrationProvider;
let customerId: string,
  orgId: string,
  contactId: string,
  tldId: string,
  customerCookie: string,
  otherCookie: string,
  adminCookie: string;
const csrf = randomBytes(32).toString('hex'),
  origin = process.env.APP_URL!,
  namespace = randomUUID();
let cost = '1000',
  available = true,
  premium = false;
const req = (
  method: 'get' | 'post' | 'patch',
  path: string,
  cookie = customerCookie,
  body: object = {},
) => {
  const r = supertest(app.getHttpServer())
    [method]('/api/v1' + path)
    .set('Cookie', cookie)
    .set('Origin', origin);
  return method === 'get' ? r : r.set('X-CSRF-Token', csrf).send(body);
};
async function account(role: 'CUSTOMER' | 'ADMIN') {
  const u = await db.user.create({
      data: {
        email: randomUUID() + '@phase3.test',
        firstName: 'Phase3',
        lastName: 'Contract',
        passwordHash: 'isolated-unused-hash',
        globalRole: role,
        emailVerifiedAt: new Date(),
      },
    }),
    token = randomBytes(32).toString('hex');
  await db.session.create({
    data: {
      userId: u.id,
      tokenHash: digest(token),
      csrfHash: digest(csrf),
      expiresAt: new Date(Date.now() + 86400000),
      mfaVerified: role === 'ADMIN',
    },
  });
  return { id: u.id, cookie: 'dt_session=' + token };
}
beforeAll(async () => {
  if (
    process.env.NODE_ENV !== 'test' ||
    !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test') ||
    !process.env.REDIS_URL?.endsWith('/1')
  )
    throw new Error('Requires isolated test database and Redis 1');
  app = await createApp();
  db = app.get(DatabaseService);
  runtime = app.get(RuntimeService);
  await db.$executeRawUnsafe(
    'TRUNCATE "CartItem", "Cart", "Tld", "Registrar", "DomainContact", "Order", "ManagedDomain", "CommerceOutbox" CASCADE',
  );
  const c = await account('CUSTOMER'),
    o = await account('CUSTOMER'),
    a = await account('ADMIN');
  customerId = c.id;
  customerCookie = c.cookie;
  otherCookie = o.cookie;
  adminCookie = a.cookie;
  const org = await db.organization.create({
    data: {
      name: 'Phase3 Contract',
      slug: 'phase3-' + namespace,
      type: 'INDIVIDUAL',
      members: { create: { userId: customerId, role: 'OWNER' } },
    },
  });
  orgId = org.id;
  const registrar = await db.registrar.create({
    data: {
      code: 'phase3-contract',
      name: 'MOCK ONLY',
      configurationReference: 'tests:phase3',
      status: 'ACTIVE',
    },
  });
  const tld = await db.tld.create({
    data: {
      extension: 'phase3test',
      displayName: 'CONTRACT TEST ONLY',
      isActive: true,
      registrars: {
        create: {
          registrarId: registrar.id,
          isActive: true,
          supportsRegistration: true,
          minimumPeriod: 1,
          maximumPeriod: 3,
          registrationPolicy: { approved: true, requiresAdditionalData: false },
        },
      },
    },
  });
  tldId = tld.id;
  await db.tldPrice.create({
    data: {
      tldId,
      registrarId: registrar.id,
      periodYears: 1,
      supplierCurrency: 'CVE',
      currency: 'CVE',
      supplierCostMinor: 1000n,
      sellingPriceMinor: 1200n,
      marginType: 'MARKUP',
      marginValue: '20',
      effectiveUntil: new Date(Date.now() + 86400000),
    },
  });
  contactId = (
    await db.domainContact.create({
      data: {
        organizationId: orgId,
        firstName: 'Contract',
        lastName: 'Owner',
        email: 'contact@phase3.test',
        phone: '9999999',
        phoneCountryCode: '+238',
        address: 'Test street',
        addressNumber: '1',
        city: 'Praia',
        postalCode: '7600',
        countryCode: 'CV',
      },
    })
  ).id;
  const registry = app.get(RegistrarRegistry);
  registry.get = () => ({
    providerCode: 'phase3-contract',
    async checkAvailability({ domains }) {
      return domains.map((d) => ({
        domainName: d.domainName,
        status: available ? 'AVAILABLE' : 'REGISTERED',
        isPremium: premium,
        checkedAt: new Date().toISOString(),
      }));
    },
    async getTldPricing() {
      return { cost: { minor: cost, currency: 'CVE' }, isPremium: premium };
    },
    async getSupportedTlds() {
      return [];
    },
  });
});
beforeEach(async () => {
  vi.restoreAllMocks();
  cost = '1000';
  available = true;
  premium = false;
  runtime.env.DOMAIN_REGISTRATION_MODE = 'mock';
  await db.$executeRawUnsafe(
    'TRUNCATE "Order", "ManagedDomain", "CommerceOutbox", "RegistrarContactMapping" CASCADE',
  );
  await db.cartItem.deleteMany();
  for (const key of await runtime.redis.keys('rate:*'))
    await runtime.redis.del(key);
  for (const key of await runtime.redis.keys('domain:rate:*'))
    await runtime.redis.del(key);
  for (const key of await runtime.redis.keys('domains:raw:*'))
    await runtime.redis.del(key);
  const config = {
    ...runtime.env,
    MOCK_WEBHOOK_SECRET:
      runtime.env.MOCK_WEBHOOK_SECRET ||
      digest('mock-webhook:' + runtime.env.TOTP_ENCRYPTION_KEY),
  };
  registration = new MockRegistrationProvider(config);
  processor = new CommerceProcessor(
    db,
    runtime.redis,
    config,
    new MockPaymentProvider(config, db),
    registration,
    runtime.logger,
  );
});
afterAll(async () => {
  if (app) await app.close();
});
const checkoutBody = () => ({
  organizationId: orgId,
  contactId,
  nameservers: ['ns1.example.test', 'ns2.example.test'],
  billing: {
    legalName: 'Contract customer',
    address: 'Test street 1',
    city: 'Praia',
    postalCode: '7600',
    countryCode: 'CV',
  },
  acceptTerms: true,
  termsVersion: runtime.env.CHECKOUT_TERMS_VERSION,
  acceptPremium: premium,
  idempotencyKey: randomUUID(),
});
async function cart(name = 'contract') {
  const quote = await req('post', '/domains/check', customerCookie, {
    query: name + '.phase3test',
  });
  expect(
    (
      await req('post', '/cart/items', customerCookie, {
        domainName: name + '.phase3test',
        registrationYears: 1,
        quoteToken: quote.body[0].quote.quoteToken,
        acceptPremium: premium,
      })
    ).status,
  ).toBe(201);
}
async function order() {
  await cart();
  const r = await req('post', '/checkout', customerCookie, checkoutBody());
  expect(r.status).toBe(201);
  return r.body as { id: string };
}
async function payment() {
  const o = await order(),
    p = await req('post', '/payments', customerCookie, {
      orderId: o.id,
      provider: 'mock',
    });
  expect(p.status).toBe(201);
  return {
    orderId: o.id,
    id: p.body.id as string,
    reference: p.body.providerPaymentId as string,
  };
}
async function drain() {
  for (let round = 0; round < 10; round++) {
    const rows = await db.commerceOutbox.findMany({
      where: { completedAt: null, topic: { not: 'email-notifications' } },
      orderBy: { createdAt: 'asc' },
    });
    if (!rows.length) return;
    for (const row of rows) await processor.process({ outboxId: row.id });
  }
}
async function paid() {
  const p = await payment();
  expect(
    (
      await req('post', '/payments/' + p.id + '/mock-confirm', customerCookie, {
        outcome: 'PAID',
      })
    ).status,
  ).toBe(201);
  const e = await db.paymentEvent.findFirstOrThrow({
    where: { paymentId: p.id },
  });
  await processor.confirm(e.id);
  return p;
}
describe('Checkout and ownership', () => {
  it('persists a quote, billing and audited transitions without frontend prices', async () => {
    const o = await order(),
      r = await req('get', '/orders/' + o.id);
    expect(r.body).toMatchObject({
      status: 'PENDING_PAYMENT',
      totalMinor: '1200',
      environment: 'MOCK',
    });
    expect(r.body.items[0]).not.toHaveProperty('supplierCostMinor');
    expect(r.body.items[0]).not.toHaveProperty('quoteSnapshot');
    expect(
      await db.billingProfile.count({ where: { organizationId: orgId } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({ where: { resourceId: o.id } }),
    ).toBeGreaterThan(0);
  });
  it('rejects empty carts and expired quotes', async () => {
    expect(
      (await req('post', '/checkout', customerCookie, checkoutBody())).status,
    ).toBe(409);
    await cart();
    await db.cartItem.updateMany({ data: { quoteExpiresAt: new Date(0) } });
    expect(
      (await req('post', '/checkout', customerCookie, checkoutBody())).status,
    ).toBe(409);
    expect(await db.order.count()).toBe(0);
  });
  it('blocks changed prices and unavailable domains', async () => {
    await cart();
    cost = '2000';
    expect(
      (await req('post', '/checkout', customerCookie, checkoutBody())).status,
    ).toBe(409);
    cost = '1000';
    available = false;
    expect(
      (await req('post', '/checkout', customerCookie, checkoutBody())).status,
    ).toBe(503);
    expect(await db.order.count()).toBe(0);
  });
  it('prevents price injection and access to another organization/contact', async () => {
    await cart();
    expect(
      (
        await req('post', '/checkout', customerCookie, {
          ...checkoutBody(),
          totalMinor: '1',
        })
      ).status,
    ).toBe(400);
    expect(
      (await req('post', '/checkout', otherCookie, checkoutBody())).status,
    ).toBe(403);
    expect(
      (
        await req('post', '/checkout', customerCookie, {
          ...checkoutBody(),
          contactId: randomUUID(),
        })
      ).status,
    ).toBe(409);
  });
  it('is idempotent after cart consumption and detects conflicting reuse', async () => {
    await cart();
    const body = checkoutBody(),
      first = await req('post', '/checkout', customerCookie, body),
      again = await req('post', '/checkout', customerCookie, body);
    expect(again.body.id).toBe(first.body.id);
    expect(await db.order.count()).toBe(1);
    expect(
      (
        await req('post', '/checkout', customerCookie, {
          ...body,
          nameservers: ['ns3.example.test', 'ns4.example.test'],
        })
      ).status,
    ).toBe(409);
  });
  it('rolls back failed checkout transactions and keeps the cart', async () => {
    await cart();
    const spy = vi
      .spyOn(db, '$transaction')
      .mockRejectedValueOnce(new Error('contract transaction failure'));
    expect(
      (await req('post', '/checkout', customerCookie, checkoutBody())).status,
    ).toBe(500);
    spy.mockRestore();
    expect(await db.order.count()).toBe(0);
    expect(await db.cartItem.count()).toBe(1);
  });
  it('rejects account and admin access by an unrelated customer', async () => {
    const o = await order();
    expect((await req('get', '/orders/' + o.id, otherCookie)).status).toBe(404);
    expect((await req('get', '/admin/orders', otherCookie)).status).toBe(403);
    expect(
      (
        await req('post', '/admin/live-approvals', customerCookie, {
          reason: 'Unapproved live operation',
        })
      ).status,
    ).toBe(403);
  });
});
describe('Authenticated payment events and outbox', () => {
  it('confirms payment through persisted events, not browser success parameters', async () => {
    const p = await paid();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status,
    ).toBe('PAID');
    expect(
      await db.commerceOutbox.count({
        where: { topic: 'domain-registration' },
      }),
    ).toBe(1);
    await drain();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status,
    ).toBe('COMPLETED');
    expect(await db.invoice.count({ where: { orderId: p.orderId } })).toBe(1);
  });
  it('records declined payment and never starts registration', async () => {
    const p = await payment();
    await req('post', '/payments/' + p.id + '/mock-confirm', customerCookie, {
      outcome: 'DECLINED',
    });
    await drain();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status,
    ).toBe('FAILED');
    expect(await db.domainOperation.count()).toBe(0);
  });
  it('rejects unsigned webhook, wrong amounts/currency and duplicate conflicts', async () => {
    const p = await payment(),
      service = app.get(PaymentsService),
      data = {
        eventId: randomUUID(),
        externalPaymentId: p.reference,
        orderId: p.orderId,
        amountMinor: '1200',
        currency: 'CVE',
        status: 'PAID',
      },
      timestamp = Math.floor(Date.now() / 1000).toString();
    const webhook = (body: object) => {
      const raw = JSON.stringify(body);
      return supertest(app.getHttpServer())
        .post('/api/v1/payments/webhooks/mock')
        .set('Content-Type', 'application/json')
        .set('X-Payment-Timestamp', timestamp)
        .set(
          'X-Payment-Signature',
          service.provider.sign(Buffer.from(raw), timestamp),
        )
        .send(raw);
    };
    expect(
      (
        await supertest(app.getHttpServer())
          .post('/api/v1/payments/webhooks/mock')
          .send(data)
      ).status,
    ).toBe(401);
    expect((await webhook({ ...data, amountMinor: '1' })).status).toBe(400);
    expect((await webhook({ ...data, currency: 'EUR' })).status).toBe(400);
    expect((await webhook(data)).status).toBe(201);
    expect((await webhook(data)).status).toBe(201);
    expect(await db.paymentEvent.count({ where: { paymentId: p.id } })).toBe(1);
    expect((await webhook({ ...data, status: 'DECLINED' })).status).toBe(409);
  });
  it('ignores a later decline after a verified payment', async () => {
    const p = await paid();
    await req('post', '/payments/' + p.id + '/mock-confirm', customerCookie, {
      outcome: 'DECLINED',
    });
    const events = await db.paymentEvent.findMany({
      where: { paymentId: p.id },
    });
    for (const e of events) await processor.confirm(e.id);
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe('PAID');
  });
  it('routes late paid events to manual review', async () => {
    const p = await payment();
    await db.order.update({
      where: { id: p.orderId },
      data: { expiresAt: new Date(0) },
    });
    await req('post', '/payments/' + p.id + '/mock-confirm', customerCookie, {
      outcome: 'PAID',
    });
    await drain();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status,
    ).toBe('MANUAL_REVIEW');
    expect(await db.domainOperation.count()).toBe(0);
  });
  it('isolates payments and requires authorization for refund decisions', async () => {
    const p = await payment();
    expect((await req('get', '/payments/' + p.id, otherCookie)).status).toBe(
      404,
    );
    expect(
      (
        await req('post', '/payments/' + p.id + '/mock-confirm', otherCookie, {
          outcome: 'PAID',
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await req(
          'post',
          '/admin/refunds/' + randomUUID() + '/decision',
          customerCookie,
          { decision: 'APPROVE', reason: 'Unauthorized approval' },
        )
      ).status,
    ).toBe(403);
  });
});
describe('Registration safety and reconciliation', () => {
  it('keeps paid orders in manual review when registration is disabled', async () => {
    const p = await paid();
    processor.config.DOMAIN_REGISTRATION_MODE = 'disabled';
    await drain();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: p.orderId } })).status,
    ).toBe('MANUAL_REVIEW');
    expect(await db.managedDomain.count()).toBe(0);
  });
  it('does not register occupied domains or increased premium costs', async () => {
    await paid();
    vi.spyOn(registration, 'check').mockResolvedValue({
      available: false,
      costMinor: '1000',
      currency: 'CVE',
      isPremium: false,
    });
    const post = vi.spyOn(registration, 'registerDomain');
    await drain();
    expect(post).not.toHaveBeenCalled();
    expect((await db.domainRegistration.findFirstOrThrow()).status).toBe(
      'FAILED',
    );
  });
  it('blocks any supplier cost above the authorized ceiling', async () => {
    await paid();
    vi.spyOn(registration, 'check').mockResolvedValue({
      available: true,
      costMinor: '1001',
      currency: 'CVE',
      isPremium: true,
    });
    const post = vi.spyOn(registration, 'registerDomain');
    await drain();
    expect(post).not.toHaveBeenCalled();
    expect((await db.domainRegistration.findFirstOrThrow()).lastErrorCode).toBe(
      'SUPPLIER_COST_EXCEEDS_AUTHORIZATION',
    );
  });
  it('requires approved TLD registration rules', async () => {
    await paid();
    await db.tldRegistrar.updateMany({
      where: { tldId },
      data: { registrationPolicy: {} },
    });
    await drain();
    expect((await db.domainRegistration.findFirstOrThrow()).lastErrorCode).toBe(
      'TLD_REGISTRATION_POLICY_REQUIRED',
    );
    await db.tldRegistrar.updateMany({
      where: { tldId },
      data: {
        registrationPolicy: { approved: true, requiresAdditionalData: false },
      },
    });
  });
  it('does not duplicate a contact after an inconclusive result', async () => {
    await paid();
    const create = vi
      .spyOn(registration, 'createContact')
      .mockRejectedValue(new Error('invalid contact or inconclusive timeout'));
    await drain();
    const r = await db.domainRegistration.findFirstOrThrow();
    await processor.register(r.id, false);
    expect(create).toHaveBeenCalledTimes(1);
    expect((await db.registrarContactMapping.findFirstOrThrow()).status).toBe(
      'UNKNOWN',
    );
  });
  it('never repeats an inconclusive registration POST', async () => {
    await paid();
    const post = vi
      .spyOn(registration, 'registerDomain')
      .mockRejectedValue(new Error('timeout or registrar balance rejected'));
    await drain();
    const r = await db.domainRegistration.findFirstOrThrow();
    await processor.register(r.id, false);
    expect(post).toHaveBeenCalledTimes(1);
    expect((await db.domainRegistration.findFirstOrThrow()).status).toBe(
      'MANUAL_REVIEW',
    );
  });
  it('reconciles after success followed by local persistence failure', async () => {
    await paid();
    const post = vi.spyOn(registration, 'registerDomain'),
      finish = vi
        .spyOn(processor, 'finish')
        .mockRejectedValueOnce(
          new Error('database unavailable after external success'),
        );
    const row = await db.commerceOutbox.findFirstOrThrow({
      where: { topic: 'domain-registration' },
    });
    await expect(processor.process({ outboxId: row.id })).rejects.toThrow(
      'database unavailable',
    );
    finish.mockRestore();
    await processor.process({ outboxId: row.id });
    expect(post).toHaveBeenCalledTimes(1);
    expect(await db.managedDomain.count()).toBe(1);
    expect((await db.domainRegistration.findFirstOrThrow()).status).toBe(
      'COMPLETED',
    );
  });
  it('handles pending confirmations without completing the order', async () => {
    await paid();
    vi.spyOn(registration, 'registerDomain').mockResolvedValue({
      id: 'mock-pending',
      status: 'PENDING',
    });
    await drain();
    expect((await db.domainRegistration.findFirstOrThrow()).status).toBe(
      'PENDING',
    );
    expect((await db.order.findFirstOrThrow()).status).toBe('MANUAL_REVIEW');
    expect(await db.managedDomain.count()).toBe(0);
  });
  it('processes repeated registration jobs safely', async () => {
    await paid();
    const post = vi.spyOn(registration, 'registerDomain');
    const row = await db.commerceOutbox.findFirstOrThrow({
      where: { topic: 'domain-registration' },
    });
    await processor.process({ outboxId: row.id });
    await processor.process({ outboxId: row.id });
    expect(post).toHaveBeenCalledTimes(1);
    expect(await db.managedDomain.count()).toBe(1);
  });
});
describe('Refunds, internal receipts and BullMQ', () => {
  it('handles partial refunds and reserves amounts against duplication', async () => {
    const p = await paid();
    processor.config.DOMAIN_REGISTRATION_MODE = 'disabled';
    await drain();
    const body = {
        paymentId: p.id,
        amountMinor: '500',
        reason: 'Contract partial refund',
        idempotencyKey: randomUUID(),
      },
      first = await req('post', '/refunds', customerCookie, body);
    expect(first.status).toBe(201);
    expect((await req('post', '/refunds', customerCookie, body)).body.id).toBe(
      first.body.id,
    );
    expect(
      (
        await req('post', '/refunds', customerCookie, {
          ...body,
          amountMinor: '800',
          idempotencyKey: randomUUID(),
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await req(
          'post',
          '/admin/refunds/' + first.body.id + '/decision',
          adminCookie,
          { decision: 'APPROVE', reason: 'Verified contract refund approval' },
        )
      ).status,
    ).toBe(201);
    await drain();
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: first.body.id } }))
        .status,
    ).toBe('COMPLETED');
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).status,
    ).toBe('PARTIALLY_REFUNDED');
  });
  it('rejects automatic refunds for registered domains and supports rejection', async () => {
    const p = await paid();
    await drain();
    const r = await req('post', '/refunds', customerCookie, {
      paymentId: p.id,
      amountMinor: '1200',
      reason: 'Contract refund requested',
      idempotencyKey: randomUUID(),
    });
    expect(
      (
        await req(
          'post',
          '/admin/refunds/' + r.body.id + '/decision',
          adminCookie,
          { decision: 'APPROVE', reason: 'Contract approval refused' },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await req(
          'post',
          '/admin/refunds/' + r.body.id + '/decision',
          adminCookie,
          { decision: 'REJECT', reason: 'Domain already registered in mock' },
        )
      ).status,
    ).toBe(201);
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: r.body.id } })).status,
    ).toBe('REJECTED');
  });
  it('authorizes receipt downloads and returns actual PDF content', async () => {
    const p = await paid();
    await drain();
    const invoice = await db.invoice.findUniqueOrThrow({
      where: { orderId: p.orderId },
    });
    const pdf = await req('get', '/invoices/' + invoice.id + '/pdf');
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    expect(
      (await req('get', '/invoices/' + invoice.id + '/pdf', otherCookie))
        .status,
    ).toBe(404);
    expect(
      (
        await req(
          'get',
          '/domains/' + (await db.managedDomain.findFirstOrThrow()).id,
          otherCookie,
        )
      ).status,
    ).toBe(403);
  });
  it('publishes persisted intents and processes real isolated BullMQ queues', async () => {
    await payment();
    const queues = createCommerceQueues(runtime.env.REDIS_URL),
      workers = createCommerceWorkers(
        runtime.env.REDIS_URL,
        processor,
        async () => ({ development: true }),
      );
    try {
      await publishOutbox(db, queues);
      let done = false;
      for (let n = 0; n < 50; n++) {
        if (
          (await db.commerceOutbox.count({ where: { completedAt: null } })) ===
          0
        ) {
          done = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(done).toBe(true);
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      for (const q of queues.values()) {
        await q.obliterate({ force: true });
        await q.close();
      }
    }
  });
});

describe('Additional state and authorization boundaries', () => {
  it('requires explicit premium acceptance and supports partial completion', async () => {
    premium = true;
    await cart('premium');
    expect(
      (
        await req('post', '/checkout', customerCookie, {
          ...checkoutBody(),
          acceptPremium: false,
        })
      ).status,
    ).toBe(409);
    premium = false;
    await db.cartItem.deleteMany();
    await cart('partial-first');
    await cart('partial-second');
    const o = await req('post', '/checkout', customerCookie, checkoutBody());
    expect(o.status).toBe(201);
    const p = await req('post', '/payments', customerCookie, {
      orderId: o.body.id,
      provider: 'mock',
    });
    await req(
      'post',
      '/payments/' + p.body.id + '/mock-confirm',
      customerCookie,
      { outcome: 'PAID' },
    );
    const base = registration.check.bind(registration);
    vi.spyOn(registration, 'check').mockImplementation(async (r) =>
      r.domainName.startsWith('partial-second')
        ? {
            available: false,
            costMinor: '1000',
            currency: 'CVE',
            isPremium: false,
          }
        : base(r),
    );
    await drain();
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: o.body.id } })).status,
    ).toBe('PARTIALLY_COMPLETED');
    expect(await db.managedDomain.count()).toBe(1);
  });
  it('does not turn a gateway timeout into a confirmed payment', async () => {
    const p = await payment(),
      row = await db.commerceOutbox.findFirstOrThrow({
        where: { topic: 'payment-reconciliation' },
      });
    vi.spyOn(processor.payment, 'getPaymentStatus').mockRejectedValueOnce(
      new Error('contract gateway timeout'),
    );
    await expect(processor.process({ outboxId: row.id })).rejects.toThrow(
      'contract gateway timeout',
    );
    expect(
      (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).paidAt,
    ).toBeNull();
    expect(
      (await db.commerceOutbox.findUniqueOrThrow({ where: { id: row.id } }))
        .completedAt,
    ).toBeNull();
    expect(await db.domainOperation.count()).toBe(0);
  });
  it('blocks admin operations without MFA and cannot repeat an already submitted registration', async () => {
    await paid();
    await drain();
    const r = await db.domainRegistration.findFirstOrThrow();
    expect(
      (
        await req(
          'post',
          '/admin/registrations/' + r.id + '/resume',
          adminCookie,
          { reason: 'Attempt to duplicate registration' },
        )
      ).status,
    ).toBe(409);
    const token = randomBytes(32).toString('hex');
    const admin = await db.user.findFirstOrThrow({
      where: { globalRole: 'ADMIN', email: { endsWith: '@phase3.test' } },
    });
    await db.session.create({
      data: {
        userId: admin.id,
        tokenHash: digest(token),
        csrfHash: digest(csrf),
        expiresAt: new Date(Date.now() + 60000),
        mfaVerified: false,
      },
    });
    expect(
      (await req('get', '/admin/payments', 'dt_session=' + token)).status,
    ).toBe(403);
  });
  it('restricts MEMBER checkout and protects billing updates', async () => {
    await cart();
    await db.organizationMember.update({
      where: {
        userId_organizationId: { userId: customerId, organizationId: orgId },
      },
      data: { role: 'MEMBER' },
    });
    try {
      expect(
        (await req('post', '/checkout', customerCookie, checkoutBody())).status,
      ).toBe(403);
      expect(
        (
          await req(
            'patch',
            '/billing?organizationId=' + orgId,
            customerCookie,
            checkoutBody().billing,
          )
        ).status,
      ).toBe(403);
    } finally {
      await db.organizationMember.update({
        where: {
          userId_organizationId: { userId: customerId, organizationId: orgId },
        },
        data: { role: 'OWNER' },
      });
    }
  });
  it('returns metrics separated by environment and shows no mock income as live revenue', async () => {
    await paid();
    await drain();
    const metrics = await req('get', '/admin/sales', adminCookie);
    expect(metrics.status).toBe(200);
    expect(metrics.body.received).toHaveLength(1);
    expect(metrics.body.received[0].environment).toBe('MOCK');
    expect(metrics.body.liveAcquisitionCosts).toEqual([]);
    expect(metrics.body.registrations[0].environment).toBe('MOCK');
    expect(metrics.body.completedGrossMargins[0].grossMarginMinor).toBe('200');
  });
});

describe('Recoverable BullMQ failures', () => {
  it('retries a transient payment query without duplicating payments', async () => {
    const paymentRecord = await payment(),
      original = processor.payment.getPaymentStatus.bind(processor.payment);
    const query = vi
      .spyOn(processor.payment, 'getPaymentStatus')
      .mockRejectedValueOnce(new Error('temporary contract gateway failure'))
      .mockImplementation(original);
    const queues = createCommerceQueues(runtime.env.REDIS_URL),
      workers = createCommerceWorkers(
        runtime.env.REDIS_URL,
        processor,
        async () => ({ development: true }),
      );
    try {
      const row = await db.commerceOutbox.findFirstOrThrow({
        where: { topic: 'payment-reconciliation' },
      });
      await publishOutbox(db, queues);
      let completed = false;
      for (let n = 0; n < 80; n++) {
        if (
          (await db.commerceOutbox.findUniqueOrThrow({ where: { id: row.id } }))
            .completedAt
        ) {
          completed = true;
          break;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(completed).toBe(true);
      expect(query).toHaveBeenCalledTimes(2);
      expect(
        await db.payment.count({ where: { orderId: paymentRecord.orderId } }),
      ).toBe(1);
      expect(
        (
          await db.payment.findUniqueOrThrow({
            where: { id: paymentRecord.id },
          })
        ).paidAt,
      ).toBeNull();
    } finally {
      await Promise.all(workers.map((w) => w.close()));
      for (const q of queues.values()) {
        await q.obliterate({ force: true });
        await q.close();
      }
    }
  });
});

describe('Documented permanent registrar rejection', () => {
  it('records insufficient registrar balance without retrying or claiming a refund', async () => {
    const { RegistrarError } = await import('../packages/registrars');
    await paid();
    const post = vi.spyOn(registration, 'registerDomain').mockRejectedValue(
      new RegistrarError('PROVIDER_INSUFFICIENT_BALANCE', false, {
        providerCode: 310,
        httpStatus: 500,
        category: 'response',
      }),
    );
    await drain();
    const reg = await db.domainRegistration.findFirstOrThrow();
    expect(reg.status).toBe('FAILED');
    expect(reg.lastErrorCode).toBe('PROVIDER_INSUFFICIENT_BALANCE');
    await processor.register(reg.id, false);
    expect(post).toHaveBeenCalledTimes(1);
    expect(await db.refund.count()).toBe(0);
    expect(await db.managedDomain.count()).toBe(0);
  });
});

describe('Refund restrictions for inconclusive external operations', () => {
  it('does not authorize refund after a submitted registration remains in manual review', async () => {
    const p = await paid();
    vi.spyOn(registration, 'registerDomain').mockRejectedValue(
      new Error('inconclusive registration timeout'),
    );
    await drain();
    const reg = await db.domainRegistration.findFirstOrThrow();
    expect(reg.status).toBe('MANUAL_REVIEW');
    expect(reg.attemptCount).toBe(1);
    const refund = await req('post', '/refunds', customerCookie, {
      paymentId: p.id,
      amountMinor: '1200',
      reason: 'Contract refund after uncertain registration',
      idempotencyKey: randomUUID(),
    });
    expect(refund.status).toBe(201);
    expect(
      (
        await req(
          'post',
          '/admin/refunds/' + refund.body.id + '/decision',
          adminCookie,
          { decision: 'APPROVE', reason: 'Unsafe refund must be refused' },
        )
      ).status,
    ).toBe(409);
    expect(
      (await db.refund.findUniqueOrThrow({ where: { id: refund.body.id } }))
        .status,
    ).toBe('REQUESTED');
  });
});

describe('Environment separation', () => {
  it('does not let a mock gateway fund an imported live order', async () => {
    const o = await order();
    await db.order.update({
      where: { id: o.id },
      data: { environment: 'LIVE' },
    });
    expect(
      (
        await req('post', '/payments', customerCookie, {
          orderId: o.id,
          provider: 'mock',
        })
      ).status,
    ).toBe(409);
    expect(await db.payment.count({ where: { orderId: o.id } })).toBe(0);
  });
  it('does not reconcile an operation against a different environment', async () => {
    await paid();
    vi.spyOn(registration, 'registerDomain').mockRejectedValue(
      new Error('uncertain result'),
    );
    await drain();
    const reg = await db.domainRegistration.findFirstOrThrow();
    processor.config.DOMAIN_REGISTRATION_MODE = 'sandbox';
    const lookup = vi.spyOn(registration, 'findExistingRegistration');
    await processor.register(reg.id, true);
    expect(lookup).not.toHaveBeenCalled();
    expect(
      (await db.domainRegistration.findUniqueOrThrow({ where: { id: reg.id } }))
        .lastErrorCode,
    ).toBe('REGISTRAR_ENVIRONMENT_MISMATCH');
    expect(await db.managedDomain.count()).toBe(0);
  });
});

describe('Checkout validation response contract', () => {
  it('returns specific nested errors without creating an order', async () => {
    const body = checkoutBody();
    const response = await req('post', '/checkout', customerCookie, {
      ...body,
      nameservers: ['https://invalid.example.test', 'ns2.example.test'],
      billing: { ...body.billing, postalCode: '' },
    });
    expect(response.status).toBe(400);
    expect(response.body.error).toMatchObject({
      message: 'Dados inválidos',
      fields: { nameservers: expect.any(Array), billing: expect.any(Array) },
      issues: expect.arrayContaining([
        {
          path: ['nameservers', 0],
          message: expect.stringContaining('nome DNS válido'),
        },
        {
          path: ['billing', 'postalCode'],
          message: expect.stringContaining('pelo menos 1'),
        },
      ]),
    });
    expect(await db.order.count()).toBe(0);
  });
});
