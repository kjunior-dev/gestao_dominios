import { OrderDetail } from '@/features/transactions/order-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const p = await params;
  return <OrderDetail id={p.id} admin={false} />;
}
