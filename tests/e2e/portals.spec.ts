import { test, expect, completeWelcome } from './fixtures';

test('portal list is empty after completing wizard', async ({ page }) => {
  await completeWelcome(page);

  await expect(page.locator('h1')).toContainText('Your Portals');
  // Empty state message shown when no portals exist
  await expect(page.locator('.portal-empty-state')).toBeVisible();
});

test('add a portal', async ({ page }) => {
  await completeWelcome(page);

  // Click Add Portal button in header
  await page.click('.portal-list-header >> text=+ Add Portal');

  // Should now be on the Add Portal form
  await page.waitForSelector('h1:has-text("Add Portal")');

  // Fill in the portal URL and name
  await page.fill('#portal-url', 'https://mychart.example.com');
  await page.fill('#portal-name', 'Example Health');

  // Submit via the submit button (not the h1)
  await page.click('button[type="submit"]');

  // Should be back on the portal list with the new portal
  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('.portal-card-name')).toContainText('Example Health');
});

test('edit an existing portal', async ({ page }) => {
  await completeWelcome(page);

  // Add a portal first
  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('#portal-url');
  await page.fill('#portal-url', 'https://mychart.testclinic.org');
  await page.fill('#portal-name', 'Test Clinic');
  await page.click('button[type="submit"]');

  // Back on portal list — click the edit (gear) button
  await page.waitForSelector('.portal-card-name:has-text("Test Clinic")');
  await page.click('[aria-label="Edit portal"]');

  // Should be on Edit Portal form
  await page.waitForSelector('h1:has-text("Edit Portal")');

  // Update the name
  await page.fill('#portal-name', 'Test Clinic Updated');
  await page.click('button[type="submit"]');

  // Back on portal list — portal should have updated name
  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('.portal-card-name')).toContainText('Test Clinic Updated');
});

test('remove a portal', async ({ page }) => {
  await completeWelcome(page);

  // Add a portal
  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('#portal-url');
  await page.fill('#portal-url', 'https://mychart.removetest.com');
  await page.fill('#portal-name', 'Remove Me Portal');
  await page.click('button[type="submit"]');

  // Back on portal list — portal should appear
  await page.waitForSelector('.portal-card-name:has-text("Remove Me Portal")');

  // Set up dialog handler to accept the confirmation
  page.on('dialog', (dialog) => dialog.accept());

  // Click remove button
  await page.click('.btn-danger:has-text("Remove")');

  // Portal should be gone; empty state should appear
  await page.waitForSelector('.portal-empty-state');
  await expect(page.locator('.portal-empty-state')).toBeVisible();
});

test('cancel adding a portal returns to list', async ({ page }) => {
  await completeWelcome(page);

  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('h1:has-text("Add Portal")');

  // Cancel and go back
  await page.click('text=Cancel');

  await page.waitForSelector('h1:has-text("Your Portals")');
  await expect(page.locator('h1')).toContainText('Your Portals');
});

test('add portal requires URL', async ({ page }) => {
  await completeWelcome(page);

  await page.click('.portal-list-header >> text=+ Add Portal');
  await page.waitForSelector('#portal-url');

  // Submit without filling URL — click the submit button specifically
  await page.click('button[type="submit"]');

  await page.waitForSelector('.form-error');
  await expect(page.locator('.form-error')).toContainText('URL is required');
});
