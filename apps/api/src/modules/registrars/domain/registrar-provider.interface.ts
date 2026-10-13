import type {
  AvailabilityRequest,
  AvailabilityResult,
  PricingRequest,
  RegistrarPricing,
  SupportedTld,
} from './registrar.types';
export interface RegistrarProvider {
  readonly providerCode: string;
  checkAvailability(
    request: AvailabilityRequest,
  ): Promise<AvailabilityResult[]>;
  getTldPricing(request: PricingRequest): Promise<RegistrarPricing>;
  getSupportedTlds(): Promise<SupportedTld[]>;
}
