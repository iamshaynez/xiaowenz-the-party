import { z } from 'zod';

// ---------------------------------------------------------------------------
// 通用扑克牌编码：斗地主与德州扑克共享同一副 54 张牌的稳定数字契约。
// 0..51 为普通牌：suit = Math.floor(id / 13)（0♠ 1♥ 2♣ 3♦），rank = id % 13
// （0=2, 1=3, … 8=10, 9=J, 10=Q, 11=K, 12=A，A 大）；52=小王，53=大王。
// 各游戏自行解释牌力顺序（斗地主里 2 与王按民间规则最大），编码本身不预设。
// ---------------------------------------------------------------------------
export const CARD_COUNT = 54;
export const JOKER_SMALL = 52;
export const JOKER_BIG = 53;

export const cardIdSchema = z.number().int().min(0).max(53);
export const cardIdsSchema = z.array(cardIdSchema);

export const CARD_SUITS = ['♠', '♥', '♣', '♦'] as const;
export const CARD_RANK_LABELS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;

export function describeCard(cardId: number): string {
  if (cardId === JOKER_SMALL) return '小王';
  if (cardId === JOKER_BIG) return '大王';
  const suit = CARD_SUITS[Math.floor(cardId / 13)] ?? '?';
  const rank = CARD_RANK_LABELS[cardId % 13] ?? '?';
  return `${suit}${rank}`;
}

// ---------------------------------------------------------------------------
// 五子棋：轮流落子，先在横、竖、斜任一方向连成五子者胜。
// ---------------------------------------------------------------------------
export const GOMOKU_BOARD_SIZE = 15;
export const gomokuActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('place-stone'), x: z.number().int().min(0).max(GOMOKU_BOARD_SIZE - 1), y: z.number().int().min(0).max(GOMOKU_BOARD_SIZE - 1) }).strict(),
  z.object({ type: z.literal('next-board') }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);

// ---------------------------------------------------------------------------
// 飞行棋：掷骰 → 选择一架飞机行动；6 点起飞并再掷一次。
// ---------------------------------------------------------------------------
export const LUDO_PLANE_COUNT = 4;
export const ludoActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll-dice') }).strict(),
  z.object({ type: z.literal('move-plane'), plane: z.number().int().min(0).max(LUDO_PLANE_COUNT - 1) }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);

// ---------------------------------------------------------------------------
// 斗地主：叫分定地主，出牌压牌，炸弹与春天翻倍。
// ---------------------------------------------------------------------------
export const DOU_DIZHU_BID_POINTS = [1, 2, 3] as const;
export const douDizhuActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bid'), points: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
  z.object({ type: z.literal('pass') }).strict(),
  z.object({ type: z.literal('play-cards'), cards: cardIdsSchema.min(1).max(20) }).strict(),
  z.object({ type: z.literal('next-hand') }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);

// ---------------------------------------------------------------------------
// 德州扑克（无限注）：bet/raise-to 的 amount 均为本街投入总额（国际惯例）。
// ---------------------------------------------------------------------------
export const texasHoldemActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('fold') }).strict(),
  z.object({ type: z.literal('check') }).strict(),
  z.object({ type: z.literal('call') }).strict(),
  z.object({ type: z.literal('bet'), amount: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('raise-to'), amount: z.number().int().min(1) }).strict(),
  z.object({ type: z.literal('next-hand') }).strict(),
  z.object({ type: z.literal('play-again') }).strict(),
]);
