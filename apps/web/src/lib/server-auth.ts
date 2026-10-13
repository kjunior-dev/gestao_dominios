import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { PublicUser } from '@devtrust/contracts';
import { cache } from 'react';
export const getUser = cache(async (): Promise<PublicUser | null> => {
  const jar = await cookies();
  if (!jar.has('dt_session') && !jar.has('__Host-dt_session')) return null;
  const response = await fetch(
    (process.env.API_INTERNAL_URL || 'http://localhost:4000') +
      '/api/v1/auth/me',
    { headers: { cookie: jar.toString() }, cache: 'no-store' },
  ).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null) as Promise<PublicUser | null>;
});
export async function requireUser(admin = false) {
  const user = await getUser();
  if (!user) redirect('/login');
  if (admin) {
    if (user.globalRole === 'CUSTOMER') redirect('/dashboard');
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.globalRole) && !user.mfaEnabled)
      redirect('/dashboard/seguranca');
  }
  return user;
}
