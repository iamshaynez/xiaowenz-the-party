import type { MonsterCarBuild, MonsterCarSlot } from '@party/protocol';
import { WHEEL_MODELS } from './wheels';
import { FRONT_MODELS } from './fronts';
import { REAR_MODELS } from './rears';
import { ROOF_MODELS } from './roofs';
import { DRIVER_MODELS } from './drivers';
import type { PartRig } from './types';

export { WHEEL_MODELS, FRONT_MODELS, REAR_MODELS, ROOF_MODELS, DRIVER_MODELS };
export const PART_MODEL_REGISTRIES = {
  wheels: WHEEL_MODELS,
  front: FRONT_MODELS,
  rear: REAR_MODELS,
  roof: ROOF_MODELS,
  driver: DRIVER_MODELS,
};

function instantiate<T extends string>(models: Record<T, () => PartRig>, partId: string) {
  const factory = models[partId as T];
  if (!factory) throw new Error(`没有零件模型：${partId}`);
  return factory();
}

export function createPartModel(slot: MonsterCarSlot, partId: string) {
  switch (slot) {
    case 'wheels': return instantiate(WHEEL_MODELS, partId);
    case 'front': return instantiate(FRONT_MODELS, partId);
    case 'rear': return instantiate(REAR_MODELS, partId);
    case 'roof': return instantiate(ROOF_MODELS, partId);
    case 'driver': return instantiate(DRIVER_MODELS, partId);
  }
}

export type PartIdFor<S extends MonsterCarSlot> = MonsterCarBuild[S];
