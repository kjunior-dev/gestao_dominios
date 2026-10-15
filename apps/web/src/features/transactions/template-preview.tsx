'use client';
import { useEffect, useState } from 'react';
import {
  Card,
  PageHeader,
  Select,
  LoadingState,
  EmptyState,
} from '@devtrust/ui';
import { globalPermissions } from '@devtrust/contracts';
import { useAccount } from '@/hooks/account-context';
import { request } from '@/lib/api';
export function TemplatePreview() {
  const { user } = useAccount(),
    [type, setType] = useState('ORDER_CREATED'),
    [template, setTemplate] = useState<{ html: string; text: string } | null>(
      null,
    ),
    [error, setError] = useState('');
  const allowed = globalPermissions[user.globalRole].includes('system.manage');
  useEffect(() => {
    if (!allowed) return;
    let active = true;
    request<{ html: string; text: string }>(
      '/admin/notifications/preview/' + type,
    )
      .then((t) => {
        if (active) {
          setTemplate(t);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [type, allowed]);
  if (!allowed)
    return (
      <EmptyState
        title="Sem permissão"
        description="Pré-visualização administrativa restrita."
      />
    );
  return (
    <>
      <PageHeader
        title="Emails transacionais"
        description="Pré-visualização de desenvolvimento. Não são enviadas mensagens externas."
      />
      <Select
        aria-label="Template"
        value={type}
        onChange={(e) => setType(e.target.value)}
      >
        {[
          'ORDER_CREATED',
          'PAYMENT_CONFIRMED',
          'PAYMENT_FAILED',
          'REGISTRATION_STARTED',
          'DOMAIN_REGISTERED',
          'REGISTRATION_PENDING',
          'REGISTRATION_FAILED',
          'REFUND_REQUESTED',
          'REFUND_COMPLETED',
          'INVOICE_AVAILABLE',
          'VERIFY_EMAIL',
          'RESET_PASSWORD',
        ].map((t) => (
          <option key={t}>{t}</option>
        ))}
      </Select>
      <Card className="section-gap">
        {error ? (
          <p role="alert">{error}</p>
        ) : !template ? (
          <LoadingState />
        ) : (
          <>
            <iframe
              title="Pré-visualização HTML do email"
              sandbox=""
              srcDoc={template.html}
              style={{ width: '100%', height: 460, border: 0 }}
            />
            <h2>Versão em texto simples</h2>
            <p style={{ whiteSpace: 'pre-wrap' }}>{template.text}</p>
          </>
        )}
      </Card>
    </>
  );
}
