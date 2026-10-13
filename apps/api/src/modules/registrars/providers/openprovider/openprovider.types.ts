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
