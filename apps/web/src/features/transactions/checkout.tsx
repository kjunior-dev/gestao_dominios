'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  domainContactSchema,
  CartView,
  CheckoutConfig,
  OrderView,
} from '@devtrust/contracts';
import {
  Card,
  Input,
  Button,
  FormField,
  Checkbox,
  Select,
  PageHeader,
  LoadingState,
  EmptyState,
  Badge,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { request, mutate } from '@/lib/api';
import { formatMoney } from '../domains/money';
const schema = domainContactSchema.omit({ organizationId: true });
export function Checkout() {
  const { user, organization, organizations, select, organizationLoading } =
      useAccount(),
    router = useRouter();
  const [cart, setCart] = useState<CartView | null>(null),
    [config, setConfig] = useState<CheckoutConfig | null>(null),
    [error, setError] = useState(''),
    [terms, setTerms] = useState(false),
    [premium, setPremium] = useState(false),
    [updating, setUpdating] = useState(false),
    [ns1, setNs1] = useState(''),
    [ns2, setNs2] = useState(''),
    [taxId, setTaxId] = useState(''),
    [key] = useState(() => crypto.randomUUID());
  const [savedContact, setSavedContact] = useState<{
    fingerprint: string;
    id: string;
  } | null>(null);
  const form = useForm<
    z.input<typeof schema>,
    unknown,
    z.output<typeof schema>
  >({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phoneCountryCode: '+238',
      countryCode: 'CV',
      contactType: 'OWNER',
    },
  });
  useEffect(() => {
    let active = true;
    Promise.all([
      request<CartView>('/cart'),
      request<CheckoutConfig>('/checkout/config'),
    ])
      .then(([c, f]) => {
        if (active) {
          setCart(c);
          setConfig(f);
        }
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
      <Card role="alert">
        <p className="error">{error}</p>
        <Button onClick={() => window.location.reload()}>
          Tentar novamente
        </Button>
      </Card>
    );
  if (!cart || !config || organizationLoading) return <LoadingState />;
  if (!cart.items.length)
    return (
      <Card>
        <EmptyState
          title="Carrinho vazio"
          description="Pesquise um domínio e adicione-o ao carrinho antes de continuar."
        />
        <Button asChild>
          <Link href="/dominios/pesquisar">Pesquisar domínios</Link>
        </Button>
      </Card>
    );
  if (!organization)
    return (
      <Card>
        <EmptyState
          title="Crie uma organização"
          description="A encomenda e os contactos precisam de uma organização."
        />
        <Link href="/dashboard/organizacao">Gerir organização</Link>
      </Card>
    );
  const subtotal = BigInt(cart.subtotalMinor),
    tax =
      (subtotal * BigInt(config.taxBasisPoints) + BigInt(9999)) / BigInt(10000);
  const fields = [
    ['firstName', 'Nome'],
    ['lastName', 'Apelido'],
    ['companyName', 'Empresa (opcional)'],
    ['email', 'Email do titular'],
    ['phoneCountryCode', 'Indicativo telefónico'],
    ['phone', 'Número de telefone'],
    ['address', 'Rua'],
    ['addressNumber', 'Número da porta'],
    ['city', 'Cidade'],
    ['region', 'Região (opcional)'],
    ['postalCode', 'Código postal'],
    ['countryCode', 'Código do país (ex.: CV)'],
  ] as const;
  return (
    <>
      <PageHeader
        title="Confirmar encomenda"
        description="Disponibilidade e preços são revalidados no servidor. O registo depende de confirmação posterior."
      />
      <Badge variant="warning">
        Pagamentos {config.paymentsMode} · Registos {config.registrationMode}
      </Badge>
      <div className="grid-2 section-gap">
        <Card>
          <form
            className="form-stack"
            onSubmit={form.handleSubmit(async (data) => {
              setError('');
              try {
                const fingerprint = JSON.stringify({
                  ...data,
                  organizationId: organization.id,
                });
                const contact =
                  savedContact?.fingerprint === fingerprint
                    ? savedContact
                    : await mutate<{ id: string }>('/domain-contacts', {
                        ...data,
                        organizationId: organization.id,
                      });
                setSavedContact({ fingerprint, id: contact.id });
                const order = await mutate<OrderView>('/checkout', {
                  organizationId: organization.id,
                  contactId: contact.id,
                  nameservers: [
                    ns1.trim().toLowerCase(),
                    ns2.trim().toLowerCase(),
                  ],
                  billing: {
                    legalName:
                      data.companyName || data.firstName + ' ' + data.lastName,
                    taxId: taxId || undefined,
                    address: data.address + ' ' + data.addressNumber,
                    city: data.city,
                    postalCode: data.postalCode,
                    countryCode: data.countryCode,
                  },
                  acceptTerms: terms,
                  termsVersion: config.termsVersion,
                  acceptPremium: premium,
                  idempotencyKey: key,
                });
                router.push('/checkout/confirmacao?order=' + order.id);
              } catch (e) {
                toast.error((e as Error).message);
              }
            })}
          >
            <FormField id="checkout-org" label="Organização">
              <Select
                id="checkout-org"
                value={organization.id}
                onChange={(e) => select(e.target.value)}
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </Select>
            </FormField>
            <h2>Contacto de titularidade</h2>
            <p>
              Dados utilizados para o registo e para contacto pelo registrador.
            </p>
            {fields.map(([field, label]) => (
              <FormField
                key={field}
                id={'contact-' + field}
                label={label}
                error={form.formState.errors[field]?.message}
              >
                <Input id={'contact-' + field} {...form.register(field)} />
              </FormField>
            ))}
            <FormField
              id="checkout-tax"
              label="Identificador fiscal (opcional)"
            >
              <Input
                id="checkout-tax"
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </FormField>
            <h2>Nameservers</h2>
            <p>
              Indique dois servidores DNS fornecidos pelo seu serviço de
              alojamento.
            </p>
            <FormField id="ns1" label="Nameserver 1">
              <Input
                id="ns1"
                value={ns1}
                required
                onChange={(e) => setNs1(e.target.value)}
                placeholder="ns1.seufornecedor.com"
              />
            </FormField>
            <FormField id="ns2" label="Nameserver 2">
              <Input
                id="ns2"
                value={ns2}
                required
                onChange={(e) => setNs2(e.target.value)}
                placeholder="ns2.seufornecedor.com"
              />
            </FormField>
            <label>
              <Checkbox
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />{' '}
              Aceito os{' '}
              <Link href="/termos" target="_blank">
                termos da encomenda
              </Link>{' '}
              ({config.termsVersion}).
            </label>
            {cart.items.some((i) => i.isPremium) && (
              <label>
                <Checkbox
                  checked={premium}
                  onChange={(e) => setPremium(e.target.checked)}
                />{' '}
                Aceito as taxas premium da cotação apresentada. Custos
                superiores exigem nova autorização.
              </label>
            )}
            <Button
              disabled={
                !terms ||
                form.formState.isSubmitting ||
                cart.requiresRevalidation ||
                updating ||
                config.paymentsMode === 'disabled'
              }
            >
              {form.formState.isSubmitting
                ? 'A confirmar…'
                : 'Criar encomenda de teste'}
            </Button>
            {cart.requiresRevalidation && (
              <p className="error">
                Cotação expirada.{' '}
                <Link href="/carrinho">Atualize o carrinho</Link>.
              </p>
            )}
          </form>
        </Card>
        <Card>
          <h2>Resumo</h2>
          <FormField id="checkout-method" label="Método de pagamento">
            <Select id="checkout-method" disabled>
              <option>Mock — simulação sem cobrança</option>
            </Select>
          </FormField>
          {cart.items.map((i) => (
            <div className="section-gap" key={i.id}>
              <strong>{i.domainName}</strong>
              <FormField
                id={'period-' + i.id}
                label={'Período de ' + i.domainName}
              >
                <Select
                  id={'period-' + i.id}
                  value={i.registrationYears}
                  disabled={updating}
                  onChange={async (e) => {
                    setUpdating(true);
                    setTerms(false);
                    setPremium(false);
                    try {
                      setCart(
                        await mutate<CartView>(
                          '/cart/items/' + i.id,
                          { registrationYears: Number(e.target.value) },
                          'PATCH',
                        ),
                      );
                    } catch (error) {
                      toast.error((error as Error).message);
                    } finally {
                      setUpdating(false);
                    }
                  }}
                >
                  {Array.from(
                    { length: i.maximumPeriod - i.minimumPeriod + 1 },
                    (_, n) => i.minimumPeriod + n,
                  ).map((n) => (
                    <option value={n} key={n}>
                      {n} ano(s)
                    </option>
                  ))}
                </Select>
              </FormField>
              <p>
                {i.registrationYears} ano(s) ·{' '}
                {formatMoney(i.unitPriceMinor, i.currency)}
              </p>
              {i.isPremium && <Badge variant="warning">Premium</Badge>}
            </div>
          ))}
          <hr />
          <p>Subtotal: {formatMoney(subtotal.toString(), cart.currency)}</p>
          <p>
            Imposto configurado: {formatMoney(tax.toString(), cart.currency)}
          </p>
          <h3>
            Total: {formatMoney((subtotal + tax).toString(), cart.currency)}
          </h3>
          <p>
            O modo mock não movimenta dinheiro. O documento emitido é um
            comprovativo interno sem validade fiscal.
          </p>
        </Card>
      </div>
    </>
  );
}
