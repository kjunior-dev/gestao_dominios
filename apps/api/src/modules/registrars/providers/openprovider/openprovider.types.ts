import {
  RegistrarError,
  RegistrarDiagnostic,
} from '../../domain/registrar.types';
import { z } from 'zod/v3';
export const envelopeSchema = z.object({
  code: z
    .string()
    .regex(/^-?\d{1,10}$/)
    .transform(Number),
  data: z.unknown().optional(),
  maintenance: z.boolean().optional(),
});
export const moneySchema = z.object({
  currency: z.enum(['CVE', 'EUR', 'USD']),
  price: z.string().regex(/^\d+(?:\.\d+)?$/),
});
export const checkDataSchema = z.object({
  results: z.array(
    z.object({
      domain: z.string(),
      status: z.string(),
      is_premium: z.boolean(),
      premium: z
        .object({
          currency: z.enum(['CVE', 'EUR', 'USD']),
          price: z.object({ create: z.string().regex(/^\d+(?:\.\d+)?$/) }),
        })
        .optional(),
    }),
  ),
});
export const priceDataSchema = z.object({
  is_premium: z.boolean(),
  price: z.object({ reseller: moneySchema }),
});
export const supportedTldSchema = z.object({
  name: z.string(),
  status: z.string(),
  min_period: z.coerce.number().int().min(1).max(10),
  max_period: z.coerce.number().int().min(1).max(10),
  transfer_available: z.boolean().optional(),
  renew_available: z.boolean().optional(),
});
// Preserve every numeric wire lexeme before JSON.parse: no supplier money passes
// through an IEEE-754 number. Quoted strings (including escapes) are untouched.
export function parseExactJson(text: string): unknown {
  return JSON.parse(
    text.replace(
      /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      (token) => (token.startsWith('"') ? token : JSON.stringify(token)),
    ),
  );
}

export const loginDataSchema = z.object({
  token: z.string().min(1).max(10000),
});
// Classify only protocol status and documented numerical codes. External desc/data
// are never required for control flow or diagnostic output.
export function classifyOpenproviderFailure(
  httpStatus: number,
  providerCode: number | undefined,
  login: boolean,
  hasBearer: boolean,
  maintenance = false,
): RegistrarError | null {
  const diagnostic: RegistrarDiagnostic = {
    httpStatus,
    ...(providerCode !== undefined ? { providerCode } : {}),
  };
  const failure = (
    code: string,
    category: RegistrarDiagnostic['category'],
    transient = false,
  ) => new RegistrarError(code, transient, { ...diagnostic, category });
  if (httpStatus === 429 || providerCode === 50 || providerCode === 4007)
    return failure('PROVIDER_RATE_LIMIT', 'rate_limit');
  if (providerCode === 10005)
    return failure('PROVIDER_IP_DENIED', 'permission');
  if (providerCode === 197)
    return failure('PROVIDER_ACCOUNT_BLOCKED', 'permission');
  if (providerCode === 10006)
    return failure('PROVIDER_MFA_REQUIRED', 'permission');
  if (httpStatus === 403 || providerCode === 4002 || providerCode === 4003)
    return failure('PROVIDER_PERMISSION_DENIED', 'permission');
  if (
    providerCode !== undefined &&
    [190, 900, 901, 902, 10002, 10003, 10004].includes(providerCode)
  )
    return failure('PROVIDER_INVALID_CREDENTIALS', 'credentials');
  if (httpStatus === 401 || providerCode === 196) {
    if (login)
      return failure(
        providerCode === 196
          ? 'PROVIDER_LOGIN_REJECTED'
          : 'PROVIDER_INVALID_CREDENTIALS',
        providerCode === 196 ? 'authentication' : 'credentials',
      );
    return failure(
      hasBearer
        ? 'PROVIDER_TOKEN_REJECTED'
        : 'PROVIDER_AUTHENTICATION_REQUIRED',
      hasBearer ? 'token' : 'authentication',
    );
  }
  if (providerCode === 911 || providerCode === 349)
    return failure('CAPABILITY_UNSUPPORTED', 'configuration');
  if (
    httpStatus >= 500 ||
    maintenance ||
    providerCode === 4004 ||
    providerCode === 4005
  )
    return failure('PROVIDER_UNAVAILABLE', 'transient', true);
  if (httpStatus < 200 || httpStatus >= 300 || providerCode !== 0)
    return failure('PROVIDER_REJECTED', 'response');
  return null;
}
