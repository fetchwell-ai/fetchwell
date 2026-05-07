import { test, expect, completeWelcome } from './fixtures';
import type { Page } from '@playwright/test';

const API_KEY = process.env.ANTHROPIC_API_KEY;

test.skip(!API_KEY, 'ANTHROPIC_API_KEY not set — skipping integration test');

/**
 * Complete the welcome wizard using the real ANTHROPIC_API_KEY from the
 * environment. This overrides the dummy key used by completeWelcome().
 */
async function completeWelcomeWithRealKey(page: Page, apiKey: string): Promise<void> {
  // Step 1: Overview — click Get Started
  await page.waitForSelector('text=Get Started');
  await page.click('text=Get Started');

  // Step 2: API Key — enter the real key
  await page.waitForSelector('#api-key');
  await page.fill('#api-key', apiKey);
  await page.click('text=Continue');

  // Step 3: Download Folder — finish without choosing a folder
  await page.waitForSelector('text=Finish Setup');
  await page.click('text=Finish Setup');

  // Wait until portal list is visible
  await page.waitForSelector('h1:has-text("Your Portals")');
}

test('full-chain integration: subprocess spawns, progress events flow to renderer', async ({ page }) => {
  // This test needs more time since it spawns a subprocess that launches a browser
  test.setTimeout(120_000);

  // Complete the wizard with the real API key
  await completeWelcomeWithRealKey(page, API_KEY!);

  // Add a portal with a real URL and dummy credentials
  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('h1:has-text("Add Portal")');

  await page.fill('#portal-url', 'https://mychart.ucsfhealth.org');
  // Name is auto-populated from URL; verify or set explicitly
  await page.waitForSelector('#portal-name');
  const nameValue = await page.inputValue('#portal-name');
  if (!nameValue.trim()) {
    await page.fill('#portal-name', 'UCSF Health');
  }

  // Fill in dummy credentials
  await page.fill('#portal-username', 'test@example.com');
  await page.fill('#portal-password', 'testpass123');

  // Submit the portal form
  await page.click('button[type="submit"]');

  // Should be back on the portal list with the new portal card
  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('.portal-card-name').first()).toBeVisible();

  // Click the "Map" button on the portal card to start discovery.
  // Use a precise selector targeting the enabled Map button (not "Extract" which may be disabled).
  const mapButton = page.locator('.portal-card button:has-text("Map")').first();
  await mapButton.waitFor({ state: 'visible' });
  await mapButton.click();

  // ProgressPanel should appear shortly after click (setRunningOperation triggers re-render)
  await page.waitForSelector('.progress-panel', { timeout: 30_000 });

  // Wait for at least one log line — proves subprocess started and IPC events flow
  await page.waitForSelector('.progress-log-line:not(.progress-log-waiting)', {
    timeout: 60_000,
  });

  const logLines = await page.locator('.progress-log-line').allTextContents();
  expect(logLines.length).toBeGreaterThan(0);

  // Wait for the operation to finish (either complete or error state)
  // The pipeline will fail at login with wrong credentials — that's expected.
  await page.waitForSelector('.progress-panel-footer .btn-primary', {
    timeout: 120_000,
  });

  // Verify the error state is shown (expected outcome: wrong credentials)
  // Either error-summary or completion message should be visible
  const panelState = await page.evaluate(() => {
    const hasError = document.querySelector('.error-summary') !== null;
    const hasComplete = document.querySelector('.progress-complete-message') !== null;
    return { hasError, hasComplete };
  });

  // At minimum, the panel reached a terminal state (not still "running" indefinitely)
  expect(panelState.hasError || panelState.hasComplete).toBe(true);

  // If there was an error (expected: wrong credentials), verify ErrorSummary is visible
  if (panelState.hasError) {
    await expect(page.locator('.error-summary')).toBeVisible();
  }

  // Close the progress panel
  await page.click('.progress-panel-footer .btn-primary');

  // Should be back on the portal list
  await page.waitForSelector('h1:has-text("Your Portals")');
});
