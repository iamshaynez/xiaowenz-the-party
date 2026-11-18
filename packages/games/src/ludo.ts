import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameDefinition } from '@party/game-core';

export const LUDO_ROLL_TIMEOUT_MS = 45_000;
export const LUDO_MOVE_TIMEOUT_MS = 45_000;

// 棋盘几何：52 格环道，座位 i 的入口格为 i*13；飞机沿环道走到 p=49 后
// 进入 6 格终点跑道（p=50..55），p=56 为大本营；越过大本营的步数反弹折返。
export const LUDO_RING_SIZE = 52;
export const LUDO_HOME_STEPS = 56;
// 己方颜色格：p ≡ 2 (mod 4)；跳跃 +4 格。飞行格 p=18：直接飞 +12 格。
const OWN_COLOR_MOD = 4;
const OWN_COLOR_OFFSET = 2;
const FLY_FROM = 18;
const FLY_DISTANCE = 12;
const JUMP_DISTANCE = 4;

export interface LudoPlaneState {
  seat: number;
  index: number;
  p: number; // -1 停机坪；0..49 环道；50..55 终点跑道；56 大本营
}

export interface LudoView {
  id: 'ludo';
  phase: 'playing' | 'finished';
  seat: number | null;
  stage: 'roll' | 'move' | null;
  dice: number | null;
  movablePlanes: number[];
  planes: LudoPlaneState[];
  /** 按座位顺序的开局玩家表；玩家中途退出房间也不会改变，前端据此对齐座位。 */
  seats: string[];
  sixStreak: number;
  lastRoll: { seat: number; dice: number } | null;
  blocked: boolean;
  rollDeadlineAt: number | null;
  moveDeadlineAt: number | null;
  winnerId: string | null;
  rankings: Array<{ playerId: string; planesHome: number; progress: number }>;
}

interface LudoState {
  participantIds: string[];
  phase: LudoView['phase'];
  seat: number;
  stage: 'roll' | 'move';
  dice: number | null;
  sixStreak: number;
  planes: LudoPlaneState[];
  lastRoll: { seat: number; dice: number } | null;
  blockedReason: 'no-move' | 'void' | null;
  rollDeadlineAt: number | null;
  moveDeadlineAt: number | null;
  winnerId: string | null;
}

const ringPos = (seat: number, p: number) => (seat * 13 + p) % LUDO_RING_SIZE;

function create(options: CreateGameOptions): LudoState {
  const count = options.playerIds.length;
  if (count < 2 || count > 4) {
    throw new DomainError('INVALID_PLAYER_COUNT', '飞行棋需要 2–4 位玩家');
  }
  if (options.rounds !== 1) throw new DomainError('INVALID_ROUNDS', '飞行棋每次进行一场飞行');
  const planes: LudoPlaneState[] = [];
  for (let seat = 0; seat < count; seat += 1) {
    for (let index = 0; index < 4; index += 1) planes.push({ seat, index, p: -1 });
  }
  return {
    participantIds: [...options.playerIds],
    phase: 'playing',
    seat: 0,
    stage: 'roll',
    dice: null,
    sixStreak: 0,
    planes,
    lastRoll: null,
    blockedReason: null,
    rollDeadlineAt: options.now + LUDO_ROLL_TIMEOUT_MS,
    moveDeadlineAt: null,
    winnerId: null,
  };
}

function requireTurn(state: LudoState, playerId: string) {
  if (state.phase !== 'playing') throw new DomainError('INVALID_PHASE', '这一场飞行已经结束');
  if (!state.participantIds.includes(playerId)) {
    throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
  }
  if (state.participantIds[state.seat] !== playerId) throw new DomainError('NOT_YOUR_TURN', '还没有轮到你');
}

function legalPlanes(state: LudoState, dice: number): number[] {
  const ids: number[] = [];
  state.planes.forEach((plane, id) => {
    if (plane.seat !== state.seat) return;
    if (plane.p === -1) {
      if (dice === 6) ids.push(id);
    } else if (plane.p < LUDO_HOME_STEPS) {
      ids.push(id);
    }
  });
  return ids;
}

function captureAt(state: LudoState, seat: number, p: number) {
  if (p < 0 || p > 49) return;
  const pos = ringPos(seat, p);
  for (const plane of state.planes) {
    if (plane.seat === seat) continue;
    if (plane.p >= 0 && plane.p <= 49 && ringPos(plane.seat, plane.p) === pos) plane.p = -1;
  }
}

// 落格结算：先撞机，再按规则享受飞行格与己色格跳跃，每次落点都重新结算撞机。
function applyLanding(state: LudoState, plane: LudoPlaneState) {
  let p = plane.p;
  if (p > 49) return;
  captureAt(state, plane.seat, p);
  if (p === FLY_FROM) {
    p += FLY_DISTANCE;
    plane.p = p;
    captureAt(state, plane.seat, p);
  }
  if (p % OWN_COLOR_MOD === OWN_COLOR_OFFSET && p >= OWN_COLOR_OFFSET && p <= 46 && p + JUMP_DISTANCE <= 49) {
    p += JUMP_DISTANCE;
    plane.p = p;
    captureAt(state, plane.seat, p);
  }
}

function passTurn(state: LudoState, now: number) {
  state.seat = (state.seat + 1) % state.participantIds.length;
  state.stage = 'roll';
  state.dice = null;
  state.sixStreak = 0;
  state.moveDeadlineAt = null;
  state.rollDeadlineAt = now + LUDO_ROLL_TIMEOUT_MS;
}

function grantBonusRoll(state: LudoState, now: number) {
  state.stage = 'roll';
  state.dice = null;
  state.moveDeadlineAt = null;
  state.rollDeadlineAt = now + LUDO_ROLL_TIMEOUT_MS;
}

function checkWinner(state: LudoState) {
  const allHome = state.planes
    .filter((plane) => plane.seat === state.seat)
    .every((plane) => plane.p === LUDO_HOME_STEPS);
  if (!allHome) return;
  state.phase = 'finished';
  state.winnerId = state.participantIds[state.seat] ?? null;
  state.stage = 'roll';
  state.dice = null;
  state.rollDeadlineAt = null;
  state.moveDeadlineAt = null;
}

function rollDice(state: LudoState, playerId: string, now: number, rng: () => number) {
  requireTurn(state, playerId);
  if (state.stage !== 'roll') throw new DomainError('INVALID_PHASE', '先选择要行动的飞机');
  state.blockedReason = null;
  const dice = 1 + Math.floor(rng() * 6);
  state.lastRoll = { seat: state.seat, dice };
  if (dice === 6) {
    state.sixStreak += 1;
    if (state.sixStreak >= 3) {
      // 连续第三个 6：本轮作废，直接交给下家。
      state.blockedReason = 'void';
      passTurn(state, now);
      return;
    }
  } else {
    state.sixStreak = 0;
  }
  const movable = legalPlanes(state, dice);
  if (movable.length === 0) {
    state.blockedReason = 'no-move';
    passTurn(state, now);
    return;
  }
  state.dice = dice;
  state.stage = 'move';
  state.rollDeadlineAt = null;
  state.moveDeadlineAt = now + LUDO_MOVE_TIMEOUT_MS;
}

function movePlaneByGlobal(state: LudoState, playerId: string, planeId: number, now: number) {
  requireTurn(state, playerId);
  if (state.stage !== 'move' || state.dice === null) throw new DomainError('INVALID_PHASE', '先掷骰子');
  const dice = state.dice;
  if (!legalPlanes(state, dice).includes(planeId)) {
    throw new DomainError('ILLEGAL_MOVE', '这架飞机现在不能这样行动');
  }
  const plane = state.planes[planeId]!;
  const wasHangar = plane.p === -1;
  let p = wasHangar ? 0 : plane.p + dice;
  if (p > LUDO_HOME_STEPS) p = 2 * LUDO_HOME_STEPS - p; // 越过大本营反弹折返
  plane.p = p;
  if (p === LUDO_HOME_STEPS) {
    checkWinner(state);
    if (state.phase === 'finished') return;
  } else {
    applyLanding(state, plane);
  }
  state.lastRoll = { seat: state.seat, dice };
  if (dice === 6) grantBonusRoll(state, now);
  else passTurn(state, now);
}

function act(state: LudoState, context: GameActionContext) {
  switch (context.action.type) {
    case 'roll-dice':
      rollDice(state, context.playerId, context.now, context.rng);
      return;
    case 'move-plane': {
      // 协议语义：移动「我的第 plane 架飞机」（0–3），内部换算成全局编号。
      const seat = state.participantIds.indexOf(context.playerId);
      const globalPlaneId = seat * 4 + context.action.plane;
      movePlaneByGlobal(state, context.playerId, globalPlaneId, context.now);
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '这一场飞行还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: 1,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「飞行棋」的动作');
  }
}

function rankingsOf(state: LudoState): LudoView['rankings'] {
  return state.participantIds.map((playerId, seat) => {
    const planes = state.planes.filter((plane) => plane.seat === seat);
    const planesHome = planes.filter((plane) => plane.p === LUDO_HOME_STEPS).length;
    const progress = planes.reduce((sum, plane) => sum + Math.max(0, plane.p + 1), 0);
    return { playerId, planesHome, progress };
  }).sort((a, b) => b.planesHome - a.planesHome || b.progress - a.progress);
}

export const ludoGame: GameDefinition<LudoState, LudoView> = {
  id: 'ludo',
  version: 1,
  name: '飞行棋',
  emoji: '✈️',
  description: '掷骰子、起飞、跳格、飞行、撞机！先把四架飞机全部送回大本营。',
  tags: ['棋牌', '骰子', '家庭'],
  rules: ['2–4 人', '掷 6 起飞并追加一掷', '己色格跳跃，飞行格跨越棋盘'],
  englishName: 'AEROPLANE CHESS',
  minutesPerRound: 8,
  roundsOptions: [1],
  minPlayers: 2,
  maxPlayers: 4,
  create,
  act,
  advanceTime(state, ctx) {
    if (state.phase !== 'playing') return false;
    if (state.stage === 'roll' && state.rollDeadlineAt !== null && ctx.now >= state.rollDeadlineAt) {
      const player = state.participantIds[state.seat];
      if (!player) return false;
      rollDice(state, player, state.rollDeadlineAt, ctx.rng);
      return true;
    }
    if (state.stage === 'move' && state.moveDeadlineAt !== null && ctx.now >= state.moveDeadlineAt) {
      const movable = legalPlanes(state, state.dice ?? 0);
      const player = state.participantIds[state.seat];
      if (!player) return false;
      if (movable.length === 0) {
        // 防御：进入 move 阶段后理论上总有合法飞机；万一异常快照导致无棋可动，
        // 轮空交给下家而不是永远停在这一步。
        state.blockedReason = 'no-move';
        passTurn(state, state.moveDeadlineAt);
        return true;
      }
      movePlaneByGlobal(state, player, movable[0]!, state.moveDeadlineAt);
      return true;
    }
    return false;
  },
  view(state): LudoView {
    const movableGlobal = state.phase === 'playing' && state.stage === 'move' ? legalPlanes(state, state.dice ?? 0) : [];
    return {
      id: 'ludo',
      phase: state.phase,
      seat: state.phase === 'playing' ? state.seat : null,
      stage: state.phase === 'playing' ? state.stage : null,
      dice: state.phase === 'playing' && state.stage === 'move' ? state.dice : null,
      movablePlanes: movableGlobal.map((id) => id - state.seat * 4),
      planes: state.planes.map((plane) => ({ ...plane })),
      seats: [...state.participantIds],
      sixStreak: state.sixStreak,
      lastRoll: state.lastRoll ? { ...state.lastRoll } : null,
      blocked: state.blockedReason !== null,
      rollDeadlineAt: state.rollDeadlineAt,
      moveDeadlineAt: state.moveDeadlineAt,
      winnerId: state.winnerId,
      rankings: rankingsOf(state),
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
