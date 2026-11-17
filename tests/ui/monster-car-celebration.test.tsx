import { describe, expect, it, vi } from 'vitest';
import { createMonsterCarRacePlan, sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarBuild } from '@party/protocol';
import { COURSE_LENGTH, sampleCourse } from '../../apps/web/src/components/monster-car/rendering/courseMath';
import { samplePlaygroundMotion } from '../../apps/web/src/components/monster-car/rendering/PlaygroundMotion';
import type { PlaygroundCarPose } from '../../apps/web/src/components/monster-car/rendering/PlaygroundMotion';
import { FireworksField } from '../../apps/web/src/components/monster-car/rendering/FireworksField';

const DEFAULT_BUILD: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};
const PLAYER_IDS = ['owner', 'p2', 'p3', 'p4', 'p5', 'p6'];

function createPlan() {
  const builds: Record<string, MonsterCarBuild> = {};
  for (const playerId of PLAYER_IDS) builds[playerId] = { ...DEFAULT_BUILD };
  return createMonsterCarRacePlan({ playerIds: PLAYER_IDS, builds, seed: 12_345, now: 1_700_000_000_000 });
}

function expectFinitePoses(poses: PlaygroundCarPose[]) {
  expect(poses).toHaveLength(PLAYER_IDS.length);
  for (const pose of poses) {
    expect([
      pose.position.x, pose.position.y, pose.position.z,
      pose.yaw, pose.pitch, pose.travelDistance, pose.jump, pose.celebration,
    ].every(Number.isFinite)).toBe(true);
    expect(pose.jump).toBeGreaterThanOrEqual(0);
    expect(pose.celebration).toBeGreaterThanOrEqual(0);
    expect(pose.celebration).toBeLessThanOrEqual(1);
  }
}

function distance(left: PlaygroundCarPose, right: PlaygroundCarPose) {
  return Math.hypot(
    left.position.x - right.position.x,
    left.position.y - right.position.y,
    left.position.z - right.position.z,
  );
}

describe('怪兽汽车庆典游乐场运动', () => {
  it('从最终路面位置平滑入场，并接入围绕广场错开的圆环', () => {
    const plan = createPlan();
    const finalFrame = sampleMonsterCarFrame(plan, plan.durationMs);
    const initial = samplePlaygroundMotion(plan, 0);

    for (const pose of initial) {
      const finalCar = finalFrame.cars.find((car) => car.playerId === pose.playerId)!;
      const road = sampleCourse(finalCar.progress);
      expect(pose.position).toEqual({ x: road.x, y: road.y + 0.04, z: road.z + finalCar.lane * 1.18 });
      expect(pose.yaw).toBeCloseTo(road.yaw, 12);
      expect(pose.pitch).toBeCloseTo(road.pitch, 12);
      expect(pose.travelDistance).toBe(road.x);
      expect(pose.jump).toBe(0);
      expect(pose.celebration).toBe(0);
    }

    const before = samplePlaygroundMotion(plan, 1_499);
    const arrival = samplePlaygroundMotion(plan, 1_500);
    const after = samplePlaygroundMotion(plan, 1_501);
    const finish = sampleCourse(1);
    const angles = new Set<number>();

    for (let index = 0; index < arrival.length; index += 1) {
      const pose = arrival[index]!;
      expect(distance(before[index]!, pose)).toBeLessThan(0.05);
      expect(distance(after[index]!, pose)).toBeLessThan(0.05);
      expect(Math.hypot(pose.position.x - (COURSE_LENGTH + 5), pose.position.z - finish.z)).toBeCloseTo(5.9, 10);
      expect(pose.position.y - (finish.y + 0.04)).toBeCloseTo(pose.jump, 10);
      angles.add(Math.round(Math.atan2(pose.position.z - finish.z, pose.position.x - (COURSE_LENGTH + 5)) * 1_000));
    }
    expect(angles.size).toBe(PLAYER_IDS.length);
  });

  it('入场后持续行驶、周期性起跳，并可按任意顺序重复采样', () => {
    const plan = createPlan();
    const earlier = samplePlaygroundMotion(plan, 4_000);
    const later = samplePlaygroundMotion(plan, 4_300);
    expect(later[0]!.travelDistance).toBeGreaterThan(earlier[0]!.travelDistance);
    expect(distance(earlier[0]!, later[0]!)).toBeGreaterThan(0.1);

    let earlyHop = false;
    let lateHop = false;
    let landing = false;
    for (let index = 0; index < 48; index += 1) {
      const early = samplePlaygroundMotion(plan, 2_000 + index * 100)[0]!;
      const late = samplePlaygroundMotion(plan, 1_000_000_000 + index * 100)[0]!;
      if (early.jump > 0.45) earlyHop = true;
      if (late.jump > 0.45) lateHop = true;
      if (early.jump < 0.02) landing = true;
    }
    expect(earlyHop).toBe(true);
    expect(lateHop).toBe(true);
    expect(landing).toBe(true);

    const times = [8_000, 250, 1_000_000_000, 1_500, 4_200];
    const forward = times.map((time) => samplePlaygroundMotion(plan, time));
    const backward = [...times].reverse().map((time) => samplePlaygroundMotion(plan, time)).reverse();
    expect(backward).toEqual(forward);
    expect(samplePlaygroundMotion(plan, 4_200)).toEqual(forward[4]);
  });

  it.each([
    -100, 0, 1_500, 1e12, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, Number.POSITIVE_INFINITY, Number.NaN,
  ])('时间 %s 的所有姿态数值保持有限', (time) => {
    expectFinitePoses(samplePlaygroundMotion(createPlan(), time));
  });
});

describe('怪兽汽车无 WebGL 烟花粒子池', () => {
  it('使用固定种子、固定容量、加法混合和自定义柔性径向烟花 shader', () => {
    const first = new FireworksField(true);
    const second = new FireworksField(true);
    const compact = new FireworksField(false);

    try {
      const geometry = first.points.geometry;
      const material = first.points.material;
      const capacity = geometry.getAttribute('position').count;
      expect(first.points.isPoints).toBe(true);
      expect(material.isShaderMaterial).toBe(true);
      // THREE.AdditiveBlending without importing the app-local package from tests.
      expect(material.blending).toBe(2);
      expect(material.transparent).toBe(true);
      expect(material.depthWrite).toBe(false);
      expect(material.vertexShader).toContain('gravity');
      expect(material.fragmentShader).toContain('gl_PointCoord');
      expect(geometry.drawRange.count).toBe(capacity);
      expect(capacity).toBeGreaterThan(compact.points.geometry.getAttribute('position').count);

      for (const name of Object.keys(geometry.attributes)) {
        expect(geometry.getAttribute(name).count).toBe(capacity);
        expect(geometry.getAttribute(name).array).toEqual(second.points.geometry.getAttribute(name).array);
      }
      const starts = geometry.getAttribute('aStart');
      const lifetimes = geometry.getAttribute('aLifetime');
      expect(starts.getX(0)).toBe(0);
      expect(starts.getX(capacity - 1)).toBeGreaterThan(0);
      for (let index = 0; index < capacity; index += 1) {
        expect(lifetimes.getX(index)).toBeGreaterThan(0);
        expect(lifetimes.getX(index)).toBeLessThan(material.uniforms.period!.value);
      }
    } finally {
      first.dispose();
      second.dispose();
      compact.dispose();
    }
  });

  it('绝对时间驱动初始及后续轮次，更新不会扩张或替换粒子属性', () => {
    const field = new FireworksField(true);
    const geometry = field.points.geometry;
    const material = field.points.material;
    const attributes = { ...geometry.attributes };
    const uniforms = material.uniforms;
    const capacity = geometry.getAttribute('position').count;

    try {
      field.update(0);
      expect(uniforms.time!.value).toBe(0);
      field.update(1.25);
      expect(uniforms.time!.value).toBe(1.25);
      field.update(uniforms.period!.value + 0.25);
      expect(uniforms.time!.value).toBeCloseTo(0.25, 12);

      for (const time of [0, 0.2, 5, 10_000, Number.MAX_VALUE, Number.POSITIVE_INFINITY, Number.NaN]) {
        field.update(time);
        expect(Number.isFinite(uniforms.time!.value)).toBe(true);
        expect(uniforms.time!.value).toBeGreaterThanOrEqual(0);
        expect(uniforms.time!.value).toBeLessThan(uniforms.period!.value);
        expect(material.uniforms).toBe(uniforms);
        expect(geometry.getAttribute('position').count).toBe(capacity);
        expect(geometry.drawRange.count).toBe(capacity);
        for (const [name, attribute] of Object.entries(attributes)) {
          expect(geometry.getAttribute(name)).toBe(attribute);
        }
      }
    } finally {
      field.dispose();
    }
  });

  it('减少动态效果时冻结并降低烟花强度，消除时间驱动闪烁', () => {
    const field = new FireworksField(false);
    const uniforms = field.points.material.uniforms;

    try {
      field.update(0.1, true);
      const frozenTime = uniforms.time!.value;
      field.update(100, true);
      expect(uniforms.time!.value).toBe(frozenTime);
      expect(uniforms.reducedMotion!.value).toBe(1);
      expect(field.points.material.fragmentShader).toContain('vAlpha');
      field.update(1.5, false);
      expect(uniforms.time!.value).toBe(1.5);
      expect(uniforms.reducedMotion!.value).toBe(0);
    } finally {
      field.dispose();
    }
  });

  it('dispose 幂等释放 geometry 和 material', () => {
    const field = new FireworksField(false);
    const geometryDispose = vi.spyOn(field.points.geometry, 'dispose');
    const materialDispose = vi.spyOn(field.points.material, 'dispose');

    field.dispose();
    field.dispose();
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
  });
});
