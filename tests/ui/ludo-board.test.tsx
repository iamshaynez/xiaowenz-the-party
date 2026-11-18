import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  createPlaneMesh,
  flyCrossWorld,
  flyLaneWorld,
  hangarSlotWorld,
  homeCellWorld,
  ludoCellStyle,
  planeWorld,
  ringCellWorld,
  seatCorner,
} from '../../apps/web/src/components/ludo/LudoScene';
import { createDiceMesh, faceDiceUp } from '../../apps/web/src/components/tabletop/props';

// ---------------------------------------------------------------------------
// 飞行棋棋盘几何与道具的纯函数契约：标准布局（直线跑道、四角机场、分散到家）
// 与骰子落定姿态（一面平躺朝上且点数正确）。不依赖 WebGL 渲染。
// ---------------------------------------------------------------------------

const SEATS = [0, 1, 2, 3] as const;

describe('飞行棋 · 标准棋盘几何', () => {
  it('终点跑道是从边指向中心的直线，四家各占一条边', () => {
    for (const seat of SEATS) {
      const cells = [0, 1, 2, 3, 4, 5].map((h) => homeCellWorld(seat, h));
      // 直线：六个格心共线（任意相邻两格方向一致）。
      const first = cells[1]!.clone().sub(cells[0]!);
      for (let h = 1; h < cells.length; h += 1) {
        const step = cells[h]!.clone().sub(cells[h - 1]!);
        expect(step.angleTo(first)).toBeLessThan(1e-6);
      }
      // 朝中心：越走越近。
      expect(cells[5]!.length()).toBeLessThan(cells[0]!.length());
      // 各占一边：跑道轴线沿 x 或 z 方向。
      const axisAligned = Math.abs(first.x) < 1e-6 || Math.abs(first.z) < 1e-6;
      expect(axisAligned).toBe(true);
    }
    // 四条跑道互不重叠。
    const all = SEATS.flatMap((seat) => [0, 1, 2, 3, 4, 5].map((h) => homeCellWorld(seat, h)));
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) {
        expect(all[i]!.distanceTo(all[j]!)).toBeGreaterThan(0.5);
      }
    }
  });

  it('机场位于四角：同家停机位互不重叠且都在自家角方向', () => {
    for (const seat of SEATS) {
      const corner = seatCorner(seat);
      const slots = [0, 1, 2, 3].map((index) => hangarSlotWorld(seat, index));
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) {
          expect(slots[i]!.distanceTo(slots[j]!)).toBeGreaterThan(0.9);
        }
        expect(slots[i]!.dot(corner)).toBeGreaterThan(0);
      }
    }
  });

  it('到家飞机在大本营内分散停放，不再叠在同一点', () => {
    for (const seat of SEATS) {
      const homes = [0, 1, 2, 3].map((index) => planeWorld(seat, 56, index));
      for (let i = 0; i < homes.length; i += 1) {
        expect(homes[i]!.length()).toBeLessThan(3.2);
        for (let j = i + 1; j < homes.length; j += 1) {
          expect(homes[i]!.distanceTo(homes[j]!)).toBeGreaterThan(0.4);
        }
      }
    }
  });

  it('飞行航线：从飞行格横穿棋盘到对面落点，穿过对面家跑道的交叉点', () => {
    for (const seat of SEATS) {
      const lane = flyLaneWorld(seat);
      // 航线两端是飞行格（p=18）与飞行落点（p=30）。
      expect(lane.from.distanceTo(ringCellWorld(seat * 13 + 18))).toBeLessThan(1e-6);
      expect(lane.to.distanceTo(ringCellWorld(seat * 13 + 30))).toBeLessThan(1e-6);
      // 交叉点在对面家（座位 +2）终点跑道的第 3 格上。
      const cross = flyCrossWorld(seat);
      expect(cross.distanceTo(homeCellWorld((seat + 2) % 4, 2))).toBeLessThan(1e-6);
      // 交叉点确实落在航线线段上（点到线段距离足够小），航线真正穿过跑道。
      const segment = lane.to.clone().sub(lane.from);
      const t = THREE.MathUtils.clamp(cross.clone().sub(lane.from).dot(segment) / segment.lengthSq(), 0, 1);
      const closest = lane.from.clone().add(segment.multiplyScalar(t));
      expect(cross.distanceTo(closest)).toBeLessThan(0.25);
    }
  });

  it('格子样式：起飞格与飞行格染己色，己色格每 4 格一个，跑道不染色', () => {
    expect(ludoCellStyle(0)).toEqual({ tinted: true, entry: true, fly: false });
    expect(ludoCellStyle(18)).toEqual({ tinted: true, entry: false, fly: true });
    expect(ludoCellStyle(2).tinted).toBe(true);
    expect(ludoCellStyle(6).tinted).toBe(true);
    expect(ludoCellStyle(46).tinted).toBe(true);
    expect(ludoCellStyle(3).tinted).toBe(false);
    expect(ludoCellStyle(50)).toEqual({ tinted: false, entry: false, fly: false });
    expect(ludoCellStyle(56)).toEqual({ tinted: false, entry: false, fly: false });
  });
});

describe('飞行棋 · 骰子与飞机道具', () => {
  // BoxGeometry 材质顺序 +x,-x,+y,-y,+z,-z 对应的面法线。
  const FACE_NORMALS = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];

  it('faceDiceUp 让指定点数精确朝上，任意偏转下骰子仍平躺', () => {
    const dice = createDiceMesh(1);
    const mesh = dice.userData.dice as THREE.Mesh;
    const materials = mesh.material as THREE.MeshStandardMaterial[];
    for (let pips = 1; pips <= 6; pips += 1) {
      faceDiceUp(dice, pips, 0.4);
      mesh.updateMatrix();
      const scores = FACE_NORMALS.map((normal) => normal.clone().applyQuaternion(mesh.quaternion).y);
      const upFace = scores.indexOf(Math.max(...scores));
      expect(materials[upFace]!.userData.pips).toBe(pips);
      // 平躺：除朝上面外，其他面不朝上（第二高法线的仰角小于 12°）。
      const sorted = [...scores].sort((a, b) => b - a);
      expect(sorted[1]!).toBeLessThan(Math.cos((12 * Math.PI) / 180));
    }
  });

  it('飞机带可见编号牌，四架编号互不相同', () => {
    for (const seat of SEATS) {
      const badges: number[] = [];
      for (let index = 0; index < 4; index += 1) {
        const plane = createPlaneMesh(seat, index);
        plane.traverse((child) => {
          if (child.userData.numberBadge !== undefined) badges.push(child.userData.numberBadge as number);
        });
      }
      expect(badges).toEqual([1, 2, 3, 4]);
    }
  });
});
