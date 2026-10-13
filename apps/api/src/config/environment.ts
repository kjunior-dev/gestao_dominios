import { z } from 'zod/v3';
export const environmentSchema = z.object({
  OPENPROVIDER_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  OPENPROVIDER_BASE_URL: z
    .enum([
      'https://api.openprovider.eu/v1',
      'https://api.sandbox.openprovider.nl/v1beta',
    ])
    .default('https://api.openprovider.eu/v1'),
  OPENPROVIDER_USERNAME: z.string().optional(),
  OPENPROVIDER_PASSWORD: z.string().optional(),
  OPENPROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(30000)
    .default(10000),
  OPENPROVIDER_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(86400)
    .default(3600),
  OPENPROVIDER_REQUESTS_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(600)
    .default(60),
  DOMAIN_CACHE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DOMAIN_AVAILABLE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(300)
    .default(60),
  DOMAIN_UNAVAILABLE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(3600)
    .default(300),
  DOMAIN_SEARCHES_PER_MINUTE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
  DOMAIN_LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CART_TTL_HOURS: z.coerce.number().int().min(1).max(720).default(72),
  QUOTE_TTL_SECONDS: z.coerce.number().int().min(30).max(1800).default(300),
  EXCHANGE_RATE_PROVIDER: z.literal('manual').default('manual'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  APP_URL: z.string().url(),
  TOTP_ENCRYPTION_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/, 'Generate a 32-byte hex key'),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(168),
});
export class EnvironmentError extends Error {}
export function environment() {
  const result = environmentSchema.safeParse(process.env);
  if (!result.success)
    throw new EnvironmentError(
      'Invalid environment: ' +
        result.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; '),
    );
  if (
    result.data.OPENPROVIDER_ENABLED &&
    (!result.data.OPENPROVIDER_USERNAME || !result.data.OPENPROVIDER_PASSWORD)
  )
    throw new EnvironmentError(
      'Openprovider enabled: backend credentials are required',
    );
  if (
    result.data.NODE_ENV === 'production' &&
    !result.data.APP_URL.startsWith('https://')
  )
    throw new EnvironmentError('APP_URL must use HTTPS in production');
  return result.data;
}
