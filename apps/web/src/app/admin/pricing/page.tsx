import { PricingAdmin } from '@/features/admin/commerce';
import { requireCommerce } from '@/lib/commerce-access';
export default async function Page() {
  await requireCommerce();
  return <PricingAdmin />;
}
