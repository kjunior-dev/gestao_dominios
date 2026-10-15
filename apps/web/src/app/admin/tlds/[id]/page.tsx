import { RegistrationPolicy } from '@/features/transactions/registration-policy';
import { TldEditor } from '@/features/admin/commerce';
import { requireCommerce } from '@/lib/commerce-access';
import { notFound } from 'next/navigation';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCommerce();
  const { id } = await params;
  if (!/^[a-f0-9-]{36}$/i.test(id)) notFound();
  return (
    <>
      <TldEditor id={id} />
      <RegistrationPolicy id={id} />
    </>
  );
}
