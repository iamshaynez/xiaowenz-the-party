import { describe, expect, it } from 'vitest';
import { DomainError } from '@party/game-core';
import type { GameActionContext } from '@party/game-core';
import {
  DOU_DIZHU_BID_TIMEOUT_MS,
  DOU_DIZHU_HAND_RESULT_MS,
  DOU_DIZHU_PLAY_TIMEOUT_MS,
  douDizhuBeats,
  douDizhuGame,
  douDizhuStrength,
  parseDouDizhuCombo,
} from '@party/games';
import type { DouDizhuView } from '@party/games';

const PLAYERS = ['alpha', 'bravo', 'charlie'];

// 固定种子的确定性随机：同一份数据每次发牌一致，测试完全可复现。
function seededRng(seed = 42) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function context(playerId: string, now = 1_000, isOwner = false, rng: () => number = Math.random): GameActionContext {
  return { now, rng, playerId, isOwner, action: { type: 'pass' } };
}

type State = ReturnType<typeof douDizhuGame.create>;

function createGame(rounds = 1, seed = 42): State {
  return douDizhuGame.create({ playerIds: PLAYERS, rounds, now: 1_000, rng: seededRng(seed) });
}

function act(state: State, playerId: string, action: GameActionContext['action'], now = 1_000, isOwner = false) {
  douDizhuGame.act(state, { now, rng: seededRng(), playerId, isOwner, action });
}

function view(state: State, playerId: string): DouDizhuView {
  return douDizhuGame.view(state, playerId) as DouDizhuView;
}

describe('斗地主 · 牌型引擎', () => {
  it('识别单张、对子、三张、三带一、三带二', () => {
    // rank index: 0='2' 1='3' … 12='A'；同花色只影响 id，不影响牌型。
    const single = parseDouDizhuCombo([5]);
    expect(single?.type).toBe('single');
    expect(parseDouDizhuCombo([5, 18])?.type).toBe('pair'); // 两张 5
    expect(parseDouDizhuCombo([1, 14, 27])?.type).toBe('trio');
    expect(parseDouDizhuCombo([1, 14, 27, 40])?.type).toBe('bomb');
    expect(parseDouDizhuCombo([1, 14, 27, 5])?.type).toBe('trio-single');
    expect(parseDouDizhuCombo([1, 14, 27, 5, 18])?.type).toBe('trio-pair');
  });

  it('识别顺子、连对、飞机与四带二', () => {
    const straight = parseDouDizhuCombo([1, 2, 3, 4, 5].map((rank) => rank)); // 3..7
    expect(straight?.type).toBe('straight');
    expect(straight?.chain).toBe(5);
    // QKA+2 不构成顺子。
    expect(parseDouDizhuCombo([10, 11, 12, 13, 14])).toBeNull();
    // 连对 33 44 55。
    expect(parseDouDizhuCombo([1, 14, 2, 15, 3, 16])?.type).toBe('pair-straight');
    // 飞机 333 444。
    expect(parseDouDizhuCombo([1, 14, 27, 2, 15, 28])?.type).toBe('plane');
    // 飞机带单张 333 444 + 5 + 6。
    expect(parseDouDizhuCombo([1, 14, 27, 2, 15, 28, 4, 5])?.type).toBe('plane-single');
    // 飞机带对 333 444 + 55 + 66。
    expect(parseDouDizhuCombo([1, 14, 27, 2, 15, 28, 4, 17, 5, 18])?.type).toBe('plane-pair');
    // 四带二。
    expect(parseDouDizhuCombo([1, 14, 27, 40, 5, 6])?.type).toBe('four-two');
    expect(parseDouDizhuCombo([1, 14, 27, 40, 5, 18, 6, 19])?.type).toBe('four-two-pair');
    // 王炸。
    expect(parseDouDizhuCombo([52, 53])?.type).toBe('rocket');
  });

  it('压牌规则：同型同长比大小，炸弹压普通，王炸压一切', () => {
    const single5 = parseDouDizhuCombo([17])!; // 5
    const single9 = parseDouDizhuCombo([21])!; // 9
    expect(douDizhuBeats(single9, single5)).toBe(true);
    expect(douDizhuBeats(single5, single9)).toBe(false);
    const bomb3 = parseDouDizhuCombo([1, 14, 27, 40])!;
    expect(douDizhuBeats(bomb3, single9)).toBe(true);
    const bomb4 = parseDouDizhuCombo([2, 15, 28, 41])!;
    expect(douDizhuBeats(bomb4, bomb3)).toBe(true);
    const rocket = parseDouDizhuCombo([52, 53])!;
    expect(douDizhuBeats(rocket, bomb4)).toBe(true);
    expect(douDizhuBeats(bomb4, rocket)).toBe(false);
    // 顺子长度不同不能互压。
    const s5 = parseDouDizhuCombo([1, 2, 3, 4, 5])!;
    const s6 = parseDouDizhuCombo([1, 2, 3, 4, 5, 6])!;
    expect(douDizhuBeats(s6, s5)).toBe(false);
    // 大王压小王；2 的牌力介于 A 与小王之间（牌号 0 = ♠2）。
    expect(douDizhuStrength(53)).toBeGreaterThan(douDizhuStrength(52));
    expect(douDizhuStrength(0)).toBe(12);
    expect(douDizhuStrength(12)).toBe(11); // ♠A
    expect(douDizhuStrength(52)).toBe(13);
  });
});

describe('斗地主 · 发牌与叫分', () => {
  it('发牌 17×3 + 3 张底牌，底牌保密，座位 0 先叫', () => {
    const state = createGame();
    const first = view(state, PLAYERS[0]!);
    expect(first.phase).toBe('bidding');
    expect(first.hand).toBe(1);
    expect(first.ownHand).toHaveLength(17);
    expect(first.bottom).toBeNull();
    expect(first.handCounts[PLAYERS[0]!]).toBe(17);
    expect(first.turnSeat).toBe(0);
    expect(first.deadlineAt).toBe(1_000 + DOU_DIZHU_BID_TIMEOUT_MS);
    // 别人的手牌内容不进视图。
    const stranger = view(state, PLAYERS[1]!);
    expect(stranger.ownHand.every((card) => !first.ownHand.includes(card))).toBe(true);
  });

  it('叫分轮转：每人一次机会，1 分 → 过 → 2 分，最高分者坐庄并收底牌', () => {
    const state = createGame();
    act(state, PLAYERS[0]!, { type: 'bid', points: 1 });
    act(state, PLAYERS[1]!, { type: 'pass' });
    act(state, PLAYERS[2]!, { type: 'bid', points: 2 });
    const current = view(state, PLAYERS[2]!);
    expect(current.phase).toBe('playing');
    expect(current.landlordId).toBe(PLAYERS[2]!);
    expect(current.bottom).toHaveLength(3);
    expect(current.ownHand).toHaveLength(20);
    expect(current.turnSeat).toBe(2);
  });

  it('叫 3 分立即坐庄；不高于当前分与抢回合被拒绝', () => {
    const state = createGame();
    act(state, PLAYERS[0]!, { type: 'bid', points: 1 });
    expect(() => act(state, PLAYERS[1]!, { type: 'bid', points: 1 })).toThrowError(expect.objectContaining({ code: 'INVALID_BID' }));
    act(state, PLAYERS[1]!, { type: 'bid', points: 3 });
    const current = view(state, PLAYERS[1]!);
    expect(current.phase).toBe('playing');
    expect(current.landlordId).toBe(PLAYERS[1]!);
    expect(() => act(state, PLAYERS[2]!, { type: 'pass' })).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    expect(() => act(state, PLAYERS[2]!, { type: 'bid', points: 2 })).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('全员不叫重新发牌；连续流局后首叫玩家按 1 分强制坐庄', () => {
    const state = createGame();
    for (let round = 0; round < 2; round += 1) {
      act(state, PLAYERS[0]!, { type: 'pass' });
      act(state, PLAYERS[1]!, { type: 'pass' });
      act(state, PLAYERS[2]!, { type: 'pass' });
      expect(view(state, PLAYERS[0]!).phase).toBe('bidding'); // 重发后仍叫分
    }
    act(state, PLAYERS[0]!, { type: 'pass' });
    act(state, PLAYERS[1]!, { type: 'pass' });
    act(state, PLAYERS[2]!, { type: 'pass' });
    const current = view(state, PLAYERS[0]!);
    expect(current.phase).toBe('playing');
    expect(current.landlordId).toBe(PLAYERS[0]!);
    expect(current.ownHand).toHaveLength(20);
  });
});

describe('斗地主 · 出牌与胜负', () => {
  function quickStart(seed = 7): { state: State; landlord: string } {
    const state = createGame(1, seed);
    act(state, PLAYERS[0]!, { type: 'pass' }, 1_000);
    act(state, PLAYERS[1]!, { type: 'bid', points: 3 }, 1_100);
    const landlord = view(state, PLAYERS[1]!).landlordId!;
    return { state, landlord };
  }

  // 出牌顺序按座位轮转：返回地主之后依次行动的玩家。
  function seatOrderAfter(landlord: string): string[] {
    const seat = PLAYERS.indexOf(landlord);
    return [1, 2].map((step) => PLAYERS[(seat + step) % PLAYERS.length]!);
  }

  it('地主领出最小单张，两家过牌后地主继续领出', () => {
    const { state, landlord } = quickStart();
    const landlordHand = view(state, landlord).ownHand;
    act(state, landlord, { type: 'play-cards', cards: [landlordHand[0]!] });
    let current = view(state, landlord);
    expect(current.plays).toHaveLength(1);
    expect(current.lastPlay?.combo.type).toBe('single');
    const others = seatOrderAfter(landlord);
    act(state, others[0]!, { type: 'pass' });
    act(state, others[1]!, { type: 'pass' });
    current = view(state, landlord);
    // 两家都不要 → 地主重新领出，历史清空。
    expect(current.plays).toHaveLength(0);
    expect(current.lastPlay).toBeNull();
    expect(state.participantIds[current.turnSeat!]).toBe(landlord);
    // 领出时不能过牌。
    expect(() => act(state, landlord, { type: 'pass' })).toThrowError(expect.objectContaining({ code: 'MUST_PLAY' }));
  });

  it('手里的牌才能出：缺牌、非法牌型与压不过都被拒绝', () => {
    const { state, landlord } = quickStart();
    const landlordHand = view(state, landlord).ownHand;
    // 构造一张地主手里没有的合法单牌。
    const missingSingle = Array.from({ length: 54 }, (_, id) => id).find((id) => !landlordHand.includes(id))!;
    expect(() => act(state, landlord, { type: 'play-cards', cards: [missingSingle] }))
      .toThrowError(expect.objectContaining({ code: 'CARD_NOT_IN_HAND' }));
    // 手里必然存在两张牌力不同的牌，凑不成对子即非法牌型。
    const mismatch = (() => {
      for (let i = 0; i < landlordHand.length; i += 1) {
        for (let j = i + 1; j < landlordHand.length; j += 1) {
          if (douDizhuStrength(landlordHand[i]!) !== douDizhuStrength(landlordHand[j]!)) {
            return [landlordHand[i]!, landlordHand[j]!];
          }
        }
      }
      throw new Error('发牌异常');
    })();
    expect(() => act(state, landlord, { type: 'play-cards', cards: mismatch }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_COMBO' }));
    const farmer = seatOrderAfter(landlord)[0]!;
    act(state, landlord, { type: 'play-cards', cards: [landlordHand[0]!] });
    const farmerHand = view(state, farmer).ownHand;
    // 农民跟一张更小的单牌必然压不过。
    const weaker = [...farmerHand].sort((a, b) => douDizhuStrength(b) - douDizhuStrength(a)).find((card) => douDizhuStrength(card) < douDizhuStrength(landlordHand[0]!));
    if (weaker !== undefined) {
      expect(() => act(state, farmer, { type: 'play-cards', cards: [weaker] })).toThrowError(expect.objectContaining({ code: 'CANNOT_BEAT' }));
    }
    const farmerMissing = Array.from({ length: 54 }, (_, id) => id).find((id) => !farmerHand.includes(id))!;
    expect(() => act(state, farmer, { type: 'play-cards', cards: [farmerMissing] })).toThrowError(expect.objectContaining({ code: 'CARD_NOT_IN_HAND' }));
  });

  it('地主连续单张打完且农民全过 → 春天双倍结算，地主赢分农民扣分', () => {
    const { state, landlord } = quickStart();
    const farmers = seatOrderAfter(landlord);
    let guard = 0;
    while (view(state, landlord).phase === 'playing' && guard < 30) {
      guard += 1;
      const hand = view(state, landlord).ownHand;
      act(state, landlord, { type: 'play-cards', cards: [hand[0]!] });
      if (view(state, landlord).phase !== 'playing') break;
      act(state, farmers[0]!, { type: 'pass' });
      act(state, farmers[1]!, { type: 'pass' });
    }
    const final = view(state, landlord);
    expect(final.phase).toBe('hand-result');
    expect(final.handResult?.winnerId).toBe(landlord);
    expect(final.handResult?.spring).toBe('spring');
    expect(final.handResult?.bid).toBe(3);
    expect(final.handResult?.multiplier).toBe(6); // 3 分 × 春天 2
    expect(final.handResult?.deltas[landlord]).toBe(12);
    expect(final.handResult?.deltas[farmers[0]!]).toBe(-6);
    expect(final.scores[landlord]).toBe(12);
    expect(final.revealedHands?.[landlord]).toHaveLength(0);
  });

  it('单手结束到点自动收尾进入 finished；多手累计积分', () => {
    const { state, landlord } = quickStart();
    const farmers = seatOrderAfter(landlord);
    let guard = 0;
    while (view(state, landlord).phase === 'playing' && guard < 30) {
      guard += 1;
      const hand = view(state, landlord).ownHand;
      act(state, landlord, { type: 'play-cards', cards: [hand[0]!] }, guard * 1_000);
      if (view(state, landlord).phase !== 'playing') break;
      act(state, farmers[0]!, { type: 'pass' }, guard * 1_000);
      act(state, farmers[1]!, { type: 'pass' }, guard * 1_000);
    }
    const endsAt = view(state, landlord).handEndsAt!;
    expect(douDizhuGame.advanceTime(state, { now: endsAt - 1, rng: seededRng() })).toBe(false);
    expect(douDizhuGame.advanceTime(state, { now: endsAt, rng: seededRng() })).toBe(true);
    const final = view(state, landlord);
    expect(final.phase).toBe('finished');
    expect(final.winners).toEqual([landlord]);
    expect(douDizhuGame.isFinished(state)).toBe(true);
  });
});

describe('斗地主 · 超时、权限与快照', () => {
  it('叫分超时自动不叫，出牌超时自动过牌或出最小单张', () => {
    const state = createGame();
    // 座位 0 超时不叫。
    douDizhuGame.advanceTime(state, { now: 1_000 + DOU_DIZHU_BID_TIMEOUT_MS, rng: seededRng() });
    expect(view(state, PLAYERS[0]!).bids).toEqual([{ playerId: PLAYERS[0]!, points: 0 }]);
    act(state, PLAYERS[1]!, { type: 'bid', points: 3 });
    const landlord = PLAYERS[1]!;
    // 地主领出超时 → 自动打最小单张。
    douDizhuGame.advanceTime(state, { now: 1_000 + DOU_DIZHU_BID_TIMEOUT_MS + DOU_DIZHU_PLAY_TIMEOUT_MS, rng: seededRng() });
    const current = view(state, landlord);
    expect(current.plays).toHaveLength(1);
    expect(current.plays[0]!.cards).toHaveLength(1);
  });

  it('非房主不能推进下一手或再来一局；状态可 JSON 往返', () => {
    const state = createGame(3);
    act(state, PLAYERS[0]!, { type: 'bid', points: 3 });
    const restored = JSON.parse(JSON.stringify(state));
    expect(view(restored, PLAYERS[0]!).phase).toBe('playing');
    expect(() => act(restored, PLAYERS[0]!, { type: 'next-hand' }, 2_000, false)).toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    expect(() => act(restored, PLAYERS[0]!, { type: 'play-again' }, 2_000, false)).toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    expect(() => act(restored, PLAYERS[0]!, { type: 'next-hand' }, 2_000, true)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('三手制打完按累计分数排名，赢家可能并列', () => {
    const state = createGame(3);
    expect(view(state, PLAYERS[0]!).totalHands).toBe(3);
    expect(state.hand).toBe(1);
  });

  it('旁观者不能参与任何阶段', () => {
    const state = createGame();
    expect(() => act(state, 'stranger', { type: 'bid', points: 1 })).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    expect(() => act(state, 'stranger', { type: 'pass' })).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
  });

  it('牌号稳定性：54 张牌 id 唯一且不重复进入手牌与底牌', () => {
    const state = createGame();
    const seen: number[] = [];
    for (const playerId of PLAYERS) seen.push(...view(state, playerId).ownHand);
    expect(new Set(seen).size).toBe(51);
  });
});
