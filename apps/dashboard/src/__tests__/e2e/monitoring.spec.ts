/**
 * E2E test: Monitoring page loads and displays queue/worker metrics.
 */
import { test, expect } from '@playwright/test';

test.describe('Monitoring Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monitoring');
  });

  test('should load the monitoring page', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('h1:has-text("Monitoring")')).toBeVisible();
  });

  test('should show system health section', async ({ page }) => {
    await expect(page.locator('text=System Health')).toBeVisible();
    await expect(page.locator('text=Component Checks')).toBeVisible();
  });

  test('should show health check items', async ({ page }) => {
    await expect(page.locator('text=API')).toBeVisible();
    await expect(page.locator('text=PostgreSQL')).toBeVisible();
    await expect(page.locator('text=Redis')).toBeVisible();
    // Check for Queue and Worker in the component checks list
    await expect(page.locator('div[class*="space-y-0"] >> text=Queue').first()).toBeVisible();
    await expect(page.locator('div[class*="space-y-0"] >> text=Worker').first()).toBeVisible();
  });

  test('should show queue metrics section', async ({ page }) => {
    await expect(page.locator('text=Queue: notifications')).toBeVisible();
    await expect(page.locator('text=Waiting').first()).toBeVisible();
    await expect(page.locator('text=Active').first()).toBeVisible();
    await expect(page.locator('text=Completed').first()).toBeVisible();
    await expect(page.locator('text=Failed').first()).toBeVisible();
    await expect(page.locator('text=Delayed')).toBeVisible();
  });

  test('should show worker metrics section', async ({ page }) => {
    await expect(page.locator('h3:has-text("Workers")')).toBeVisible();
    await expect(page.locator('text=notification-worker')).toBeVisible();
    await expect(page.locator('text=Concurrency')).toBeVisible();
    await expect(page.locator('dt:has-text("Running")')).toBeVisible();
    await expect(page.locator('text=Processed Total')).toBeVisible();
    await expect(page.locator('dt:has-text("Failed Total")')).toBeVisible();
  });

  test('should have monitoring in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a:has-text("Monitoring")')).toBeVisible();
    await page.click('nav a:has-text("Monitoring")');
    await expect(page).toHaveURL(/\/monitoring/);
    await expect(page.locator('h1:has-text("Monitoring")')).toBeVisible();
  });
});