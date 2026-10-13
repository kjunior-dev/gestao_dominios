import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createNotificationWorker } from '../apps/worker/src/worker';
import pino from '../apps/worker/node_modules/pino';
import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import supertest from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { authenticator } from 'otplib';
import { Queue, Worker, QueueEvents } from '../apps/worker/node_modules/bullmq';
import { createApp } from '../apps/api/src/bootstrap';
import { DatabaseService } from '../apps/api/src/common/database.service';
import { RuntimeService } from '../apps/api/src/common/runtime.service';
import { randomToken, digest } from '../apps/api/src/common/crypto';
import { processNotification } from '../apps/worker/src/processor';
import { readFile } from 'node:fs/promises';
let app: INestApplication, db: DatabaseService, runtime: RuntimeService;
const origin = process.env.APP_URL!;
const password = randomToken();
const agent = () => supertest.agent(app.getHttpServer());
type Agent = ReturnType<typeof agent>;
function post(a: Agent, path: string, body: object = {}, csrf?: string) {
  const req = a
    .post('/api/v1' + path)
    .set('Origin', origin)
    .send(body);
  return csrf ? req.set('X-CSRF-Token', csrf) : req;
}
async function login(a: Agent, email: string, code?: string) {
  const res = await post(a, '/auth/login', {
    email,
    password,
    ...(code ? { code } : {}),
  });
  expect(res.status).toBe(200);
  const cookies = res.headers['set-cookie'] as unknown as string[];
  return {
    csrf: cookies
      .find((c) => c.startsWith('dt_csrf='))!
      .split(';')[0]
      .split('=')[1],
    res,
  };
}
async function register(email: string) {
  const res = await post(agent(), '/auth/register', {
    email,
    password,
    firstName: 'Teste',
    lastName: 'DevTrust',
  });
  expect(res.status).toBe(201);
  return res.body as { id: string };
}
beforeAll(async () => {
  if (process.env.NODE_ENV !== 'test')
    throw new Error('Integration tests require NODE_ENV=test');
  const url = new URL(process.env.DATABASE_URL!);
  if (!url.pathname.endsWith('_test'))
    throw new Error(
      'Integration tests require a database name ending in _test.',
    );
  if (!process.env.REDIS_URL?.endsWith('/1'))
    throw new Error('Integration tests require dedicated Redis database 1.');
  app = await createApp();
  db = app.get(DatabaseService);
  runtime = app.get(RuntimeService);
  await db.$executeRawUnsafe(
    'TRUNCATE "AuditLog", "Notification", "MfaRecoveryCode", "MfaCredential", "VerificationToken", "Session", "OrganizationMember", "Organization", "User" CASCADE',
  );
  await runtime.notifications.obliterate({ force: true });
});
beforeEach(async () => {
  for (const key of await runtime.redis.keys('rate:*'))
    await runtime.redis.del(key);
});
afterAll(async () => {
  await app?.close();
});
describe('Administrator bootstrap and schema', () => {
  it('bootstraps the first administrator once without fixed credentials', async () => {
    const email = 'bootstrap@example.test',
      bootstrapPassword = randomToken();
    const invoke = () =>
      spawnSync(
        process.execPath,
        [resolve('packages/database/dist/bootstrap.js')],
        {
          env: {
            ...process.env,
            BOOTSTRAP_ADMIN_EMAIL: email,
            BOOTSTRAP_ADMIN_PASSWORD: bootstrapPassword,
          },
          encoding: 'utf8',
        },
      );
    const first = invoke();
    expect(first.status, first.stderr).toBe(0);
    const admin = await db.user.findUniqueOrThrow({ where: { email } });
    expect(admin.globalRole).toBe('SUPER_ADMIN');
    expect(admin.passwordHash).not.toBe(bootstrapPassword);
    const second = invoke();
    expect(second.status).not.toBe(0);
    expect(second.stderr).toContain('Bootstrap disabled');
    expect(
      await db.auditLog.count({ where: { action: 'admin.bootstrap' } }),
    ).toBe(1);
  });
  it('documents actual request schemas in OpenAPI', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(
      res.body.paths['/api/v1/auth/reset-password'].post.requestBody.content[
        'application/json'
      ].schema.properties,
    ).toHaveProperty('token');
  });
  it('reports worker readiness and lack of heartbeat', async () => {
    await runtime.redis.del('worker:heartbeat');
    expect(
      (await supertest(app.getHttpServer()).get('/api/v1/health')).status,
    ).toBe(503);
    await runtime.redis.set(
      'worker:heartbeat',
      new Date().toISOString(),
      'EX',
      30,
    );
    expect(
      (await supertest(app.getHttpServer()).get('/api/v1/health')).status,
    ).toBe(200);
    await runtime.redis.del('worker:heartbeat');
  });
});
describe('Authentication and sessions', () => {
  it('registers, hashes password and rejects duplicate email', async () => {
    const user = await register('owner@example.test');
    const stored = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).toMatch(/^\$argon2id/);
    expect(stored.globalRole).toBe('CUSTOMER');
    const duplicate = await post(agent(), '/auth/register', {
      email: 'owner@example.test',
      password,
      firstName: 'A',
      lastName: 'B',
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).not.toHaveProperty('passwordHash');
  });
  it('rejects wrong passwords and excessive login attempts', async () => {
    for (let i = 0; i < 9; i++)
      expect(
        (
          await post(agent(), '/auth/login', {
            email: 'owner@example.test',
            password: 'incorrect',
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'owner@example.test',
          password,
        })
      ).status,
    ).toBe(401);
    await runtime.redis.del('login:' + digest('owner@example.test'));
  });
  it('authenticates, requires Origin and CSRF, logs out', async () => {
    const a = agent(),
      { csrf } = await login(a, 'owner@example.test');
    const me = await a.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.passwordHash).toBeUndefined();
    expect((await post(a, '/auth/logout')).status).toBe(403);
    expect(
      (await a.post('/api/v1/auth/logout').set('X-CSRF-Token', csrf)).status,
    ).toBe(403);
    expect((await post(a, '/auth/logout', {}, csrf)).status).toBe(200);
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
  });
  it('rejects expired and revoked sessions', async () => {
    const a = agent();
    await login(a, 'owner@example.test');
    const user = await db.user.findUniqueOrThrow({
      where: { email: 'owner@example.test' },
    });
    await db.session.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
    await login(a, 'owner@example.test');
    await db.session.updateMany({
      where: { userId: user.id },
      data: { revokedAt: new Date() },
    });
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
  });
  it('verifies email with a single-use token, rejects expired tokens', async () => {
    const user = await db.user.findUniqueOrThrow({
        where: { email: 'owner@example.test' },
      }),
      token = randomToken();
    await db.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'VERIFY_EMAIL',
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    expect((await post(agent(), '/auth/verify-email', { token })).status).toBe(
      200,
    );
    expect((await post(agent(), '/auth/verify-email', { token })).status).toBe(
      400,
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .emailVerifiedAt,
    ).not.toBeNull();
    const expired = randomToken();
    await db.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'VERIFY_EMAIL',
        tokenHash: digest(expired),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    expect(
      (await post(agent(), '/auth/verify-email', { token: expired })).status,
    ).toBe(400);
  });
  it('recovers password without account disclosure and revokes sessions', async () => {
    const user = await register('reset@example.test'),
      a = agent();
    await login(a, 'reset@example.test');
    const exists = await post(agent(), '/auth/forgot-password', {
        email: 'reset@example.test',
      }),
      missing = await post(agent(), '/auth/forgot-password', {
        email: 'missing@example.test',
      });
    expect(exists.status).toBe(202);
    expect(exists.body).toEqual(missing.body);
    const raw = randomToken();
    await db.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: digest(raw),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    const newPassword = 'Changed-password-2026';
    expect(
      (
        await post(agent(), '/auth/reset-password', {
          token: raw,
          password: newPassword,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(agent(), '/auth/reset-password', {
          token: raw,
          password: newPassword,
        })
      ).status,
    ).toBe(400);
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'reset@example.test',
          password: newPassword,
        })
      ).status,
    ).toBe(200);
  });
  it('rejects expired reset tokens without changing credentials', async () => {
    const user = await db.user.findUniqueOrThrow({
        where: { email: 'owner@example.test' },
      }),
      token = randomToken();
    await db.verificationToken.create({
      data: {
        userId: user.id,
        purpose: 'RESET_PASSWORD',
        tokenHash: digest(token),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    expect(
      (
        await post(agent(), '/auth/reset-password', {
          token,
          password: randomToken(),
        })
      ).status,
    ).toBe(400);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } }))
        .passwordHash,
    ).toBe(user.passwordHash);
  });
  it('changes password and terminates all sessions', async () => {
    await register('change@example.test');
    const a = agent(),
      b = agent(),
      { csrf } = await login(a, 'change@example.test');
    await login(b, 'change@example.test');
    expect(
      (
        await post(
          a,
          '/auth/change-password',
          { currentPassword: password, password: 'Another-password-2026' },
          csrf,
        )
      ).status,
    ).toBe(200);
    expect((await b.get('/api/v1/auth/me')).status).toBe(401);
  });
  it('revokes an individual own session and refuses a foreign session', async () => {
    await register('session-scope@example.test');
    const a = agent(),
      b = agent(),
      { csrf } = await login(a, 'owner@example.test');
    await login(b, 'session-scope@example.test');
    const own = await a.get('/api/v1/sessions'),
      other = await b.get('/api/v1/sessions');
    expect(
      (
        await a
          .delete('/api/v1/sessions/' + other.body[0].id)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
      ).status,
    ).toBe(404);
    const currentUser = await db.user.findUniqueOrThrow({
      where: { email: 'owner@example.test' },
    });
    const current = await db.session.findFirstOrThrow({
      where: {
        userId: currentUser.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(own.body.some((s: { id: string }) => s.id === current.id)).toBe(
      true,
    );
    expect(
      (
        await a
          .delete('/api/v1/sessions/' + current.id)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
      ).status,
    ).toBe(200);
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
    expect((await b.get('/api/v1/auth/me')).status).toBe(200);
  });
  it('lists only own sessions and revokes all', async () => {
    const a = agent(),
      { csrf } = await login(a, 'owner@example.test');
    const list = await a.get('/api/v1/sessions');
    expect(list.status).toBe(200);
    expect(list.body[0].tokenHash).toBeUndefined();
    expect((await post(a, '/auth/logout-all', {}, csrf)).status).toBe(200);
    expect((await a.get('/api/v1/auth/me')).status).toBe(401);
  });
});
describe('Organization isolation and RBAC', () => {
  let owner: Agent,
    member: Agent,
    ownerCsrf: string,
    memberCsrf: string,
    orgId: string,
    memberId: string;
  beforeAll(async () => {
    await register('member@example.test');
    owner = agent();
    ownerCsrf = (await login(owner, 'owner@example.test')).csrf;
    member = agent();
    memberCsrf = (await login(member, 'member@example.test')).csrf;
  });
  it('creates an organization and OWNER membership transactionally', async () => {
    const res = await post(
      owner,
      '/organizations',
      {
        name: 'DevTrust Test',
        slug: 'devtrust-test',
        type: 'BUSINESS',
        country: 'CV',
      },
      ownerCsrf,
    );
    expect(res.status).toBe(201);
    orgId = res.body.id;
    expect(
      await db.organizationMember.count({
        where: { organizationId: orgId, role: 'OWNER' },
      }),
    ).toBe(1);
  });
  it('denies administrative access and privilege injection', async () => {
    expect((await member.get('/api/v1/admin/users')).status).toBe(403);
    expect(
      (
        await member
          .patch('/api/v1/users/me')
          .set('Origin', origin)
          .set('X-CSRF-Token', memberCsrf)
          .send({ firstName: 'A', lastName: 'B', globalRole: 'SUPER_ADMIN' })
      ).status,
    ).toBe(400);
  });
  it('denies access to another organization', async () => {
    expect((await member.get('/api/v1/organizations/' + orgId)).status).toBe(
      403,
    );
    expect(
      (await member.get('/api/v1/organizations/' + orgId + '/members')).status,
    ).toBe(403);
  });
  it('lets OWNER add a member, enforces uniqueness', async () => {
    const res = await post(
      owner,
      '/organizations/' + orgId + '/members',
      { email: 'member@example.test', role: 'MEMBER' },
      ownerCsrf,
    );
    expect(res.status).toBe(201);
    memberId = res.body.id;
    expect(
      (
        await post(
          owner,
          '/organizations/' + orgId + '/members',
          { email: 'member@example.test', role: 'MEMBER' },
          ownerCsrf,
        )
      ).status,
    ).toBe(409);
    expect((await member.get('/api/v1/organizations/' + orgId)).status).toBe(
      200,
    );
  });
  it('denies MEMBER changes and self elevation', async () => {
    expect(
      (
        await member
          .patch('/api/v1/organizations/' + orgId)
          .set('Origin', origin)
          .set('X-CSRF-Token', memberCsrf)
          .send({ name: 'Hijacked' })
      ).status,
    ).toBe(403);
    expect(
      (
        await member
          .patch('/api/v1/organizations/' + orgId + '/members/' + memberId)
          .set('Origin', origin)
          .set('X-CSRF-Token', memberCsrf)
          .send({ role: 'OWNER' })
      ).status,
    ).toBe(403);
  });
  it('allows OWNER to update a member role and audits the change', async () => {
    const url = '/api/v1/organizations/' + orgId + '/members/' + memberId;
    const result = await owner
      .patch(url)
      .set('Origin', origin)
      .set('X-CSRF-Token', ownerCsrf)
      .send({ role: 'MANAGER' });
    expect(result.status).toBe(200);
    expect(result.body.role).toBe('MANAGER');
    expect(
      await db.auditLog.count({
        where: { resourceId: memberId, action: 'members.role_changed' },
      }),
    ).toBe(1);
    expect(
      (
        await owner
          .patch(url)
          .set('Origin', origin)
          .set('X-CSRF-Token', ownerCsrf)
          .send({ role: 'MEMBER' })
      ).status,
    ).toBe(200);
  });
  it('preserves the final owner and validates resource ownership', async () => {
    const own = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: orgId, role: 'OWNER' },
    });
    expect(
      (
        await owner
          .patch('/api/v1/organizations/' + orgId + '/members/' + own.id)
          .set('Origin', origin)
          .set('X-CSRF-Token', ownerCsrf)
          .send({ role: 'MEMBER' })
      ).status,
    ).toBe(400);
    expect(
      (
        await owner
          .patch(
            '/api/v1/organizations/' +
              orgId +
              '/members/' +
              randomToken().slice(0, 32),
          )
          .set('Origin', origin)
          .set('X-CSRF-Token', ownerCsrf)
          .send({ role: 'OWNER' })
      ).status,
    ).toBe(400);
  });
  it('removes a member, immediately revoking organization access', async () => {
    await register('removed@example.test');
    const joined = await post(
      owner,
      '/organizations/' + orgId + '/members',
      { email: 'removed@example.test', role: 'MEMBER' },
      ownerCsrf,
    );
    expect(joined.status).toBe(201);
    const a = agent();
    await login(a, 'removed@example.test');
    expect((await a.get('/api/v1/organizations/' + orgId)).status).toBe(200);
    expect(
      (
        await owner
          .delete(
            '/api/v1/organizations/' + orgId + '/members/' + joined.body.id,
          )
          .set('Origin', origin)
          .set('X-CSRF-Token', ownerCsrf)
      ).status,
    ).toBe(200);
    expect((await a.get('/api/v1/organizations/' + orgId)).status).toBe(403);
    expect(
      await db.auditLog.count({
        where: { resourceId: joined.body.id, action: 'members.removed' },
      }),
    ).toBe(1);
  });
  it('refuses to remove the final organization owner', async () => {
    const own = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: orgId, role: 'OWNER' },
    });
    expect(
      (
        await owner
          .delete('/api/v1/organizations/' + orgId + '/members/' + own.id)
          .set('Origin', origin)
          .set('X-CSRF-Token', ownerCsrf)
      ).status,
    ).toBe(400);
    expect(
      await db.organizationMember.count({
        where: { organizationId: orgId, role: 'OWNER' },
      }),
    ).toBe(1);
  });
  it('enforces relational integrity and organization uniqueness', async () => {
    expect(
      (
        await post(
          owner,
          '/organizations',
          {
            name: 'Duplicate',
            slug: 'devtrust-test',
            type: 'BUSINESS',
            country: 'CV',
          },
          ownerCsrf,
        )
      ).status,
    ).toBe(409);
    await expect(
      db.organizationMember.create({
        data: {
          userId: '00000000-0000-0000-0000-000000000001',
          organizationId: orgId,
        },
      }),
    ).rejects.toThrow();
  });
});
describe('Administrative MFA', () => {
  let admin: Agent,
    csrf: string,
    codes: string[],
    adminId: string,
    secret: string;
  it('requires enrollment and denies admin operations before MFA', async () => {
    const u = await register('admin@example.test');
    adminId = u.id;
    await db.user.update({
      where: { id: adminId },
      data: { globalRole: 'SUPER_ADMIN' },
    });
    admin = agent();
    const logged = await login(admin, 'admin@example.test');
    csrf = logged.csrf;
    expect(logged.res.body.mfaRequired).toBe(true);
    expect((await admin.get('/api/v1/admin/users')).status).toBe(403);
    expect((await admin.get('/api/v1/organizations')).status).toBe(403);
  });
  it('configures encrypted TOTP and issues hashed recovery codes', async () => {
    const setup = await post(admin, '/auth/mfa/setup', {}, csrf);
    expect(setup.status).toBe(200);
    secret = setup.body.secret;
    const stored = await db.mfaCredential.findUniqueOrThrow({
      where: { userId: adminId },
    });
    expect(stored.encryptedSecret).not.toContain(secret);
    const enabled = await post(
      admin,
      '/auth/mfa/confirm',
      { code: authenticator.generate(secret) },
      csrf,
    );
    expect(enabled.status).toBe(200);
    codes = enabled.body.recoveryCodes;
    expect(codes).toHaveLength(8);
    const recovery = await db.mfaRecoveryCode.findMany({
      where: { userId: adminId },
    });
    expect(recovery.map((c) => c.codeHash)).not.toContain(codes[0]);
    expect((await admin.get('/api/v1/admin/users')).status).toBe(200);
  });
  it('authenticates administrators with TOTP, prevents replay', async () => {
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'admin@example.test',
          password,
        })
      ).status,
    ).toBe(401);
    await db.mfaCredential.update({
      where: { userId: adminId },
      data: { lastUsedStep: null },
    });
    const code = authenticator.generate(secret);
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'admin@example.test',
          password,
          code,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'admin@example.test',
          password,
          code,
        })
      ).status,
    ).toBe(401);
  });
  it('consumes recovery codes exactly once', async () => {
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'admin@example.test',
          password,
          code: codes[0],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post(agent(), '/auth/login', {
          email: 'admin@example.test',
          password,
          code: codes[0],
        })
      ).status,
    ).toBe(401);
  });
  it('provides real metrics, pagination and audit records', async () => {
    const stats = await admin.get('/api/v1/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.users).toBe(await db.user.count());
    expect(stats.body.organizations).toBe(await db.organization.count());
    const res = await admin.get('/api/v1/admin/users?pageSize=2&page=1');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(await db.user.count());
    const audit = await admin.get('/api/v1/admin/audit-logs');
    expect(audit.status).toBe(200);
    expect(JSON.stringify(audit.body)).not.toContain(secret);
  });
  it('prevents public SUPER_ADMIN assignment and critical self changes', async () => {
    expect(
      (
        await admin
          .patch('/api/v1/admin/users/' + adminId)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ globalRole: 'CUSTOMER' })
      ).status,
    ).toBe(403);
    const owner = await db.user.findUniqueOrThrow({
      where: { email: 'owner@example.test' },
    });
    expect(
      (
        await admin
          .patch('/api/v1/admin/users/' + owner.id)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ globalRole: 'SUPER_ADMIN' })
      ).status,
    ).toBe(400);
  });
});
describe('Authorized administrative changes', () => {
  it('changes allowed roles and statuses while revoking affected sessions', async () => {
    const admin = agent();
    const credential = await db.mfaCredential.findFirstOrThrow({
      where: { user: { email: 'admin@example.test' } },
    });
    await db.mfaCredential.update({
      where: { id: credential.id },
      data: { lastUsedStep: null },
    });
    const { decrypt } = await import('../apps/api/src/common/crypto');
    const code = authenticator.generate(
      decrypt(credential.encryptedSecret, process.env.TOTP_ENCRYPTION_KEY!),
    );
    const { csrf } = await login(admin, 'admin@example.test', code);
    const target = await db.user.findUniqueOrThrow({
        where: { email: 'member@example.test' },
      }),
      session = agent();
    await login(session, target.email);
    const url = '/api/v1/admin/users/' + target.id;
    expect(
      (
        await admin
          .patch(url)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ globalRole: 'SUPPORT' })
      ).status,
    ).toBe(200);
    expect((await session.get('/api/v1/auth/me')).status).toBe(401);
    expect(
      (
        await admin
          .patch(url)
          .set('Origin', origin)
          .set('X-CSRF-Token', csrf)
          .send({ status: 'SUSPENDED' })
      ).status,
    ).toBe(200);
    expect(
      (await post(agent(), '/auth/login', { email: target.email, password }))
        .status,
    ).toBe(401);
    expect(
      await db.auditLog.count({
        where: { resourceId: target.id, action: 'admin.user_updated' },
      }),
    ).toBe(2);
  });
});
describe('BullMQ notification processing', () => {
  it('processes development delivery with idempotency', async () => {
    const user = await db.user.findFirstOrThrow();
    const notification = await db.notification.create({
      data: { userId: user.id, type: 'DEMO', subject: 'Integration demo' },
    });
    const result = await processNotification(
      { notificationId: notification.id },
      db,
      process.env.TOTP_ENCRYPTION_KEY!,
      '/tmp/devtrust-integration-mailbox',
    );
    expect(result.duplicate).toBe(false);
    expect(
      (
        await db.notification.findUniqueOrThrow({
          where: { id: notification.id },
        })
      ).status,
    ).toBe('SENT');
    expect(
      (
        await processNotification(
          { notificationId: notification.id },
          db,
          process.env.TOTP_ENCRYPTION_KEY!,
          '/tmp/devtrust-integration-mailbox',
        )
      ).duplicate,
    ).toBe(true);
    const output = JSON.parse(
      await readFile(
        '/tmp/devtrust-integration-mailbox/' + notification.id + '.json',
        'utf8',
      ),
    );
    expect(output.transport).toBe('DEVELOPMENT_ONLY');
  });
  it('retries with backoff and ignores duplicate job IDs', async () => {
    const name = 'notifications-integration',
      connection = { url: process.env.REDIS_URL! };
    const queue = new Queue(name, { connection }),
      events = new QueueEvents(name, { connection });
    await queue.obliterate({ force: true });
    await events.waitUntilReady();
    const user = await db.user.findFirstOrThrow(),
      notification = await db.notification.create({
        data: { userId: user.id, type: 'DEMO', subject: 'Retry demo' },
      });
    let calls = 0;
    const worker = new Worker(
      name,
      async (job) => {
        calls++;
        if (job.attemptsMade === 0) throw new Error('Temporary test failure');
        return processNotification(
          job.data,
          db,
          process.env.TOTP_ENCRYPTION_KEY!,
          '/tmp/devtrust-integration-mailbox',
        );
      },
      { connection },
    );
    try {
      const job = await queue.add(
        'deliver',
        { notificationId: notification.id },
        {
          jobId: notification.id,
          attempts: 2,
          backoff: { type: 'exponential', delay: 50 },
        },
      );
      await job.waitUntilFinished(events, 10000);
      expect(calls).toBe(2);
      const duplicate = await queue.add(
        'deliver',
        { notificationId: notification.id },
        { jobId: notification.id },
      );
      expect(duplicate.id).toBe(job.id);
      expect(await queue.getCompletedCount()).toBe(1);
      expect(
        (
          await db.notification.findUniqueOrThrow({
            where: { id: notification.id },
          })
        ).status,
      ).toBe('SENT');
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
  it('records exhausted job failures', async () => {
    const name = 'notifications-failure-test',
      connection = { url: process.env.REDIS_URL! },
      queue = new Queue(name, { connection }),
      events = new QueueEvents(name, { connection });
    await events.waitUntilReady();
    const worker = new Worker(
      name,
      async () => {
        throw new Error('Test permanent failure');
      },
      { connection },
    );
    try {
      const job = await queue.add(
        'deliver',
        { notificationId: 'missing' },
        { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
      );
      await expect(job.waitUntilFinished(events, 10000)).rejects.toThrow(
        'Test permanent failure',
      );
      expect((await queue.getJob(job.id!))?.attemptsMade).toBe(2);
      expect(await queue.getFailedCount()).toBe(1);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
  it('marks exhausted notification failures in PostgreSQL using the real worker', async () => {
    const name = 'notification-persistence-test',
      connection = { url: process.env.REDIS_URL! },
      queue = new Queue(name, { connection }),
      events = new QueueEvents(name, { connection });
    await events.waitUntilReady();
    const user = await db.user.findFirstOrThrow(),
      notification = await db.notification.create({
        data: {
          userId: user.id,
          type: 'VERIFY_EMAIL',
          subject: 'Invalid payload',
        },
      });
    await runtime.redis.set(
      'notification:delivery:' + notification.id,
      'intentionally-corrupted',
      'EX',
      60,
    );
    const worker = createNotificationWorker({
      name,
      url: process.env.REDIS_URL!,
      db,
      key: process.env.TOTP_ENCRYPTION_KEY!,
      mailbox: '/tmp/devtrust-integration-mailbox',
      logger: pino({ level: 'silent' }),
    });
    try {
      const job = await queue.add(
        'deliver',
        { notificationId: notification.id },
        { attempts: 2, backoff: { type: 'fixed', delay: 50 } },
      );
      await expect(job.waitUntilFinished(events, 10000)).rejects.toThrow();
      await expect
        .poll(
          async () =>
            (
              await db.notification.findUniqueOrThrow({
                where: { id: notification.id },
              })
            ).status,
        )
        .toBe('FAILED');
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  });
  it('queues encrypted verification mail without exposing links in job data', async () => {
    const notification = await db.notification.findFirstOrThrow({
      where: { type: 'VERIFY_EMAIL', status: 'PENDING' },
    });
    expect(notification.encryptedPayload).toBeNull();
    const delivery = await runtime.redis.get(
      'notification:delivery:' + notification.id,
    );
    expect(delivery).not.toBeNull();
    expect(delivery).not.toContain('token=');
    const job = await runtime.notifications.getJob(notification.id);
    expect(job?.data).toEqual({ notificationId: notification.id });
  });
});
