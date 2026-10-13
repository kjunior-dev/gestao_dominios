'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CartView } from '@devtrust/contracts';
import {
  Button,
  Card,
  Badge,
  Select,
  PageHeader,
  LoadingState,
  EmptyState,
  ConfirmDialog,
} from '@devtrust/ui';
import { mutate, request } from '@/lib/api';
import { formatMoney } from './money';
export function ShoppingCart() {
  const [cart, setCart] = useState<CartView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const load = () =>
    request<CartView>('/cart')
      .then(setCart)
      .catch((e) => setError(e.message));
  useEffect(() => {
    let active = true;
    request<CartView>('/cart')
      .then((c) => {
        if (active) setCart(c);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const change = async (id: string, years: number) => {
    setBusy(id);
    setError('');
    try {
      setCart(
        await mutate<CartView>(
          '/cart/items/' + id,
          { registrationYears: years },
          'PATCH',
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  };
  return (
    <>
      <PageHeader
        title="O seu carrinho"
        description="Cotações temporárias. Não existe checkout ou compra de domínios nesta fase."
      />
      {error && (
        <div role="alert" className="message error">
          {error}
          <Button variant="ghost" onClick={load}>
            Atualizar carrinho
          </Button>
        </div>
      )}
      {!cart && !error ? (
        <LoadingState />
      ) : (
        cart &&
        (!cart.items.length ? (
          <Card>
            <EmptyState
              title="O carrinho está vazio"
              description="Pesquise um domínio para consultar a disponibilidade e preparar uma cotação."
              action={
                <Button asChild>
                  <Link href="/dominios/pesquisar">Pesquisar domínio</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="search-results">
              {cart.items.map((item) => (
                <Card className="domain-result" key={item.id}>
                  <div>
                    <h3>{item.domainName}</h3>
                    {item.isPremium && (
                      <Badge variant="warning">
                        Premium · Cotação individual
                      </Badge>
                    )}
                    <label>
                      Período de {item.domainName}
                      <Select
                        aria-label={'Período de ' + item.domainName}
                        value={item.registrationYears}
                        disabled={Boolean(busy)}
                        onChange={(e) =>
                          void change(item.id, Number(e.target.value))
                        }
                      >
                        {Array.from(
                          {
                            length: item.maximumPeriod - item.minimumPeriod + 1,
                          },
                          (_, i) => (
                            <option key={i} value={i + item.minimumPeriod}>
                              {i + item.minimumPeriod} ano(s)
                            </option>
                          ),
                        )}
                      </Select>
                    </label>
                    <p>
                      Cotação válida até{' '}
                      {new Date(item.quoteExpiresAt).toLocaleString('pt-PT')}
                    </p>
                  </div>
                  <div>
                    <strong>
                      {formatMoney(item.unitPriceMinor, item.currency)}
                    </strong>
                    <div className="actions">
                      <Button
                        variant="secondary"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          void change(item.id, item.registrationYears)
                        }
                      >
                        Revalidar cotação
                      </Button>
                      <ConfirmDialog
                        title="Remover domínio?"
                        description="O domínio será removido do carrinho."
                        onConfirm={async () => {
                          setCart(
                            await mutate<CartView>(
                              '/cart/items/' + item.id,
                              {},
                              'DELETE',
                            ),
                          );
                        }}
                      >
                        Remover
                      </ConfirmDialog>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <Card className="cart-total">
              <strong>
                Subtotal: {formatMoney(cart.subtotalMinor, cart.currency)}
              </strong>
              {cart.requiresRevalidation && (
                <p role="status" className="error">
                  Existem cotações expiradas. Revalide os itens antes de avançar
                  numa fase futura.
                </p>
              )}
              <p>
                Este carrinho não garante disponibilidade. Não foi efetuado
                qualquer registo ou pagamento.
              </p>
              <ConfirmDialog
                title="Limpar carrinho?"
                description="Todos os itens serão removidos."
                onConfirm={async () =>
                  setCart(await mutate<CartView>('/cart', {}, 'DELETE'))
                }
              >
                Limpar carrinho
              </ConfirmDialog>
            </Card>
          </>
        ))
      )}
    </>
  );
}
