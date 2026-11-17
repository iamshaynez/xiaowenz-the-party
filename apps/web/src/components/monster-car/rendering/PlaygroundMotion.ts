import { sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarRacePlan } from '@party/games';
import { COURSE_LENGTH, sampleCourse } from './courseMath';

const ARRIVAL_MS = 1_500;
const GROUND_OFFSET = 0.04;
const LOOP_RADIUS = 5.9;
const LOOP_ANGULAR_SPEED = 0.42;
const LOOP_PERIOD_MS = Math.PI * 2 / LOOP_ANGULAR_SPEED * 1_000;
const TAU = Math.PI * 2;

export interface PlaygroundCarPose {
  playerId: string;
  /** World-space car root position, including the current jump height. */
  position: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  /** Monotonic wheel travel; consumers do not need to integrate frame deltas. */
  travelDistance: number;
  /** Current height above the plaza, also reflected in position.y. */
  jump: number;
  /** Normalized, smoothly periodic hop amount in the range 0..1. */
  celebration: number;
}

function clampedTime(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function wrappedAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function hash(value: number) {
  const result = Math.sin(value * 12.9898 + 78.233) * 43_758.5453;
  return result - Math.floor(result);
}

/**
 * Samples the post-race playground directly from absolute celebration time.
 * There is no cursor or simulation state, so frames can be requested in any order.
 */
export function samplePlaygroundMotion(
  plan: MonsterCarRacePlan,
  celebrationMs: number,
): PlaygroundCarPose[] {
  const timeMs = clampedTime(celebrationMs);
  const arrival = Math.min(1, timeMs / ARRIVAL_MS);
  const arrivalEase = smoothstep(arrival);
  const loopTimeSeconds = (timeMs % LOOP_PERIOD_MS) / 1_000;
  const finishPoint = sampleCourse(1);
  const centerX = COURSE_LENGTH + 5;
  const centerY = finishPoint.y + GROUND_OFFSET;
  const centerZ = finishPoint.z;
  const finalFrame = sampleMonsterCarFrame(plan, plan.durationMs);
  const racerCount = Math.max(1, finalFrame.cars.length);
  const poses: PlaygroundCarPose[] = [];

  for (let index = 0; index < finalFrame.cars.length; index += 1) {
    const finalCar = finalFrame.cars[index]!;
    const road = sampleCourse(finalCar.progress);
    const startX = road.x;
    const startY = road.y + GROUND_OFFSET;
    const startZ = road.z + finalCar.lane * 1.18;

    // The first car enters at the near side heading +x, matching the finish road.
    const baseAngle = -Math.PI / 2 + index / racerCount * TAU;
    const angle = baseAngle + LOOP_ANGULAR_SPEED * loopTimeSeconds;
    const loopX = centerX + Math.cos(angle) * LOOP_RADIUS;
    const loopZ = centerZ + Math.sin(angle) * LOOP_RADIUS;
    const loopYaw = wrappedAngle(-angle - Math.PI / 2);
    const yawDelta = wrappedAngle(loopYaw - road.yaw);

    const variation = hash(plan.seed + index * 37);
    const hopPeriodMs = 1_850 + variation * 650;
    const hopOffset = hash(plan.seed + index * 73 + 19) * hopPeriodMs;
    const hopPhase = ((timeMs % hopPeriodMs) + hopOffset) % hopPeriodMs / hopPeriodMs;
    const hopWave = 0.5 - Math.cos(hopPhase * TAU) * 0.5;
    const celebration = hopWave * arrivalEase;
    const jump = celebration * (0.58 + variation * 0.24);
    const hopPitch = Math.sin(hopPhase * TAU) * 0.065 * arrivalEase;

    poses.push({
      playerId: finalCar.playerId,
      position: {
        x: startX + (loopX - startX) * arrivalEase,
        y: startY + (centerY - startY) * arrivalEase + jump,
        z: startZ + (loopZ - startZ) * arrivalEase,
      },
      yaw: wrappedAngle(road.yaw + yawDelta * arrivalEase),
      pitch: road.pitch * (1 - arrivalEase) + hopPitch,
      // Keep this cumulative for wheel animation. Division before multiplication
      // also keeps even Number.MAX_VALUE samples finite.
      travelDistance: startX + timeMs / 1_000 * LOOP_RADIUS * LOOP_ANGULAR_SPEED,
      jump,
      celebration,
    });
  }

  return poses;
}
