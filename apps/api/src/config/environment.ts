import { z } from 'zod/v3';
export const environmentSchema = z.object({
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
    result.data.NODE_ENV === 'production' &&
    !result.data.APP_URL.startsWith('https://')
  )
    throw new EnvironmentError('APP_URL must use HTTPS in production');
  return result.data;
}
