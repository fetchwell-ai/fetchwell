import { test, expect } from './fixtures';

test('app launches and shows welcome wizard', async ({ page }) => {
  // The welcome wizard should be shown on first launch (no API key configured).
  await page.waitForSelector('h2:has-text("Welcome")');
  await expect(page.locator('h2')).toContainText('Welcome');
});

test('complete welcome wizard end-to-end', async ({ page }) => {
  // Step 1: Overview screen
  await page.waitForSelector('h2:has-text("Welcome")');
  await expect(page.locator('h2')).toContainText('Welcome');
  await page.click('text=Get Started');

  // Step 2: API key
  await page.waitForSelector('#api-key');
  await expect(page.locator('h2')).toContainText('Anthropic API Key');
  await page.fill('#api-key', 'sk-ant-test-key-12345678901234567890');
  await page.click('text=Continue');

  // Step 3: Download folder
  await page.waitForSelector('h2:has-text("Download Folder")');
  await expect(page.locator('h2')).toContainText('Download Folder');

  // Skip folder picker (dialog not drivable by Playwright) and finish
  await page.click('text=Finish Setup');

  // Should now be on the portal list
  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('h1')).toContainText('Your Portals');
});

test('shows validation error for invalid API key format', async ({ page }) => {
  await page.waitForSelector('text=Get Started');
  await page.click('text=Get Started');

  await page.waitForSelector('#api-key');
  await page.fill('#api-key', 'invalid-key-format');
  await page.click('text=Continue');

  // Error message should appear
  await page.waitForSelector('.form-error');
  await expect(page.locator('.form-error')).toContainText('sk-ant-');
});

test('shows validation error when API key is empty', async ({ page }) => {
  await page.waitForSelector('text=Get Started');
  await page.click('text=Get Started');

  await page.waitForSelector('#api-key');
  // Submit without filling in the key
  await page.click('text=Continue');

  await page.waitForSelector('.form-error');
  await expect(page.locator('.form-error')).toContainText('required');
});
