import { test, expect } from '@playwright/test';
import { randomBytes } from 'node:crypto';
test('checkout, mock payment, asynchronous registration and internal receipt', async ({
  page,
}) => {
  test.setTimeout(120000);
  const origin = process.env.APP_URL!,
    email = 'checkout-' + Date.now() + '@example.test',
    password = randomBytes(24).toString('hex');
  expect(
    (
      await page.request.post('/api/v1/auth/register', {
        headers: { Origin: origin },
        data: { email, password, firstName: 'Checkout', lastName: 'E2E' },
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
    (c) => c.name === 'dt_csrf',
  )!.value;
  expect(
    (
      await page.request.post('/api/v1/organizations', {
        headers: { Origin: origin, 'X-CSRF-Token': csrf },
        data: {
          name: 'Checkout E2E',
          slug: 'checkout-' + Date.now(),
          type: 'INDIVIDUAL',
          country: 'CV',
        },
      })
    ).status(),
  ).toBe(201);
  await page.goto('/dominios/pesquisar');
  const domain = 'checkout-' + Date.now() + '.com';
  await page.getByLabel('Nome de domínio').fill(domain);
  await page.getByRole('button', { name: 'Pesquisar domínio' }).click();
  await expect(page.getByRole('heading', { name: domain })).toBeVisible();
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho' })
    .first()
    .click();
  await page.goto('/checkout');
  await expect(
    page.getByRole('heading', { name: 'Confirmar encomenda' }),
  ).toBeVisible();
  await page.getByLabel('Número de telefone', { exact: true }).fill('9999999');
  await page.getByLabel('Rua', { exact: true }).fill('Test street');
  await page.getByLabel('Número da porta').fill('1');
  await page.getByLabel('Cidade', { exact: true }).fill('Praia');
  await page.getByLabel('Código postal').fill('7600');
  await page.getByLabel('Nameserver 1').fill('ns1.example.test');
  await page.getByLabel('Nameserver 2').fill('ns2.example.test');
  await page.getByRole('checkbox', { name: /Aceito os termos/ }).check();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Criar encomenda de teste' }).click();
  await expect(page).toHaveURL(/\/checkout\/confirmacao\?order=/);
  await expect(
    page.getByText('MOCK · Sem cobrança ou registo real'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar pagamento mock' }).click();
  await expect(page).toHaveURL(/\/checkout\/resultado\//);
  await page
    .getByRole('button', { name: 'Simular pagamento aprovado' })
    .click();
  await expect(
    page.getByText('COMPLETED', { exact: true }).first(),
  ).toBeVisible({ timeout: 30000 });
  await page.goto('/dashboard/dominios');
  await expect(page.getByText(domain, { exact: true })).toBeVisible();
  await page
    .getByRole('link', { name: 'Consultar', exact: true })
    .first()
    .click();
  await expect(
    page.getByText('Simulação de desenvolvimento.', { exact: false }),
  ).toBeVisible();
  await page.goto('/dashboard/faturas');
  await expect(
    page.getByRole('link', { name: 'Download PDF' }).first(),
  ).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download PDF' }).first().click();
  expect((await download).suggestedFilename()).toMatch(
    /^devtrust-internal-.*\.pdf$/,
  );
});
test('checkout requires login and handles an empty authenticated cart', async ({
  page,
}) => {
  await page.goto('/checkout');
  await expect(page).toHaveURL(/\/login/);
  const origin = process.env.APP_URL!,
    email = 'empty-checkout-' + Date.now() + '@example.test',
    password = randomBytes(24).toString('hex');
  await page.request.post('/api/v1/auth/register', {
    headers: { Origin: origin },
    data: { email, password, firstName: 'Empty', lastName: 'Checkout' },
  });
  await page.request.post('/api/v1/auth/login', {
    headers: { Origin: origin },
    data: { email, password },
  });
  await page.goto('/checkout');
  await expect(
    page.getByRole('heading', { name: 'Carrinho vazio' }),
  ).toBeVisible();
});
