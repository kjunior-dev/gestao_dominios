'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { OrderView } from '@devtrust/contracts';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  LoadingState,
  FormField,
  Input,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { request, mutate } from '@/lib/api';
import { formatMoney } from '../domains/money';
export function OrderDetail({
  id,
  admin = false,
  confirmation = false,
}: {
  id: string;
  admin?: boolean;
  confirmation?: boolean;
}) {
  const [order, setOrder] = useState<OrderView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [refundReason, setRefundReason] = useState(''),
    [refundAmount, setRefundAmount] = useState(''),
    router = useRouter();
  useEffect(() => {
    let active = true;
    const load = () =>
      request<OrderView>((admin ? '/admin' : '') + '/orders/' + id)
        .then((o) => {
          if (active) {
            setOrder(o);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    void load();
    const timer = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [id, admin]);
  async function action(task: () => Promise<unknown>) {
    setBusy(true);
    try {
      await task();
      toast.success('Pedido recebido. Aguarde a atualização do estado.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return (
      <Card role="alert">
        <p className="error">{error}</p>
      </Card>
    );
  if (!order) return <LoadingState />;
  return (
    <>
      <PageHeader
        title={order.orderNumber}
        description={
          confirmation
            ? 'Confirme o resumo e inicie o pagamento de teste.'
            : 'Acompanhe pagamento e registo separadamente.'
        }
      />
      <Badge variant={order.environment === 'LIVE' ? 'neutral' : 'warning'}>
        {order.environment}{' '}
        {order.environment === 'MOCK' ? '· Sem cobrança ou registo real' : ''}
      </Badge>
      <div className="grid-2 section-gap">
        <Card>
          <h2>Encomenda</h2>
          <Badge>{order.status}</Badge>
          {order.items.map((i) => (
            <div key={i.id} className="section-gap">
              <h3>{i.domainName}</h3>
              <p>
                {i.registrationYears} ano(s) ·{' '}
                {formatMoney(i.salePriceMinor, order.currency)}
              </p>
              <Badge>{i.status}</Badge>
            </div>
          ))}
          <h3>Total: {formatMoney(order.totalMinor, order.currency)}</h3>
          <p>
            Uma encomenda paga só fica concluída após confirmação do registo.
          </p>
        </Card>
        <Card>
          <h2>Pagamento</h2>
          {order.payments.map((p) => (
            <div key={p.id} className="section-gap">
              <Badge>{p.status}</Badge>
              <p>
                {p.provider} · {p.environment} ·{' '}
                {formatMoney(p.amountMinor, p.currency)}
              </p>
              {!admin &&
                p.environment === 'MOCK' &&
                ['PENDING', 'PROCESSING'].includes(p.status) && (
                  <div className="actions">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        action(() =>
                          mutate('/payments/' + p.id + '/mock-confirm', {
                            outcome: 'PAID',
                          }),
                        )
                      }
                    >
                      Simular pagamento aprovado
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        action(() =>
                          mutate('/payments/' + p.id + '/mock-confirm', {
                            outcome: 'DECLINED',
                          }),
                        )
                      }
                    >
                      Simular pagamento recusado
                    </Button>
                  </div>
                )}
              {p.refunds?.map((r) => (
                <div key={r.id} className="section-gap">
                  <strong>Pedido de reembolso</strong>
                  <p>
                    {formatMoney(r.amountMinor, r.currency)} ·{' '}
                    {r.status === 'REQUESTED'
                      ? 'Pedido recebido'
                      : r.status === 'APPROVED'
                        ? 'Aprovado'
                        : r.status === 'COMPLETED'
                          ? 'Concluído'
                          : r.status === 'REJECTED'
                            ? 'Rejeitado'
                            : r.status === 'UNKNOWN'
                              ? 'Resultado por confirmar'
                              : 'Em processamento'}
                  </p>
                  <p>{r.reason}</p>
                </div>
              ))}
              {!admin && ['PAID', 'PARTIALLY_REFUNDED'].includes(p.status) && (
                <form
                  className="form-stack section-gap"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(() =>
                      mutate('/refunds', {
                        paymentId: p.id,
                        amountMinor: refundAmount,
                        reason: refundReason,
                        idempotencyKey: crypto.randomUUID(),
                      }),
                    );
                  }}
                >
                  <h3>Solicitar reembolso</h3>
                  <FormField
                    id="refund-amount"
                    label="Montante em unidades menores (100 = 1 CVE)"
                  >
                    <Input
                      id="refund-amount"
                      value={refundAmount}
                      required
                      pattern="[1-9][0-9]*"
                      onChange={(e) => setRefundAmount(e.target.value)}
                    />
                  </FormField>
                  <FormField id="refund-reason" label="Motivo">
                    <Input
                      id="refund-reason"
                      value={refundReason}
                      required
                      minLength={5}
                      onChange={(e) => setRefundReason(e.target.value)}
                    />
                  </FormField>
                  <Button variant="secondary" disabled={busy}>
                    Solicitar análise de reembolso
                  </Button>
                  <p>O pedido não equivale a um reembolso concluído.</p>
                </form>
              )}
            </div>
          ))}
          {!admin &&
            !order.payments.length &&
            order.status === 'PENDING_PAYMENT' && (
              <Button
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    await mutate('/payments', {
                      orderId: id,
                      provider: 'mock',
                    });
                    router.push('/checkout/resultado/' + id);
                  })
                }
              >
                Iniciar pagamento mock
              </Button>
            )}
          <Link href="/dashboard/faturas">
            Consultar comprovativos internos
          </Link>
        </Card>
      </div>
      <Card className="section-gap">
        <h2>Histórico de estados</h2>
        {order.transitions.map((t, i) => (
          <p key={i}>
            {new Date(t.createdAt).toLocaleString('pt-PT')} · {t.fromStatus} →{' '}
            {t.toStatus} · {t.reason}
          </p>
        ))}
      </Card>
    </>
  );
}
