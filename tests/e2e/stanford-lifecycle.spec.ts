/**
 * Stanford lifecycle: clean slate → add → extract → delete.
 *
 * Verifies the full portal lifecycle works end-to-end.
 * If Stanford already exists at the start, removes it first.
 *
 * Excluded from `pnpm test:e2e` by default (see playwright.config.ts testIgnore).
 * Run explicitly:
 *   E2E_STANFORD=1 npx playwright test tests/e2e/stanford-lifecycle.spec.ts
 *
 * Requires Stanford credentials in providers.json and a bundled API key.
 */

import { test as base, expect } from './fixtures';
import { _electron as electron } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import type { Page, ElectronApplication } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

interface StanfordConfig {
  url: string;
  name: string;
  username: string;
  password: string;
}

function loadStanfordConfig(): StanfordConfig | null {
  try {
    const raw = fs.readFileSync(path.join(projectRoot, 'providers.json'), 'utf-8');
    const parsed = JSON.parse(raw);
    const provider = parsed.providers.find((p: { id: string }) => p.id === 'stanford');
    if (!provider) return null;
    return {
      url: provider.url,
      name: provider.name,
      username: provider.username,
      password: provider.password,
    };
  } catch {
    return null;
  }
}

const stanford = loadStanfordConfig();

const require = createRequire(import.meta.url);
const electronPath: string = require('electron') as string;

// Override the fixture to use a temp download folder with incremental OFF
// so extraction isn't skipped by pre-existing PDFs.
const test = base.extend<{ app: ElectronApplication; page: Page }>({
  app: async ({}, use) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrf-lifecycle-'));
    const tmpDownloads = path.join(tmpDir, 'downloads');
    fs.mkdirSync(tmpDownloads, { recursive: true });

    const config = {
      downloadFolder: tmpDownloads,
      showBrowser: false,
      incrementalExtraction: false,
      theme: 'system',
      apiKeySource: 'bundled',
      portals: [],
    };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(config, null, 2), 'utf-8');

    const app = await electron.launch({
      executablePath: electronPath,
      args: [path.join(__dirname, '../../dist-electron/main.js')],
      env: { ...process.env, HRF_USER_DATA_PATH: tmpDir },
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

test.skip(!process.env.E2E_STANFORD, 'Set E2E_STANFORD=1 to run this test');
test.skip(!stanford, 'Stanford provider not found in providers.json');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function addStanfordPortal(page: Page, config: StanfordConfig): Promise<void> {
  const getStarted = page.locator('text=Add your first health portal');
  if (await getStarted.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await getStarted.click();
  } else {
    await page.click('text=+ Add portal');
  }

  await page.waitForSelector('#portal-url', { timeout: 10_000 });
  await page.fill('#portal-url', config.url);
  await page.waitForTimeout(500);
  await page.fill('#portal-name', config.name);
  await page.fill('#portal-username', config.username);
  await page.fill('#portal-password', config.password);

  // Stanford does not require 2FA
  await page.click('button:has-text("No")');

  await page.click('button[type="submit"]');
  await page.waitForSelector('.portal-list-page', { timeout: 10_000 });
  await expect(page.locator('.portal-card-name').first()).toHaveText(config.name);
}

async function removeStanfordPortal(page: Page): Promise<void> {
  // Accept the confirmation dialog
  page.once('dialog', (dialog) => dialog.accept());
  await page.click('.portal-card button:has-text("Remove")');

  // Portal should be gone — empty state visible
  await page.waitForSelector('text=Add your first health portal', { timeout: 10_000 });
}

async function removeStanfordIfExists(page: Page): Promise<void> {
  const card = page.locator('.portal-card').first();
  if (await card.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await removeStanfordPortal(page);
  }
}

async function runExtractionAndVerify(page: Page): Promise<void> {
  const fetchButton = page.locator('.portal-card button:has-text("Fetch records")').first();
  await fetchButton.waitFor({ state: 'visible', timeout: 10_000 });
  await fetchButton.click();

  // Progress panel appears
  await page.waitForSelector('.progress-panel', { timeout: 30_000 });

  // Wait for extraction to finish
  await page.waitForSelector('.progress-complete-message, .error-summary', {
    timeout: 600_000,
  });

  // Assert success
  await expect(page.locator('.progress-complete-message')).toBeVisible();
  await expect(page.locator('.progress-complete-message')).toContainText(
    'Done. Your records are in your download folder.',
  );

  // Close progress panel
  await page.click('.progress-panel-footer button:has-text("Close")');
  await page.waitForTimeout(1000);
  await expect(page.locator('.portal-card').first()).toContainText('Last fetched');
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test('stanford: clean slate → add → extract → delete', async ({ page }) => {
  // One full extraction cycle — allow 10 minutes
  test.setTimeout(600_000);

  // --- Boot ---
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });

  // --- Step 1: clean slate (remove Stanford if it exists) ---
  await removeStanfordIfExists(page);

  // --- Step 2: add → extract → delete ---
  await addStanfordPortal(page, stanford!);
  await runExtractionAndVerify(page);
  await removeStanfordPortal(page);
});
