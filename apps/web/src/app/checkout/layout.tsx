import { requireUser } from '@/lib/server-auth';
import { AccountProvider } from '@/hooks/account-context';
import { PublicShell } from '@/components/public-shell';
export const dynamic = 'force-dynamic';
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  return (
    <AccountProvider initialUser={user}>
      <PublicShell>
        <main className="container section-gap">{children}</main>
      </PublicShell>
    </AccountProvider>
  );
}
