import { CAR_PARTS, CAN_DRIVE_SLOTS, sampleCarShowPose } from '@party/games';
import type { PublicCarShowPlan } from '@party/games';
import type { CarVisualPose, ClayCarSlot, DriverReaction } from './types';

export function poseForShow(plan: PublicCarShowPlan, atMs: number, celebration = false): CarVisualPose {
  const pose = sampleCarShowPose(plan, atMs);
  const recentEvent = plan.events.findLast((event) => event.atMs <= atMs && atMs - event.atMs < 900);
  let driverReaction: DriverReaction = celebration ? 'cheer' : 'drive';
  if (!celebration && (recentEvent?.kind === 'jump' || pose.heightM > 0.35)) driverReaction = 'brace';
  if (!celebration && recentEvent && ['collision', 'spin', 'stuck', 'splash', 'land'].includes(recentEvent.kind)) {
    driverReaction = 'dizzy';
  }
  if (!celebration && recentEvent?.kind === 'finish') driverReaction = 'wave';

  const activation = Object.fromEntries(CAN_DRIVE_SLOTS.map((slot) => {
    const partId = plan.build[slot];
    const part = CAR_PARTS[slot].find((candidate) => candidate.id === partId);
    const reacting = part?.reactions.some((reaction) => reaction.environmentId === pose.environmentId);
    const baseline = slot === 'motion' ? 0.8 : slot === 'rear' ? 0.45 : 0.12;
    return [slot, reacting ? 1 : baseline];
  })) as Record<ClayCarSlot, number>;

  return {
    position: [0, pose.heightM, -2.25 + pose.progress * 4.5],
    rotation: [pose.pitch * Math.PI / 180, 0, pose.roll * Math.PI / 180],
    speed: pose.speedKph,
    wheelSpin: atMs * 0.00018 * pose.speedKph,
    activation,
    driverReaction,
    timeMs: atMs,
  };
}
