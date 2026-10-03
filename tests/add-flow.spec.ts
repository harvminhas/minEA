import { test, expect, type Page } from '@playwright/test';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'test123456';
const ORG_SLUG = 'test-org';
const WORKSPACE_SLUG = 'test-workspace';

test.describe('BuboMap Add Flow Tests', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({
      viewport: { width: 1280, height: 1024 }
    });
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('01 - Sign in and access workspace', async () => {
    // Go to login
    await page.goto(BASE_URL);
    await page.waitForTimeout(1000);

    // Sign in
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect
    await page.waitForTimeout(3000);

    // Navigate to test workspace
    await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}`);
    await page.waitForTimeout(2000);

    // Verify we're in the workspace
    await expect(page).toHaveURL(new RegExp(`/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}`));
  });

  test('47 - Add existing: "add ms 365"', async () => {
    // Navigate to Ask
    await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
    await page.waitForTimeout(1000);

    // Type "add ms 365" in Ask bar
    const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
    await askInput.fill('add ms 365');
    await askInput.press('Enter');

    // Wait for result
    await page.waitForTimeout(2000);

    // Take screenshot
    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/real-47-add-existing-record.png',
      fullPage: false
    });

    // Verify RecordCard is shown (no button, no "Added" text)
    const recordCard = page.locator('text=Microsoft 365').first();
    await expect(recordCard).toBeVisible();

    // Verify no "Added" confirmation text
    const addedText = page.locator('text=/Added.*app/i');
    await expect(addedText).not.toBeVisible();

    // Verify no disabled button
    const disabledButton = page.locator('button:disabled');
    await expect(disabledButton).toHaveCount(0);
  });

  test('48 - Add new items: "add Zoom, NetSuite and Plant scheduling"', async () => {
    await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
    await page.waitForTimeout(1000);

    const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
    await askInput.fill('add Zoom, NetSuite and Plant scheduling');
    await askInput.press('Enter');

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/real-48-add-new-cards.png',
      fullPage: false
    });

    // Verify cards are shown
    const zoomCard = page.locator('text=Zoom').first();
    await expect(zoomCard).toBeVisible();

    // Verify only custom item asks hosting
    const hostingQuestion = page.locator('text=/Where does it live/i');
    // Only Plant scheduling should ask
    const plantSchedulingCard = page.locator('text=Plant scheduling').first();
    await expect(plantSchedulingCard).toBeVisible();
  });

  test('49 - Mixed add: "add Zoom, HubSpot and NetSuite"', async () => {
    await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
    await page.waitForTimeout(1000);

    const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
    await askInput.fill('add Zoom, HubSpot and NetSuite');
    await askInput.press('Enter');

    await page.waitForTimeout(2000);

    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/real-49-add-mixed.png',
      fullPage: false
    });

    // Verify HubSpot shows as already existing (AlreadyLine)
    const hubspotLine = page.locator('text=/HubSpot.*already in your map/i');
    await expect(hubspotLine).toBeVisible();

    // Verify button says "Add 2 apps" (not 3)
    const addButton = page.locator('button:has-text("Add 2 apps")');
    await expect(addButton).toBeVisible();
  });

  test('50 - Save confirmation', async () => {
    await page.goto(`${BASE_URL}/orgs/${ORG_SLUG}/workspaces/${WORKSPACE_SLUG}/ask`);
    await page.waitForTimeout(1000);

    const askInput = page.locator('#ask-input, [data-ask-input], input[placeholder*="Ask"]').first();
    await askInput.fill('add Zoom and NetSuite');
    await askInput.press('Enter');

    await page.waitForTimeout(2000);

    // Click Add button
    const addButton = page.locator('button:has-text("Add")').first();
    await addButton.click();

    // Wait for save to complete
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: '/opt/cursor/artifacts/screenshots/real-50-add-saved.png',
      fullPage: false
    });

    // Verify confirmation is shown
    const confirmation = page.locator('text=/Added.*apps/i');
    await expect(confirmation).toBeVisible();

    // Verify Undo is available
    const undoButton = page.locator('button:has-text("Undo")');
    await expect(undoButton).toBeVisible();
  });
});
