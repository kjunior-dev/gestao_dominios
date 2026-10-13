import {requireUser} from '@/lib/server-auth';
import {AccountProvider} from '@/hooks/account-context';
import {AppShell} from '@/components/app-shell';
export const dynamic='force-dynamic';
export default async function Layout({children}:{children:React.ReactNode}){const user=await requireUser(true);return <AccountProvider initialUser={user}><AppShell admin={true}>{children}</AppShell></AccountProvider>;}
