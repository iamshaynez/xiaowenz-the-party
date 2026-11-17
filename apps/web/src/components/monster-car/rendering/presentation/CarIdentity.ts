import { unitFromPurpose } from './deterministic';

export type MonsterCarPattern = 'dots' | 'stripes' | 'stars' | 'checker';

export interface CarIdentity {
  baseColor: string;
  accentColor: string;
  pattern: MonsterCarPattern;
  lengthScale: number;
  widthScale: number;
  heightScale: number;
  suspensionPhase: number;
  flagNumber: number;
}

const BASE_COLORS = [
  '#ef766f', '#ef9c62', '#e9bf59', '#75bfa8', '#67afc1', '#8198d5',
  '#ac8bd0', '#d58eae', '#8eaf69', '#d98a71', '#68b8a0', '#a49ad8',
] as const;
const ACCENT_COLORS = [
  '#fff1c9', '#f8d5c0', '#d9f0df', '#d7edf2', '#e5ddf4', '#f8df9b',
  '#48566f', '#735c68', '#386f69', '#76643f',
] as const;
const PATTERNS: readonly MonsterCarPattern[] = ['dots', 'stripes', 'stars', 'checker'];

function palettePick<T>(palette: readonly T[], value: number) {
  return palette[Math.min(palette.length - 1, Math.floor(value * palette.length))]!;
}

/**
 * Creates the stable visual identity of a participant, independently of race RNG.
 * The participant index only supplies grid-order variation and the visible flag.
 */
export function createCarIdentity(
  playerId: string,
  participantIndex: number,
  avatar: string,
): CarIdentity {
  const index = Number.isFinite(participantIndex)
    ? Math.max(0, Math.trunc(participantIndex))
    : 0;
  const paint = unitFromPurpose('monster-car.identity.base', playerId, avatar);
  const accent = unitFromPurpose('monster-car.identity.accent', playerId, avatar, index);

  return {
    baseColor: palettePick(BASE_COLORS, paint),
    accentColor: palettePick(ACCENT_COLORS, accent),
    pattern: palettePick(PATTERNS, unitFromPurpose('monster-car.identity.pattern', playerId, avatar)),
    lengthScale: 0.94 + unitFromPurpose('monster-car.identity.length', playerId, avatar) * 0.12,
    widthScale: 0.93 + unitFromPurpose('monster-car.identity.width', playerId, avatar) * 0.12,
    heightScale: 0.94 + unitFromPurpose('monster-car.identity.height', playerId, avatar) * 0.12,
    suspensionPhase: unitFromPurpose('monster-car.identity.suspension', playerId, avatar) * Math.PI * 2,
    flagNumber: index % 99 + 1,
  };
}
