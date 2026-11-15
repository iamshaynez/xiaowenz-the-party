import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Session } from '@party/protocol';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl: string;
let socketUrl: string;
let now: number;
let clients: PartyTestClient[] = [];

async function post(path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return response.json() as Promise<Session>;
}

async function connect(session: Session) {
  const client = await PartyTestClient.connect(socketUrl);
  clients.push(client);
  client.send({ type: 'authenticate', sessionId: session.sessionId, resumeToken: session.resumeToken });
  await client.waitFor('ready');
  return client;
}

beforeEach(async () => {
  now = 1_000;
  clients = [];
  app = await buildServer({ logger: false, now: () => now, tickIntervalMs: 5, messageRateLimit: 100, messageRateWindowMs: 1_000 });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('没有测试端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
});

afterEach(async () => {
  for (const client of clients) await client.close();
  if (app?.server.listening) await app.close();
});

describe('连接与生命周期边界', () => {
  it('同一玩家开两个标签页，关闭一个不会掉线，全部关闭才显示离线', async () => {
    const owner = await post('/api/rooms', { nickname: '房主', avatar: '🦊' });
    const second = await post(`/api/rooms/${owner.roomCode}/join`, { nickname: '朋友', avatar: '🐼' });
    const firstTab = await connect(owner);
    const secondTab = await connect(owner);
    const friend = await connect(second);
    await firstTab.close();
    friend.clear();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(friend.messages.some((message) => message.type === 'room' && message.room.players.find((player) => player.id === owner.playerId)?.connected === false)).toBe(false);
    await secondTab.close();
    await friend.waitForMessage((message) => message.type === 'room' && message.room.players.find((player) => player.id === owner.playerId)?.connected === false);
  });

  it('重复鉴权、未开局动作和非房主开局都不会改变游戏状态', async () => {
    const owner = await post('/api/rooms', { nickname: '房主', avatar: '🦊' });
    const second = await post(`/api/rooms/${owner.roomCode}/join`, { nickname: '朋友', avatar: '🐼' });
    const ownerClient = await connect(owner);
    const secondClient = await connect(second);
    ownerClient.send({ type: 'authenticate', sessionId: owner.sessionId, resumeToken: owner.resumeToken });
    expect((await ownerClient.waitForError('ALREADY_AUTHENTICATED')).code).toBe('ALREADY_AUTHENTICATED');
    ownerClient.send({ type: 'game-action', actionId: 'before-game-001', action: { type: 'next-round' } });
    expect((await ownerClient.waitForError('INVALID_PHASE')).code).toBe('INVALID_PHASE');
    secondClient.send({ type: 'start-game', actionId: 'friend-start-01', gameId: 'most-likely', rounds: 3 });
    expect((await secondClient.waitForError('OWNER_ONLY')).code).toBe('OWNER_ONLY');
  });

  it('闲置房间到期后自动清理，健康检查恢复为零', async () => {
    await post('/api/rooms', { nickname: '房主', avatar: '🦊' });
    expect((await fetch(`${baseUrl}/api/health`).then((response) => response.json())).activeRooms).toBe(1);
    now += 2 * 60 * 60 * 1000 + 1;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect((await fetch(`${baseUrl}/api/health`).then((response) => response.json())).activeRooms).toBe(0);
  });

  it('超大 WebSocket 帧以协议错误关闭，而不是进入游戏规则', async () => {
    const owner = await post('/api/rooms', { nickname: '房主', avatar: '🦊' });
    const client = await connect(owner);
    const closed = new Promise<number>((resolve) => client.socket.once('close', resolve));
    client.sendRaw(`"${'x'.repeat(5_000)}"`);
    expect(await closed).toBe(1009);
  });
});
