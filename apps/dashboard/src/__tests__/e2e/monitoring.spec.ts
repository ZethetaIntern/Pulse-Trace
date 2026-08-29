/**
 * E2E test: Monitoring page loads and displays system health, queue and worker metrics.
 */
import { test, expect } from '@playwright/test';

test.describe('Monitoring Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/monitoring');
  });

  test('should load the monitoring page', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Monitoring' })).toBeVisible();
  });

  test('should show the overall health banner', async ({ page }) => {
    await expect(page.getByText('All systems operational')).toBeVisible();
  });

  test('should show system health components', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'System Components' })).toBeVisible();
    await expect(page.getByText('API', { exact: true })).toBeVisible();
    await expect(page.getByText('PostgreSQL', { exact: true })).toBeVisible();
    await expect(page.getByText('Redis', { exact: true })).toBeVisible();
    await expect(page.getByText('Queue', { exact: true })).toBeVisible();
    await expect(page.getByText('Worker', { exact: true })).toBeVisible();
  });

  test('should show queue metrics section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Queue operations' })).toBeVisible();
    await expect(page.getByText('Queue: notifications')).toBeVisible();
    await expect(page.getByText('Waiting').first()).toBeVisible();
    await expect(page.getByText('Active').first()).toBeVisible();
    await expect(page.getByText('Completed').first()).toBeVisible();
    await expect(page.getByText('Failed').first()).toBeVisible();
    await expect(page.getByText('Delayed', { exact: true })).toBeVisible();
  });

  test('should show worker section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Workers' })).toBeVisible();
    await expect(page.getByText('notification-worker')).toBeVisible();
    await expect(page.getByText('Concurrency')).toBeVisible();
    await expect(page.getByText('Uptime', { exact: false }).first()).toBeVisible();
  });

  test('should have monitoring in sidebar navigation', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav a:has-text("Monitoring")')).toBeVisible();
    await page.click('nav a:has-text("Monitoring")');
    await expect(page).toHaveURL(/\/monitoring/);
    await expect(page.getByRole('heading', { level: 1, name: 'Monitoring' })).toBeVisible();
  });
});