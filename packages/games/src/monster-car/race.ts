import type { MonsterCarBuild } from '@party/protocol';
import { resolveMonsterCarReaction } from './parts';
import type { MonsterCarStimulus, ResolvedMonsterCarReaction } from './parts';

export const RACE_DURATION_MS = 30_000;
const SEGMENT_COUNT = 6;
const EVENT_PROGRESS = [0.15, 0.30, 0.46, 0.62, 0.78, 0.88] as const;

export type MonsterCarEnvironment = 'puddle' | 'log' | 'gust' | 'hill';

export interface MonsterCarCourseEvent {
  id: string;
  kind: MonsterCarEnvironment;
  stimulus: MonsterCarStimulus;
  progress: number;
  variant: number;
}

export interface MonsterCarPaceFrame {
  atMs: number;
  progress: number;
}

export interface MonsterCarReactionCue {
  eventId: string;
  environment: MonsterCarEnvironment;
  stimulus: MonsterCarStimulus;
  startAtMs: number;
  durationMs: number;
  intensity: number;
  primary: ResolvedMonsterCarReaction;
  secondary: ResolvedMonsterCarReaction[];
}

export interface MonsterCarRacerPlan {
  playerId: string;
  build: MonsterCarBuild;
  lane: number;
  paint: number;
  finishAtMs: number;
  pace: MonsterCarPaceFrame[];
  cues: MonsterCarReactionCue[];
  highlight: string;
}

export interface MonsterCarRacePlan {
  id: string;
  seed: number;
  durationMs: typeof RACE_DURATION_MS;
  events: MonsterCarCourseEvent[];
  racers: MonsterCarRacerPlan[];
  finishOrder: string[];
}

export interface MonsterCarFrameCar {
  playerId: string;
  progress: number;
  lane: number;
  place: number;
  activeCue: (MonsterCarReactionCue & { localProgress: number }) | null;
}

export interface MonsterCarRaceFrame {
  atMs: number;
  cars: MonsterCarFrameCar[];
  leaderId: string;
}

interface CreateRaceOptions {
  playerIds: string[];
  builds: Record<string, MonsterCarBuild>;
  seed: number;
  now: number;
}

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function shuffled<T>(values: readonly T[], rng: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other]!, result[index]!];
  }
  return result;
}

const ENVIRONMENTS: Record<MonsterCarEnvironment, MonsterCarStimulus> = {
  puddle: 'water',
  log: 'impact',
  gust: 'wind',
  hill: 'slope',
};

function createEvents(rng: () => number): MonsterCarCourseEvent[] {
  const kinds = Object.keys(ENVIRONMENTS) as MonsterCarEnvironment[];
  let previous: MonsterCarEnvironment | null = null;
  return EVENT_PROGRESS.map((progress, index) => {
    const choices = kinds.filter((kind) => kind !== previous);
    const kind = choices[Math.floor(rng() * choices.length)] ?? 'puddle';
    previous = kind;
    return {
      id: `forest-event-${index + 1}`,
      kind,
      stimulus: ENVIRONMENTS[kind],
      progress,
      variant: Math.floor(rng() * 3),
    };
  });
}

function createPace(rng: () => number, finishAtMs: number): MonsterCarPaceFrame[] {
  const weights = Array.from({ length: SEGMENT_COUNT }, () => 0.82 + rng() * 0.36);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = 0;
  const pace: MonsterCarPaceFrame[] = [{ atMs: 0, progress: 0 }];
  for (let index = 0; index < SEGMENT_COUNT; index += 1) {
    elapsed += finishAtMs * (weights[index]! / total);
    pace.push({ atMs: elapsed, progress: (index + 1) / SEGMENT_COUNT });
  }
  pace[pace.length - 1] = { atMs: finishAtMs, progress: 1 };
  return pace;
}

function crossingTime(pace: MonsterCarPaceFrame[], progress: number) {
  for (let index = 1; index < pace.length; index += 1) {
    const right = pace[index]!;
    const left = pace[index - 1]!;
    if (progress <= right.progress) {
      const ratio = (progress - left.progress) / (right.progress - left.progress);
      return left.atMs + ratio * (right.atMs - left.atMs);
    }
  }
  return pace[pace.length - 1]?.atMs ?? RACE_DURATION_MS;
}

export function sampleMonsterCarPace(pace: MonsterCarPaceFrame[], atMs: number) {
  if (atMs <= 0) return 0;
  const finish = pace[pace.length - 1];
  if (!finish) return 0;
  if (atMs >= finish.atMs) {
    return 1 + Math.min(0.08, ((atMs - finish.atMs) / 2_500) * 0.08);
  }
  for (let index = 1; index < pace.length; index += 1) {
    const right = pace[index]!;
    const left = pace[index - 1]!;
    if (atMs <= right.atMs) {
      const ratio = (atMs - left.atMs) / (right.atMs - left.atMs);
      return left.progress + (right.progress - left.progress) * ratio;
    }
  }
  return 1;
}

export function createMonsterCarRacePlan(options: CreateRaceOptions): MonsterCarRacePlan {
  const seed = options.seed >>> 0;
  const rng = randomFrom(seed);
  const events = createEvents(rng);
  const finishOrder = shuffled(options.playerIds, rng);
  const finishRank = new Map(finishOrder.map((playerId, index) => [playerId, index]));

  const racers = options.playerIds.map((playerId, index) => {
    const build = options.builds[playerId];
    if (!build) throw new Error(`缺少玩家 ${playerId} 的怪兽汽车`);
    const rank = finishRank.get(playerId) ?? 0;
    const finishAtMs = 28_600 + rank * 280;
    const pace = createPace(rng, finishAtMs);
    const cues = events.map((event): MonsterCarReactionCue => {
      const reaction = resolveMonsterCarReaction(build, event.stimulus);
      const startAtMs = Math.max(0, crossingTime(pace, event.progress) - 120);
      return {
        eventId: event.id,
        environment: event.kind,
        stimulus: event.stimulus,
        startAtMs,
        durationMs: reaction.primary.durationMs,
        intensity: reaction.primary.intensity * (0.94 + rng() * 0.12),
        primary: { ...reaction.primary },
        secondary: reaction.secondary.map((item) => ({ ...item })),
      };
    });
    const featured = cues.find((cue) => cue.primary.slot !== 'chassis') ?? cues[0];
    return {
      playerId,
      build: { ...build },
      lane: index - (options.playerIds.length - 1) / 2,
      paint: index,
      finishAtMs,
      pace,
      cues,
      highlight: featured?.primary.highlight ?? '森林快乐旅行家',
    };
  });

  return {
    id: `forest-${options.now.toString(36)}-${seed.toString(36)}`,
    seed,
    durationMs: RACE_DURATION_MS,
    events,
    racers,
    finishOrder,
  };
}

export function sampleMonsterCarFrame(plan: MonsterCarRacePlan, requestedAtMs: number): MonsterCarRaceFrame {
  const atMs = Math.max(0, Math.min(plan.durationMs, requestedAtMs));
  const cars = plan.racers.map((racer) => {
    const progress = sampleMonsterCarPace(racer.pace, atMs);
    const cue = racer.cues.find((candidate) => (
      atMs >= candidate.startAtMs && atMs <= candidate.startAtMs + candidate.durationMs
    ));
    return {
      playerId: racer.playerId,
      progress,
      lane: racer.lane,
      place: 1,
      activeCue: cue ? {
        ...cue,
        localProgress: Math.max(0, Math.min(1, (atMs - cue.startAtMs) / cue.durationMs)),
      } : null,
    };
  });
  const ordered = [...cars].sort((left, right) => (
    right.progress - left.progress
    || plan.racers.findIndex((racer) => racer.playerId === left.playerId)
      - plan.racers.findIndex((racer) => racer.playerId === right.playerId)
  ));
  ordered.forEach((car, index) => {
    const target = cars.find((candidate) => candidate.playerId === car.playerId);
    if (target) target.place = index + 1;
  });
  return { atMs, cars, leaderId: ordered[0]?.playerId ?? plan.racers[0]?.playerId ?? '' };
}
