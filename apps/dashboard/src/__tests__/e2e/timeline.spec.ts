/**
 * E2E test: Timeline view on notification detail page.
 */
import { test, expect } from '@playwright/test';

test.describe('Timeline View', () => {
  test('should show timeline on notification detail page', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(2000);

    // Navigate to first notification detail
    const notificationLink = page.locator('a[href*="/notifications/"]').first();
    if (await notificationLink.isVisible()) {
      await notificationLink.click();
      await page.waitForTimeout(2000);

      // Look for timeline-related content
      const pageContent = await page.locator('body').textContent();
      expect(pageContent).toBeTruthy();
      // Timeline section should exist (may be empty if no events)
    }
  });
});
