import { describe, it, expect } from 'vitest';
import {
  randomToken,
  digest,
  encrypt,
  decrypt,
  equalHash,
} from '../apps/api/src/common/crypto';
import { safeMetadata } from '../apps/api/src/modules/audit/audit.service';
import {
  registerSchema,
  profileSchema,
  organizationPermissions,
  globalPermissions,
} from '../packages/contracts/src';
import { environmentSchema } from '../apps/api/src/config/environment';
describe('Security primitives', () => {
  it('uses unique high-entropy tokens and only SHA-256 digests', () => {
    const a = randomToken(),
      b = randomToken();
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).not.toBe(b);
    expect(digest(a)).not.toBe(a);
    expect(equalHash(a, digest(a))).toBe(true);
    expect(equalHash(b, digest(a))).toBe(false);
  });
  it('authenticates encrypted secrets and their purpose', () => {
    const key = randomToken(),
      encrypted = encrypt('sensitive', key);
    expect(encrypted).not.toContain('sensitive');
    expect(decrypt(encrypted, key)).toBe('sensitive');
    expect(() => decrypt(encrypted, randomToken())).toThrow();
    expect(() => decrypt(encrypted, key, 'notification')).toThrow();
  });
  it('filters secret and nested metadata', () => {
    expect(
      safeMetadata({
        password: 'secret',
        token: 'token',
        encryptedSecret: 'secret',
        role: 'MEMBER',
        nested: { password: 'bad' },
        count: 2,
      }),
    ).toEqual({ role: 'MEMBER', count: 2 });
  });
  it('rejects privilege injection and empty passwords', () => {
    expect(
      registerSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.test',
        password: '',
      }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({
        firstName: 'A',
        lastName: 'B',
        globalRole: 'SUPER_ADMIN',
      }).success,
    ).toBe(false);
  });
  it('denies unassigned permissions', () => {
    expect(globalPermissions.CUSTOMER).toEqual([]);
    expect(organizationPermissions.MEMBER).not.toContain('members.manage');
    expect(organizationPermissions.MANAGER).not.toContain(
      'organizations.update',
    );
    expect(organizationPermissions.OWNER).toContain('members.manage');
  });
  it('fails for missing or malformed secrets', () => {
    expect(environmentSchema.safeParse({}).success).toBe(false);
  });
});
