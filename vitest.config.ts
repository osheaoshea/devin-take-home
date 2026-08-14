import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**'],
    setupFiles: ['src/test/setup.ts'],
    globalSetup: ['src/test/global-setup.ts'],
    hookTimeout: 30_000,
    // Database-backed tests share one throwaway database, so files run one at a time.
    fileParallelism: false,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
