'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v3';
import { organizationSchema } from '@devtrust/contracts';
import {
  PageHeader,
  Card,
  FormField,
  Input,
  Select,
  Button,
  Badge,
} from '@devtrust/ui';
import { toast } from 'sonner';
import { useAccount } from '@/hooks/account-context';
import { mutate } from '@/lib/api';
export function OrganizationEditor() {
  const { organization, refresh, select } = useAccount(),
    [create, setCreate] = useState(false);
  const editing = organization && !create;
  const canEdit = !editing || organization.role === 'OWNER';
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      country: 'CV',
      type: 'BUSINESS',
      taxId: '',
    },
  });
  useEffect(() => {
    reset(
      editing
        ? {
            name: organization.name,
            slug: organization.slug,
            country: organization.country,
            type: organization.type,
            taxId: organization.taxId,
          }
        : { name: '', slug: '', country: 'CV', type: 'BUSINESS', taxId: '' },
    );
  }, [editing, organization, reset]);
  return (
    <>
      <PageHeader
        title="Organização"
        description="Os dados que identificam o seu negócio."
        action={
          <Button variant="secondary" onClick={() => setCreate(!create)}>
            {create ? 'Voltar' : 'Nova organização'}
          </Button>
        }
      />
      <Card>
        {editing && <Badge>{organization.role}</Badge>}
        <form
          className="form-stack section-gap"
          onSubmit={handleSubmit(async (data) => {
            try {
              const result = await mutate<{ id: string }>(
                editing
                  ? '/organizations/' + organization.id
                  : '/organizations',
                data,
                editing ? 'PATCH' : 'POST',
              );
              await refresh();
              select(result.id);
              setCreate(false);
              toast.success('Organização guardada');
            } catch (e) {
              toast.error((e as Error).message);
            }
          })}
        >
          {(['name', 'slug', 'country', 'taxId'] as const).map((field, i) => (
            <FormField
              key={field}
              id={field}
              label={
                [
                  'Nome',
                  'Identificador (slug)',
                  'País (código ISO)',
                  'Número fiscal (opcional)',
                ][i]
              }
              error={errors[field]?.message}
            >
              <Input id={field} disabled={!canEdit} {...register(field)} />
            </FormField>
          ))}
          <FormField id="type" label="Tipo">
            <Select id="type" disabled={!canEdit} {...register('type')}>
              <option value="BUSINESS">Empresa</option>
              <option value="INDIVIDUAL">Individual</option>
            </Select>
          </FormField>
          {canEdit ? (
            <Button disabled={isSubmitting}>
              {editing ? 'Guardar alterações' : 'Criar organização'}
            </Button>
          ) : (
            <p>Apenas OWNER pode alterar estes dados.</p>
          )}
        </form>
      </Card>
    </>
  );
}
