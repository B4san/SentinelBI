import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: process.env.DASH_URL || 'http://127.0.0.1:3000',
  },
  webServer: process.env.DASH_URL
    ? undefined
    : {
        command: 'npm run dev',
        port: 3000,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
