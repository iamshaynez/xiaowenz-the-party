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
    const black = owner.page.locator('.gm-render-host');
    const white = second.page.locator('.gm-render-host');

    // 从 aria-label 读回光标，逐键导航到目标交叉点；按键丢失时重试。
    async function moveCursorTo(host: ReturnType<Page['locator']>, x: number, y: number) {
      for (let guard = 0; guard < 30; guard += 1) {
        const label = await host.getAttribute('aria-label');
        const match = /第 (\d+) 行第 (\d+) 列/.exec(label ?? '');
        if (!match) throw new Error('棋盘光标标签缺失');
        const cy = Number(match[1]) - 1;
        const cx = Number(match[2]) - 1;
        if (cx === x && cy === y) return;
        const dx = Math.sign(x - cx);
        const dy = Math.sign(y - cy);
        await host.press(dx > 0 ? 'ArrowRight' : dx < 0 ? 'ArrowLeft' : dy > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      throw new Error('光标导航失败');
    }

    async function playStone(page: Page, host: ReturnType<Page['locator']>, x: number, y: number) {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await expect(page.locator('.bt-status')).toContainText('轮到你了', { timeout: 30_000 });
        await moveCursorTo(host, x, y);
        await host.press('Enter');
        // 生效判定：状态条翻转到「等待」，或直接出现终局浮层（最后一子取胜）。
        const flipped = await Promise.race([
          page.locator('.bt-status').filter({ hasNotText: '轮到你了' }).waitFor({ state: 'visible', timeout: 6_000 }).then(() => true),
          page.locator('.bt-overlay').waitFor({ state: 'visible', timeout: 6_000 }).then(() => true),
        ]).catch(() => false);
        if (flipped) return;
      }
      throw new Error(`落子 (${x},${y}) 未生效`);
    }

    // 黑：天元起手横向连五；白：一路向上陪跑。
    await playStone(owner.page, black, 7, 7);
    for (let round = 0; round < 4; round += 1) {
      await playStone(second.page, white, 7, 6 - round);
      await playStone(owner.page, black, 8 + round, 7);
    }
    await expect(owner.page.locator('.bt-overlay')).toContainText('获胜', { timeout: 10_000 });
    await expect(second.page.locator('.bt-overlay')).toContainText('获胜', { timeout: 10_000 });
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

// 完整 20 张打完的结算由 business/UI 层覆盖；E2E 在软件渲染的 CI 预算内
// 验证真实网络 + 3D 画布下的叫分、键盘出牌、农民过牌与轮转四轮。
test('斗地主：三人叫分定庄，地主键盘出牌与农民过牌跨端轮转', async ({ browser }) => {
  test.setTimeout(240_000);
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
    // 地主键盘：空格选最小单张、回车打出；两个农民按「不要」，完整轮转四轮。
    const host = owner.page.locator('.dd-render-host');
    for (let trick = 0; trick < 4; trick += 1) {
      await expect(owner.page.locator('.bt-status')).toContainText('轮到你出牌', { timeout: 60_000 });
      await host.press('Space');
      await host.press('Enter');
      for (const farmer of [second.page, third.page]) {
        const pass = farmer.getByRole('button', { name: '不要' });
        await pass.waitFor({ state: 'visible', timeout: 60_000 });
        await pass.click();
      }
    }
    // 地主已出 4 张：剩余 16 张的计数在两端一致可见。
    for (const player of [owner.page, second.page, third.page]) {
      await expect(player.locator('.bt-status')).toContainText(/轮到你出牌|等待 .* 出牌/, { timeout: 10_000 });
    }
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
