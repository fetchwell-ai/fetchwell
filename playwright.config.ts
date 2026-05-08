import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  testIgnore: ['**/integration.spec.ts', '**/ucsf-discovery.spec.ts'],
  timeout: 60_000,
  // Run tests serially to avoid Electron instance conflicts.
  workers: 1,
  reporter: 'list',
});
