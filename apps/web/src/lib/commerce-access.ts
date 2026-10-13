import { redirect } from 'next/navigation';
import { globalPermissions } from '@devtrust/contracts';
import { requireUser } from './server-auth';
export async function requireCommerce() {
  const user = await requireUser(true);
  if (!globalPermissions[user.globalRole].includes('pricing.manage'))
    redirect('/admin');
  return user;
}
