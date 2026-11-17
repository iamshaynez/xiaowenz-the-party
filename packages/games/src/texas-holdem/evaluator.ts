// 德州扑克 7 张牌牌力评估：返回可直接比较的分数与类别标签。
// 牌号 0..51：suit = floor(id/13)，rank index = id % 13（0='2' … 12='A'）。

export type HoldemCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HoldemHandScore {
  category: HoldemCategory;
  tiebreak: [number, number, number, number, number];
  score: number;
}

const WHEEL_HIGH = 3; // A2345 顺子以 5 为高张（rank index：A=12, 5=3）

// 在点数掩码中找最高顺子；返回高张点数，无顺子返回 -1（含 A-2-3-4-5 轮子）。
function straightHigh(mask: number): number {
  const ranks: number[] = [];
  for (let rank = 0; rank < 13; rank += 1) if (mask & (1 << rank)) ranks.push(rank);
  if (ranks.length < 5) {
    // A 当 1 的轮子：A + 2 + 3 + 4 + 5。
    if ((mask & 0x100f) === 0x100f) return WHEEL_HIGH;
    return -1;
  }
  let run = 1;
  for (let index = 1; index < ranks.length; index += 1) {
    run = ranks[index] === ranks[index - 1]! + 1 ? run + 1 : 1;
    if (run >= 5) return ranks[index]!;
  }
  if ((mask & 0x100f) === 0x100f) return WHEEL_HIGH;
  return -1;
}

function scoreOf(category: HoldemCategory, tiebreak: number[]): HoldemHandScore {
  const padded: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  tiebreak.slice(0, 5).forEach((value, index) => { padded[index] = value; });
  const score = padded.reduce((sum, value, index) => sum + value * 15 ** (4 - index), category * 15 ** 5);
  return { category, tiebreak: padded, score };
}

export function evaluateHoldem(cards: number[]): HoldemHandScore {
  const rankMasks = [0, 0, 0, 0];
  const rankCounts = new Array<number>(13).fill(0);
  for (const card of cards) {
    const suit = Math.floor(card / 13);
    const rank = card % 13;
    rankMasks[suit]! |= 1 << rank;
    rankCounts[rank]! += 1;
  }

  const flushSuit = rankMasks.findIndex((mask) => {
    let count = 0;
    for (let rank = 0; rank < 13; rank += 1) if (mask & (1 << rank)) count += 1;
    return count >= 5;
  });
  if (flushSuit >= 0) {
    const mask = rankMasks[flushSuit]!;
    const sfHigh = straightHigh(mask);
    if (sfHigh >= 0) return scoreOf(8, [sfHigh]);
  }

  const quads = rankCounts.map((count, rank) => ({ count, rank })).filter((entry) => entry.count === 4);
  if (quads.length > 0) {
    const quadRank = Math.max(...quads.map((entry) => entry.rank));
    const kicker = rankCounts
      .map((count, rank) => ({ count, rank }))
      .filter((entry) => entry.rank !== quadRank && entry.count > 0)
      .sort((a, b) => b.rank - a.rank)[0]?.rank ?? 0;
    return scoreOf(7, [quadRank, kicker]);
  }

  const trios = rankCounts.map((count, rank) => ({ count, rank })).filter((entry) => entry.count >= 3).sort((a, b) => b.rank - a.rank);
  const pairs = rankCounts.map((count, rank) => ({ count, rank })).filter((entry) => entry.count >= 2).sort((a, b) => b.rank - a.rank);
  if (trios.length >= 2) return scoreOf(6, [trios[0]!.rank, trios[1]!.rank]);
  if (trios.length === 1 && pairs.filter((entry) => entry.rank !== trios[0]!.rank).length > 0) {
    const pairRank = pairs.find((entry) => entry.rank !== trios[0]!.rank)!.rank;
    return scoreOf(6, [trios[0]!.rank, pairRank]);
  }

  if (flushSuit >= 0) {
    const mask = rankMasks[flushSuit]!;
    const flushRanks: number[] = [];
    for (let rank = 12; rank >= 0 && flushRanks.length < 5; rank -= 1) if (mask & (1 << rank)) flushRanks.push(rank);
    return scoreOf(5, flushRanks);
  }

  const allMask = rankMasks.reduce((sum, mask) => sum | mask, 0);
  const sHigh = straightHigh(allMask);
  if (sHigh >= 0) return scoreOf(4, [sHigh]);

  if (trios.length === 1) {
    const kickers = rankCounts
      .map((count, rank) => ({ count, rank }))
      .filter((entry) => entry.rank !== trios[0]!.rank && entry.count > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 2)
      .map((entry) => entry.rank);
    return scoreOf(3, [trios[0]!.rank, ...kickers]);
  }

  if (pairs.length >= 2) {
    const [first, second] = pairs as [{ count: number; rank: number }, { count: number; rank: number }];
    const kicker = rankCounts
      .map((count, rank) => ({ count, rank }))
      .filter((entry) => entry.rank !== first.rank && entry.rank !== second.rank && entry.count > 0)
      .sort((a, b) => b.rank - a.rank)[0]?.rank ?? 0;
    return scoreOf(2, [first.rank, second.rank, kicker]);
  }

  if (pairs.length === 1) {
    const kickers = rankCounts
      .map((count, rank) => ({ count, rank }))
      .filter((entry) => entry.rank !== pairs[0]!.rank && entry.count > 0)
      .sort((a, b) => b.rank - a.rank)
      .slice(0, 3)
      .map((entry) => entry.rank);
    return scoreOf(1, [pairs[0]!.rank, ...kickers]);
  }

  const highCards = rankCounts
    .map((count, rank) => ({ count, rank }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 5)
    .map((entry) => entry.rank);
  return scoreOf(0, highCards);
}

export const HOLDEM_CATEGORY_LABELS = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺',
] as const;

export function describeHoldemHand(score: HoldemHandScore): string {
  return HOLDEM_CATEGORY_LABELS[score.category]!;
}

export function describeHoldemCards(cards: number[]): string {
  if (cards.length === 0) return '空';
  const score = evaluateHoldem(cards);
  return describeHoldemHand(score);
}
