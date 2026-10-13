export type ValidExchangeRate = {
  rate: string;
  expiresAt: Date;
  id: string | null;
};
export interface ExchangeRateProvider {
  readonly code: string;
  getRate(
    baseCurrency: string,
    targetCurrency: string,
  ): Promise<ValidExchangeRate>;
}
