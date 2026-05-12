import { test, expect, completeWelcome } from './fixtures';

test('portal list shows get started card when empty', async ({ page }) => {
  await completeWelcome(page);

  // h1 heading should be present
  await expect(page.locator('h1')).toContainText('Your portals');

  // The empty state is a clickable button with the get-started card
  await expect(page.locator('text=Add your first health portal')).toBeVisible();
});

test('add a portal', async ({ page }) => {
  await completeWelcome(page);

  // Click the "+ Add portal" button in the portal list header
  await page.click('.portal-list-header button:has-text("Add portal")');

  // Should now be on the Add Portal form
  await page.waitForSelector('h1:has-text("Add a portal")');

  // Fill in the portal URL and name
  await page.fill('#portal-url', 'https://mychart.example.com');
  await page.fill('#portal-name', 'Example Health');

  // Submit via the submit button
  await page.click('button[type="submit"]');

  // Should be back on the portal list with the new portal
  await page.waitForSelector('.portal-list-page');
  await expect(page.locator('.portal-card-name')).toContainText('Example Health');
});

test('edit an existing portal', async ({ page }) => {
  await completeWelcome(page);

  // Add a portal first
  await page.click('.portal-list-header button:has-text("Add portal")');
  await page.waitForSelector('#portal-url');
  await page.fill('#portal-url', 'https://mychart.testclinic.org');
  await page.fill('#portal-name', 'Test Clinic');
  await page.click('button[type="submit"]');

  // Back on portal list — click the edit (gear) button
  await page.waitForSelector('.portal-card-name:has-text("Test Clinic")');
  await page.click('[aria-label="Edit portal"]');

  // Should be on Edit Portal form
  await page.waitForSelector('h1:has-text("Edit portal")');

  // Update the name — clear the field first, then type new name
  await page.fill('#portal-name', 'Test Clinic Updated');
  await page.click('button[type="submit"]');

  // Back on portal list — portal should have updated name
  await page.waitForSelector('.portal-list-page');
  await expect(page.locator('.portal-card-name')).toContainText('Test Clinic Updated');
});

test('remove a portal', async ({ page }) => {
  await completeWelcome(page);

  // Add a portal
  await page.click('.portal-list-header button:has-text("Add portal")');
  await page.waitForSelector('#portal-url');
  await page.fill('#portal-url', 'https://mychart.removetest.com');
  await page.fill('#portal-name', 'Remove Me Portal');
  await page.click('button[type="submit"]');

  // Back on portal list — portal should appear
  await page.waitForSelector('.portal-card-name:has-text("Remove Me Portal")');

  // Set up dialog handler to accept the confirmation
  page.on('dialog', (dialog) => dialog.accept());

  // Click the Remove button on the portal card (variant="destructive")
  await page.click('.portal-card button:has-text("Remove")');

  // Portal should be gone; get-started card should appear
  await page.waitForSelector('text=Add your first health portal');
  await expect(page.locator('text=Add your first health portal')).toBeVisible();
});

test('cancel adding a portal returns to list', async ({ page }) => {
  await completeWelcome(page);

  await page.click('.portal-list-header button:has-text("Add portal")');
  await page.waitForSelector('h1:has-text("Add a portal")');

  // Cancel and go back
  await page.click('button:has-text("Cancel")');

  await page.waitForSelector('.portal-list-page');
  await expect(page.locator('h1')).toContainText('Your portals');
});

test('add portal requires URL', async ({ page }) => {
  await completeWelcome(page);

  await page.click('.portal-list-header button:has-text("Add portal")');
  await page.waitForSelector('#portal-url');

  // Submit without filling URL
  await page.click('button[type="submit"]');

  await page.waitForSelector('.form-error');
  await expect(page.locator('.form-error')).toContainText('URL is required');
});
