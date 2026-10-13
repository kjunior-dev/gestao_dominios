'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import {
  domainCheckSchema,
  DomainResult,
  PublicTld,
} from '@devtrust/contracts';
import { Search, ShoppingCart } from 'lucide-react';
import {
  Button,
  Card,
  Badge,
  Checkbox,
  LoadingState,
  Select,
  EmptyState,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { request, mutate } from '@/lib/api';
import { formatMoney } from './money';
const labels = {
  AVAILABLE: 'Disponível',
  REGISTERED: 'Registado',
  RESERVED: 'Reservado',
  UNAVAILABLE: 'Indisponível',
  UNKNOWN: 'Não confirmado',
};
export function DomainSearch() {
  const [catalog, setCatalog] = useState<PublicTld[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [results, setResults] = useState<DomainResult[] | null>(null),
    [error, setError] = useState(''),
    [adding, setAdding] = useState(''),
    [catalogError, setCatalogError] = useState(''),
    [catalogRevision, setCatalogRevision] = useState(0);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof domainCheckSchema>>({
    resolver: zodResolver(domainCheckSchema),
    defaultValues: { registrationYears: 1 },
  });
  useEffect(() => {
    let active = true;
    request<PublicTld[]>('/tlds')
      .then((list) => {
        if (active) {
          setCatalog(list);
          setSelected(
            list
              .filter((t) => t.isFeatured)
              .slice(0, 3)
              .map((t) => t.extension),
          );
        }
      })
      .catch((e) => {
        if (active) setCatalogError(e.message);
      });
    return () => {
      active = false;
    };
  }, [catalogRevision]);
  const canSearch = Boolean(catalog?.length);
  const retryCatalog = () => {
    setCatalog(null);
    setCatalogError('');
    setCatalogRevision((v) => v + 1);
  };
  return (
    <div className="domain-search">
      <form
        onSubmit={handleSubmit(async (values) => {
          if (!canSearch) return;
          setError('');
          setResults(null);
          try {
            const body = domainCheckSchema.parse({
              ...values,
              ...(selected.length ? { extensions: selected } : {}),
            });
            setResults(await mutate<DomainResult[]>('/domains/check', body));
          } catch (e) {
            setError((e as Error).message);
          }
        })}
      >
        <div className="search-box">
          <Search size={22} aria-hidden />
          <label className="sr-only" htmlFor="domain">
            Nome de domínio
          </label>
          <input
            id="domain"
            placeholder="O nome da sua próxima ideia"
            maxLength={253}
            disabled={!canSearch}
            {...register('query')}
            required
          />
          <Button disabled={isSubmitting || !canSearch}>
            {isSubmitting ? 'A pesquisar…' : 'Pesquisar domínio'}
          </Button>
        </div>
        {errors.query && (
          <p role="alert" className="error">
            {errors.query.message}
          </p>
        )}
        <div className="search-options">
          {catalog?.map((t) => (
            <label key={t.id}>
              <Checkbox
                checked={selected.includes(t.extension)}
                onChange={(e) =>
                  setSelected((prev) =>
                    e.target.checked
                      ? [...prev, t.extension].slice(0, 10)
                      : prev.filter((x) => x !== t.extension),
                  )
                }
              />
              .{t.extension}
            </label>
          ))}
          <label>
            Período{' '}
            <Select
              aria-label="Período de registo"
              disabled={!canSearch}
              {...register('registrationYears', { valueAsNumber: true })}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1} {i === 0 ? 'ano' : 'anos'}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </form>
      {catalog === null && !catalogError && <LoadingState />}
      {catalogError && (
        <div role="alert" className="message error">
          <p>{catalogError}</p>
          <Button variant="secondary" onClick={retryCatalog}>
            Tentar novamente
          </Button>
        </div>
      )}
      {catalog?.length === 0 && (
        <Card>
          <EmptyState
            title="Pesquisa temporariamente indisponível"
            description="Ainda não existem extensões disponíveis para pesquisar."
            action={
              <Button variant="secondary" onClick={retryCatalog}>
                Atualizar extensões
              </Button>
            }
          />
        </Card>
      )}
      <p className="search-note">
        Disponibilidade consultada no fornecedor quando a integração está ativa.
        A cotação é temporária; não constitui uma compra.
      </p>
      {error && (
        <p className="message error" role="alert">
          {error}
        </p>
      )}
      {isSubmitting && <LoadingState />}
      {results && (
        <div className="search-results" aria-live="polite">
          {results.map((result) => (
            <Card key={result.domainName} className="domain-result">
              <div>
                <h3>{result.domainName}</h3>
                <div className="actions">
                  <Badge
                    variant={
                      result.status === 'AVAILABLE'
                        ? 'success'
                        : result.status === 'UNKNOWN'
                          ? 'warning'
                          : 'neutral'
                    }
                  >
                    {labels[result.status]}
                  </Badge>
                  {result.isPremium && <Badge variant="warning">Premium</Badge>}
                </div>
                <p>
                  {result.cacheHit ? 'Resultado em cache · ' : ''}Consultado às{' '}
                  {new Date(result.checkedAt).toLocaleTimeString('pt-PT')}
                </p>
                {result.errorCode && (
                  <p>
                    {result.status === 'UNKNOWN'
                      ? 'Não foi possível confirmar a disponibilidade. Tente novamente.'
                      : 'Cotação indisponível. Tente novamente mais tarde.'}
                  </p>
                )}
              </div>
              <div className="domain-result-price">
                {result.quote ? (
                  <>
                    <strong>
                      {formatMoney(
                        result.quote.priceMinor,
                        result.quote.currency,
                      )}
                    </strong>
                    <p>
                      Registo por {result.quote.periodYears}{' '}
                      {result.quote.periodYears === 1 ? 'ano' : 'anos'}
                    </p>
                  </>
                ) : (
                  <p>Sem preço confirmado</p>
                )}
                <Button
                  disabled={
                    result.status !== 'AVAILABLE' ||
                    !result.quote ||
                    Boolean(adding)
                  }
                  onClick={async () => {
                    setAdding(result.domainName);
                    try {
                      await request('/cart');
                      await mutate('/cart/items', {
                        domainName: result.domainName,
                        registrationYears: result.quote!.periodYears,
                      });
                      toast.success('Domínio adicionado ao carrinho');
                    } catch (e) {
                      toast.error((e as Error).message);
                    } finally {
                      setAdding('');
                    }
                  }}
                >
                  <ShoppingCart size={16} />
                  {adding === result.domainName
                    ? 'A confirmar…'
                    : 'Adicionar ao carrinho'}
                </Button>
              </div>
            </Card>
          ))}
          <Link className="text-link" href="/carrinho">
            Consultar carrinho
          </Link>
        </div>
      )}
    </div>
  );
}
export function TldCatalog({ featured = false }: { featured?: boolean }) {
  const [items, setItems] = useState<PublicTld[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request<PublicTld[]>('/tlds')
      .then((items) => {
        if (active) setItems(items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p role="alert" className="error">
        {error}
      </p>
    );
  if (!items) return <LoadingState />;
  const list = featured ? items.filter((t) => t.isFeatured) : items;
  if (!list.length)
    return (
      <p className="search-note">
        Ainda não existem extensões publicadas. Não existem preços ou
        disponibilidades confirmados.
      </p>
    );
  return (
    <div className="grid-3 tld-catalog">
      {list.map((t) => (
        <Card key={t.id}>
          <h3>.{t.extension}</h3>
          <p>{t.displayName}</p>
          {t.price ? (
            <>
              <strong>
                {formatMoney(t.price.priceMinor, t.price.currency)}
              </strong>
              <p>Registo standard · {t.price.periodYears} ano(s)</p>
            </>
          ) : (
            <p>Preço ainda não publicado</p>
          )}
          <small>
            Preço indicativo do catálogo. Domínios premium e a cotação
            individual podem ter valores diferentes.
          </small>
        </Card>
      ))}
    </div>
  );
}
