import { describe, expect, it, vi } from 'vitest';
import { createMonsterCarRacePlan, sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarRacePlan } from '@party/games';
import type { MonsterCarBuild } from '@party/protocol';
import { createCarIdentity } from '../../apps/web/src/components/monster-car/rendering/presentation/CarIdentity';
import { createMonsterCarShowPlan } from '../../apps/web/src/components/monster-car/rendering/presentation/ShowPlan';
import type { MonsterCarShowPlan, MonsterCarStory, MonsterCarWeather } from '../../apps/web/src/components/monster-car/rendering/presentation/ShowPlan';
import { sampleSocialMoment, sampleSocialPose } from '../../apps/web/src/components/monster-car/rendering/presentation/SocialMoments';
import type { SocialMomentKind } from '../../apps/web/src/components/monster-car/rendering/presentation/SocialMoments';
import { sampleRaceCamera } from '../../apps/web/src/components/monster-car/rendering/presentation/RaceCamera';
import type { RaceCameraSample } from '../../apps/web/src/components/monster-car/rendering/presentation/RaceCamera';
import { WeatherField } from '../../apps/web/src/components/monster-car/rendering/WeatherField';

const DEFAULT_BUILD: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};
const WEATHERS: readonly MonsterCarWeather[] = ['fireflies', 'rain', 'petals', 'flowers', 'acorns', 'lanterns'];
const KINDS: readonly SocialMomentKind[] = [
  'generic-wave', 'duck-duet', 'umbrella-cover', 'bubble-pass', 'ghost-boo', 'lion-hop', 'banana-cheer',
];

function playersFor(ids: readonly string[]) {
  return ids.map((id, index) => ({ id, avatar: ['🐻', '🦊', '🐸', '🐼'][index % 4]! }));
}

function createPlan(
  ids: readonly string[] = ['owner', 'p2', 'p3', 'p4'],
  seed = 12_345,
  overrides: Record<string, MonsterCarBuild> = {},
) {
  const builds: Record<string, MonsterCarBuild> = {};
  for (const id of ids) builds[id] = { ...(overrides[id] ?? DEFAULT_BUILD) };
  return createMonsterCarRacePlan({
    playerIds: [...ids], builds, seed, now: 1_700_000_000_000,
  });
}

function createShow(plan: MonsterCarRacePlan): MonsterCarShowPlan {
  return createMonsterCarShowPlan(plan, playersFor(plan.racers.map((racer) => racer.playerId)));
}

function allStories() {
  const stories = new Map<MonsterCarWeather, MonsterCarStory>();
  for (let seed = 1; seed <= 64 && stories.size < WEATHERS.length; seed += 1) {
    const story = createShow(createPlan(['owner', 'p2'], seed)).story;
    stories.set(story.weather, story);
  }
  return WEATHERS.map((weather) => {
    const story = stories.get(weather);
    if (!story) throw new Error(`缺少天气故事 ${weather}`);
    return story;
  });
}

function expectFiniteCamera(camera: RaceCameraSample) {
  expect(Object.values(camera).every(Number.isFinite)).toBe(true);
  expect(camera.halfWidth).toBeGreaterThan(0);
}

function cameraDistance(left: RaceCameraSample, right: RaceCameraSample) {
  return Math.hypot(...Object.keys(left).map((key) => {
    const typedKey = key as keyof RaceCameraSample;
    return left[typedKey] - right[typedKey];
  }));
}

describe('怪兽汽车展示身份与故事', () => {
  it('身份稳定、有边界，并由玩家和头像而非赛事随机流驱动', () => {
    const first = createCarIdentity('player-a', 0, '🦊');
    expect(first).toEqual(createCarIdentity('player-a', 0, '🦊'));
    expect(first).not.toEqual(createCarIdentity('player-b', 0, '🦊'));
    expect(first).not.toEqual(createCarIdentity('player-a', 0, '🐼'));
    expect(first.baseColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(first.accentColor).toMatch(/^#[0-9a-f]{6}$/);
    expect(['dots', 'stripes', 'stars', 'checker']).toContain(first.pattern);
    expect(first.lengthScale).toBeGreaterThanOrEqual(0.94);
    expect(first.lengthScale).toBeLessThanOrEqual(1.06);
    expect(first.widthScale).toBeGreaterThanOrEqual(0.93);
    expect(first.widthScale).toBeLessThanOrEqual(1.05);
    expect(first.heightScale).toBeGreaterThanOrEqual(0.94);
    expect(first.heightScale).toBeLessThanOrEqual(1.06);
    expect(first.suspensionPhase).toBeGreaterThanOrEqual(0);
    expect(first.suspensionPhase).toBeLessThan(Math.PI * 2);
    expect(first.flagNumber).toBe(1);

    const players = playersFor(['owner', 'p2']);
    const firstShow = createMonsterCarShowPlan(createPlan(['owner', 'p2'], 1), players);
    const secondShow = createMonsterCarShowPlan(createPlan(['owner', 'p2'], 999), players);
    expect(firstShow.identities).toEqual(secondShow.identities);
    expect(firstShow.finaleSeed).not.toBe(secondShow.finaleSeed);
  });

  it('六个精心编排的故事均可到达，并包含完整的三色天空配置', () => {
    const stories = allStories();
    expect(new Set(stories.map((story) => story.id)).size).toBe(6);
    expect(stories.map((story) => story.weather).sort()).toEqual([...WEATHERS].sort());
    for (const story of stories) {
      expect(story.title.length).toBeGreaterThan(0);
      expect(story.dayColors).toHaveLength(3);
      expect(story.twilightColors).toHaveLength(3);
      for (const color of [
        ...story.dayColors, ...story.twilightColors,
        story.fogColor, story.backgroundColor, story.sunColor,
      ]) expect(color).toMatch(/^#[0-9a-f]{6}$/);
      expect(Number.isInteger(story.propVariant)).toBe(true);
    }
  });

  it('展示计划是纯 JSON，不保留可变输入引用，也不修改赛事或玩家', () => {
    const plan = createPlan();
    const players = playersFor(plan.racers.map((racer) => racer.playerId));
    const planBefore = JSON.stringify(plan);
    const playersBefore = JSON.stringify(players);
    const show = createMonsterCarShowPlan(plan, players);

    expect(JSON.stringify(plan)).toBe(planBefore);
    expect(JSON.stringify(players)).toBe(playersBefore);
    expect(JSON.parse(JSON.stringify(show))).toEqual(show);
    expect(Object.keys(show.identities)).toEqual(plan.racers.map((racer) => racer.playerId));
    show.story.dayColors[0] = '#000000';
    show.socialMoments[0]!.caption = 'changed';
    const fresh = createMonsterCarShowPlan(plan, players);
    expect(fresh.story.dayColors[0]).not.toBe('#000000');
    expect(fresh.socialMoments[0]!.caption).not.toBe('changed');
  });
});

describe('怪兽汽车社交时刻', () => {
  it.each([
    { ids: ['owner', 'p2'], expected: 1 },
    { ids: ['owner', 'p2', 'p3'], expected: null },
    { ids: ['owner', 'p2', 'p3', 'p4'], expected: 2 },
  ])('为 $ids.length 辆车规划不重复且不越界的时刻', ({ ids, expected }) => {
    const plan = createPlan(ids);
    const show = createShow(plan);
    if (expected !== null) expect(show.socialMoments).toHaveLength(expected);
    expect(show.socialMoments.length).toBeGreaterThanOrEqual(1);
    expect(show.socialMoments.length).toBeLessThanOrEqual(2);
    const used: string[] = [];
    for (const moment of show.socialMoments) {
      expect(KINDS).toContain(moment.kind);
      expect(ids).toContain(moment.actor);
      expect(ids).toContain(moment.target);
      expect(moment.actor).not.toBe(moment.target);
      expect(moment.start).toBeGreaterThanOrEqual(0);
      expect(moment.duration).toBeGreaterThan(0);
      expect(moment.start + moment.duration).toBeLessThanOrEqual(plan.durationMs);
      expect(moment.caption.length).toBeGreaterThan(0);
      used.push(moment.actor, moment.target);
    }
    expect(new Set(used).size).toBe(used.length);
    expect(createShow(plan).socialMoments).toEqual(show.socialMoments);
  });

  it.each([
    { kind: 'generic-wave', build: DEFAULT_BUILD },
    { kind: 'duck-duet', build: { ...DEFAULT_BUILD, driver: 'duck' } },
    { kind: 'umbrella-cover', build: { ...DEFAULT_BUILD, roof: 'umbrella' } },
    { kind: 'bubble-pass', build: { ...DEFAULT_BUILD, rear: 'bubble' } },
    { kind: 'ghost-boo', build: { ...DEFAULT_BUILD, driver: 'ghost' } },
    { kind: 'lion-hop', build: { ...DEFAULT_BUILD, driver: 'lion' } },
    { kind: 'banana-cheer', build: { ...DEFAULT_BUILD, wheels: 'banana' } },
  ] as { kind: SocialMomentKind; build: MonsterCarBuild }[])('根据零件选择 $kind', ({ kind, build }) => {
    const show = createShow(createPlan(['owner', 'p2'], 42, { owner: build }));
    expect(show.socialMoments[0]!.kind).toBe(kind);
  });

  it('按绝对时间采样活动时刻和有界姿态，区间外静止', () => {
    const show = createShow(createPlan(['owner', 'p2']));
    const moment = show.socialMoments[0]!;
    expect(sampleSocialMoment(show, moment.start - 1)).toBeNull();
    expect(sampleSocialMoment(show, moment.start)).toBe(moment);
    expect(sampleSocialMoment(show, moment.start + moment.duration / 2)).toBe(moment);
    expect(sampleSocialMoment(show, moment.start + moment.duration)).toBeNull();
    expect(sampleSocialMoment(show, Number.NaN)).toBeNull();
    expect(sampleSocialMoment(show, Number.POSITIVE_INFINITY)).toBeNull();

    for (const atMs of [
      moment.start, moment.start + 1, moment.start + moment.duration * 0.25,
      moment.start + moment.duration * 0.5, moment.start + moment.duration - 1,
      moment.start + moment.duration, -1, Number.MAX_VALUE, Number.NaN, Number.POSITIVE_INFINITY,
    ]) {
      const pose = sampleSocialPose(moment, atMs);
      expect(Object.values(pose).every(Number.isFinite)).toBe(true);
      expect(pose.cheer).toBeGreaterThanOrEqual(0);
      expect(pose.cheer).toBeLessThanOrEqual(1);
      expect(pose.look).toBeGreaterThanOrEqual(-1);
      expect(pose.look).toBeLessThanOrEqual(1);
      expect(pose.lean).toBeGreaterThanOrEqual(-1);
      expect(pose.lean).toBeLessThanOrEqual(1);
    }
    expect(sampleSocialPose(moment, moment.start)).toEqual({ cheer: 0, look: 0, lean: 0 });
    expect(sampleSocialPose(moment, moment.start + moment.duration)).toEqual({ cheer: 0, look: 0, lean: 0 });
    expect(sampleSocialPose(moment, moment.start + moment.duration / 2)).not.toEqual({ cheer: 0, look: 0, lean: 0 });
  });
});

describe('怪兽汽车导演相机', () => {
  it('任意采样顺序与极端时间下均确定且有限，不修改展示或帧', () => {
    const plan = createPlan();
    const show = createShow(plan);
    const cueTimes = plan.racers.flatMap((racer) => racer.cues.map((cue) => cue.startAtMs + cue.durationMs / 2));
    const socialTimes = show.socialMoments.map((moment) => moment.start + moment.duration / 2);
    const times = [
      -100, 0, 1_500, 2_800, 7_000, ...cueTimes, ...socialTimes,
      27_000, 29_000, 30_000, 1e12, Number.MAX_VALUE, Number.POSITIVE_INFINITY, Number.NaN,
    ];
    const forward = times.map((time) => sampleRaceCamera(
      show, time, sampleMonsterCarFrame(plan, time), 1.4, false,
    ));
    const backward = [...times].reverse().map((time) => sampleRaceCamera(
      show, time, sampleMonsterCarFrame(plan, time), 1.4, false,
    )).reverse();
    forward.forEach(expectFiniteCamera);
    expect(backward).toEqual(forward);

    const frame = sampleMonsterCarFrame(plan, 12_000);
    const showBefore = JSON.stringify(show);
    const frameBefore = JSON.stringify(frame);
    sampleRaceCamera(show, 12_000, frame, 1.4, false);
    expect(JSON.stringify(show)).toBe(showBefore);
    expect(JSON.stringify(frame)).toBe(frameBefore);
  });

  it('竖屏和减少动态效果时扩大构图，空帧也有安全镜头', () => {
    const plan = createPlan();
    const show = createShow(plan);
    const moment = show.socialMoments[0]!;
    const atMs = moment.start + moment.duration / 2;
    const frame = sampleMonsterCarFrame(plan, atMs);
    const landscape = sampleRaceCamera(show, atMs, frame, 1.6, false);
    const portrait = sampleRaceCamera(show, atMs, frame, 0.55, false);
    const reduced = sampleRaceCamera(show, atMs, frame, 1.6, true);
    expect(portrait.halfWidth).toBeGreaterThan(landscape.halfWidth);
    expect(portrait.offsetY).toBeGreaterThan(landscape.offsetY);
    expect(portrait.offsetZ).toBeGreaterThan(landscape.offsetZ);
    expect(reduced.halfWidth).toBeGreaterThan(landscape.halfWidth);
    expectFiniteCamera(sampleRaceCamera(show, 0, { atMs: 0, cars: [], leaderId: '' }, 0, false));
    expectFiniteCamera(sampleRaceCamera(show, Number.NaN, { atMs: Number.NaN, cars: [], leaderId: '' }, Number.NaN, true));
  });

  it('开场、事件、社交和终点镜头在边界使用平滑的绝对混合', () => {
    const plan = createPlan(['owner', 'p2'], 987);
    const show = createShow(plan);
    const moment = show.socialMoments[0]!;
    const cue = plan.racers[0]!.cues[0]!;
    const boundaries = [1_500, 2_800, moment.start, moment.start + moment.duration, cue.startAtMs, cue.startAtMs + cue.durationMs, 27_000];
    for (const boundary of boundaries) {
      const before = sampleRaceCamera(show, boundary - 1, sampleMonsterCarFrame(plan, boundary - 1), 1.2, false);
      const after = sampleRaceCamera(show, boundary + 1, sampleMonsterCarFrame(plan, boundary + 1), 1.2, false);
      expect(cameraDistance(before, after)).toBeLessThan(0.15);
    }
  });
});

describe('怪兽汽车 GPU 天气粒子池', () => {
  it('六种故事都使用确定性的固定 Points 池，精致模式只改变容量', () => {
    for (const story of allStories()) {
      const before = JSON.stringify(story);
      const first = new WeatherField(story, true);
      const second = new WeatherField(story, true);
      const compact = new WeatherField(story, false);
      try {
        const geometry = first.points.geometry;
        const capacity = geometry.getAttribute('position').count;
        expect(first.points.isPoints).toBe(true);
        expect(first.points.material.isShaderMaterial).toBe(true);
        expect(first.points.name).toBe(`monster-car-weather-${story.weather}`);
        expect(first.points.material.vertexShader).toContain('focusX');
        expect(first.points.material.fragmentShader).toContain('gl_PointCoord');
        expect(geometry.drawRange.count).toBe(capacity);
        expect(capacity).toBeGreaterThan(compact.points.geometry.getAttribute('position').count);
        for (const name of Object.keys(geometry.attributes)) {
          const attribute = geometry.getAttribute(name);
          expect(attribute.count).toBe(capacity);
          expect(attribute.array).toEqual(second.points.geometry.getAttribute(name).array);
        }
        expect(JSON.stringify(story)).toBe(before);
      } finally {
        first.dispose();
        second.dispose();
        compact.dispose();
      }
    }
  });

  it('更新只写 uniforms，极端时间不会扩张或替换粒子属性', () => {
    const field = new WeatherField(allStories()[0]!, true);
    const geometry = field.points.geometry;
    const material = field.points.material;
    const attributes = { ...geometry.attributes };
    const uniforms = material.uniforms;
    const capacity = geometry.getAttribute('position').count;
    try {
      for (const time of [0, 0.25, 100, 1e12, Number.MAX_VALUE, Number.POSITIVE_INFINITY, Number.NaN, -100]) {
        field.update(time, time === 100 ? Number.NaN : 54, false);
        expect(Number.isFinite(uniforms.time!.value)).toBe(true);
        expect(uniforms.time!.value).toBeGreaterThanOrEqual(0);
        expect(uniforms.time!.value).toBeLessThan(4_096);
        expect(Number.isFinite(uniforms.focusX!.value)).toBe(true);
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

  it('减少动态效果时冻结时间，dispose 幂等释放且之后更新无副作用', () => {
    const field = new WeatherField(allStories()[5]!, false);
    const uniforms = field.points.material.uniforms;
    field.update(0.5, 10, true);
    const frozen = { time: uniforms.time!.value, focusX: uniforms.focusX!.value };
    field.update(100, 20, true);
    expect(uniforms.time!.value).toBe(frozen.time);
    expect(uniforms.focusX!.value).toBe(20);
    expect(uniforms.reducedMotion!.value).toBe(1);
    field.update(1.5, 30, false);
    expect(uniforms.time!.value).toBe(1.5);
    expect(uniforms.reducedMotion!.value).toBe(0);

    const geometryDispose = vi.spyOn(field.points.geometry, 'dispose');
    const materialDispose = vi.spyOn(field.points.material, 'dispose');
    field.dispose();
    field.dispose();
    field.update(2, 40, false);
    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
    expect(uniforms.time!.value).toBe(1.5);
    expect(uniforms.focusX!.value).toBe(30);
  });
});
