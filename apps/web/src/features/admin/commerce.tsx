'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import {
  tldSchema,
  priceSchema,
  exchangeRateSchema,
  TldView,
  RegistrarView,
  PriceView,
  ExchangeRateView,
  SearchMetrics,
  Page,
  globalPermissions,
} from '@devtrust/contracts';
import {
  Button,
  Input,
  Select,
  Checkbox,
  Card,
  Table,
  Pagination,
  PageHeader,
  LoadingState,
  EmptyState,
  Badge,
  FormField,
  StatCard,
  ConfirmDialog,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { request, mutate } from '@/lib/api';
import { useAccount } from '@/hooks/account-context';
import { formatMoney } from '@/features/domains/money';
export function CatalogAdmin() {
  const [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [registrar, setRegistrar] = useState(''),
    [registrars, setRegistrars] = useState<RegistrarView[]>([]),
    [data, setData] = useState<Page<TldView> | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    request<RegistrarView[]>('/admin/registrars')
      .then(setRegistrars)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setData(null);
      setError('');
      request<Page<TldView>>(
        '/admin/tlds?' +
          new URLSearchParams({
            page: String(page),
            search,
            ...(registrar ? { registrarId: registrar } : {}),
          }),
      )
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [page, search, registrar]);
  return (
    <>
      <PageHeader
        title="Catálogo de extensões"
        description="Ative apenas extensões e capacidades confirmadas pelo fornecedor."
        action={
          <Button asChild>
            <Link href="/admin/tlds/new">Adicionar extensão</Link>
          </Button>
        }
      />
      <div className="commerce-filter">
        <Input
          aria-label="Pesquisar extensões"
          placeholder="Pesquisar extensão"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          aria-label="Filtrar fornecedor"
          value={registrar}
          onChange={(e) => {
            setRegistrar(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os fornecedores</option>
          {registrars.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !data ? (
        <LoadingState />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Extensão</th>
                <th>Estado</th>
                <th>Fornecedor</th>
                <th>Sincronização</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    .{t.extension} {t.isFeatured && <Badge>Destaque</Badge>}
                  </td>
                  <td>
                    <Badge variant={t.isActive ? 'success' : 'neutral'}>
                      {t.isActive ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </td>
                  <td>
                    {t.registrars.map((r) => r.registrar.name).join(', ')}
                  </td>
                  <td>
                    {t.registrars[0]?.lastSyncedAt
                      ? new Date(
                          t.registrars[0].lastSyncedAt,
                        ).toLocaleDateString('pt-PT')
                      : 'Não sincronizada'}
                  </td>
                  <td>
                    <Link href={'/admin/tlds/' + t.id}>Editar</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          {!data.total && (
            <EmptyState
              title="Sem extensões"
              description="Adicione uma extensão ou sincronize o catálogo da Openprovider."
            />
          )}
          <Pagination
            page={page}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        </Card>
      )}
    </>
  );
}
export function TldEditor({ id }: { id?: string }) {
  const router = useRouter(),
    [registrars, setRegistrars] = useState<RegistrarView[]>([]),
    [error, setError] = useState(''),
    [ready, setReady] = useState(!id);
  const {
    register,
    reset,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.input<typeof tldSchema>>({
    resolver: zodResolver(tldSchema),
    defaultValues: {
      isActive: false,
      isFeatured: false,
      supportsRegistration: true,
      supportsTransfer: false,
      supportsRenewal: false,
      minimumPeriod: 1,
      maximumPeriod: 10,
    },
  });
  useEffect(() => {
    let active = true;
    request<RegistrarView[]>('/admin/registrars')
      .then((r) => {
        if (active) setRegistrars(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    if (id)
      request<TldView>('/admin/tlds/' + id)
        .then((t) => {
          if (!active) return;
          const link = t.registrars[0];
          reset({
            extension: t.extension,
            displayName: t.displayName,
            isActive: t.isActive,
            isFeatured: t.isFeatured,
            registrarId: link?.registrarId,
            minimumPeriod: link?.minimumPeriod || 1,
            maximumPeriod: link?.maximumPeriod || 10,
            supportsRegistration: link?.supportsRegistration || false,
            supportsTransfer: link?.supportsTransfer || false,
            supportsRenewal: link?.supportsRenewal || false,
            idnScript: link?.idnScript,
          });
          setReady(true);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [id, reset]);
  return (
    <>
      <PageHeader
        title={id ? 'Editar extensão' : 'Nova extensão'}
        description="Novas extensões são desativadas por omissão. .cv não é comercializado nesta fase."
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!ready ? (
        <LoadingState />
      ) : (
        <Card>
          <form
            className="commerce-form"
            onSubmit={handleSubmit(async (values) => {
              setError('');
              try {
                await mutate(
                  '/admin/tlds' + (id ? '/' + id : ''),
                  tldSchema.parse(values),
                  id ? 'PATCH' : 'POST',
                );
                toast.success('Extensão guardada');
                router.push('/admin/tlds');
              } catch (e) {
                setError((e as Error).message);
              }
            })}
          >
            {(['extension', 'displayName'] as const).map((name) => (
              <FormField
                key={name}
                id={name}
                label={
                  name === 'extension'
                    ? 'Extensão (sem ponto)'
                    : 'Nome de apresentação'
                }
                error={errors[name]?.message}
              >
                <Input
                  id={name}
                  readOnly={name === 'extension' && Boolean(id)}
                  {...register(name)}
                />
              </FormField>
            ))}
            <FormField
              id="registrarId"
              label="Fornecedor"
              error={errors.registrarId?.message}
            >
              <Select id="registrarId" {...register('registrarId')}>
                <option value="">Selecionar fornecedor</option>
                {registrars.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </FormField>
            {(['minimumPeriod', 'maximumPeriod'] as const).map((name) => (
              <FormField
                key={name}
                id={name}
                label={
                  name === 'minimumPeriod' ? 'Período mínimo' : 'Período máximo'
                }
                error={errors[name]?.message}
              >
                <Input
                  id={name}
                  type="number"
                  min={1}
                  max={10}
                  {...register(name, { valueAsNumber: true })}
                />
              </FormField>
            ))}
            <FormField id="idnScript" label="Script IDN confirmado (opcional)">
              <Input
                id="idnScript"
                {...register('idnScript', { setValueAs: (v) => v || null })}
              />
            </FormField>
            {(
              [
                ['isActive', 'Ativa'],
                ['isFeatured', 'Destacar na homepage'],
                ['supportsRegistration', 'Suporta registo'],
                [
                  'supportsTransfer',
                  'Suporta transferência (capacidade futura)',
                ],
                ['supportsRenewal', 'Suporta renovação (capacidade futura)'],
              ] as const
            ).map(([name, label]) => (
              <label key={name}>
                <Checkbox {...register(name)} />
                {label}
              </label>
            ))}
            <div className="form-actions">
              <Button disabled={isSubmitting}>Guardar extensão</Button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
export function PricingAdmin() {
  const [data, setData] = useState<Page<PriceView> | null>(null),
    [page, setPage] = useState(1),
    [registrars, setRegistrars] = useState<RegistrarView[]>([]),
    [tlds, setTlds] = useState<TldView[]>([]),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState(''),
    [rates, setRates] = useState<ExchangeRateView[]>([]),
    [error, setError] = useState(''),
    [revision, setRevision] = useState(0);
  const priceForm = useForm<z.input<typeof priceSchema>>({
    resolver: zodResolver(priceSchema),
    defaultValues: {
      periodYears: 1,
      supplierCurrency: 'EUR',
      currency: 'CVE',
      marginType: 'MARKUP',
      marginValue: '20',
      minimumPriceMinor: '0',
      additionalCostMinor: '0',
      roundingIncrementMinor: '100',
    },
  });
  const rateForm = useForm<z.input<typeof exchangeRateSchema>>({
    resolver: zodResolver(exchangeRateSchema),
    defaultValues: { baseCurrency: 'EUR', targetCurrency: 'CVE', source: '' },
  });
  useEffect(() => {
    let active = true;
    request<RegistrarView[]>('/admin/registrars')
      .then((r) => {
        if (active) setRegistrars(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    request<ExchangeRateView[]>('/admin/exchange-rates')
      .then((r) => {
        if (active) setRates(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    request<Page<PriceView>>(
      '/admin/pricing?' +
        new URLSearchParams({
          page: String(page),
          ...(filter ? { registrarId: filter } : {}),
        }),
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [revision, page, filter]);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      request<Page<TldView>>(
        '/admin/tlds?' + new URLSearchParams({ pageSize: '100', search }),
      )
        .then((d) => {
          if (active) setTlds(d.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [search]);
  const editPrice = (p: PriceView) => {
    priceForm.reset({
      tldId: p.tldId,
      registrarId: p.registrarId,
      periodYears: p.periodYears,
      operation: p.operation,
      costSource: p.costSource,
      supplierCurrency: p.supplierCurrency as 'CVE' | 'EUR' | 'USD',
      currency: 'CVE',
      supplierCostMinor: p.supplierCostMinor,
      marginType: p.marginType as 'MARKUP' | 'FIXED' | 'GROSS_MARGIN',
      marginValue: p.marginValue,
      minimumPriceMinor: p.minimumPriceMinor,
      additionalCostMinor: p.additionalCostMinor,
      roundingIncrementMinor: p.roundingIncrementMinor,
      manualSellingPriceMinor: p.manualSellingPriceMinor,
      changeReason: p.changeReason ?? undefined,
      effectiveUntil: p.effectiveUntil,
    });
    document
      .getElementById('publish-price')
      ?.scrollIntoView({ behavior: 'smooth' });
  };
  const priceFields = [
    ['supplierCostMinor', 'Custo fornecedor (cêntimos)'],
    ['marginValue', 'Margem (valor fixo na moeda de venda ou %)'],
    ['minimumPriceMinor', 'Preço mínimo (cêntimos)'],
    ['additionalCostMinor', 'Custo adicional (cêntimos)'],
    ['roundingIncrementMinor', 'Incremento de arredondamento (cêntimos)'],
    ['effectiveUntil', 'Validade (ISO UTC)'],
  ] as const;
  return (
    <>
      <PageHeader
        title="Preços e câmbio"
        description="Versões comerciais auditadas. Markup é margem sobre custo; margem bruta é percentagem sobre venda."
      />
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {data?.total === 0 && (
        <Card>
          <p>
            Ainda não existem políticas de preços. Consulte o custo
            Openprovider, configure uma taxa de câmbio válida para CVE e
            publique a margem de cada TLD e período. A pesquisa mantém o preço
            indisponível até existir uma política válida.
          </p>
        </Card>
      )}
      <div className="commerce-filter">
        <Select
          aria-label="Filtrar preços por fornecedor"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os fornecedores</option>
          {registrars.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </div>
      {!data ? (
        <LoadingState />
      ) : (
        <Card>
          <Table>
            <thead>
              <tr>
                <th>Extensão</th>
                <th>Operação / Período</th>
                <th>Custo</th>
                <th>Venda</th>
                <th>Estado</th>
                <th>Atualização</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.id}>
                  <td>.{p.tld.extension}</td>
                  <td>
                    {p.operation} · {p.periodYears} ano(s)
                  </td>
                  <td>
                    {formatMoney(p.supplierCostMinor, p.supplierCurrency)}
                  </td>
                  <td>{formatMoney(p.sellingPriceMinor, p.currency)}</td>
                  <td>
                    <Badge
                      variant={!p.isActive || p.isStale ? 'warning' : 'success'}
                    >
                      {!p.isActive
                        ? 'Inativo'
                        : p.isStale
                          ? 'Expirado'
                          : 'Válido'}
                    </Badge>
                  </td>
                  <td>
                    <p>
                      Sincronização:{' '}
                      {p.lastSyncedAt
                        ? new Date(p.lastSyncedAt).toLocaleString('pt-PT')
                        : 'Nunca'}
                    </p>
                    <p>
                      Origem:{' '}
                      {p.costSource === 'API' ? 'Openprovider' : 'Manual'}
                    </p>
                    {p.lastSyncAttemptAt && (
                      <small>
                        Tentativa:{' '}
                        {new Date(p.lastSyncAttemptAt).toLocaleString('pt-PT')}
                      </small>
                    )}
                    {p.lastSyncErrorCode && (
                      <p role="status">{p.lastSyncErrorCode}</p>
                    )}
                    <Button variant="secondary" onClick={() => editPrice(p)}>
                      Editar versão
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        try {
                          await mutate(
                            '/admin/pricing/' + p.id + '/state',
                            { isActive: !p.isActive },
                            'PATCH',
                          );
                          setRevision((v) => v + 1);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      {p.isActive ? 'Desativar' : 'Ativar'}
                    </Button>
                    <ConfirmDialog
                      title="Sincronizar custo?"
                      description="Será criada uma versão de preço com o custo recebido da Openprovider."
                      onConfirm={async () => {
                        try {
                          await mutate('/admin/pricing/' + p.id + '/sync');
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setRevision((v) => v + 1);
                        }
                      }}
                    >
                      Sincronizar
                    </ConfirmDialog>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            page={page}
            total={data.total}
            pageSize={data.pageSize}
            onChange={setPage}
          />
        </Card>
      )}
      <Card className="section-gap">
        <h2 id="publish-price">Publicar versão de preço</h2>
        <p>
          Valores monetários mínimos: 100 = 1,00. O preço configurado é o total
          do período, sem multiplicação implícita por anos.
        </p>
        <Input
          aria-label="Procurar extensão para preço"
          placeholder="Procurar extensão no catálogo"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <form
          className="commerce-form"
          onSubmit={priceForm.handleSubmit(async (values) => {
            setError('');
            try {
              await mutate('/admin/pricing', priceSchema.parse(values));
              setRevision((v) => v + 1);
              toast.success('Versão comercial publicada');
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          <FormField
            id="tld-price"
            label="Extensão"
            error={priceForm.formState.errors.tldId?.message}
          >
            <Select id="tld-price" {...priceForm.register('tldId')}>
              <option value="">Selecionar extensão</option>
              {tlds.map((t) => (
                <option key={t.id} value={t.id}>
                  .{t.extension}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="price-registrar"
            label="Fornecedor"
            error={priceForm.formState.errors.registrarId?.message}
          >
            <Select id="price-registrar" {...priceForm.register('registrarId')}>
              <option value="">Selecionar fornecedor</option>
              {registrars.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            id="years"
            label="Período (anos)"
            error={priceForm.formState.errors.periodYears?.message}
          >
            <Input
              id="years"
              type="number"
              min={1}
              max={10}
              {...priceForm.register('periodYears', { valueAsNumber: true })}
            />
          </FormField>
          <FormField id="operation-price" label="Operação">
            <Select id="operation-price" {...priceForm.register('operation')}>
              <option value="REGISTER">Registo</option>
              <option value="RENEW">Renovação</option>
              <option value="TRANSFER">Transferência</option>
            </Select>
          </FormField>
          <FormField id="cost-source" label="Origem do custo">
            <Select id="cost-source" {...priceForm.register('costSource')}>
              <option value="MANUAL">Custo manual verificado</option>
              <option value="API">Openprovider (consultado ao publicar)</option>
            </Select>
          </FormField>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              setError('');
              try {
                const values = priceForm.getValues();
                const cost = await mutate<{
                  supplierCostMinor: string;
                  supplierCurrency: 'CVE' | 'EUR' | 'USD';
                }>('/admin/pricing/supplier-cost', {
                  tldId: values.tldId,
                  registrarId: values.registrarId,
                  periodYears: values.periodYears,
                  operation: values.operation ?? 'REGISTER',
                });
                priceForm.setValue(
                  'supplierCostMinor',
                  cost.supplierCostMinor,
                  { shouldValidate: true },
                );
                priceForm.setValue('supplierCurrency', cost.supplierCurrency);
                priceForm.setValue('costSource', 'API');
                toast.success(
                  'Custo real consultado. Configure a margem e o câmbio antes de publicar.',
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Consultar custo Openprovider
          </Button>
          {(['supplierCurrency', 'currency'] as const).map((name) => (
            <FormField
              key={name}
              id={name}
              label={
                name === 'currency' ? 'Moeda de venda' : 'Moeda fornecedor'
              }
            >
              <Select id={name} {...priceForm.register(name)}>
                {(name === 'currency' ? ['CVE'] : ['CVE', 'EUR', 'USD']).map(
                  (c) => (
                    <option key={c}>{c}</option>
                  ),
                )}
              </Select>
            </FormField>
          ))}
          <FormField id="marginType" label="Modelo de margem">
            <Select id="marginType" {...priceForm.register('marginType')}>
              <option value="FIXED">Fixa</option>
              <option value="MARKUP">Markup sobre custo</option>
              <option value="GROSS_MARGIN">Margem bruta sobre venda</option>
            </Select>
          </FormField>
          {priceFields.map(([name, label]) => (
            <FormField
              key={name}
              id={name}
              label={label}
              error={priceForm.formState.errors[name]?.message}
            >
              <Input
                id={name}
                placeholder={
                  name === 'effectiveUntil'
                    ? '2026-12-31T23:59:59.000Z'
                    : undefined
                }
                {...priceForm.register(name)}
              />
            </FormField>
          ))}
          <FormField
            id="manual-selling-price"
            label="Venda manual opcional (cêntimos, apenas standard)"
            error={priceForm.formState.errors.manualSellingPriceMinor?.message}
          >
            <Input
              id="manual-selling-price"
              {...priceForm.register('manualSellingPriceMinor', {
                setValueAs: (v) => (v === '' ? null : v),
              })}
            />
          </FormField>
          <FormField
            id="price-reason"
            label="Motivo da alteração (obrigatório para venda manual)"
            error={priceForm.formState.errors.changeReason?.message}
          >
            <Input
              id="price-reason"
              {...priceForm.register('changeReason', {
                setValueAs: (v) => (v === '' ? undefined : v),
              })}
            />
          </FormField>
          <div className="form-actions">
            <Button disabled={priceForm.formState.isSubmitting}>
              Publicar preço
            </Button>
          </div>
        </form>
      </Card>
      <Card className="section-gap">
        <h2>Taxas de câmbio administradas</h2>
        <p>
          Introduza apenas taxas verificadas, identificando a fonte. Não existe
          fornecedor automático configurado.
        </p>
        <Table>
          <thead>
            <tr>
              <th>Conversão</th>
              <th>Taxa</th>
              <th>Fonte</th>
              <th>Validade</th>
            </tr>
          </thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id}>
                <td>
                  {r.baseCurrency} → {r.targetCurrency}
                </td>
                <td>{r.rate}</td>
                <td>{r.source}</td>
                <td>{new Date(r.expiresAt).toLocaleString('pt-PT')}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        <form
          className="commerce-form"
          onSubmit={rateForm.handleSubmit(async (values) => {
            setError('');
            try {
              await mutate(
                '/admin/exchange-rates',
                exchangeRateSchema.parse(values),
              );
              setRevision((v) => v + 1);
              toast.success('Taxa de câmbio guardada');
            } catch (e) {
              setError((e as Error).message);
            }
          })}
        >
          {(['baseCurrency', 'targetCurrency'] as const).map((name) => (
            <FormField
              id={name}
              key={name}
              label={name === 'baseCurrency' ? 'Moeda base' : 'Moeda destino'}
              error={rateForm.formState.errors[name]?.message}
            >
              <Select id={name} {...rateForm.register(name)}>
                {['CVE', 'EUR', 'USD'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </FormField>
          ))}
          {(['rate', 'source', 'expiresAt'] as const).map((name) => (
            <FormField
              id={name}
              key={name}
              label={
                {
                  rate: 'Taxa exata',
                  source: 'Fonte verificada',
                  expiresAt: 'Validade da taxa (ISO UTC)',
                }[name]
              }
              error={rateForm.formState.errors[name]?.message}
            >
              <Input id={name} {...rateForm.register(name)} />
            </FormField>
          ))}
          <div className="form-actions">
            <Button disabled={rateForm.formState.isSubmitting}>
              Guardar câmbio
            </Button>
          </div>
        </form>
      </Card>
    </>
  );
}
export function RegistrarsAdmin() {
  const { user } = useAccount();
  const [registrars, setRegistrars] = useState<RegistrarView[] | null>(null),
    [metrics, setMetrics] = useState<SearchMetrics | null>(null),
    [error, setError] = useState('');
  const load = () =>
    request<RegistrarView[]>('/admin/registrars').then(setRegistrars);
  useEffect(() => {
    let active = true;
    request<RegistrarView[]>('/admin/registrars')
      .then((r) => {
        if (active) setRegistrars(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    request<SearchMetrics>('/admin/domain-search/metrics')
      .then((m) => {
        if (active) setMetrics(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <>
      <PageHeader
        title="Registradores"
        description="Credenciais geridas apenas no ambiente do backend. Nenhuma compra ou alteração de DNS é executada."
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!registrars ? (
        <LoadingState />
      ) : (
        registrars.map((r) => (
          <Card key={r.id}>
            <h2>{r.name}</h2>
            <Badge variant={r.configured ? 'success' : 'warning'}>
              {r.configured
                ? 'Integração configurada'
                : 'Integração desativada'}
            </Badge>
            <p>Ambiente: {r.environment || 'Não configurado'}</p>
            <p>
              Última sincronização:{' '}
              {r.lastSyncedAt
                ? new Date(r.lastSyncedAt).toLocaleString('pt-PT')
                : 'Não executada'}
            </p>
            {r.lastErrorCode && (
              <p role="status">Último erro técnico: {r.lastErrorCode}</p>
            )}
            <Link href="/admin/registrars/openprovider">
              Configuração Openprovider
            </Link>
            {globalPermissions[user.globalRole].includes('system.manage') && (
              <ConfirmDialog
                title="Sincronizar catálogo?"
                description="Consulta real à API; novas extensões permanecem inativas até revisão."
                onConfirm={async () => {
                  await mutate('/admin/registrars/openprovider/sync');
                  await load();
                }}
              >
                Sincronizar catálogo
              </ConfirmDialog>
            )}
            <p>
              A configuração de credenciais não confirma conectividade. A
              verificação externa exige uma sincronização ou pesquisa
              bem-sucedida.
            </p>
          </Card>
        ))
      )}
      {metrics && (
        <>
          <h2 className="section-gap">
            Consultas nos últimos {metrics.retentionDays} dias
          </h2>
          <div className="grid-3">
            <StatCard label="Consultas" value={metrics.total} />
            <StatCard label="Resultados confirmados" value={metrics.success} />
            <StatCard label="Cache hits" value={metrics.cacheHits} />
            <StatCard label="Erros externos" value={metrics.externalErrors} />
            <StatCard
              label="Tempo médio (ms)"
              value={Math.round(metrics.averageResponseTimeMs)}
            />
            <StatCard
              label="Taxa de cache"
              value={(metrics.cacheHitRate * 100).toFixed(1) + '%'}
            />
          </div>
          <Card>
            <h3>Extensões mais pesquisadas</h3>
            {metrics.extensions.map((e) => (
              <p key={e.extension}>
                .{e.extension}: {e._count}
              </p>
            ))}
          </Card>
        </>
      )}
    </>
  );
}
