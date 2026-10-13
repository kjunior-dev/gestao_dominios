import { test, expect } from '@playwright/test';
test('searches, quotes, persists guest cart and recovers it after login', async ({
  page,
}) => {
  const email = 'cart-e2e-' + Date.now() + '@example.test',
    password = 'Cart-E2E-secure-password-2026';
  await page.goto('/');
  await page.getByLabel('Nome de domínio').fill('e2eshop.com');
  await page.getByRole('button', { name: 'Pesquisar domínio' }).click();
  await expect(
    page.getByRole('heading', { name: 'e2eshop.com' }),
  ).toBeVisible();
  await expect(
    page.getByText('Disponível', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('12,00 CVE').first()).toBeVisible();
  await page
    .getByRole('button', { name: 'Adicionar ao carrinho' })
    .first()
    .click();
  await expect(page.getByText('Domínio adicionado ao carrinho')).toBeVisible();
  await page.goto('/carrinho');
  await expect(
    page.getByRole('heading', { name: 'e2eshop.com' }),
  ).toBeVisible();
  await page
    .getByLabel('Período de e2eshop.com', { exact: true })
    .selectOption('2');
  await expect(page.getByText('Subtotal: 24,00 CVE')).toBeVisible();
  await page.reload();
  await expect(
    page.getByLabel('Período de e2eshop.com', { exact: true }),
  ).toHaveValue('2');
  await page.goto('/registar');
  await page.getByLabel('Nome', { exact: true }).fill('Carrinho');
  await page.getByLabel('Apelido').fill('E2E');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Conta criada' }),
  ).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/carrinho');
  await expect(
    page.getByRole('heading', { name: 'e2eshop.com' }),
  ).toBeVisible();
  await expect(page.getByText('Subtotal: 24,00 CVE')).toBeVisible();
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByText('O carrinho está vazio')).toBeVisible();
});
test('presents occupied and unsupported domains honestly', async ({ page }) => {
  await page.goto('/dominios/pesquisar');
  await page.getByLabel('Nome de domínio').fill('occupied.com');
  await page.getByRole('button', { name: 'Pesquisar domínio' }).click();
  await expect(
    page.getByText('Registado', { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Adicionar ao carrinho' }).first(),
  ).toBeDisabled();
  await page.getByLabel('Nome de domínio').fill('https://localhost/path');
  await page.getByRole('button', { name: 'Pesquisar domínio' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Nome de domínio inválido' }),
  ).toBeVisible();
  await page.goto('/dominios/precos');
  await expect(
    page.getByRole('heading', { name: 'Preços de domínios' }),
  ).toBeVisible();
  await expect(page.getByText('12,00 CVE').first()).toBeVisible();
});
