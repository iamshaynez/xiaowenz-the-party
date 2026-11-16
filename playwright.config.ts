import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.PARTY_BASE_URL;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  ...(externalBaseURL ? {} : {
    webServer: {
      command: 'pnpm --filter @party/web build && PORT=4173 pnpm --filter @party/server start',
      url: 'http://127.0.0.1:4173/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  }),
});
