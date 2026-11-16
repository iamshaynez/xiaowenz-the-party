import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameDefinition } from '@party/game-core';
import {
  CAR_PARTS,
  DEFAULT_CAR_BUILD,
  cloneCarBuild,
} from './catalog';
import type { CarBuild, CarPart, CarSlot } from './catalog';
import { FALLBACK_CAR_AWARD_ID, assignCarAwards, getCarAward } from './awards';
import {
  CAR_SHOW_DURATION_MS,
  createCarShowPlan,
  deriveCarShowSeed,
  toPublicCarShowPlan,
} from './show';
import type { CarShowPlan, PublicCarShowPlan } from './show';

export const CAN_DRIVE_BUILD_DURATION_MS = 120_000;
export const CAN_DRIVE_TEST_DURATION_MS = CAR_SHOW_DURATION_MS;
export const CAN_DRIVE_AWARD_DURATION_MS = 7_000;

export type CanDriveBuild = CarBuild;
export type CanDrivePhase = 'building' | 'presenting' | 'finished';
export type CanDriveCurrentKind = 'test' | 'award';

export interface CanDriveAwardView {
  awardId: string;
  name: string;
  icon: string;
  description: string;
}

export interface CanDriveRevealedAwardView extends CanDriveAwardView {
  playerId: string;
}

export interface CanDriveFinalCarView extends CanDriveAwardView {
  playerId: string;
  build: CanDriveBuild;
}

export interface CanDriveCurrentView {
  id: string;
  kind: CanDriveCurrentKind;
  index: number;
  playerId: string;
  startedAt: number;
  endsAt: number;
  award: CanDriveAwardView | null;
  show: PublicCarShowPlan;
}

export interface CanDriveView {
  id: 'can-drive';
  phase: CanDrivePhase;
  round: number;
  totalCars: number;
  orderPlayerIds: string[];
  ownBuild: CanDriveBuild | null;
  ownReady: boolean;
  readyPlayerIds: string[];
  buildDeadlineAt: number | null;
  current: CanDriveCurrentView | null;
  awards: CanDriveRevealedAwardView[];
  finalCars: CanDriveFinalCarView[];
}

interface CanDriveCar {
  playerId: string;
  build: CanDriveBuild;
  plan: CarShowPlan;
  awardId: string;
}

interface CanDriveCurrent {
  kind: CanDriveCurrentKind;
  index: number;
  playerId: string;
  startedAt: number;
  endsAt: number;
}

interface CanDriveState {
  participantIds: string[];
  seed: number;
  round: number;
  phase: CanDrivePhase;
  builds: Record<string, CanDriveBuild>;
  readyPlayerIds: string[];
  buildDeadlineAt: number | null;
  showStartedAt: number | null;
  current: CanDriveCurrent | null;
  cars: CanDriveCar[];
  awards: Array<{ playerId: string; awardId: string }>;
}

function create(options: CreateGameOptions): CanDriveState {
  if (options.rounds !== 1) throw new DomainError('INVALID_ROUNDS', '「这车能开？」每局只展示一轮');
  const builds: Record<string, CanDriveBuild> = {};
  for (const playerId of options.playerIds) builds[playerId] = cloneCarBuild(DEFAULT_CAR_BUILD);
  return {
    participantIds: [...options.playerIds],
    seed: Math.floor(options.rng() * 0x1_0000_0000) >>> 0,
    round: 1,
    phase: 'building',
    builds,
    readyPlayerIds: [],
    buildDeadlineAt: options.now + CAN_DRIVE_BUILD_DURATION_MS,
    showStartedAt: null,
    current: null,
    cars: [],
    awards: [],
  };
}

function setCurrent(state: CanDriveState, kind: CanDriveCurrentKind, index: number) {
  const car = state.cars[index];
  if (!car || state.showStartedAt === null) throw new Error('车辆展示队列尚未建立');
  const startedAt = kind === 'test'
    ? state.showStartedAt + index * CAN_DRIVE_TEST_DURATION_MS
    : state.showStartedAt + state.cars.length * CAN_DRIVE_TEST_DURATION_MS + index * CAN_DRIVE_AWARD_DURATION_MS;
  state.current = {
    kind,
    index,
    playerId: car.playerId,
    startedAt,
    endsAt: startedAt + (kind === 'test' ? CAN_DRIVE_TEST_DURATION_MS : CAN_DRIVE_AWARD_DURATION_MS),
  };
}

function startPresenting(state: CanDriveState, startedAt: number) {
  const cars = state.participantIds.map((playerId, index) => {
    const build = cloneCarBuild(state.builds[playerId] ?? DEFAULT_CAR_BUILD);
    return {
      playerId,
      build,
      plan: createCarShowPlan(build, deriveCarShowSeed(state.seed, state.round, index)),
    };
  });
  const assignments = assignCarAwards(cars.map((car) => ({ playerId: car.playerId, stats: car.plan.stats })));
  state.cars = cars.map((car, index) => ({
    ...car,
    awardId: assignments[index]?.awardId ?? FALLBACK_CAR_AWARD_ID,
  }));
  state.phase = 'presenting';
  state.buildDeadlineAt = null;
  state.showStartedAt = startedAt;
  state.awards = [];
  setCurrent(state, 'test', 0);
}

function revealCurrentAward(state: CanDriveState) {
  const current = state.current;
  if (!current || current.kind !== 'award') return;
  const car = state.cars[current.index];
  if (!car || state.awards.some((award) => award.playerId === car.playerId)) return;
  state.awards.push({ playerId: car.playerId, awardId: car.awardId });
}

function finish(state: CanDriveState) {
  state.phase = 'finished';
  state.current = null;
  state.showStartedAt = null;
  state.buildDeadlineAt = null;
}

function requireParticipant(state: CanDriveState, playerId: string) {
  if (!state.participantIds.includes(playerId)) {
    throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
  }
}

function awardView(awardId: string): CanDriveAwardView {
  const award = getCarAward(awardId);
  if (!award) throw new Error('车辆奖项不存在');
  return {
    awardId: award.id,
    name: award.name,
    icon: award.icon,
    description: award.description,
  };
}

export const canDriveGame: GameDefinition<CanDriveState, CanDriveView> = {
  id: 'can-drive',
  version: 1,
  name: '这车能开？',
  emoji: '🚗',
  description: '用离谱零件拼出梦想座驾，看它接受四十秒认真又不正经的路测。',
  tags: ['创意', '搞笑', '展示'],
  roundsOptions: [1],
  minPlayers: 2,
  maxPlayers: 6,
  create,
  act(state, context) {
    switch (context.action.type) {
      case 'select-car-part': {
        if (state.phase !== 'building') throw new DomainError('INVALID_PHASE', '车辆已经冻结，不能再改装');
        requireParticipant(state, context.playerId);
        const slot: CarSlot = context.action.slot;
        const partId = context.action.partId;
        const availableParts: readonly CarPart[] | undefined = CAR_PARTS[slot];
        if (!availableParts?.some((part) => part.id === partId)) {
          throw new DomainError('INVALID_PART', '这个零件不属于所选位置');
        }
        state.builds[context.playerId] = {
          ...(state.builds[context.playerId] ?? DEFAULT_CAR_BUILD),
          [slot]: partId,
        };
        state.readyPlayerIds = state.readyPlayerIds.filter((playerId) => playerId !== context.playerId);
        return;
      }
      case 'submit-car': {
        if (state.phase !== 'building') throw new DomainError('INVALID_PHASE', '车辆已经提交，展示正在进行');
        requireParticipant(state, context.playerId);
        if (!state.readyPlayerIds.includes(context.playerId)) state.readyPlayerIds.push(context.playerId);
        if (state.participantIds.every((playerId) => state.readyPlayerIds.includes(playerId))) {
          startPresenting(state, context.now);
        }
        return;
      }
      case 'play-again': {
        if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
        if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '本局还没有结束');
        state.round += 1;
        state.phase = 'building';
        state.readyPlayerIds = [];
        state.buildDeadlineAt = context.now + CAN_DRIVE_BUILD_DURATION_MS;
        state.showStartedAt = null;
        state.current = null;
        state.cars = [];
        state.awards = [];
        return;
      }
      default:
        throw new DomainError('INVALID_ACTION', '这不是「这车能开？」的动作');
    }
  },
  advanceTime(state, context) {
    let changed = false;
    if (state.phase === 'building') {
      if (state.buildDeadlineAt === null || context.now < state.buildDeadlineAt) return false;
      startPresenting(state, state.buildDeadlineAt);
      changed = true;
    }

    const transitionLimit = state.participantIds.length * 2 + 1;
    for (let transition = 0; transition < transitionLimit && state.phase === 'presenting'; transition += 1) {
      const current = state.current;
      if (!current || context.now < current.endsAt) break;
      if (current.kind === 'test') {
        if (current.index + 1 < state.cars.length) {
          setCurrent(state, 'test', current.index + 1);
        } else {
          setCurrent(state, 'award', 0);
          revealCurrentAward(state);
        }
      } else if (current.index + 1 < state.cars.length) {
        setCurrent(state, 'award', current.index + 1);
        revealCurrentAward(state);
      } else {
        finish(state);
      }
      changed = true;
    }
    return changed;
  },
  view(state, playerId): CanDriveView {
    const isParticipant = state.participantIds.includes(playerId);
    const ownBuild = state.builds[playerId];
    let current: CanDriveCurrentView | null = null;
    if (state.current) {
      const car = state.cars[state.current.index];
      if (!car) throw new Error('当前车辆不在展示队列中');
      current = {
        id: `${state.round}:${state.current.kind}:${state.current.index}`,
        kind: state.current.kind,
        index: state.current.index,
        playerId: state.current.playerId,
        startedAt: state.current.startedAt,
        endsAt: state.current.endsAt,
        award: state.current.kind === 'award' ? awardView(car.awardId) : null,
        show: toPublicCarShowPlan(car.plan),
      };
    }
    return {
      id: 'can-drive',
      phase: state.phase,
      round: state.round,
      totalCars: state.participantIds.length,
      orderPlayerIds: [...state.participantIds],
      ownBuild: isParticipant && ownBuild ? cloneCarBuild(ownBuild) : null,
      ownReady: isParticipant && state.readyPlayerIds.includes(playerId),
      readyPlayerIds: state.participantIds.filter((id) => state.readyPlayerIds.includes(id)),
      buildDeadlineAt: state.buildDeadlineAt,
      current,
      awards: state.awards.map((award) => ({ playerId: award.playerId, ...awardView(award.awardId) })),
      finalCars: state.phase === 'finished'
        ? state.cars.map((car) => ({ playerId: car.playerId, build: cloneCarBuild(car.build), ...awardView(car.awardId) }))
        : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
