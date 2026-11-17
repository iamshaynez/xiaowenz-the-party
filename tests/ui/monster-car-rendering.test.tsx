import { describe, expect, it, vi } from 'vitest';
import { MONSTER_CAR_SLOTS, MONSTER_CAR_PART_IDS } from '@party/protocol';
import type { MonsterCarBuild } from '@party/protocol';
import { MONSTER_CAR_PART_CATALOG, resolveMonsterCarReaction } from '@party/games';
import type { MonsterCarFrameCar, MonsterCarStimulus } from '@party/games';
import { CarAssembly } from '../../apps/web/src/components/monster-car/rendering/CarAssembly';
import { PART_MODEL_REGISTRIES } from '../../apps/web/src/components/monster-car/rendering/models';
import { disposeModel } from '../../apps/web/src/components/monster-car/rendering/models/types';
import { REACTION_LIBRARY, sampleReactionPose } from '../../apps/web/src/components/monster-car/rendering/ReactionLibrary';
import { PartThumbnailBaker } from '../../apps/web/src/components/monster-car/thumbnails/PartThumbnailBaker';

const DEFAULT_BUILD: MonsterCarBuild = {
  wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
};
const STIMULI: MonsterCarStimulus[] = ['water', 'impact', 'wind', 'slope'];
const ENVIRONMENTS = { water: 'puddle', impact: 'log', wind: 'gust', slope: 'hill' } as const;
const PART_CASES = MONSTER_CAR_SLOTS.flatMap((slot) => (
  Object.keys(MONSTER_CAR_PART_CATALOG[slot]).map((partId) => ({ slot, partId }))
));

function expectFiniteTransforms(root: CarAssembly['root']) {
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    const values = [
      object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
      object.scale.x, object.scale.y, object.scale.z,
      object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w,
      ...object.matrix.elements,
      ...object.matrixWorld.elements,
    ];
    expect(values.every(Number.isFinite), `${object.type} 不应产生非有限变换`).toBe(true);
  });
}

describe('怪兽汽车无 WebGL 渲染协议', () => {
  it.each(PART_CASES)('组装 $slot/$partId，响应赛事 cues，并保持变换有限', ({ slot, partId }) => {
    const build = { ...DEFAULT_BUILD, [slot]: partId } as MonsterCarBuild;
    const assembly = new CarAssembly(build, 2);
    const dispose = vi.spyOn(assembly, 'dispose');

    try {
      expect(assembly.root.name).toBe('monster-car');
      expect(assembly.build).toEqual(build);
      assembly.update(0, 0, null, true);
      expectFiniteTransforms(assembly.root);

      for (const stimulus of STIMULI) {
        const { primary, secondary } = resolveMonsterCarReaction(build, stimulus);
        const cue: NonNullable<MonsterCarFrameCar['activeCue']> = {
          eventId: `${slot}/${partId}/${stimulus}`,
          environment: ENVIRONMENTS[stimulus],
          stimulus,
          startAtMs: 1_000,
          durationMs: primary.durationMs,
          intensity: 1.1,
          primary,
          secondary,
          localProgress: 0.5,
        };
        assembly.update(1.25, 4.5, cue);
        assembly.update(1.5, 5, { ...cue, localProgress: 0.75 }, true);
        expectFiniteTransforms(assembly.root);
      }
    } finally {
      assembly.dispose();
    }
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});

describe('怪兽汽车扩展协议', () => {
  it('协议、目录和视觉模型工厂在每个槽位精确一致', () => {
    expect(PART_CASES).toHaveLength(40);
    for (const slot of MONSTER_CAR_SLOTS) {
      expect(Object.keys(MONSTER_CAR_PART_CATALOG[slot]).sort()).toEqual([...MONSTER_CAR_PART_IDS[slot]].sort());
      expect(Object.keys(PART_MODEL_REGISTRIES[slot]).sort()).toEqual([...MONSTER_CAR_PART_IDS[slot]].sort());
    }
  });

  it('局部换件保留整车根节点，并安装真正的新零件模型', () => {
    const assembly = new CarAssembly(DEFAULT_BUILD, 0);
    const visual = assembly.root.children[0];
    try {
      assembly.setPart('wheels', 'banana');
      assembly.setPart('roof', 'whale');
      assembly.setPart('driver', 'lion');
      expect(assembly.root.children[0]).toBe(visual);
      expect(assembly.build).toMatchObject({ wheels: 'banana', roof: 'whale', driver: 'lion' });
      expect(assembly.root.getObjectByName('wheels:banana')).toBeDefined();
      expect(assembly.root.getObjectByName('roof:whale')).toBeDefined();
      expect(assembly.root.getObjectByName('driver:lion')).toBeDefined();
      expectFiniteTransforms(assembly.root);
    } finally {
      assembly.dispose();
    }
  });

  it('每个声明的反应都有显式运动配置，并产生有限的组合姿态', () => {
    for (const slot of MONSTER_CAR_SLOTS) {
      for (const part of Object.values(MONSTER_CAR_PART_CATALOG[slot])) {
        for (const [stimulus, reaction] of Object.entries(part.responses)) {
          if (!reaction) continue;
          expect(REACTION_LIBRARY, `${part.label} 的 ${reaction.reaction} 缺少运动配置`).toHaveProperty(reaction.reaction);
          const pose = sampleReactionPose(
            { ...reaction, partId: 'test', slot },
            stimulus as MonsterCarStimulus,
            0.5,
          );
          expect(Object.values(pose).every((value) => typeof value === 'string' || Number.isFinite(value))).toBe(true);
        }
      }
    }
  });

  it('钢琴键在同一帧重复更新时保持绝对位置，不发生累积漂移', () => {
    const build: MonsterCarBuild = { wheels: 'classic', front: 'piano', rear: 'trunk', roof: 'umbrella', driver: 'duck' };
    const assembly = new CarAssembly(build, 0);
    const reaction = resolveMonsterCarReaction(build, 'impact');
    const cue: NonNullable<MonsterCarFrameCar['activeCue']> = {
      eventId: 'piano-repeat', environment: 'log', stimulus: 'impact', startAtMs: 0,
      durationMs: reaction.primary.durationMs, intensity: 1, primary: reaction.primary,
      secondary: reaction.secondary, localProgress: 0.5,
    };
    try {
      const keys = assembly.root.getObjectByName('front:piano')?.getObjectByName('keys');
      if (!keys) throw new Error('钢琴缺少琴键节点');
      assembly.update(2, 8, cue);
      const first = keys.children.map((key) => key.position.y);
      assembly.update(2, 8, cue);
      expect(keys.children.map((key) => key.position.y)).toEqual(first);
    } finally {
      assembly.dispose();
    }
  });

  it('爆米花火箭在反应时显示火焰，反应结束后恢复隐藏', () => {
    const build: MonsterCarBuild = { wheels: 'classic', front: 'smile', rear: 'rocket', roof: 'umbrella', driver: 'duck' };
    const assembly = new CarAssembly(build, 0);
    const reaction = resolveMonsterCarReaction(build, 'slope');
    const cue: NonNullable<MonsterCarFrameCar['activeCue']> = {
      eventId: 'rocket-visible', environment: 'hill', stimulus: 'slope', startAtMs: 0,
      durationMs: reaction.primary.durationMs, intensity: 1, primary: reaction.primary,
      secondary: reaction.secondary, localProgress: 0.5,
    };
    try {
      const flame = assembly.root.getObjectByName('rear:rocket')?.getObjectByName('flame');
      if (!flame) throw new Error('火箭缺少火焰节点');
      expect(flame.visible).toBe(false);
      assembly.update(2, 8, cue);
      expect(flame.visible).toBe(true);
      assembly.update(2.1, 8.1, null);
      expect(flame.visible).toBe(false);
    } finally {
      assembly.dispose();
    }
  });

  it('司机主反应仍叠加底盘次级动作', () => {
    const build: MonsterCarBuild = { wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'umbrella', driver: 'ghost' };
    const reaction = resolveMonsterCarReaction(build, 'impact');
    expect(reaction.primary.slot).toBe('driver');
    expect(reaction.secondary.some((entry) => entry.slot === 'chassis')).toBe(true);
    const cue: NonNullable<MonsterCarFrameCar['activeCue']> = {
      eventId: 'ghost-chassis', environment: 'log', stimulus: 'impact', startAtMs: 0,
      durationMs: reaction.primary.durationMs, intensity: 1, primary: reaction.primary,
      secondary: reaction.secondary, localProgress: 0.25,
    };
    const withSecondary = new CarAssembly(build, 0);
    const withoutSecondary = new CarAssembly(build, 0);
    try {
      withSecondary.update(2, 8, cue);
      withoutSecondary.update(2, 8, { ...cue, secondary: [] });
      expect(withSecondary.root.children[0]!.rotation.z).not.toBe(withoutSecondary.root.children[0]!.rotation.z);
    } finally {
      withSecondary.dispose();
      withoutSecondary.dispose();
    }
  });

  it('默认轮胎将螺栓、花纹和糖针实例化，避免逐细节 draw call', () => {
    for (const partId of ['classic', 'donut'] as const) {
      const rig = PART_MODEL_REGISTRIES.wheels[partId]();
      let meshes = 0;
      let instances = 0;
      rig.root.traverse((object) => {
        if (object.constructor.name === 'InstancedMesh') instances += 1;
        else if (object.type === 'Mesh') meshes += 1;
      });
      const expectedInstances = partId === 'classic' ? 3 : 2;
      expect(instances).toBe(expectedInstances);
      expect(meshes).toBeLessThan(12);
      disposeModel(rig.root);
    }
  });

  it('最后一个缩略图消费者离开会取消尚未开始的排队任务', async () => {
    const baker = new PartThumbnailBaker();
    const pending = baker.request('wheels', 'classic');
    const rejection = expect(pending).rejects.toThrow('THUMBNAIL_CANCELLED');
    baker.release('wheels', 'classic');
    await rejection;
  });
});
