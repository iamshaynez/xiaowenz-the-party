import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

async function newPlayer(browser: Browser, mobile: boolean) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    isMobile: mobile,
    hasTouch: mobile,
    deviceScaleFactor: mobile ? 2 : 1,
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

async function expectRealCanvas(page: Page) {
  const canvas = page.getByTestId('monster-car-canvas');
  await expect(canvas).toBeVisible({ timeout: 15_000 });
  await expect(canvas).toHaveAttribute('data-render-state', 'running', { timeout: 15_000 });
}

test('两名真实玩家组装怪车，共同穿越森林，手机刷新后恢复并获得一致名次', async ({ browser }, testInfo) => {
  test.setTimeout(180_000);
  const owner = await newPlayer(browser, false);
  const second = await newPlayer(browser, true);
  const errors: string[] = [];
  for (const player of [owner, second]) {
    player.page.on('pageerror', (error) => errors.push(error.message));
    player.page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }

  try {
    await mkdir('artifacts/monster-car', { recursive: true });
    await owner.page.goto('/');
    await owner.page.getByRole('radio', { name: /怪兽汽车/ }).click();
    await owner.page.getByRole('button', { name: '创建派对' }).click();
    await owner.page.getByLabel('你的昵称').fill('小文');
    await owner.page.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
    const code = (await owner.page.locator('.room-code__value').textContent())!;
    await join(second.page, code, '阿熊');
    await expect(owner.page.getByText('2 / 12 位朋友')).toBeVisible();
    await owner.page.screenshot({ path: 'artifacts/monster-car/lobby-desktop.png', fullPage: true });

    await owner.page.getByRole('button', { name: '开始游戏' }).click();
    for (const page of [owner.page, second.page]) {
      await expect(page.getByRole('heading', { name: /造一辆奇怪的车/ })).toBeVisible();
      await expectRealCanvas(page);
    }
    await owner.page.screenshot({ path: 'artifacts/monster-car/garage-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/garage-mobile.png', fullPage: true });

    await owner.page.getByRole('radio', { name: /弹簧轮/ }).click();
    await owner.page.getByRole('tab', { name: '车头' }).click();
    await owner.page.getByRole('radio', { name: /鸭鸭船头/ }).click();
    await owner.page.getByRole('tab', { name: '车顶' }).click();
    await owner.page.getByRole('radio', { name: /雨伞车顶/ }).click();
    await second.page.getByRole('tab', { name: '司机' }).click();
    await second.page.getByRole('radio', { name: /小鸭司机/ }).click();
    await owner.page.screenshot({ path: 'artifacts/monster-car/custom-car-desktop.png', fullPage: true });

    await second.page.getByRole('button', { name: /我的车好了/ }).click();
    await owner.page.getByRole('button', { name: /我的车好了/ }).click();
    await expect(owner.page.getByText('握紧方向盘')).toBeVisible();
    await expectRealCanvas(owner.page);
    await owner.page.screenshot({ path: 'artifacts/monster-car/departure-desktop.png', fullPage: true });
    await expectRealCanvas(second.page);
    await expect(second.page.locator('.mc-shell')).toHaveAttribute('class', /mc-phase-(countdown|racing)/);

    for (const page of [owner.page, second.page]) {
      await expect(page.getByText(/森林旅行 ·/)).toBeVisible({ timeout: 12_000 });
    }
    await expect(owner.page.locator('.mc-route-car')).toHaveCount(2);
    const firstRouteCar = owner.page.locator('.mc-route-car').first();
    const initialPosition = await firstRouteCar.getAttribute('style');
    await expect.poll(() => firstRouteCar.getAttribute('style'), { timeout: 10_000 }).not.toBe(initialPosition);
    await owner.page.screenshot({ path: 'artifacts/monster-car/race-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/race-mobile.png', fullPage: true });

    await second.page.reload();
    await expectRealCanvas(second.page);
    await expect(second.page.locator('.mc-route-car')).toHaveCount(2);
    await second.page.screenshot({ path: 'artifacts/monster-car/race-restored-mobile.png', fullPage: true });

    for (const page of [owner.page, second.page]) {
      await expect(page.getByRole('heading', { name: '抵达云朵大操场！' })).toBeVisible({ timeout: 40_000 });
      await expect(page.locator('.mc-standings > div')).toHaveCount(2);
    }
    expect(await owner.page.locator('.mc-standings').innerText()).toBe(await second.page.locator('.mc-standings').innerText());
    await owner.page.screenshot({ path: 'artifacts/monster-car/results-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/results-mobile.png', fullPage: true });
    await expect(second.page.getByRole('button', { name: /再造一辆/ })).toHaveCount(0);
    await owner.page.getByRole('button', { name: /再造一辆/ }).click();
    await expect(second.page.getByRole('heading', { name: /造一辆奇怪的车/ })).toBeVisible();
    await expect(second.page.getByRole('button', { name: /我的车好了/ })).toBeVisible();

    expect(errors).toEqual([]);
    await testInfo.attach('room-code', { body: code, contentType: 'text/plain' });
  } finally {
    await Promise.all([owner.context.close(), second.context.close()]);
  }
});
