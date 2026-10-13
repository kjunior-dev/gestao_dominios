import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PublicUser } from '@devtrust/contracts';
export async function requireUser(admin = false) {
  const jar = await cookies();
  const response = await fetch(
    (process.env.API_INTERNAL_URL || 'http://localhost:4000') +
      '/api/v1/auth/me',
    { headers: { cookie: jar.toString() }, cache: 'no-store' },
  ).catch(() => null);
  if (!response?.ok) redirect('/login');
  const user = (await response.json()) as PublicUser;
  if (admin) {
    if (user.globalRole === 'CUSTOMER') redirect('/dashboard');
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.globalRole) && !user.mfaEnabled)
      redirect('/dashboard/seguranca');
  }
  return user;
}
