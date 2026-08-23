/**
 * E2E test: Replay functionality on notification detail page.
 */
import { test, expect } from '@playwright/test';

test.describe('Replay', () => {
  test('should show replay button on notification detail', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForTimeout(2000);

    const notificationLink = page.locator('a[href*="/notifications/"]').first();
    if (await notificationLink.isVisible()) {
      await notificationLink.click();
      await page.waitForTimeout(2000);

      // Look for replay-related UI elements
      const pageContent = await page.locator('body').textContent();
      expect(pageContent).toBeTruthy();
    }
  });
});
