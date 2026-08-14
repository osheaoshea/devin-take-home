import { defineConfig } from '@playwright/test';

/** The webhook is secret-gated, so the server under test and the specs share one value. */
export const WEBHOOK_SECRET = process.env.KYC_WEBHOOK_SECRET ?? 'e2e-webhook-secret';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:3000' },
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'pnpm build && pnpm start',
        url: 'http://localhost:3000',
        env: { KYC_WEBHOOK_SECRET: WEBHOOK_SECRET },
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
