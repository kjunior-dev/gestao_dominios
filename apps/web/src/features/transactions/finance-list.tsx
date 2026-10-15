'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CommerceRecord, Page, globalPermissions } from '@devtrust/contracts';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  Table,
  Pagination,
  LoadingState,
  EmptyState,
  ConfirmDialog,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { request, mutate } from '@/lib/api';
import { formatMoney } from '../domains/money';
type Kind =
  | 'orders'
  | 'payments'
  | 'invoices'
  | 'domains'
  | 'registrations'
  | 'refunds'
  | 'operations';
const titles: Record<Kind, string> = {
  orders: 'Encomendas',
  payments: 'Pagamentos',
  invoices: 'Comprovativos internos',
  domains: 'Domínios',
  registrations: 'Registos',
  refunds: 'Reembolsos',
  operations: 'Operações e filas',
};
export function FinanceList({
  kind,
  admin = false,
}: {
  kind: Kind;
  admin?: boolean;
}) {
  const { user } = useAccount();
  const [items, setItems] = useState<
      (CommerceRecord & { orderNumber?: string } & {
        item?: { domainName: string };
        topic?: string;
        completedAt?: string;
        publishedAt?: string;
        lastErrorCode?: string;
      })[]
    >([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [environment, setEnvironment] = useState(''),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<{ id: string; action: string } | null>(
      null,
    ),
    [reason, setReason] = useState('');
  const permission =
    kind === 'orders'
      ? 'orders.read'
      : kind === 'payments'
        ? 'payments.read'
        : kind === 'invoices'
          ? 'billing.manage'
          : kind === 'registrations'
            ? 'domains.manage'
            : kind === 'refunds'
              ? 'refunds.approve'
              : 'operations.manage';
  const allowed =
    !admin || globalPermissions[user.globalRole].includes(permission);
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    request<Page<CommerceRecord> | CommerceRecord[]>(
      (admin ? '/admin' : '') +
        '/' +
        kind +
        (admin || kind === 'orders'
          ? '?' +
            new URLSearchParams({
              page: String(page),
              pageSize: '20',
              search,
              ...(environment ? { environment } : {}),
            })
          : ''),
    )
      .then((data) => {
        if (active) {
          setItems(Array.isArray(data) ? data : data.items);
          setTotal(Array.isArray(data) ? data.length : data.total);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [kind, admin, page, search, environment, revision, allowed]);
  if (!allowed)
    return (
      <Card>
        <EmptyState
          title="Sem permissão"
          description="Este módulo requer autorização administrativa específica."
        />
      </Card>
    );
  return (
    <>
      <PageHeader
        title={titles[kind]}
        description={
          kind === 'invoices'
            ? 'Documentos internos sem validade fiscal.'
            : 'Os estados apresentados vêm da base de dados; confirme sempre o ambiente da operação.'
        }
      />
      {(admin || kind === 'orders') && (
        <div className="actions section-gap">
          <Input
            aria-label="Pesquisar registos"
            placeholder="Pesquisar…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <Select
            aria-label="Ambiente"
            value={environment}
            onChange={(e) => {
              setEnvironment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os ambientes</option>
            {['MOCK', 'SANDBOX', 'LIVE'].map((e) => (
              <option key={e}>{e}</option>
            ))}
          </Select>
        </div>
      )}
      <Card className="section-gap">
        {error ? (
          <div role="alert">
            <p className="error">{error}</p>
            <Button onClick={() => setRevision((v) => v + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : loading ? (
          <LoadingState />
        ) : !items.length ? (
          <EmptyState
            title="Sem registos"
            description="Ainda não existem operações nesta área."
          />
        ) : (
          <>
            <Table>
              <thead>
                <tr>
                  <th>Referência</th>
                  <th>Estado</th>
                  <th>Ambiente</th>
                  <th>Valor</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.orderNumber ||
                        i.invoiceNumber ||
                        i.domainName ||
                        i.item?.domainName ||
                        i.topic ||
                        i.id.slice(0, 8)}
                    </td>
                    <td>
                      <Badge>
                        {i.status ||
                          (i.completedAt
                            ? 'PROCESSADO'
                            : i.publishedAt
                              ? 'EM FILA'
                              : 'POR PUBLICAR')}
                      </Badge>
                      {i.lastErrorCode && <p>{i.lastErrorCode}</p>}
                    </td>
                    <td>{i.environment || '—'}</td>
                    <td>
                      {i.totalMinor || i.amountMinor
                        ? formatMoney(
                            i.totalMinor || i.amountMinor!,
                            i.currency || 'CVE',
                          )
                        : '—'}
                    </td>
                    <td>
                      {kind === 'orders' && (
                        <Link
                          href={
                            (admin ? '/admin' : '/dashboard') +
                            '/encomendas/' +
                            i.id
                          }
                        >
                          Consultar
                        </Link>
                      )}
                      {kind === 'domains' && (
                        <Link href={'/dashboard/dominios/' + i.id}>
                          Consultar
                        </Link>
                      )}
                      {kind === 'invoices' && !admin && (
                        <a href={'/api/v1/invoices/' + i.id + '/pdf'}>
                          Download PDF
                        </a>
                      )}
                      {admin &&
                        kind === 'refunds' &&
                        i.status === 'REQUESTED' && (
                          <div className="actions">
                            <Button
                              size="sm"
                              onClick={() =>
                                setSelected({ id: i.id, action: 'APPROVE' })
                              }
                            >
                              Aprovar
                            </Button>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                setSelected({ id: i.id, action: 'REJECT' })
                              }
                            >
                              Rejeitar
                            </Button>
                          </div>
                        )}
                      {admin &&
                        kind === 'registrations' &&
                        ['BLOCKED', 'MANUAL_REVIEW', 'FAILED'].includes(
                          i.status,
                        ) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setSelected({ id: i.id, action: 'RESUME' })
                            }
                          >
                            Retomar intenção não submetida
                          </Button>
                        )}
                      {admin && kind === 'operations' && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            setSelected({ id: i.id, action: 'RETRY' })
                          }
                        >
                          Pedir recuperação
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {(admin || kind === 'orders') && (
              <Pagination
                page={page}
                total={total}
                pageSize={20}
                onChange={setPage}
              />
            )}
          </>
        )}
      </Card>
      {selected && (
        <Card className="section-gap">
          <h2>Confirmar ação administrativa</h2>
          <p>
            Decisões ficam auditadas. A recuperação de registos consulta o
            fornecedor e nunca repete cegamente o POST.
          </p>
          <Input
            aria-label="Justificação"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Justificação obrigatória"
          />
          <div className="actions">
            <ConfirmDialog
              title="Confirmar decisão?"
              description="Esta ação será auditada e requer autorização no backend."
              onConfirm={async () => {
                if (reason.trim().length < 10)
                  throw new Error('Justificação com pelo menos 10 caracteres.');
                try {
                  await mutate(
                    selected.action === 'RESUME'
                      ? '/admin/registrations/' + selected.id + '/resume'
                      : selected.action === 'RETRY'
                        ? '/admin/operations/' + selected.id + '/retry'
                        : '/admin/refunds/' + selected.id + '/decision',
                    ['RETRY', 'RESUME'].includes(selected.action)
                      ? { reason }
                      : { decision: selected.action, reason },
                  );
                  setSelected(null);
                  setReason('');
                  setRevision((v) => v + 1);
                  toast.success('Ação registada');
                } catch (e) {
                  throw e;
                }
              }}
            >
              Confirmar{' '}
              {selected.action === 'APPROVE'
                ? 'aprovação'
                : selected.action === 'REJECT'
                  ? 'rejeição'
                  : 'recuperação'}
            </ConfirmDialog>
            <Button variant="ghost" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
          </div>
        </Card>
      )}
    </>
  );
}
