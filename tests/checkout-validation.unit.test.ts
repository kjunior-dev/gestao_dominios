import 'reflect-metadata';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  checkoutSchema,
  domainContactSchema,
  validationIssues,
} from '@devtrust/contracts';
import { SchemaPipe } from '../apps/api/src/common/validation.pipe';
import { ApiError, request } from '../apps/web/src/lib/api';
import { checkoutFieldIssues } from '../apps/web/src/features/transactions/checkout-validation';

const valid = {
  organizationId: '11111111-1111-4111-8111-111111111111',
  contactId: '22222222-2222-4222-8222-222222222222',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  nameservers: ['ns1.example.test', 'ns2.example.test'],
  billing: {
    legalName: 'Cliente Teste',
    address: 'Rua 1',
    city: 'Praia',
    postalCode: '7600',
    countryCode: 'CV',
  },
  acceptTerms: true,
  termsVersion: 'test-v1',
};
afterEach(() => vi.unstubAllGlobals());
describe('Checkout validation details', () => {
  it('keeps grouped fields and supplies nested billing and indexed DNS paths', () => {
    try {
      new SchemaPipe(checkoutSchema).transform({
        ...valid,
        nameservers: ['http://invalid.test', 'ns2.example.test'],
        billing: { ...valid.billing, postalCode: '' },
      });
      expect.fail('Invalid input should be rejected');
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse() as {
        fields: Record<string, string[]>;
        issues: unknown[];
      };
      expect(body.fields.nameservers).toHaveLength(1);
      expect(body.fields.billing).toHaveLength(1);
      expect(body.issues).toContainEqual({
        path: ['nameservers', 0],
        message: expect.stringContaining('nome DNS válido'),
      });
      expect(body.issues).toContainEqual({
        path: ['billing', 'postalCode'],
        message: expect.stringContaining('pelo menos 1'),
      });
    }
  });
  it('identifies duplicated DNS after case normalization and preserves the valid contract', () => {
    const parsed = checkoutSchema.safeParse({
      ...valid,
      nameservers: ['NS1.EXAMPLE.TEST', 'ns1.example.test'],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(
        checkoutFieldIssues(validationIssues(parsed.error), 'checkout'),
      ).toContainEqual({
        fieldId: 'ns2',
        label: 'Nameservers',
        message: 'Nameservers duplicados.',
      });
    expect(checkoutSchema.parse(valid).nameservers).toEqual(valid.nameservers);
  });
  it('maps generated billing fields back to editable inputs', () => {
    const issues = [
      { path: ['billing', 'legalName'], message: 'Nome demasiado longo' },
      { path: ['billing', 'address'], message: 'Morada demasiado longa' },
    ];
    expect(
      checkoutFieldIssues(issues, 'checkout').map((i) => i.fieldId),
    ).toEqual(['contact-firstName', 'contact-address']);
    expect(checkoutFieldIssues(issues, 'checkout', 'Empresa')[0].fieldId).toBe(
      'contact-companyName',
    );
  });
  it('uses actionable messages for internal references instead of identifiers', () => {
    const errors = checkoutFieldIssues(
      [
        { path: ['contactId'], message: 'Invalid uuid' },
        { path: ['organizationId'], message: 'Invalid uuid' },
      ],
      'checkout',
    );
    expect(errors[0]).toMatchObject({
      fieldId: null,
      label: 'Contacto de titularidade',
    });
    expect(errors[1]).toMatchObject({
      fieldId: 'checkout-org',
      label: 'Organização',
    });
    expect(JSON.stringify(errors)).not.toContain('uuid');
  });
  it('provides Portuguese errors without returning submitted enum values', () => {
    const result =
      domainContactSchema.shape.contactType.safeParse('private-input');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(validationIssues(result.error)[0].message).toBe(
        'Selecione ou introduza um valor válido.',
      );
      expect(JSON.stringify(validationIssues(result.error))).not.toContain(
        'private-input',
      );
    }
  });
  it('preserves field errors and issues in the frontend HTTP client', async () => {
    const fields = { billing: ['Código postal obrigatório'] },
      issues = [
        {
          path: ['billing', 'postalCode'],
          message: 'Código postal obrigatório',
        },
      ];
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: 'Dados inválidos', fields, issues },
            }),
            { status: 400 },
          ),
      ),
    );
    await expect(
      request('/checkout', { method: 'POST' }),
    ).rejects.toMatchObject({ status: 400, fields, issues });
  });
  it('supports older API errors and tolerates malformed validation metadata', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Dados inválidos',
              fields: { nameservers: ['Formato inválido'] },
            },
          }),
          { status: 400 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message: 'Dados inválidos',
              fields: { nameservers: 123 },
              issues: 'invalid',
            },
          }),
          { status: 400 },
        ),
      );
    vi.stubGlobal('fetch', transport);
    await expect(request('/checkout')).rejects.toMatchObject({
      fields: { nameservers: ['Formato inválido'] },
      issues: [],
    });
    await expect(request('/checkout')).rejects.toMatchObject({
      fields: {},
      issues: [],
    });
  });
  it('keeps non-validation and network errors usable', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { message: 'Cotação expirada' } }),
            { status: 409 },
          ),
        )
        .mockRejectedValueOnce(new Error('connection refused')),
    );
    await expect(request('/checkout')).rejects.toMatchObject({
      message: 'Cotação expirada',
      status: 409,
    });
    await expect(request('/checkout')).rejects.toBeInstanceOf(ApiError);
  });
});
