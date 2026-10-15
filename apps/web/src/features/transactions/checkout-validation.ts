import type { ValidationIssue } from '@devtrust/contracts';

export const contactFields = [
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
export type CheckoutFieldIssue = {
  fieldId: string | null;
  label: string;
  message: string;
};

export function checkoutFieldIssues(
  issues: ValidationIssue[],
  stage: 'contact' | 'checkout',
  companyName?: string,
): CheckoutFieldIssue[] {
  return issues.map(({ path, message }) => {
    const key = path.join('.');
    const contact = contactFields.find(([name]) => name === key);
    if (stage === 'contact' && contact)
      return { fieldId: 'contact-' + contact[0], label: contact[1], message };
    const bindings: Record<string, [string | null, string]> = {
      'nameservers.0': ['ns1', 'Nameserver 1'],
      'nameservers.1': ['ns2', 'Nameserver 2'],
      nameservers: ['ns2', 'Nameservers'],
      'billing.legalName': [
        companyName ? 'contact-companyName' : 'contact-firstName',
        'Nome de faturação (empresa ou nome e apelido)',
      ],
      'billing.address': [
        'contact-address',
        'Morada de faturação (rua e número)',
      ],
      'billing.city': ['contact-city', 'Cidade'],
      'billing.postalCode': ['contact-postalCode', 'Código postal'],
      'billing.countryCode': ['contact-countryCode', 'Código do país'],
      'billing.taxId': ['checkout-tax', 'Identificador fiscal'],
      acceptTerms: ['checkout-terms', 'Aceitação dos termos'],
      acceptPremium: ['checkout-premium', 'Aceitação do valor premium'],
    };
    if (key === 'organizationId')
      return {
        fieldId: 'checkout-org',
        label: 'Organização',
        message:
          'Selecione novamente a organização. Se necessário, atualize a página.',
      };
    if (key === 'contactId')
      return {
        fieldId: null,
        label: 'Contacto de titularidade',
        message:
          'Não foi possível validar o contacto. Confirme os dados e tente novamente.',
      };
    if (key === 'termsVersion' || key === 'idempotencyKey')
      return {
        fieldId: null,
        label: 'Confirmação da encomenda',
        message: 'Atualize a página e confirme novamente os dados e os termos.',
      };
    const [fieldId, label] = bindings[key] || [
      null,
      stage === 'contact' ? 'Contacto de titularidade' : 'Dados da encomenda',
    ];
    return { fieldId, label, message };
  });
}
