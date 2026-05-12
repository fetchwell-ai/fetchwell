import { test, expect } from './fixtures';

test('app launches and shows the portal list directly', async ({ page }) => {
  // v2: there is no welcome wizard. The app shows the portal list on first launch.
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });
  await expect(page.locator('h1')).toContainText('Your portals');
});

test('first launch shows get started card when no portals configured', async ({ page }) => {
  // On first launch with no portals, the empty state get-started card is visible.
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });
  await expect(page.locator('text=Add your first health portal')).toBeVisible();
  await expect(page.locator('text=Get started')).toBeVisible();
});

test('get started card opens add portal form when clicked', async ({ page }) => {
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });

  // Click the get started card (it's a button that opens the add form)
  await page.click('text=Add your first health portal');

  // Should navigate to the add portal form
  await page.waitForSelector('h1:has-text("Add a portal")');
  await expect(page.locator('h1')).toContainText('Add a portal');
});

test('header add portal button opens add portal form', async ({ page }) => {
  await page.waitForSelector('.portal-list-page', { timeout: 15_000 });

  // Click the "+ Add portal" button in the portal list header
  await page.click('.portal-list-header button:has-text("Add portal")');

  // Should show the add portal form
  await page.waitForSelector('h1:has-text("Add a portal")');
  await expect(page.locator('h1')).toContainText('Add a portal');
});
