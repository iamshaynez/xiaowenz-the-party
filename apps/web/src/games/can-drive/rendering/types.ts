import type * as THREE from 'three';
import type { ClayGeometryKit } from './geometry';

export const CLAY_CAR_SLOTS = ['driver', 'motion', 'front', 'rear', 'roof'] as const;

export type ClayCarSlot = (typeof CLAY_CAR_SLOTS)[number];
export type ClayCarBuild = Record<ClayCarSlot, string>;
export type ClayVector3 = readonly [number, number, number];
export type DriverReaction = 'drive' | 'brace' | 'dizzy' | 'cheer' | 'wave';

export type ClayPartChannel =
  | 'spin'
  | 'bounce'
  | 'open'
  | 'flame'
  | 'head'
  | 'accessory'
  | 'trail'
  | 'steer';

export interface ClayDriverRig {
  readonly leftEye: THREE.Object3D;
  readonly rightEye: THREE.Object3D;
  readonly mouth: THREE.Object3D;
  readonly leftArm: THREE.Object3D;
  readonly rightArm: THREE.Object3D;
}

export interface ClayPartVisual {
  readonly root: THREE.Group;
  readonly channels: Partial<Record<ClayPartChannel, THREE.Object3D>>;
  readonly driver?: ClayDriverRig;
}

export type ClayPartFactory = (kit: ClayGeometryKit) => ClayPartVisual;

export interface CarVisualPose {
  readonly position: ClayVector3;
  readonly rotation: ClayVector3;
  readonly speed: number;
  readonly wheelSpin: number;
  readonly activation: Record<ClayCarSlot, number>;
  readonly driverReaction: DriverReaction;
  /** Optional deterministic clock for accessory motion, in milliseconds. */
  readonly timeMs?: number;
}

export const CLAY_ENVIRONMENT_IDS = [
  'washboard',
  'mud',
  'water',
  'ice',
  'crosswind',
  'rain',
  'low-tunnel',
  'dark-cave',
  'soft-blocks',
  'jump',
] as const;

export type ClayEnvironmentId = (typeof CLAY_ENVIRONMENT_IDS)[number];

export interface ClayCameraHint {
  readonly position: ClayVector3;
  readonly target: ClayVector3;
}

export interface ClayEnvironmentVisual {
  readonly root: THREE.Group;
  readonly animated?: Readonly<Record<string, THREE.Object3D>>;
  readonly camera: ClayCameraHint;
  readonly update?: (atMs: number) => void;
}

export type ClayEnvironmentFactory = (kit: ClayGeometryKit) => ClayEnvironmentVisual;
