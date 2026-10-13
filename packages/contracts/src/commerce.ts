import { z } from 'zod/v3';
export const currencies = ['CVE', 'EUR', 'USD'] as const;
export const currencySchema = z.enum(currencies);
export const extensionSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9.-]{0,125}[a-z0-9])?$/);
export const domainCheckSchema = z
  .object({
    query: z.string().trim().min(1).max(253),
    extensions: z.array(extensionSchema).min(1).max(10).optional(),
    registrationYears: z.number().int().min(1).max(10).default(1),
  })
  .strict();
export const tldSchema = z
  .object({
    extension: extensionSchema,
    displayName: z.string().trim().min(1).max(100),
    isActive: z.boolean().default(false),
    isFeatured: z.boolean().default(false),
    registrarId: z.string().uuid(),
    supportsRegistration: z.boolean().default(true),
    supportsTransfer: z.boolean().default(false),
    supportsRenewal: z.boolean().default(false),
    minimumPeriod: z.number().int().min(1).max(10).default(1),
    maximumPeriod: z.number().int().min(1).max(10).default(10),
    idnScript: z
      .string()
      .regex(/^[a-zA-Z]{2,12}$/)
      .nullable()
      .optional(),
  })
  .strict()
  .refine((v) => v.maximumPeriod >= v.minimumPeriod, {
    message: 'O período máximo deve ser igual ou superior ao mínimo.',
    path: ['maximumPeriod'],
  });
export const minorSchema = z.string().regex(/^\d{1,15}$/);
export const priceSchema = z
  .object({
    tldId: z.string().uuid(),
    registrarId: z.string().uuid(),
    periodYears: z.number().int().min(1).max(10),
    supplierCurrency: currencySchema,
    currency: currencySchema.default('CVE'),
    supplierCostMinor: minorSchema,
    marginType: z.enum(['FIXED', 'MARKUP', 'GROSS_MARGIN']),
    marginValue: z.string().regex(/^\d{1,9}(?:\.\d{1,8})?$/),
    minimumPriceMinor: minorSchema.default('0'),
    additionalCostMinor: minorSchema.default('0'),
    roundingIncrementMinor: minorSchema
      .refine((v) => /^\d+$/.test(v) && BigInt(v) > 0n, {
        message: 'O incremento deve ser positivo.',
      })
      .default('1'),
    effectiveUntil: z.string().datetime(),
  })
  .strict()
  .refine(
    (v) =>
      v.marginType !== 'GROSS_MARGIN' ||
      !/^\d+(?:\.\d+)?$/.test(v.marginValue) ||
      BigInt(v.marginValue.split('.')[0]) < 100n,
    {
      message: 'Margem bruta deve ser inferior a 100%.',
      path: ['marginValue'],
    },
  );
export const exchangeRateSchema = z
  .object({
    baseCurrency: currencySchema,
    targetCurrency: currencySchema,
    rate: z
      .string()
      .regex(/^\d{1,12}(?:\.\d{1,16})?$/)
      .refine((v) => !/^0(?:\.0+)?$/.test(v)),
    source: z.string().trim().min(1).max(100),
    expiresAt: z.string().datetime(),
  })
  .strict()
  .refine((v) => v.baseCurrency !== v.targetCurrency, {
    message: 'Escolha moedas distintas.',
    path: ['targetCurrency'],
  });
export const cartItemSchema = z
  .object({
    domainName: z.string().trim().min(1).max(253),
    registrationYears: z.number().int().min(1).max(10).default(1),
  })
  .strict();
export const cartPeriodSchema = z
  .object({ registrationYears: z.number().int().min(1).max(10) })
  .strict();
export type AvailabilityStatus =
  'AVAILABLE' | 'REGISTERED' | 'RESERVED' | 'UNAVAILABLE' | 'UNKNOWN';
export type CommercialQuote = {
  priceMinor: string;
  currency: (typeof currencies)[number];
  periodYears: number;
  expiresAt: string;
  priceVersion: string;
};
export type DomainResult = {
  domainName: string;
  tldId: string;
  extension: string;
  registrarCode: string;
  status: AvailabilityStatus;
  isPremium: boolean;
  cacheHit: boolean;
  checkedAt: string;
  quote: CommercialQuote | null;
  errorCode: string | null;
};
export type PublicTld = {
  id: string;
  extension: string;
  displayName: string;
  isFeatured: boolean;
  minimumPeriod: number;
  maximumPeriod: number;
  price: CommercialQuote | null;
};
export type CartView = {
  id: string;
  currency: string;
  expiresAt: string;
  subtotalMinor: string;
  requiresRevalidation: boolean;
  items: {
    id: string;
    domainName: string;
    registrationYears: number;
    unitPriceMinor: string;
    currency: string;
    isPremium: boolean;
    quoteExpiresAt: string;
    minimumPeriod: number;
    maximumPeriod: number;
  }[];
};

export type RegistrarView = {
  id: string;
  code: string;
  name: string;
  status: string;
  configured: boolean;
  environment: string | null;
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
};
export type TldView = {
  id: string;
  extension: string;
  displayName: string;
  isActive: boolean;
  isFeatured: boolean;
  registrars: {
    registrarId: string;
    registrar: RegistrarView;
    minimumPeriod: number;
    maximumPeriod: number;
    supportsRegistration: boolean;
    supportsTransfer: boolean;
    supportsRenewal: boolean;
    idnScript: string | null;
    lastSyncedAt: string | null;
  }[];
};
export type PriceView = {
  id: string;
  tldId: string;
  registrarId: string;
  periodYears: number;
  supplierCurrency: string;
  currency: string;
  supplierCostMinor: string;
  sellingPriceMinor: string;
  marginType: string;
  marginValue: string;
  effectiveUntil: string;
  updatedAt: string;
  isStale: boolean;
  tld: TldView;
  registrar: RegistrarView;
};
export type ExchangeRateView = {
  id: string;
  baseCurrency: string;
  targetCurrency: string;
  rate: string;
  source: string;
  fetchedAt: string;
  expiresAt: string;
};
export type SearchMetrics = {
  total: number;
  success: number;
  cacheHits: number;
  externalErrors: number;
  averageResponseTimeMs: number;
  successRate: number;
  cacheHitRate: number;
  retentionDays: number;
  extensions: { extension: string; _count: number }[];
};
