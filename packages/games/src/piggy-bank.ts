import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameContext, GameDefinition } from '@party/game-core';

export const CHOOSING_DURATION_MS = 30_000;
export const REVEAL_DURATION_MS = 8_000;
export const PEACE_REVEAL_DURATION_MS = 3_000;
export const FUNDING_PER_PLAYER = 1;
export const RAIN_BONUS_PER_PLAYER = 2;
export const CONSOLATION_COIN = 1;
export const ROUNDS_OPTIONS = [4, 6, 8] as const;

// 事件分布：平常 45% / 金币雨 15% / 烫手 12% / 盲罐 12% / 纸糊 10% / 警报 6%（第 2 轮起掷骰）。
const EVENT_TABLE: ReadonlyArray<readonly [PiggyBankEvent, number]> = [
  ['none', 0.45],
  ['rain', 0.15],
  ['hot', 0.12],
  ['blind', 0.12],
  ['paper', 0.10],
  ['alarm', 0.06],
];

export type PiggyBankEvent = 'none' | 'rain' | 'hot' | 'blind' | 'paper' | 'alarm';
export type PiggyBankChoice = 'guard' | 'smash';

export interface PiggyBankRoundOutcome {
  round: number;
  event: PiggyBankEvent;
  smashers: string[];
  payouts: Record<string, number>;
  potBefore: number;
  potAfter: number;
  blindBonus: number;
}

export interface PiggyBankView {
  id: 'piggy-bank';
  phase: 'choosing' | 'reveal' | 'finished';
  round: number;
  roundsRange: [number, number];
  pot: number | null;
  event: 'rain' | 'hot' | 'blind' | null;
  ownHammers: number;
  hammers: Record<string, number>;
  ownChoice: PiggyBankChoice | null;
  submittedPlayerIds: string[];
  deadlineAt: number | null;
  coins: Record<string, number>;
  lastRound: PiggyBankRoundOutcome | null;
  finalSplit: number;
  winners: string[];
}

interface PiggyBankState {
  participantIds: string[];
  nominalRounds: number;
  // 保密字段：真实落幕轮与暗牌事件只存在于服务端状态，绝不进入任何玩家视图。
  finalRound: number;
  round: number;
  phase: 'choosing' | 'reveal' | 'finished';
  pot: number;
  event: PiggyBankEvent;
  blindBonus: number;
  choices: Record<string, PiggyBankChoice>;
  hammers: Record<string, number>;
  coins: Record<string, number>;
  deadlineAt: number | null;
  revealDeadlineAt: number | null;
  lastRound: PiggyBankRoundOutcome | null;
  finalSplit: number;
  winners: string[];
}

function hammerCountFor(rounds: number, playerCount: number) {
  return Math.min(Math.ceil((rounds + 1) / playerCount), 2);
}

function rollEvent(rng: () => number): PiggyBankEvent {
  let roll = rng();
  for (const [event, chance] of EVENT_TABLE) {
    if (roll < chance) return event;
    roll -= chance;
  }
  return 'none';
}

function create(options: CreateGameOptions): PiggyBankState {
  if (!ROUNDS_OPTIONS.includes(options.rounds as (typeof ROUNDS_OPTIONS)[number])) {
    throw new DomainError('INVALID_ROUNDS', '存钱罐支持 4、6 或 8 轮');
  }
  const playerCount = options.playerIds.length;
  const hammers = Object.fromEntries(
    options.playerIds.map((id) => [id, hammerCountFor(options.rounds, playerCount)]),
  );
  return {
    participantIds: [...options.playerIds],
    nominalRounds: options.rounds,
    finalRound: options.rounds + Math.floor(options.rng() * 3) - 1,
    round: 1,
    phase: 'choosing',
    pot: playerCount * FUNDING_PER_PLAYER,
    event: 'none',
    blindBonus: 0,
    choices: {},
    hammers,
    coins: Object.fromEntries(options.playerIds.map((id) => [id, 0])),
    deadlineAt: options.now + CHOOSING_DURATION_MS,
    revealDeadlineAt: null,
    lastRound: null,
    finalSplit: 0,
    winners: [],
  };
}

function resolveRound(state: PiggyBankState, now: number) {
  const smashers = state.participantIds.filter((id) => state.choices[id] === 'smash');
  const guards = state.participantIds.filter((id) => state.choices[id] !== 'smash');
  const potBefore = state.pot;
  const payouts: Record<string, number> = {};
  const award = (id: string, amount: number) => {
    if (amount > 0) payouts[id] = (payouts[id] ?? 0) + amount;
  };
  let potAfter = state.pot;

  if (smashers.length === 0) {
    // 全员守护：罐子无损顺延，无任何支出。
  } else if (state.event === 'paper') {
    // 纸糊罐：砸了白砸，锤子照没，真罐无损；守护者围观拿安慰币。
    for (const id of guards) award(id, CONSOLATION_COIN);
  } else if (state.event === 'alarm' && smashers.length === 1) {
    // 警报轮：独砸者触发警报一无所获，罐子平分给其他所有人。
    const share = Math.floor(potBefore / guards.length);
    for (const id of guards) award(id, share);
    potAfter = potBefore - share * guards.length;
  } else if (state.event === 'hot') {
    // 烫手罐：砸罐者只能拿走一半，另一半留在罐里继续攒。
    const lootable = Math.floor(potBefore / 2);
    const share = Math.floor(lootable / smashers.length);
    for (const id of smashers) award(id, share);
    potAfter = potBefore - share * smashers.length;
    for (const id of guards) award(id, CONSOLATION_COIN);
  } else {
    // 平常 / 金币雨 / 盲罐 / 警报轮多人同砸：砸者平分整罐，零头留在罐里。
    const share = Math.floor(potBefore / smashers.length);
    for (const id of smashers) award(id, share);
    potAfter = potBefore - share * smashers.length;
    for (const id of guards) award(id, CONSOLATION_COIN);
  }

  for (const id of state.participantIds) {
    const payout = payouts[id] ?? 0;
    if (payout > 0) state.coins[id] = (state.coins[id] ?? 0) + payout;
  }
  for (const id of smashers) state.hammers[id] = Math.max(0, (state.hammers[id] ?? 0) - 1);
  state.pot = potAfter;
  state.lastRound = {
    round: state.round,
    event: state.event,
    smashers,
    payouts,
    potBefore,
    potAfter,
    blindBonus: state.event === 'blind' ? state.blindBonus : 0,
  };
  state.phase = 'reveal';
  state.deadlineAt = null;
  state.revealDeadlineAt = now + REVEAL_DURATION_MS;
}

function beginRound(state: PiggyBankState, context: GameContext) {
  state.round += 1;
  state.event = rollEvent(context.rng);
  state.blindBonus = 0;
  const playerCount = state.participantIds.length;
  const potBefore = state.pot;
  state.pot += playerCount * FUNDING_PER_PLAYER;
  if (state.event === 'rain') state.pot += playerCount * RAIN_BONUS_PER_PLAYER;
  if (state.event === 'blind') {
    // 盲罐轮：黑暗中投币 0~2 枚/人，砸罐或轮末才揭晓。
    state.blindBonus = playerCount * Math.floor(context.rng() * 3);
    state.pot += state.blindBonus;
  }
  state.choices = {};

  if (!state.participantIds.some((id) => (state.hammers[id] ?? 0) > 0)) {
    // 全员无锤：强制和平轮，快进展示罐子变大后直接进入下一轮。
    state.phase = 'reveal';
    state.deadlineAt = null;
    state.revealDeadlineAt = context.now + PEACE_REVEAL_DURATION_MS;
    state.lastRound = {
      round: state.round,
      event: state.event,
      smashers: [],
      payouts: {},
      potBefore,
      potAfter: state.pot,
      blindBonus: state.event === 'blind' ? state.blindBonus : 0,
    };
    return;
  }
  state.phase = 'choosing';
  state.deadlineAt = context.now + CHOOSING_DURATION_MS;
  state.revealDeadlineAt = null;
  state.lastRound = null;
}

function finish(state: PiggyBankState) {
  // 终局信任加成：落幕时罐中剩余金币平分给所有参与者。
  const share = Math.floor(state.pot / state.participantIds.length);
  if (share > 0) {
    for (const id of state.participantIds) state.coins[id] = (state.coins[id] ?? 0) + share;
    state.pot -= share * state.participantIds.length;
  }
  state.finalSplit = share;
  const highest = Math.max(0, ...Object.values(state.coins));
  state.winners = highest === 0 ? [] : state.participantIds.filter((id) => state.coins[id] === highest);
  state.phase = 'finished';
  state.deadlineAt = null;
  state.revealDeadlineAt = null;
}

function act(state: PiggyBankState, context: GameActionContext) {
  switch (context.action.type) {
    case 'choose': {
      if (state.phase !== 'choosing') throw new DomainError('INVALID_PHASE', '本轮已经揭晓');
      if (!state.participantIds.includes(context.playerId)) {
        throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
      }
      const choice = context.action.choice;
      if (choice === 'smash' && (state.hammers[context.playerId] ?? 0) <= 0) {
        throw new DomainError('NO_HAMMER', '你的锤子已经用完了');
      }
      // 揭晓前可以反悔改选。
      state.choices[context.playerId] = choice;
      const holders = state.participantIds.filter((id) => (state.hammers[id] ?? 0) > 0);
      if (holders.every((id) => state.choices[id] !== undefined)) resolveRound(state, context.now);
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '本局还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: state.nominalRounds,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「存钱罐」的动作');
  }
}

export const piggyBankGame: GameDefinition<PiggyBankState, PiggyBankView> = {
  id: 'piggy-bank',
  version: 1,
  name: '存钱罐',
  emoji: '🏺',
  description: '一起往存钱罐里攒钱，砸罐的人平分。天降事件随时搅局，落幕轮保密。',
  tags: ['家庭', '儿童', '反转'],
  roundsOptions: ROUNDS_OPTIONS,
  minPlayers: 3,
  maxPlayers: 12,
  create,
  act,
  advanceTime(state, context) {
    if (state.phase === 'choosing' && state.deadlineAt !== null && context.now >= state.deadlineAt) {
      // 到点未提交的玩家视为守护。
      resolveRound(state, context.now);
      return true;
    }
    if (state.phase === 'reveal' && state.revealDeadlineAt !== null && context.now >= state.revealDeadlineAt) {
      if (state.round >= state.finalRound) {
        finish(state);
      } else {
        beginRound(state, context);
      }
      return true;
    }
    return false;
  },
  view(state, playerId): PiggyBankView {
    const blindMasked = state.phase === 'choosing' && state.event === 'blind';
    const visibleEvent = state.phase === 'choosing' && state.event !== 'none' && state.event !== 'paper' && state.event !== 'alarm'
      ? state.event
      : null;
    const highest = Math.max(0, ...Object.values(state.coins));
    return {
      id: 'piggy-bank',
      phase: state.phase,
      round: state.round,
      roundsRange: [Math.max(1, state.nominalRounds - 1), state.nominalRounds + 1],
      pot: blindMasked ? null : state.pot,
      event: visibleEvent,
      ownHammers: state.hammers[playerId] ?? 0,
      hammers: { ...state.hammers },
      ownChoice: state.choices[playerId] ?? null,
      submittedPlayerIds: state.participantIds.filter((id) => state.choices[id] !== undefined),
      deadlineAt: state.phase === 'choosing' ? state.deadlineAt : state.revealDeadlineAt,
      coins: { ...state.coins },
      lastRound: state.lastRound ? {
        round: state.lastRound.round,
        event: state.lastRound.event,
        smashers: [...state.lastRound.smashers],
        payouts: { ...state.lastRound.payouts },
        potBefore: state.lastRound.potBefore,
        potAfter: state.lastRound.potAfter,
        blindBonus: state.lastRound.blindBonus,
      } : null,
      finalSplit: state.finalSplit,
      winners: state.phase === 'finished' && highest > 0 ? state.participantIds.filter((id) => state.coins[id] === highest) : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
