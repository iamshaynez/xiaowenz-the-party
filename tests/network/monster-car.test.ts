import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Session } from '@party/protocol';
import { COUNTDOWN_DURATION_MS, RACE_DURATION_MS } from '@party/games';
import type { MonsterCarBuild, MonsterCarView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

const OWNER_BUILD: MonsterCarBuild = {
  wheels: 'spring',
  front: 'duck',
  rear: 'rocket',
  roof: 'umbrella',
  driver: 'frog',
};
const SECOND_BUILD: MonsterCarBuild = {
  wheels: 'balloon',
  front: 'train',
  rear: 'tail',
  roof: 'antenna',
  driver: 'alien',
};

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];
let directory = '';

function gameOf(message: unknown): MonsterCarView | null {
  const room = (message as { room?: { game: MonsterCarView | null } }).room;
  return room?.game ?? null;
}

function readyGame(client: PartyTestClient): MonsterCarView {
  const ready = client.messages.find((message) => message.type === 'ready');
  if (ready?.type !== 'ready' || ready.session.room.game?.id !== 'monster-car') {
    throw new Error('连接恢复后没有收到怪兽汽车视图');
  }
  return ready.session.room.game as MonsterCarView;
}

async function listen(persistence?: { dataFile: string; random: () => number }) {
  app = await buildServer({
    logger: false,
    now: () => now,
    tickIntervalMs: 10,
    messageRateLimit: 100,
    messageRateWindowMs: 1_000,
    ...(persistence ? { dataFile: persistence.dataFile, random: persistence.random } : {}),
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
}

async function request<T>(path: string, init?: RequestInit, expectedStatus = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as T & { message?: string };
  if (response.status !== expectedStatus) {
    throw new Error(`请求 ${path} 预期 ${expectedStatus}，实际 ${response.status}：${JSON.stringify(body)}`);
  }
  return body;
}

async function createRoom() {
  return request<Session>('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname: '房主', avatar: '🦊' }),
  }, 201);
}

async function joinRoom(code: string, nickname = '第二位') {
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

async function waitForPhase(client: PartyTestClient, phase: MonsterCarView['phase']) {
  const message = await client.waitForMessage((candidate) => candidate.type === 'room' && gameOf(candidate)?.phase === phase);
  const game = gameOf(message);
  if (!game) throw new Error(`缺少 ${phase} 阶段视图`);
  return game;
}

async function twoPlayerParty() {
  const owner = await createRoom();
  const second = await joinRoom(owner.roomCode);
  const ownerClient = await connect(owner);
  const secondClient = await connect(second);
  ownerClient.send({ type: 'start-game', actionId: 'mc-start-000001', gameId: 'monster-car', rounds: 1 });
  const initial = await waitForPhase(ownerClient, 'building');
  await waitForPhase(secondClient, 'building');
  ownerClient.clear();
  secondClient.clear();
  return { owner, second, ownerClient, secondClient, initial };
}

function buildCar(actionId: string, build: MonsterCarBuild) {
  return { type: 'game-action', actionId, action: { type: 'build-car', build } } as const;
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

beforeEach(async () => {
  now = 1_000;
  clients = [];
  directory = '';
  await listen();
});

afterEach(async () => {
  for (const client of clients) await client.close();
  if (app.server.listening) await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('怪兽汽车真实网络对局', () => {
  it('两位客户端装车后同时收到公开赛事计划，竞演不逐帧广播且最终名次一致', async () => {
    const { owner, second, ownerClient, secondClient, initial } = await twoPlayerParty();

    ownerClient.send(buildCar('mc-full-owner-01', OWNER_BUILD));
    const readyMessage = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.readyPlayerIds.includes(owner.playerId) === true);
    expect(gameOf(readyMessage)).toMatchObject({ phase: 'building', readyPlayerIds: [owner.playerId] });
    expect(gameOf(readyMessage)?.builds[owner.playerId]).toEqual(OWNER_BUILD);

    secondClient.send(buildCar('mc-full-second-1', SECOND_BUILD));
    const [ownerCountdown, secondCountdown] = await Promise.all([
      waitForPhase(ownerClient, 'countdown'),
      waitForPhase(secondClient, 'countdown'),
    ]);
    expect(ownerCountdown.readyPlayerIds).toEqual([owner.playerId, second.playerId]);
    expect(ownerCountdown.builds).toEqual({ [owner.playerId]: OWNER_BUILD, [second.playerId]: SECOND_BUILD });
    expect(ownerCountdown.plan).not.toBeNull();
    expect(secondCountdown.plan).toEqual(ownerCountdown.plan);
    expect(secondCountdown.builds).toEqual(ownerCountdown.builds);

    const raceStartsAt = ownerCountdown.raceStartsAt;
    const raceEndsAt = ownerCountdown.raceEndsAt;
    if (raceStartsAt === null || raceEndsAt === null) throw new Error('倒计时缺少赛事时间边界');
    expect(raceStartsAt).toBe(now + COUNTDOWN_DURATION_MS);
    expect(raceEndsAt - raceStartsAt).toBe(RACE_DURATION_MS);
    expect(ownerCountdown.plan?.durationMs).toBe(RACE_DURATION_MS);

    ownerClient.clear();
    secondClient.clear();
    now = raceStartsAt;
    const [ownerRacing, secondRacing] = await Promise.all([
      waitForPhase(ownerClient, 'racing'),
      waitForPhase(secondClient, 'racing'),
    ]);
    expect(ownerRacing.standings).toEqual([]);
    expect(ownerRacing.plan).toEqual(ownerCountdown.plan);
    expect(secondRacing.plan).toEqual(ownerCountdown.plan);

    // 服务端tick继续进行，但静态赛事计划不应产生逐帧房间快照。
    ownerClient.clear();
    secondClient.clear();
    now = raceStartsAt + 10_000;
    await delay(80);
    ownerClient.send({ type: 'ping' });
    secondClient.send({ type: 'ping' });
    await Promise.all([ownerClient.waitFor('pong'), secondClient.waitFor('pong')]);
    expect(ownerClient.messages.filter((message) => message.type === 'room')).toEqual([]);
    expect(secondClient.messages.filter((message) => message.type === 'room')).toEqual([]);

    now = raceEndsAt;
    const [ownerFinished, secondFinished] = await Promise.all([
      waitForPhase(ownerClient, 'finished'),
      waitForPhase(secondClient, 'finished'),
    ]);
    const plan = ownerFinished.plan;
    if (!plan) throw new Error('终局缺少赛事计划');
    const expectedStandings = plan.finishOrder.map((playerId, index) => {
      const racer = plan.racers.find((entry) => entry.playerId === playerId);
      if (!racer) throw new Error(`赛事缺少玩家 ${playerId}`);
      return { playerId, place: index + 1, finishAtMs: racer.finishAtMs, highlight: racer.highlight };
    });
    expect(ownerFinished.standings).toEqual(expectedStandings);
    expect(secondFinished.standings).toEqual(expectedStandings);
    expect(secondFinished.plan).toEqual(plan);

    ownerClient.clear();
    secondClient.clear();
    ownerClient.send({ type: 'game-action', actionId: 'mc-full-again-01', action: { type: 'play-again' } });
    const [ownerFresh, secondFresh] = await Promise.all([
      waitForPhase(ownerClient, 'building'),
      waitForPhase(secondClient, 'building'),
    ]);
    expect(ownerFresh).toMatchObject({ readyPlayerIds: [], plan: null, standings: [], raceStartsAt: null, raceEndsAt: null });
    expect(ownerFresh.builds).toEqual(initial.builds);
    expect(secondFresh).toEqual(ownerFresh);
  });

  it('四位真实客户端共享同一条道路、四辆不同槽位的车和一致赛事计划', async () => {
    const owner = await createRoom();
    const sessions = [owner, await joinRoom(owner.roomCode, '第二位'), await joinRoom(owner.roomCode, '第三位'), await joinRoom(owner.roomCode, '第四位')];
    const connections = [];
    for (const session of sessions) connections.push(await connect(session));
    const ownerClient = connections[0]!;
    ownerClient.send({ type: 'start-game', actionId: 'mc-four-start-1', gameId: 'monster-car', rounds: 1 });
    await Promise.all(connections.map((client) => waitForPhase(client, 'building')));

    connections.forEach((client, index) => {
      const build = index % 2 === 0 ? OWNER_BUILD : SECOND_BUILD;
      client.send(buildCar(`mc-four-build-${index}`, build));
    });
    const plans = await Promise.all(connections.map((client) => waitForPhase(client, 'countdown')));
    for (const game of plans) {
      expect(game.plan).toEqual(plans[0]!.plan);
      expect(game.plan?.racers).toHaveLength(4);
      expect(game.plan?.racers.map((racer) => racer.playerId).sort()).toEqual(sessions.map((session) => session.playerId).sort());
      expect(new Set(game.plan?.racers.map((racer) => racer.lane)).size).toBe(4);
      expect(game.plan?.events).toEqual(plans[0]!.plan?.events);
    }
  });

  it('malformed JSON、缺件和非法零件都在协议边界拒绝，连接与装车状态保持可用', async () => {
    const { owner, ownerClient, secondClient } = await twoPlayerParty();

    ownerClient.sendRaw('{not-json');
    expect((await ownerClient.waitForError('INVALID_MESSAGE')).code).toBe('INVALID_MESSAGE');

    const invalidBuilds = [
      {
        actionId: 'mc-missing-0001',
        build: { wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom' },
      },
      {
        actionId: 'mc-part-000001',
        build: { ...OWNER_BUILD, wheels: 'hover' },
      },
      {
        actionId: 'mc-extra-000001',
        build: { ...OWNER_BUILD, spoiler: 'rocket' },
      },
    ];
    for (const invalid of invalidBuilds) {
      ownerClient.clear();
      ownerClient.sendRaw(JSON.stringify({
        type: 'game-action',
        actionId: invalid.actionId,
        action: { type: 'build-car', build: invalid.build },
      }));
      expect((await ownerClient.waitForError('INVALID_MESSAGE')).code).toBe('INVALID_MESSAGE');
    }

    ownerClient.send({ type: 'ping' });
    expect((await ownerClient.waitFor('pong')).type).toBe('pong');
    expect(ownerClient.socket.readyState).toBe(ownerClient.socket.OPEN);
    expect(secondClient.messages.filter((message) => message.type === 'room')).toEqual([]);

    ownerClient.send(buildCar('mc-valid-after-1', OWNER_BUILD));
    const accepted = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.readyPlayerIds.includes(owner.playerId) === true);
    expect(gameOf(accepted)?.readyPlayerIds).toEqual([owner.playerId]);
    expect(gameOf(accepted)?.builds[owner.playerId]).toEqual(OWNER_BUILD);
  });

  it('重复装车动作返回原确认且不重复广播，同操作号换零件会冲突', async () => {
    const { owner, secondClient, ownerClient } = await twoPlayerParty();
    const message = buildCar('mc-idempotent-01', OWNER_BUILD);
    ownerClient.send(message);
    const firstAck = await ownerClient.waitFor('action-ack');
    await secondClient.waitForMessage((candidate) =>
      candidate.type === 'room' && gameOf(candidate)?.readyPlayerIds.includes(owner.playerId) === true);
    secondClient.clear();

    ownerClient.send(message);
    const duplicateAck = await ownerClient.waitForMessage((candidate) =>
      candidate.type === 'action-ack' && candidate.actionId === message.actionId && candidate !== firstAck);
    expect(duplicateAck).toMatchObject({ version: firstAck.version });
    await delay(40);
    expect(secondClient.messages.filter((candidate) => candidate.type === 'room')).toEqual([]);

    ownerClient.send(buildCar(message.actionId, SECOND_BUILD));
    const conflict = await ownerClient.waitFor('error');
    expect(conflict).toMatchObject({ code: 'ACTION_CONFLICT', actionId: message.actionId });
    expect(secondClient.messages.some((candidate) => candidate.type === 'error')).toBe(false);

    secondClient.send(buildCar('mc-idem-second-1', SECOND_BUILD));
    const countdown = await waitForPhase(secondClient, 'countdown');
    expect(countdown.builds[owner.playerId]).toEqual(OWNER_BUILD);
  });
});

describe('怪兽汽车服务重启恢复', () => {
  it('竞演中重启保留车辆、时间边界和原计划，不因新的随机源重掷赛事', async () => {
    directory = await mkdtemp(join(tmpdir(), 'party-monster-car-'));
    const dataFile = join(directory, 'party.json');
    await app.close();
    await listen({ dataFile, random: () => 0.42 });

    const { owner, second, ownerClient, secondClient } = await twoPlayerParty();
    ownerClient.send(buildCar('mc-restart-owner', OWNER_BUILD));
    secondClient.send(buildCar('mc-restart-second', SECOND_BUILD));
    const countdown = await waitForPhase(ownerClient, 'countdown');
    await waitForPhase(secondClient, 'countdown');
    if (countdown.raceStartsAt === null || countdown.raceEndsAt === null) {
      throw new Error('重启测试缺少赛事时间边界');
    }

    now = countdown.raceStartsAt;
    const before = await waitForPhase(ownerClient, 'racing');
    await waitForPhase(secondClient, 'racing');
    if (!before.plan) throw new Error('重启前缺少赛事计划');
    const planBeforeRestart = before.plan;

    await ownerClient.close();
    await secondClient.close();
    clients = [];
    await app.close();
    now += 5_000;
    await listen({ dataFile, random: () => 0.93 });

    const restoredOwner = await connect(owner);
    const restoredSecond = await connect(second);
    const ownerGame = readyGame(restoredOwner);
    const secondGame = readyGame(restoredSecond);
    expect(ownerGame).toEqual(before);
    expect(secondGame).toEqual(before);
    expect(ownerGame.phase).toBe('racing');
    expect(ownerGame.plan?.id).toBe(planBeforeRestart.id);
    expect(ownerGame.plan?.seed).toBe(planBeforeRestart.seed);
    expect(ownerGame.plan?.finishOrder).toEqual(planBeforeRestart.finishOrder);

    restoredOwner.clear();
    restoredSecond.clear();
    now = countdown.raceEndsAt;
    const [ownerFinished, secondFinished] = await Promise.all([
      waitForPhase(restoredOwner, 'finished'),
      waitForPhase(restoredSecond, 'finished'),
    ]);
    expect(ownerFinished.plan).toEqual(planBeforeRestart);
    expect(ownerFinished.standings.map((entry) => entry.playerId)).toEqual(planBeforeRestart.finishOrder);
    expect(secondFinished.standings).toEqual(ownerFinished.standings);
  });
});
