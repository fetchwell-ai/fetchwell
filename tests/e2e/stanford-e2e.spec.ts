/**
 * Stanford end-to-end: clean slate → add portal → discover → extract.
 *
 * Excluded from `pnpm test:e2e` by default (see playwright.config.ts testIgnore).
 * Run explicitly:
 *   npx playwright test tests/e2e/stanford-e2e.spec.ts
 *
 * Requires ANTHROPIC_API_KEY in .env and Stanford credentials in providers.json.
 */

import { test, expect } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..', '..');

interface StanfordConfig {
  url: string;
  name: string;
  username: string;
  password: string;
  loginForm: string;
  twoFactor: string;
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
      loginForm: provider.auth?.loginForm ?? 'two-step',
      twoFactor: provider.auth?.twoFactor ?? 'none',
    };
  } catch {
    return null;
  }
}

const stanford = loadStanfordConfig();
const API_KEY = process.env.ANTHROPIC_API_KEY;

test.skip(!process.env.E2E_STANFORD, 'Set E2E_STANFORD=1 to run this test');
test.skip(!API_KEY, 'ANTHROPIC_API_KEY not set — skipping Stanford E2E');
test.skip(!stanford, 'Stanford provider not found in providers.json');

test('stanford: clean slate → add portal → discover → extract', async ({ page }) => {
  // This test runs real discovery + extraction against Stanford (~2-4 min)
  test.setTimeout(600_000);

  // --- Step 1: Complete welcome wizard ---
  await page.waitForSelector('text=Get Started', { timeout: 15_000 });
  await page.click('text=Get Started');

  await page.waitForSelector('#api-key');
  await page.fill('#api-key', API_KEY!);
  await page.click('text=Continue');

  await page.waitForSelector('text=Finish Setup', { timeout: 10_000 });
  await page.click('text=Finish Setup');

  await page.waitForSelector('h1:has-text("Your Portals")', { timeout: 10_000 });

  // --- Step 2: Add Stanford portal ---
  await page.click('text=+ Add Portal');
  await page.waitForSelector('h1:has-text("Add Portal")');

  await page.fill('#portal-url', stanford!.url);
  await page.waitForTimeout(500); // let name auto-populate
  await page.fill('#portal-name', stanford!.name);
  await page.fill('#portal-username', stanford!.username);
  await page.fill('#portal-password', stanford!.password);
  await page.selectOption('#portal-login-type', stanford!.loginForm);
  await page.selectOption('#portal-2fa', stanford!.twoFactor);

  await page.click('button[type="submit"]');
  await page.waitForSelector('h1:has-text("Your Portals")', { timeout: 10_000 });

  // Verify portal card appears
  await expect(page.locator('.portal-card-name').first()).toHaveText(stanford!.name);

  // --- Step 3: Run discovery ---
  const mapButton = page.locator('.portal-card button:has-text("Map")').first();
  await mapButton.waitFor({ state: 'visible' });
  await mapButton.click();

  await page.waitForSelector('.progress-panel', { timeout: 30_000 });

  // Wait for discovery to finish (complete or error)
  await page.waitForSelector('.progress-complete-message, .error-summary', {
    timeout: 300_000,
  });

  // Assert discovery succeeded
  await expect(page.locator('.progress-complete-message')).toBeVisible();
  await expect(page.locator('.progress-complete-message')).toContainText('mapped successfully');

  // Close the progress panel
  await page.click('.progress-panel-footer button:has-text("Close")');
  await page.waitForTimeout(1000);

  // Verify portal card now shows "Mapped" badge
  await expect(page.locator('.portal-card').first()).toContainText('Mapped');

  // --- Step 4: Run extraction ---
  const extractButton = page.locator('.portal-card button:has-text("Extract")').first();
  await extractButton.waitFor({ state: 'visible', timeout: 10_000 });
  // Extract button should now be enabled (discoveredAt was set)
  await expect(extractButton).toBeEnabled();
  await extractButton.click();

  await page.waitForSelector('.progress-panel', { timeout: 30_000 });

  // Wait for extraction to finish
  await page.waitForSelector('.progress-complete-message, .error-summary', {
    timeout: 600_000,
  });

  // Assert extraction succeeded
  await expect(page.locator('.progress-complete-message')).toBeVisible();
  await expect(page.locator('.progress-complete-message')).toContainText('extracted successfully');

  // Close and verify the portal card shows extraction date
  await page.click('.progress-panel-footer button:has-text("Close")');
  await page.waitForTimeout(1000);
  await expect(page.locator('.portal-card').first()).toContainText('Last extracted');
});
