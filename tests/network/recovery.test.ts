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
let directory: string;
let dataFile: string;
let baseUrl: string;
let socketUrl: string;
let clients: PartyTestClient[] = [];

async function listen() {
  app = await buildServer({
    logger: false,
    now: Date.now,
    tickIntervalMs: 10,
    messageRateLimit: 100,
    messageRateWindowMs: 1_000,
    dataFile,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
}

async function post<T>(path: string, body: unknown, status = 200) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(status);
  return response.json() as Promise<T>;
}

async function connect(session: Session) {
  const client = await PartyTestClient.connect(socketUrl);
  clients.push(client);
  client.send({ type: 'authenticate', sessionId: session.sessionId, resumeToken: session.resumeToken });
  return { client, ready: await client.waitFor('ready') };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'party-recovery-'));
  dataFile = join(directory, 'party.json');
  clients = [];
});

afterEach(async () => {
  for (const client of clients) await client.close();
  if (app?.server.listening) await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('服务重启恢复', () => {
  it('恢复房间、恢复令牌、已揭晓票型与分数，老朋友可以直接继续', async () => {
    await listen();
    const owner = await post<Session>('/api/rooms', { nickname: '房主', avatar: '🦊' }, 201);
    const second = await post<Session>(`/api/rooms/${owner.roomCode}/join`, { nickname: '第二位', avatar: '🐼' });
    const third = await post<Session>(`/api/rooms/${owner.roomCode}/join`, { nickname: '第三位', avatar: '🐸' });
    const ownerConnection = await connect(owner);
    const secondConnection = await connect(second);
    const thirdConnection = await connect(third);
    ownerConnection.client.send({ type: 'start-game', actionId: 'restart-start-001', gameId: 'most-likely', rounds: 3 });
    await ownerConnection.client.waitForMessage((message) => message.type === 'room' && message.room.game !== null);
    ownerConnection.client.send({ type: 'game-action', actionId: 'restart-vote-0001', action: { type: 'cast-vote', targetId: second.playerId } });
    secondConnection.client.send({ type: 'game-action', actionId: 'restart-vote-0002', action: { type: 'cast-vote', targetId: owner.playerId } });
    thirdConnection.client.send({ type: 'game-action', actionId: 'restart-vote-0003', action: { type: 'cast-vote', targetId: second.playerId } });
    await ownerConnection.client.waitForMessage((message) => message.type === 'room' && (message.room.game as MostLikelyView | null)?.phase === 'results');

    await app.close();
    await listen();
    const restored = await connect(second);
    expect(restored.ready.session.playerId).toBe(second.playerId);
    expect(restored.ready.session.room.players.find((player) => player.id === owner.playerId)?.connected).toBe(false);
    expect(restored.ready.session.room.players.find((player) => player.id === third.playerId)?.connected).toBe(false);
    expect(restored.ready.session.room.players.find((player) => player.id === second.playerId)?.connected).toBe(true);
    const game = restored.ready.session.room.game as MostLikelyView;
    expect(game.phase).toBe('results');
    expect(game.ownVote).toBe(owner.playerId);
    expect(game.scores[second.playerId]).toBe(1);
    expect(game.results?.winners).toEqual([second.playerId]);
  });
});
