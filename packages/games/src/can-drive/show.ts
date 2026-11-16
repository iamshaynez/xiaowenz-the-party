import { CAR_ENVIRONMENTS } from './environments';
import type { CarEnvironment, CarEnvironmentCategory, CarEnvironmentId } from './environments';
import { cloneCarBuild, getBuildParts } from './catalog';
import type { CarBuild, CarPart } from './catalog';

export const CAR_SEGMENT_DURATION_MS = 7_000;
export const CAR_SHOW_DURATION_MS = 40_000;
export const CAR_JUMP_START_MS = 28_000;

export interface CarMotionProfile {
  power: number;
  grip: number;
  suspension: number;
  stability: number;
  drag: number;
  buoyancy: number;
  bounce: number;
  lift: number;
  style: number;
  chaos: number;
}

export interface CarShowEnvironment extends CarEnvironment {
  startMs: number;
  endMs: number;
  durationMs: number;
}

export type CarShowEventKind =
  | 'enter'
  | 'reaction'
  | 'bounce'
  | 'splash'
  | 'collision'
  | 'spin'
  | 'stuck'
  | 'jump'
  | 'land'
  | 'finish';

export interface CarShowEvent {
  atMs: number;
  kind: CarShowEventKind;
  environmentId: CarEnvironmentId;
  text: string;
  intensity: number;
}

export interface CarShowHighlight {
  startMs: number;
  endMs: number;
  eventIndex: number;
  title: string;
}

export interface CarShowStats {
  distanceM: number;
  topSpeedKph: number;
  averageSpeedKph: number;
  airtimeMs: number;
  jumpDistanceM: number;
  maxHeightM: number;
  collisions: number;
  softBlocksHit: number;
  spins: number;
  splashes: number;
  stuckMs: number;
  reactions: number;
  stylePoints: number;
  chaosPoints: number;
  landedUpright: boolean;
  finished: boolean;
}

export interface PublicCarShowPlan {
  seed: number;
  durationMs: number;
  build: CarBuild;
  motion: CarMotionProfile;
  environments: CarShowEnvironment[];
  events: CarShowEvent[];
  highlight: CarShowHighlight;
}

export interface CarShowPlan extends PublicCarShowPlan {
  stats: CarShowStats;
}

export interface CarShowPose {
  atMs: number;
  segmentIndex: number;
  environmentId: CarEnvironmentId;
  progress: number;
  speedKph: number;
  distanceM: number;
  heightM: number;
  pitch: number;
  roll: number;
}

const MOTION_AXES = [
  'power', 'grip', 'suspension', 'stability', 'drag', 'buoyancy', 'bounce', 'lift', 'style', 'chaos',
] as const;

const TAG_EFFECTS: Readonly<Record<string, Partial<CarMotionProfile>>> = {
  agile: { grip: 1, stability: 0.5 },
  balanced: { grip: 0.5, stability: 1 },
  soft: { suspension: 0.5 },
  precise: { grip: 1, stability: 1 },
  stable: { stability: 1.5 },
  'high-tech': { power: 0.5, style: 1 },
  light: { drag: -0.4, stability: -0.3, lift: 0.2 },
  slippery: { grip: -2, chaos: 1 },
  chaotic: { stability: -0.5, chaos: 2 },
  heavy: { power: 0.5, drag: 0.5, stability: 1, lift: -0.2 },
  lift: { lift: 1.5 },
  power: { power: 2.5 },
  amphibious: { grip: 0.5, buoyancy: 2 },
  phase: { stability: 0.5, chaos: 0.5 },
  weatherproof: { stability: 0.5 },
  wheeled: { grip: 0.5 },
  suspension: { suspension: 2 },
  'high-clearance': { grip: 0.5 },
  bumpy: { suspension: -1, bounce: 0.8, chaos: 1 },
  slow: { power: -1.5 },
  tracked: { grip: 2 },
  'all-terrain': { grip: 1 },
  bouncy: { suspension: 1, bounce: 2 },
  stunt: { bounce: 0.5, style: 1.5 },
  floating: { buoyancy: 2, lift: 1 },
  buoyant: { buoyancy: 1.5 },
  fragile: { stability: -0.5, chaos: 0.5 },
  'low-grip': { grip: -2 },
  sliding: { grip: -0.5, drag: -1, power: 0.5 },
  ice: { grip: 1 },
  'low-friction': { grip: -1, drag: -1 },
  fast: { power: 1.5, drag: -0.5 },
  'water-grip': { grip: 0.5, buoyancy: 0.5 },
  comedic: { style: 0.5, chaos: 0.5 },
  safety: { stability: 1 },
  digging: { power: 1, drag: 0.5 },
  impact: { power: 0.5, chaos: 0.5 },
  suction: { drag: 0.5 },
  clean: { style: 0.5 },
  special: { style: 0.5 },
  magnetic: { drag: 0.5, stability: 0.5 },
  aero: { drag: -1.5, stability: 1 },
  thrust: { power: 3, drag: 0.3 },
  fire: { style: 1, chaos: 1 },
  wind: { lift: 0.5, chaos: 0.3 },
  water: { buoyancy: 0.3 },
  recoil: { power: 1, chaos: 0.5 },
  party: { style: 2 },
  musical: { style: 1 },
  loud: { chaos: 0.5 },
  'wind-catching': { drag: 1, lift: 0.3 },
  shelter: { stability: 0.5 },
  'light-source': { style: 0.5 },
  night: { stability: 0.5 },
  navigation: { grip: 0.5, stability: 0.5 },
  garden: { stability: -0.3 },
  green: { style: 0.5 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function rounded(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function deriveCarShowSeed(baseSeed: number, round: number, index: number) {
  let seed = (baseSeed ^ Math.imul(round, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b)) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad) >>> 0;
  seed = Math.imul(seed ^ (seed >>> 15), 0x735a2d97) >>> 0;
  return (seed ^ (seed >>> 15)) >>> 0;
}

export function buildCarMotionProfile(build: CarBuild): CarMotionProfile {
  const profile: CarMotionProfile = {
    power: 7, grip: 6, suspension: 4, stability: 6, drag: 3,
    buoyancy: 0, bounce: 0, lift: 0, style: 1, chaos: 0,
  };
  for (const part of getBuildParts(build)) {
    for (const tag of part.tags) {
      const effect = TAG_EFFECTS[tag];
      if (!effect) continue;
      for (const axis of MOTION_AXES) profile[axis] += effect[axis] ?? 0;
    }
  }
  return {
    power: rounded(clamp(profile.power, 1, 20), 2),
    grip: rounded(clamp(profile.grip, 1, 14), 2),
    suspension: rounded(clamp(profile.suspension, 1, 14), 2),
    stability: rounded(clamp(profile.stability, 1, 14), 2),
    drag: rounded(clamp(profile.drag, 0, 14), 2),
    buoyancy: rounded(clamp(profile.buoyancy, 0, 8), 2),
    bounce: rounded(clamp(profile.bounce, 0, 10), 2),
    lift: rounded(clamp(profile.lift, 0, 8), 2),
    style: rounded(clamp(profile.style, 0, 16), 2),
    chaos: rounded(clamp(profile.chaos, 0, 14), 2),
  };
}

function showEnvironment(environment: CarEnvironment, startMs: number, durationMs: number): CarShowEnvironment {
  return { ...environment, startMs, endMs: startMs + durationMs, durationMs };
}

function selectEnvironments(rng: () => number): CarShowEnvironment[] {
  const categories = ['terrain', 'weather', 'special', 'ability'] as const satisfies readonly CarEnvironmentCategory[];
  const selected = categories.map((category, index) => {
    const pool = CAR_ENVIRONMENTS.filter((environment) => environment.category === category);
    const environment = pool[Math.floor(rng() * pool.length)] ?? CAR_ENVIRONMENTS[0];
    return showEnvironment(environment, index * CAR_SEGMENT_DURATION_MS, CAR_SEGMENT_DURATION_MS);
  });
  const jump = CAR_ENVIRONMENTS.find((environment) => environment.id === 'jump') ?? CAR_ENVIRONMENTS[9];
  selected.push(showEnvironment(jump, CAR_JUMP_START_MS, CAR_SHOW_DURATION_MS - CAR_JUMP_START_MS));
  return selected;
}

function addEvent(
  events: CarShowEvent[],
  atMs: number,
  kind: CarShowEventKind,
  environmentId: CarEnvironmentId,
  text: string,
  intensity: number,
) {
  events.push({ atMs: Math.round(atMs), kind, environmentId, text, intensity: rounded(clamp(intensity, 0, 1), 2) });
}

function simulateRegularSegment(
  segment: CarShowEnvironment,
  parts: readonly CarPart[],
  motion: CarMotionProfile,
  stats: CarShowStats,
  events: CarShowEvent[],
  initialSpeed: number,
  rng: () => number,
) {
  addEvent(events, segment.startMs, 'enter', segment.id, `${segment.icon} ${segment.name}：${segment.description}`, 0.35);
  let reactionIndex = 0;
  for (const part of parts) {
    for (const reaction of part.reactions) {
      if (reaction.environmentId !== segment.id) continue;
      reactionIndex += 1;
      stats.reactions += 1;
      addEvent(
        events,
        segment.startMs + reactionIndex * 360,
        'reaction',
        segment.id,
        `${part.icon} ${part.name}：${reaction.text}`,
        0.45 + motion.chaos * 0.025,
      );
    }
  }

  let speed = initialSpeed;
  const gripFactor = clamp(segment.traction * (0.55 + motion.grip / 10), 0.12, 1.55);
  const targetSpeed = clamp(
    motion.power * 1.65 * gripFactor / (0.75 + segment.resistance * 0.22 + motion.drag * 0.04),
    0.15,
    38,
  );
  for (let elapsed = 0; elapsed < segment.durationMs; elapsed += 1_000) {
    const stepMs = Math.min(1_000, segment.durationMs - elapsed);
    const response = clamp(0.25 + motion.grip * 0.035 + motion.suspension * 0.01, 0.2, 0.85);
    speed += (targetSpeed - speed) * response * (stepMs / 1_000);
    speed = clamp(speed + (rng() - 0.5) * motion.chaos * 0.12, 0, 40);
    stats.distanceM += speed * stepMs / 1_000;
    stats.topSpeedKph = Math.max(stats.topSpeedKph, speed * 3.6);
    if (speed < 1.1) stats.stuckMs += stepMs;
  }

  const effectiveRoughness = segment.roughness + motion.bounce * 0.12;
  if (effectiveRoughness > 0.45) {
    const airtime = Math.round(effectiveRoughness * 420 / (1 + motion.suspension * 0.16) + motion.bounce * 65);
    stats.airtimeMs += Math.max(0, airtime);
    stats.stylePoints += effectiveRoughness * 0.45;
    addEvent(events, segment.startMs + 2_000 + rng() * 3_000, 'bounce', segment.id,
      `悬架交出 ${Math.max(0, airtime)} 毫秒悬空，车内物品重新考虑了自己的人生选择。`,
      effectiveRoughness / 3);
  }

  if (segment.id === 'water' || segment.id === 'rain') {
    const splashes = Math.max(1, Math.round(speed / 8 + Math.max(0, 2 - motion.buoyancy)));
    stats.splashes += splashes;
    stats.stylePoints += splashes * 0.25;
    addEvent(events, segment.startMs + segment.durationMs * 0.55, 'splash', segment.id,
      `制造 ${splashes} 朵大水花，后排观众完成免费洗脸。`, splashes / 6);
  }

  const spinRisk = segment.crosswind * 1.2 + (segment.id === 'ice' ? 2.4 : 0)
    + motion.chaos * 0.35 - motion.stability * 0.45 - motion.grip * 0.15;
  if (spinRisk > 0.8 + rng() * 2) {
    const spins = 1 + Math.floor(rng() * 2);
    stats.spins += spins;
    speed *= 0.72;
    addEvent(events, segment.startMs + segment.durationMs * 0.65, 'spin', segment.id,
      `方向短暂失控，整车旋转 ${spins} 圈后继续假装直行。`, spins / 3);
  }

  const roof = parts.find((part) => part.slot === 'roof');
  const tallRoofs = ['flag', 'umbrella', 'propeller', 'trampoline', 'satellite', 'windmill'];
  if (segment.ceilingM !== null && segment.ceilingM < 1.5 && roof && tallRoofs.includes(roof.id)) {
    stats.collisions += 1;
    speed *= 0.6;
    addEvent(events, segment.startMs + 1_200, 'collision', segment.id,
      `${roof.icon} ${roof.name}先碰到限高，车顶创意被迫折叠。`, 0.75);
  }

  const hasNightHelp = parts.some((part) => part.tags.some((tag) => ['light-source', 'night', 'high-tech', 'phase'].includes(tag)));
  if (segment.darkness >= 0.8 && !hasNightHelp) {
    stats.collisions += 1;
    speed *= 0.78;
    addEvent(events, segment.startMs + segment.durationMs * 0.6, 'collision', segment.id,
      '黑暗中听见咚的一声，司机决定把它命名为近路。', 0.6);
  }

  if (segment.obstacle === 'soft-blocks') {
    const hits = Math.max(1, Math.round(speed / 7 + motion.power / 8));
    stats.softBlocksHit += hits;
    stats.collisions += hits;
    stats.stylePoints += hits * 0.3;
    speed *= 0.68;
    addEvent(events, segment.startMs + segment.durationMs * 0.55, 'collision', segment.id,
      `撞散 ${hits} 块软积木，拆迁过程柔软且没有预算。`, hits / 8);
  }

  if ((segment.id === 'mud' || segment.id === 'ice') && speed < 1.5) {
    addEvent(events, segment.endMs - 300, 'stuck', segment.id,
      '车轮很忙，车辆位置却决定保持不变。', 0.7);
  }
  return speed;
}

function initialStats(): CarShowStats {
  return {
    distanceM: 0,
    topSpeedKph: 0,
    averageSpeedKph: 0,
    airtimeMs: 0,
    jumpDistanceM: 0,
    maxHeightM: 0,
    collisions: 0,
    softBlocksHit: 0,
    spins: 0,
    splashes: 0,
    stuckMs: 0,
    reactions: 0,
    stylePoints: 0,
    chaosPoints: 0,
    landedUpright: true,
    finished: false,
  };
}

export function createCarShowPlan(build: CarBuild, seed: number): CarShowPlan {
  const normalizedSeed = seed >>> 0;
  const rng = randomFrom(normalizedSeed);
  const parts = getBuildParts(build);
  const motion = buildCarMotionProfile(build);
  const environments = selectEnvironments(rng);
  const events: CarShowEvent[] = [];
  const stats = initialStats();
  const jumpAtMs = 30_000 + Math.floor(rng() * 6_001);
  let speed = 0;

  for (const segment of environments.slice(0, 4)) {
    speed = simulateRegularSegment(segment, parts, motion, stats, events, speed, rng);
  }
  const jump = environments[4]!;
  const approach = showEnvironment(jump, CAR_JUMP_START_MS, jumpAtMs - CAR_JUMP_START_MS);
  speed = simulateRegularSegment(approach, parts, motion, stats, events, speed, rng);

  const eventIndex = events.length;
  addEvent(events, jumpAtMs, 'jump', 'jump', `以 ${Math.round(speed * 3.6)} 公里时速离开坡道，重力开始提出异议。`, 1);
  const maximumAirtime = Math.max(800, 39_000 - jumpAtMs);
  const desiredAirtime = Math.round(700 + motion.bounce * 90 + motion.lift * 70 + speed * 28 + rng() * 350);
  const airtime = Math.min(maximumAirtime, Math.max(650, desiredAirtime));
  const landingAtMs = jumpAtMs + airtime;
  const jumpDistance = speed * airtime / 1_000 * (0.75 + motion.buoyancy * 0.03);
  const maxHeight = 0.4 + motion.bounce * 0.16 + motion.lift * 0.12 + speed * 0.025;
  const jumpSpins = motion.chaos + rng() * 5 > motion.stability + 3 ? 1 + Math.floor(rng() * 2) : 0;
  const landedUpright = jumpSpins === 0 || rng() > 0.3;

  stats.airtimeMs += airtime;
  stats.jumpDistanceM = jumpDistance;
  stats.maxHeightM = maxHeight;
  stats.distanceM += jumpDistance;
  stats.spins += jumpSpins;
  stats.landedUpright = landedUpright;
  if (!landedUpright) stats.collisions += 1;
  addEvent(events, landingAtMs, 'land', 'jump', landedUpright
    ? `飞出 ${rounded(jumpDistance)} 米后四轮${jumpSpins > 0 ? '转圈' : ''}落地，姿势勉强算计划之内。`
    : `飞出 ${rounded(jumpDistance)} 米后侧身着地，安全气囊是一只枕头。`,
  landedUpright ? 0.8 : 1);

  stats.finished = stats.distanceM >= 10 && (landedUpright || rng() > clamp(motion.chaos * 0.04, 0, 0.5));
  stats.averageSpeedKph = rounded(stats.distanceM / 40 * 3.6);
  stats.distanceM = rounded(stats.distanceM);
  stats.topSpeedKph = rounded(stats.topSpeedKph);
  stats.jumpDistanceM = rounded(stats.jumpDistanceM);
  stats.maxHeightM = rounded(stats.maxHeightM);
  stats.stylePoints = rounded(stats.stylePoints + motion.style + stats.airtimeMs / 400 + stats.jumpDistanceM / 5);
  stats.chaosPoints = Math.round(stats.collisions * 3 + stats.spins * 4 + stats.splashes + motion.chaos + (landedUpright ? 0 : 5));
  addEvent(events, CAR_SHOW_DURATION_MS, 'finish', 'jump', stats.finished
    ? '展示结束：它不但动了，还保留着大部分出厂零件。'
    : '展示结束：车辆抵达的方式比较抽象，但零件都到了。', 0.5);

  return {
    seed: normalizedSeed,
    durationMs: CAR_SHOW_DURATION_MS,
    build: cloneCarBuild(build),
    motion,
    environments,
    events,
    highlight: {
      startMs: jumpAtMs,
      endMs: Math.min(CAR_SHOW_DURATION_MS, Math.max(jumpAtMs + 1_000, landingAtMs + 400)),
      eventIndex,
      title: `${rounded(jumpDistance)} 米飞跃，${landedUpright ? '落地仍在镜头里' : '落地方向很有个性'}`,
    },
    stats,
  };
}

export function toPublicCarShowPlan(plan: CarShowPlan): PublicCarShowPlan {
  return {
    seed: plan.seed,
    durationMs: plan.durationMs,
    build: cloneCarBuild(plan.build),
    motion: { ...plan.motion },
    environments: plan.environments.map((environment) => ({ ...environment })),
    events: plan.events.map((event) => ({ ...event })),
    highlight: { ...plan.highlight },
  };
}

export function sampleCarShowPose(plan: PublicCarShowPlan, atMs: number): CarShowPose {
  const clampedTime = clamp(atMs, 0, plan.durationMs);
  let segmentIndex = plan.environments.findIndex((environment, index) =>
    clampedTime < environment.endMs || index === plan.environments.length - 1);
  if (segmentIndex < 0) segmentIndex = 0;
  const segment = plan.environments[segmentIndex]!;
  const localMs = clamp(clampedTime - segment.startMs, 0, segment.durationMs);
  const progress = segment.durationMs === 0 ? 0 : localMs / segment.durationMs;
  const speedKph = clamp(
    plan.motion.power * 3.2 * segment.traction - segment.resistance * 2
      + Math.sin(localMs / 700) * plan.motion.chaos * 0.4,
    0,
    140,
  );
  const flightDuration = Math.max(1, plan.highlight.endMs - plan.highlight.startMs - 400);
  const flightProgress = clamp((clampedTime - plan.highlight.startMs) / flightDuration, 0, 1);
  const inFlight = segment.id === 'jump' && clampedTime >= plan.highlight.startMs
    && clampedTime <= plan.highlight.startMs + flightDuration;
  const jumpHeight = inFlight ? Math.sin(flightProgress * Math.PI) * (1 + plan.motion.bounce * 0.15 + plan.motion.lift * 0.1) : 0;
  const roughHeight = Math.abs(Math.sin(localMs / 170)) * segment.roughness * 0.08 / (1 + plan.motion.suspension * 0.15);
  const roll = Math.sin(localMs / 530) * (segment.crosswind * 5 + (segment.id === 'ice' ? 4 : 0))
    * (1.5 - plan.motion.stability / 14);
  const pitch = inFlight ? Math.cos(flightProgress * Math.PI) * -12 : Math.sin(localMs / 240) * segment.roughness * 2;
  return {
    atMs: clampedTime,
    segmentIndex,
    environmentId: segment.id,
    progress: rounded(progress, 4),
    speedKph: rounded(speedKph),
    distanceM: rounded(clampedTime / 1_000 * speedKph / 3.6),
    heightM: rounded(jumpHeight + roughHeight, 3),
    pitch: rounded(pitch, 2),
    roll: rounded(roll, 2),
  };
}
