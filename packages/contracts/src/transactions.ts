import { z } from 'zod/v3';
const text = z.string().trim().min(1).max(160);
const money = z.string().regex(/^[1-9]\d{0,14}$/);
export const domainContactSchema = z
  .object({
    organizationId: z.string().uuid(),
    firstName: text,
    lastName: text,
    companyName: text
      .or(z.literal(''))
      .transform((v) => v || undefined)
      .optional(),
    email: z.string().email().max(254),
    phone: z.string().regex(/^\d{5,15}$/),
    phoneCountryCode: z.string().regex(/^\+\d{1,4}$/),
    address: text,
    addressNumber: z.string().trim().min(1).max(20),
    city: text,
    region: text
      .or(z.literal(''))
      .transform((v) => v || undefined)
      .optional(),
    postalCode: z.string().trim().min(1).max(20),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    contactType: z.enum(['OWNER', 'ADMIN', 'TECH', 'BILLING']).default('OWNER'),
  })
  .strict();
export const billingSchema = z
  .object({
    legalName: text,
    taxId: z.string().max(40).optional(),
    address: text,
    city: text,
    postalCode: z.string().min(1).max(20),
    countryCode: z.string().regex(/^[A-Z]{2}$/),
  })
  .strict();
export const checkoutSchema = z
  .object({
    organizationId: z.string().uuid(),
    contactId: z.string().uuid(),
    nameservers: z
      .array(
        z
          .string()
          .toLowerCase()
          .regex(
            /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/,
          ),
      )
      .min(2)
      .max(6)
      .refine((v) => new Set(v).size === v.length, 'Nameservers duplicados.'),
    billing: billingSchema,
    acceptTerms: z.literal(true),
    termsVersion: z.string().min(1).max(80),
    acceptPremium: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const paymentCreateSchema = z
  .object({ orderId: z.string().uuid(), provider: z.literal('mock') })
  .strict();
export const mockPaymentSchema = z
  .object({ outcome: z.enum(['PAID', 'DECLINED']) })
  .strict();
export const refundSchema = z
  .object({
    paymentId: z.string().uuid(),
    amountMinor: money,
    reason: z.string().trim().min(5).max(500),
    idempotencyKey: z.string().uuid(),
  })
  .strict();
export const refundDecisionSchema = z
  .object({
    decision: z.enum(['APPROVE', 'REJECT']),
    reason: z.string().trim().min(5).max(500),
  })
  .strict();
export const commerceListSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().max(100).default(''),
    status: z
      .string()
      .regex(/^[A-Z_]*$/)
      .max(40)
      .optional(),
    environment: z.enum(['MOCK', 'SANDBOX', 'LIVE']).optional(),
  })
  .strict();
export type OrderView = {
  id: string;
  orderNumber: string;
  status: string;
  environment: 'MOCK' | 'SANDBOX' | 'LIVE';
  totalMinor: string;
  subtotalMinor: string;
  taxMinor: string;
  currency: string;
  createdAt: string;
  items: {
    id: string;
    domainName: string;
    registrationYears: number;
    salePriceMinor: string;
    status: string;
    isPremium: boolean;
  }[];
  payments: {
    id: string;
    status: string;
    provider: string;
    environment: string;
    amountMinor: string;
    currency: string;
    refunds?: {
      id: string;
      status: string;
      amountMinor: string;
      currency: string;
      reason: string;
      createdAt: string;
    }[];
  }[];
  transitions: {
    fromStatus: string;
    toStatus: string;
    reason: string;
    createdAt: string;
  }[];
};
export type CommerceRecord = {
  id: string;
  status: string;
  createdAt: string;
  environment?: string;
  amountMinor?: string;
  totalMinor?: string;
  currency?: string;
  invoiceNumber?: string;
  domainName?: string;
  registeredAt?: string;
  expiresAt?: string;
  orderId?: string;
  paymentId?: string;
  reason?: string;
  order?: OrderView;
  refunds?: CommerceRecord[];
};
export type CheckoutConfig = {
  paymentsMode: string;
  registrationMode: string;
  liveTransactionsEnabled: boolean;
  termsVersion: string;
  taxBasisPoints: number;
  billingMode: string;
  emailMode: string;
};
