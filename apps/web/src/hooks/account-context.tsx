'use client';
import { createContext, useContext, useState, useEffect } from 'react';
import type { PublicUser, Organization } from '@devtrust/contracts';
import { api } from '@/lib/api';
type Context = {
  user: PublicUser;
  setUser: (user: PublicUser) => void;
  organizations: Organization[];
  organizationLoading: boolean;
  organizationError: string;
  organization: Organization | undefined;
  select: (id: string) => void;
  refresh: () => Promise<void>;
};
const Account = createContext<Context | null>(null);
export function AccountProvider({
  initialUser,
  children,
}: {
  initialUser: PublicUser;
  children: React.ReactNode;
}) {
  const [user, setUser] = useState(initialUser),
    [organizations, setOrganizations] = useState<Organization[]>([]),
    [selected, select] = useState(''),
    [organizationLoading, setLoading] = useState(
      !(
        ['ADMIN', 'SUPER_ADMIN'].includes(initialUser.globalRole) &&
        !initialUser.mfaEnabled
      ),
    ),
    [organizationError, setError] = useState('');
  async function refresh() {
    const organizations = await api.organizations();
    setOrganizations(organizations);
    setError('');
  }
  useEffect(() => {
    if (['ADMIN', 'SUPER_ADMIN'].includes(user.globalRole) && !user.mfaEnabled)
      return;
    let active = true;
    api
      .organizations()
      .then((value) => {
        if (active) {
          setOrganizations(value);
          setError('');
        }
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error
              ? e.message
              : 'Não foi possível carregar as organizações',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, user.globalRole, user.mfaEnabled]);
  return (
    <Account.Provider
      value={{
        user,
        setUser,
        organizations,
        organizationLoading,
        organizationError,
        organization:
          organizations.find((o) => o.id === selected) || organizations[0],
        select,
        refresh,
      }}
    >
      {children}
    </Account.Provider>
  );
}
export function useAccount() {
  const value = useContext(Account);
  if (!value) throw new Error('Missing account context');
  return value;
}
