import { describe, expect, it } from 'vitest';
import { createMonsterCarRacePlan } from '@party/games';
import type { MonsterCarBuild } from '@party/protocol';
import { COURSE_LENGTH, sampleCourse } from '../../apps/web/src/components/monster-car/rendering/courseMath';
import { samplePlaygroundMotion } from '../../apps/web/src/components/monster-car/rendering/PlaygroundMotion';
import { sampleFinaleMotion } from '../../apps/web/src/components/monster-car/rendering/presentation/FinaleMotion';
import type { FinaleCarPose } from '../../apps/web/src/components/monster-car/rendering/presentation/FinaleMotion';
import { samplePlaygroundCamera } from '../../apps/web/src/components/monster-car/rendering/PlaygroundCamera';

const DEFAULT_BUILD: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};
const PLAYER_IDS = ['owner', 'p2', 'p3', 'p4'];
const EXPECTED_FORMATIONS: Record<number, string[]> = {
  2: ['side-by-side', 'facing-pair'],
  3: ['triangle', 'arc'],
  4: ['line', 'diamond', '2x2'],
};

function createPlan(count: number) {
  const playerIds = PLAYER_IDS.slice(0, count);
  const builds: Record<string, MonsterCarBuild> = {};
  for (const playerId of playerIds) builds[playerId] = { ...DEFAULT_BUILD };
  return createMonsterCarRacePlan({ playerIds, builds, seed: 12_345, now: 1_700_000_000_000 });
}

function expectFinitePoses(poses: FinaleCarPose[], count: number) {
  expect(poses).toHaveLength(count);
  for (const pose of poses) {
    expect([
      pose.position.x, pose.position.y, pose.position.z,
      pose.yaw, pose.pitch, pose.travelDistance, pose.jump, pose.celebration,
    ].every(Number.isFinite)).toBe(true);
    expect(pose.jump).toBeGreaterThanOrEqual(0);
    expect(pose.celebration).toBeGreaterThanOrEqual(0);
    expect(pose.celebration).toBeLessThanOrEqual(1);
    expect(typeof pose.photo).toBe('boolean');
    expect(pose.formation.length).toBeGreaterThan(0);
  }
}

function distance(left: FinaleCarPose, right: FinaleCarPose) {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z,
  );
}

function expectPhotoSpacing(poses: FinaleCarPose[]) {
  const finish = sampleCourse(1);
  for (let left = 0; left < poses.length; left += 1) {
    const pose = poses[left]!;
    expect(Math.hypot(pose.position.x - (COURSE_LENGTH + 5), pose.position.z - finish.z)).toBeLessThanOrEqual(6);
    for (let right = left + 1; right < poses.length; right += 1) {
      expect(distance(pose, poses[right]!)).toBeGreaterThanOrEqual(3.4);
    }
  }
}

function expectCameraContainsPoses(
  poses: FinaleCarPose[],
  aspect: number,
  mode: 'results' | 'photo',
  photo: boolean,
) {
  const frame = samplePlaygroundCamera(poses, aspect, mode, photo);
  const values = Object.values(frame);
  expect(values.every(Number.isFinite)).toBe(true);
  expect(frame.halfWidth).toBeGreaterThan(0);
  expect(samplePlaygroundCamera(poses, aspect, mode, photo)).toEqual(frame);

  const horizontalLength = Math.hypot(frame.offsetX, frame.offsetZ);
  const right = { x: frame.offsetZ / horizontalLength, y: 0, z: -frame.offsetX / horizontalLength };
  const offsetLength = Math.hypot(frame.offsetX, frame.offsetY, frame.offsetZ);
  const forward = {
    x: -frame.offsetX / offsetLength,
    y: -frame.offsetY / offsetLength,
    z: -frame.offsetZ / offsetLength,
  };
  const up = {
    x: right.y * forward.z - right.z * forward.y,
    y: right.z * forward.x - right.x * forward.z,
    z: right.x * forward.y - right.y * forward.x,
  };
  for (const pose of poses) {
    const relative = {
      x: pose.position.x - frame.targetX,
      y: pose.position.y - frame.targetY,
      z: pose.position.z - frame.targetZ,
    };
    const screenX = Math.abs(relative.x * right.x + relative.y * right.y + relative.z * right.z);
    const screenY = Math.abs(relative.x * up.x + relative.y * up.y + relative.z * up.z);
    expect(screenX + 1.2).toBeLessThanOrEqual(frame.halfWidth);
    expect(screenY + 1.2).toBeLessThanOrEqual(frame.halfWidth / aspect);
  }
  return frame;
}

describe('怪兽汽车终场合影运动', () => {
  it.each([2, 3, 4])('%i 辆车保留既有入场和圆环，并在合影窗完全静止', (count) => {
    const plan = createPlan(count);
    for (const time of [0, 750, 1_500, 4_000, 5_000]) {
      const base = samplePlaygroundMotion(plan, time);
      const finale = sampleFinaleMotion(plan, time);
      expect(finale.map(({ photo: _photo, formation: _formation, ...pose }) => pose)).toEqual(base);
      expect(finale.every((pose) => !pose.photo)).toBe(true);
    }

    const start = sampleFinaleMotion(plan, 6_400);
    const middle = sampleFinaleMotion(plan, 7_900);
    const end = sampleFinaleMotion(plan, 9_400);
    expect(start).toEqual(middle);
    expect(start).toEqual(end);
    expect(start.every((pose) => pose.photo && pose.jump === 0)).toBe(true);
    expect(new Set(start.map((pose) => pose.formation))).toEqual(new Set([start[0]!.formation]));
    expect(EXPECTED_FORMATIONS[count]).toContain(start[0]!.formation);
    expectPhotoSpacing(start);
  });

  it.each([2, 3, 4])('%i 辆车可轮到全部队形，并在约 20 秒后再次合影', (count) => {
    const plan = createPlan(count);
    const variants = EXPECTED_FORMATIONS[count]!;
    const seen = new Set<string>();
    for (let cycle = 0; cycle < variants.length; cycle += 1) {
      const poses = sampleFinaleMotion(plan, 7_000 + cycle * 20_000);
      expect(poses.every((pose) => pose.photo)).toBe(true);
      expect(poses).toEqual(sampleFinaleMotion(plan, 8_500 + cycle * 20_000));
      expectPhotoSpacing(poses);
      seen.add(poses[0]!.formation);
    }
    expect(seen).toEqual(new Set(variants));

    const first = sampleFinaleMotion(plan, 7_000);
    const repeated = sampleFinaleMotion(plan, 7_000 + variants.length * 20_000);
    expect(repeated.map(({ travelDistance: _travelDistance, ...pose }) => pose)).toEqual(
      first.map(({ travelDistance: _travelDistance, ...pose }) => pose),
    );
    for (let index = 0; index < count; index += 1) {
      expect(repeated[index]!.travelDistance).toBeGreaterThan(first[index]!.travelDistance);
    }
  });

  it.each([2, 3, 4])('%i 辆车在编队、合影、返场和循环边界平滑移动', (count) => {
    const plan = createPlan(count);
    for (const boundary of [5_000, 6_400, 9_400, 11_400, 20_000, 25_000, 26_400, 29_400]) {
      const before = sampleFinaleMotion(plan, boundary - 1);
      const at = sampleFinaleMotion(plan, boundary);
      const after = sampleFinaleMotion(plan, boundary + 1);
      for (let index = 0; index < count; index += 1) {
        expect(distance(before[index]!, at[index]!)).toBeLessThan(0.08);
        expect(distance(at[index]!, after[index]!)).toBeLessThan(0.08);
        expect(at[index]!.travelDistance - before[index]!.travelDistance).toBeGreaterThanOrEqual(0);
        expect(after[index]!.travelDistance - at[index]!.travelDistance).toBeGreaterThanOrEqual(0);
        expect(at[index]!.travelDistance - before[index]!.travelDistance).toBeLessThan(0.01);
        expect(after[index]!.travelDistance - at[index]!.travelDistance).toBeLessThan(0.01);
      }
    }

    const photoStart = sampleFinaleMotion(plan, 6_400);
    const photoEnd = sampleFinaleMotion(plan, 9_400);
    const resumed = sampleFinaleMotion(plan, 9_401);
    for (let index = 0; index < count; index += 1) {
      expect(photoEnd[index]!.travelDistance).toBe(photoStart[index]!.travelDistance);
      expect(resumed[index]!.travelDistance).toBeGreaterThan(photoEnd[index]!.travelDistance);
    }
  });

  it.each([2, 3, 4])('%i 辆车支持任意顺序及极端时间采样，数值始终有限', (count) => {
    const plan = createPlan(count);
    const times = [8_000, 250, 1e12, 27_000, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, 4_200];
    const forward = times.map((time) => sampleFinaleMotion(plan, time));
    const backward = [...times].reverse().map((time) => sampleFinaleMotion(plan, time)).reverse();
    expect(backward).toEqual(forward);
    for (const poses of forward) expectFinitePoses(poses, count);

    for (const time of [-100, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(sampleFinaleMotion(plan, time)).toEqual(sampleFinaleMotion(plan, 0));
    }
  });
});

describe('怪兽汽车操场相机', () => {
  it.each([2, 3, 4])('%i 辆车在结果卡和合影模式、横竖屏下均保留安全边距', (count) => {
    const plan = createPlan(count);
    for (const time of [4_000, 5_800, 7_000, 10_200]) {
      const poses = sampleFinaleMotion(plan, time);
      const photo = poses[0]!.photo;
      for (const aspect of [0.55, 1, 1.8]) {
        expectCameraContainsPoses(poses, aspect, 'results', photo);
        expectCameraContainsPoses(poses, aspect, 'photo', photo);
      }
    }
  });

  it('结果卡模式更宽松，竖屏不会比横屏裁掉更多车辆', () => {
    const poses = sampleFinaleMotion(createPlan(4), 7_000);
    const landscapePhoto = samplePlaygroundCamera(poses, 1.8, 'photo', true);
    const landscapeResults = samplePlaygroundCamera(poses, 1.8, 'results', true);
    const portraitPhoto = samplePlaygroundCamera(poses, 0.55, 'photo', true);
    const portraitResults = samplePlaygroundCamera(poses, 0.55, 'results', true);

    expect(landscapeResults.halfWidth).toBeGreaterThan(landscapePhoto.halfWidth);
    expect(portraitPhoto.halfWidth).toBeGreaterThanOrEqual(landscapePhoto.halfWidth);
    expect(portraitResults.halfWidth).toBeGreaterThanOrEqual(landscapeResults.halfWidth);
    expect(portraitResults.targetY).toBeLessThan(landscapeResults.targetY);
  });

  it('合影期间相机完全稳定，空车队和非法宽高比也有有限回退', () => {
    const plan = createPlan(3);
    const start = sampleFinaleMotion(plan, 6_400);
    const end = sampleFinaleMotion(plan, 9_400);
    expect(samplePlaygroundCamera(start, 0.7, 'photo', true)).toEqual(
      samplePlaygroundCamera(end, 0.7, 'photo', true),
    );

    for (const aspect of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const frame = samplePlaygroundCamera([], aspect, 'results', false);
      expect(Object.values(frame).every(Number.isFinite)).toBe(true);
      expect(frame.halfWidth).toBeGreaterThan(0);
    }
  });

  it('减少动效时直接停留在稳定合影，不继续绕场、跳跃或移动车轮', () => {
    const plan = createPlan(4);
    const first = sampleFinaleMotion(plan, 500, true);
    const later = sampleFinaleMotion(plan, 90_000, true);
    expect(later).toEqual(first);
    expect(first.every((pose) => pose.photo && pose.jump === 0 && pose.travelDistance === 0)).toBe(true);
  });

  it('合影开关不再改变镜头构图，返场时位置与车轮共用暂停补偿时间线', () => {
    const plan = createPlan(2);
    const poses = sampleFinaleMotion(plan, 7_000);
    expect(samplePlaygroundCamera(poses, 1.8, 'photo', false)).toEqual(
      samplePlaygroundCamera(poses, 1.8, 'photo', true),
    );

    const returned = sampleFinaleMotion(plan, 11_400);
    const equivalentDrive = samplePlaygroundMotion(plan, 8_400);
    returned.forEach((pose, index) => {
      expect(pose.position).toEqual(equivalentDrive[index]!.position);
      expect(pose.yaw).toBe(equivalentDrive[index]!.yaw);
      expect(pose.travelDistance).toBe(equivalentDrive[index]!.travelDistance);
    });
  });
});
