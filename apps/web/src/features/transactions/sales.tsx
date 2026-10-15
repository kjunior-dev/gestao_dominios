'use client';
import { useEffect, useState } from 'react';
import { PageHeader, Card, Badge, LoadingState } from '@devtrust/ui';
import { request } from '@/lib/api';
import { formatMoney } from '../domains/money';
type Sales = {
  orders: { environment: string; status: string; _count: number }[];
  registrations: { status: string; environment: string; _count: number }[];
  completedGrossMargins: {
    environment: string;
    currency: string;
    grossMarginMinor: string;
  }[];
  marginPolicy: string;
  received: {
    environment: string;
    currency: string;
    provider: string;
    _sum: { amountMinor: string };
    refundedMinor: string;
    netReceivedMinor: string;
    _count: number;
  }[];
  note: string;
};
export function Sales() {
  const [data, setData] = useState<Sales | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    request<Sales>('/admin/sales')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  if (error) return <Card role="alert">{error}</Card>;
  if (!data) return <LoadingState />;
  return (
    <>
      <PageHeader
        title="Vendas"
        description="Pagamentos confirmados separados por ambiente, moeda e método."
      />
      <p>{data.note}</p>
      <div className="grid-2 section-gap">
        <Card>
          <h2>Encomendas</h2>
          {data.orders.length ? (
            data.orders.map((o, i) => (
              <p key={i}>
                <Badge>{o.environment}</Badge> {o.status}: {o._count}
              </p>
            ))
          ) : (
            <p>Sem encomendas.</p>
          )}
        </Card>
        <Card>
          <h2>Pagamentos confirmados</h2>
          {data.received.length ? (
            data.received.map((p, i) => (
              <div key={i}>
                <Badge
                  variant={p.environment === 'LIVE' ? 'success' : 'warning'}
                >
                  {p.environment}
                </Badge>
                <p>
                  {formatMoney(p._sum.amountMinor, p.currency)} · {p.provider} ·{' '}
                  {p._count} pagamento(s)
                </p>
                <p>
                  Reembolsado: {formatMoney(p.refundedMinor, p.currency)} ·
                  Recebido líquido:{' '}
                  {formatMoney(p.netReceivedMinor, p.currency)}
                </p>
              </div>
            ))
          ) : (
            <p>Sem pagamentos confirmados.</p>
          )}
        </Card>
        <Card>
          <h2>Margem bruta das linhas registadas</h2>
          <p>{data.marginPolicy}</p>
          {data.completedGrossMargins.map((m, i) => (
            <p key={i}>
              <Badge>{m.environment}</Badge>{' '}
              {formatMoney(m.grossMarginMinor, m.currency)}
            </p>
          ))}
        </Card>
        <Card>
          <h2>Registos</h2>
          {data.registrations.length ? (
            data.registrations.map((r) => (
              <p key={r.status + r.environment}>
                <Badge>{r.environment}</Badge> {r.status}: {r._count}
              </p>
            ))
          ) : (
            <p>Sem registos.</p>
          )}
        </Card>
      </div>
    </>
  );
}
