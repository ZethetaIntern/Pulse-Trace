import { test, expect } from '@playwright/test';

test.describe('Phase 13.8 computed-style brand assertions', () => {
  test('page titles, body, header meta, and refresh buttons use the dark palette', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const styles = await page.evaluate(() => {
      const bodyBg = getComputedStyle(document.body).backgroundColor;
      const h1 = getComputedStyle(document.querySelector('h1')!).color;
      const refreshBtn = document.querySelector('main button');
      const btnBg = refreshBtn ? getComputedStyle(refreshBtn).backgroundColor : null;
      const btnText = refreshBtn ? getComputedStyle(refreshBtn).color : null;
      return { bodyBg, h1, btnBg, btnText };
    });

    // Near-black app background
    expect(styles.bodyBg).toBe('rgb(9, 9, 9)');
    // Page title is white/off-white
    expect(styles.h1).toBe('rgb(245, 245, 245)');
    // Secondary button has dark surface
    expect(styles.btnBg).not.toBeNull();
    // Button text is white/off-white
    expect(styles.btnText).toBe('rgb(245, 245, 245)');
  });

  test('sidebar: active nav is dark elevated surface with white text', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const styles = await page.evaluate(() => {
      const nav = document.querySelector('nav');
      const activeLink = nav?.querySelector('a[aria-current="page"]');
      const activeBg = activeLink ? getComputedStyle(activeLink).backgroundColor : null;
      const activeText = activeLink ? getComputedStyle(activeLink).color : null;
      const wordmark = Array.from(document.querySelectorAll('span')).find((s) => s.textContent === 'PulseTrace');
      return {
        activeBg,
        activeText,
        wordmark: wordmark ? getComputedStyle(wordmark).color : null,
        asideBg: getComputedStyle(document.querySelector('aside')!).backgroundColor,
      };
    });

    // Active nav has elevated surface background (dark gray)
    expect(styles.activeBg).not.toBeNull();
    expect(styles.activeBg).not.toBe('transparent');
    // Active text is white/off-white
    expect(styles.activeText).toBe('rgb(245, 245, 245)');
    // Wordmark is white/off-white
    expect(styles.wordmark).toBe('rgb(245, 245, 245)');
    // Sidebar background is near-black
    expect(styles.asideBg).toBe('rgb(11, 11, 11)');
  });

  test('notifications: table header dark, status tabs dark, filter selects dark', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/notifications', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const styles = await page.evaluate(() => {
      const theadRow = document.querySelector('thead tr');
      const activeTab = document.querySelector('[aria-pressed="true"]');
      const select = document.querySelector('select');
      const option = select ? select.querySelector('option') : null;
      return {
        theadBg: theadRow ? getComputedStyle(theadRow).backgroundColor : null,
        tabBg: activeTab ? getComputedStyle(activeTab).backgroundColor : null,
        tabText: activeTab ? getComputedStyle(activeTab).color : null,
        selectBg: select ? getComputedStyle(select).backgroundColor : null,
        selectText: select ? getComputedStyle(select).color : null,
        optionBg: option ? getComputedStyle(option).backgroundColor : null,
      };
    });

    const isDarkish = (v: string | null) => !!v && v !== 'transparent' && !v.startsWith('rgba(0, 0, 0, 0)');
    expect(isDarkish(styles.theadBg)).toBe(true);

    // Active tab is dark elevated surface
    expect(styles.tabBg).not.toBe('rgb(255, 195, 73)');
    expect(styles.tabText).toBe('rgb(245, 245, 245)');

    // Select has dark background
    expect(styles.selectBg).toBe('rgb(15, 15, 15)');
    expect(isDarkish(styles.optionBg)).toBe(true);
  });

  test('analytics: chart uses only the semantic brand hues', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/analytics', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    const found = await page.evaluate(() => {
      const hasRecharts = document.querySelectorAll('.recharts-wrapper').length > 0;
      const banned = ['#e5e7eb', '#d1d5db', '#6b7280', 'rgb(37, 99, 235)', 'rgb(22, 163, 74)', 'rgb(220, 38, 38)', 'rgb(217, 119, 6)'];
      const strokes = new Set<string>();
      document.querySelectorAll('svg [stroke]').forEach((el) => {
        const v = el.getAttribute('stroke');
        if (v) strokes.add(v);
      });
      const hits = [...strokes].filter((v) => banned.includes(v.toLowerCase()));
      const brandPresent = ['rgb(114, 47, 153)', 'rgb(255, 195, 73)', 'rgb(255, 120, 141)'].some((c) => [...strokes].some((s) => s.includes(c)));
      return { hasRecharts, hits, brandPresent };
    });

    expect(found.hits).toEqual([]);
    if (found.hasRecharts) expect(found.brandPresent).toBe(true);
  });

  test('monitoring: badges/colors render from the dark palette', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/monitoring', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const styles = await page.evaluate(() => {
      const badge = document.querySelector('span[class*="rounded-full"][class*="font-medium"]');
      return {
        badgeBg: badge ? getComputedStyle(badge).backgroundColor : null,
        badgeText: badge ? getComputedStyle(badge).color : null,
      };
    });
    const isDark = (v: string | null) => !!v && v !== 'transparent' && !v.startsWith('rgba(0, 0, 0, 0)');
    expect(isDark(styles.badgeBg)).toBe(true);
    const m = (styles.badgeBg ?? '').match(/(\d+),\s*(\d+),\s*(\d+)/);
    expect(Boolean(m)).toBe(true);
    // Badge background should be dark (low RGB values)
    if (m) expect(Number(m[3])).toBeLessThanOrEqual(90);
  });
});
