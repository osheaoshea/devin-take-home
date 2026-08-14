import { defineConfig } from '@playwright/test';

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
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
