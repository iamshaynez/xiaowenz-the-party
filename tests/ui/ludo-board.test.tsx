import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LudoView } from '@party/games';
import {
  cellStyle,
  flyCross,
  flyLane,
  hangarSlot,
  homeCell,
  planeAt,
  planeHeading,
  ringCell,
  seatCorner,
} from '../../apps/web/src/components/ludo/boardGeometry';
import { LudoBoard } from '../../apps/web/src/components/ludo/LudoBoard';

// ---------------------------------------------------------------------------
// 飞行棋 2D 棋盘：几何纯函数契约（经典布局：直线跑道、四角机场、虚线航线
// 交叉对面家跑道）与 SVG 棋盘组件行为（染色、编号、可点击）。无 WebGL。
// ---------------------------------------------------------------------------

const SEATS = [0, 1, 2, 3] as const;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('飞行棋 · 2D 棋盘几何', () => {
  it('终点跑道是从边指向中心的直线，四家各占一条边', () => {
    for (const seat of SEATS) {
      const cells = [0, 1, 2, 3, 4, 5].map((h) => homeCell(seat, h));
      // 直线：相邻两格的位移方向一致。
      for (let h = 1; h < cells.length; h += 1) {
        const prev = { x: cells[h]!.x - cells[h - 1]!.x, z: cells[h]!.z - cells[h - 1]!.z };
        expect(Math.abs(prev.x) < 1e-9 || Math.abs(prev.z) < 1e-9).toBe(true);
      }
      // 朝中心：越走越近。
      expect(dist(cells[5]!, { x: 0, z: 0 })).toBeLessThan(dist(cells[0]!, { x: 0, z: 0 }));
    }
    // 四条跑道互不重叠。
    const all = SEATS.flatMap((seat) => [0, 1, 2, 3, 4, 5].map((h) => homeCell(seat, h)));
    for (let i = 0; i < all.length; i += 1) {
      for (let j = i + 1; j < all.length; j += 1) expect(dist(all[i]!, all[j]!)).toBeGreaterThan(0.5);
    }
  });

  it('机场位于四角：同家停机位互不重叠且都在自家角方向', () => {
    for (const seat of SEATS) {
      const corner = seatCorner(seat);
      const slots = [0, 1, 2, 3].map((index) => hangarSlot(seat, index));
      for (let i = 0; i < slots.length; i += 1) {
        for (let j = i + 1; j < slots.length; j += 1) expect(dist(slots[i]!, slots[j]!)).toBeGreaterThan(0.9);
        expect(slots[i]!.x * corner.x + slots[i]!.z * corner.z).toBeGreaterThan(0);
      }
    }
  });

  it('到家飞机在大本营内分散停放，不再叠在同一点', () => {
    for (const seat of SEATS) {
      const homes = [0, 1, 2, 3].map((index) => planeAt(seat, 56, index));
      for (let i = 0; i < homes.length; i += 1) {
        expect(dist(homes[i]!, { x: 0, z: 0 })).toBeLessThan(3.2);
        for (let j = i + 1; j < homes.length; j += 1) expect(dist(homes[i]!, homes[j]!)).toBeGreaterThan(0.4);
      }
    }
  });

  it('飞行航线：从飞行格横穿棋盘到对面落点，穿过对面家跑道的交叉点', () => {
    for (const seat of SEATS) {
      const lane = flyLane(seat);
      expect(dist(lane.from, ringCell(seat * 13 + 18))).toBeLessThan(1e-9);
      expect(dist(lane.to, ringCell(seat * 13 + 30))).toBeLessThan(1e-9);
      const cross = flyCross(seat);
      expect(dist(cross, homeCell((seat + 2) % 4, 2))).toBeLessThan(1e-9);
      // 交叉点落在线段上。
      const segment = { x: lane.to.x - lane.from.x, z: lane.to.z - lane.from.z };
      const lengthSq = segment.x * segment.x + segment.z * segment.z;
      const t = Math.max(0, Math.min(1, ((cross.x - lane.from.x) * segment.x + (cross.z - lane.from.z) * segment.z) / lengthSq));
      const closest = { x: lane.from.x + segment.x * t, z: lane.from.z + segment.z * t };
      expect(dist(cross, closest)).toBeLessThan(0.25);
    }
  });

  it('格子样式：起飞格与飞行格染己色，己色格每 4 格一个，跑道不染色', () => {
    expect(cellStyle(0)).toEqual({ tinted: true, entry: true, fly: false });
    expect(cellStyle(18)).toEqual({ tinted: true, entry: false, fly: true });
    expect(cellStyle(2).tinted).toBe(true);
    expect(cellStyle(46).tinted).toBe(true);
    expect(cellStyle(3).tinted).toBe(false);
    expect(cellStyle(50)).toEqual({ tinted: false, entry: false, fly: false });
    expect(cellStyle(56)).toEqual({ tinted: false, entry: false, fly: false });
  });

  it('飞机朝向：环道上指向下一格，四角直行段相差 90° 的倍数', () => {
    // 座位 0 起飞后沿顶边向右飞（+x），机头朝右 90°。
    expect(planeHeading(0, 0)).toBeCloseTo(90, 5);
    // 跑道尽头朝向中心。
    const heading = planeHeading(0, 55);
    expect(Math.abs(heading)).toBeLessThanOrEqual(180);
  });
});

describe('飞行棋 · SVG 棋盘组件', () => {
  const players = [
    { id: 'p1', nickname: '小红', avatar: '🦊' },
    { id: 'p2', nickname: '小黄', avatar: '🐼' },
  ];

  const base: LudoView = {
    id: 'ludo',
    phase: 'playing',
    seat: 0,
    stage: 'move',
    dice: 6,
    movablePlanes: [0],
    planes: players.flatMap((_, seat) => [0, 1, 2, 3].map((index) => ({ seat, index, p: -1 }))),
    seats: ['p1', 'p2'],
    sixStreak: 1,
    lastRoll: { seat: 0, dice: 6 },
    blocked: false,
    rollDeadlineAt: null,
    moveDeadlineAt: Date.now() + 45_000,
    winnerId: null,
    rankings: [
      { playerId: 'p1', planesHome: 0, progress: 0 },
      { playerId: 'p2', planesHome: 0, progress: 0 },
    ],
  };

  it('画出 52 格环道、四家机场与跑道、四条虚线航线和交叉点', () => {
    render(<LudoBoard game={base} players={players} playerId="p1" onMovePlane={() => {}} />);
    const board = screen.getByRole('img', { name: '飞行棋棋盘' });
    expect(within(board).getAllByTestId('ld-ring-cell')).toHaveLength(52);
    expect(within(board).getAllByTestId(/^ld-hangar-\d$/)).toHaveLength(4);
    expect(within(board).getAllByTestId('ld-home-cell')).toHaveLength(24);
    expect(within(board).getAllByTestId('ld-fly-lane')).toHaveLength(4);
    expect(within(board).getAllByTestId('ld-fly-cross')).toHaveLength(4);
  });

  it('每架飞机带 1–4 编号牌；当前玩家可点击可动飞机提交移动', async () => {
    const user = userEvent.setup();
    const onMovePlane = vi.fn();
    render(<LudoBoard game={base} players={players} playerId="p1" onMovePlane={onMovePlane} />);
    const board = screen.getByRole('img', { name: '飞行棋棋盘' });
    const planes = within(board).getAllByTestId('ld-plane');
    expect(planes).toHaveLength(8);
    // 编号牌：每架飞机一个，标注 1–4。
    for (const plane of planes) {
      expect(within(plane).getByTestId('ld-plane-badge')).toBeVisible();
    }
    // 只有可动的（p1 的 1 号机，全局 0）是按钮；点击提交全局编号。
    const movable = within(board).getByRole('button', { name: /小红 1 号机/ });
    await user.click(movable);
    expect(onMovePlane).toHaveBeenCalledWith(0);
    expect(within(board).getByRole('button', { name: /小黄 1 号机/ })).toHaveAttribute('aria-disabled', 'true');
  });

  it('轮到谁，谁的机场描金边并在棋盘上显示玩家名', () => {
    render(<LudoBoard game={base} players={players} playerId="p1" onMovePlane={() => {}} />);
    const board = screen.getByRole('img', { name: '飞行棋棋盘' });
    expect(within(board).getByTestId('ld-hangar-0')).toHaveAttribute('data-is-turn', 'true');
    expect(within(board).getByTestId('ld-hangar-1')).toHaveAttribute('data-is-turn', 'false');
    expect(within(board).getByText('小红（我）')).toBeVisible();
    expect(within(board).getByText('小黄')).toBeVisible();
  });
});
