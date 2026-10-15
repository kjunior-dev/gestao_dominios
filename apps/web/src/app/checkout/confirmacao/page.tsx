import { OrderDetail } from '@/features/transactions/order-detail';
import Link from 'next/link';
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return order && /^[a-f0-9-]{36}$/.test(order) ? (
    <OrderDetail id={order} confirmation />
  ) : (
    <Link href="/checkout">Voltar ao checkout</Link>
  );
}
