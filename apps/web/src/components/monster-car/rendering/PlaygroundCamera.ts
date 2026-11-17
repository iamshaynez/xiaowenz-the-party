import { COURSE_LENGTH, sampleCourse } from './courseMath';

export interface PlaygroundCameraPose {
  position: { x: number; y: number; z: number };
  /** Subtracting jump keeps the camera grounded while cars celebrate. */
  jump?: number;
}

export interface PlaygroundCameraFrame {
  targetX: number;
  targetY: number;
  targetZ: number;
  /** Camera position is target + offset. */
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  /** Orthographic horizontal half extent; vertical extent is halfWidth / aspect. */
  halfWidth: number;
}

interface Bounds {
  centerX: number;
  centerY: number;
  centerZ: number;
}

function safeAspect(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  // Extreme aspect ratios are not useful viewports and can overflow fitting math.
  return Math.min(4, value);
}

function groundedY(pose: PlaygroundCameraPose) {
  const jump = pose.jump !== undefined && Number.isFinite(pose.jump) ? pose.jump : 0;
  return pose.position.y - jump;
}

function poseBounds(poses: readonly PlaygroundCameraPose[]): Bounds {
  const finish = sampleCourse(1);
  let minimumX = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  let minimumZ = Number.POSITIVE_INFINITY;
  let maximumZ = Number.NEGATIVE_INFINITY;

  for (const pose of poses) {
    const { x, y, z } = pose.position;
    const groundY = groundedY(pose);
    if (![x, y, z, groundY].every(Number.isFinite)) continue;
    minimumX = Math.min(minimumX, x);
    maximumX = Math.max(maximumX, x);
    minimumY = Math.min(minimumY, groundY);
    maximumY = Math.max(maximumY, groundY);
    minimumZ = Math.min(minimumZ, z);
    maximumZ = Math.max(maximumZ, z);
  }

  if (!Number.isFinite(minimumX)) {
    return { centerX: COURSE_LENGTH + 5, centerY: finish.y + 0.04, centerZ: finish.z };
  }
  return {
    centerX: minimumX + (maximumX - minimumX) / 2,
    centerY: minimumY + (maximumY - minimumY) / 2,
    centerZ: minimumZ + (maximumZ - minimumZ) / 2,
  };
}

/**
 * Fits grounded car bounds without tracking individual hops or the ring's
 * rotation. Identical poses therefore always produce identical, calm framing.
 */
export function samplePlaygroundCamera(
  poses: readonly PlaygroundCameraPose[],
  aspect: number,
  mode: 'results' | 'photo',
  photo: boolean,
): PlaygroundCameraFrame {
  const viewportAspect = safeAspect(aspect);
  const portrait = viewportAspect < 0.85;
  const bounds = poseBounds(poses);
  const results = mode === 'results';
  // 合影进入/退出沿用同一构图，不在一帧内突然变焦。
  void photo;

  // The desktop results card occupies the right side. On portrait it occupies
  // the bottom, so a lower look target lifts the cars into the clear area.
  const targetX = bounds.centerX + (results && !portrait ? 2.4 : 0);
  const targetY = bounds.centerY + (results
    ? (portrait ? -0.9 : 1.4)
    : 1.5);
  const targetZ = bounds.centerZ;
  const offsetX = results ? 7 : 5.8;
  const offsetY = results ? (portrait ? 9.2 : 8.5) : 7.4;
  const offsetZ = results ? (portrait ? 18.5 : 17) : 16.8;

  const offsetLength = Math.hypot(offsetX, offsetY, offsetZ);
  const horizontalLength = Math.hypot(offsetX, offsetZ);
  const right = { x: offsetZ / horizontalLength, z: -offsetX / horizontalLength };
  const forward = {
    x: -offsetX / offsetLength,
    y: -offsetY / offsetLength,
    z: -offsetZ / offsetLength,
  };
  const up = {
    x: -right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y,
  };
  const horizontalUp = Math.hypot(up.x, up.z);

  // A circle around the grounded XZ bounds is rotation-invariant. Its
  // projection conservatively contains every car throughout the ring drive.
  let horizontalRadius = 0;
  let verticalRadius = 0;
  for (const pose of poses) {
    const { x, y, z } = pose.position;
    const groundY = groundedY(pose);
    if (![x, y, z, groundY].every(Number.isFinite)) continue;
    horizontalRadius = Math.max(horizontalRadius, Math.hypot(x - targetX, z - targetZ));
    verticalRadius = Math.max(verticalRadius, Math.abs(groundY - targetY));
  }

  const requiredHalfWidth = horizontalRadius + 2.1;
  const requiredHalfHeight = horizontalRadius * horizontalUp
    + verticalRadius * Math.abs(up.y)
    + 2.1;
  const minimumHalfWidth = results
    ? (portrait ? 13 : 10.8)
    : (portrait ? 11.8 : 10.2);
  const halfWidth = Math.max(
    minimumHalfWidth,
    requiredHalfWidth * 1.05,
    requiredHalfHeight * viewportAspect * 1.05,
  );

  return {
    targetX,
    targetY,
    targetZ,
    offsetX,
    offsetY,
    offsetZ,
    halfWidth: Number.isFinite(halfWidth) ? halfWidth : minimumHalfWidth,
  };
}
