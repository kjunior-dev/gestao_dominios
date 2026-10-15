import { DomainDetail } from '@/features/transactions/domain-detail';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <DomainDetail id={(await params).id} />;
}
