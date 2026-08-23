import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for PulseTrace dashboard.
 *
 * Starts the API server and dashboard dev server via webServer,
 * then runs browser tests against them.
 */
export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: false, // Sequential to avoid resource contention
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      port: 4000,
      reuseExistingServer: true,
      cwd: '../../',
      timeout: 30000,
      env: {
        DATABASE_URL: 'postgresql://pulsetrace:pulsetrace@localhost:5432/pulsetrace',
        REDIS_URL: 'redis://localhost:6379',
        NODE_ENV: 'development',
        LOG_LEVEL: 'silent',
      },
    },
    {
      command: 'npm run dev',
      port: 5173,
      reuseExistingServer: true,
      cwd: '../dashboard',
      timeout: 30000,
    },
  ],
});
