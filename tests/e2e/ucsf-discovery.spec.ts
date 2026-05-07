/**
 * Real E2E test: UCSF MyChart discovery through the Electron app.
 *
 * Requires: ANTHROPIC_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD in env,
 * and providers.json with UCSF credentials.
 *
 * This test exercises the full chain:
 *   Electron UI → IPC → pipeline bridge → fork subprocess →
 *   Stagehand browser → portal login → email 2FA (auto Gmail) →
 *   discovery → nav-map saved → success event back to UI
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_KEY = process.env.ANTHROPIC_API_KEY;
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

// Load UCSF config from providers.json
function loadUcsfConfig(): { url: string; username: string; password: string } | null {
  try {
    const providersPath = path.join(__dirname, '../../providers.json');
    const data = JSON.parse(fs.readFileSync(providersPath, 'utf-8'));
    const ucsf = data.providers.find((p: { id: string }) => p.id === 'ucsf');
    if (!ucsf?.username || !ucsf?.password) return null;
    return { url: ucsf.url, username: ucsf.username, password: ucsf.password };
  } catch {
    return null;
  }
}

const ucsfConfig = loadUcsfConfig();

test.skip(
  !API_KEY || !GMAIL_USER || !GMAIL_APP_PASSWORD || !ucsfConfig,
  'Skipping UCSF E2E — requires ANTHROPIC_API_KEY, GMAIL_USER, GMAIL_APP_PASSWORD, and UCSF credentials in providers.json',
);

async function completeWelcomeWithRealKey(page: Page): Promise<void> {
  await page.waitForSelector('text=Get Started');
  await page.click('text=Get Started');
  await page.waitForSelector('#api-key');
  await page.fill('#api-key', API_KEY!);
  await page.click('text=Continue');
  await page.waitForSelector('text=Finish Setup');
  await page.click('text=Finish Setup');
  await page.waitForSelector('h1:has-text("Your Portals")');
}

test('UCSF MyChart full discovery with email 2FA', async ({ page }) => {
  // This test runs a real portal discovery — needs generous timeout
  test.setTimeout(300_000); // 5 minutes

  // Step 1: Complete welcome wizard
  await completeWelcomeWithRealKey(page);

  // Step 2: Add UCSF portal with real credentials
  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('h1:has-text("Add Portal")');

  await page.fill('#portal-url', ucsfConfig!.url);
  await page.fill('#portal-name', 'UCSF MyChart');
  await page.fill('#portal-username', ucsfConfig!.username);
  await page.fill('#portal-password', ucsfConfig!.password);

  // Set login type to two-step and 2FA to email
  await page.selectOption('#portal-login-type', 'two-step');
  await page.selectOption('#portal-2fa', 'email');

  await page.click('button[type="submit"]');

  // Step 3: Back on portal list — verify portal added
  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('.portal-card-name').first()).toContainText('UCSF MyChart');

  // Step 4: Click Map to start discovery
  const mapButton = page.locator('.portal-card button:has-text("Map")').first();
  await mapButton.click();

  // Step 5: ProgressPanel should appear
  await page.waitForSelector('.progress-panel', { timeout: 30_000 });

  // Step 6: Wait for log lines — proves subprocess started
  await page.waitForSelector('.progress-log-line:not(.progress-log-waiting)', {
    timeout: 60_000,
  });

  // Step 7: Watch for key progress milestones
  // The pipeline logs "Step 1: Creating browser session..." then login, then 2FA, then discovery
  // We'll wait for the terminal state (complete or error) with a long timeout
  await page.waitForSelector('.progress-panel-footer .btn-primary', {
    timeout: 240_000, // 4 minutes — login + 2FA + discovery
  });

  // Step 8: Check outcome
  const outcome = await page.evaluate(() => {
    const hasError = document.querySelector('.error-summary') !== null;
    const hasComplete = document.querySelector('.progress-complete-message') !== null;
    return { hasError, hasComplete };
  });

  // Log the final state for debugging
  const logLines = await page.locator('.progress-log-line').allTextContents();
  console.log(`\n=== Discovery finished: ${logLines.length} log lines ===`);
  console.log(`Last 5 lines:`);
  for (const line of logLines.slice(-5)) {
    console.log(`  ${line}`);
  }
  console.log(`Outcome: complete=${outcome.hasComplete}, error=${outcome.hasError}`);

  if (outcome.hasError) {
    const errorText = await page.locator('.error-summary').textContent();
    console.log(`Error: ${errorText}`);
  }

  // We expect success (discovery complete)
  expect(outcome.hasComplete).toBe(true);

  // Close the panel
  await page.click('.progress-panel-footer .btn-primary');
  await page.waitForSelector('h1:has-text("Your Portals")');
});
