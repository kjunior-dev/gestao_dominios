import { z } from 'zod/v3';
z.setErrorMap((issue, context) => {
  if (issue.code === 'invalid_string')
    return {
      message:
        issue.validation === 'email'
          ? 'Introduza um email válido.'
          : 'Formato inválido.',
    };
  if (issue.code === 'too_small')
    return {
      message:
        'Use pelo menos ' +
        issue.minimum +
        (issue.type === 'string' ? ' caracteres.' : '.'),
    };
  if (issue.code === 'too_big')
    return { message: 'O valor excede o limite de ' + issue.maximum + '.' };
  if (issue.code === 'unrecognized_keys')
    return { message: 'O pedido contém campos não permitidos.' };
  if (issue.code === 'invalid_type')
    return { message: 'Preencha este campo com um valor válido.' };
  return { message: context.defaultError };
});
export const globalRoles = [
  'SUPER_ADMIN',
  'ADMIN',
  'SUPPORT',
  'CUSTOMER',
] as const;
export const memberRoles = ['OWNER', 'MANAGER', 'MEMBER'] as const;
export const email = z
  .string()
  .email()
  .max(254)
  .transform((v) => v.toLowerCase().trim());
export const password = z.string().min(12).max(128);
export const profileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    lastName: z.string().trim().min(1).max(80),
    phone: z.string().max(30).nullable().optional(),
  })
  .strict();
export const registerSchema = profileSchema.extend({ email, password });
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(128),
    code: z.string().max(100).optional(),
  })
  .strict();
export const emailSchema = z.object({ email }).strict();
export const tokenSchema = z
  .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
export const resetSchema = tokenSchema.extend({ password });
export const changePasswordSchema = z
  .object({ currentPassword: z.string().max(128), password })
  .strict();
export const mfaSchema = z
  .object({ code: z.string().regex(/^\d{6}$/) })
  .strict();
export const organizationSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    type: z.enum(['INDIVIDUAL', 'BUSINESS']),
    country: z.string().regex(/^[A-Z]{2}$/),
    taxId: z.string().max(40).nullable().optional(),
  })
  .strict();
export const memberSchema = z
  .object({ email, role: z.enum(memberRoles) })
  .strict();
export const memberUpdateSchema = z
  .object({ role: z.enum(memberRoles) })
  .strict();
export const adminUserSchema = z
  .object({
    status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
    globalRole: z.enum(['ADMIN', 'SUPPORT', 'CUSTOMER']).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(100).default(''),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
});
export type PublicUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerifiedAt: string | null;
  globalRole: (typeof globalRoles)[number];
  status: string;
  mfaEnabled: boolean;
};
export type PublicUserSummary = Omit<PublicUser, 'mfaEnabled'>;
export type Organization = {
  id: string;
  name: string;
  slug: string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  country: string;
  taxId: string | null;
  status: string;
  role?: (typeof memberRoles)[number];
};
export type Member = {
  id: string;
  role: (typeof memberRoles)[number];
  user: PublicUserSummary;
};
export type Session = {
  id: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  ipAddress: string | null;
};
export type AuditEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  createdAt: string;
  actorUserId: string | null;
};
export type Page<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type RegistrarPort = {
  provider: string; /* Availability and registration are introduced in phase 2. */
};
export type NotificationJob = { notificationId: string };
export const permissions = [
  'users.read',
  'users.update',
  'organizations.read',
  'organizations.update',
  'members.read',
  'members.manage',
  'domains.read',
  'domains.manage',
  'orders.read',
  'orders.manage',
  'pricing.manage',
  'system.manage',
  'audit.read',
] as const;
export type Permission = (typeof permissions)[number];
export const globalPermissions: Record<
  (typeof globalRoles)[number],
  readonly Permission[]
> = {
  SUPER_ADMIN: permissions,
  ADMIN: permissions.filter((p) => p !== 'system.manage'),
  SUPPORT: ['users.read', 'organizations.read', 'audit.read'],
  CUSTOMER: [],
};
export const organizationPermissions: Record<
  (typeof memberRoles)[number],
  readonly Permission[]
> = {
  OWNER: [
    'organizations.read',
    'organizations.update',
    'members.read',
    'members.manage',
    'domains.read',
    'domains.manage',
    'orders.read',
    'orders.manage',
  ],
  MANAGER: [
    'organizations.read',
    'members.read',
    'domains.read',
    'domains.manage',
    'orders.read',
    'orders.manage',
  ],
  MEMBER: ['organizations.read', 'members.read', 'domains.read', 'orders.read'],
};
