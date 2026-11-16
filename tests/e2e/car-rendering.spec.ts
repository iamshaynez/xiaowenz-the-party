import { expect, test } from '@playwright/test';

test.use({ reducedMotion: 'reduce', deviceScaleFactor: 1 });

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`固定种子跳台帧在 ${viewport.width} 宽度下可重复`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize(viewport);
    await page.goto('/lab/can-drive-frame?seed=123456&time=32000');
    await expect(page.locator('canvas')).toBeVisible();
    const first = await page.screenshot();

    await page.reload();
    await expect(page.locator('canvas')).toBeVisible();
    const second = await page.screenshot();

    expect(second.equals(first)).toBe(true);
    expect(errors).toEqual([]);
  });
}
