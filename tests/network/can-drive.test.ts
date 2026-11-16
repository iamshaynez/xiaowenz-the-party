import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Session } from '@party/protocol';
import type { CanDriveView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];
let directory = '';

function gameOf(message: unknown): CanDriveView | null {
  const room = (message as { room?: { game: CanDriveView | null } }).room;
  return room?.game ?? null;
}

async function request<T>(path: string, init?: RequestInit, expectedStatus = 200): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json() as T & { message?: string };
  if (response.status !== expectedStatus) throw new Error(`${path} 预期 ${expectedStatus}，实际 ${response.status}：${JSON.stringify(body)}`);
  return body;
}

async function createRoom() {
  return request<Session>('/api/rooms', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '房主', avatar: '🦊' }),
  }, 201);
}

async function joinRoom(code: string) {
  return request<Session>(`/api/rooms/${code}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '第二位', avatar: '🐼' }),
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

async function listen() {
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
}

async function twoPlayerParty(dataFile?: string) {
  const owner = await createRoom();
  const second = await joinRoom(owner.roomCode);
  const ownerClient = await connect(owner);
  const secondClient = await connect(second);
  ownerClient.send({ type: 'start-game', actionId: 'car-start-0001', gameId: 'can-drive', rounds: 1 });
  for (const client of [ownerClient, secondClient]) {
    await client.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'building');
  }
  for (const client of [ownerClient, secondClient]) client.clear();
  return { owner, second, ownerClient, secondClient, dataFile };
}

beforeEach(async () => {
  now = 1_000;
  clients = [];
  directory = '';
  app = await buildServer({ logger: false, now: () => now, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000 });
  await listen();
});

afterEach(async () => {
  for (const client of clients) await client.close();
  if (app?.server.listening) await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('「这车能开？」真实双客户端对局', () => {
  it('私密选件、幂等、自动逐车展示、断线恢复和重开都经过真实端口', async () => {
    const { owner, ownerClient, secondClient } = await twoPlayerParty();
    const select = {
      type: 'game-action', actionId: 'car-select-001', action: { type: 'select-car-part', slot: 'driver', partId: 'robot' },
    } as const;
    ownerClient.send(select);
    const firstAck = await ownerClient.waitFor('action-ack');
    ownerClient.send(select);
    const duplicateAck = await ownerClient.waitForMessage((message) =>
      message.type === 'action-ack' && message.actionId === select.actionId && message !== firstAck);
    expect(duplicateAck).toMatchObject({ version: firstAck.version });

    ownerClient.send({ ...select, action: { type: 'select-car-part', slot: 'driver', partId: 'banana' } });
    expect((await ownerClient.waitFor('error')).code).toBe('ACTION_CONFLICT');

    ownerClient.send({ type: 'game-action', actionId: 'car-ready-0001', action: { type: 'submit-car' } });
    const ready = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.readyPlayerIds.includes(owner.playerId) === true);
    expect(JSON.stringify(gameOf(ready))).not.toContain('robot');

    secondClient.send({ type: 'game-action', actionId: 'car-ready-0002', action: { type: 'submit-car' } });
    const firstShow = await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.current?.kind === 'test');
    expect(gameOf(firstShow)?.current).toMatchObject({ index: 0 });
    expect(gameOf(firstShow)?.current?.show.durationMs).toBe(40_000);
    expect(gameOf(firstShow)?.current?.show.build.driver).toBe('robot');
    expect(JSON.stringify(gameOf(firstShow))).not.toContain('showPlans');

    now += 40_000;
    const secondShow = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.current?.kind === 'test' && gameOf(message)?.current?.index === 1);
    expect(gameOf(secondShow)?.current?.playerId).not.toBe(owner.playerId);

    await ownerClient.close();
    now += 40_000;
    const firstAward = await secondClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.current?.kind === 'award');
    expect(gameOf(firstAward)?.current).toMatchObject({ index: 0 });
    expect(gameOf(firstAward)?.awards).toHaveLength(1);

    const reconnected = await connect(owner);
    const restored = reconnected.messages.find((message) => message.type === 'ready');
    if (restored?.type !== 'ready') throw new Error('断线恢复没有 ready');
    expect((restored.session.room.game as CanDriveView).current).toMatchObject({ kind: 'award', index: 0 });

    now += 7_000;
    await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.current?.kind === 'award' && gameOf(message)?.current?.index === 1);
    now += 7_000;
    const finished = await secondClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'finished');
    expect(gameOf(finished)?.finalCars).toHaveLength(2);
    if (finished.type !== 'room') throw new Error('终局没有收到房间消息');
    expect(finished.room.phase).toBe('finished');

    reconnected.send({ type: 'game-action', actionId: 'car-again-0001', action: { type: 'play-again' } });
    const fresh = await secondClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.phase === 'building' && gameOf(message)?.round === 2);
    if (fresh.type !== 'room') throw new Error('重开后没有收到房间消息');
    expect(fresh.room.phase).toBe('playing');
    expect(gameOf(fresh)?.ownBuild?.motion).toBe('square-wheels');
  });

  it('服务重启后保持同一车辆、展示计划和颁奖进度', async () => {
    directory = await mkdtemp(join(tmpdir(), 'party-car-'));
    const dataFile = join(directory, 'party.json');
    await app.close();
    app = await buildServer({ logger: false, now: () => now, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000, dataFile });
    await listen();

    const { second, ownerClient, secondClient } = await twoPlayerParty(dataFile);
    ownerClient.send({ type: 'game-action', actionId: 'car-ready-0001', action: { type: 'submit-car' } });
    secondClient.send({ type: 'game-action', actionId: 'car-ready-0002', action: { type: 'submit-car' } });
    await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.current?.kind === 'test');
    now += 40_000;
    const before = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && gameOf(message)?.current?.kind === 'test' && gameOf(message)?.current?.index === 1);
    const beforeShow = gameOf(before)?.current?.show;

    await app.close();
    now += 48_000;
    app = await buildServer({ logger: false, now: () => now, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000, dataFile });
    await listen();

    const restored = await connect(second);
    const ready = restored.messages.find((message) => message.type === 'ready');
    if (ready?.type !== 'ready') throw new Error('重启后没有 ready');
    const game = ready.session.room.game as CanDriveView;
    expect(game.current).toMatchObject({ kind: 'award', index: 1 });
    expect(game.current?.show).toEqual(beforeShow);
    expect(game.awards).toHaveLength(2);
  });
});
