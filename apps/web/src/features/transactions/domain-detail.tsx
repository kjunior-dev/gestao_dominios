'use client';
import { useEffect, useState } from 'react';
import { CommerceRecord } from '@devtrust/contracts';
import { Card, PageHeader, Badge, LoadingState } from '@devtrust/ui';
import { request } from '@/lib/api';
export function DomainDetail({ id }: { id: string }) {
  const [domain, setDomain] = useState<CommerceRecord | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    request<CommerceRecord>('/domains/' + id)
      .then((d) => {
        if (active) setDomain(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error) return <Card role="alert">{error}</Card>;
  if (!domain) return <LoadingState />;
  return (
    <>
      <PageHeader title={domain.domainName || 'Domínio'} />
      <Card>
        <Badge>{domain.status}</Badge>{' '}
        <Badge variant="warning">{domain.environment}</Badge>
        <p>
          Registado em:{' '}
          {domain.registeredAt
            ? new Date(domain.registeredAt).toLocaleDateString('pt-PT')
            : 'Ainda não confirmado'}
        </p>
        <p>
          Expira em:{' '}
          {domain.expiresAt
            ? new Date(domain.expiresAt).toLocaleDateString('pt-PT')
            : 'Ainda não confirmado'}
        </p>
        {domain.environment === 'MOCK' && (
          <p>
            Simulação de desenvolvimento. Este domínio não foi registado num
            registrador real.
          </p>
        )}
      </Card>
    </>
  );
}
