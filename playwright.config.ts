import { defineConfig, devices } from '@playwright/test';
if (process.env.NODE_ENV !== 'test')
  throw new Error('E2E requires NODE_ENV=test');
if (
  !process.env.DATABASE_URL ||
  !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')
)
  throw new Error('E2E requires a database ending in _test.');
if (!process.env.REDIS_URL?.endsWith('/1'))
  throw new Error('E2E requires isolated Redis DB 1.');
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.APP_URL || 'http://localhost:3300',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @devtrust/api dev',
      url: 'http://localhost:4400/api/openapi.json',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'pnpm --filter @devtrust/worker dev',
      url: 'http://localhost:4400/api/v1/health',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command:
        'pnpm --filter @devtrust/web exec next dev --port 3300 --hostname localhost',
      url: 'http://localhost:3300',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
