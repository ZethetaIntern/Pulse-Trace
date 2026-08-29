import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const VIEWPORTS = [390, 768, 1024, 1440];
const ROUTES = ['/', '/notifications', '/analytics', '/monitoring'];

test.describe('Phase 13.8 dark-theme verification', () => {
  for (const width of VIEWPORTS) {
    for (const route of ROUTES) {
      test(`no overflow / clean console+network at ${width}px on ${route}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const consoleErrors: string[] = [];
        const badRequests: string[] = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });
        page.on('requestfailed', (req) => badRequests.push(`failed: ${req.url()}`));
        page.on('response', (res) => {
          if (res.status() >= 400) badRequests.push(`${res.status()}: ${res.url()}`);
        });

        await page.goto(route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `horizontal overflow at ${width}px on ${route}`).toBeLessThanOrEqual(0);
        expect(consoleErrors, `console errors at ${width}px on ${route}`).toEqual([]);
        expect(badRequests, `bad requests at ${width}px on ${route}`).toEqual([]);
      });
    }
  }

  test('document + chrome surfaces are near-black, no white surfaces anywhere', async ({ page }) => {
    for (const route of ROUTES) {
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);

      const rootBg = await page.evaluate(() => {
        const b = getComputedStyle(document.body).backgroundColor;
        const c = getComputedStyle(document.documentElement).backgroundColor;
        return { body: b, root: c };
      });
      // Near-black app background (#090909)
      expect(rootBg.body).toBe('rgb(9, 9, 9)');

      const bright = await page.evaluate(() => {
        const offenders: string[] = [];
        const els = Array.from(document.querySelectorAll<HTMLElement>('*'));
        for (const el of els) {
          const bg = getComputedStyle(el).backgroundColor;
          if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) continue;
          const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!m) continue;
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          if (r > 230 && g > 230 && b > 230) {
            offenders.push(`${el.tagName.toLowerCase()}#${el.id}.${String(el.className).slice(0, 60)} -> ${bg}`);
          }
        }
        return offenders.slice(0, 12);
      });
      expect(bright, `bright/white surfaces found on ${route}`).toEqual([]);
    }
  });

  test('notification detail page has no overflow, console/network errors, or white surfaces', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 900 });
    const consoleErrors: string[] = [];
    const badRequests: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400) badRequests.push(`${res.status()}: ${res.url()}`);
    });

    await page.goto('/notifications', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const link = page.locator('a[href*="/notifications/"]').first();
    if (await link.isVisible()) {
      await link.click();
      await page.waitForTimeout(2000);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, 'detail page horizontal overflow').toBeLessThanOrEqual(0);

      const bright = await page.evaluate(() => {
        const offenders: string[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
          const bg = getComputedStyle(el).backgroundColor;
          if (!bg || bg === 'transparent' || bg.startsWith('rgba(0, 0, 0, 0)')) continue;
          const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
          if (!m) continue;
          const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
          if (r > 230 && g > 230 && b > 230) offenders.push(`${el.tagName}#${el.id}.${String(el.className).slice(0, 60)} -> ${bg}`);
        }
        return offenders.slice(0, 12);
      });
      expect(bright, 'detail page white surfaces').toEqual([]);
    }
    expect(consoleErrors).toEqual([]);
    expect(badRequests).toEqual([]);
  });

  test('captures full-page screenshots of all five pages', async ({ page }) => {
    const shots = 'phase-13-8-screenshots';
    mkdirSync(shots, { recursive: true });

    for (const [name, route] of [
      ['01-overview', '/'],
      ['02-notifications', '/notifications'],
      ['03-analytics', '/analytics'],
      ['04-monitoring', '/monitoring'],
    ] as const) {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
    }

    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/notifications', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    const detail = page.locator('a[href*="/notifications/"]').first();
    if (await detail.isVisible()) {
      await detail.click();
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${shots}/05-notification-detail.png`, fullPage: true });
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${shots}/06-overview-mobile.png`, fullPage: true });
  });
});
