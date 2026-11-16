import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function newPlayer(browser: Browser, mobile: boolean) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 1.5 : 1,
  });
  const page = await context.newPage();
  return { context, page };
}

async function join(page: Page, code: string, nickname: string) {
  await page.goto(`/r/${code}`);
  await page.getByLabel('你的昵称').fill(nickname);
  await page.getByRole('button', { name: '加入房间' }).click();
  await expect(page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
}

test('两位玩家改装怪车，完成逐车展示、颁奖、刷新恢复与保留车辆重开', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const owner = await newPlayer(browser, false);
  const second = await newPlayer(browser, true);
  const errors: string[] = [];
  for (const player of [owner, second]) player.page.on('pageerror', (error) => errors.push(error.message));

  try {
    await owner.page.goto('/');
    await owner.page.getByRole('radio', { name: /这车能开/ }).click();
    await owner.page.getByRole('button', { name: '创建派对' }).click();
    await owner.page.getByLabel('你的昵称').fill('小文');
    await owner.page.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
    const code = (await owner.page.locator('.room-code__value').textContent())!;
    await join(second.page, code, '阿熊');

    await owner.page.getByRole('button', { name: '开始游戏' }).click();
    await expect(second.page.getByText('你的怪车改装台')).toBeVisible();
    await owner.page.getByRole('button', { name: '司机：机器人司机' }).click();
    await expect(owner.page.getByRole('button', { name: '司机：机器人司机' })).toHaveAttribute('aria-pressed', 'true');
    await owner.page.getByRole('tab', { name: '车顶' }).click();
    await owner.page.getByRole('button', { name: '车顶：车顶花盆' }).click();
    await owner.page.getByRole('button', { name: '准备好了' }).click();
    await second.page.getByRole('button', { name: '司机：香蕉司机' }).click();
    await expect(second.page.getByRole('button', { name: '司机：香蕉司机' })).toHaveAttribute('aria-pressed', 'true');
    await second.page.getByRole('button', { name: '准备好了' }).click();

    await expect(owner.page.getByRole('heading', { name: '小文的车' })).toBeVisible();
    await expect(second.page.getByRole('heading', { name: '小文的车' })).toBeVisible();
    await expect(owner.page.getByRole('heading', { name: '阿熊的车' })).toBeVisible({ timeout: 55_000 });

    await second.page.waitForTimeout(32_000);
    await mkdir('artifacts', { recursive: true });
    await second.page.screenshot({ path: 'artifacts/can-drive-show-mobile.png', fullPage: true });
    await second.page.reload();
    await expect(second.page.getByRole('heading', { name: '阿熊的车' })).toBeVisible();
    await expect(second.page.getByRole('heading', { name: '加入这场派对' })).toHaveCount(0);

    await expect(owner.page.locator('.cd-award-reveal')).toBeVisible({ timeout: 55_000 });
    await expect(second.page.locator('.cd-final-award')).toHaveCount(0);
    await expect(owner.page.getByRole('heading', { name: '每辆车，都有自己的节目。' })).toBeVisible({ timeout: 25_000 });
    await expect(owner.page.locator('.cd-final-award')).toHaveCount(2);
    await expect(second.page.locator('.cd-final-award')).toHaveCount(2);
    await expect(second.page.getByRole('button', { name: '保留车辆，再改一局' })).toHaveCount(0);

    await owner.page.getByRole('button', { name: '保留车辆，再改一局' }).click();
    await expect(second.page.getByText('你的怪车改装台')).toBeVisible();
    await owner.page.getByRole('tab', { name: '司机' }).click();
    await expect(owner.page.getByRole('button', { name: '司机：机器人司机' })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
    await testInfo.attach('room-code', { body: code, contentType: 'text/plain' });
  } finally {
    await Promise.all([owner.context.close(), second.context.close()]);
  }
});
