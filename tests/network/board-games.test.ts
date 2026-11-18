import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { GameId, Session } from '@party/protocol';
import type { DouDizhuView, GomokuView, HoldemView, LudoView } from '@party/games';
import { buildServer } from '../../apps/server/src/app';
import { PartyTestClient } from './helpers';

let app: FastifyInstance;
let baseUrl = '';
let socketUrl = '';
let now = 1_000;
let clients: PartyTestClient[] = [];
let directory = '';
let dataFile = '';

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

async function joinRoom(code: string, nickname: string, avatar = '🐼') {
  return request<Session>(`/api/rooms/${code}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, avatar }),
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

async function startGame(ownerClient: PartyTestClient, gameId: GameId, rounds: number, actionId: string) {
  ownerClient.send({ type: 'start-game', actionId, gameId, rounds });
}

async function awaitGame<T>(client: PartyTestClient, predicate: (view: T) => boolean): Promise<T> {
  const message = await client.waitForMessage((candidate) => {
    if (candidate.type !== 'room') return false;
    const game = candidate.room.game as T | null;
    return game !== null && predicate(game);
  });
  return (message as unknown as { room: { game: T } }).room.game;
}

async function act(client: PartyTestClient, actionId: string, action: unknown, expectError?: string) {
  client.send({ type: 'game-action', actionId, action: action as never });
  if (expectError) {
    const error = await client.waitForError(expectError);
    return error;
  }
  const ack = await client.waitFor('action-ack');
  return ack;
}

beforeEach(async () => {
  now = 1_000;
  clients = [];
  directory = await mkdtemp(join(tmpdir(), 'party-board-'));
  dataFile = join(directory, 'party.json');
  app = await buildServer({
    logger: false,
    now: () => now,
    tickIntervalMs: 10,
    messageRateLimit: 200,
    messageRateWindowMs: 1_000,
    dataFile,
  });
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') throw new Error('测试服务没有监听端口');
  baseUrl = `http://127.0.0.1:${address.port}`;
  socketUrl = `ws://127.0.0.1:${address.port}/ws`;
});

afterEach(async () => {
  for (const client of clients) await client.close();
  if (app.server.listening) await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('五子棋 · 网络对局', () => {
  it('两名玩家通过真实 WebSocket 轮流落子，双方棋盘一致', async () => {
    const owner = await createRoom();
    const guest = await joinRoom(owner.roomCode, '挑战者', '🐸');
    const ownerClient = await connect(owner);
    const guestClient = await connect(guest);
    await startGame(ownerClient, 'gomoku', 1, 'gm-net-start-1');
    let view = await awaitGame<GomokuView>(ownerClient, (game) => game.id === 'gomoku');
    expect(view.turnSeat).toBe(0);

    await act(ownerClient, 'gm-act-1', { type: 'place-stone', x: 7, y: 7 });
    view = await awaitGame<GomokuView>(guestClient, (game) => game.turnSeat === 1);
    expect(view.board[7 * 15 + 7]).toBe(0);
    // 白棋试图落在黑棋位置 / 抢回合都被服务端拒绝。
    await act(guestClient, 'gm-act-bad-1', { type: 'place-stone', x: 7, y: 7 }, 'CELL_TAKEN');
    await act(ownerClient, 'gm-act-bad-2', { type: 'place-stone', x: 8, y: 8 }, 'NOT_YOUR_TURN');
    // 同一 actionId 重发幂等，不产生第二颗子。
    await act(ownerClient, 'gm-act-1', { type: 'place-stone', x: 7, y: 7 });
    await act(guestClient, 'gm-act-2', { type: 'place-stone', x: 8, y: 8 });
    const settled = await awaitGame<GomokuView>(ownerClient, (game) => game.turnSeat === 0 && game.board[8 * 15 + 8] === 1);
    expect(settled.board.filter((cell) => cell !== null)).toHaveLength(2);
  });
});

describe('飞行棋 · 网络对局', () => {
  it('骰子由服务端掷出，玩家只能在轮到自己时行动', async () => {
    const owner = await createRoom();
    const guest = await joinRoom(owner.roomCode, '副驾', '🐯');
    const ownerClient = await connect(owner);
    const guestClient = await connect(guest);
    await startGame(ownerClient, 'ludo', 1, 'ld-net-start-1');
    const view = await awaitGame<LudoView>(ownerClient, (game) => game.id === 'ludo');
    expect(view.stage).toBe('roll');
    // 非行动方掷骰被拒。
    await act(guestClient, 'ld-act-bad-1', { type: 'roll-dice' }, 'NOT_YOUR_TURN');
    await act(ownerClient, 'ld-act-1', { type: 'roll-dice' });
    const rolled = await awaitGame<LudoView>(ownerClient, (game) => game.stage !== null && (game.stage === 'move' || game.blocked));
    expect(rolled.dice === null || rolled.dice >= 1).toBe(true);
    if (rolled.stage === 'move') {
      await act(ownerClient, 'ld-act-2', { type: 'move-plane', plane: rolled.movablePlanes[0] ?? 0 });
      const after = await awaitGame<LudoView>(guestClient, (game) => game.seat === 1 || game.seat === 0);
      expect(after.seat).not.toBeNull();
    }
  });

  it('玩家中途退出后座位表保持开局顺序，剩余玩家按原座位行动', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '副驾', '🐯');
    const third = await joinRoom(owner.roomCode, '导航员', '🐸');
    const a = await connect(owner);
    const b = await connect(second);
    await connect(third);
    await startGame(a, 'ludo', 1, 'ld-net-start-2');
    const view = await awaitGame<LudoView>(b, (game) => game.id === 'ludo' && game.seats.length === 3);
    expect(view.seats).toEqual([owner.playerId, second.playerId, third.playerId]);

    // 座位 0（房主）中途退出房间：房间玩家列表前移，但游戏座位表保持开局顺序。
    a.send({ type: 'leave-room', actionId: 'ld-leave-1' });
    const afterLeave = await awaitGame<LudoView>(b, (game) => game.id === 'ludo' && game.seats.length === 3);
    expect(afterLeave.seats).toEqual([owner.playerId, second.playerId, third.playerId]);
    // 座位 1 的玩家不能抢占已离开座位的回合。
    await act(b, 'ld-act-bad-1', { type: 'roll-dice' }, 'NOT_YOUR_TURN');
  });
});

describe('斗地主 · 私密手牌与网络流程', () => {
  it('每个人只看得到自己的 17 张牌，底牌在定庄前保密', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '农民甲', '🐼');
    const third = await joinRoom(owner.roomCode, '农民乙', '🐸');
    const a = await connect(owner);
    const b = await connect(second);
    const c = await connect(third);
    await startGame(a, 'dou-dizhu', 1, 'dd-net-start-1');
    const viewA = await awaitGame<DouDizhuView>(a, (game) => game.phase === 'bidding');
    const viewB = await awaitGame<DouDizhuView>(b, (game) => game.phase === 'bidding');
    const viewC = await awaitGame<DouDizhuView>(c, (game) => game.phase === 'bidding');

    expect(viewA.ownHand).toHaveLength(17);
    expect(viewB.ownHand).toHaveLength(17);
    expect(viewC.ownHand).toHaveLength(17);
    const all = [...viewA.ownHand, ...viewB.ownHand, ...viewC.ownHand];
    expect(new Set(all).size).toBe(51);
    // 视图结构上不存在别人手牌的字段：只有 ownHand 与计数。
    expect(viewA.handCounts).toEqual({ [owner.playerId]: 17, [second.playerId]: 17, [third.playerId]: 17 });
    expect(viewA.bottom).toBeNull();

    // 叫 3 分直接定地主，底牌向所有人公开并并入地主手牌。
    await act(a, 'dd-act-1', { type: 'bid', points: 3 });
    const settled = await awaitGame<DouDizhuView>(b, (game) => game.phase === 'playing');
    expect(settled.landlordId).toBe(owner.playerId);
    expect(settled.bottom).toHaveLength(3);
    expect(settled.handCounts[owner.playerId]).toBe(20);
  });

  it('过牌与出牌走真实连接，非法牌型被服务端拒绝', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '农民甲', '🐼');
    const third = await joinRoom(owner.roomCode, '农民乙', '🐸');
    const a = await connect(owner);
    const b = await connect(second);
    const c = await connect(third);
    await startGame(a, 'dou-dizhu', 1, 'dd-net-start-2');
    const viewA = await awaitGame<DouDizhuView>(a, (game) => game.phase === 'bidding');
    await act(a, 'dd-act-a1', { type: 'pass' });
    await act(b, 'dd-act-b1', { type: 'pass' });
    await act(c, 'dd-act-c1', { type: 'bid', points: 1 });
    const landlord = (await awaitGame<DouDizhuView>(c, (game) => game.phase === 'playing')).landlordId!;
    expect(landlord).toBe(third.playerId);
    // 地主先出：两张不同点数的牌不是合法牌型。
    await act(c, 'dd-act-c2', { type: 'play-cards', cards: [0, 40] }, 'INVALID_COMBO');
    const own = viewA.ownHand;
    void own;
    const landlordView = await awaitGame<DouDizhuView>(c, (game) => game.turnSeat !== null && game.phase === 'playing' && game.landlordId === third.playerId);
    const single = [landlordView.ownHand[0]!];
    await act(c, 'dd-act-c3', { type: 'play-cards', cards: single });
    await act(a, 'dd-act-a2', { type: 'pass' });
    const played = await awaitGame<DouDizhuView>(b, (game) => game.plays.some((entry) => entry.playerId === owner.playerId));
    expect(played.plays.length).toBeGreaterThan(0);
  });
});

describe('德州扑克 · 私密底牌与公共牌', () => {
  it('底牌只进本人视图，公共牌与彩池对所有端一致', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '对手', '🐼');
    const a = await connect(owner);
    const b = await connect(second);
    await startGame(a, 'texas-holdem', 1, 'th-net-start-1');
    const viewA = await awaitGame<HoldemView>(a, (game) => game.id === 'texas-holdem' && game.street === 'preflop');
    const viewB = await awaitGame<HoldemView>(b, (game) => game.id === 'texas-holdem' && game.street === 'preflop');

    expect(viewA.ownCards).toHaveLength(2);
    expect(viewB.ownCards).toHaveLength(2);
    expect(new Set([...viewA.ownCards!, ...viewB.ownCards!]).size).toBe(4);
    // 座位数据不含任何牌面字段；摊牌前 revealed 为空。
    expect(viewA.revealed).toBeNull();
    expect(viewB.revealed).toBeNull();
    expect(viewA.seats.every((seat) => !('cards' in seat))).toBe(true);
    // 公共牌、盲注、彩池逐端一致。
    expect(viewA.community).toEqual(viewB.community);
    expect(viewA.blinds).toEqual(viewB.blinds);
    expect(viewA.pot).toBe(viewB.pot);

    // 翻牌前行动：先行动者跟注，大盲过牌，走真实连接到达翻牌。
    const firstActorId = viewA.seats[viewA.toActSeat!]!.playerId;
    const utgClient = firstActorId === owner.playerId ? a : b;
    await act(utgClient, 'th-act-1', { type: 'call' });
    await act(utgClient === a ? b : a, 'th-act-2', { type: 'check' });
    const flopA = await awaitGame<HoldemView>(a, (game) => game.street === 'flop');
    const flopB = await awaitGame<HoldemView>(b, (game) => game.street === 'flop');
    expect(flopA.community).toHaveLength(3);
    expect(flopA.community).toEqual(flopB.community);
    expect(flopA.revealed).toBeNull();
  });

  it('重开服务后手牌依旧只对本人可见（快照恢复不泄密）', async () => {
    const owner = await createRoom();
    const second = await joinRoom(owner.roomCode, '对手', '🐼');
    const a = await connect(owner);
    const b = await connect(second);
    await startGame(a, 'texas-holdem', 1, 'th-net-start-2');
    const viewA = await awaitGame<HoldemView>(a, (game) => game.street === 'preflop');
    const holeA = [...viewA.ownCards!];

    // 重启服务并从快照恢复。
    for (const client of clients) await client.close();
    clients = [];
    await app.close();
    app = await buildServer({
      logger: false,
      now: () => now,
      tickIntervalMs: 10,
      messageRateLimit: 200,
      messageRateWindowMs: 1_000,
      dataFile,
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('重启服务未监听端口');
    baseUrl = `http://127.0.0.1:${address.port}`;
    socketUrl = `ws://127.0.0.1:${address.port}/ws`;
    const a2 = await connect(owner);
    const restored = await awaitGame<HoldemView>(a2, (game) => game.street === 'preflop');
    expect(restored.ownCards).toEqual(holeA);
    expect(restored.revealed).toBeNull();
    const b2 = await connect(second);
    const restoredB = await awaitGame<HoldemView>(b2, (game) => game.street === 'preflop');
    expect(restoredB.ownCards).not.toEqual(holeA);
    expect(restoredB.seats.every((seat) => !('cards' in seat))).toBe(true);
  });
});
