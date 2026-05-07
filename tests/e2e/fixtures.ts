import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

type TestFixtures = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<TestFixtures>({
  app: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrf-test-'));
    const app = await electron.launch({
      args: [path.join(__dirname, '../../dist-electron/main.js')],
      env: {
        ...process.env,
        HRF_USER_DATA_PATH: tmpDir,
      },
    });
    await use(app);
    await app.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  },
  page: async ({ app }, use) => {
    const page = await app.firstWindow();
    await use(page);
  },
});

export { expect } from '@playwright/test';

/**
 * Helper: complete the welcome wizard quickly so tests can get to the portal list.
 * Enters a valid-format API key and clicks through all steps.
 */
export async function completeWelcome(page: Page): Promise<void> {
  // Step 1: Overview — click Get Started
  await page.waitForSelector('text=Get Started');
  await page.click('text=Get Started');

  // Step 2: API Key — enter a key and continue
  await page.waitForSelector('#api-key');
  await page.fill('#api-key', 'sk-ant-test-key-12345678901234567890');
  await page.click('text=Continue');

  // Step 3: Download Folder — just finish without choosing a folder
  await page.waitForSelector('text=Finish Setup');
  await page.click('text=Finish Setup');

  // Wait until portal list is visible
  await page.waitForSelector('h1:has-text("Your Portals")');
}
