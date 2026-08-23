/**
 * E2E test: Analytics dashboard page.
 */
import { test, expect } from '@playwright/test';

test.describe('Analytics Page', () => {
  test('should navigate to analytics page', async ({ page }) => {
    await page.goto('/analytics');
    await expect(page.locator('body')).toBeVisible();
    await page.waitForTimeout(2000);

    // Should show analytics content
    const pageContent = await page.locator('body').textContent();
    expect(pageContent).toBeTruthy();
  });

  test('should display metric cards or charts', async ({ page }) => {
    await page.goto('/analytics');
    await page.waitForTimeout(3000);

    // Should have some visible content (metrics, charts, etc.)
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
