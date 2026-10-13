'use client';
import { globalPermissions } from '@devtrust/contracts';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  UserRound,
  ShieldCheck,
  Building2,
  Users,
  Settings,
  ScrollText,
  LogOut,
  Menu,
  ArrowUpRight,
} from 'lucide-react';
import {
  Sidebar,
  Topbar,
  Button,
  Select,
  Breadcrumb,
  LoadingState,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { mutate } from '@/lib/api';
import { Brand } from './brand';
import { ThemeToggle } from './providers';
export function AppShell({
  children,
  admin = false,
}: {
  children: React.ReactNode;
  admin?: boolean;
}) {
  const {
      user,
      organizations,
      organization,
      select,
      organizationLoading,
      organizationError,
      refresh,
    } = useAccount(),
    path = usePathname(),
    router = useRouter(),
    [open, setOpen] = useState(false);
  const nav = admin
    ? ([
        ['/admin', 'Visão geral', LayoutDashboard],
        ['/admin/utilizadores', 'Utilizadores', Users],
        ['/admin/organizacoes', 'Organizações', Building2],
        ['/admin/tlds', 'Extensões', Building2],
        ['/admin/pricing', 'Preços e câmbio', Settings],
        ['/admin/registrars', 'Registradores', ShieldCheck],
        ['/admin/auditoria', 'Auditoria', ScrollText],
        ['/admin/definicoes', 'Definições', Settings],
      ] as const)
    : ([
        ['/dashboard', 'Visão geral', LayoutDashboard],
        ['/dashboard/carrinho', 'Carrinho', Building2],
        ['/dashboard/dominios', 'Domínios', Building2],
        ['/dashboard/encomendas', 'Encomendas', ScrollText],
        ['/dashboard/perfil', 'O meu perfil', UserRound],
        ['/dashboard/seguranca', 'Segurança', ShieldCheck],
        ['/dashboard/organizacao', 'Organização', Building2],
        ['/dashboard/membros', 'Membros', Users],
        ['/dashboard/definicoes', 'Definições', Settings],
      ] as const);
  return (
    <div className="app-shell">
      <Sidebar id="app-sidebar" className={open ? 'open' : ''}>
        <Brand />
        <Button
          variant="ghost"
          className="mobile-menu"
          aria-label="Fechar navegação"
          onClick={() => setOpen(false)}
        >
          Fechar menu
        </Button>
        <span className="sidebar-caption">
          {admin ? 'ADMINISTRAÇÃO' : 'ÁREA DO CLIENTE'}
        </span>
        <nav aria-label="Painel">
          {nav
            .filter(
              ([href]) =>
                !admin ||
                ![
                  '/admin/tlds',
                  '/admin/pricing',
                  '/admin/registrars',
                ].includes(href) ||
                globalPermissions[user.globalRole].includes('pricing.manage'),
            )
            .map(([href, label, Icon]) => (
              <Link
                className={path === href ? 'active' : ''}
                key={href}
                href={href}
                onClick={() => setOpen(false)}
              >
                <Icon size={18} />
                {label}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <Link href={admin ? '/dashboard' : '/'} className="actions">
            <ArrowUpRight size={16} />
            {admin ? 'Área do cliente' : 'Visitar a loja'}
          </Link>
          {!admin && user.globalRole !== 'CUSTOMER' && (
            <Link href="/admin">Administração</Link>
          )}
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                await mutate('/auth/logout');
                router.push('/login');
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <LogOut size={17} /> Terminar sessão
          </Button>
        </div>
      </Sidebar>
      <div>
        <Topbar>
          <div className="actions">
            <Button
              variant="ghost"
              className="mobile-menu"
              aria-label="Abrir navegação"
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpen(!open)}
            >
              <Menu size={20} />
            </Button>
            {!admin && (
              <>
                <label className="sr-only" htmlFor="org-select">
                  Organização selecionada
                </label>
                <Select
                  id="org-select"
                  disabled={organizationLoading}
                  value={organization?.id || ''}
                  onChange={(e) => select(e.target.value)}
                >
                  {organizations.length === 0 && (
                    <option value="">
                      {organizationLoading ? 'A carregar…' : 'Sem organização'}
                    </option>
                  )}
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </Select>
              </>
            )}
            {admin && <strong>Administração da plataforma</strong>}
          </div>
          <div className="actions">
            <ThemeToggle />
            <span className="user-avatar">
              {user.firstName[0]}
              {user.lastName[0]}
            </span>
            <span className="user-name">{user.firstName}</span>
          </div>
        </Topbar>
        <main className="app-content">
          <Breadcrumb
            items={[
              'DevTrust',
              admin ? 'Administração' : 'Área do cliente',
              nav.find((n) => n[0] === path)?.[1] || '',
            ]}
          />
          {organizationLoading ? (
            <LoadingState />
          ) : organizationError ? (
            <div role="alert">
              <p className="error">{organizationError}</p>
              <Button
                onClick={() => refresh().catch((e) => toast.error(e.message))}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
