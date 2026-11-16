import type { ClayCarSlot, ClayPartFactory } from '../types';
import { DRIVER_PART_FACTORIES } from './driver';
import { MOTION_PART_FACTORIES } from './motion';
import { FRONT_PART_FACTORIES } from './front';
import { REAR_PART_FACTORIES } from './rear';
import { ROOF_PART_FACTORIES } from './roof';

export const CAR_PART_FACTORIES: Record<ClayCarSlot, Record<string, ClayPartFactory>> = {
  driver: DRIVER_PART_FACTORIES,
  motion: MOTION_PART_FACTORIES,
  front: FRONT_PART_FACTORIES,
  rear: REAR_PART_FACTORIES,
  roof: ROOF_PART_FACTORIES,
};

export {
  DRIVER_PART_FACTORIES,
  MOTION_PART_FACTORIES,
  FRONT_PART_FACTORIES,
  REAR_PART_FACTORIES,
  ROOF_PART_FACTORIES,
};
