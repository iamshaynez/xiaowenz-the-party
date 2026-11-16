import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'no-preference', deviceScaleFactor: 1 });

test('实时怪车展示会随 wall-clock 连续推进，而不是停在第 0 毫秒', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/lab/can-drive-frame?seed=123456&live=1');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(500);
  const first = await page.screenshot();

  await page.waitForTimeout(800);
  const second = await page.screenshot();

  expect(second.equals(first)).toBe(false);
  expect(errors).toEqual([]);
});
