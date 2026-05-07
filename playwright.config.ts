import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/setup.ts',
  globalTeardown: './tests/teardown.ts',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    // Tests connect to Steam's existing CEF instance via CDP — no browser is launched.
    headless: false,
  },
});
