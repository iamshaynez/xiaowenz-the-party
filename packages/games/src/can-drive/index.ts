export {
  CAN_DRIVE_SLOTS,
  CAR_PARTS,
  DEFAULT_CAR_BUILD,
  cloneCarBuild,
  getBuildParts,
  getCarPart,
} from './catalog';
export type { CanDriveSlot, CarBuild, CarPart, CarPartReaction, CarSlot } from './catalog';

export { CAR_ENVIRONMENTS } from './environments';
export type { CarEnvironment, CarEnvironmentCategory, CarEnvironmentId } from './environments';

export {
  CAR_JUMP_START_MS,
  CAR_SEGMENT_DURATION_MS,
  CAR_SHOW_DURATION_MS,
  buildCarMotionProfile,
  createCarShowPlan,
  deriveCarShowSeed,
  sampleCarShowPose,
  toPublicCarShowPlan,
} from './show';
export type {
  CarMotionProfile,
  CarShowEnvironment,
  CarShowEvent,
  CarShowEventKind,
  CarShowHighlight,
  CarShowPlan,
  CarShowPose,
  CarShowStats,
  PublicCarShowPlan,
} from './show';

export { CAR_AWARDS, FALLBACK_CAR_AWARD_ID, assignCarAwards, getCarAward } from './awards';
export type { CarAward, CarAwardAssignment } from './awards';

export {
  CAN_DRIVE_AWARD_DURATION_MS,
  CAN_DRIVE_BUILD_DURATION_MS,
  CAN_DRIVE_TEST_DURATION_MS,
  canDriveGame,
} from './can-drive';
export type {
  CanDriveAwardView,
  CanDriveBuild,
  CanDriveCurrentKind,
  CanDriveCurrentView,
  CanDriveFinalCarView,
  CanDrivePhase,
  CanDriveRevealedAwardView,
  CanDriveView,
} from './can-drive';
