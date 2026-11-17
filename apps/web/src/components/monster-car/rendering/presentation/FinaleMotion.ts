import type { MonsterCarRacePlan } from '@party/games';
import { COURSE_LENGTH, sampleCourse } from '../courseMath';
import { samplePlaygroundMotion } from '../PlaygroundMotion';
import type { PlaygroundCarPose } from '../PlaygroundMotion';

const CYCLE_MS = 20_000;
const FORMATION_START_MS = 5_000;
const PHOTO_START_MS = 6_400;
const PHOTO_END_MS = 9_400;
const RETURN_END_MS = 11_400;
const PHOTO_DURATION_MS = PHOTO_END_MS - PHOTO_START_MS;
const LOOP_RADIUS = 5.9;
const LOOP_ANGULAR_SPEED = 0.42;
const PHOTO_CELEBRATION = 0.9;
const CAMERA_FACING_YAW = -Math.PI / 2;
const TAU = Math.PI * 2;

export interface FinaleCarPose extends PlaygroundCarPose {
  /** True only during the completely stationary 6.4–9.4 second photo hold. */
  photo: boolean;
  /** Current choreography section; during a blend this is the selected layout. */
  formation: string;
}

interface FormationPoint {
  x: number;
  z: number;
  yaw: number;
}

function clampedTime(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const normalized = clamp01(value);
  return normalized * normalized * (3 - 2 * normalized);
}

function wrappedAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function formationVariants(count: number): readonly string[] {
  if (count === 2) return ['side-by-side', 'facing-pair'];
  if (count === 3) return ['triangle', 'arc'];
  if (count === 4) return ['line', 'diamond', '2x2'];
  return count === 1 ? ['solo'] : ['ring'];
}

function selectedFormation(plan: MonsterCarRacePlan, count: number, cycle: number) {
  const variants = formationVariants(count);
  const seed = Number.isFinite(plan.seed) ? Math.abs(Math.trunc(plan.seed)) : 0;
  return variants[(seed + cycle) % variants.length] ?? variants[0]!;
}

/** Positions are local to the plaza and deliberately leave room for full car models. */
function formationPoint(formation: string, index: number, count: number): FormationPoint {
  const centeredIndex = index - (count - 1) / 2;
  switch (formation) {
    case 'side-by-side':
      return { x: centeredIndex * 3.8, z: 0, yaw: CAMERA_FACING_YAW };
    case 'facing-pair':
      return { x: centeredIndex * 4.8, z: 0, yaw: index === 0 ? 0 : Math.PI };
    case 'triangle': {
      const angle = -Math.PI / 2 + index / count * TAU;
      return { x: Math.cos(angle) * 2.5, z: Math.sin(angle) * 2.5, yaw: CAMERA_FACING_YAW };
    }
    case 'arc': {
      const angle = centeredIndex * Math.PI / 3;
      return {
        x: Math.cos(angle) * 3.8,
        z: Math.sin(angle) * 3.8,
        yaw: CAMERA_FACING_YAW + angle * 0.25,
      };
    }
    case 'line':
      return { x: centeredIndex * 3.6, z: 0, yaw: CAMERA_FACING_YAW };
    case 'diamond': {
      const angle = -Math.PI / 2 + index / count * TAU;
      return { x: Math.cos(angle) * 3.3, z: Math.sin(angle) * 3.3, yaw: CAMERA_FACING_YAW };
    }
    case '2x2':
      return {
        x: (index % 2 === 0 ? -1 : 1) * 1.9,
        z: (index < 2 ? -1 : 1) * 1.9,
        yaw: CAMERA_FACING_YAW,
      };
    case 'solo':
      return { x: 0, z: 0, yaw: CAMERA_FACING_YAW };
    default: {
      const angle = -Math.PI / 2 + index / Math.max(1, count) * TAU;
      return { x: Math.cos(angle) * LOOP_RADIUS, z: Math.sin(angle) * LOOP_RADIUS, yaw: CAMERA_FACING_YAW };
    }
  }
}

function formationWeight(phaseMs: number) {
  if (phaseMs <= FORMATION_START_MS || phaseMs >= RETURN_END_MS) return 0;
  if (phaseMs < PHOTO_START_MS) {
    return smoothstep((phaseMs - FORMATION_START_MS) / (PHOTO_START_MS - FORMATION_START_MS));
  }
  if (phaseMs <= PHOTO_END_MS) return 1;
  return 1 - smoothstep((phaseMs - PHOTO_END_MS) / (RETURN_END_MS - PHOTO_END_MS));
}

function pausedPhotoMs(phaseMs: number, cycle: number) {
  const currentPause = phaseMs < PHOTO_START_MS
    ? 0
    : Math.min(PHOTO_DURATION_MS, phaseMs - PHOTO_START_MS);
  return cycle * PHOTO_DURATION_MS + currentPause;
}

/**
 * Deterministically samples arrival, ring driving, a formation photo, and the
 * return to the ring. No frame cursor or accumulated simulation state is used.
 */
export function sampleFinaleMotion(
  plan: MonsterCarRacePlan,
  celebrationMs: number,
  reducedMotion = false,
): FinaleCarPose[] {
  if (reducedMotion) {
    return sampleFinaleMotion(plan, PHOTO_START_MS + 1_000, false).map((pose) => ({
      ...pose,
      travelDistance: 0,
      jump: 0,
      celebration: 0,
      photo: true,
    }));
  }
  const timeMs = clampedTime(celebrationMs);
  const cycle = Math.floor(timeMs / CYCLE_MS);
  const phaseMs = timeMs % CYCLE_MS;
  const effectiveDrivingMs = timeMs - pausedPhotoMs(phaseMs, cycle);
  const basePoses = samplePlaygroundMotion(plan, effectiveDrivingMs);
  const initialPoses = samplePlaygroundMotion(plan, 0);
  const finish = sampleCourse(1);
  const centerX = COURSE_LENGTH + 5;
  const groundY = finish.y + 0.04;
  const centerZ = finish.z;
  const weight = formationWeight(phaseMs);
  const photo = phaseMs >= PHOTO_START_MS && phaseMs <= PHOTO_END_MS;
  const formation = selectedFormation(plan, basePoses.length, cycle);
  const section = weight === 0
    ? (cycle === 0 && timeMs < 1_500 ? 'arrival' : 'ring')
    : formation;
  return basePoses.map((base, index) => {
    // Preserve the existing sampler's exact finish-line wheel origin and
    // arithmetic, while removing only time spent in stationary photo holds.
    const travelDistance = (initialPoses[index]?.travelDistance ?? base.travelDistance)
      + effectiveDrivingMs / 1_000 * LOOP_RADIUS * LOOP_ANGULAR_SPEED;
    if (weight === 0) {
      return { ...base, travelDistance, photo: false, formation: section };
    }

    const target = formationPoint(formation, index, basePoses.length);
    if (weight === 1) {
      return {
        playerId: base.playerId,
        position: { x: centerX + target.x, y: groundY, z: centerZ + target.z },
        yaw: target.yaw,
        pitch: 0,
        travelDistance,
        jump: 0,
        celebration: PHOTO_CELEBRATION,
        photo,
        formation,
      };
    }

    const yawDelta = wrappedAngle(target.yaw - base.yaw);
    return {
      playerId: base.playerId,
      position: {
        x: base.position.x + (centerX + target.x - base.position.x) * weight,
        y: base.position.y + (groundY - base.position.y) * weight,
        z: base.position.z + (centerZ + target.z - base.position.z) * weight,
      },
      yaw: wrappedAngle(base.yaw + yawDelta * weight),
      pitch: base.pitch * (1 - weight),
      travelDistance,
      jump: base.jump * (1 - weight),
      celebration: base.celebration + (PHOTO_CELEBRATION - base.celebration) * weight,
      photo: false,
      formation,
    };
  });
}
