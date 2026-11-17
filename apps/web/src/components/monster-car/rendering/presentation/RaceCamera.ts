import { RACE_DURATION_MS } from '@party/games';
import type { MonsterCarFrameCar, MonsterCarRaceFrame } from '@party/games';
import { COURSE_LENGTH, sampleCourse } from '../courseMath';
import { sampleSocialMoment } from './SocialMoments';
import type { SocialMoment } from './SocialMoments';
import type { MonsterCarShowPlan } from './ShowPlan';

export interface RaceCameraSample {
  targetX: number;
  targetY: number;
  targetZ: number;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  halfWidth: number;
}

interface CarPosition {
  x: number;
  y: number;
  z: number;
}

const CAMERA_KEYS: readonly (keyof RaceCameraSample)[] = [
  'targetX', 'targetY', 'targetZ', 'offsetX', 'offsetY', 'offsetZ', 'halfWidth',
];
const FINISH_START_MS = 27_000;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number) {
  const bounded = clamp01(value);
  return bounded * bounded * (3 - 2 * bounded);
}

function mixCamera(left: RaceCameraSample, right: RaceCameraSample, amount: number): RaceCameraSample {
  const t = clamp01(amount);
  return {
    targetX: left.targetX + (right.targetX - left.targetX) * t,
    targetY: left.targetY + (right.targetY - left.targetY) * t,
    targetZ: left.targetZ + (right.targetZ - left.targetZ) * t,
    offsetX: left.offsetX + (right.offsetX - left.offsetX) * t,
    offsetY: left.offsetY + (right.offsetY - left.offsetY) * t,
    offsetZ: left.offsetZ + (right.offsetZ - left.offsetZ) * t,
    halfWidth: left.halfWidth + (right.halfWidth - left.halfWidth) * t,
  };
}

function emptyCamera(): RaceCameraSample {
  return { targetX: 0, targetY: 0, targetZ: 0, offsetX: 0, offsetY: 0, offsetZ: 0, halfWidth: 0 };
}

function addCamera(target: RaceCameraSample, addition: RaceCameraSample, weight: number) {
  for (const key of CAMERA_KEYS) target[key] += addition[key] * weight;
}

function scaleCamera(camera: RaceCameraSample, scale: number) {
  for (const key of CAMERA_KEYS) camera[key] *= scale;
  return camera;
}

function carPosition(car: MonsterCarFrameCar): CarPosition {
  const progress = Number.isFinite(car.progress) ? Math.max(0, Math.min(1.08, car.progress)) : 0;
  const lane = Number.isFinite(car.lane) ? Math.max(-10, Math.min(10, car.lane)) : 0;
  const road = sampleCourse(progress);
  return { x: road.x, y: road.y, z: road.z + lane * 1.18 };
}

function openingCamera(): RaceCameraSample {
  const road = sampleCourse(0);
  return {
    targetX: road.x + 2.2,
    targetY: road.y + 1.45,
    targetZ: road.z,
    offsetX: 5.6,
    offsetY: 5.5,
    offsetZ: 17.5,
    halfWidth: 8.8,
  };
}

function packCamera(positions: CarPosition[]): RaceCameraSample {
  if (positions.length === 0) return openingCamera();
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let totalY = 0;
  let totalZ = 0;
  for (const position of positions) {
    minimumX = Math.min(minimumX, position.x);
    maximumX = Math.max(maximumX, position.x);
    totalY += position.y;
    totalZ += position.z;
  }
  const spread = maximumX - minimumX;
  return {
    targetX: (minimumX + maximumX) / 2 + 1.6,
    targetY: totalY / positions.length + 1.45,
    targetZ: totalZ / positions.length,
    offsetX: 5.4,
    offsetY: 5.8,
    offsetZ: 16.5,
    halfWidth: Math.min(20, Math.max(7.4, spread / 2 + 4.8)),
  };
}

function focusCamera(position: CarPosition): RaceCameraSample {
  return {
    targetX: position.x + 0.65,
    targetY: position.y + 1.25,
    targetZ: position.z,
    offsetX: 3.9,
    offsetY: 4.25,
    offsetZ: 12.8,
    halfWidth: 6.1,
  };
}

function socialCamera(actor: CarPosition, target: CarPosition): RaceCameraSample {
  return {
    targetX: (actor.x + target.x) / 2 + 0.45,
    targetY: (actor.y + target.y) / 2 + 1.3,
    targetZ: (actor.z + target.z) / 2,
    offsetX: 4.2,
    offsetY: 4.6,
    offsetZ: 13.4,
    halfWidth: Math.max(6.5, Math.abs(actor.x - target.x) / 2 + 4.3),
  };
}

function finishCamera(): RaceCameraSample {
  const finish = sampleCourse(1);
  return {
    targetX: COURSE_LENGTH + 2.3,
    targetY: finish.y + 1.8,
    targetZ: finish.z,
    offsetX: 6.8,
    offsetY: 6.7,
    offsetZ: 17.8,
    halfWidth: 9.5,
  };
}

function activeMomentWeight(moment: SocialMoment, timeMs: number, blendMs: number) {
  const entered = smoothstep((timeMs - moment.start) / blendMs);
  const leaving = smoothstep((moment.start + moment.duration - timeMs) / blendMs);
  return entered * leaving;
}

function safeTime(atMs: number, frame: MonsterCarRaceFrame) {
  const candidate = Number.isFinite(atMs) ? atMs : frame.atMs;
  return Number.isFinite(candidate) ? Math.max(0, Math.min(RACE_DURATION_MS, candidate)) : 0;
}

/**
 * Samples the race camera entirely from absolute time. Opening, event, social,
 * and finish shots cross-fade at their own boundaries, so arbitrary frame order
 * and dropped frames cannot introduce accumulated camera drift.
 */
export function sampleRaceCamera(
  show: Pick<MonsterCarShowPlan, 'socialMoments'>,
  atMs: number,
  frame: MonsterCarRaceFrame,
  aspect: number,
  reducedMotion: boolean,
): RaceCameraSample {
  const timeMs = safeTime(atMs, frame);
  const blendMs = reducedMotion ? 760 : 440;
  const positions = new Map<string, CarPosition>();
  for (const car of frame.cars) positions.set(car.playerId, carPosition(car));
  const pack = packCamera([...positions.values()]);
  const openingAmount = smoothstep((timeMs - 1_500) / (reducedMotion ? 1_800 : 1_300));
  let camera = mixCamera(openingCamera(), pack, openingAmount);

  let eventWeight = 0;
  const eventTotal = emptyCamera();
  for (const car of frame.cars) {
    const cue = car.activeCue;
    const position = positions.get(car.playerId);
    if (!cue || !position) continue;
    const entered = smoothstep((timeMs - cue.startAtMs) / blendMs);
    const leaving = smoothstep((cue.startAtMs + cue.durationMs - timeMs) / blendMs);
    const weight = entered * leaving;
    if (weight <= 0) continue;
    addCamera(eventTotal, focusCamera(position), weight);
    eventWeight += weight;
  }
  const eventAmount = Math.min(1, eventWeight);

  const moment = sampleSocialMoment(show, timeMs);
  if (moment) {
    const actor = positions.get(moment.actor);
    const target = positions.get(moment.target);
    if (actor && target) {
      const weight = activeMomentWeight(moment, timeMs, blendMs) * (1 - eventAmount);
      camera = mixCamera(camera, socialCamera(actor, target), weight);
    }
  }

  if (eventWeight > 0) {
    camera = mixCamera(camera, scaleCamera(eventTotal, 1 / eventWeight), eventAmount);
  }

  let furthestProgress = 0;
  for (const car of frame.cars) {
    if (Number.isFinite(car.progress)) furthestProgress = Math.max(furthestProgress, car.progress);
  }
  const finishAmount = Math.max(
    smoothstep((timeMs - FINISH_START_MS) / (reducedMotion ? 1_500 : 950)),
    smoothstep((furthestProgress - 0.965) / 0.035),
  );
  camera = mixCamera(camera, finishCamera(), finishAmount);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const portrait = safeAspect < 0.85;
  const widthScale = (portrait ? 1.18 : 1) * (reducedMotion ? 1.08 : 1);
  return {
    ...camera,
    offsetY: camera.offsetY + (portrait ? 0.45 : 0) + (reducedMotion ? 0.35 : 0),
    offsetZ: camera.offsetZ * (portrait ? 1.06 : 1),
    halfWidth: camera.halfWidth * widthScale,
  };
}
