'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CartView, DomainResult } from '@devtrust/contracts';
import {
  Button,
  Card,
  Badge,
  Select,
  PageHeader,
  LoadingState,
  EmptyState,
  ConfirmDialog,
  Checkbox,
} from '@devtrust/ui';
import { mutate, request } from '@/lib/api';
import { formatMoney } from './money';
export function ShoppingCart() {
  const [cart, setCart] = useState<CartView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(''),
    [pending, setPending] = useState<{
      id: string;
      result: DomainResult;
    } | null>(null),
    [accepted, setAccepted] = useState(false),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const expired =
    cart?.items.some((i) => new Date(i.quoteExpiresAt).getTime() <= now) ??
    false;
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
      const results = await mutate<DomainResult[]>('/domains/check', {
        query: cart!.items.find((i) => i.id === id)!.domainName,
        registrationYears: years,
      });
      const result = results[0];
      if (!result?.quote || result.status !== 'AVAILABLE')
        throw new Error('Preço indisponível');
      setAccepted(false);
      setPending({ id, result });
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
        description="Cotações temporárias. Confirme dados, preço e disponibilidade no checkout."
      />
      {error && (
        <div role="alert" className="message error">
          {error}
          <Button variant="ghost" onClick={load}>
            Atualizar carrinho
          </Button>
        </div>
      )}
      {pending?.result.quote && (
        <Card role="region" aria-label="Confirmar nova cotação">
          <h2>Confirmar nova cotação de {pending.result.domainName}</h2>
          <p>
            {formatMoney(
              pending.result.quote.priceMinor,
              pending.result.quote.currency,
            )}{' '}
            por {pending.result.quote.periodYears} ano(s)
          </p>
          {pending.result.isPremium && (
            <label>
              <Checkbox
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
              />
              Aceito explicitamente este valor premium
            </label>
          )}
          <Button
            disabled={
              Boolean(busy) ||
              new Date(pending.result.quote.expiresAt).getTime() <= now ||
              (pending.result.isPremium && !accepted)
            }
            onClick={async () => {
              setBusy(pending.id);
              setError('');
              try {
                setCart(
                  await mutate<CartView>(
                    '/cart/items/' + pending.id,
                    {
                      registrationYears: pending.result.quote!.periodYears,
                      quoteToken: pending.result.quote!.quoteToken,
                      acceptPremium: pending.result.isPremium && accepted,
                    },
                    'PATCH',
                  ),
                );
                setPending(null);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy('');
              }
            }}
          >
            Confirmar cotação
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            Cancelar
          </Button>
        </Card>
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
              {(cart.requiresRevalidation || expired) && (
                <p role="status" className="error">
                  Existem cotações expiradas. Revalide os itens antes de avançar
                  no checkout.
                </p>
              )}
              <p>
                Este carrinho não garante disponibilidade. Não foi efetuado
                qualquer registo ou pagamento.
              </p>
              <Button asChild disabled={cart.requiresRevalidation || expired}>
                <Link href="/checkout">Continuar para checkout</Link>
              </Button>
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
