export function internalReceiptPdf(data: {
  number: string;
  orderNumber: string;
  environment: string;
  lines: { domainName: string; years: number; priceMinor: string }[];
  subtotalMinor: string;
  taxMinor: string;
  totalMinor: string;
  currency: string;
  legalName: string;
}): Buffer {
  const money = (value: string) => {
    const n = BigInt(value);
    return (
      (n / 100n).toString() +
      '.' +
      (n % 100n).toString().padStart(2, '0') +
      ' ' +
      data.currency
    );
  };
  const lines = [
    'DevTrust Domains',
    'COMPROVATIVO INTERNO - SEM VALIDADE FISCAL',
    data.environment === 'LIVE'
      ? 'Documento interno'
      : `AMBIENTE ${data.environment} - NAO REPRESENTA UMA COBRANCA REAL`,
    data.number,
    'Encomenda: ' + data.orderNumber,
    'Cliente: ' + data.legalName,
    '',
    ...data.lines.map(
      (l) => `${l.domainName} | ${l.years} ano(s) | ${money(l.priceMinor)}`,
    ),
    '',
    'Subtotal: ' + money(data.subtotalMinor),
    'Imposto configurado: ' + money(data.taxMinor),
    'Total: ' + money(data.totalMinor),
    '',
    'Pagamento e registo sao estados independentes.',
  ];
  const escape = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x20-\x7e]/g, '?')
      .slice(0, 110)
      .replace(/([\\()])/g, '\\$1');
  const stream =
    'BT /F1 11 Tf 40 790 Td 17 TL ' +
    lines
      .map((l, i) => (i ? 'T* ' : '') + '(' + escape(l) + ') Tj')
      .join('\n') +
    ' ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let result = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(result));
    result += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(result);
  result +=
    'xref\n0 6\n0000000000 65535 f \n' +
    offsets
      .slice(1)
      .map((o) => o.toString().padStart(10, '0') + ' 00000 n \n')
      .join('') +
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(result);
}
const descriptions: Record<string, string> = {
  ORDER_CREATED:
    'Recebemos a sua encomenda. Aguarde a confirmação do pagamento.',
  PAYMENT_CONFIRMED:
    'A confirmação do pagamento foi recebida. O domínio só estará registado após confirmação do registrador.',
  PAYMENT_FAILED: 'O pagamento não foi confirmado. Consulte a sua encomenda.',
  REGISTRATION_STARTED: 'O registo está em processamento.',
  DOMAIN_REGISTERED:
    'Consulte o domínio e o ambiente da operação na sua conta.',
  REGISTRATION_PENDING:
    'O registo aguarda confirmação ou intervenção de um operador.',
  REGISTRATION_FAILED:
    'Não foi possível concluir o registo. Um reembolso exige aprovação separada.',
  REFUND_REQUESTED: 'O pedido de reembolso foi recebido e aguarda decisão.',
  REFUND_COMPLETED: 'Consulte o estado do reembolso e o ambiente da operação.',
  INVOICE_AVAILABLE:
    'O comprovativo interno está disponível na sua conta. Não é uma fatura fiscal certificada.',
  VERIFY_EMAIL: 'Confirme o seu endereço de email.',
  RESET_PASSWORD: 'Foi solicitada uma alteração de password.',
};
export function notificationTemplate(
  type: string,
  subject: string,
  link?: string,
) {
  const escape = (s: string) =>
    s.replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c]!,
    );
  const text =
    subject +
    '\n\n' +
    (descriptions[type] || 'Consulte a sua conta DevTrust Domains.') +
    (link ? '\n\n' + link : '') +
    '\n\nDevTrust Domains';
  const href = link && /^https?:\/\//.test(link) ? link : null;
  const html = `<!doctype html><html lang="pt"><meta name="viewport" content="width=device-width, initial-scale=1"><body style="margin:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a"><main style="max-width:560px;margin:auto;padding:32px"><h2 style="color:#2563eb">DevTrust Domains</h2><section style="background:#fff;padding:24px;border-radius:12px"><h1 style="font-size:22px">${escape(subject)}</h1><p>${escape(descriptions[type] || 'Consulte a sua conta DevTrust Domains.')}</p>${href ? `<p><a href="${escape(href)}" style="color:#2563eb">Continuar na sua conta</a></p>` : ''}</section><p style="font-size:12px">Mensagem transacional. Confirme o ambiente indicado na sua conta.</p></main></body></html>`;
  return { html, text };
}
