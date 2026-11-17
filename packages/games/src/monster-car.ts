import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameDefinition } from '@party/game-core';
import { monsterCarBuildSchema } from '@party/protocol';
import type { MonsterCarBuild } from '@party/protocol';
import { createMonsterCarRacePlan } from './monster-car/race';
import type { MonsterCarRacePlan } from './monster-car/race';

export const COUNTDOWN_DURATION_MS = 3_200;
export const BUILDING_DURATION_MS = 120_000;

export interface MonsterCarStanding {
  playerId: string;
  place: number;
  finishAtMs: number;
  highlight: string;
}

export interface MonsterCarView {
  id: 'monster-car';
  phase: 'building' | 'countdown' | 'racing' | 'finished';
  participantIds: string[];
  builds: Record<string, MonsterCarBuild>;
  readyPlayerIds: string[];
  buildingDeadlineAt: number;
  raceStartsAt: number | null;
  raceEndsAt: number | null;
  plan: MonsterCarRacePlan | null;
  standings: MonsterCarStanding[];
}

interface MonsterCarState {
  participantIds: string[];
  phase: MonsterCarView['phase'];
  seed: number;
  builds: Record<string, MonsterCarBuild>;
  readyPlayerIds: string[];
  buildingDeadlineAt: number;
  raceStartsAt: number | null;
  raceEndsAt: number | null;
  plan: MonsterCarRacePlan | null;
  standings: MonsterCarStanding[];
}

const DEFAULT_BUILDS: MonsterCarBuild[] = [
  { wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear' },
  { wheels: 'donut', front: 'duck', rear: 'bubble', roof: 'umbrella', driver: 'frog' },
  { wheels: 'spring', front: 'train', rear: 'rocket', roof: 'propeller', driver: 'alien' },
  { wheels: 'balloon', front: 'scoop', rear: 'tail', roof: 'antenna', driver: 'duck' },
];

function create(options: CreateGameOptions): MonsterCarState {
  if (options.rounds !== 1) throw new DomainError('INVALID_ROUNDS', '怪兽汽车每次进行一场森林旅行');
  if (options.playerIds.length < 2 || options.playerIds.length > 4) {
    throw new DomainError('INVALID_PLAYER_COUNT', '怪兽汽车需要 2–4 位玩家');
  }
  const builds: Record<string, MonsterCarBuild> = {};
  options.playerIds.forEach((playerId, index) => {
    const fallback = DEFAULT_BUILDS[index] ?? DEFAULT_BUILDS[0]!;
    builds[playerId] = { ...fallback };
  });
  return {
    participantIds: [...options.playerIds],
    phase: 'building',
    seed: Math.floor(options.rng() * 4_294_967_296) >>> 0,
    builds,
    readyPlayerIds: [],
    buildingDeadlineAt: options.now + BUILDING_DURATION_MS,
    raceStartsAt: null,
    raceEndsAt: null,
    plan: null,
    standings: [],
  };
}

function beginCountdown(state: MonsterCarState, now: number) {
  const raceStartsAt = now + COUNTDOWN_DURATION_MS;
  state.phase = 'countdown';
  state.readyPlayerIds = [...state.participantIds];
  state.raceStartsAt = raceStartsAt;
  state.raceEndsAt = raceStartsAt + 30_000;
  state.plan = createMonsterCarRacePlan({
    playerIds: state.participantIds,
    builds: state.builds,
    seed: state.seed,
    now,
  });
  state.standings = [];
}

function finish(state: MonsterCarState) {
  state.phase = 'finished';
  if (!state.plan) throw new Error('赛事尚未建立');
  state.standings = state.plan.finishOrder.map((playerId, index) => {
    const racer = state.plan?.racers.find((entry) => entry.playerId === playerId);
    if (!racer) throw new Error(`赛事缺少玩家 ${playerId}`);
    return {
      playerId,
      place: index + 1,
      finishAtMs: racer.finishAtMs,
      highlight: racer.highlight,
    };
  });
}

function act(state: MonsterCarState, context: GameActionContext) {
  switch (context.action.type) {
    case 'build-car': {
      if (!state.participantIds.includes(context.playerId)) {
        throw new DomainError('NOT_A_PARTICIPANT', '旁观者可以一起看怪兽汽车');
      }
      if (state.phase !== 'building') throw new DomainError('INVALID_PHASE', '汽车已经出发，不能再改装');
      const parsed = monsterCarBuildSchema.safeParse(context.action.build);
      if (!parsed.success) throw new DomainError('INVALID_BUILD', '这辆汽车的组件不完整');
      state.builds[context.playerId] = { ...parsed.data };
      if (!state.readyPlayerIds.includes(context.playerId)) state.readyPlayerIds.push(context.playerId);
      if (state.participantIds.every((id) => state.readyPlayerIds.includes(id))) beginCountdown(state, context.now);
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '森林旅行还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: 1,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「怪兽汽车」的动作');
  }
}

export const monsterCarGame: GameDefinition<MonsterCarState, MonsterCarView> = {
  id: 'monster-car',
  version: 1,
  name: '怪兽汽车',
  emoji: '🚙',
  description: '装出全世界独一无二的怪车，一起穿过会互动的魔法森林。',
  tags: ['幼儿', '创作', '动画'],
  roundsOptions: [1],
  minPlayers: 2,
  maxPlayers: 4,
  create,
  act,
  advanceTime(state, context) {
    if (state.phase === 'building' && context.now >= state.buildingDeadlineAt) {
      beginCountdown(state, state.buildingDeadlineAt);
      if (context.now < (state.raceStartsAt ?? Number.POSITIVE_INFINITY)) return true;
    }
    if (state.phase === 'countdown') {
      if (state.raceEndsAt !== null && context.now >= state.raceEndsAt) {
        finish(state);
        return true;
      }
      if (state.raceStartsAt !== null && context.now >= state.raceStartsAt) {
        state.phase = 'racing';
        return true;
      }
    }
    if (state.phase === 'racing' && state.raceEndsAt !== null && context.now >= state.raceEndsAt) {
      finish(state);
      return true;
    }
    return false;
  },
  view(state): MonsterCarView {
    return {
      id: 'monster-car',
      phase: state.phase,
      participantIds: [...state.participantIds],
      builds: Object.fromEntries(Object.entries(state.builds).map(([id, build]) => [id, { ...build }])),
      readyPlayerIds: [...state.readyPlayerIds],
      buildingDeadlineAt: state.buildingDeadlineAt,
      raceStartsAt: state.raceStartsAt,
      raceEndsAt: state.raceEndsAt,
      plan: state.plan ? structuredClone(state.plan) : null,
      standings: state.phase === 'finished' ? state.standings.map((entry) => ({ ...entry })) : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
