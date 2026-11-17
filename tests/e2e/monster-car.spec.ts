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

async function expectRestoredJourney(page: Page) {
  const canvas = page.getByTestId('monster-car-canvas');
  const fallback = page.locator('.mc-dom-journey');
  await expect(canvas.or(fallback)).toBeVisible({ timeout: 45_000 });
  if (await canvas.isVisible()) await expect(canvas).toHaveAttribute('data-render-state', 'running', { timeout: 20_000 });
}

async function expectModelOptionsReady(page: Page) {
  const options = page.locator('.mc-part-options [data-testid^="part-thumbnail-"]');
  await expect(options).toHaveCount(4, { timeout: 15_000 });
  await expect.poll(async () => options.evaluateAll((nodes) => (
    nodes.every((node) => node.getAttribute('data-state') === 'loaded')
  )), { timeout: 20_000 }).toBe(true);
}

async function openResults(page: Page) {
  await expect(page.locator('.mc-phase-finished')).toBeVisible({ timeout: 40_000 });
  const showResults = page.getByRole('button', { name: '查看名次' });
  await expect(showResults).toBeVisible({ timeout: 15_000 });
  await showResults.click();
  await expect(page.getByRole('heading', { name: '抵达云朵大操场！' })).toBeVisible();
}

async function setupParty(browser: Browser) {
  const owner = await newPlayer(browser, false);
  const second = await newPlayer(browser, true);
  const errors: string[] = [];
  for (const player of [owner, second]) {
    player.page.on('pageerror', (error) => errors.push(error.message));
    player.page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
  }
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
  await owner.page.getByRole('button', { name: '开始游戏' }).click();
  for (const page of [owner.page, second.page]) {
    await expect(page.getByRole('heading', { name: /造一辆奇怪的车/ })).toBeVisible();
    await expectRealCanvas(page);
  }
  return { owner, second, errors, code };
}

test('车库分页、精细模型、惊喜整车和旋转操作保持真实画布健康', async ({ browser }, testInfo) => {
  // 软件 WebGL 的模型烘焙与双独立浏览器操作明显慢于普通 DOM 测试。
  test.setTimeout(300_000);
  const { owner, second, errors, code } = await setupParty(browser);
  try {
    await expectModelOptionsReady(owner.page);
    await owner.page.screenshot({ path: 'artifacts/monster-car/garage-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/garage-mobile.png', fullPage: true });

    await owner.page.getByRole('button', { name: '下一页零件' }).click();
    await owner.page.getByRole('radio', { name: /香蕉轮/ }).click();
    await owner.page.getByRole('tab', { name: '车头' }).click();
    await owner.page.getByRole('button', { name: '下一页零件' }).click();
    await expectModelOptionsReady(owner.page);
    await owner.page.getByRole('radio', { name: /鲨鱼车头/ }).click();
    await owner.page.getByRole('tab', { name: '车顶' }).click();
    await owner.page.getByRole('button', { name: '下一页零件' }).click();
    await expectModelOptionsReady(owner.page);
    await owner.page.getByRole('radio', { name: /鲸鱼车顶/ }).click();
    await second.page.getByRole('tab', { name: '司机' }).click();
    await second.page.getByRole('button', { name: '下一页零件' }).click();
    await second.page.getByRole('radio', { name: /机器人司机/ }).click();
    await owner.page.screenshot({ path: 'artifacts/monster-car/custom-car-desktop.png', fullPage: true });

    const preview = owner.page.locator('.mc-render-host');
    await preview.focus();
    await preview.press('ArrowRight');
    await owner.page.getByRole('button', { name: /惊喜一下/ }).click();
    await expectRealCanvas(owner.page);
    expect(errors).toEqual([]);
    await testInfo.attach('room-code', { body: code, contentType: 'text/plain' });
  } finally {
    await Promise.all([owner.context.close(), second.context.close()]);
  }
});

test('两名真实玩家完成竞演、手机刷新、持续庆典并保留创作重开', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const { owner, second, errors, code } = await setupParty(browser);
  try {
    // 复杂车库矩阵已由独立场景覆盖，这条旅程只选择少量自定义零件。
    await owner.page.getByRole('button', { name: '下一页零件' }).click();
    await owner.page.getByRole('radio', { name: /香蕉轮/ }).click();
    await second.page.getByRole('tab', { name: '司机' }).click();
    await second.page.getByRole('button', { name: '下一页零件' }).click();
    await second.page.getByRole('radio', { name: /机器人司机/ }).click();
    await second.page.getByRole('button', { name: /我的车好了/ }).click();
    await owner.page.getByRole('button', { name: /我的车好了/ }).click();

    await expect(owner.page.locator('.mc-shell')).toHaveAttribute('class', /mc-phase-(countdown|racing)/, { timeout: 15_000 });
    await expectRealCanvas(owner.page);
    await owner.page.screenshot({ path: 'artifacts/monster-car/departure-desktop.png', fullPage: true });
    await expectRestoredJourney(second.page);
    for (const page of [owner.page, second.page]) {
      await expect(page.locator('.mc-shell')).toHaveAttribute('class', /mc-phase-(racing|finished)/, { timeout: 45_000 });
    }
    expect(await owner.page.locator('.mc-event-name strong').innerText()).toBe(await second.page.locator('.mc-event-name strong').innerText());
    await expect(owner.page.locator('.mc-route-car')).toHaveCount(2);
    await owner.page.screenshot({ path: 'artifacts/monster-car/race-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/race-mobile.png', fullPage: true });

    await second.page.reload();
    await expectRestoredJourney(second.page);
    await expect(second.page.locator('.mc-route-car')).toHaveCount(2);
    for (const page of [owner.page, second.page]) {
      await openResults(page);
      await expect(page.locator('.mc-standings > div')).toHaveCount(2);
    }
    expect(await owner.page.locator('.mc-standings').innerText()).toBe(await second.page.locator('.mc-standings').innerText());
    await owner.page.screenshot({ path: 'artifacts/monster-car/results-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/results-mobile.png', fullPage: true });
    for (const page of [owner.page, second.page]) {
      await page.getByRole('button', { name: '看车车和礼花' }).click();
      await expect(page.locator('.mc-celebration-dock')).toBeVisible();
      await expectRestoredJourney(page);
    }
    await owner.page.screenshot({ path: 'artifacts/monster-car/celebration-desktop.png', fullPage: true });
    await second.page.screenshot({ path: 'artifacts/monster-car/celebration-mobile.png', fullPage: true });
    await expect(second.page.getByRole('button', { name: '再玩一场' })).toHaveCount(0);
    await owner.page.getByRole('button', { name: '再玩一场' }).click();
    await expect(second.page.getByRole('heading', { name: /造一辆奇怪的车/ })).toBeVisible();
    await second.page.getByRole('tab', { name: '司机' }).click();
    await expect(second.page.getByRole('radio', { name: /机器人司机/ })).toHaveAttribute('aria-checked', 'true');

    expect(errors).toEqual([]);
    await testInfo.attach('room-code', { body: code, contentType: 'text/plain' });
  } finally {
    await Promise.all([owner.context.close(), second.context.close()]);
  }
});
