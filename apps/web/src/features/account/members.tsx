'use client';
import { useState, useEffect } from 'react';
import type { Member } from '@devtrust/contracts';
import { memberSchema } from '@devtrust/contracts';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import {
  PageHeader,
  Card,
  Table,
  Badge,
  Button,
  Input,
  Select,
  FormField,
  LoadingState,
  EmptyState,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { api, mutate } from '@/lib/api';
export function Members() {
  const { organization } = useAccount(),
    [members, setMembers] = useState<Member[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<
    z.input<typeof memberSchema>,
    unknown,
    z.output<typeof memberSchema>
  >({ resolver: zodResolver(memberSchema), defaultValues: { role: 'MEMBER' } });
  useEffect(() => {
    if (!organization) return;
    let active = true;
    api
      .members(organization.id)
      .then((v) => {
        if (active) {
          setMembers(v);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [organization]);
  return (
    <>
      <PageHeader
        title="A sua equipa"
        description="Acesso às pessoas certas, com as permissões certas."
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!organization ? (
        <EmptyState
          title="Crie uma organização"
          description="A equipa é associada a uma organização."
        />
      ) : loading ? (
        <LoadingState />
      ) : (
        <>
          <Card>
            <Table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Papel</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.user.firstName} {m.user.lastName}
                    </td>
                    <td>{m.user.email}</td>
                    <td>
                      {organization.role === 'OWNER' ? (
                        <Select
                          aria-label={'Papel de ' + m.user.firstName}
                          value={m.role}
                          onChange={async (e) => {
                            try {
                              await mutate(
                                '/organizations/' +
                                  organization.id +
                                  '/members/' +
                                  m.id,
                                { role: e.target.value },
                                'PATCH',
                              );
                              setMembers(await api.members(organization.id));
                              toast.success('Papel atualizado');
                            } catch (e) {
                              toast.error((e as Error).message);
                            }
                          }}
                        >
                          {['OWNER', 'MANAGER', 'MEMBER'].map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </Select>
                      ) : (
                        <Badge>{m.role}</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
          {organization.role === 'OWNER' && (
            <Card className="section-gap">
              <h3>Adicionar utilizador registado</h3>
              <p>O utilizador deve criar uma conta antes de ser associado.</p>
              <form
                className="form-stack"
                onSubmit={handleSubmit(async (data) => {
                  try {
                    await mutate(
                      '/organizations/' + organization.id + '/members',
                      data,
                    );
                    setMembers(await api.members(organization.id));
                    toast.success('Membro adicionado');
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                })}
              >
                <FormField
                  id="member-email"
                  label="Email"
                  error={errors.email?.message}
                >
                  <Input
                    id="member-email"
                    type="email"
                    {...register('email')}
                  />
                </FormField>
                <FormField id="role" label="Papel">
                  <Select id="role" {...register('role')}>
                    {['MEMBER', 'MANAGER', 'OWNER'].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </FormField>
                <Button disabled={isSubmitting}>Adicionar membro</Button>
              </form>
            </Card>
          )}
        </>
      )}
    </>
  );
}
