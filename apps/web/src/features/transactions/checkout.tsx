'use client';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  domainContactSchema,
  checkoutSchema,
  validationIssues,
  type ValidationIssue,
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
import { ApiError, request, mutate } from '@/lib/api';
import {
  contactFields,
  checkoutFieldIssues,
  type CheckoutFieldIssue,
} from './checkout-validation';
import { formatMoney } from '../domains/money';
const schema = domainContactSchema.omit({ organizationId: true });
const orderDraftSchema = checkoutSchema.omit({ contactId: true });
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
    [key] = useState(() => crypto.randomUUID()),
    [submissionErrors, setSubmissionErrors] = useState<CheckoutFieldIssue[]>(
      [],
    ),
    [submissionMessage, setSubmissionMessage] = useState('');
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
  const fieldError = (id: string) =>
    submissionErrors.find((issue) => issue.fieldId === id)?.message;
  const showIssues = (
    issues: CheckoutFieldIssue[],
    message = 'Corrija os campos indicados para continuar.',
  ) => {
    setSubmissionErrors(issues);
    setSubmissionMessage(message);
    const id = issues.find((issue) => issue.fieldId)?.fieldId;
    requestAnimationFrame(() =>
      document.getElementById(id || 'checkout-errors')?.focus(),
    );
  };
  const orderDraft = (data: z.input<typeof schema>) => ({
    organizationId: organization.id,
    nameservers: [ns1.trim().toLowerCase(), ns2.trim().toLowerCase()],
    billing: {
      legalName: data.companyName || data.firstName + ' ' + data.lastName,
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
  const draftIssues = (data: z.input<typeof schema>) => {
    const parsed = orderDraftSchema.safeParse(orderDraft(data));
    const issues = parsed.success ? [] : validationIssues(parsed.error);
    if (cart.items.some((item) => item.isPremium) && !premium)
      issues.push({
        path: ['acceptPremium'],
        message: 'Aceite explicitamente o valor premium apresentado.',
      });
    return checkoutFieldIssues(issues, 'checkout', data.companyName);
  };
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
            noValidate
            onSubmit={form.handleSubmit(
              async (data) => {
                setSubmissionErrors([]);
                setSubmissionMessage('');
                const issues = draftIssues(data);
                if (issues.length) {
                  showIssues(issues);
                  return;
                }
                const draft = orderDraftSchema.parse(orderDraft(data));
                let stage: 'contact' | 'checkout' = 'contact';
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
                  stage = 'checkout';
                  const order = await mutate<OrderView>('/checkout', {
                    ...draft,
                    contactId: contact.id,
                  });
                  router.push('/checkout/confirmacao?order=' + order.id);
                } catch (e) {
                  const issues: ValidationIssue[] =
                    e instanceof ApiError
                      ? e.issues.length
                        ? e.issues
                        : Object.entries(e.fields).flatMap(([name, messages]) =>
                            messages.map((message) => ({
                              path: name.split('.'),
                              message,
                            })),
                          )
                      : [];
                  const heading =
                    stage === 'contact'
                      ? 'Não foi possível guardar o contacto de titularidade.'
                      : 'Não foi possível confirmar a encomenda.';
                  showIssues(
                    checkoutFieldIssues(issues, stage, data.companyName),
                    heading +
                      (issues.length
                        ? ' Corrija os campos indicados.'
                        : ' ' +
                          (e instanceof Error
                            ? e.message
                            : 'Tente novamente.')),
                  );
                }
              },
              () => {
                const data = form.getValues();
                const parsed = schema.safeParse(data);
                showIssues([
                  ...(parsed.success
                    ? []
                    : checkoutFieldIssues(
                        validationIssues(parsed.error),
                        'contact',
                      )),
                  ...draftIssues(data),
                ]);
              },
            )}
          >
            {submissionMessage && (
              <div
                id="checkout-errors"
                role="alert"
                tabIndex={-1}
                className="message error"
              >
                <p>{submissionMessage}</p>
                {submissionErrors.length > 0 && (
                  <ul>
                    {submissionErrors.map((issue, index) => (
                      <li key={index}>
                        {issue.fieldId ? (
                          <a
                            href={'#' + issue.fieldId}
                            onClick={(event) => {
                              event.preventDefault();
                              document.getElementById(issue.fieldId!)?.focus();
                            }}
                          >
                            {issue.label}: {issue.message}
                          </a>
                        ) : (
                          <span>
                            {issue.label}: {issue.message}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <FormField
              id="checkout-org"
              label="Organização"
              error={fieldError('checkout-org')}
            >
              <Select
                id="checkout-org"
                aria-invalid={Boolean(fieldError('checkout-org'))}
                aria-describedby={
                  fieldError('checkout-org') ? 'checkout-org-error' : undefined
                }
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
            {contactFields.map(([field, label]) => (
              <FormField
                key={field}
                id={'contact-' + field}
                label={label}
                error={fieldError('contact-' + field)}
              >
                <Input
                  id={'contact-' + field}
                  aria-invalid={Boolean(fieldError('contact-' + field))}
                  aria-describedby={
                    fieldError('contact-' + field)
                      ? 'contact-' + field + '-error'
                      : undefined
                  }
                  {...form.register(field)}
                />
              </FormField>
            ))}
            <FormField
              id="checkout-tax"
              label="Identificador fiscal (opcional)"
              error={fieldError('checkout-tax')}
            >
              <Input
                id="checkout-tax"
                aria-invalid={Boolean(fieldError('checkout-tax'))}
                aria-describedby={
                  fieldError('checkout-tax') ? 'checkout-tax-error' : undefined
                }
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
              />
            </FormField>
            <h2>Nameservers</h2>
            <p>
              Indique dois servidores DNS fornecidos pelo seu serviço de
              alojamento.
            </p>
            <FormField id="ns1" label="Nameserver 1" error={fieldError('ns1')}>
              <Input
                id="ns1"
                aria-invalid={Boolean(fieldError('ns1'))}
                aria-describedby={fieldError('ns1') ? 'ns1-error' : undefined}
                value={ns1}
                required
                onChange={(e) => setNs1(e.target.value)}
                placeholder="ns1.seufornecedor.com"
              />
            </FormField>
            <FormField id="ns2" label="Nameserver 2" error={fieldError('ns2')}>
              <Input
                id="ns2"
                aria-invalid={Boolean(fieldError('ns2'))}
                aria-describedby={fieldError('ns2') ? 'ns2-error' : undefined}
                value={ns2}
                required
                onChange={(e) => setNs2(e.target.value)}
                placeholder="ns2.seufornecedor.com"
              />
            </FormField>
            <label>
              <Checkbox
                id="checkout-terms"
                aria-invalid={Boolean(fieldError('checkout-terms'))}
                aria-describedby={
                  fieldError('checkout-terms')
                    ? 'checkout-terms-error'
                    : undefined
                }
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />{' '}
              Aceito os{' '}
              <Link href="/termos" target="_blank">
                termos da encomenda
              </Link>{' '}
              ({config.termsVersion}).
            </label>
            {fieldError('checkout-terms') && (
              <p id="checkout-terms-error" role="alert" className="field-error">
                {fieldError('checkout-terms')}
              </p>
            )}
            {cart.items.some((i) => i.isPremium) && (
              <label>
                <Checkbox
                  id="checkout-premium"
                  aria-invalid={Boolean(fieldError('checkout-premium'))}
                  aria-describedby={
                    fieldError('checkout-premium')
                      ? 'checkout-premium-error'
                      : undefined
                  }
                  checked={premium}
                  onChange={(e) => setPremium(e.target.checked)}
                />{' '}
                Aceito as taxas premium da cotação apresentada. Custos
                superiores exigem nova autorização.
              </label>
            )}
            {fieldError('checkout-premium') && (
              <p
                id="checkout-premium-error"
                role="alert"
                className="field-error"
              >
                {fieldError('checkout-premium')}
              </p>
            )}
            <Button
              disabled={
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
