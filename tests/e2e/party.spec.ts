import { expect, test } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

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

async function vote(page: Page, nickname: string) {
  await page.getByRole('button', { name: `投给 ${nickname}`, exact: true }).click();
}

async function finishRound(pages: { owner: Page; second: Page; third: Page }, target: string, fallback: string) {
  await vote(pages.owner, target);
  await vote(pages.second, target === '阿熊' ? '房主小文' : target);
  await vote(pages.third, target === '蛙蛙' ? fallback : target);
  await expect(pages.owner.getByText('全场焦点')).toBeVisible();
  await expect(pages.second.getByText('全场焦点')).toBeVisible();
  await expect(pages.third.getByText('全场焦点')).toBeVisible();
}

test('三位真实玩家完成三轮对局，手机刷新恢复身份并最终再来一局', async ({ browser }, testInfo) => {
  const owner = await newPlayer(browser, false);
  const second = await newPlayer(browser);
  const third = await newPlayer(browser);
  const errors: string[] = [];
  for (const player of [owner, second, third]) {
    player.page.on('pageerror', (error) => errors.push(error.message));
  }

  try {
    await owner.page.goto('/');
    await expect(owner.page.getByRole('heading', { name: /把朋友凑在一起/ })).toBeVisible();
    await mkdir('artifacts', { recursive: true });
    await owner.page.screenshot({ path: 'artifacts/home-desktop.png', fullPage: true, animations: 'disabled' });

    await owner.page.getByRole('button', { name: '创建派对' }).click();
    await owner.page.getByLabel('你的昵称').fill('房主小文');
    await owner.page.getByRole('button', { name: '创建并进入房间' }).click();
    await expect(owner.page.getByRole('heading', { name: '人都到齐了吗？' })).toBeVisible();
    const code = (await owner.page.locator('.room-code__value').textContent())!;
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    await expect(owner.page.getByAltText('房间二维码')).toBeVisible();

    await join(second.page, code, '阿熊');
    await join(third.page, code, '蛙蛙');
    await expect(owner.page.getByText('3 / 12 位朋友')).toBeVisible();
    await owner.page.screenshot({ path: 'artifacts/lobby-desktop.png', fullPage: true, animations: 'disabled' });
    await second.page.screenshot({ path: 'artifacts/lobby-mobile.png', fullPage: true, animations: 'disabled' });

    await owner.page.getByRole('button', { name: '开始游戏' }).click();
    for (const page of [owner.page, second.page, third.page]) {
      await expect(page.getByText('你的这一票，投给谁？')).toBeVisible();
    }
    await expect(second.page.getByRole('button', { name: '投给 阿熊', exact: true })).toHaveCount(0);
    await second.page.screenshot({ path: 'artifacts/voting-mobile.png', fullPage: true, animations: 'disabled' });

    await finishRound({ owner: owner.page, second: second.page, third: third.page }, '阿熊', '房主小文');
    await expect(owner.page.getByText('2 票')).toBeVisible();
    await second.page.screenshot({ path: 'artifacts/results-mobile.png', fullPage: true, animations: 'disabled' });
    await owner.page.getByRole('button', { name: '下一轮' }).click();
    await expect(owner.page.getByText('ROUND 02')).toBeVisible();

    await second.page.reload();
    await expect(second.page.getByText('你的这一票，投给谁？')).toBeVisible();
    await expect(second.page.getByRole('button', { name: '投给 房主小文', exact: true })).toBeVisible();
    await expect(second.page.getByRole('heading', { name: '加入这场派对' })).toHaveCount(0);

    await finishRound({ owner: owner.page, second: second.page, third: third.page }, '蛙蛙', '房主小文');
    await owner.page.getByRole('button', { name: '下一轮' }).click();
    await expect(owner.page.getByText('ROUND 03')).toBeVisible();
    await finishRound({ owner: owner.page, second: second.page, third: third.page }, '阿熊', '房主小文');
    await owner.page.getByRole('button', { name: '查看最终结果' }).click();

    for (const page of [owner.page, second.page, third.page]) {
      await expect(page.getByRole('heading', { name: '今晚的气氛担当' })).toBeVisible();
      await expect(page.getByText('阿熊', { exact: true }).first()).toBeVisible();
    }
    await owner.page.screenshot({ path: 'artifacts/final-desktop.png', fullPage: true, animations: 'disabled' });
    await expect(second.page.getByRole('button', { name: '再来一局' })).toHaveCount(0);

    await owner.page.getByRole('button', { name: '再来一局' }).click();
    await expect(second.page.getByText('ROUND 01')).toBeVisible();
    await expect(second.page.getByText('0 分')).toBeVisible();
    expect(errors).toEqual([]);
    await testInfo.attach('room-code', { body: code, contentType: 'text/plain' });
  } finally {
    await Promise.all([owner.context.close(), second.context.close(), third.context.close()]);
  }
});

test('手机加入页处理未知房间和非法昵称，不发生白屏', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/r/ZZZZZZ');
  await page.getByLabel('你的昵称').fill('走错房间的人');
  await page.getByRole('button', { name: '加入房间' }).click();
  await expect(page.getByRole('alert')).toContainText('没有找到这个房间');
  await expect(page.getByRole('heading', { name: '加入这场派对' })).toBeVisible();

  await page.goto('/');
  await page.getByRole('button', { name: '创建派对' }).click();
  await expect(page.getByRole('button', { name: '创建并进入房间' })).toBeDisabled();
});
