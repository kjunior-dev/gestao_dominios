import { Prisma } from '@devtrust/database';
import { RegistrarError, SupplierMoney } from '../../domain/registrar.types';
import type { AvailabilityStatus } from '@devtrust/contracts';
export function mapStatus(status: string): AvailabilityStatus {
  if (status === 'free') return 'AVAILABLE';
  if (status === 'active') return 'REGISTERED';
  return 'UNKNOWN';
}
export function supplierMoney(
  price: string,
  currency: SupplierMoney['currency'],
): SupplierMoney {
  const value = new Prisma.Decimal(price).mul(100);
  if (
    !value.isFinite() ||
    value.isNegative() ||
    !value.isInteger() ||
    value.gt('999999999999999')
  )
    throw new RegistrarError('INVALID_SUPPLIER_PRICE');
  return { minor: value.toFixed(0), currency };
}
