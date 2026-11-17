import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameContext, GameDefinition } from '@party/game-core';
import { evaluateHoldem } from './texas-holdem/evaluator';

// 国际惯例的单桌设置：起始 100 个大盲（2000 筹码 vs 10/20 盲注），
// 每 6 手盲注翻倍，无限注玩法，最小加注 = 上一次加注增量。
export const HOLDEM_STARTING_STACK = 2_000;
export const HOLDEM_BASE_SB = 10;
export const HOLDEM_BASE_BB = 20;
export const HOLDEM_HANDS_PER_BLIND_LEVEL = 6;
export const HOLDEM_ACTION_TIMEOUT_MS = 60_000;
export const HOLDEM_RUNOUT_STEP_MS = 1_800;
export const HOLDEM_HAND_END_MS = 9_000;
export const HOLDEM_ROUNDS = [1, 3, 5, 8] as const;

export type HoldemStreet = 'preflop' | 'flop' | 'turn' | 'river';
export type HoldemPhase = 'betting' | 'runout' | 'hand-end' | 'finished';

export interface HoldemSeatView {
  playerId: string;
  stack: number;
  streetBet: number;
  committed: number;
  folded: boolean;
  allIn: boolean;
}

export interface HoldemPotResult {
  amount: number;
  winnerIds: string[];
  share: number;
}

export interface HoldemHandResult {
  potWinners: HoldemPotResult[];
  uncalledRefund: { playerId: string; amount: number } | null;
  eliminations: string[];
  showdown: boolean;
}

export interface HoldemView {
  id: 'texas-holdem';
  phase: HoldemPhase;
  handNumber: number;
  totalHands: number;
  blinds: { sb: number; bb: number };
  street: HoldemStreet;
  community: number[];
  ownCards: [number, number] | null;
  seats: HoldemSeatView[];
  buttonSeat: number;
  toActSeat: number | null;
  currentBet: number;
  minRaiseTo: number;
  pot: number;
  ownStack: number;
  ownStreetBet: number;
  ownFolded: boolean;
  deadlineAt: number | null;
  handEndsAt: number | null;
  runoutNextAt: number | null;
  revealed: Record<string, [number, number]> | null;
  handResult: HoldemHandResult | null;
  rankings: Array<{ playerId: string; stack: number; place: number }>;
  winners: string[];
}

interface HoldemSeat {
  playerId: string;
  stack: number;
  stackAtStart: number;
  holeCards: [number, number];
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  committed: number;
  hasActed: boolean;
}

interface HoldemState {
  participantIds: string[];
  stacks: Record<string, number>;
  phase: HoldemPhase;
  handNumber: number;
  totalHands: number;
  seats: HoldemSeat[];
  buttonPlayerId: string | null;
  deck: number[];
  community: number[];
  street: HoldemStreet;
  currentBet: number;
  minRaiseTo: number;
  toActSeat: number | null;
  actionDeadlineAt: number | null;
  runoutNextAt: number | null;
  handEndsAt: number | null;
  revealed: Record<string, [number, number]> | null;
  handResult: HoldemHandResult | null;
  uncalledRefund: { playerId: string; amount: number } | null;
  eliminated: string[];
}

function blindLevel(handNumber: number) {
  const level = Math.min(Math.floor((handNumber - 1) / HOLDEM_HANDS_PER_BLIND_LEVEL), 8);
  return { sb: HOLDEM_BASE_SB * 2 ** level, bb: HOLDEM_BASE_BB * 2 ** level };
}

function shuffledDeck(rng: () => number): number[] {
  const deck = Array.from({ length: 52 }, (_, index) => index);
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [deck[index], deck[other]] = [deck[other]!, deck[index]!];
  }
  return deck;
}

function activeSeats(state: HoldemState): HoldemSeat[] {
  return state.seats.filter((seat) => !seat.folded);
}

function canActSeats(state: HoldemState): HoldemSeat[] {
  return state.seats.filter((seat) => !seat.folded && !seat.allIn);
}

function postBlind(seat: HoldemSeat, amount: number) {
  const payAmount = Math.min(seat.stack, amount);
  seat.stack -= payAmount;
  seat.streetBet += payAmount;
  seat.committed += payAmount;
  if (seat.stack === 0) seat.allIn = true;
}

function create(options: CreateGameOptions): HoldemState {
  const count = options.playerIds.length;
  if (count < 2 || count > 6) {
    throw new DomainError('INVALID_PLAYER_COUNT', '德州扑克需要 2–6 位玩家');
  }
  if (!HOLDEM_ROUNDS.includes(options.rounds as (typeof HOLDEM_ROUNDS)[number])) {
    throw new DomainError('INVALID_ROUNDS', '德州扑克支持 1、3、5 或 8 手');
  }
  const state: HoldemState = {
    participantIds: [...options.playerIds],
    stacks: Object.fromEntries(options.playerIds.map((id) => [id, HOLDEM_STARTING_STACK])),
    phase: 'betting',
    handNumber: 1,
    totalHands: options.rounds,
    seats: [],
    buttonPlayerId: null, // 首手按钮固定在末位，之后每手顺延。
    deck: [],
    community: [],
    street: 'preflop',
    currentBet: 0,
    minRaiseTo: 0,
    toActSeat: null,
    actionDeadlineAt: null,
    runoutNextAt: null,
    handEndsAt: null,
    revealed: null,
    handResult: null,
    uncalledRefund: null,
    eliminated: [],
  };
  beginHand(state, options.now, options.rng);
  return state;
}

function beginHand(state: HoldemState, now: number, rng: () => number) {
  const actives = state.participantIds.filter((id) => state.stacks[id]! > 0);
  if (actives.length <= 1) {
    finishTournament(state);
    return;
  }
  // 按钮顺延到下一位仍在场的玩家；首手按钮固定在末位。
  if (state.buttonPlayerId === null) {
    state.buttonPlayerId = actives[actives.length - 1]!;
  } else {
    const from = state.participantIds.indexOf(state.buttonPlayerId);
    for (let step = 1; step <= state.participantIds.length; step += 1) {
      const candidate = state.participantIds[(from + step) % state.participantIds.length]!;
      if (actives.includes(candidate)) {
        state.buttonPlayerId = candidate;
        break;
      }
    }
  }
  state.seats = actives.map((playerId) => ({
    playerId,
    stack: state.stacks[playerId]!,
    stackAtStart: state.stacks[playerId]!,
    holeCards: [0, 0] as [number, number],
    folded: false,
    allIn: false,
    streetBet: 0,
    committed: 0,
    hasActed: false,
  }));
  state.deck = shuffledDeck(rng);
  for (const seat of state.seats) {
    const first = state.deck.pop()!;
    const second = state.deck.pop()!;
    seat.holeCards = [first, second];
  }
  state.community = [];
  state.street = 'preflop';
  state.revealed = null;
  state.handResult = null;
  state.uncalledRefund = null;
  state.handEndsAt = null;
  state.runoutNextAt = null;
  state.phase = 'betting';

  const { sb, bb } = blindLevel(state.handNumber);
  const buttonSeat = state.seats.findIndex((seat) => seat.playerId === state.buttonPlayerId);
  const headsUp = state.seats.length === 2;
  const sbSeat = headsUp ? buttonSeat : (buttonSeat + 1) % state.seats.length;
  const bbSeat = (sbSeat + 1) % state.seats.length;
  postBlind(state.seats[sbSeat]!, sb);
  postBlind(state.seats[bbSeat]!, bb);
  state.currentBet = bb;
  state.minRaiseTo = bb * 2;
  // 翻牌前首先行动：Heads-Up 是按钮位（小盲），多人局是大盲下家。
  const firstToAct = headsUp ? sbSeat : (bbSeat + 1) % state.seats.length;
  const seat = firstActorFrom(state, firstToAct);
  if (seat === null) {
    // 盲注即全下：无人可再行动，直接陆续发完公共牌摊牌。
    state.toActSeat = null;
    state.actionDeadlineAt = null;
    state.phase = 'runout';
    state.runoutNextAt = now + HOLDEM_RUNOUT_STEP_MS;
    return;
  }
  state.toActSeat = seat;
  state.actionDeadlineAt = now + HOLDEM_ACTION_TIMEOUT_MS;
}

// 从 from 开始顺时针找到第一位还能行动的座位；找不到返回 null。
function firstActorFrom(state: HoldemState, from: number): number | null {
  for (let step = 0; step < state.seats.length; step += 1) {
    const index = (from + step) % state.seats.length;
    const seat = state.seats[index]!;
    if (!seat.folded && !seat.allIn) return index;
  }
  return null;
}

function bettingRoundComplete(state: HoldemState): boolean {
  const actors = canActSeats(state);
  if (actors.length === 0) return true;
  return actors.every((seat) => seat.hasActed && seat.streetBet === state.currentBet);
}

function dealNextStreet(state: HoldemState): boolean {
  if (state.street === 'preflop') {
    state.community.push(state.deck.pop()!, state.deck.pop()!, state.deck.pop()!);
    state.street = 'flop';
    return true;
  }
  if (state.street === 'flop') {
    state.community.push(state.deck.pop()!);
    state.street = 'turn';
    return true;
  }
  if (state.street === 'turn') {
    state.community.push(state.deck.pop()!);
    state.street = 'river';
    return true;
  }
  return false;
}

function afterActionResolved(state: HoldemState, now: number) {
  if (activeSeats(state).length <= 1) {
    awardFoldWin(state, now);
    return;
  }
  if (bettingRoundComplete(state)) {
    if (canActSeats(state).length <= 1) {
      // 其他人全部全下：剩余下注没有意义，进入逐街发牌的 runout 节奏。
      state.phase = 'runout';
      state.toActSeat = null;
      state.actionDeadlineAt = null;
      openStreetBets(state);
      state.runoutNextAt = now + HOLDEM_RUNOUT_STEP_MS;
      return;
    }
    if (state.street === 'river') {
      showdown(state, now);
      return;
    }
    openStreetBets(state);
    dealNextStreet(state);
    const buttonSeat = state.seats.findIndex((seat) => seat.playerId === state.buttonPlayerId);
    const next = firstActorFrom(state, (buttonSeat + 1) % state.seats.length);
    if (next === null) {
      state.phase = 'runout';
      state.toActSeat = null;
      state.actionDeadlineAt = null;
      state.runoutNextAt = now + HOLDEM_RUNOUT_STEP_MS;
      return;
    }
    state.phase = 'betting';
    state.toActSeat = next;
    state.actionDeadlineAt = now + HOLDEM_ACTION_TIMEOUT_MS;
    return;
  }
  const next = firstActorFrom(state, (state.toActSeat ?? 0) + 1);
  if (next === null) {
    state.phase = 'runout';
    state.toActSeat = null;
    state.actionDeadlineAt = null;
    state.runoutNextAt = now + HOLDEM_RUNOUT_STEP_MS;
    return;
  }
  state.toActSeat = next;
  state.actionDeadlineAt = now + HOLDEM_ACTION_TIMEOUT_MS;
}

function openStreetBets(state: HoldemState) {
  for (const seat of state.seats) {
    seat.streetBet = 0;
    seat.hasActed = false;
  }
  state.currentBet = 0;
  state.minRaiseTo = 0;
}

// 没被跟注的差额退还原玩家（国际规则）。
function refundUncalled(state: HoldemState) {
  const sorted = [...state.seats].sort((a, b) => b.committed - a.committed);
  const top = sorted[0];
  const second = sorted[1];
  if (!top || !second || top.folded) return;
  const refund = top.committed - second.committed;
  if (refund <= 0) return;
  top.committed -= refund;
  top.stack += refund;
  state.uncalledRefund = { playerId: top.playerId, amount: refund };
}

function buildPots(state: HoldemState): Array<{ amount: number; eligible: HoldemSeat[] }> {
  const levels = [...new Set(state.seats.filter((seat) => seat.committed > 0).map((seat) => seat.committed))].sort((a, b) => a - b);
  const pots: Array<{ amount: number; eligible: HoldemSeat[] }> = [];
  let previous = 0;
  for (const level of levels) {
    let amount = 0;
    for (const seat of state.seats) amount += Math.max(0, Math.min(seat.committed, level) - previous);
    const eligible = state.seats.filter((seat) => !seat.folded && seat.committed >= level);
    if (amount > 0) pots.push({ amount, eligible });
    previous = level;
  }
  // 相同竞争者集合的相邻层合并为一个池（弃牌者垫入的死钱并入主池）。
  const merged: Array<{ amount: number; eligible: HoldemSeat[] }> = [];
  for (const pot of pots) {
    const last = merged[merged.length - 1];
    const sameSet = last
      && last.eligible.length === pot.eligible.length
      && last.eligible.every((seat) => pot.eligible.includes(seat));
    if (sameSet) last.amount += pot.amount;
    else merged.push(pot);
  }
  return merged;
}

function settleEliminations(state: HoldemState): string[] {
  const busted = state.seats
    .filter((seat) => seat.stack === 0 && !state.eliminated.includes(seat.playerId))
    .sort((a, b) => a.stackAtStart - b.stackAtStart);
  for (const seat of busted) {
    state.eliminated.push(seat.playerId);
    state.stacks[seat.playerId] = 0;
  }
  return busted.map((seat) => seat.playerId);
}

function payout(state: HoldemState, pots: Array<{ amount: number; eligible: HoldemSeat[] }>, showdown: boolean) {
  const buttonSeat = state.seats.findIndex((seat) => seat.playerId === state.buttonPlayerId);
  const potWinners: HoldemPotResult[] = [];
  for (const pot of pots) {
    if (pot.eligible.length === 0) continue;
    let bestScore = -1;
    let winners: HoldemSeat[] = [];
    for (const seat of pot.eligible) {
      const score = evaluateHoldem([...seat.holeCards, ...state.community]).score;
      if (score > bestScore) {
        bestScore = score;
        winners = [seat];
      } else if (score === bestScore) {
        winners.push(seat);
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    // 零头筹码从按钮位之后顺时针发给赢家（国际惯例）。
    const ordered = [...winners].sort((a, b) => {
      const offsetA = (state.seats.indexOf(a) - buttonSeat - 1 + state.seats.length) % state.seats.length;
      const offsetB = (state.seats.indexOf(b) - buttonSeat - 1 + state.seats.length) % state.seats.length;
      return offsetA - offsetB;
    });
    const winnerIds: string[] = [];
    for (const seat of ordered) {
      let extra = share;
      if (remainder > 0) {
        extra += 1;
        remainder -= 1;
      }
      seat.stack += extra;
      winnerIds.push(seat.playerId);
    }
    potWinners.push({ amount: pot.amount, winnerIds, share });
  }
  for (const seat of state.seats) state.stacks[seat.playerId] = seat.stack;
  const eliminations = settleEliminations(state);
  state.handResult = {
    potWinners,
    uncalledRefund: state.uncalledRefund,
    eliminations,
    showdown,
  };
}

function awardFoldWin(state: HoldemState, now: number) {
  refundUncalled(state);
  const winner = activeSeats(state)[0];
  if (!winner) return;
  const totalPot = state.seats.reduce((sum, seat) => sum + seat.committed, 0);
  winner.stack += totalPot;
  for (const seat of state.seats) state.stacks[seat.playerId] = seat.stack;
  const eliminations = settleEliminations(state);
  state.handResult = {
    potWinners: [{ amount: totalPot, winnerIds: [winner.playerId], share: totalPot }],
    uncalledRefund: state.uncalledRefund,
    eliminations,
    showdown: false,
  };
  endHand(state, now);
}

function showdown(state: HoldemState, now: number) {
  refundUncalled(state);
  state.revealed = Object.fromEntries(
    activeSeats(state).map((seat) => [seat.playerId, [...seat.holeCards] as [number, number]]),
  );
  payout(state, buildPots(state), true);
  endHand(state, now);
}

function endHand(state: HoldemState, now: number) {
  state.phase = 'hand-end';
  state.toActSeat = null;
  state.actionDeadlineAt = null;
  state.runoutNextAt = null;
  state.handEndsAt = now + HOLDEM_HAND_END_MS;
}

function finishTournament(state: HoldemState) {
  state.phase = 'finished';
  state.toActSeat = null;
  state.actionDeadlineAt = null;
  state.runoutNextAt = null;
  state.handEndsAt = null;
}

function rankingsOf(state: HoldemState): HoldemView['rankings'] {
  const survivors = state.participantIds
    .filter((id) => state.stacks[id]! > 0)
    .sort((a, b) => state.stacks[b]! - state.stacks[a]!);
  const ordered = [...survivors, ...[...state.eliminated].reverse()];
  return ordered.map((playerId, index) => ({ playerId, stack: state.stacks[playerId]!, place: index + 1 }));
}

function validateTurn(state: HoldemState, playerId: string): HoldemSeat {
  if (!state.participantIds.includes(playerId)) {
    throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
  }
  if (state.phase !== 'betting' || state.toActSeat === null) {
    throw new DomainError('INVALID_PHASE', '现在不是下注阶段');
  }
  const seat = state.seats[state.toActSeat]!;
  if (seat.playerId !== playerId) throw new DomainError('NOT_YOUR_TURN', '还没有轮到你');
  return seat;
}

function pay(seat: HoldemSeat, amount: number) {
  const payAmount = Math.min(seat.stack, amount);
  seat.stack -= payAmount;
  seat.streetBet += payAmount;
  seat.committed += payAmount;
  if (seat.stack === 0) seat.allIn = true;
}

function act(state: HoldemState, context: GameActionContext) {
  switch (context.action.type) {
    case 'fold': {
      const seat = validateTurn(state, context.playerId);
      seat.folded = true;
      seat.hasActed = true;
      afterActionResolved(state, context.now);
      return;
    }
    case 'check': {
      const seat = validateTurn(state, context.playerId);
      if (seat.streetBet !== state.currentBet) throw new DomainError('CANNOT_CHECK', '面对下注需要跟注、加注或弃牌');
      seat.hasActed = true;
      afterActionResolved(state, context.now);
      return;
    }
    case 'call': {
      const seat = validateTurn(state, context.playerId);
      const need = state.currentBet - seat.streetBet;
      if (need <= 0) throw new DomainError('CANNOT_CALL', '没有需要跟注的筹码，可以过牌');
      pay(seat, need);
      seat.hasActed = true;
      afterActionResolved(state, context.now);
      return;
    }
    case 'bet': {
      const seat = validateTurn(state, context.playerId);
      if (state.currentBet > 0) throw new DomainError('CANNOT_BET', '已有注额时只能加注');
      const amount = context.action.amount;
      const allInTotal = seat.stack + seat.streetBet;
      const { bb } = blindLevel(state.handNumber);
      const minBet = Math.min(bb, allInTotal);
      if (amount > allInTotal) throw new DomainError('INVALID_AMOUNT', '筹码不够下这么大的注');
      if (amount < minBet && amount !== allInTotal) {
        throw new DomainError('INVALID_AMOUNT', `下注至少 ${minBet} 个筹码`);
      }
      pay(seat, amount - seat.streetBet);
      state.currentBet = seat.streetBet;
      state.minRaiseTo = state.currentBet * 2;
      for (const other of state.seats) if (other !== seat) other.hasActed = false;
      seat.hasActed = true;
      afterActionResolved(state, context.now);
      return;
    }
    case 'raise-to': {
      const seat = validateTurn(state, context.playerId);
      if (seat.hasActed) {
        // 短全下不重开行动权：已经行动过的玩家只能跟注或弃牌（TDA 惯例）。
        throw new DomainError('CANNOT_RERAISE', '下注未被完整加注重开，只能跟注或弃牌');
      }
      const to = context.action.amount;
      const allInTotal = seat.stack + seat.streetBet;
      if (to <= state.currentBet) throw new DomainError('INVALID_AMOUNT', '加注必须高于当前注额');
      if (to > allInTotal) throw new DomainError('INVALID_AMOUNT', '筹码不够加到这个数目');
      if (to !== allInTotal && to < state.minRaiseTo) {
        throw new DomainError('INVALID_AMOUNT', `完整加注至少要加到 ${state.minRaiseTo}`);
      }
      const previousBet = state.currentBet;
      pay(seat, to - seat.streetBet);
      if (to >= state.minRaiseTo) {
        // 完整加注：重开行动权并抬升最小加注线；短全下不重开。
        state.minRaiseTo = to + (to - previousBet);
        for (const other of state.seats) if (other !== seat) other.hasActed = false;
      }
      state.currentBet = Math.max(state.currentBet, seat.streetBet);
      seat.hasActed = true;
      afterActionResolved(state, context.now);
      return;
    }
    case 'next-hand': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以开始下一手');
      if (state.phase !== 'hand-end') throw new DomainError('INVALID_PHASE', '这一手还没有结束');
      startNextHandOrFinish(state, context.now, context.rng);
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
      throw new DomainError('INVALID_ACTION', '这不是「德州扑克」的动作');
  }
}

function startNextHandOrFinish(state: HoldemState, now: number, rng: () => number) {
  const survivors = state.participantIds.filter((id) => state.stacks[id]! > 0);
  if (survivors.length <= 1 || state.handNumber >= state.totalHands) {
    finishTournament(state);
    return;
  }
  state.handNumber += 1;
  beginHand(state, now, rng);
}

function autoAct(state: HoldemState, now: number) {
  const seat = state.toActSeat !== null ? state.seats[state.toActSeat] : undefined;
  if (!seat) return;
  // 超时托管：能过则过，否则弃牌（绝不自动跟注消耗筹码）。
  if (seat.streetBet === state.currentBet) seat.hasActed = true;
  else {
    seat.folded = true;
    seat.hasActed = true;
  }
  afterActionResolved(state, now);
}

function advanceTime(state: HoldemState, context: GameContext): boolean {
  if (state.phase === 'betting' && state.actionDeadlineAt !== null && context.now >= state.actionDeadlineAt) {
    autoAct(state, state.actionDeadlineAt);
    return true;
  }
  if (state.phase === 'runout' && state.runoutNextAt !== null && context.now >= state.runoutNextAt) {
    openStreetBets(state);
    if (dealNextStreet(state)) {
      if (state.street === 'river') showdown(state, state.runoutNextAt);
      else state.runoutNextAt += HOLDEM_RUNOUT_STEP_MS;
      return true;
    }
    showdown(state, context.now);
    return true;
  }
  if (state.phase === 'hand-end' && state.handEndsAt !== null && context.now >= state.handEndsAt) {
    startNextHandOrFinish(state, state.handEndsAt, context.rng);
    return true;
  }
  return false;
}

export const texasHoldemGame: GameDefinition<HoldemState, HoldemView> = {
  id: 'texas-holdem',
  version: 1,
  name: '德州扑克',
  emoji: '♠️',
  description: '两张底牌，无限注。盲注逐级上升，边池按国际规则结算，摊牌见真章。',
  tags: ['棋牌', '扑克', '博弈'],
  rules: ['2–6 人', '起始 2000 筹码 vs 10/20 盲注', '每 6 手盲注翻倍'],
  englishName: "TEXAS HOLD'EM",
  minutesPerRound: 3,
  roundsOptions: HOLDEM_ROUNDS,
  minPlayers: 2,
  maxPlayers: 6,
  create,
  act,
  advanceTime,
  view(state, playerId): HoldemView {
    const own = state.seats.find((seat) => seat.playerId === playerId);
    const rankings = rankingsOf(state);
    return {
      id: 'texas-holdem',
      phase: state.phase,
      handNumber: state.handNumber,
      totalHands: state.totalHands,
      blinds: blindLevel(state.handNumber),
      street: state.street,
      community: [...state.community],
      ownCards: own ? [...own.holeCards] as [number, number] : null,
      seats: state.seats.map((seat) => ({
        playerId: seat.playerId,
        stack: seat.stack,
        streetBet: seat.streetBet,
        committed: seat.committed,
        folded: seat.folded,
        allIn: seat.allIn,
      })),
      buttonSeat: state.seats.findIndex((seat) => seat.playerId === state.buttonPlayerId),
      toActSeat: state.phase === 'betting' ? state.toActSeat : null,
      currentBet: state.currentBet,
      minRaiseTo: state.minRaiseTo,
      pot: state.seats.reduce((sum, seat) => sum + seat.committed, 0),
      ownStack: state.stacks[playerId] ?? 0,
      ownStreetBet: own?.streetBet ?? 0,
      ownFolded: own?.folded ?? false,
      deadlineAt: state.actionDeadlineAt,
      handEndsAt: state.handEndsAt,
      runoutNextAt: state.runoutNextAt,
      revealed: state.revealed
        ? Object.fromEntries(Object.entries(state.revealed).map(([id, cards]) => [id, [...cards] as [number, number]]))
        : null,
      handResult: state.handResult ? {
        potWinners: state.handResult.potWinners.map((pot) => ({ ...pot, winnerIds: [...pot.winnerIds] })),
        uncalledRefund: state.handResult.uncalledRefund ? { ...state.handResult.uncalledRefund } : null,
        eliminations: [...state.handResult.eliminations],
        showdown: state.handResult.showdown,
      } : null,
      rankings,
      winners: state.phase === 'finished' ? rankings.filter((entry) => entry.place === 1).map((entry) => entry.playerId) : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
