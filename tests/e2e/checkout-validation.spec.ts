import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { randomBytes, randomUUID } from 'node:crypto';

async function prepareCheckout(page: Page) {
  const origin = process.env.APP_URL!,
    email = 'validation-' + randomUUID() + '@example.test',
    password = randomBytes(24).toString('hex');
  expect(
    (
      await page.request.post('/api/v1/auth/register', {
        headers: { Origin: origin },
        data: { email, password, firstName: 'Validation', lastName: 'Test' },
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await page.request.post('/api/v1/auth/login', {
        headers: { Origin: origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(200);
  const csrf = (await page.context().cookies()).find(
    (cookie) => cookie.name === 'dt_csrf',
  )!.value;
  expect(
    (
      await page.request.post('/api/v1/organizations', {
        headers: { Origin: origin, 'X-CSRF-Token': csrf },
        data: {
          name: 'Checkout validation',
          slug: 'validation-' + randomUUID(),
          type: 'INDIVIDUAL',
          country: 'CV',
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/dominios/pesquisar');
  await page
    .getByLabel('Nome de domínio')
    .fill('validation-' + randomUUID() + '.com');
  await page.getByRole('button', { name: 'Pesquisar domínio' }).click();
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho' })
    .first()
    .click();
  await expect(page.getByText('Domínio adicionado ao carrinho')).toBeVisible();
  await page.goto('/checkout');
  await expect(
    page.getByRole('heading', { name: 'Confirmar encomenda' }),
  ).toBeVisible();
  await page.getByLabel('Número de telefone', { exact: true }).fill('9999999');
  await page.getByLabel('Rua', { exact: true }).fill('Rua de teste');
  await page.getByLabel('Número da porta').fill('1');
  await page.getByLabel('Cidade', { exact: true }).fill('Praia');
  await page.getByLabel('Código postal').fill('7600');
  await page.getByLabel('Nameserver 1').fill('ns1.example.test');
  await page.getByLabel('Nameserver 2').fill('ns2.example.test');
}

test('validates all checkout fields before saving a contact and preserves values on retry', async ({
  page,
}) => {
  await prepareCheckout(page);
  let writes = 0;
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      /\/api\/v1\/(domain-contacts|checkout)$/.test(new URL(req.url()).pathname)
    )
      writes++;
  });
  await page.getByLabel('Nameserver 1').fill('https://invalid.example.test');
  await page.getByLabel('Identificador fiscal (opcional)').fill('1'.repeat(41));
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  const summary = page.locator('#checkout-errors');
  await expect(summary).toContainText('Nameserver 1:');
  await expect(summary).toContainText('Identificador fiscal:');
  await expect(summary).toContainText('Aceitação dos termos:');
  await expect(page.getByLabel('Nameserver 1')).toBeFocused();
  await expect(page.getByLabel('Rua', { exact: true })).toHaveValue(
    'Rua de teste',
  );
  expect(writes).toBe(0);
  await page.getByRole('checkbox', { name: /Aceito os termos/ }).check();
  await page.getByLabel('Identificador fiscal (opcional)').fill('');
  await page.getByLabel('Nameserver 1').fill('NS2.EXAMPLE.TEST');
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(summary).toContainText('Nameservers duplicados.');
  await expect(page.getByLabel('Nameserver 2')).toBeFocused();
  expect(writes).toBe(0);
  await page.getByLabel('Nameserver 1').fill('ns1.example.test');
  await page.getByLabel('Nome', { exact: true }).fill('a'.repeat(100));
  await page.getByLabel('Apelido', { exact: true }).fill('b'.repeat(100));
  await page.getByLabel('Rua', { exact: true }).fill('c'.repeat(160));
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(summary).toContainText('Nome de faturação');
  await expect(summary).toContainText('Morada de faturação');
  expect(writes).toBe(0);
  await page.getByLabel('Nome', { exact: true }).fill('Validation');
  await page.getByLabel('Apelido', { exact: true }).fill('Test');
  await page.getByLabel('Rua', { exact: true }).fill('Rua de teste');
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmacao\?order=/);
  expect(writes).toBe(2);
});

test('displays server field errors and reuses the saved contact after a corrected retry', async ({
  page,
}) => {
  await prepareCheckout(page);
  await page.getByRole('checkbox', { name: /Aceito os termos/ }).check();
  let contacts = 0,
    attempts = 0;
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      new URL(req.url()).pathname === '/api/v1/domain-contacts'
    )
      contacts++;
  });
  await page.route('**/api/v1/checkout', async (route) => {
    if (++attempts === 1)
      return route.fulfill({
        status: 400,
        json: {
          error: {
            message: 'Dados inválidos',
            fields: {
              nameservers: ['DNS rejeitado'],
              billing: ['Código postal rejeitado'],
            },
            issues: [
              {
                path: ['nameservers', 0],
                message: 'Indique o nameserver fornecido pelo alojamento.',
              },
              {
                path: ['billing', 'postalCode'],
                message: 'Confirme o código postal da faturação.',
              },
            ],
          },
        },
      });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  const summary = page.locator('#checkout-errors');
  await expect(summary).toContainText(
    'Não foi possível confirmar a encomenda.',
  );
  await expect(summary).toContainText('Nameserver 1: Indique o nameserver');
  await expect(summary).toContainText(
    'Código postal: Confirme o código postal',
  );
  await expect(page.getByLabel('Nameserver 1')).toBeFocused();
  await expect(page.getByLabel('Código postal')).toHaveValue('7600');
  await page.getByLabel('Nameserver 1').fill('ns3.example.test');
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmacao\?order=/);
  expect(contacts).toBe(1);
  expect(attempts).toBe(2);
});

test('identifies contact failures and keeps the checkout form editable', async ({
  page,
}) => {
  await prepareCheckout(page);
  await page.getByRole('checkbox', { name: /Aceito os termos/ }).check();
  let contacts = 0,
    orders = 0;
  page.on('request', (req) => {
    if (
      req.method() === 'POST' &&
      new URL(req.url()).pathname === '/api/v1/checkout'
    )
      orders++;
  });
  await page.route('**/api/v1/domain-contacts', async (route) => {
    if (++contacts === 1)
      return route.fulfill({
        status: 400,
        json: {
          error: {
            message: 'Dados inválidos',
            fields: { phone: ['Confirme o número de telefone.'] },
            issues: [
              { path: ['phone'], message: 'Confirme o número de telefone.' },
            ],
          },
        },
      });
    return route.continue();
  });
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(page.locator('#checkout-errors')).toContainText(
    'Não foi possível guardar o contacto de titularidade.',
  );
  await expect(page.locator('#checkout-errors')).toContainText(
    'Número de telefone: Confirme',
  );
  await expect(
    page.getByLabel('Número de telefone', { exact: true }),
  ).toBeFocused();
  await expect(page.getByLabel('Nameserver 1')).toHaveValue('ns1.example.test');
  expect(orders).toBe(0);
  await page.getByLabel('Número de telefone', { exact: true }).fill('9999998');
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmacao\?order=/);
  expect(contacts).toBe(2);
  expect(orders).toBe(1);
});
