import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  timeout: 60_000,
  // Run tests serially to avoid Electron instance conflicts.
  workers: 1,
  reporter: 'list',
});
