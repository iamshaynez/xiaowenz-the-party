import { describe, expect, it, vi } from 'vitest';
import { MONSTER_CAR_SLOTS } from '@party/protocol';
import type { MonsterCarBuild } from '@party/protocol';
import { MONSTER_CAR_PART_CATALOG, resolveMonsterCarReaction } from '@party/games';
import type { MonsterCarFrameCar, MonsterCarStimulus } from '@party/games';
import { CarAssembly } from '../../apps/web/src/components/monster-car/rendering/CarAssembly';

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
