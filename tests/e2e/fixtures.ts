import { test as base, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve the local Electron binary path so Playwright doesn't try to download
// its own Electron — the project already has electron installed as a devDependency.
const require = createRequire(import.meta.url);
const electronPath: string = require('electron') as string;

type TestFixtures = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<TestFixtures>({
  app: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrf-test-'));

    // Pre-write a minimal config.json so the app boots without requiring
    // any wizard or API key setup. Using 'bundled' apiKeySource (the default)
    // means the app will not prompt for a key.
    const config = {
      downloadFolder: path.join(os.homedir(), 'Documents', 'HealthRecords'),
      showBrowser: false,
      incrementalExtraction: true,
      theme: 'system',
      apiKeySource: 'bundled',
      portals: [],
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

    const app = await electron.launch({
      executablePath: electronPath,
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
 * Helper: wait for the app to finish loading and show the portal list.
 * In v2 there is no welcome wizard — the app shows the portal list directly.
 * This replaces the old completeWelcome() that navigated through a multi-step wizard.
 */
export async function completeWelcome(page: Page): Promise<void> {
  // Wait for the portal list page to be visible. The app boots straight into
  // the portal list (with an "Add your first health portal" get-started card
  // when empty, or portal cards when portals exist).
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });
}
