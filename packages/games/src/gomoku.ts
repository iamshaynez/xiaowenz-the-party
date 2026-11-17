import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameDefinition } from '@party/game-core';
import { GOMOKU_BOARD_SIZE } from '@party/protocol';

export const GOMOKU_MOVE_TIMEOUT_MS = 120_000;
export const GOMOKU_ROUND_RESULT_MS = 8_000;
export const GOMOKU_ROUNDS = [1, 3, 5] as const;

export type GomokuCell = 0 | 1 | null;
export interface GomokuPoint {
  x: number;
  y: number;
}

export interface GomokuView {
  id: 'gomoku';
  phase: 'playing' | 'round-end' | 'finished';
  round: number;
  totalRounds: number;
  board: GomokuCell[];
  blackSeat: number;
  turnSeat: number | null;
  lastMove: GomokuPoint | null;
  winLine: GomokuPoint[] | null;
  boardWinnerId: string | null;
  scores: Record<string, number>;
  deadlineAt: number | null;
  roundEndsAt: number | null;
  winners: string[];
}

interface GomokuState {
  participantIds: string[];
  round: number;
  totalRounds: number;
  phase: GomokuView['phase'];
  board: GomokuCell[];
  blackSeat: number;
  turnSeat: number;
  lastMove: GomokuPoint | null;
  winLine: GomokuPoint[] | null;
  boardWinnerId: string | null;
  scores: Record<string, number>;
  deadlineAt: number | null;
  roundEndsAt: number | null;
}

const INDEX = (x: number, y: number) => y * GOMOKU_BOARD_SIZE + x;
const DIRECTIONS = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;

function create(options: CreateGameOptions): GomokuState {
  if (options.playerIds.length !== 2) {
    throw new DomainError('INVALID_PLAYER_COUNT', '五子棋需要 2 位玩家');
  }
  if (!GOMOKU_ROUNDS.includes(options.rounds as (typeof GOMOKU_ROUNDS)[number])) {
    throw new DomainError('INVALID_ROUNDS', '五子棋支持 1、3 或 5 盘');
  }
  return beginBoard(
    {
      participantIds: [...options.playerIds],
      round: 1,
      totalRounds: options.rounds,
      phase: 'playing',
      board: new Array<GomokuCell>(GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE).fill(null),
      blackSeat: 0,
      turnSeat: 0,
      lastMove: null,
      winLine: null,
      boardWinnerId: null,
      scores: Object.fromEntries(options.playerIds.map((id) => [id, 0])),
      deadlineAt: options.now + GOMOKU_MOVE_TIMEOUT_MS,
      roundEndsAt: null,
    },
    1,
  );
}

// 每盘重置棋盘与先后手：第 n 盘由座位 (n-1) % 2 执黑先行。
function beginBoard(state: GomokuState, round: number) {
  state.round = round;
  state.phase = 'playing';
  state.board = new Array<GomokuCell>(GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE).fill(null);
  state.blackSeat = (round - 1) % 2;
  state.turnSeat = state.blackSeat;
  state.lastMove = null;
  state.winLine = null;
  state.boardWinnerId = null;
  state.roundEndsAt = null;
  return state;
}

// 找出经过 (x,y) 的最长连珠（自由规则：五连及以上即胜）。
function findWinLine(board: GomokuCell[], x: number, y: number): GomokuPoint[] | null {
  const color = board[INDEX(x, y)];
  if (color === null) return null;
  for (const [dx, dy] of DIRECTIONS) {
    const line: GomokuPoint[] = [{ x, y }];
    for (const sign of [1, -1] as const) {
      let cx = x + dx * sign;
      let cy = y + dy * sign;
      while (cx >= 0 && cx < GOMOKU_BOARD_SIZE && cy >= 0 && cy < GOMOKU_BOARD_SIZE && board[INDEX(cx, cy)] === color) {
        if (sign === 1) line.push({ x: cx, y: cy });
        else line.unshift({ x: cx, y: cy });
        cx += dx * sign;
        cy += dy * sign;
      }
    }
    if (line.length >= 5) return line;
  }
  return null;
}

function endBoard(state: GomokuState, now: number, winnerId: string | null) {
  if (winnerId) state.scores[winnerId] = (state.scores[winnerId] ?? 0) + 1;
  state.boardWinnerId = winnerId;
  state.deadlineAt = null;
  if (state.round >= state.totalRounds) {
    state.phase = 'finished';
    state.roundEndsAt = null;
    return;
  }
  state.phase = 'round-end';
  state.roundEndsAt = now + GOMOKU_ROUND_RESULT_MS;
}

// 超时自动落子：从天元向外的螺旋顺序取第一个空位，保证确定性且总是合法。
function autoMoveIndex(board: GomokuCell[]): number {
  const center = (GOMOKU_BOARD_SIZE - 1) / 2;
  const candidates = board
    .map((cell, index) => ({ cell, index }))
    .filter((entry) => entry.cell === null)
    .map(({ index }) => {
      const x = index % GOMOKU_BOARD_SIZE;
      const y = Math.floor(index / GOMOKU_BOARD_SIZE);
      const dx = x - center;
      const dy = y - center;
      return { index, distance: dx * dx + dy * dy, x, y };
    })
    .sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates[0]?.index ?? -1;
}

function placeStone(state: GomokuState, playerId: string, x: number, y: number, now: number) {
  if (state.phase !== 'playing') throw new DomainError('INVALID_PHASE', '这一盘已经结束了');
  if (!state.participantIds.includes(playerId)) {
    throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
  }
  const seat = state.participantIds.indexOf(playerId);
  if (seat !== state.turnSeat) throw new DomainError('NOT_YOUR_TURN', '等对手落子');
  const index = INDEX(x, y);
  if (state.board[index] !== null) throw new DomainError('CELL_TAKEN', '这个位置已经有棋子了');
  const color: GomokuCell = seat === state.blackSeat ? 0 : 1;
  state.board[index] = color;
  state.lastMove = { x, y };
  state.winLine = findWinLine(state.board, x, y);
  if (state.winLine) {
    endBoard(state, now, playerId);
    return;
  }
  if (state.board.every((cell) => cell !== null)) {
    endBoard(state, now, null);
    return;
  }
  state.turnSeat = 1 - seat;
  state.deadlineAt = now + GOMOKU_MOVE_TIMEOUT_MS;
}

function act(state: GomokuState, context: GameActionContext) {
  switch (context.action.type) {
    case 'place-stone':
      placeStone(state, context.playerId, context.action.x, context.action.y, context.now);
      return;
    case 'next-board': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以开始下一盘');
      if (state.phase !== 'round-end') throw new DomainError('INVALID_PHASE', '这一盘还没有结束');
      const now = context.now;
      beginBoard(state, state.round + 1);
      state.deadlineAt = now + GOMOKU_MOVE_TIMEOUT_MS;
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '本局还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: state.totalRounds,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「五子棋」的动作');
  }
}

export const gomokuGame: GameDefinition<GomokuState, GomokuView> = {
  id: 'gomoku',
  version: 1,
  name: '五子棋',
  emoji: '⚫',
  description: '一张木棋盘，黑白两色。先连成五子的人赢，简单纯粹。',
  tags: ['棋牌', '双人', '策略'],
  rules: ['2 人', '先连五子者胜', '多盘制轮流执黑'],
  englishName: 'GOMOKU',
  minutesPerRound: 3,
  roundsOptions: GOMOKU_ROUNDS,
  minPlayers: 2,
  maxPlayers: 2,
  create,
  act,
  advanceTime(state, ctx) {
    if (state.phase === 'playing' && state.deadlineAt !== null && ctx.now >= state.deadlineAt) {
      // 超时自动落子：白棋或黑棋在天元附近落一个空位，对局继续。
      const index = autoMoveIndex(state.board);
      if (index >= 0) {
        const x = index % GOMOKU_BOARD_SIZE;
        const y = Math.floor(index / GOMOKU_BOARD_SIZE);
        placeStone(state, state.participantIds[state.turnSeat]!, x, y, state.deadlineAt);
        return true;
      }
      endBoard(state, state.deadlineAt, null);
      return true;
    }
    if (state.phase === 'round-end' && state.roundEndsAt !== null && ctx.now >= state.roundEndsAt) {
      beginBoard(state, state.round + 1);
      state.deadlineAt = state.roundEndsAt + GOMOKU_MOVE_TIMEOUT_MS;
      return true;
    }
    return false;
  },
  view(state): GomokuView {
    const highest = Math.max(0, ...Object.values(state.scores));
    return {
      id: 'gomoku',
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      board: [...state.board],
      blackSeat: state.blackSeat,
      turnSeat: state.phase === 'playing' ? state.turnSeat : null,
      lastMove: state.lastMove ? { ...state.lastMove } : null,
      winLine: state.winLine ? state.winLine.map((point) => ({ ...point })) : null,
      boardWinnerId: state.boardWinnerId,
      scores: { ...state.scores },
      deadlineAt: state.deadlineAt,
      roundEndsAt: state.roundEndsAt,
      winners: state.phase === 'finished'
        ? state.participantIds.filter((id) => highest > 0 && state.scores[id] === highest)
        : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
