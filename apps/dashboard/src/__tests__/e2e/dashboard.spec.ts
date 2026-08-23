/**
 * E2E test: Dashboard overview page loads correctly.
 */
import { test, expect } from '@playwright/test';

test.describe('Dashboard Overview', () => {
  test('should load the overview page', async ({ page }) => {
    await page.goto('/');
    // The page should render without errors
    await expect(page.locator('body')).toBeVisible();
    // Should contain PulseTrace branding or navigation
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('should show navigation sidebar', async ({ page }) => {
    await page.goto('/');
    // Look for sidebar navigation links
    const sidebar = page.locator('nav, [class*="sidebar"], [class*="Sidebar"]');
    await expect(sidebar.first()).toBeVisible();
  });
});
