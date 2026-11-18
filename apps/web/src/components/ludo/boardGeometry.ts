// ---------------------------------------------------------------------------
// 飞行棋 2D 棋盘几何：经典布局（52 格方环 + 四角机场 + 四条直线跑道 +
// 中央大本营 + 虚线飞行航线）。纯函数、无渲染依赖，供 SVG 棋盘与测试共用。
// 坐标系与俯视棋盘一致：x 向右、z 向下，SVG 直接取 {x, z} 作 (x, y)。
// ---------------------------------------------------------------------------

import { LUDO_FLY_DISTANCE, LUDO_FLY_FROM, LUDO_HOME_STEPS, LUDO_RING_SIZE } from '@party/games';

export interface BoardPoint {
  x: number;
  z: number;
}

export const LUDO_BOARD = {
  ringHalf: 6.5,
  hangarCenter: 8.0,
  /** 玩家名条（机场外角）中心距。 */
  nameRing: 11.5,
  /** 棋盘可视范围（含机场与玩家名条）的半宽。 */
  viewHalf: 12.05,
} as const;

/** 环道格 k(0..51) → 棋盘坐标（顺时针方形环，每边 13 格）。 */
export function ringCell(k: number): BoardPoint {
  const index = ((k % LUDO_RING_SIZE) + LUDO_RING_SIZE) % LUDO_RING_SIZE;
  const side = Math.floor(index / 13);
  const t = index % 13;
  if (side === 0) return { x: -6.5 + t, z: -6.5 };
  if (side === 1) return { x: 6.5, z: -6.5 + t };
  if (side === 2) return { x: 6.5 - t, z: 6.5 };
  return { x: -6.5, z: 6.5 - t };
}

/** 座位 i 的入口 corner（环道 i*13 处）方向单位向量。 */
export function seatCorner(seat: number): BoardPoint {
  const entry = ringCell(seat * 13);
  const length = Math.hypot(entry.x, entry.z);
  return { x: entry.x / length, z: entry.z / length };
}

/** 座位 i 的跑道入口：环道上离家门两格处（p=50 对应的格子）。 */
function laneEntry(seat: number): BoardPoint {
  return ringCell(seat * 13 + 50);
}

/** 终点跑道第 h 格（h=0..5）：从本方入口贴边垂直指向中心的直线。 */
export function homeCell(seat: number, h: number): BoardPoint {
  const entry = laneEntry(seat);
  // 入口贴着某条边：沿指向中心的轴向逐格推进，跑道永远垂直于该边。
  if (Math.abs(entry.x) > Math.abs(entry.z)) {
    const step = -Math.sign(entry.x);
    return { x: entry.x + step * (h + 1), z: entry.z };
  }
  const step = -Math.sign(entry.z);
  return { x: entry.x, z: entry.z + step * (h + 1) };
}

/** 停机坪位（seat 机场 2×2 之一）。 */
export function hangarSlot(seat: number, index: number): BoardPoint {
  const corner = seatCorner(seat);
  const center = { x: corner.x * 8.0, z: corner.z * 8.0 };
  const dx = (index % 2 - 0.5) * 1.7;
  const dz = (Math.floor(index / 2) - 0.5) * 1.7;
  const sideways = { x: -corner.z, z: corner.x };
  return {
    x: center.x + sideways.x * dx + corner.x * dz,
    z: center.z + sideways.z * dx + corner.z * dz,
  };
}

/** 飞机所在棋盘坐标：停机坪 / 环道 / 终点跑道 / 大本营（到家按编号分散）。 */
export function planeAt(seat: number, p: number, index: number): BoardPoint {
  if (p < 0) return hangarSlot(seat, index);
  if (p >= LUDO_HOME_STEPS) {
    // 到家：停进中央大本营本方扇区，四架按编号排开。
    const corner = seatCorner(seat);
    const sideways = { x: -corner.z, z: corner.x };
    const offset = (index - 1.5) * 0.62;
    return { x: corner.x * 1.15 + sideways.x * offset, z: corner.z * 1.15 + sideways.z * offset };
  }
  if (p >= 50) return homeCell(seat, p - 50);
  return ringCell(seat * 13 + p);
}

export interface CellStyle {
  /** 染本方颜色（己色格、起飞格、飞行格）。 */
  tinted: boolean;
  /** 起飞格（p=0）：额外描白圈。 */
  entry: boolean;
  /** 飞行格（p=18）：额外标金星。 */
  fly: boolean;
}

/** 相对座位 p 的格子样式：己色格 p%4==2，起飞格与飞行格一并染色。 */
export function cellStyle(p: number): CellStyle {
  if (p < 0 || p > 49) return { tinted: false, entry: false, fly: false };
  const entry = p === 0;
  const fly = p === LUDO_FLY_FROM;
  return { tinted: entry || fly || p % 4 === 2, entry, fly };
}

/** 座位 s 的虚线飞行航线：从飞行格（p=18）横穿棋盘到落点（p=30）。 */
export function flyLane(seat: number): { from: BoardPoint; to: BoardPoint } {
  return {
    from: ringCell(seat * 13 + LUDO_FLY_FROM),
    to: ringCell(seat * 13 + LUDO_FLY_FROM + LUDO_FLY_DISTANCE),
  };
}

/** 航线与对面家终点跑道的交叉点（对面跑道第 3 格）。 */
export function flyCross(seat: number): BoardPoint {
  return homeCell((seat + 2) % 4, 2);
}

/**
 * 飞机朝向（度）：机头指向行进方向。环道上取下一格方向；跑道与到家指向
 * 中心；停机坪朝自家起飞格方向。飞机 SVG 轮廓默认机头朝上（-z）。
 */
export function planeHeading(seat: number, p: number): number {
  if (p >= 0 && p <= 49) {
    const from = ringCell(seat * 13 + p);
    const to = ringCell(seat * 13 + p + 1);
    return (Math.atan2(to.x - from.x, -(to.z - from.z)) * 180) / Math.PI;
  }
  const position = planeAt(seat, p, 0);
  if (p < 0) {
    // 停机坪机头朝棋盘中心的转轴上（朝自家入口角内侧）。
    const corner = seatCorner(seat);
    return (Math.atan2(-corner.x, corner.z) * 180) / Math.PI;
  }
  return (Math.atan2(-position.x, position.z) * 180) / Math.PI;
}

/** 同格多架飞机的错位排列：按序取偏移避免完全重叠。 */
export function stackOffset(slot: number): BoardPoint {
  const offsets: BoardPoint[] = [
    { x: 0, z: 0 },
    { x: 0.24, z: 0.12 },
    { x: -0.24, z: 0.12 },
    { x: 0, z: 0.26 },
  ];
  return offsets[Math.min(slot, offsets.length - 1)]!;
}
