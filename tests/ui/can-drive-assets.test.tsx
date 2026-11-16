import { describe, expect, it } from 'vitest';
import { CAR_ENVIRONMENTS, CAR_PARTS, CAN_DRIVE_SLOTS } from '@party/games';
import { ClayGeometryKit } from '../../apps/web/src/games/can-drive/rendering/geometry';
import { CAR_PART_FACTORIES } from '../../apps/web/src/games/can-drive/rendering/parts';
import { CarAssembly, DEFAULT_CLAY_CAR_BUILD } from '../../apps/web/src/games/can-drive/rendering/CarAssembly';
import { CLAY_ENVIRONMENT_FACTORIES } from '../../apps/web/src/games/can-drive/rendering/environments';
import type { ClayCarSlot, ClayEnvironmentId, ClayPartVisual } from '../../apps/web/src/games/can-drive/rendering/types';

function expectFiniteTransforms(root: ClayPartVisual['root']) {
  root.traverse((object) => {
    expect(Number.isFinite(object.position.x + object.position.y + object.position.z)).toBe(true);
    expect(Number.isFinite(object.rotation.x + object.rotation.y + object.rotation.z)).toBe(true);
    expect(Number.isFinite(object.scale.x + object.scale.y + object.scale.z)).toBe(true);
  });
}

describe('黏土零件与环境素材合同', () => {
  it('40 个领域零件都有非空视觉工厂，且资源可幂等释放', () => {
    const factoryIds = new Set<string>();
    for (const slot of CAN_DRIVE_SLOTS) {
      for (const part of CAR_PARTS[slot]) {
        const factory = CAR_PART_FACTORIES[slot as ClayCarSlot][part.id];
        expect(factory, `${slot}:${part.id}`).toBeTypeOf('function');
        const kit = new ClayGeometryKit();
        const visual = factory!(kit);
        expect(visual.root.isGroup).toBe(true);
        expect(visual.root.children.length).toBeGreaterThan(0);
        expectFiniteTransforms(visual.root);
        expect(kit.resourceCounts.geometries).toBeGreaterThan(0);
        factoryIds.add(`${slot}:${part.id}`);
        kit.dispose();
        kit.dispose();
        expect(kit.resourceCounts).toEqual({ geometries: 0, materials: 0, textures: 0 });
      }
    }
    expect(factoryIds.size).toBe(40);
  });

  it('同一装配根节点可以轮换全部零件并执行标准动画姿态', () => {
    const assembly = new CarAssembly();
    const root = assembly.root;
    for (const slot of CAN_DRIVE_SLOTS) {
      for (const part of CAR_PARTS[slot]) {
        assembly.setBuild({ ...DEFAULT_CLAY_CAR_BUILD, [slot]: part.id });
        expect(assembly.root).toBe(root);
        expect(assembly.build[slot]).toBe(part.id);
        assembly.update({
          position: [0, 0.5, 0],
          rotation: [0.1, 0.2, 0.1],
          speed: 20,
          wheelSpin: 1.5,
          activation: { driver: 1, motion: 1, front: 1, rear: 1, roof: 1 },
          driverReaction: 'brace',
          timeMs: 3_500,
        });
        expectFiniteTransforms(assembly.root);
      }
    }
    assembly.dispose();
    assembly.dispose();
  });

  it('完整环境池都有场景、有效镜头、确定性更新和资源释放', () => {
    for (const environment of CAR_ENVIRONMENTS) {
      const factory = CLAY_ENVIRONMENT_FACTORIES[environment.id as ClayEnvironmentId];
      expect(factory, environment.id).toBeTypeOf('function');
      const kit = new ClayGeometryKit();
      const visual = factory(kit);
      expect(visual.root.children.length).toBeGreaterThan(0);
      expectFiniteTransforms(visual.root);
      expect([...visual.camera.position, ...visual.camera.target].every(Number.isFinite)).toBe(true);
      visual.update?.(0);
      visual.update?.(3_500);
      expectFiniteTransforms(visual.root);
      kit.dispose();
      kit.dispose();
    }
  });
});
