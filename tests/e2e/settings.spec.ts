import { test, expect, completeWelcome } from './fixtures';

test('can navigate to settings and back', async ({ page }) => {
  await completeWelcome(page);

  // Navigate to Settings
  await page.click('text=Settings');

  await page.waitForSelector('h1:has-text("Settings")');
  await expect(page.locator('h1')).toContainText('Settings');

  // Go back
  await page.click('text=← Back');

  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('h1')).toContainText('Your Portals');
});

test('settings shows API key as configured after wizard', async ({ page }) => {
  await completeWelcome(page);

  await page.click('text=Settings');
  await page.waitForSelector('h1:has-text("Settings")');

  // API key configured indicator should be visible
  await expect(page.locator('text=API key configured')).toBeVisible();
});

test('toggle show browser warning visibility', async ({ page }) => {
  await completeWelcome(page);
  await page.click('text=Settings');
  await page.waitForSelector('#show-browser');

  // Warning should be hidden when checkbox is unchecked (default)
  const warningSel = '.settings-warning';
  const warningVisible = await page.isVisible(warningSel);

  if (!warningVisible) {
    // Check the box — warning should appear
    await page.check('#show-browser');
    await page.waitForSelector(warningSel);
    await expect(page.locator(warningSel)).toBeVisible();

    // Uncheck — warning should disappear
    await page.uncheck('#show-browser');
    await expect(page.locator(warningSel)).toBeHidden();
  } else {
    // If already checked, uncheck first
    await page.uncheck('#show-browser');
    await expect(page.locator(warningSel)).toBeHidden();

    // Re-check
    await page.check('#show-browser');
    await expect(page.locator(warningSel)).toBeVisible();
  }
});

test('settings persist: incremental extraction toggle is saved', async ({ app, page }) => {
  await completeWelcome(page);
  await page.click('text=Settings');
  await page.waitForSelector('#incremental-extraction');

  // Get current state
  const initialChecked = await page.isChecked('#incremental-extraction');

  // Toggle it
  if (initialChecked) {
    await page.uncheck('#incremental-extraction');
  } else {
    await page.check('#incremental-extraction');
  }

  // Wait for "Saved" feedback
  await page.waitForSelector('.settings-saved');

  // Go back to portal list, then return to settings
  await page.click('text=← Back');
  await page.waitForSelector('h1:has-text("Your Portals")');

  await page.click('text=Settings');
  await page.waitForSelector('#incremental-extraction');

  // The toggle state should be the opposite of the initial state (i.e. persisted)
  const newChecked = await page.isChecked('#incremental-extraction');
  expect(newChecked).toBe(!initialChecked);
});

test('can update API key from settings', async ({ page }) => {
  await completeWelcome(page);
  await page.click('text=Settings');
  await page.waitForSelector('h1:has-text("Settings")');

  // Click Change button to start editing
  await page.click('text=Change');

  // Input should appear
  await page.waitForSelector('#settings-api-key');
  await page.fill('#settings-api-key', 'sk-ant-new-test-key-9876543210123456');
  await page.click('text=Save');

  // Should show saved feedback
  await page.waitForSelector('.settings-saved');
  await expect(page.locator('.settings-saved')).toBeVisible();
});
