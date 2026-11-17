import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// 棋牌室 E2E：四款桌面游戏在真实 Chromium + WebGL 下完整走通。
// 只断言稳定阶段（回合归属、终局名次、持久按钮），不绑定瞬时动画文案。

async function newPlayer(browser: Browser, mobile = true) {
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

async function openRoom(browser: Browser, gameName: RegExp, joins: number) {
  const owner = await newPlayer(browser, false);
  await owner.page.goto('/');
  await owner.page.getByRole('button', { name: '创建派对' }).click();
  await owner.page.getByLabel('你的昵称').fill('房主小文');
  await owner.page.getByRole('button', { name: '创建并进入房间' }).click();
  await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
  const code = (await owner.page.locator('.room-code__value').textContent())!;
  const guests: Array<{ context: Awaited<ReturnType<typeof newPlayer>>['context']; page: Page }> = [];
  for (let index = 0; index < joins; index += 1) {
    const guest = await newPlayer(browser);
    await join(guest.page, code, `玩家${index + 2}`);
    guests.push(guest);
  }
  await owner.page.getByRole('radio', { name: gameName }).click();
  await owner.page.getByRole('button', { name: '开始游戏' }).click();
  return { owner, guests, code };
}

async function expectCanvasRunning(page: Page, testId: string) {
  const canvas = page.locator(`[data-testid="${testId}"]`);
  await expect(canvas).toHaveAttribute('data-render-engine', 'three.js');
  await expect(canvas).toHaveAttribute('data-render-state', 'running', { timeout: 15_000 });
}

test('五子棋：双浏览器真实 WebGL 对局，黑棋键盘落子连五获胜', async ({ browser }) => {
  test.setTimeout(180_000);
  const { owner, guests } = await openRoom(browser, /五子棋/, 1);
  const second = guests[0]!;
  const errors: string[] = [];
  for (const player of [owner, second]) player.page.on('pageerror', (error) => errors.push(error.message));
  try {
    for (const page of [owner.page, second.page]) await expectCanvasRunning(page, 'gomoku-canvas');
    await mkdir('artifacts', { recursive: true });
    await owner.page.screenshot({ path: 'artifacts/gomoku-board.png', animations: 'disabled' });

    const black = owner.page.locator('.gm-render-host');
    const white = second.page.locator('.gm-render-host');
    const myTurn = (page: Page) => expect(page.locator('.bt-status')).toContainText('轮到你了', { timeout: 30_000 });

    // 黑：天元起手；白：一路向上陪跑。黑横向连五取胜。
    await myTurn(owner.page);
    await black.press('Enter');
    for (let round = 0; round < 4; round += 1) {
      await myTurn(second.page);
      await white.press('ArrowUp');
      await white.press('Enter');
      await myTurn(owner.page);
      await black.press('ArrowRight');
      await black.press('Enter');
    }
    // 黑第五子：(11,7)，落子即胜。
    await expect(owner.page.locator('.bt-overlay')).toContainText('获胜', { timeout: 10_000 });
    await expect(second.page.locator('.bt-overlay')).toContainText('获胜', { timeout: 10_000 });
    await owner.page.screenshot({ path: 'artifacts/gomoku-win.png', animations: 'disabled' });

    await owner.page.getByRole('button', { name: '换个游戏' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
  } finally {
    await owner.context.close();
    await second.context.close();
  }
  expect(errors).toEqual([]);
});

test('飞行棋：双浏览器掷骰起飞，回合在两端正确轮转', async ({ browser }) => {
  test.setTimeout(200_000);
  const { owner, guests } = await openRoom(browser, /飞行棋/, 1);
  const second = guests[0]!;
  try {
    for (const page of [owner.page, second.page]) await expectCanvasRunning(page, 'ludo-canvas');
    await owner.page.screenshot({ path: 'artifacts/ludo-board.png', animations: 'disabled' });

    // 掷骰 → 移动（或自动轮空）；掷出 6 会追加一掷，因此按「谁亮按钮谁行动」驱动。
    const rollButtons = new Map<Page, ReturnType<Page['getByRole']>>([
      [owner.page, owner.page.getByRole('button', { name: /掷骰子/ })],
      [second.page, second.page.getByRole('button', { name: /掷骰子/ })],
    ]);
    const actedPages = new Set<Page>();
    for (let step = 0; step < 14 && actedPages.size < 2; step += 1) {
      let acting: Page | null = null;
      for (let poll = 0; poll < 250 && !acting; poll += 1) {
        for (const [page, button] of rollButtons) {
          if (await button.isVisible().catch(() => false)) acting = page;
        }
        if (!acting) await owner.page.waitForTimeout(200);
      }
      expect(acting, '至少一端应该轮到掷骰').not.toBeNull();
      actedPages.add(acting!);
      await acting!.getByRole('button', { name: /掷骰子/ }).click();
      const moveButton = acting!.getByRole('button', { name: /号机起飞/ }).first();
      await moveButton.waitFor({ state: 'visible', timeout: 2_000 }).catch(() => undefined);
      if (await moveButton.isVisible()) await moveButton.click();
    }
    expect(actedPages.size).toBe(2);
    await second.page.screenshot({ path: 'artifacts/ludo-mobile.png', animations: 'disabled' });
  } finally {
    await owner.context.close();
    await second.context.close();
  }
});

test('斗地主：三人叫分定庄，地主键盘打单张到底并回到大厅', async ({ browser }) => {
  test.setTimeout(360_000);
  const { owner, guests } = await openRoom(browser, /斗地主/, 2);
  const [second, third] = [guests[0]!, guests[1]!];
  const errors: string[] = [];
  for (const player of [owner, second, third]) player.page.on('pageerror', (error) => errors.push(error.message));
  try {
    for (const player of [owner, second, third]) await expectCanvasRunning(player.page, 'dou-dizhu-canvas');
    // 首叫玩家直接叫 3 分坐庄。
    await owner.page.getByRole('button', { name: '3 分' }).click();
    for (const player of [owner, second, third]) {
      await expect(player.page.locator('.bt-status')).toContainText(/轮到你出牌|等待/, { timeout: 10_000 });
    }
    await mkdir('artifacts', { recursive: true });
    await owner.page.screenshot({ path: 'artifacts/dou-dizhu-table.png', animations: 'disabled' });

    // 地主键盘：空格选最小单张、回车打出；两个农民按「不要」。
    // 最后一张出手时本手立即结束，农民不会再有「不要」——两种结局择一等待。
    const host = owner.page.locator('.dd-render-host');
    const doneHeading = owner.page.getByRole('heading', { name: /率先出完/ });
    for (let guard = 0; guard < 24; guard += 1) {
      if (await doneHeading.isVisible().catch(() => false)) break;
      await expect(owner.page.locator('.bt-status')).toContainText('轮到你出牌', { timeout: 60_000 });
      await host.press('Space');
      await host.press('Enter');
      let handOver = false;
      for (const farmer of [second.page, third.page]) {
        const pass = farmer.getByRole('button', { name: '不要' });
        await Promise.race([
          pass.waitFor({ state: 'visible', timeout: 60_000 }),
          doneHeading.waitFor({ state: 'visible', timeout: 60_000 }).then(() => undefined),
        ]);
        if (await doneHeading.isVisible().catch(() => false)) {
          handOver = true;
          break;
        }
        await pass.click();
      }
      if (handOver) break;
    }
    await expect(owner.page.getByRole('heading', { name: /率先出完/ })).toBeVisible({ timeout: 20_000 });
    await owner.page.screenshot({ path: 'artifacts/dou-dizhu-result.png', animations: 'disabled' });
    // 单手制：结算展示后自动进入整场结束。
    await expect(owner.page.getByRole('heading', { name: /赢下整场/ })).toBeVisible({ timeout: 20_000 });
    await owner.page.getByRole('button', { name: '换个游戏' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
  } finally {
    await owner.context.close();
    await second.context.close();
    await third.context.close();
  }
  expect(errors).toEqual([]);
});

test('德州扑克：双浏览器弃牌收池、结算与再来一局', async ({ browser }) => {
  test.setTimeout(200_000);
  const { owner, guests } = await openRoom(browser, /德州扑克/, 1);
  const second = guests[0]!;
  try {
    for (const page of [owner.page, second.page]) await expectCanvasRunning(page, 'texas-holdem-canvas');
    await mkdir('artifacts', { recursive: true });
    await owner.page.screenshot({ path: 'artifacts/texas-holdem-table.png', animations: 'disabled' });

    // Heads-Up：按钮位（小盲）先行动，弃牌后大盲直接收池。
    const foldButton = second.page.getByRole('button', { name: '弃牌' });
    await foldButton.waitFor({ state: 'visible', timeout: 10_000 });
    await second.page.screenshot({ path: 'artifacts/texas-holdem-actions.png', animations: 'disabled' });
    await foldButton.click();
    await expect(owner.page.getByRole('heading', { name: '无人跟注' })).toBeVisible({ timeout: 10_000 });
    await expect(owner.page.getByText(/主池/)).toBeVisible();
    // 单手制：自动进入整场排名。
    await expect(owner.page.getByRole('heading', { name: /冠军/ })).toBeVisible({ timeout: 20_000 });
    await expect(second.page.getByRole('heading', { name: /冠军/ })).toBeVisible({ timeout: 20_000 });

    await owner.page.getByRole('button', { name: /再来一局/ }).click();
    await expect(owner.page.locator('.bt-status')).toContainText('翻牌前', { timeout: 10_000 });
    await owner.page.getByRole('button', { name: '换个游戏' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
  } finally {
    await owner.context.close();
    await second.context.close();
  }
});
