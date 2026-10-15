'use client';
import { useEffect, useState } from 'react';
import { TldView, globalPermissions } from '@devtrust/contracts';
import { Card, FormField, Select, Checkbox, ConfirmDialog } from '@devtrust/ui';
import { useAccount } from '@/hooks/account-context';
import { request, mutate } from '@/lib/api';
import { toast } from 'sonner';
export function RegistrationPolicy({ id }: { id: string }) {
  const { user } = useAccount(),
    [tld, setTld] = useState<TldView | null>(null),
    [registrarId, setRegistrarId] = useState(''),
    [approved, setApproved] = useState(false),
    [extra, setExtra] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    request<TldView>('/admin/tlds/' + id)
      .then((t) => {
        setTld(t);
        setRegistrarId(t.registrars[0]?.registrarId || '');
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (!globalPermissions[user.globalRole].includes('registrations.manage'))
    return null;
  return (
    <Card className="section-gap">
      <h2>Política de registo</h2>
      <p>
        Aprove apenas após verificar restrições, contactos obrigatórios, países
        e condições do TLD no fornecedor. TLDs com dados adicionais mantêm-se em
        análise manual.
      </p>
      {error && <p className="error">{error}</p>}
      <FormField id="registration-registrar" label="Registrador">
        <Select
          id="registration-registrar"
          value={registrarId}
          onChange={(e) => setRegistrarId(e.target.value)}
        >
          {tld?.registrars.map((r) => (
            <option key={r.registrarId} value={r.registrarId}>
              {r.registrar.name}
            </option>
          ))}
        </Select>
      </FormField>
      <label>
        <Checkbox
          checked={approved}
          onChange={(e) => setApproved(e.target.checked)}
        />{' '}
        Condições verificadas e aprovadas para automatização
      </label>
      <label>
        <Checkbox
          checked={extra}
          onChange={(e) => setExtra(e.target.checked)}
        />{' '}
        Exige dados adicionais ou validação manual
      </label>
      <ConfirmDialog
        title="Guardar política de registo?"
        description="A decisão será auditada. As proteções de ambiente continuam obrigatórias."
        onConfirm={async () => {
          await mutate(
            '/admin/tlds/' + id + '/registration-policy',
            { registrarId, approved, requiresAdditionalData: extra },
            'PATCH',
          );
          toast.success('Política de registo guardada');
        }}
      >
        Guardar política
      </ConfirmDialog>
    </Card>
  );
}
