import { JOKER_BIG, JOKER_SMALL } from '@party/protocol';

// 斗地主牌力：3 < 4 < … < K < A < 2 < 小王 < 大王（0..14）。
export function douDizhuStrength(cardId: number): number {
  if (cardId === JOKER_BIG) return 14;
  if (cardId === JOKER_SMALL) return 13;
  const rank = cardId % 13; // 0='2'，1='3'，…，12='A'
  return rank === 0 ? 12 : rank - 1;
}

// 顺子 / 连对 / 飞机链最大只能到 A（strength 11），2 与王不入链。
const MAX_CHAIN_STRENGTH = 11;

export const DOU_DIZHU_COMBO_TYPES = [
  'rocket', 'bomb',
  'single', 'pair', 'trio', 'trio-single', 'trio-pair',
  'straight', 'pair-straight', 'plane', 'plane-single', 'plane-pair',
  'four-two', 'four-two-pair',
] as const;
export type DouDizhuComboType = (typeof DOU_DIZHU_COMBO_TYPES)[number];

export interface DouDizhuCombo {
  type: DouDizhuComboType;
  cards: number[];
  rank: number; // 主牌牌力（顺子/连对/飞机取最高主牌）
  chain: number; // 连体长度：顺子张数、连对/飞机组数，其余为 1
}

export function sortDouDizhuCards(cards: number[]): number[] {
  return [...cards].sort((a, b) => douDizhuStrength(a) - douDizhuStrength(b) || a - b);
}

interface StrengthProfile {
  counts: Map<number, number>;
  strengths: number[];
}

function profile(cards: number[]): StrengthProfile {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const strength = douDizhuStrength(card);
    counts.set(strength, (counts.get(strength) ?? 0) + 1);
  }
  return { counts, strengths: [...counts.keys()].sort((a, b) => a - b) };
}

// 在 counts 中找一段连续且计数 ≥3 的主体链（不超过 A）。
function trioChain({ counts, strengths }: StrengthProfile): number[] {
  const best: number[] = [];
  let run: number[] = [];
  for (const strength of strengths) {
    if ((counts.get(strength) ?? 0) >= 3 && strength <= MAX_CHAIN_STRENGTH) {
      run.push(strength);
    } else {
      if (run.length > best.length) best.splice(0, best.length, ...run);
      run = [];
    }
  }
  if (run.length > best.length) best.splice(0, best.length, ...run);
  return best;
}

function isConsecutive(strengths: number[]): boolean {
  return strengths.every((strength, index) => index === 0 || strength === strengths[index - 1]! + 1);
}

function combo(type: DouDizhuComboType, cards: number[], rank: number, chain = 1): DouDizhuCombo {
  return { type, cards: sortDouDizhuCards(cards), rank, chain };
}

// 识别一手牌的牌型；非法组合返回 null。规则按大众打法：
// 顺子 ≥5 张、连对 ≥3 对、飞机 ≥2 组三张（可带同数量的单张或对子）。
export function parseDouDizhuCombo(cards: number[]): DouDizhuCombo | null {
  const n = cards.length;
  if (n < 1 || n > 20) return null;
  const { counts, strengths } = profile(cards);
  const distinct = strengths.length;

  if (n === 1) return combo('single', cards, strengths[0]!);
  if (n === 2) {
    if (counts.get(13) === 1 && counts.get(14) === 1) return combo('rocket', cards, 99);
    if (distinct === 1) return combo('pair', cards, strengths[0]!);
    return null;
  }
  if (n === 3 && distinct === 1) return combo('trio', cards, strengths[0]!);
  if (n === 4 && distinct === 1) return combo('bomb', cards, strengths[0]!);
  if (n === 4) {
    const trioStrength = strengths.find((strength) => counts.get(strength) === 3);
    if (trioStrength !== undefined) return combo('trio-single', cards, trioStrength);
    return null;
  }
  if (n === 5) {
    const trioStrength = strengths.find((strength) => counts.get(strength) === 3);
    const pairStrength = strengths.find((strength) => counts.get(strength) === 2);
    if (trioStrength !== undefined && pairStrength !== undefined) return combo('trio-pair', cards, trioStrength);
  }
  // 顺子：全部单张、连续、不越 A。
  if (n >= 5 && distinct === n && isConsecutive(strengths) && strengths[strengths.length - 1]! <= MAX_CHAIN_STRENGTH) {
    return combo('straight', cards, strengths[strengths.length - 1]!, n);
  }
  // 连对：全部成对、≥3 连对、不越 A。
  if (n >= 6 && n % 2 === 0 && distinct === n / 2 && distinct >= 3
    && strengths.every((strength) => counts.get(strength) === 2)
    && isConsecutive(strengths) && strengths[strengths.length - 1]! <= MAX_CHAIN_STRENGTH) {
    return combo('pair-straight', cards, strengths[strengths.length - 1]!, distinct);
  }
  // 飞机家族：主体连续三张链。
  const chain = trioChain({ counts, strengths });
  if (chain.length >= 2) {
    const t = chain.length;
    if (n === 3 * t && distinct === t) return combo('plane', cards, chain[t - 1]!, t);
    if (n === 4 * t) {
      const wings = n - 3 * t;
      if (wings === t) return combo('plane-single', cards, chain[t - 1]!, t);
    }
    if (n === 5 * t) {
      const wingCounts = new Map<number, number>();
      for (const [strength, count] of counts) {
        const used = chain.includes(strength) ? 3 : 0;
        const rest = count - used;
        if (rest > 0) wingCounts.set(strength, rest);
      }
      const wingTotal = [...wingCounts.values()].reduce((sum, count) => sum + count, 0);
      if (wingTotal === 2 * t && [...wingCounts.values()].every((count) => count % 2 === 0)) {
        return combo('plane-pair', cards, chain[t - 1]!, t);
      }
    }
  }
  // 四带二：一张四张 + 任意两张。
  if (n === 6) {
    const quadStrength = strengths.find((strength) => counts.get(strength) === 4);
    if (quadStrength !== undefined) return combo('four-two', cards, quadStrength);
  }
  // 四带两对：一张四张 + 恰好两对。
  if (n === 8) {
    const quadStrength = strengths.find((strength) => counts.get(strength) === 4);
    const pairs = strengths.filter((strength) => counts.get(strength) === 2);
    if (quadStrength !== undefined && pairs.length === 2) return combo('four-two-pair', cards, quadStrength);
  }
  return null;
}

// attacker 能否压过 defender：王炸压一切，炸弹压普通牌，同型同长比主牌。
export function douDizhuBeats(attacker: DouDizhuCombo, defender: DouDizhuCombo): boolean {
  if (attacker.type === 'rocket') return true;
  if (defender.type === 'rocket') return false;
  if (attacker.type === 'bomb') {
    if (defender.type === 'bomb') return attacker.rank > defender.rank;
    return true;
  }
  if (defender.type === 'bomb') return false;
  return attacker.type === defender.type && attacker.chain === defender.chain && attacker.rank > defender.rank;
}
