import { z } from 'zod/v3';
export const commerceEnvironmentSchema = z.object({
  PAYMENTS_MODE: z.enum(['mock', 'disabled']).default('mock'),
  DOMAIN_REGISTRATION_MODE: z
    .enum(['disabled', 'mock', 'sandbox', 'live'])
    .default('disabled'),
  LIVE_TRANSACTIONS_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  BILLING_MODE: z.literal('internal').default('internal'),
  EMAIL_MODE: z.literal('development').default('development'),
  MOCK_WEBHOOK_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  ),
  BILLING_TAX_BASIS_POINTS: z.coerce
    .number()
    .int()
    .min(0)
    .max(10000)
    .default(0),
  CHECKOUT_TERMS_VERSION: z
    .string()
    .min(1)
    .max(80)
    .default('devtrust-internal-2026-10'),
});
export type CommerceConfig = z.infer<typeof commerceEnvironmentSchema> & {
  NODE_ENV: string;
  OPENPROVIDER_BASE_URL: string;
};
export class CommerceError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}
export function assertMock(config: CommerceConfig) {
  if (config.PAYMENTS_MODE !== 'mock' || config.NODE_ENV === 'production')
    throw new CommerceError('MOCK_PAYMENT_DISABLED', 503);
}
export function assertRegistration(
  config: CommerceConfig,
  environment: string,
) {
  if (config.DOMAIN_REGISTRATION_MODE === 'disabled')
    throw new CommerceError('REGISTRATION_DISABLED', 503);
  if (config.DOMAIN_REGISTRATION_MODE === 'mock') {
    if (config.NODE_ENV === 'production' || environment !== 'MOCK')
      throw new CommerceError('MOCK_REGISTRATION_DISABLED', 503);
    return;
  }
  if (config.DOMAIN_REGISTRATION_MODE === 'sandbox') {
    if (
      !config.OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED ||
      config.OPENPROVIDER_BASE_URL !==
        'https://api.sandbox.openprovider.nl/v1beta' ||
      environment !== 'SANDBOX'
    )
      throw new CommerceError('SANDBOX_CONFIGURATION_REQUIRED', 503);
    return;
  }
  // No real payment gateway has been approved. Fail closed even when a flag is set.
  throw new CommerceError('LIVE_GATEWAY_NOT_APPROVED', 503);
}
