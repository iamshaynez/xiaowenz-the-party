import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameContext, GameDefinition } from '@party/game-core';
import { CARD_COUNT } from '@party/protocol';
import { douDizhuBeats, douDizhuStrength, parseDouDizhuCombo, sortDouDizhuCards } from './dou-dizhu/combo';
import type { DouDizhuCombo } from './dou-dizhu/combo';

export const DOU_DIZHU_BID_TIMEOUT_MS = 45_000;
export const DOU_DIZHU_PLAY_TIMEOUT_MS = 60_000;
export const DOU_DIZHU_HAND_RESULT_MS = 10_000;
export const DOU_DIZHU_ROUNDS = [1, 3, 5] as const;
// 连续两轮流局后，首叫玩家按 1 分强制当地主，保证对局必然开始。
const MAX_REDEALS = 2;

export interface DouDizhuHandResult {
  winnerId: string;
  landlordId: string;
  landlordWins: boolean;
  bid: number;
  bombs: number;
  spring: 'none' | 'spring' | 'anti-spring';
  multiplier: number;
  deltas: Record<string, number>;
}

export interface DouDizhuView {
  id: 'dou-dizhu';
  phase: 'bidding' | 'playing' | 'hand-result' | 'finished';
  hand: number;
  totalHands: number;
  scores: Record<string, number>;
  ownHand: number[];
  handCounts: Record<string, number>;
  landlordId: string | null;
  bottom: number[] | null;
  bids: Array<{ playerId: string; points: number }>;
  turnSeat: number | null;
  plays: Array<{ playerId: string; cards: number[] | null }>;
  lastPlay: { playerId: string; combo: DouDizhuCombo } | null;
  deadlineAt: number | null;
  handEndsAt: number | null;
  handResult: DouDizhuHandResult | null;
  revealedHands: Record<string, number[]> | null;
  winners: string[];
  /** 按座位顺序的开局玩家表；玩家中途退出房间也不会改变，前端据此对齐座位。 */
  seats: string[];
}

interface DouDizhuState {
  participantIds: string[];
  hand: number;
  totalHands: number;
  phase: DouDizhuView['phase'];
  hands: Record<string, number[]>;
  bottom: number[];
  bottomRevealed: boolean;
  landlordId: string | null;
  bid: number;
  bids: Array<{ playerId: string; points: number }>;
  biddingSeat: number;
  redealCount: number;
  turnSeat: number;
  plays: Array<{ playerId: string; cards: number[] | null }>;
  lastPlay: { playerId: string; combo: DouDizhuCombo } | null;
  passesInRow: number;
  bombs: number;
  landlordPlays: number;
  farmerPlays: number;
  scores: Record<string, number>;
  handResult: DouDizhuHandResult | null;
  deadlineAt: number | null;
  handEndsAt: number | null;
}

function shuffledDeck(rng: () => number): number[] {
  const deck = Array.from({ length: CARD_COUNT }, (_, index) => index);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [deck[index], deck[other]] = [deck[other]!, deck[index]!];
  }
  return deck;
}

function deal(state: DouDizhuState, rng: () => number) {
  const deck = shuffledDeck(rng);
  state.hands = Object.fromEntries(state.participantIds.map((id, seat) => [id, sortDouDizhuCards(deck.slice(seat * 17, seat * 17 + 17))]));
  state.bottom = sortDouDizhuCards(deck.slice(51));
  state.bottomRevealed = false;
  state.landlordId = null;
  state.bid = 0;
  state.bids = [];
  state.biddingSeat = (state.hand - 1) % state.participantIds.length;
  state.redealCount = 0;
  state.turnSeat = state.biddingSeat;
  state.plays = [];
  state.lastPlay = null;
  state.passesInRow = 0;
  state.bombs = 0;
  state.landlordPlays = 0;
  state.farmerPlays = 0;
  state.handResult = null;
  state.deadlineAt = null;
  state.handEndsAt = null;
  state.phase = 'bidding';
}

function create(options: CreateGameOptions): DouDizhuState {
  if (options.playerIds.length !== 3) {
    throw new DomainError('INVALID_PLAYER_COUNT', '斗地主需要 3 位玩家');
  }
  if (!DOU_DIZHU_ROUNDS.includes(options.rounds as (typeof DOU_DIZHU_ROUNDS)[number])) {
    throw new DomainError('INVALID_ROUNDS', '斗地主支持 1、3 或 5 手');
  }
  const state: DouDizhuState = {
    participantIds: [...options.playerIds],
    hand: 1,
    totalHands: options.rounds,
    phase: 'bidding',
    hands: {},
    bottom: [],
    bottomRevealed: false,
    landlordId: null,
    bid: 0,
    bids: [],
    biddingSeat: 0,
    redealCount: 0,
    turnSeat: 0,
    plays: [],
    lastPlay: null,
    passesInRow: 0,
    bombs: 0,
    landlordPlays: 0,
    farmerPlays: 0,
    scores: Object.fromEntries(options.playerIds.map((id) => [id, 0])),
    handResult: null,
    deadlineAt: null,
    handEndsAt: null,
  };
  deal(state, options.rng);
  state.deadlineAt = options.now + DOU_DIZHU_BID_TIMEOUT_MS;
  return state;
}

function requireTurnPlayer(state: DouDizhuState, playerId: string) {
  if (!state.participantIds.includes(playerId)) {
    throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
  }
  if (state.participantIds[state.turnSeat] !== playerId) {
    throw new DomainError('NOT_YOUR_TURN', '还没有轮到你');
  }
}

function settleLandlord(state: DouDizhuState, landlordId: string, bid: number, now: number) {
  state.landlordId = landlordId;
  state.bid = bid;
  state.bottomRevealed = true;
  state.hands[landlordId] = sortDouDizhuCards([...state.hands[landlordId]!, ...state.bottom]);
  state.phase = 'playing';
  state.bids = [...state.bids];
  state.turnSeat = state.participantIds.indexOf(landlordId);
  state.plays = [];
  state.lastPlay = null;
  state.passesInRow = 0;
  state.deadlineAt = now + DOU_DIZHU_PLAY_TIMEOUT_MS;
  state.handEndsAt = null;
}

function finishBidding(state: DouDizhuState, now: number) {
  const best = state.bids.reduce((top, entry) => (entry.points > top.points ? entry : top), state.bids[0]!);
  if (best.points > 0) {
    settleLandlord(state, best.playerId, best.points, now);
    return;
  }
  // 全员不叫：重新发牌；连续流局两次后由首叫玩家按 1 分强制坐庄。
  state.redealCount += 1;
  if (state.redealCount > MAX_REDEALS) {
    const firstBidder = state.participantIds[(state.hand - 1) % 3]!;
    settleLandlord(state, firstBidder, 1, now);
    return;
  }
  const firstBidder = (state.hand - 1) % state.participantIds.length;
  state.bids = [];
  state.biddingSeat = firstBidder;
  state.turnSeat = firstBidder;
  state.deadlineAt = now + DOU_DIZHU_BID_TIMEOUT_MS;
}

function currentHighBid(state: DouDizhuState): number {
  return state.bids.reduce((high, entry) => Math.max(high, entry.points), 0);
}

function bid(state: DouDizhuState, playerId: string, points: number, now: number) {
  if (state.phase !== 'bidding') throw new DomainError('INVALID_PHASE', '叫分已经结束');
  requireTurnPlayer(state, playerId);
  if (points <= currentHighBid(state)) throw new DomainError('INVALID_BID', '叫分必须高于当前分');
  state.bids.push({ playerId, points });
  if (points >= 3) {
    settleLandlord(state, playerId, 3, now);
    return;
  }
  const everyoneActed = state.bids.length === state.participantIds.length;
  if (everyoneActed) {
    finishBidding(state, now);
    return;
  }
  state.turnSeat = (state.turnSeat + 1) % state.participantIds.length;
  state.deadlineAt = now + DOU_DIZHU_BID_TIMEOUT_MS;
}

function passBid(state: DouDizhuState, playerId: string, now: number) {
  if (state.phase !== 'bidding') throw new DomainError('INVALID_PHASE', '叫分已经结束');
  requireTurnPlayer(state, playerId);
  state.bids.push({ playerId, points: 0 });
  if (state.bids.length === state.participantIds.length) {
    finishBidding(state, now);
    return;
  }
  state.turnSeat = (state.turnSeat + 1) % state.participantIds.length;
  state.deadlineAt = now + DOU_DIZHU_BID_TIMEOUT_MS;
}

function removeCards(hand: number[], cards: number[]) {
  const remaining = [...hand];
  for (const card of cards) {
    const index = remaining.indexOf(card);
    if (index === -1) throw new DomainError('CARD_NOT_IN_HAND', '手里没有这些牌');
    remaining.splice(index, 1);
  }
  return remaining;
}

function settleHandEnd(state: DouDizhuState, winnerId: string, now: number) {
  const landlordId = state.landlordId!;
  const landlordWins = winnerId === landlordId;
  const spring: DouDizhuHandResult['spring'] = landlordWins
    ? (state.farmerPlays === 0 ? 'spring' : 'none')
    : (state.landlordPlays <= 1 ? 'anti-spring' : 'none');
  const multiplier = state.bid * 2 ** state.bombs * (spring === 'none' ? 1 : 2);
  const deltas: Record<string, number> = {};
  for (const id of state.participantIds) {
    deltas[id] = id === landlordId
      ? (landlordWins ? 2 * multiplier : -2 * multiplier)
      : (landlordWins ? -multiplier : multiplier);
    state.scores[id] = (state.scores[id] ?? 0) + deltas[id]!;
  }
  state.handResult = { winnerId, landlordId, landlordWins, bid: state.bid, bombs: state.bombs, spring, multiplier, deltas };
  state.phase = 'hand-result';
  state.deadlineAt = null;
  state.handEndsAt = now + DOU_DIZHU_HAND_RESULT_MS;
}

function startNextHand(state: DouDizhuState, now: number, rng: () => number) {
  state.hand += 1;
  deal(state, rng);
  state.deadlineAt = now + DOU_DIZHU_BID_TIMEOUT_MS;
}

function playCards(state: DouDizhuState, playerId: string, cards: number[], now: number) {
  if (state.phase !== 'playing') throw new DomainError('INVALID_PHASE', '这一手已经结束');
  requireTurnPlayer(state, playerId);
  if (cards.length === 0) throw new DomainError('INVALID_CARDS', '至少要出一张牌');
  const parsed = parseDouDizhuCombo(cards);
  if (!parsed) throw new DomainError('INVALID_COMBO', '这些牌不构成合法牌型');
  let hand: number[];
  try {
    hand = removeCards(state.hands[playerId] ?? [], cards);
  } catch (error) {
    if (error instanceof DomainError) throw new DomainError('CARD_NOT_IN_HAND', '手里没有这些牌');
    throw error;
  }
  if (state.lastPlay && !douDizhuBeats(parsed, state.lastPlay.combo)) {
    throw new DomainError('CANNOT_BEAT', '这手牌压不过上家');
  }
  state.hands[playerId] = hand;
  state.plays.push({ playerId, cards: sortDouDizhuCards(cards) });
  state.lastPlay = { playerId, combo: parsed };
  state.passesInRow = 0;
  if (parsed.type === 'bomb' || parsed.type === 'rocket') state.bombs += 1;
  if (playerId === state.landlordId) state.landlordPlays += 1;
  else state.farmerPlays += 1;
  if (hand.length === 0) {
    settleHandEnd(state, playerId, now);
    return;
  }
  state.turnSeat = (state.turnSeat + 1) % state.participantIds.length;
  state.deadlineAt = now + DOU_DIZHU_PLAY_TIMEOUT_MS;
}

function pass(state: DouDizhuState, playerId: string, now: number) {
  if (state.phase !== 'playing') throw new DomainError('INVALID_PHASE', '这一手已经结束');
  requireTurnPlayer(state, playerId);
  if (!state.lastPlay) throw new DomainError('MUST_PLAY', '轮到你先出牌，不能过');
  state.plays.push({ playerId, cards: null });
  state.passesInRow += 1;
  if (state.passesInRow >= state.participantIds.length - 1) {
    // 两家都不要：上一手牌的玩家重新领出。
    const leaderId = state.lastPlay.playerId;
    state.turnSeat = state.participantIds.indexOf(leaderId);
    state.plays = [];
    state.lastPlay = null;
    state.passesInRow = 0;
  } else {
    state.turnSeat = (state.turnSeat + 1) % state.participantIds.length;
  }
  state.deadlineAt = now + DOU_DIZHU_PLAY_TIMEOUT_MS;
}

// 超时托管：领出时打最小的单张，跟牌时直接不要（绝不自动拆炸弹）。
function autoPlay(state: DouDizhuState, now: number) {
  const player = state.participantIds[state.turnSeat]!;
  if (!state.lastPlay) {
    const hand = sortDouDizhuCards(state.hands[player]!);
    playCards(state, player, [hand[0]!], now);
    return;
  }
  pass(state, player, now);
}

function autoBid(state: DouDizhuState, now: number) {
  passBid(state, state.participantIds[state.turnSeat]!, now);
}

function act(state: DouDizhuState, context: GameActionContext) {
  switch (context.action.type) {
    case 'bid':
      bid(state, context.playerId, context.action.points, context.now);
      return;
    case 'pass':
      if (state.phase === 'bidding') passBid(state, context.playerId, context.now);
      else pass(state, context.playerId, context.now);
      return;
    case 'play-cards':
      playCards(state, context.playerId, context.action.cards, context.now);
      return;
    case 'next-hand': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以开始下一手');
      if (state.phase !== 'hand-result') throw new DomainError('INVALID_PHASE', '这一手还没有结束');
      startNextHand(state, context.now, context.rng);
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '本局还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: state.totalHands,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「斗地主」的动作');
  }
}

function finishGame(state: DouDizhuState) {
  state.phase = 'finished';
  state.deadlineAt = null;
  state.handEndsAt = null;
}

function advanceTime(state: DouDizhuState, context: GameContext): boolean {
  if (state.phase === 'bidding' && state.deadlineAt !== null && context.now >= state.deadlineAt) {
    autoBid(state, state.deadlineAt);
    return true;
  }
  if (state.phase === 'playing' && state.deadlineAt !== null && context.now >= state.deadlineAt) {
    autoPlay(state, state.deadlineAt);
    return true;
  }
  if (state.phase === 'hand-result' && state.handEndsAt !== null && context.now >= state.handEndsAt) {
    if (state.hand >= state.totalHands) finishGame(state);
    else startNextHand(state, state.handEndsAt, context.rng);
    return true;
  }
  return false;
}

export const douDizhuGame: GameDefinition<DouDizhuState, DouDizhuView> = {
  id: 'dou-dizhu',
  version: 1,
  name: '斗地主',
  emoji: '🃏',
  description: '一副牌三个人，叫分抢地主，炸弹翻倍，春天更翻倍。',
  tags: ['棋牌', '扑克', '策略'],
  rules: ['3 人', '叫 1/2/3 分定地主', '炸弹与春天逐次翻倍'],
  englishName: 'FIGHT THE LANDLORD',
  minutesPerRound: 4,
  roundsOptions: DOU_DIZHU_ROUNDS,
  minPlayers: 3,
  maxPlayers: 3,
  create,
  act,
  advanceTime,
  view(state, playerId): DouDizhuView {
    const highest = Math.max(0, ...Object.values(state.scores));
    const revealAll = state.phase === 'hand-result' || state.phase === 'finished';
    return {
      id: 'dou-dizhu',
      phase: state.phase,
      hand: state.hand,
      totalHands: state.totalHands,
      scores: { ...state.scores },
      ownHand: sortDouDizhuCards(state.hands[playerId] ?? []),
      seats: [...state.participantIds],
      handCounts: Object.fromEntries(state.participantIds.map((id) => [id, state.hands[id]?.length ?? 0])),
      landlordId: state.landlordId,
      bottom: state.bottomRevealed ? [...state.bottom] : null,
      bids: state.bids.map((entry) => ({ ...entry })),
      turnSeat: state.phase === 'bidding' || state.phase === 'playing' ? state.turnSeat : null,
      plays: state.plays.map((entry) => ({ ...entry, cards: entry.cards ? [...entry.cards] : null })),
      lastPlay: state.lastPlay ? { playerId: state.lastPlay.playerId, combo: state.lastPlay.combo } : null,
      deadlineAt: state.deadlineAt,
      handEndsAt: state.handEndsAt,
      handResult: state.handResult ? { ...state.handResult, deltas: { ...state.handResult.deltas } } : null,
      revealedHands: revealAll && state.landlordId
        ? Object.fromEntries(state.participantIds.map((id) => [id, sortDouDizhuCards(state.hands[id] ?? [])]))
        : null,
      winners: state.phase === 'finished'
        ? state.participantIds.filter((id) => highest > 0 && state.scores[id] === highest)
        : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};

// UI 提示与测试复用的工具。
export { douDizhuStrength, parseDouDizhuCombo, douDizhuBeats, sortDouDizhuCards };
