import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Session } from '@party/protocol';
import type { PiggyBankView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];
let directory = '';
let dataFile = '';

function gameOf(message: unknown): PiggyBankView | null {
  const room = (message as { room?: { game: PiggyBankView | null } }).room;
  return room?.game ?? null;
}

async function request<T>(path: string, init?: RequestInit, expectedStatus = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as T & { message?: string };
  if (response.status !== expectedStatus) {
    throw new Error(`请求 ${path} 预期 ${expectedStatus}，实际 ${response.status}：${JSON.stringify(body)}`);
  }
  return body;
}

async function createRoom(nickname = '房主') {
  return request<Session>('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, avatar: '🦊' }),
  }, 201);
}

async function joinRoom(code: string, nickname: string) {
  return request<Session>(`/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, avatar: '🐼' }),
  });
}

async function connect(session: Session) {
  const client = await PartyTestClient.connect(socketUrl);
  clients.push(client);
  client.send({ type: 'authenticate', sessionId: session.sessionId, resumeToken: session.resumeToken });
  const ready = await client.waitFor('ready');
  expect(ready.session.playerId).toBe(session.playerId);
  return client;
}

async function threePlayerPiggyParty(rounds = 4) {
  const owner = await createRoom();
  const second = await joinRoom(owner.roomCode, '第二位');
  const third = await joinRoom(owner.roomCode, '第三位');
  const ownerClient = await connect(owner);
  const secondClient = await connect(second);
  const thirdClient = await connect(third);
  ownerClient.send({ type: 'start-game', actionId: 'pb-start-00001', gameId: 'piggy-bank', rounds });
  let startView: PiggyBankView | null = null;
  for (const client of [ownerClient, secondClient, thirdClient]) {
    const message = await client.waitForMessage((candidate) => candidate.type === 'room' && gameOf(candidate)?.phase === 'choosing');
    if (client === secondClient) startView = gameOf(message);
  }
  for (const client of [ownerClient, secondClient, thirdClient]) client.clear();
  return { owner, second, third, ownerClient, secondClient, thirdClient, startView };
}

beforeEach(async () => {
  now = 1_000;
  clients = [];
  app = await buildServer({
    logger: false,
    now: () => now,
    tickIntervalMs: 10,
    messageRateLimit: 100,
    messageRateWindowMs: 1_000,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
});

afterEach(async () => {
  for (const client of clients) await client.close();
  await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('存钱罐在线对局', () => {
  it('三位真实客户端完成一局存钱罐，砸罐选择只发给本人', async () => {
    const { owner, second, third, ownerClient, secondClient, thirdClient, startView: start } = await threePlayerPiggyParty();

    expect(start).toMatchObject({ phase: 'choosing', round: 1, pot: 3, roundsRange: [3, 5] });
    expect(start).not.toHaveProperty('finalRound');
    expect(start).not.toHaveProperty('choices');

    ownerClient.send({ type: 'game-action', actionId: 'pb-smash-00001', action: { type: 'choose', choice: 'smash' } });
    const peeked = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.submittedPlayerIds.includes(owner.playerId) === true);
    const peekedGame = gameOf(peeked);
    expect(peekedGame?.ownChoice).toBeNull();
    expect(peekedGame).not.toHaveProperty('finalRound');
    expect(peekedGame).not.toHaveProperty('choices');

    // 揭晓前反悔改守护，线上同样生效。
    ownerClient.send({ type: 'game-action', actionId: 'pb-switch-0001', action: { type: 'choose', choice: 'guard' } });
    secondClient.send({ type: 'game-action', actionId: 'pb-guard-00001', action: { type: 'choose', choice: 'guard' } });
    thirdClient.send({ type: 'game-action', actionId: 'pb-guard-00002', action: { type: 'choose', choice: 'guard' } });
    const reveal = await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'reveal');
    expect(gameOf(reveal)?.lastRound).toMatchObject({ round: 1, smashers: [], potBefore: 3, potAfter: 3 });

    // 服务端自动推进直到随机落幕：事件随机，断言只看流程与终局结构。
    let guardIndex = 0;
    let phase: PiggyBankView['phase'] = 'reveal';
    for (let attempt = 0; phase !== 'finished'; attempt += 1) {
      expect(attempt).toBeLessThan(12);
      if (phase === 'reveal') {
        ownerClient.clear();
        now += 38_000;
        const next = await ownerClient.waitForMessage((message) =>
          message.type === 'room' && (gameOf(message)?.phase === 'choosing' || gameOf(message)?.phase === 'finished'));
        phase = gameOf(next)!.phase;
        continue;
      }
      for (const client of [ownerClient, secondClient, thirdClient]) {
        client.clear();
        client.send({ type: 'game-action', actionId: `pb-keep-${guardIndex += 1}`, action: { type: 'choose', choice: 'guard' } });
      }
      await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'reveal');
      phase = 'reveal';
    }

    const finished = gameOf(ownerClient.messages.at(-1))!;
    expect(finished.phase).toBe('finished');
    expect(finished.winners.length).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(finished)).not.toContain('finalRound');

    ownerClient.send({ type: 'game-action', actionId: 'pb-again-00001', action: { type: 'play-again' } });
    const fresh = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.phase === 'choosing' && gameOf(message)?.round === 1);
    expect(gameOf(fresh)?.coins).toEqual({ [owner.playerId]: 0, [second.playerId]: 0, [third.playerId]: 0 });
  });

  it('相同操作重发保持幂等，相同操作号换内容会被拒绝', async () => {
    const { ownerClient, secondClient } = await threePlayerPiggyParty();
    const message = {
      type: 'game-action',
      actionId: 'pb-idem-000001',
      action: { type: 'choose', choice: 'smash' },
    } as const;
    ownerClient.send(message);
    const firstAck = await ownerClient.waitFor('action-ack');

    ownerClient.send(message);
    const duplicateAck = await ownerClient.waitForMessage((candidate) =>
      candidate.type === 'action-ack' && candidate.actionId === message.actionId && candidate !== firstAck);
    expect(duplicateAck).toMatchObject({ version: firstAck.version });

    ownerClient.send({ ...message, action: { type: 'choose', choice: 'guard' } });
    const conflict = await ownerClient.waitFor('error');
    expect(conflict).toMatchObject({ code: 'ACTION_CONFLICT', actionId: message.actionId });
    expect(secondClient.messages.some((candidate) => candidate.type === 'error')).toBe(false);
  });

  it('到点未提交的玩家会被服务端视为守护，轮次照常推进', async () => {
    const { ownerClient } = await threePlayerPiggyParty();
    now += 30_000;
    const reveal = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.phase === 'reveal');
    expect(gameOf(reveal)?.lastRound).toMatchObject({ smashers: [], potBefore: 3, potAfter: 3 });
  });

  it('不支持的轮数会被拒绝，连接不受影响', async () => {
    const owner = await createRoom();
    await joinRoom(owner.roomCode, '第二位');
    await joinRoom(owner.roomCode, '第三位');
    const ownerClient = await connect(owner);
    ownerClient.send({ type: 'start-game', actionId: 'pb-bad-rounds-01', gameId: 'piggy-bank', rounds: 5 });
    expect((await ownerClient.waitFor('error')).code).toBe('INVALID_ROUNDS');
    ownerClient.send({ type: 'ping' });
    expect((await ownerClient.waitFor('pong')).type).toBe('pong');
  });
});

describe('存钱罐服务重启恢复', () => {
  it('中局重启后罐子、锤子、金币原样恢复，保密的落幕轮继续生效', async () => {
    directory = await mkdtemp(join(tmpdir(), 'party-piggy-'));
    dataFile = join(directory, 'party.json');
    await app.close();
    app = await buildServer({ logger: false, now: () => now, random: () => 0.1, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000, dataFile });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
    baseUrl = `http://127.0.0.1:${address.port}`;
    socketUrl = `ws://127.0.0.1:${address.port}/ws`;

    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '第二位');
    const third = await joinRoom(owner.roomCode, '第三位');
    const ownerClient = await connect(owner);
    const secondClient = await connect(second);
    const thirdClient = await connect(third);
    ownerClient.send({ type: 'start-game', actionId: 'pb-restart-0001', gameId: 'piggy-bank', rounds: 4 });
    await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'choosing');
    ownerClient.send({ type: 'game-action', actionId: 'pb-restart-0002', action: { type: 'choose', choice: 'smash' } });
    secondClient.send({ type: 'game-action', actionId: 'pb-restart-0003', action: { type: 'choose', choice: 'guard' } });
    thirdClient.send({ type: 'game-action', actionId: 'pb-restart-0004', action: { type: 'choose', choice: 'guard' } });
    await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'reveal');
    now += 38_000;
    await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.round === 2);

    await app.close();
    now += 5_000;
    app = await buildServer({ logger: false, now: () => now, random: () => 0.1, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000, dataFile });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const restarted = app.server.address();
    if (!restarted || typeof restarted === 'string') throw new Error('测试服务没有监听端口');
    baseUrl = `http://127.0.0.1:${restarted.port}`;
    socketUrl = `ws://127.0.0.1:${restarted.port}/ws`;

    const restored = await connect(second);
    const ready = restored.messages.find((message) => message.type === 'ready');
    if (ready?.type !== 'ready') throw new Error('重启后没有收到 ready 消息');
    const readyGame = ready.session.room.game as PiggyBankView;
    expect(readyGame).toMatchObject({ phase: 'choosing', round: 2, pot: 3 });
    expect(readyGame.coins[owner.playerId]).toBe(3);
    expect(readyGame.coins[second.playerId]).toBe(1);
    expect(readyGame.hammers[owner.playerId]).toBe(1);
    expect(readyGame).not.toHaveProperty('finalRound');
    expect(JSON.stringify(readyGame)).not.toContain('finalRound');

    // 恢复后可以直接继续玩：三人守护，照常进入揭晓。
    restored.send({ type: 'game-action', actionId: 'pb-resume-0001', action: { type: 'choose', choice: 'guard' } });
    const after = await restored.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.submittedPlayerIds.includes(second.playerId) === true);
    expect(gameOf(after)?.phase).toBe('choosing');
  });
});
