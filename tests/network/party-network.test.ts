import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Session } from '@party/protocol';
import type { MostLikelyView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];

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

async function threePlayerParty() {
  const owner = await createRoom();
  const second = await joinRoom(owner.roomCode, '第二位');
  const third = await joinRoom(owner.roomCode, '第三位');
  const ownerClient = await connect(owner);
  const secondClient = await connect(second);
  const thirdClient = await connect(third);
  ownerClient.send({ type: 'start-game', actionId: 'start-game-0001', gameId: 'most-likely', rounds: 3 });
  for (const client of [ownerClient, secondClient, thirdClient]) {
    await client.waitForMessage((message) => message.type === 'room' && (message.room.game as MostLikelyView | null)?.phase === 'voting');
  }
  for (const client of [ownerClient, secondClient, thirdClient]) client.clear();
  return { owner, second, third, ownerClient, secondClient, thirdClient };
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
});

describe('公网房间 HTTP 与 WebSocket', () => {
  it('朋友通过接口建房加入，健康检查不泄露房间或玩家信息', async () => {
    const owner = await createRoom();
    expect(owner.roomCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    expect(owner.resumeToken.length).toBeGreaterThan(20);
    const friend = await joinRoom(owner.roomCode, '朋友');
    expect(friend.playerId).not.toBe(owner.playerId);
    expect(friend.room.players).toHaveLength(2);

    const health = await request<Record<string, unknown>>('/api/health');
    expect(health).toMatchObject({ status: 'ok', activeRooms: 1 });
    expect(JSON.stringify(health)).not.toContain(owner.roomCode);
    expect(JSON.stringify(health)).not.toContain('朋友');

    const missing = await request<{ code: string }>('/api/rooms/NOTFND/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nickname: '陌生人', avatar: '🐼' }),
    }, 404);
    expect(missing.code).toBe('ROOM_NOT_FOUND');
  });

  it('三位真实客户端完成一局投票，私密选择只发给本人', async () => {
    const { owner, second, third, ownerClient, secondClient, thirdClient } = await threePlayerParty();

    ownerClient.send({ type: 'game-action', actionId: 'vote-owner-0001', action: { type: 'cast-vote', targetId: second.playerId } });
    const secondView = await secondClient.waitForMessage((message) =>
      message.type === 'room' && (message.room.game as MostLikelyView | null)?.submittedPlayerIds.includes(owner.playerId) === true);
    expect(secondView.type).toBe('room');
    if (secondView.type === 'room') {
      const game = secondView.room.game as MostLikelyView;
      expect(game.ownVote).toBeNull();
      expect(game.results).toBeNull();
      expect(game).not.toHaveProperty('votes');
    }

    secondClient.send({ type: 'game-action', actionId: 'vote-second-001', action: { type: 'cast-vote', targetId: owner.playerId } });
    thirdClient.send({ type: 'game-action', actionId: 'vote-third-0001', action: { type: 'cast-vote', targetId: second.playerId } });
    const result = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && (message.room.game as MostLikelyView | null)?.phase === 'results');
    expect(result.type).toBe('room');
    if (result.type === 'room') {
      const game = result.room.game as MostLikelyView;
      expect(game.results?.winners).toEqual([second.playerId]);
      expect(game.scores[second.playerId]).toBe(1);
    }
    expect(thirdClient.socket.readyState).toBe(thirdClient.socket.OPEN);
  });

  it('相同操作重发保持幂等，相同操作号换内容会被拒绝', async () => {
    const { owner, second, ownerClient, thirdClient } = await threePlayerParty();
    const message = {
      type: 'game-action',
      actionId: 'idempotent-vote-001',
      action: { type: 'cast-vote', targetId: second.playerId },
    } as const;
    ownerClient.send(message);
    const firstAck = await ownerClient.waitFor('action-ack');

    ownerClient.send(message);
    const duplicateAck = await ownerClient.waitForMessage((candidate) =>
      candidate.type === 'action-ack' && candidate.actionId === message.actionId && candidate !== firstAck);
    expect(duplicateAck).toMatchObject({ version: firstAck.version });

    ownerClient.send({ ...message, action: { type: 'cast-vote', targetId: owner.playerId } });
    const conflict = await ownerClient.waitFor('error');
    expect(conflict).toMatchObject({ code: 'ACTION_CONFLICT', actionId: message.actionId });
    expect(thirdClient.messages.some((candidate) => candidate.type === 'error')).toBe(false);
  });

  it('坏消息和未鉴权操作不会冲垮连接，错误恢复令牌不能冒名顶替', async () => {
    const owner = await createRoom();
    const unauthenticated = await PartyTestClient.connect(socketUrl);
    clients.push(unauthenticated);
    unauthenticated.send({ type: 'ping' });
    expect((await unauthenticated.waitFor('error')).code).toBe('AUTH_REQUIRED');
    unauthenticated.sendRaw('{not-json');
    expect((await unauthenticated.waitForError('INVALID_MESSAGE')).code).toBe('INVALID_MESSAGE');

    unauthenticated.send({ type: 'authenticate', sessionId: owner.sessionId, resumeToken: 'x'.repeat(30) });
    expect((await unauthenticated.waitForError('AUTH_FAILED')).code).toBe('AUTH_FAILED');

    const ownerClient = await connect(owner);
    ownerClient.sendRaw(JSON.stringify({ type: 'start-game', actionId: 'bad-start-0001' }));
    expect((await ownerClient.waitFor('error')).code).toBe('INVALID_MESSAGE');
    ownerClient.send({ type: 'ping' });
    expect((await ownerClient.waitFor('pong')).type).toBe('pong');
  });

  it('断线保留座位，恢复原会话后身份不变；房主主动退出才转让', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '第二位');
    const ownerClient = await connect(owner);
    const secondClient = await connect(second);
    await ownerClient.close();
    await secondClient.waitForMessage((message) =>
      message.type === 'room' && message.room.players.find((player) => player.id === owner.playerId)?.connected === false);

    const restored = await connect(owner);
    const ready = restored.messages.find((message) => message.type === 'ready');
    expect(ready).toBeDefined();
    await secondClient.waitForMessage((message) =>
      message.type === 'room' && message.room.players.find((player) => player.id === owner.playerId)?.connected === true);

    restored.send({ type: 'leave-room', actionId: 'leave-owner-0001' });
    const transferred = await secondClient.waitForMessage((message) =>
      message.type === 'room' && message.room.ownerId === second.playerId);
    expect(transferred.type).toBe('room');
  });

  it('投票超时会由服务端推进，不依赖房主手机一直在线', async () => {
    const { ownerClient } = await threePlayerParty();
    now += 60_000;
    const result = await ownerClient.waitForMessage((message) =>
      message.type === 'room' && (message.room.game as MostLikelyView | null)?.phase === 'results');
    expect(result.type).toBe('room');
  });

  it('单连接消息限流会拒绝洪峰，但其他房间成员不受影响', async () => {
    await app.close();
    app = await buildServer({
      logger: false,
      now: () => now,
      tickIntervalMs: 10,
      messageRateLimit: 5,
      messageRateWindowMs: 60_000,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
    baseUrl = `http://127.0.0.1:${address.port}`;
    socketUrl = `ws://127.0.0.1:${address.port}/ws`;

    const owner = await createRoom();
    const ownerClient = await connect(owner);
    for (let index = 0; index < 6; index += 1) ownerClient.send({ type: 'ping' });
    expect((await ownerClient.waitFor('error')).code).toBe('RATE_LIMITED');
    const health = await request<{ status: string }>('/api/health');
    expect(health.status).toBe('ok');
  });
});
