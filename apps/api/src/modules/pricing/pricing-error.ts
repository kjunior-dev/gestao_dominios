import { UnprocessableEntityException } from '@nestjs/common';
const messages: Record<string, string> = {
  PRICE_POLICY_UNAVAILABLE: 'Preço comercial válido indisponível',
  PRICE_POLICY_EXPIRED: 'Preço comercial expirado',
  PRICE_POLICY_DISABLED: 'Preço comercial desativado',
  EXCHANGE_RATE_EXPIRED: 'Taxa de câmbio expirada',
  EXCHANGE_RATE_UNAVAILABLE: 'Taxa de câmbio válida indisponível',
  INVALID_EXCHANGE_RATE: 'Taxa de câmbio inválida',
};
export class PricingError extends UnprocessableEntityException {
  constructor(readonly code: string) {
    super({ code, message: messages[code] || 'Preço indisponível: ' + code });
  }
}
