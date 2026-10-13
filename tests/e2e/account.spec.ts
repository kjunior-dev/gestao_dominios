import { test, expect } from '@playwright/test';
const email = 'e2e-' + Date.now() + '@example.test',
  password = 'E2E-password-secure-2026';
test('homepage is honest and responsive', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (/hydration|hydrated|didn.t match/i.test(message.text()))
      hydrationErrors.push('Hydration warning');
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /A sua próxima grande ideia/ }),
  ).toBeVisible();
  await page.getByLabel('Nome de domínio').fill('devtrust.cv');
  await page.getByRole('button', { name: 'Explorar domínio' }).click();
  await expect(page.getByText(/Não foi efetuada uma consulta/)).toBeVisible();
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Alternar tema' }).click();
  expect(hydrationErrors).toEqual([]);
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});
test('protected pages redirect anonymous users', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login/);
});
test('register, login, edit profile, organization and logout', async ({
  page,
}) => {
  await page.goto('/registar');
  await page.getByLabel('Nome', { exact: true }).fill('Cliente');
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
  await expect(
    page.getByRole('heading', { name: 'Olá, Cliente.' }),
  ).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/dashboard/perfil');
  await page.getByLabel('Nome', { exact: true }).fill('Atualizado');
  await page.getByRole('button', { name: 'Guardar alterações' }).click();
  await expect(page.getByText('Perfil atualizado')).toBeVisible();
  await page.goto('/dashboard/organizacao');
  await page.getByLabel('Nome', { exact: true }).fill('Organização E2E');
  await page.getByLabel('Identificador (slug)').fill('e2e-' + Date.now());
  await page.getByRole('button', { name: 'Criar organização' }).click();
  await expect(page.getByText('Organização guardada')).toBeVisible();
  await page.goto('/dashboard/membros');
  await page.getByRole('button', { name: 'Remover', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'pelo menos um OWNER' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.setViewportSize({ width: 375, height: 850 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Abrir navegação' }).click();
  await page
    .getByRole('button', { name: 'Terminar sessão', exact: true })
    .click();
  await expect(page).toHaveURL(/\/login$/);
});
test('shows login error without leaking internals', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('nobody@example.test');
  await page.getByLabel('Password', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Credenciais inválidas' }),
  ).toBeVisible();
});

test('verifies email and recovers password through the development mailbox', async ({
  page,
}) => {
  const { readdir, readFile } = await import('node:fs/promises');
  const accountEmail = 'mail-' + Date.now() + '@example.test';
  const mailbox = process.env.DEV_MAILBOX_DIR!;
  async function findLink(subject: string) {
    try {
      for (const file of (await readdir(mailbox)).reverse()) {
        const mail = JSON.parse(await readFile(mailbox + '/' + file, 'utf8'));
        if (mail.to === accountEmail && mail.subject === subject)
          return mail.link as string;
      }
    } catch {
      return '';
    }
    return '';
  }
  await page.goto('/registar');
  await page.getByLabel('Nome', { exact: true }).fill('Email');
  await page.getByLabel('Apelido').fill('Teste');
  await page.getByLabel('Email', { exact: true }).fill(accountEmail);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Conta criada' }),
  ).toBeVisible();
  await expect
    .poll(() => findLink('Confirmação de email'), { timeout: 15000 })
    .not.toBe('');
  await page.goto(await findLink('Confirmação de email'));
  await page.getByRole('button', { name: 'Confirmar email' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Email confirmado' }),
  ).toBeVisible();
  await page.goto('/esqueci-password');
  await page.getByLabel('Email', { exact: true }).fill(accountEmail);
  await page.getByRole('button', { name: 'Enviar instruções' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Se a conta existir' }),
  ).toBeVisible();
  await expect
    .poll(() => findLink('Recuperação de password'), { timeout: 15000 })
    .not.toBe('');
  await page.goto(await findLink('Recuperação de password'));
  await page
    .getByLabel('Password', { exact: true })
    .fill('Recovered-password-2026');
  await page.getByRole('button', { name: 'Guardar password' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Password atualizada' }),
  ).toBeVisible();
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(accountEmail);
  await page
    .getByLabel('Password', { exact: true })
    .fill('Recovered-password-2026');
  await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
});

test('enrolls administrator MFA and opens real administrative lists', async ({
  page,
}) => {
  const { PrismaClient } = await import('@devtrust/database');
  const { authenticator } = await import('otplib');
  const { randomBytes } = await import('node:crypto');
  const adminEmail = 'admin-ui-' + Date.now() + '@example.test';
  const adminPassword = randomBytes(24).toString('hex');
  const registration = await page.request.post('/api/v1/auth/register', {
    headers: { Origin: process.env.APP_URL! },
    data: {
      email: adminEmail,
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'E2E',
    },
  });
  expect(registration.status()).toBe(201);
  const account = await registration.json();
  const db = new PrismaClient();
  try {
    await db.user.update({
      where: { id: account.id },
      data: { globalRole: 'ADMIN' },
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(adminEmail);
    await page.getByLabel('Password', { exact: true }).fill(adminPassword);
    await page.getByRole('button', { name: 'Entrar na minha conta' }).click();
    await expect(page).toHaveURL(/\/dashboard\/seguranca$/);
    await page.getByRole('button', { name: 'Configurar MFA' }).click();
    const secret = (await page
      .locator('code.code-block')
      .first()
      .textContent())!;
    await page
      .getByLabel('Código de 6 dígitos')
      .fill(authenticator.generate(secret));
    await page.getByRole('button', { name: 'Confirmar segundo fator' }).click();
    await expect(page.getByText('MFA ativa', { exact: true })).toBeVisible();
    await page.goto('/admin');
    await expect(
      page.getByRole('heading', { name: 'Visão da plataforma' }),
    ).toBeVisible();
    await page.goto('/admin/utilizadores');
    await page.getByLabel('Pesquisar registos').fill(adminEmail);
    await expect(
      page.getByRole('cell', { name: adminEmail, exact: true }),
    ).toBeVisible();
    await page.goto('/admin/auditoria');
    await expect(
      page.getByRole('heading', { name: 'Auditoria' }),
    ).toBeVisible();
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
  } finally {
    await db.$disconnect();
  }
});
