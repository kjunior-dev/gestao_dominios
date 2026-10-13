import { PublicShell } from '@/components/public-shell';
import { ShoppingCart } from '@/features/domains/cart';
export default function Page() {
  return (
    <PublicShell>
      <main className="section container">
        <ShoppingCart />
      </main>
    </PublicShell>
  );
}
