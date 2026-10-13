'use client';
import { useState, useEffect } from 'react';
import type {
  PublicUserSummary,
  Organization,
  AuditEntry,
  Page,
} from '@devtrust/contracts';
import { globalPermissions } from '@devtrust/contracts';
import {
  PageHeader,
  Card,
  Table,
  Input,
  Select,
  Pagination,
  LoadingState,
  EmptyState,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { request, mutate } from '@/lib/api';
type Kind = 'users' | 'organizations' | 'audit-logs';
export function AdminList({ kind }: { kind: Kind }) {
  const { user } = useAccount(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [data, setData] = useState<Page<
      PublicUserSummary | Organization | AuditEntry
    > | null>(null),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const title = {
    users: 'Utilizadores',
    organizations: 'Organizações',
    'audit-logs': 'Auditoria',
  }[kind];
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      const q = new URLSearchParams({
        page: String(page),
        pageSize: '20',
        search,
        ...(status ? { status } : {}),
      });
      request<Page<PublicUserSummary | Organization | AuditEntry>>(
        '/admin/' + kind + '?' + q,
      )
        .then((result) => {
          if (active) {
            setData(result);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [kind, page, search, status, revision]);
  async function update(id: string, body: unknown) {
    try {
      await mutate('/admin/' + kind + '/' + id, body, 'PATCH');
      setRevision((r) => r + 1);
      toast.success('Alteração guardada e auditada');
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  const manage = globalPermissions[user.globalRole].includes(
    kind === 'users' ? 'users.update' : 'organizations.update',
  );
  return (
    <>
      <PageHeader
        title={title}
        description="Pesquisa e gestão dos registos da plataforma."
      />
      <Card>
        <div className="filter-row">
          <Input
            aria-label="Pesquisar registos"
            placeholder="Pesquisar…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          {kind !== 'audit-logs' && (
            <Select
              aria-label="Filtrar por estado"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos os estados</option>
              <option value="ACTIVE">Ativo</option>
              <option value="SUSPENDED">Suspenso</option>
            </Select>
          )}
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !data ? (
          <LoadingState />
        ) : data.items.length === 0 ? (
          <EmptyState
            title="Sem registos"
            description="Não foram encontrados resultados para os filtros selecionados."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  {(kind === 'users'
                    ? ['Nome', 'Email', 'Papel', 'Estado']
                    : kind === 'organizations'
                      ? ['Organização', 'País', 'Tipo', 'Estado']
                      : ['Ação', 'Recurso', 'Ator', 'Data']
                  ).map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  if (kind === 'users') {
                    const u = item as PublicUserSummary;
                    return (
                      <tr key={u.id}>
                        <td>
                          {u.firstName} {u.lastName}
                        </td>
                        <td>{u.email}</td>
                        <td>
                          {user.globalRole === 'SUPER_ADMIN' &&
                          u.id !== user.id &&
                          u.globalRole !== 'SUPER_ADMIN' ? (
                            <Select
                              aria-label={'Papel de ' + u.email}
                              value={u.globalRole}
                              onChange={(e) =>
                                void update(u.id, {
                                  globalRole: e.target.value,
                                })
                              }
                            >
                              {['CUSTOMER', 'SUPPORT', 'ADMIN'].map((r) => (
                                <option key={r}>{r}</option>
                              ))}
                            </Select>
                          ) : (
                            u.globalRole
                          )}
                        </td>
                        <td>
                          {manage &&
                          u.id !== user.id &&
                          u.globalRole !== 'SUPER_ADMIN' ? (
                            <Select
                              aria-label={'Estado de ' + u.email}
                              value={u.status}
                              onChange={(e) =>
                                void update(u.id, { status: e.target.value })
                              }
                            >
                              <option value="ACTIVE">Ativo</option>
                              <option value="SUSPENDED">Suspenso</option>
                            </Select>
                          ) : (
                            u.status
                          )}
                        </td>
                      </tr>
                    );
                  }
                  if (kind === 'organizations') {
                    const o = item as Organization;
                    return (
                      <tr key={o.id}>
                        <td>{o.name}</td>
                        <td>{o.country}</td>
                        <td>{o.type}</td>
                        <td>
                          {manage ? (
                            <Select
                              aria-label={'Estado de ' + o.name}
                              value={o.status}
                              onChange={(e) =>
                                void update(o.id, { status: e.target.value })
                              }
                            >
                              <option value="ACTIVE">Ativo</option>
                              <option value="SUSPENDED">Suspenso</option>
                            </Select>
                          ) : (
                            o.status
                          )}
                        </td>
                      </tr>
                    );
                  }
                  const a = item as AuditEntry;
                  return (
                    <tr key={a.id}>
                      <td>{a.action}</td>
                      <td>{a.resourceType}</td>
                      <td>{a.actorUserId || 'Sistema'}</td>
                      <td>{new Date(a.createdAt).toLocaleString('pt-PT')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={data.pageSize}
              total={data.total}
              onChange={setPage}
            />
          </>
        )}
      </Card>
    </>
  );
}
