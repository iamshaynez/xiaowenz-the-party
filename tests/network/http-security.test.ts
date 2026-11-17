import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildServer } from '../../apps/server/src/app';

let app: FastifyInstance;
let baseUrl: string;
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'party-http-'));
  app = await buildServer({ logger: false, now: Date.now, tickIntervalMs: 100, messageRateLimit: 100, messageRateWindowMs: 1_000, trustProxy: true });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('没有测试端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  if (app?.server.listening) await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('公网 HTTP 边界', () => {
  it('配置只暴露公开信息，非法输入和重复昵称得到明确错误', async () => {
    const config = await fetch(`${baseUrl}/api/config`).then((response) => response.json());
    expect(config.games).toEqual([
      {
        id: 'most-likely', version: 1, name: '谁最可能', emoji: '🗳️',
        description: '一道题，一票默契。看看在朋友眼里，谁是那个“十有八九”的人。',
        tags: ['破冰', '默契', '轻松'], roundsOptions: [3, 5, 8], minPlayers: 3, maxPlayers: 12,
        rules: ['3–12 人', '不能投自己', '平票都得分'], englishName: "WHO'S MOST LIKELY", minutesPerRound: 2,
      },
      {
        id: 'piggy-bank', version: 1, name: '存钱罐', emoji: '🏺',
        description: '一起往存钱罐里攒钱，砸罐的人平分。天降事件随时搅局，落幕轮保密。',
        tags: ['家庭', '儿童', '反转'], roundsOptions: [4, 6, 8], minPlayers: 3, maxPlayers: 12,
        rules: ['3–12 人', '锤子有限', '小心纸糊罐'], englishName: 'PIGGY BANK', minutesPerRound: 2,
      },
      {
        id: 'monster-car', version: 1, name: '怪兽汽车', emoji: '🚙',
        description: '装出全世界独一无二的怪车，一起穿过会互动的魔法森林。',
        tags: ['幼儿', '创作', '动画'], roundsOptions: [1], minPlayers: 2, maxPlayers: 4,
        rules: ['2–4 人', '五部位自由组装', '30 秒森林竞演'], englishName: 'FOREST MOTOR CLUB', minutesPerRound: 4,
      },
      {
        id: 'gomoku', version: 1, name: '五子棋', emoji: '⚫',
        description: '一张木棋盘，黑白两色。先连成五子的人赢，简单纯粹。',
        tags: ['棋牌', '双人', '策略'], roundsOptions: [1, 3, 5], minPlayers: 2, maxPlayers: 2,
        rules: ['2 人', '先连五子者胜', '多盘制轮流执黑'], englishName: 'GOMOKU', minutesPerRound: 3,
      },
      {
        id: 'ludo', version: 1, name: '飞行棋', emoji: '✈️',
        description: '掷骰子、起飞、跳格、飞行、撞机！先把四架飞机全部送回大本营。',
        tags: ['棋牌', '骰子', '家庭'], roundsOptions: [1], minPlayers: 2, maxPlayers: 4,
        rules: ['2–4 人', '掷 6 起飞并追加一掷', '己色格跳跃，飞行格跨越棋盘'], englishName: 'AEROPLANE CHESS', minutesPerRound: 8,
      },
      {
        id: 'dou-dizhu', version: 1, name: '斗地主', emoji: '🃏',
        description: '一副牌三个人，叫分抢地主，炸弹翻倍，春天更翻倍。',
        tags: ['棋牌', '扑克', '策略'], roundsOptions: [1, 3, 5], minPlayers: 3, maxPlayers: 3,
        rules: ['3 人', '叫 1/2/3 分定地主', '炸弹与春天逐次翻倍'], englishName: 'FIGHT THE LANDLORD', minutesPerRound: 4,
      },
      {
        id: 'texas-holdem', version: 1, name: '德州扑克', emoji: '♠️',
        description: '两张底牌，无限注。盲注逐级上升，边池按国际规则结算，摊牌见真章。',
        tags: ['棋牌', '扑克', '博弈'], roundsOptions: [1, 3, 5, 8], minPlayers: 2, maxPlayers: 6,
        rules: ['2–6 人', '起始 2000 筹码 vs 10/20 盲注', '每 6 手盲注翻倍'], englishName: "TEXAS HOLD'EM", minutesPerRound: 3,
      },
    ]);
    expect(config.avatars).toContain('🦊');
    expect(JSON.stringify(config)).not.toContain('resumeToken');

    const invalid = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '', avatar: '🦊' }),
    });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).code).toBe('INVALID_INPUT');

    const malformed = await fetch(`${baseUrl}/api/rooms`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
    expect(malformed.status).toBe(400);

    const invalidCode = await fetch(`${baseUrl}/api/rooms/bad/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '朋友', avatar: '🐼' }),
    });
    expect(invalidCode.status).toBe(400);
    expect((await invalidCode.json()).code).toBe('INVALID_ROOM_CODE');

    const created = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '房主', avatar: '🦊' }),
    });
    const session = await created.json();
    const duplicate = await fetch(`${baseUrl}/api/rooms/${session.roomCode}/join`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '房主', avatar: '🐼' }),
    });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe('NICKNAME_TAKEN');

    const tooLarge = await fetch(`${baseUrl}/api/rooms`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: 'x'.repeat(20_000), avatar: '🦊' }),
    });
    expect(tooLarge.status).toBe(413);
    expect((await tooLarge.json()).code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('安全响应头覆盖 API，未知 API 不会返回前端 HTML', async () => {
    const response = await fetch(`${baseUrl}/api/not-found`);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect((await response.json()).code).toBe('NOT_FOUND');
  });

  it('生产静态页面支持房间路由回退，同时保留 API 404', async () => {
    await app.close();
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>Party</title>');
    app = await buildServer({
      logger: false, now: Date.now, tickIntervalMs: 100, messageRateLimit: 100, messageRateWindowMs: 1_000, webRoot: directory,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('没有测试端口');
    baseUrl = `http://127.0.0.1:${address.port}`;

    const page = await fetch(`${baseUrl}/r/ABC234`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('<title>Party</title>');
    const api = await fetch(`${baseUrl}/api/not-found`);
    expect(api.status).toBe(404);
  });

  it('持续猜测房间码会触发 IP 限流', async () => {
    let lastStatus = 0;
    for (let index = 0; index < 61; index += 1) {
      const response = await fetch(`${baseUrl}/api/rooms/ZZZZZZ/join`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '猜测者', avatar: '🐼' }),
      });
      lastStatus = response.status;
      await response.arrayBuffer();
    }
    expect(lastStatus).toBe(429);

    const differentClient = await fetch(`${baseUrl}/api/rooms/ZZZZZZ/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.42' },
      body: JSON.stringify({ nickname: '另一位玩家', avatar: '🐼' }),
    });
    expect(differentClient.status).toBe(404);
  });
});
