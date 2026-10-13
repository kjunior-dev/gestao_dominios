import type { AvailabilityStatus } from '@devtrust/contracts';
export type DomainParts = {
  name: string;
  extension: string;
  domainName: string;
  idnScript?: string | null;
};
export type AvailabilityRequest = { domains: DomainParts[] };
export type SupplierMoney = { minor: string; currency: 'CVE' | 'EUR' | 'USD' };
export type AvailabilityResult = {
  domainName: string;
  status: AvailabilityStatus;
  isPremium: boolean;
  premiumCost?: SupplierMoney;
  checkedAt: string;
};
export type PricingRequest = {
  extension: string;
  name?: string;
  periodYears: number;
  idnScript?: string | null;
};
export type RegistrarPricing = { cost: SupplierMoney; isPremium: boolean };
export type SupportedTld = {
  extension: string;
  minimumPeriod: number;
  maximumPeriod: number;
  supportsRegistration: boolean;
  supportsTransfer: boolean;
  supportsRenewal: boolean;
};
export class RegistrarError extends Error {
  constructor(
    readonly code: string,
    readonly transient = false,
  ) {
    super(code);
    this.name = 'RegistrarError';
  }
}
