import { OrderDetail } from '@/features/transactions/order-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const p = await params;
  return <OrderDetail id={p.orderId} admin={false} />;
}
