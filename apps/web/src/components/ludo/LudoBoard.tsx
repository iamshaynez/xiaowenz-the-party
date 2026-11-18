import type { LudoView } from '@party/games';
import {
  LUDO_BOARD,
  cellStyle,
  flyCross,
  flyLane,
  hangarSlot,
  homeCell,
  planeAt,
  planeHeading,
  ringCell,
  seatCorner,
  stackOffset,
} from './boardGeometry';

// ---------------------------------------------------------------------------
// 飞行棋 2D SVG 棋盘：经典布局复刻——52 格方环、四角机场（圆角色块 +
// 2×2 停机位）、直线跑道、中央大本营、虚线飞行航线与交叉撞机点。
// 纯受控组件：所有元素随视图快照整帧重绘，无内部动画状态。
// ---------------------------------------------------------------------------

export const LUDO_SEAT_COLORS = ['#e0524a', '#e8b33c', '#4f7bd9', '#58a95c'] as const;
const PLAIN_CELL = '#f4ecd8';
const ACCENT = '#ffd76e';
const INK = '#3a2c1c';

export interface LudoPlayerInfo {
  id: string;
  nickname: string;
  avatar: string;
}

interface LudoBoardProps {
  game: LudoView;
  players: LudoPlayerInfo[];
  playerId: string;
  onMovePlane: (globalId: number) => void;
}

/** 纸飞机剪影（机头朝上，中心在原点），配深色描边与座舱高光。 */
const PLANE_PATH = 'M0,-0.44 C0.06,-0.3 0.1,-0.2 0.1,-0.06 L0.42,0.18 L0.42,0.3 L0.1,0.2 L0.1,0.34 L0.22,0.46 L0.22,0.55 L0,0.48 L-0.22,0.55 L-0.22,0.46 L-0.1,0.34 L-0.1,0.2 L-0.42,0.3 L-0.42,0.18 L-0.1,-0.06 C-0.1,-0.2 -0.06,-0.3 0,-0.44 Z';

/** 五角星（飞行格标记），中心原点、外径 0.34。 */
const STAR_PATH = 'M0,-0.34 L0.08,-0.11 L0.32,-0.11 L0.13,0.03 L0.2,0.26 L0,0.12 L-0.2,0.26 L-0.13,0.03 L-0.32,-0.11 L-0.08,-0.11 Z';

function Hangar({ seat, isTurn, label }: { seat: number; isTurn: boolean; label: string }) {
  const corner = seatCorner(seat);
  const center = { x: corner.x * LUDO_BOARD.hangarCenter, z: corner.z * LUDO_BOARD.hangarCenter };
  const namePos = { x: corner.x * LUDO_BOARD.nameRing, z: corner.z * LUDO_BOARD.nameRing };
  return (
    <g data-testid={`ld-hangar-${seat}`} data-is-turn={isTurn}>
      <rect
        x={center.x - 2} y={center.z - 2} width={4} height={4} rx={0.55}
        fill="#fffbe8" stroke={isTurn ? ACCENT : '#cbbfa4'} strokeWidth={isTurn ? 0.14 : 0.05}
      />
      <rect x={center.x - 1.88} y={center.z - 1.88} width={3.76} height={3.76} rx={0.45} fill={LUDO_SEAT_COLORS[seat]} opacity={0.92} />
      {[0, 1, 2, 3].map((index) => {
        const slot = hangarSlot(seat, index);
        return <circle key={index} cx={slot.x} cy={slot.z} r={0.55} fill="none" stroke="#fffbe8" strokeWidth={0.07} />;
      })}
      {label !== '' && (
        <text
          x={namePos.x} y={namePos.z + 0.16} textAnchor="middle" fontSize={0.52} fontWeight={700}
          fill={isTurn ? ACCENT : '#e8dfc9'} stroke={INK} strokeWidth={0.06} paintOrder="stroke"
        >
          {label}
        </text>
      )}
    </g>
  );
}

export function LudoBoard({ game, players, playerId, onMovePlane }: LudoBoardProps) {
  const mySeat = game.seats.indexOf(playerId);
  const movableGlobal = game.stage === 'move' ? game.movablePlanes.map((index) => (game.seat ?? 0) * 4 + index) : [];
  // 同格叠机错位：同一格上的飞机按出现顺序取偏移。
  const stackSlot = new Map<string, number>();
  const placed = game.planes.map((plane) => {
    const key = `${plane.seat}:${plane.p}`;
    const slot = stackSlot.get(key) ?? 0;
    stackSlot.set(key, slot + 1);
    const base = planeAt(plane.seat, plane.p, plane.index);
    const offset = stackOffset(slot);
    return {
      ...plane,
      globalId: plane.seat * 4 + plane.index,
      position: { x: base.x + offset.x, z: base.z + offset.z },
      heading: planeHeading(plane.seat, plane.p),
    };
  });

  return (
    <svg
      className="ld-board"
      viewBox={`-${LUDO_BOARD.viewHalf} -${LUDO_BOARD.viewHalf} ${LUDO_BOARD.viewHalf * 2} ${LUDO_BOARD.viewHalf * 2}`}
      role="img"
      aria-label="飞行棋棋盘"
      data-phase={game.phase}
    >
      {/* 底板与包边 */}
      <rect x={-9.1} y={-9.1} width={18.2} height={18.2} rx={0.5} fill="#f4ecd8" stroke="#cbbfa4" strokeWidth={0.06} />
      <rect x={-9.35} y={-9.35} width={18.7} height={18.7} rx={0.62} fill="none" stroke={INK} strokeWidth={0.22} />

      {/* 中央大本营：四色扇形拼盘 + 白心 */}
      {[0, 1, 2, 3].map((seat) => {
        const corner = seatCorner(seat);
        // 扇形中心对准自家角：从角方向顺时针各让 45°。
        const mid = Math.atan2(corner.z, corner.x);
        const start = mid - Math.PI / 4;
        const end = mid + Math.PI / 4;
        const p1 = { x: Math.cos(start) * 2.35, z: Math.sin(start) * 2.35 };
        const p2 = { x: Math.cos(end) * 2.35, z: Math.sin(end) * 2.35 };
        return (
          <path
            key={seat}
            d={`M0,0 L${p1.x},${p1.z} A2.35,2.35 0 0 1 ${p2.x},${p2.z} Z`}
            fill={LUDO_SEAT_COLORS[seat]}
            stroke="#fffbe8"
            strokeWidth={0.05}
          />
        );
      })}
      <circle cx={0} cy={0} r={0.9} fill="#fffbe8" stroke="#cbbfa4" strokeWidth={0.05} />

      {/* 虚线飞行航线：横穿棋盘到对面，穿过对面家跑道 */}
      {[0, 1, 2, 3].map((seat) => {
        const lane = flyLane(seat);
        return (
          <g key={seat} data-testid="ld-fly-lane">
            <line
              x1={lane.from.x} y1={lane.from.z} x2={lane.to.x} y2={lane.to.z}
              stroke={LUDO_SEAT_COLORS[seat]} strokeWidth={0.12} strokeDasharray="0.42 0.3" strokeLinecap="round" opacity={0.85}
            />
            <circle cx={lane.from.x} cy={lane.from.z} r={0.22} fill={LUDO_SEAT_COLORS[seat]} />
            <circle cx={lane.to.x} cy={lane.to.z} r={0.22} fill={LUDO_SEAT_COLORS[seat]} />
          </g>
        );
      })}

      {/* 环道 52 格：己色/起飞/飞行格染色，起飞格白圈，飞行格金星 */}
      {Array.from({ length: 52 }, (_, k) => {
        let colorSeat: number | null = null;
        let entrySeat: number | null = null;
        let flySeat: number | null = null;
        for (let seat = 0; seat < 4; seat += 1) {
          const p = (((k - seat * 13) % 52) + 52) % 52;
          const style = cellStyle(p);
          if (style.tinted) colorSeat = seat;
          if (style.entry) entrySeat = seat;
          if (style.fly) flySeat = seat;
        }
        const cell = ringCell(k);
        return (
          <g key={k} data-testid="ld-ring-cell">
            <rect
              x={cell.x - 0.44} y={cell.z - 0.44} width={0.88} height={0.88} rx={0.1}
              fill={colorSeat !== null ? LUDO_SEAT_COLORS[colorSeat] : PLAIN_CELL}
              stroke="#cbbfa4" strokeWidth={0.04}
            />
            {entrySeat !== null && <circle cx={cell.x} cy={cell.z} r={0.3} fill="none" stroke="#fffbe8" strokeWidth={0.07} />}
            {flySeat !== null && <path d={STAR_PATH} transform={`translate(${cell.x},${cell.z})`} fill={ACCENT} stroke={INK} strokeWidth={0.03} />}
          </g>
        );
      })}

      {/* 终点跑道：本方颜色直线格子 */}
      {[0, 1, 2, 3].map((seat) =>
        [0, 1, 2, 3, 4, 5].map((h) => {
          const cell = homeCell(seat, h);
          return (
            <rect
              key={`${seat}:${h}`}
              data-testid="ld-home-cell"
              x={cell.x - 0.42} y={cell.z - 0.42} width={0.84} height={0.84} rx={0.1}
              fill={LUDO_SEAT_COLORS[seat]} stroke="#cbbfa4" strokeWidth={0.04} opacity={0.95}
            />
          );
        }))}

      {/* 航线与对面家跑道的交叉点（撞机点） */}
      {[0, 1, 2, 3].map((seat) => {
        const cross = flyCross(seat);
        return (
          <circle
            key={seat}
            data-testid="ld-fly-cross"
            cx={cross.x} cy={cross.z} r={0.34} fill="none" stroke="#fffbe8" strokeWidth={0.08} strokeDasharray="0.16 0.1"
          />
        );
      })}

      {/* 四角机场与玩家名：棋盘始终画满四色，无人的座位只留空机场 */}
      {[0, 1, 2, 3].map((seat) => {
        const seatPlayerId = game.seats[seat];
        const player = seatPlayerId !== undefined ? players.find((entry) => entry.id === seatPlayerId) : undefined;
        const label = player
          ? `${player.nickname}${seatPlayerId === playerId ? '（我）' : ''}`
          : '';
        return <Hangar key={seat} seat={seat} isTurn={game.seat === seat && player !== undefined} label={label} />;
      })}

      {/* 飞机：可点击的可动机型带脉冲光圈与编号牌 */}
      {placed.map((plane) => {
        const owner = players.find((entry) => entry.id === game.seats[plane.seat]);
        const movable = movableGlobal.includes(plane.globalId);
        const name = `${owner?.nickname ?? '已离座'} ${plane.index + 1} 号机`;
        return (
          <g
            key={plane.globalId}
            data-testid="ld-plane"
            transform={`translate(${plane.position.x},${plane.position.z})`}
            role="button"
            tabIndex={movable ? 0 : -1}
            aria-label={name}
            aria-disabled={!movable}
            className={movable ? 'ld-plane is-movable' : 'ld-plane'}
            onClick={movable ? () => onMovePlane(plane.globalId) : undefined}
            onKeyDown={movable ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onMovePlane(plane.globalId);
              }
            } : undefined}
          >
            {movable && <circle className="ld-plane-halo" r={0.55} fill="none" stroke={ACCENT} strokeWidth={0.1} />}
            <g transform={`rotate(${plane.heading})`}>
              <path d={PLANE_PATH} fill={LUDO_SEAT_COLORS[plane.seat]} stroke={INK} strokeWidth={0.05} strokeLinejoin="round" />
            </g>
            <g transform={`rotate(${-plane.heading})`}>
              <circle data-testid="ld-plane-badge" r={0.27} fill="#fffbe8" stroke={INK} strokeWidth={0.06} />
              <text textAnchor="middle" y={0.12} fontSize={0.36} fontWeight={800} fill={INK}>{plane.index + 1}</text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
