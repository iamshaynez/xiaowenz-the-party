import type { MonsterCarRacePlan, MonsterCarRacerPlan } from '@party/games';
import type { MonsterCarBuild } from '@party/protocol';
import { hashPurpose, unitFromPurpose } from './deterministic';
import type { MonsterCarShowPlan } from './ShowPlan';

export type SocialMomentKind =
  | 'generic-wave'
  | 'duck-duet'
  | 'umbrella-cover'
  | 'bubble-pass'
  | 'ghost-boo'
  | 'lion-hop'
  | 'banana-cheer';

export interface SocialMoment {
  kind: SocialMomentKind;
  actor: string;
  target: string;
  /** Absolute milliseconds on the race timeline. */
  start: number;
  /** Duration in milliseconds. */
  duration: number;
  caption: string;
}

export interface SocialPose {
  cheer: number;
  look: number;
  lean: number;
}

const CAPTIONS: Record<SocialMomentKind, string> = {
  'generic-wave': '挥挥手，一起向前！',
  'duck-duet': '小鸭二重唱，嘎嘎加油！',
  'umbrella-cover': '撑开小伞，一起遮雨！',
  'bubble-pass': '吹个泡泡，传给好朋友！',
  'ghost-boo': '小鬼探头，轻轻吓你一下！',
  'lion-hop': '小狮子跳起来为你加油！',
  'banana-cheer': '香蕉车轮转呀转，快乐加油！',
};

function isDuckLike(build: MonsterCarBuild) {
  return build.driver === 'duck' || build.front === 'duck' || build.wheels === 'duck-float';
}

function featuredKind(build: MonsterCarBuild): SocialMomentKind | null {
  if (build.driver === 'ghost') return 'ghost-boo';
  if (build.driver === 'lion') return 'lion-hop';
  if (build.roof === 'umbrella') return 'umbrella-cover';
  if (build.rear === 'bubble') return 'bubble-pass';
  if (build.wheels === 'banana') return 'banana-cheer';
  if (isDuckLike(build)) return 'duck-duet';
  return null;
}

function orientPair(
  first: MonsterCarRacerPlan,
  second: MonsterCarRacerPlan,
  plan: MonsterCarRacePlan,
  pairIndex: number,
) {
  const firstKind = featuredKind(first.build);
  const secondKind = featuredKind(second.build);
  if (firstKind === 'duck-duet' && secondKind === 'duck-duet') {
    return { actor: first, target: second, kind: 'duck-duet' as const };
  }
  if (firstKind || secondKind) {
    const useFirst = firstKind && (!secondKind || unitFromPurpose(
      'monster-car.social.orientation', plan.id, first.playerId, second.playerId, pairIndex,
    ) < 0.5);
    return useFirst
      ? { actor: first, target: second, kind: firstKind! }
      : { actor: second, target: first, kind: secondKind! };
  }
  const useFirst = unitFromPurpose(
    'monster-car.social.wave-direction', plan.id, first.playerId, second.playerId,
  ) < 0.5;
  return {
    actor: useFirst ? first : second,
    target: useFirst ? second : first,
    kind: 'generic-wave' as const,
  };
}

/** Plans disjoint, deterministic pair moments without consulting the race RNG. */
export function createSocialMoments(plan: MonsterCarRacePlan): SocialMoment[] {
  const racers = plan.racers;
  if (racers.length < 2) return [];
  const count = Math.min(2, Math.floor(racers.length / 2));
  const offset = Math.floor(unitFromPurpose('monster-car.social.order', plan.id, plan.seed) * racers.length);
  const ordered = racers.map((_, index) => racers[(index + offset) % racers.length]!);
  const moments: SocialMoment[] = [];

  for (let index = 0; index < count; index += 1) {
    const first = ordered[index * 2]!;
    const second = ordered[index * 2 + 1]!;
    const { actor, target, kind } = orientPair(first, second, plan, index);
    const baseStart = count === 1 ? 10_800 : index === 0 ? 7_200 : 17_600;
    const jitter = Math.floor(unitFromPurpose(
      'monster-car.social.start', plan.id, actor.playerId, target.playerId,
    ) * 1_201) - 600;
    const start = Math.max(3_200, Math.min(plan.durationMs - 3_000, baseStart + jitter));
    const duration = 2_100 + Math.floor(unitFromPurpose(
      'monster-car.social.duration', plan.id, actor.playerId, target.playerId,
    ) * 401);
    moments.push({
      kind,
      actor: actor.playerId,
      target: target.playerId,
      start,
      duration,
      caption: CAPTIONS[kind],
    });
  }
  return moments.sort((left, right) => left.start - right.start);
}

/** Returns the one active moment; interval ends are exclusive and non-overlapping. */
export function sampleSocialMoment(
  show: Pick<MonsterCarShowPlan, 'socialMoments'>,
  atMs: number,
): SocialMoment | null {
  if (!Number.isFinite(atMs)) return null;
  return show.socialMoments.find((moment) => (
    atMs >= moment.start && atMs - moment.start < moment.duration
  )) ?? null;
}

const ZERO_POSE: SocialPose = { cheer: 0, look: 0, lean: 0 };

function cheerAmount(kind: SocialMomentKind) {
  switch (kind) {
    case 'lion-hop': return 1;
    case 'banana-cheer': return 0.9;
    case 'duck-duet': return 0.82;
    case 'ghost-boo': return 0.76;
    case 'generic-wave': return 0.68;
    case 'bubble-pass': return 0.58;
    case 'umbrella-cover': return 0.42;
  }
}

/** Samples an absolute, smoothly enveloped social pose with bounded outputs. */
export function sampleSocialPose(moment: SocialMoment, atMs: number): SocialPose {
  if (!Number.isFinite(atMs) || !Number.isFinite(moment.start) || !Number.isFinite(moment.duration) || moment.duration <= 0) {
    return { ...ZERO_POSE };
  }
  const elapsed = atMs - moment.start;
  if (elapsed < 0 || elapsed >= moment.duration) return { ...ZERO_POSE };
  const progress = elapsed / moment.duration;
  const envelope = Math.sin(progress * Math.PI);
  const wave = 0.72 + Math.abs(Math.sin(progress * Math.PI * 3)) * 0.28;
  const direction = hashPurpose(
    'monster-car.social.pose-direction', moment.actor, moment.target, moment.kind,
  ) % 2 === 0 ? 1 : -1;
  const lookAmount = moment.kind === 'ghost-boo' || moment.kind === 'bubble-pass' ? 0.72 : 0.48;
  const leanAmount = moment.kind === 'lion-hop' || moment.kind === 'banana-cheer' ? 0.16 : 0.09;

  return {
    cheer: Math.min(1, envelope * wave * cheerAmount(moment.kind)),
    look: direction * envelope * lookAmount,
    lean: direction * envelope * leanAmount * Math.sin(progress * Math.PI * 2),
  };
}
