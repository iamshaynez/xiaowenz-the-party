import type { MonsterCarFrameCar, MonsterCarStimulus, ResolvedMonsterCarReaction } from '@party/games';

export type ReactionParticle = 'water' | 'wind' | 'dust' | 'bubble' | 'popcorn' | 'steam' | 'notes' | 'spark' | 'stars';

export interface ReactionChannels {
  lift: number;
  forward: number;
  pitch: number;
  roll: number;
  yaw: number;
  squash: number;
  wobble: number;
  cycles: number;
  wheelBoost: number;
  driverLift: number;
  cheer: number;
  spin: number;
  open: number;
  bounce: number;
  wag: number;
}

export type ReactionProfile = Partial<ReactionChannels> & { particle?: ReactionParticle };
export type ReactionPose = Required<Omit<ReactionChannels, 'cycles'>> & { cycles: number; particle: ReactionParticle };

const DEFAULT_CHANNELS: ReactionPose = {
  lift: 0, forward: 0, pitch: 0, roll: 0, yaw: 0, squash: 0, wobble: 0,
  cycles: 1, wheelBoost: 0, driverLift: 0, cheer: 0, spin: 0, open: 0,
  bounce: 0, wag: 0, particle: 'dust',
};

const DEFAULT_BY_STIMULUS: Record<MonsterCarStimulus, ReactionProfile> = {
  water: { lift: 0.12, forward: -0.25, roll: 0.08, wobble: 0.08, cheer: 0.25, particle: 'water' },
  impact: { lift: 0.35, forward: -0.18, pitch: -0.08, squash: 0.09, wobble: 0.08, particle: 'dust' },
  wind: { lift: 0.18, forward: -0.28, roll: 0.12, wobble: 0.13, driverLift: 0.12, particle: 'wind' },
  slope: { lift: 0.14, forward: 0.22, pitch: 0.08, cheer: 0.18, particle: 'dust' },
};

// 这些 ID 是已持久化 cue 的表现契约。新增动作优先复用运动通道，不为每辆新车复制条件分支。
export const REACTION_LIBRARY: Record<string, ReactionProfile> = {
  'classic-splash': { ...DEFAULT_BY_STIMULUS.water },
  'classic-bump': { ...DEFAULT_BY_STIMULUS.impact },
  'classic-wind': { ...DEFAULT_BY_STIMULUS.wind },
  'classic-slope': { ...DEFAULT_BY_STIMULUS.slope },
  'chassis-wiggle': { wobble: 0.12, cycles: 3, squash: 0.04, particle: 'dust' },
  'driver-water': { driverLift: 0.08, cheer: 0.4, particle: 'water' },
  'driver-impact': { driverLift: 0.14, cheer: 0.2, particle: 'dust' },
  'driver-wind': { driverLift: 0.18, cheer: 0.45, particle: 'wind' },
  'driver-slope': { cheer: 0.35, particle: 'dust' },
  'donut-splash': { lift: 0.2, forward: 0.4, yaw: 0.15, wobble: 0.16, spin: 1.2, particle: 'water' },
  'donut-roll': { lift: 0.65, forward: 0.55, roll: 0.12, spin: 2.2, particle: 'spark' },
  'spring-bounce': { lift: 1.3, forward: 0.9, pitch: 0.12, squash: 0.12, bounce: 1, driverLift: 0.18, particle: 'stars' },
  'balloon-float': { lift: 1.15, forward: 0.45, roll: 0.13, wobble: 0.1, driverLift: 0.16, particle: 'bubble' },
  'soft-squash': { lift: 0.25, squash: 0.2, wobble: 0.09, bounce: 0.6, particle: 'dust' },
  'duck-paddle': { lift: 0.16, forward: 0.65, pitch: 0.12, wobble: 0.07, wag: 0.5, cheer: 0.4, particle: 'water' },
  'train-toot': { lift: 0.12, forward: 0.32, bounce: 0.22, cheer: 0.55, particle: 'steam' },
  'scoop-splash': { lift: 0.25, forward: 0.2, pitch: -0.15, open: 0.4, particle: 'water' },
  'scoop-hop': { lift: 0.75, forward: 0.55, pitch: 0.18, open: 0.6, particle: 'dust' },
  'rocket-popcorn': { lift: 0.38, forward: 1.05, pitch: 0.1, cheer: 0.55, particle: 'popcorn' },
  'rocket-wobble': { lift: 0.2, roll: 0.18, wobble: 0.22, cycles: 4, particle: 'spark' },
  'bubble-foam': { lift: 0.25, squash: 0.08, bounce: 0.4, cheer: 0.4, particle: 'bubble' },
  'bubble-trail': { forward: 0.42, wobble: 0.08, bounce: 0.25, particle: 'bubble' },
  'tail-wag': { lift: 0.12, roll: 0.08, wag: 1.4, cycles: 5, cheer: 0.3, particle: 'wind' },
  'mushroom-bloom': { lift: 0.18, open: 0.65, bounce: 0.3, cheer: 0.3, particle: 'spark' },
  'mushroom-boing': { lift: 0.72, forward: 0.35, squash: 0.12, bounce: 0.85, particle: 'stars' },
  'umbrella-sail': { lift: 1.35, forward: 0.9, roll: 0.14, open: 1, driverLift: 0.22, particle: 'wind' },
  'umbrella-open': { lift: 0.16, open: 0.8, cheer: 0.35, particle: 'water' },
  'propeller-flight': { lift: 1.1, forward: 0.72, roll: 0.1, spin: 4, driverLift: 0.16, particle: 'wind' },
  'propeller-spin': { lift: 0.22, forward: 0.35, spin: 3, cheer: 0.3, particle: 'wind' },
  'antenna-wobble': { lift: 0.14, roll: 0.1, wag: 1, cycles: 5, particle: 'stars' },
  'antenna-boing': { lift: 0.55, bounce: 0.8, wag: 0.8, particle: 'stars' },
  'bear-hold': { squash: 0.05, driverLift: -0.08, cheer: 0.1, particle: 'dust' },
  'frog-croak': { driverLift: 0.16, cheer: 0.8, bounce: 0.25, particle: 'notes' },
  'frog-hop': { lift: 0.62, forward: 0.45, driverLift: 0.35, cheer: 0.6, particle: 'water' },
  'driver-splash': { driverLift: 0.18, cheer: 0.7, wag: 0.35, particle: 'water' },
  'alien-float': { lift: 0.72, roll: 0.12, driverLift: 0.48, cheer: 0.6, particle: 'stars' },
  'alien-anticipation': { forward: 0.35, driverLift: 0.12, cheer: 0.45, spin: 0.5, particle: 'stars' },
  'banana-peel-paddle': { lift: 0.18, forward: 0.4, yaw: 0.65, wobble: 0.22, cycles: 2, particle: 'water' },
  'banana-peel-skid': { lift: 0.28, forward: 0.65, yaw: 0.95, roll: 0.16, wobble: 0.22, cycles: 2, particle: 'spark' },
  'square-wheel-clunk': { lift: 0.48, squash: 0.14, pitch: 0.18, bounce: 0.7, cycles: 4, particle: 'dust' },
  'square-wheel-tumble': { lift: 0.72, forward: 0.4, yaw: 0.4, roll: 0.25, bounce: 0.9, particle: 'stars' },
  'bubble-tea-boba-splash': { lift: 0.28, squash: 0.08, bounce: 0.5, cheer: 0.35, particle: 'bubble' },
  'bubble-tea-boba-bounce': { lift: 0.62, forward: 0.4, bounce: 0.75, particle: 'bubble' },
  'duck-float-paddle': { lift: 0.24, forward: 0.55, roll: 0.12, wag: 0.5, cheer: 0.5, particle: 'water' },
  'duck-float-sail': { lift: 0.72, forward: 0.65, roll: 0.16, open: 0.35, particle: 'wind' },
  'duck-float-squeak': { lift: 0.3, squash: 0.2, cheer: 0.7, particle: 'notes' },
  'shark-fin-splash': { lift: 0.18, forward: 0.75, pitch: 0.12, open: 0.4, particle: 'water' },
  'shark-fin-surf': { lift: 0.45, forward: 0.8, roll: 0.2, open: 0.55, particle: 'spark' },
  'vacuum-puddle-slurp': { forward: 0.28, pitch: -0.12, open: 0.55, wobble: 0.1, particle: 'water' },
  'vacuum-log-slurp': { lift: 0.35, forward: 0.35, open: 0.85, squash: 0.08, particle: 'dust' },
  'vacuum-gust-slurp': { lift: 0.22, forward: 0.3, open: 0.75, spin: 1.2, particle: 'wind' },
  'ice-cream-sprinkle-splash': { lift: 0.18, wobble: 0.15, cheer: 0.4, particle: 'water' },
  'ice-cream-wobble': { lift: 0.2, roll: 0.2, wobble: 0.25, cycles: 4, squash: 0.08, particle: 'spark' },
  'ice-cream-brain-freeze': { lift: 0.18, driverLift: 0.12, wobble: 0.22, cycles: 5, particle: 'stars' },
  'piano-crash-chord': { lift: 0.38, squash: 0.1, bounce: 0.55, cheer: 0.7, particle: 'notes' },
  'piano-hill-glissando': { forward: 0.45, lift: 0.18, bounce: 0.65, cheer: 0.8, particle: 'notes' },
  'washing-machine-spin-cycle': { lift: 0.18, yaw: 0.22, spin: 4, wobble: 0.12, particle: 'bubble' },
  'washing-machine-rattle': { lift: 0.22, wobble: 0.3, cycles: 6, spin: 2.5, particle: 'dust' },
  'washing-machine-fluff': { lift: 0.28, open: 0.55, spin: 2, driverLift: 0.12, particle: 'wind' },
  'campfire-steam-hiss': { lift: 0.2, bounce: 0.45, cheer: 0.25, particle: 'steam' },
  'campfire-spark-dance': { lift: 0.42, wobble: 0.18, bounce: 0.55, cheer: 0.5, particle: 'spark' },
  'campfire-marshmallow-pop': { lift: 0.62, forward: 0.35, bounce: 0.85, cheer: 0.55, particle: 'popcorn' },
  'jackbox-surprise-pop': { lift: 0.9, forward: 0.45, open: 1, bounce: 1, cheer: 0.8, particle: 'stars' },
  'jackbox-peekaboo': { lift: 0.32, open: 0.7, bounce: 0.6, cheer: 0.65, particle: 'stars' },
  'jackbox-lid-flap': { lift: 0.16, open: 0.65, wobble: 0.16, cycles: 4, particle: 'wind' },
  'snail-slow-climb': { forward: -0.2, pitch: 0.1, wag: 0.3, cheer: 0.4, particle: 'stars' },
  'snail-slime-splash': { forward: 0.25, lift: 0.14, wag: 0.4, particle: 'bubble' },
  'snail-shell-tilt': { roll: 0.2, wobble: 0.2, cycles: 3, spin: 0.7, particle: 'wind' },
  'teapot-rain-brew': { lift: 0.16, bounce: 0.35, cheer: 0.35, particle: 'steam' },
  'teapot-hill-whistle': { forward: 0.32, lift: 0.2, bounce: 0.55, cheer: 0.65, particle: 'steam' },
  'teapot-lid-rattle': { lift: 0.28, open: 0.75, wobble: 0.22, cycles: 5, particle: 'steam' },
  'birdcage-wind-chirp': { lift: 0.35, roll: 0.16, bounce: 0.55, cheer: 0.7, particle: 'notes' },
  'birdcage-swing': { lift: 0.28, roll: 0.24, wobble: 0.26, cycles: 2, particle: 'stars' },
  'cactus-rain-storage': { lift: 0.14, open: 0.5, bounce: 0.25, cheer: 0.3, particle: 'water' },
  'cactus-soft-boing': { lift: 0.62, squash: 0.13, bounce: 0.75, particle: 'stars' },
  'cactus-needle-conduct': { lift: 0.2, wag: 0.7, cheer: 0.75, particle: 'notes' },
  'whale-spout': { lift: 0.45, forward: 0.4, bounce: 0.55, cheer: 0.75, particle: 'water' },
  'whale-tail-sail': { lift: 0.6, forward: 0.65, roll: 0.18, wag: 1, particle: 'wind' },
  'whale-belly-bounce': { lift: 0.55, squash: 0.18, bounce: 0.8, particle: 'stars' },
  'robot-bolt-rattle': { lift: 0.2, driverLift: 0.14, wobble: 0.2, cycles: 6, cheer: 0.35, particle: 'spark' },
  'robot-reboot-wobble': { lift: 0.22, driverLift: 0.25, spin: 1.5, cheer: 0.5, particle: 'stars' },
  'robot-splash-dance': { lift: 0.2, driverLift: 0.16, wag: 0.65, cheer: 0.75, particle: 'water' },
  'penguin-belly-slide': { lift: 0.12, forward: 0.75, driverLift: -0.08, cheer: 0.75, particle: 'water' },
  'penguin-waddle-climb': { forward: 0.28, driverLift: 0.12, wobble: 0.18, cycles: 4, cheer: 0.45, particle: 'stars' },
  'penguin-brake-hop': { lift: 0.48, driverLift: 0.25, cheer: 0.65, particle: 'spark' },
  'ghost-sheet-flap': { lift: 0.8, roll: 0.16, driverLift: 0.45, wobble: 0.18, cheer: 0.7, particle: 'wind' },
  'ghost-boo-bounce': { lift: 0.72, driverLift: 0.38, squash: 0.1, cheer: 0.85, particle: 'stars' },
  'ghost-mist-hover': { lift: 0.55, forward: 0.35, driverLift: 0.4, cheer: 0.6, particle: 'bubble' },
  'lion-roar-bounce': { lift: 0.4, driverLift: 0.22, cheer: 1, particle: 'notes' },
  'lion-mane-blowdry': { lift: 0.3, driverLift: 0.16, wag: 0.8, cheer: 0.65, particle: 'wind' },
  'lion-summit-roar': { lift: 0.32, forward: 0.4, driverLift: 0.18, cheer: 1, particle: 'stars' },
};

export function reactionProfile(reaction: string, stimulus: MonsterCarStimulus) {
  return REACTION_LIBRARY[reaction] ?? DEFAULT_BY_STIMULUS[stimulus];
}

export function sampleReactionPose(
  reaction: ResolvedMonsterCarReaction,
  stimulus: MonsterCarStimulus,
  localProgress: number,
  reducedMotion = false,
): ReactionPose {
  const profile = reactionProfile(reaction.reaction, stimulus);
  const progress = Math.max(0, Math.min(1, localProgress));
  const wave = Math.sin(progress * Math.PI);
  const cycles = profile.cycles ?? 1;
  const oscillation = Math.sin(progress * Math.PI * 2 * cycles) * (1 - progress);
  const strength = reaction.intensity * (reducedMotion ? 0.28 : 1);
  const amount = (value: number | undefined) => (value ?? 0) * wave * strength;
  const wobbleAmount = profile.wobble ?? 0;
  return {
    lift: amount(profile.lift),
    forward: amount(profile.forward),
    pitch: amount(profile.pitch) + oscillation * wobbleAmount * strength,
    roll: amount(profile.roll) + oscillation * wobbleAmount * 0.45 * strength,
    yaw: amount(profile.yaw) + oscillation * (profile.wobble ?? 0) * 0.35 * strength,
    squash: amount(profile.squash),
    wobble: oscillation * wobbleAmount * strength,
    cycles,
    wheelBoost: amount(profile.wheelBoost),
    driverLift: amount(profile.driverLift),
    cheer: amount(profile.cheer),
    spin: amount(profile.spin),
    open: amount(profile.open),
    bounce: amount(profile.bounce),
    wag: oscillation * (profile.wag ?? 0) * strength,
    particle: profile.particle ?? DEFAULT_BY_STIMULUS[stimulus].particle ?? 'dust',
  };
}

export function sampleSecondaryProgress(
  cue: NonNullable<MonsterCarFrameCar['activeCue']>,
  secondary: ResolvedMonsterCarReaction,
) {
  const elapsedMs = cue.localProgress * cue.durationMs;
  return Math.max(0, Math.min(1, elapsedMs / secondary.durationMs));
}

export function primaryParticle(cue: MonsterCarFrameCar['activeCue'], reducedMotion = false) {
  if (!cue) return DEFAULT_CHANNELS.particle;
  return sampleReactionPose(cue.primary, cue.stimulus, cue.localProgress, reducedMotion).particle;
}
