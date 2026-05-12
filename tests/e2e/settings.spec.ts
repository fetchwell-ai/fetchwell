import { test, expect, completeWelcome } from './fixtures';

test('can navigate to Appearance settings via sidebar', async ({ page }) => {
  await completeWelcome(page);

  // Click "Appearance" in the sidebar settings section
  await page.click('text=Appearance');

  // The Appearance settings page should be visible
  await page.waitForSelector('h1:has-text("Appearance")');
  await expect(page.locator('h1')).toContainText('Appearance');
});

test('can navigate back to portal list from settings by clicking a portal section item', async ({ page }) => {
  await completeWelcome(page);

  // Navigate to Appearance settings
  await page.click('text=Appearance');
  await page.waitForSelector('h1:has-text("Appearance")');

  // Click the "Portals" label area in the sidebar (or "Add portal") to go back to portal list
  await page.click('text=Add portal');

  // Should be back on the portal list
  await page.waitForSelector('.portal-list-page');
  await expect(page.locator('h1')).toContainText('Your portals');
});

test('API key settings shows bundled key option by default', async ({ page }) => {
  await completeWelcome(page);

  // Navigate to the API key settings sub-page
  await page.click('text=Anthropic API key');
  await page.waitForSelector('h1:has-text("Anthropic API key")');

  // The bundled key source should be selected by default
  // The bundled confirmation text is shown when apiKeySource = 'bundled'
  await expect(page.locator('text=no setup required')).toBeVisible();
});

test('can switch to custom API key source and enter a key', async ({ page }) => {
  await completeWelcome(page);

  // Navigate to the API key settings sub-page
  await page.click('text=Anthropic API key');
  await page.waitForSelector('h1:has-text("Anthropic API key")');

  // Switch to "Your own key" source
  await page.click("text=Your own key");

  // Wait for the custom key section to appear. Two cases:
  // (a) no custom key configured yet — the input is shown directly
  // (b) apiKeyConfigured is true (stale from bundled state) — shows "Change" button
  // Either way we need to get to the input. Check which state we're in.
  const changeButton = page.locator('button:has-text("Change")');
  const apiKeyInput = page.locator('#settings-api-key');

  // Wait for either the input or the change button to appear
  await Promise.race([
    apiKeyInput.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {}),
    changeButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {}),
  ]);

  // If the "Change" button is shown (key appears already configured), click it to edit
  if (await changeButton.isVisible()) {
    await changeButton.click();
    await page.waitForSelector('#settings-api-key');
  }

  await page.fill('#settings-api-key', 'sk-ant-new-test-key-9876543210123456');

  // Click Save
  await page.click('button:has-text("Save")');

  // After save, should show the configured indicator
  await page.waitForSelector('text=API key configured');
  await expect(page.locator('text=API key configured')).toBeVisible();
});

test('browser settings: toggle show browser window checkbox', async ({ page }) => {
  await completeWelcome(page);

  // Navigate to the Browser settings sub-page
  await page.click('text=Browser');
  await page.waitForSelector('#show-browser-toggle');

  // Verify the checkbox exists and is interactive
  const checkbox = page.locator('#show-browser-toggle');
  const initialChecked = await checkbox.isChecked();

  // Toggle it to opposite state
  if (initialChecked) {
    await page.uncheck('#show-browser-toggle');
    await expect(checkbox).not.toBeChecked();
  } else {
    await page.check('#show-browser-toggle');
    await expect(checkbox).toBeChecked();
  }

  // Toggle back to the original state
  if (initialChecked) {
    await page.check('#show-browser-toggle');
    await expect(checkbox).toBeChecked();
  } else {
    await page.uncheck('#show-browser-toggle');
    await expect(checkbox).not.toBeChecked();
  }
});

test('can navigate between settings sub-pages', async ({ page }) => {
  await completeWelcome(page);

  // Navigate through several settings sub-pages
  await page.click('text=Appearance');
  await page.waitForSelector('h1:has-text("Appearance")');

  await page.click('text=Browser');
  await page.waitForSelector('h1:has-text("Browser")');

  await page.click('text=Storage location');
  await page.waitForSelector('h1:has-text("Storage location")');

  await page.click('text=Privacy & data');
  await page.waitForSelector('h1:has-text("Privacy & data")');

  await page.click('text=About Fetchwell');
  await page.waitForSelector('h1:has-text("About Fetchwell")');
});
