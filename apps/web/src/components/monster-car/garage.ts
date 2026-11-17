import { MONSTER_CAR_PART_IDS, MONSTER_CAR_SLOTS } from '@party/protocol';
import type { MonsterCarBuild } from '@party/protocol';

export function surpriseCarBuild(current: MonsterCarBuild, rng: () => number = Math.random): MonsterCarBuild {
  let next = { ...current };
  for (const slot of MONSTER_CAR_SLOTS) {
    const currentId = current[slot];
    const alternatives = MONSTER_CAR_PART_IDS[slot].filter((partId) => partId !== currentId);
    const index = Math.floor(rng() * alternatives.length);
    next = { ...next, [slot]: alternatives[index] ?? currentId } as MonsterCarBuild;
  }
  return next;
}
