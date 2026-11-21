// ---------------------------------------------------------------------------
// 德州扑克 2D 俯视桌几何：椭圆毡布、座位环、下注/庄位锚点与公共牌槽位。
// 纯函数、无渲染依赖，供 TexasHoldemBoard 与契约测试共用。
// SVG 坐标系 y 向下：π/2 角度指向桌面正下方（自己）。
// 桌面有两种布局预设：横屏（宽椭圆）与竖屏（同一椭圆旋转 90°，viewBox
// 随之互换），移动端优先——竖屏手机上牌桌纵向撑满而不是缩成一条。
// ---------------------------------------------------------------------------

export interface TableLayout {
  viewHalfX: number;
  viewHalfY: number;
  rimRx: number;
  rimRy: number;
  feltRx: number;
  feltRy: number;
  inlayRx: number;
  inlayRy: number;
  seatRx: number;
  seatRy: number;
  betRx: number;
  betRy: number;
  potY: number;
  ownCardsX: number;
  ownCardsY: number;
  communityY: number;
}

/** 与布局无关的公共牌/座位元素尺寸。 */
export const TH_TABLE = {
  avatarR: 26,
  cardW: 62,
  cardH: 88,
  cardGap: 10,
  /** 大牌相对公共牌的放大倍数。 */
  ownCardScale: 1.2,
  /** 座位内侧小牌 / 庄位按钮相对椭圆点的偏移。 */
  cardsInward: 58,
  dealerPerpOffset: 70,
} as const;

const LANDSCAPE: TableLayout = {
  viewHalfX: 540,
  viewHalfY: 340,
  rimRx: 404,
  rimRy: 234,
  feltRx: 380,
  feltRy: 212,
  inlayRx: 330,
  inlayRy: 178,
  seatRx: 420,
  seatRy: 262,
  betRx: 258,
  betRy: 158,
  potY: -110,
  ownCardsX: 0,
  ownCardsY: 80,
  communityY: -30,
};

const PORTRAIT: TableLayout = {
  viewHalfX: 340,
  viewHalfY: 540,
  rimRx: 250,
  rimRy: 404,
  feltRx: 230,
  feltRy: 380,
  inlayRx: 178,
  inlayRy: 330,
  seatRx: 250,
  seatRy: 440,
  betRx: 150,
  betRy: 260,
  potY: -160,
  ownCardsX: 0,
  ownCardsY: 180,
  communityY: 0,
};

/** 按屏幕方向取布局预设；桌面椭圆旋转 90°，锚点公式共用。 */
export function tableLayout(portrait: boolean): TableLayout {
  return portrait ? PORTRAIT : LANDSCAPE;
}

export interface Anchor {
  x: number;
  y: number;
}

const SELF_ANGLE = Math.PI / 2;

/** 座位的极角：自己（selfSeat）恒为正下方，其余按座位序逆时针（俯视）均匀排开。 */
export function seatAngle(seat: number, selfSeat: number, count: number): number {
  return SELF_ANGLE + ((seat - selfSeat) / count) * Math.PI * 2;
}

/** 座位锚点：头像圆心所在的座位椭圆。 */
export function seatAnchor(layout: TableLayout, seat: number, selfSeat: number, count: number): Anchor {
  const angle = seatAngle(seat, selfSeat, count);
  return { x: Math.cos(angle) * layout.seatRx, y: Math.sin(angle) * layout.seatRy };
}

/** 座位向外（远离桌心）的单位方向。 */
export function seatOutward(seat: number, selfSeat: number, count: number): Anchor {
  const angle = seatAngle(seat, selfSeat, count);
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

/** 本街注锚点：座位朝桌心方向压到下注椭圆上。 */
export function betAnchor(layout: TableLayout, seat: number, selfSeat: number, count: number): Anchor {
  const angle = seatAngle(seat, selfSeat, count);
  return { x: Math.cos(angle) * layout.betRx, y: Math.sin(angle) * layout.betRy };
}

/** 庄家按钮锚点：沿下注椭圆的切向让开，避免与本街注重叠。 */
export function dealerAnchor(layout: TableLayout, seat: number, selfSeat: number, count: number): Anchor {
  const angle = seatAngle(seat, selfSeat, count);
  const bet = betAnchor(layout, seat, selfSeat, count);
  const perpX = -Math.sin(angle);
  const perpY = Math.cos(angle);
  return { x: bet.x + perpX * TH_TABLE.dealerPerpOffset, y: bet.y + perpY * TH_TABLE.dealerPerpOffset };
}

/** 座位内侧小牌的中心（庄家自己的两张大牌另有固定锚点）。 */
export function seatCardsAnchor(layout: TableLayout, seat: number, selfSeat: number, count: number): Anchor {
  const outward = seatOutward(seat, selfSeat, count);
  const seatPoint = seatAnchor(layout, seat, selfSeat, count);
  return { x: seatPoint.x - outward.x * TH_TABLE.cardsInward, y: seatPoint.y - outward.y * TH_TABLE.cardsInward };
}

/** 公共牌槽位：总数固定 5 槽，围绕桌心水平居中对称。 */
export function communitySlot(index: number, total: number, layout: TableLayout): Anchor {
  const step = TH_TABLE.cardW + TH_TABLE.cardGap;
  return { x: (index - (total - 1) / 2) * step, y: layout.communityY };
}

/** 自己两张大牌的中心（自己恒在正下方，故为固定点）。 */
export function ownCardsAnchor(layout: TableLayout): Anchor {
  return { x: layout.ownCardsX, y: layout.ownCardsY };
}

/** 两张并排牌中第 index 张的中心。 */
export function pairCardAnchor(center: Anchor, index: number, scale = 1): Anchor {
  const step = (TH_TABLE.cardW + TH_TABLE.cardGap) * scale;
  return { x: center.x + (index === 0 ? -step / 2 : step / 2), y: center.y };
}
