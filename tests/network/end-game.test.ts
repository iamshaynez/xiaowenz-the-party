import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Session } from '@party/protocol';
import type { MostLikelyView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];
let directory = '';
let dataFile = '';

function gameOf(message: unknown): MostLikelyView | null {
  const room = (message as { room?: { game: MostLikelyView | null } }).room;
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

// 三名真实客户端把「谁最可能」三轮打到 finished，随后清空各自消息队列。
async function finishedParty() {
  const owner = await createRoom();
  const second = await joinRoom(owner.roomCode, '第二位');
  const third = await joinRoom(owner.roomCode, '第三位');
  const ownerClient = await connect(owner);
  const secondClient = await connect(second);
  const thirdClient = await connect(third);

  ownerClient.send({ type: 'start-game', actionId: 'end-flow-start-01', gameId: 'most-likely', rounds: 3 });
  for (const client of [ownerClient, secondClient, thirdClient]) {
    await client.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'voting');
  }
  for (const client of [ownerClient, secondClient, thirdClient]) client.clear();
  for (let round = 1; round <= 3; round += 1) {
    ownerClient.send({ type: 'game-action', actionId: `end-flow-vote-o-${round}`, action: { type: 'cast-vote', targetId: second.playerId } });
    secondClient.send({ type: 'game-action', actionId: `end-flow-vote-s-${round}`, action: { type: 'cast-vote', targetId: third.playerId } });
    thirdClient.send({ type: 'game-action', actionId: `end-flow-vote-t-${round}`, action: { type: 'cast-vote', targetId: owner.playerId } });
    await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'results' && gameOf(message)?.round === round);
    ownerClient.clear();
    if (round < 3) {
      ownerClient.send({ type: 'game-action', actionId: `end-flow-next-${round}`, action: { type: 'next-round' } });
      await ownerClient.waitForMessage((message) => message.type === 'room' && gameOf(message)?.phase === 'voting' && gameOf(message)?.round === round + 1);
      ownerClient.clear();
    }
  }
  ownerClient.send({ type: 'game-action', actionId: 'end-flow-finish-1', action: { type: 'next-round' } });
  for (const client of [ownerClient, secondClient, thirdClient]) {
    await client.waitForMessage((message) => message.type === 'room' && message.room.phase === 'finished');
  }
  for (const client of [ownerClient, secondClient, thirdClient]) client.clear();
  return { owner, second, third, ownerClient, secondClient, thirdClient };
}

async function restartServer() {
  await app.close();
  app = await buildServer({ logger: false, now: () => now, tickIntervalMs: 10, messageRateLimit: 100, messageRateWindowMs: 1_000, dataFile });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
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
  if (app?.server.listening) await app.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('结束本局回大厅（真实 WebSocket）', () => {
  it('结算后房主结束本局，所有客户端回到大厅，游戏中加入的旁观者转回参与者', async () => {
    const { owner, ownerClient, secondClient, thirdClient } = await finishedParty();
    const late = await joinRoom(owner.roomCode, '迟到者');
    const lateClient = await connect(late);
    await lateClient.waitForMessage((message) =>
      message.type === 'room' && message.room.players.find((player) => player.id === late.playerId)?.role === 'spectator');

    ownerClient.send({ type: 'end-game', actionId: 'end-game-0001' });
    await ownerClient.waitFor('action-ack');
    for (const client of [ownerClient, secondClient, thirdClient, lateClient]) {
      const lobby = await client.waitForMessage((message) =>
        message.type === 'room' && message.room.game === null && message.room.phase === 'lobby');
      expect(lobby.type).toBe('room');
      if (lobby.type === 'room') {
        expect(lobby.room.players.every((person) => person.role === 'player')).toBe(true);
      }
    }
  });

  it('非房主结束本局会被服务端拒绝，房间状态不被破坏', async () => {
    const { ownerClient, secondClient } = await finishedParty();
    secondClient.send({ type: 'end-game', actionId: 'not-owner-end-001' });
    const error = await secondClient.waitForError('OWNER_ONLY');
    expect(error.actionId).toBe('not-owner-end-001');
    ownerClient.send({ type: 'ping' });
    expect((await ownerClient.waitFor('pong')).type).toBe('pong');
  });

  it('end-game 重发同一动作号幂等，不会向其他人重复广播房间状态', async () => {
    const { ownerClient, secondClient } = await finishedParty();
    const message = { type: 'end-game', actionId: 'idempotent-end-001' } as const;
    ownerClient.send(message);
    const firstAck = await ownerClient.waitFor('action-ack');

    ownerClient.send(message);
    const duplicateAck = await ownerClient.waitForMessage((candidate) =>
      candidate.type === 'action-ack' && candidate.actionId === message.actionId && candidate !== firstAck);
    expect(duplicateAck).toMatchObject({ version: firstAck.version });

    secondClient.clear();
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(secondClient.messages.filter((candidate) => candidate.type === 'room')).toHaveLength(0);
  });

  it('回大厅后换游戏重新开局，重启服务后房间状态被原样恢复', async () => {
    directory = await mkdtemp(join(tmpdir(), 'party-endgame-'));
    dataFile = join(directory, 'party.json');
    await restartServer();

    const { owner, ownerClient, secondClient, thirdClient } = await finishedParty();
    ownerClient.send({ type: 'end-game', actionId: 'restart-end-0001' });
    for (const client of [ownerClient, secondClient, thirdClient]) {
      await client.waitForMessage((message) => message.type === 'room' && message.room.game === null && message.room.phase === 'lobby');
    }

    ownerClient.send({ type: 'start-game', actionId: 'restart-start-01', gameId: 'piggy-bank', rounds: 4 });
    const switched = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && (message.room.game as { id?: string } | null)?.id === 'piggy-bank');
    expect(switched.type).toBe('room');

    await new Promise((resolve) => setTimeout(resolve, 60));
    await restartServer();
    const restoredOwner = await connect(owner);
    const ready = restoredOwner.messages.find((message) => message.type === 'ready');
    expect(ready?.type).toBe('ready');
    if (ready?.type === 'ready') {
      expect(ready.session.room).toMatchObject({ phase: 'playing' });
      expect((ready.session.room.game as { id?: string } | null)?.id).toBe('piggy-bank');
    }
  });
});
