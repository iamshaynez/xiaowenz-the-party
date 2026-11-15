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

describe('WebSocket 心跳', () => {
  it('长时间没有消息和 pong 的假在线连接会被移除，朋友看到离线', async () => {
    const owner = await post('/api/rooms', { nickname: '房主', avatar: '🦊' });
    const second = await post(`/api/rooms/${owner.roomCode}/join`, { nickname: '朋友', avatar: '🐼' });
    const ownerClient = await connect(owner);
    ownerClient.socket.pong = () => undefined;
    const friend = await connect(second);
    friend.clear();

    now += 31_000;
    await new Promise((resolve) => setTimeout(resolve, 30));
    now += 35_001;
    await friend.waitForMessage((message) => message.type === 'room' && message.room.players.find((player) => player.id === owner.playerId)?.connected === false);
  });
});
