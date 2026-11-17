import { describe, expect, it } from 'vitest';
import { DomainError } from '@party/game-core';
import type { GameActionContext } from '@party/game-core';
import { gomokuGame, GOMOKU_MOVE_TIMEOUT_MS, GOMOKU_ROUND_RESULT_MS } from '@party/games';
import type { GomokuView } from '@party/games';

const PLAYERS = ['black-first', 'white-second'];

function context(playerId: string, now = 1_000, isOwner = false, rng: () => number = Math.random): GameActionContext {
  return { now, rng, playerId, isOwner, action: { type: 'place-stone', x: 0, y: 0 } };
}

function createGame(rounds = 1, now = 1_000, rng: () => number = Math.random) {
  const state = gomokuGame.create({ playerIds: PLAYERS, rounds, now, rng });
  return state;
}

function place(state: ReturnType<typeof createGame>, playerId: string, x: number, y: number, now = 1_000) {
  gomokuGame.act(state, { ...context(playerId, now), action: { type: 'place-stone', x, y } });
}

function view(state: ReturnType<typeof createGame>, playerId = PLAYERS[0]!): GomokuView {
  return gomokuGame.view(state, playerId) as GomokuView;
}

describe('五子棋 · 开局', () => {
  it('首盘黑棋先行，两位参与者轮流派下先后手', () => {
    const state = createGame(3);
    const first = view(state);
    expect(first.phase).toBe('playing');
    expect(first.round).toBe(1);
    expect(first.blackSeat).toBe(0);
    expect(state.participantIds[first.turnSeat!]).toBe(PLAYERS[0]);
    expect(first.board.filter((cell) => cell !== null)).toHaveLength(0);
    expect(first.deadlineAt).toBe(1_000 + GOMOKU_MOVE_TIMEOUT_MS);
  });

  it('只允许 2 名玩家开局，轮数只能是 1/3/5 盘', () => {
    expect(() => gomokuGame.create({ playerIds: ['a', 'b', 'c'], rounds: 1, now: 1, rng: Math.random }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    expect(() => gomokuGame.create({ playerIds: ['a'], rounds: 1, now: 1, rng: Math.random }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    expect(() => gomokuGame.create({ playerIds: PLAYERS, rounds: 2, now: 1, rng: Math.random }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
  });

  it('旁观者不能落子', () => {
    const state = createGame();
    expect(() => place(state, 'stranger', 7, 7)).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
  });
});

describe('五子棋 · 对局规则', () => {
  it('黑先白后，空位才能落子，落子后切换回合', () => {
    const state = createGame();
    place(state, PLAYERS[0]!, 7, 7);
    expect(view(state).board[7 * 15 + 7]).toBe(0);
    expect(state.participantIds[view(state).turnSeat!]).toBe(PLAYERS[1]!);
    // 白棋不能落在已有棋子上，也不能抢黑棋回合。
    expect(() => place(state, PLAYERS[0]!, 8, 8)).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    expect(() => place(state, PLAYERS[1]!, 7, 7)).toThrowError(expect.objectContaining({ code: 'CELL_TAKEN' }));
  });

  it('横、竖、斜四个方向连成五子即胜，winLine 标出连珠', () => {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
      const state = createGame(3);
      // 黑棋沿 (dx,dy) 连五，白棋在远处陪跑。
      for (let step = 0; step < 5; step += 1) {
        place(state, PLAYERS[0]!, 7 + dx * step, 7 + dy * step);
        if (step < 4) place(state, PLAYERS[1]!, 1, step);
      }
      const current = view(state);
      expect(current.phase).toBe('round-end');
      expect(current.boardWinnerId).toBe(PLAYERS[0]);
      expect(current.winLine).toHaveLength(5);
      expect(current.scores[PLAYERS[0]!]).toBe(1);
    }
  });

  it('长连同样获胜：补中一子连成六子，winLine 覆盖整条连珠', () => {
    const state = createGame(3);
    // 黑：4,5,6,7 与 9，白棋散点陪跑；最后落 8 补成 4..9 六连。
    place(state, PLAYERS[0]!, 4, 7);
    place(state, PLAYERS[1]!, 0, 0);
    place(state, PLAYERS[0]!, 5, 7);
    place(state, PLAYERS[1]!, 14, 0);
    place(state, PLAYERS[0]!, 6, 7);
    place(state, PLAYERS[1]!, 0, 14);
    place(state, PLAYERS[0]!, 7, 7);
    place(state, PLAYERS[1]!, 14, 14);
    place(state, PLAYERS[0]!, 9, 7);
    place(state, PLAYERS[1]!, 2, 2);
    place(state, PLAYERS[0]!, 8, 7);
    const current = view(state);
    expect(current.phase).toBe('round-end');
    expect(current.boardWinnerId).toBe(PLAYERS[0]!);
    expect(current.winLine).toHaveLength(6);
  });

  it('最后一盘结束后直接进入 finished，按胜盘数决出赢家', () => {
    const state = createGame(1);
    for (let step = 0; step < 5; step += 1) {
      place(state, PLAYERS[0]!, 3 + step, 3);
      if (step < 4) place(state, PLAYERS[1]!, step, 0);
    }
    const current = view(state);
    expect(current.phase).toBe('finished');
    expect(current.winners).toEqual([PLAYERS[0]!]);
    expect(gomokuGame.isFinished(state)).toBe(true);
  });
});

describe('五子棋 · 多盘与再来一局', () => {
  function winBoard(state: ReturnType<typeof createGame>, blackId: string, whiteId: string, now: number) {
    for (let step = 0; step < 5; step += 1) {
      place(state, blackId, 3 + step, 3, now);
      if (step < 4) place(state, whiteId, step, 0, now);
    }
  }

  it('换盘后先后手交换、棋盘清空；非房主不能推进', () => {
    const state = createGame(3);
    winBoard(state, PLAYERS[0]!, PLAYERS[1]!, 1_000);
    expect(() => gomokuGame.act(state, { ...context(PLAYERS[1]!, 2_000, false), action: { type: 'next-board' } }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    gomokuGame.act(state, { ...context(PLAYERS[0]!, 2_000, true), action: { type: 'next-board' } });
    const next = view(state);
    expect(next.phase).toBe('playing');
    expect(next.round).toBe(2);
    expect(next.blackSeat).toBe(1);
    expect(next.board.filter((cell) => cell !== null)).toHaveLength(0);
    expect(state.participantIds[next.turnSeat!]).toBe(PLAYERS[1]!);
  });

  it('盘间展示到点自动进入下一盘，最后一盘结束后保持 finished', () => {
    const state = createGame(3);
    winBoard(state, PLAYERS[0]!, PLAYERS[1]!, 1_000);
    expect(gomokuGame.advanceTime(state, { now: 1_000 + GOMOKU_ROUND_RESULT_MS - 1, rng: Math.random })).toBe(false);
    expect(gomokuGame.advanceTime(state, { now: 1_000 + GOMOKU_ROUND_RESULT_MS, rng: Math.random })).toBe(true);
    expect(view(state).round).toBe(2);
    winBoard(state, PLAYERS[1]!, PLAYERS[0]!, 9_000);
    // 第二盘未到终盘，仍进入盘间展示，随后自动开出第三盘。
    expect(view(state).phase).toBe('round-end');
    gomokuGame.advanceTime(state, { now: 9_000 + GOMOKU_ROUND_RESULT_MS, rng: Math.random });
    expect(view(state).round).toBe(3);
    expect(view(state).phase).toBe('playing');
    winBoard(state, PLAYERS[0]!, PLAYERS[1]!, 20_000);
    const done = view(state);
    expect(done.phase).toBe('finished');
    expect(done.round).toBe(3);
  });

  it('三盘两胜者夺冠；再来一局只有房主在 finished 时可用', () => {
    const state = createGame(3);
    winBoard(state, PLAYERS[0]!, PLAYERS[1]!, 1_000);
    gomokuGame.act(state, { ...context(PLAYERS[0]!, 2_000, true), action: { type: 'next-board' } });
    winBoard(state, PLAYERS[1]!, PLAYERS[0]!, 9_000);
    gomokuGame.act(state, { ...context(PLAYERS[0]!, 20_000, true), action: { type: 'next-board' } });
    winBoard(state, PLAYERS[0]!, PLAYERS[1]!, 21_000);
    const final = view(state);
    expect(final.phase).toBe('finished');
    expect(final.scores).toEqual({ [PLAYERS[0]!]: 2, [PLAYERS[1]!]: 1 });
    expect(final.winners).toEqual([PLAYERS[0]!]);
    expect(() => gomokuGame.act(state, { ...context(PLAYERS[0]!, 22_000, false), action: { type: 'play-again' } }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    gomokuGame.act(state, { ...context(PLAYERS[0]!, 22_000, true), action: { type: 'play-again' } });
    const again = view(state);
    expect(again.phase).toBe('playing');
    expect(again.scores[PLAYERS[0]!]).toBe(0);
  });

  it('未知动作被拒绝', () => {
    const state = createGame();
    expect(() => gomokuGame.act(state, { ...context(PLAYERS[0]!), action: { type: 'roll-dice' } as never }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
  });
});

describe('五子棋 · 超时与快照', () => {
  it('思考超时后服务端自动在靠中心的位置落子', () => {
    const state = createGame(1, 1_000);
    place(state, PLAYERS[0]!, 7, 7, 1_000);
    expect(gomokuGame.advanceTime(state, { now: 1_000 + GOMOKU_MOVE_TIMEOUT_MS - 1, rng: Math.random })).toBe(false);
    expect(gomokuGame.advanceTime(state, { now: 1_000 + GOMOKU_MOVE_TIMEOUT_MS, rng: Math.random })).toBe(true);
    const current = view(state);
    expect(state.participantIds[current.turnSeat!]).toBe(PLAYERS[0]!);
    // 白棋超时自动落子：紧邻天元的可用位。
    expect(current.board.filter((cell) => cell !== null)).toHaveLength(2);
    expect(current.lastMove).not.toBeNull();
  });

  it('状态可 JSON 往返并恢复继续对局', () => {
    const state = createGame(3);
    place(state, PLAYERS[0]!, 7, 7);
    place(state, PLAYERS[1]!, 8, 8);
    const restored = JSON.parse(JSON.stringify(state));
    place(restored, PLAYERS[0]!, 9, 9);
    expect(view(restored).board[9 * 15 + 9]).toBe(0);
  });
});
