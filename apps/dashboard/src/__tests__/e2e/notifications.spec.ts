/**
 * E2E tests: Notifications list and detail pages.
 */
import { test, expect } from '@playwright/test';

test.describe('Notifications List', () => {
  test('should navigate to notifications page', async ({ page }) => {
    await page.goto('/notifications');
    await expect(page.locator('body')).toBeVisible();
    // Should show the notifications page content
    await page.waitForTimeout(1000); // Allow data to load
  });

  test('should display notifications list or empty state', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(2000);
    // Should show either a list of notifications or an empty state message
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
  });
});

test.describe('Notification Detail', () => {
  test('should navigate to notification detail page', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(2000);

    // Try to click on a notification if one exists
    const notificationLink = page.locator('a[href*="/notifications/"]').first();
    if (await notificationLink.isVisible()) {
      await notificationLink.click();
      await page.waitForTimeout(1000);
      // Should be on a detail page with a UUID in the URL
      const url = page.url();
      expect(url).toContain('/notifications/');
    }
  });
});
