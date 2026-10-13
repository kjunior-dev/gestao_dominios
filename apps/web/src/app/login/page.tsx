import { getUser } from '@/lib/server-auth';
import { redirect } from 'next/navigation';
import { PublicShell } from '@/components/public-shell';
import { AuthForm } from '@/features/auth/auth-form';
export default async function Page() {
  if (await getUser()) redirect('/dashboard');
  return (
    <PublicShell>
      <main>
        <AuthForm mode="login" />
      </main>
    </PublicShell>
  );
}
