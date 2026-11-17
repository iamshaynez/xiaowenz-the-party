import { describe, expect, it } from 'vitest';
import { DomainError } from '@party/game-core';
import type { GameActionContext } from '@party/game-core';
import {
  HOLDEM_ACTION_TIMEOUT_MS,
  evaluateHoldem,
  texasHoldemGame,
} from '@party/games';
import type { HoldemView } from '@party/games';

const PLAYERS = ['ada', 'ben', 'cyd', 'dee'];

// 牌号：suit*13 + rankIndex（0=2 … 12=A）。suit: 0♠ 1♥ 2♣ 3♦
const card = (suit: number, rank: number) => suit * 13 + rank;

// 构造能产生指定发牌序列的 rng：按 seats 顺序先发底牌，再发公共牌。
// 原理：Fisher-Yates 第 i 步的选择 j 可由目标牌序反推，逐步喂给 rng 即可。
function deckRng(sequence: number[]): () => number {
  const filler = Array.from({ length: 52 }, (_, index) => index).filter((id) => !sequence.includes(id));
  const deck = [...filler, ...[...sequence].reverse()]; // 末尾的牌最先发出
  const choices: number[] = [];
  const current = Array.from({ length: 52 }, (_, index) => index);
  for (let i = 51; i >= 1; i -= 1) {
    const j = current.indexOf(deck[i]!);
    if (j < 0 || j > i) throw new Error('测试牌序无法通过洗牌达成');
    [current[i], current[j]] = [current[j]!, current[i]!];
    choices.push(j);
  }
  let step = 0;
  return () => {
    const i = 51 - step;
    const j = choices[step]!;
    step += 1;
    return (j + 0.5) / (i + 1);
  };
}

type State = ReturnType<typeof texasHoldemGame.create>;

function createGame(playerIds: string[], sequence: number[], rounds = 8): State {
  return texasHoldemGame.create({ playerIds, rounds, now: 1_000, rng: deckRng(sequence) });
}

function act(state: State, playerId: string, action: GameActionContext['action'], now = 1_000, isOwner = false, rng: () => number = Math.random) {
  texasHoldemGame.act(state, { now, rng, playerId, isOwner, action });
}

function view(state: State, playerId = PLAYERS[0]!): HoldemView {
  return texasHoldemGame.view(state, playerId) as HoldemView;
}

function advance(state: State, now: number, rng: () => number = Math.random) {
  return texasHoldemGame.advanceTime(state, { now, rng });
}

function stacksOf(state: State): Record<string, number> {
  return Object.fromEntries(view(state).seats.map((seat) => [seat.playerId, seat.stack]));
}

// 把所有 runout 的公共牌逐步发完（用于全下摊牌）。
function runoutAll(state: State) {
  let guard = 0;
  while (view(state).phase === 'runout' && guard < 10) {
    guard += 1;
    advance(state, view(state).runoutNextAt ?? 0, Math.random);
  }
}

describe('德州扑克 · 牌力评估', () => {
  const score = (cards: number[]) => evaluateHoldem(cards).score;

  it('牌型强弱与踢脚正确排序', () => {
    const sf = [card(0, 12), card(0, 11), card(0, 10), card(0, 9), card(0, 8), card(1, 2), card(2, 5)];
    const quads = [card(0, 12), card(1, 12), card(2, 12), card(3, 12), card(0, 5), card(1, 7), card(2, 9)];
    const boat = [card(0, 12), card(1, 12), card(2, 12), card(0, 5), card(1, 5), card(2, 9), card(3, 9)];
    const flush = [card(0, 12), card(0, 10), card(0, 8), card(0, 6), card(0, 4), card(1, 5), card(2, 7)];
    const straight = [card(0, 12), card(1, 0), card(2, 1), card(3, 2), card(0, 3), card(1, 7), card(2, 9)];
    const trips = [card(0, 12), card(1, 12), card(2, 12), card(0, 5), card(1, 7), card(2, 9), card(3, 2)];
    expect(score(sf)).toBeGreaterThan(score(quads));
    expect(score(quads)).toBeGreaterThan(score(boat));
    expect(score(boat)).toBeGreaterThan(score(flush));
    expect(score(flush)).toBeGreaterThan(score(straight));
    expect(score(straight)).toBeGreaterThan(score(trips));
    // A-2-3-4-5 轮子顺子小于以 6 为高张的顺子。
    const wheel = [card(0, 12), card(1, 0), card(2, 1), card(3, 2), card(0, 3), card(1, 5), card(2, 5)];
    const sixStraight = [card(0, 2), card(1, 3), card(2, 4), card(3, 5), card(0, 6), card(1, 9), card(2, 9)];
    expect(score(sixStraight)).toBeGreaterThan(score(wheel));
    // 踢脚：同为一对 A，K 踢脚胜过 Q 踢脚。
    const pairAK = [card(0, 12), card(1, 12), card(0, 11), card(1, 5), card(2, 7), card(3, 9), card(0, 2)];
    const pairAQ = [card(0, 12), card(1, 12), card(0, 10), card(1, 5), card(2, 7), card(3, 9), card(0, 2)];
    expect(score(pairAK)).toBeGreaterThan(score(pairAQ));
    // 两个三条凑葫芦：大三条当主体。
    const doubleTrio = [card(0, 8), card(1, 8), card(2, 8), card(0, 5), card(1, 5), card(2, 5), card(3, 12)];
    expect(evaluateHoldem(doubleTrio).category).toBe(6);
  });
});

describe('德州扑克 · 开局、盲注与按钮', () => {
  const [a, b, c] = PLAYERS;

  it('三人局：初始按钮在末位，盲注入池，大盲下家先行动', () => {
    const state = createGame([a!, b!, c!], []);
    const current = view(state, a!);
    expect(current.phase).toBe('betting');
    expect(current.street).toBe('preflop');
    expect(current.handNumber).toBe(1);
    expect(current.blinds).toEqual({ sb: 10, bb: 20 });
    expect(current.seats.map((seat) => seat.playerId)).toEqual([a, b, c]);
    expect(current.buttonSeat).toBe(2);
    // ada 小盲(10)、ben 大盲(20)，cyd（UTG）先行动。
    expect(current.seats[0]!.streetBet).toBe(10);
    expect(current.seats[1]!.streetBet).toBe(20);
    expect(current.seats[current.toActSeat!]!.playerId).toBe(c);
    expect(current.pot).toBe(30);
    expect(current.deadlineAt).toBe(1_000 + HOLDEM_ACTION_TIMEOUT_MS);
  });

  it('两人局：按钮位即小盲且翻牌前先行动', () => {
    const [x, y] = PLAYERS;
    const state = createGame([x!, y!], []);
    const current = view(state, x!);
    expect(current.buttonSeat).toBe(1);
    expect(current.seats[1]!.streetBet).toBe(10);
    expect(current.seats[current.toActSeat!]!.playerId).toBe(y);
  });

  it('人数与轮数边界', () => {
    expect(() => createGame(['a'], [])).toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    expect(() => createGame(['1', '2', '3', '4', '5', '6', '7'], [])).toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    expect(() => texasHoldemGame.create({ playerIds: ['a', 'b'], rounds: 2, now: 1, rng: Math.random }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
  });
});

describe('德州扑克 · 下注轮', () => {
  const [a, b, c] = PLAYERS;

  it('最小加注线、不能过牌与不能下注都按规则拒绝', () => {
    const state = createGame([a!, b!, c!], []);
    // 翻牌前已有盲注，只能跟/加/弃（cyd 是 UTG）。
    expect(() => act(state, c!, { type: 'bet', amount: 60 })).toThrowError(expect.objectContaining({ code: 'CANNOT_BET' }));
    // 加注至少到 40（2×大盲）。
    expect(() => act(state, c!, { type: 'raise-to', amount: 30 })).toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    act(state, c!, { type: 'raise-to', amount: 40 });
    // cyd 加到 40 后，ada(小盲) 完整加注到 120，ben 的再加注必须至少到 200。
    act(state, a!, { type: 'raise-to', amount: 120 });
    expect(() => act(state, b!, { type: 'raise-to', amount: 180 })).toThrowError(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    act(state, b!, { type: 'raise-to', amount: 200 });
    expect(() => act(state, c!, { type: 'check' })).toThrowError(expect.objectContaining({ code: 'CANNOT_CHECK' }));
    act(state, c!, { type: 'fold' });
    act(state, a!, { type: 'fold' });
    const current = view(state, b!);
    expect(current.phase).toBe('hand-end');
    expect(current.handResult?.showdown).toBe(false);
    // ben 200 中只有 120 被跟注，80 退回；净赢 cyd 40 + ada 120。
    expect(current.handResult?.uncalledRefund).toEqual({ playerId: b!, amount: 80 });
    expect(stacksOf(state)).toEqual({ [a!]: 1880, [b!]: 2160, [c!]: 1960 });
    expect(current.revealed).toBeNull();
  });

  it('不是你的回合、旁观者与错误阶段都被拒绝', () => {
    const state = createGame([a!, b!, c!], []);
    expect(() => act(state, b!, { type: 'call' })).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    expect(() => act(state, 'stranger', { type: 'call' })).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    expect(() => act(state, a!, { type: 'next-hand' }, 1_000, true)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    expect(() => act(state, a!, { type: 'play-again' }, 1_000, true)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('弃牌获胜不亮任何底牌，赢家保留自己的视图', () => {
    const state = createGame([a!, b!, c!], []);
    act(state, c!, { type: 'fold' });
    act(state, a!, { type: 'fold' });
    const current = view(state, b!);
    expect(current.phase).toBe('hand-end');
    expect(current.revealed).toBeNull();
    expect(view(state, a!).ownCards).not.toBeNull();
    expect(view(state, c!).ownCards).not.toBeNull();
  });
});

describe('德州扑克 · 摊牌、边池与平分', () => {
  const [a, b, c, d] = PLAYERS;

  // 第一手：ada ♠A♥A 葫芦击败 cyd；ben 弃大盲、dee 弃按钮。
  function playHand1(): State {
    const state = createGame(
      [a!, b!, c!, d!],
      [
        card(0, 12), card(1, 12),
        card(0, 0), card(0, 1),
        card(1, 0), card(1, 1),
        card(2, 0), card(2, 1),
        card(1, 7), card(3, 7), card(2, 7),
        card(0, 4),
        card(0, 9),
      ],
    );
    act(state, c!, { type: 'raise-to', amount: 300 });
    act(state, d!, { type: 'fold' });
    act(state, a!, { type: 'call' });
    act(state, b!, { type: 'fold' });
    for (const now of [2_000, 3_000, 4_000]) {
      act(state, a!, { type: 'check' }, now);
      act(state, c!, { type: 'check' }, now);
    }
    return state;
  }

  it('第一手：摊牌亮出未弃牌者，筹码按算术结算', () => {
    const state = playHand1();
    const current = view(state, a!);
    expect(current.phase).toBe('hand-end');
    expect(current.handResult?.showdown).toBe(true);
    expect(current.handResult?.potWinners).toEqual([{ amount: 620, winnerIds: [a!], share: 620 }]);
    expect(Object.keys(current.revealed!).sort()).toEqual([a!, c!].sort());
    expect(stacksOf(state)).toEqual({ [a!]: 2320, [b!]: 1980, [c!]: 1700, [d!]: 2000 });
  });

  it('第二手：短全下产生主池+边池，未跟注退回，两个池归不同赢家', () => {
    const state = playHand1();
    const endsAt = view(state, a!).handEndsAt!;
    // 第二手：ada ♠2♠3（最弱）、ben ♠Q♠J、cyd ♠A♠K（最强）、dee ♥2♥3；
    // 公共牌 ♥A♦7♣9♠4♠10 → cyd 主池三条 A，ben 边池赢 ada。
    advance(state, endsAt, deckRng([
      card(0, 0), card(0, 1),
      card(0, 10), card(0, 9),
      card(0, 12), card(0, 11),
      card(1, 0), card(1, 1),
      card(1, 12), card(3, 5), card(2, 7),
      card(0, 2),
      card(0, 8),
    ]));
    expect(view(state, a!).handNumber).toBe(2);
    expect(view(state, a!).buttonSeat).toBe(0); // 按钮顺延到 ada

    // UTG=dee 弃；ada(按钮) 加注全下 1980；ben(小盲) 全下跟；cyd(大盲) 短全下跟 1700。
    act(state, d!, { type: 'fold' }, endsAt + 1);
    act(state, a!, { type: 'raise-to', amount: 1980 }, endsAt + 2);
    act(state, b!, { type: 'call' }, endsAt + 3);
    act(state, c!, { type: 'call' }, endsAt + 4);
    const allIn = view(state, a!);
    expect(allIn.phase).toBe('runout');
    expect(allIn.handResult).toBeNull(); // 摊牌前还没有结算
    runoutAll(state);
    const current = view(state, a!);
    expect(current.phase).toBe('hand-end');
    // 主池 1700×3=5100 归 cyd；边池 (1980-1700)×2=560 归 ben；ada 剩 340。
    expect(current.handResult?.potWinners).toEqual([
      { amount: 5100, winnerIds: [c!], share: 5100 },
      { amount: 560, winnerIds: [b!], share: 560 },
    ]);
    expect(stacksOf(state)).toEqual({ [a!]: 340, [b!]: 560, [c!]: 5100, [d!]: 2000 });
  });

  it('平分底池的零头筹码从按钮后顺时针分配', () => {
    // board ♠A♥A♣4♦4♠7：ada/cyd 各持 K 平分，ben 持 Q 落败。
    const state = createGame(
      [a!, b!, c!],
      [
        card(0, 11), card(0, 0),
        card(2, 9), card(2, 8),
        card(1, 11), card(1, 0),
        card(0, 12), card(1, 12), card(2, 2),
        card(3, 2),
        card(0, 5),
      ],
    );
    // 三人各投入 99 → 底池 297，平分 148.5：ada（按钮 cyd 之后首位赢家）拿 149。
    act(state, c!, { type: 'raise-to', amount: 99 });
    act(state, a!, { type: 'call' });
    act(state, b!, { type: 'call' });
    for (const now of [2_000, 3_000, 4_000]) {
      act(state, a!, { type: 'check' }, now);
      act(state, b!, { type: 'check' }, now);
      act(state, c!, { type: 'check' }, now);
    }
    const current = view(state, a!);
    expect(current.phase).toBe('hand-end');
    expect(stacksOf(state)).toEqual({ [a!]: 2050, [b!]: 1901, [c!]: 2049 });
  });
});

describe('德州扑克 · 锦标赛推进', () => {
  const [a, b] = PLAYERS;

  it('盲注每 6 手翻倍；全部弃牌到点自动开下一手', () => {
    const [p1, p2, p3] = PLAYERS;
    const state = createGame([p1!, p2!, p3!], [], 8);
    for (let hand = 1; hand <= 7; hand += 1) {
      expect(view(state, p1!).handNumber).toBe(hand);
      expect(view(state, p1!).blinds).toEqual(hand <= 6 ? { sb: 10, bb: 20 } : { sb: 20, bb: 40 });
      // UTG 与小盲逐个弃牌，大盲收池。
      while (view(state, p1!).phase === 'betting') {
        const current = view(state, p1!);
        const actor = current.seats[current.toActSeat!]!.playerId;
        act(state, actor, { type: 'fold' });
      }
      advance(state, view(state, p1!).handEndsAt!, deckRng([]));
    }
  });

  it('单挑全下：输家出局、冠军产生，房主可再来一局', () => {
    // ada ♠A♠K vs ben ♠2♠3，board 999-J-6：ada 葫芦夺冠。
    const state = createGame(
      [a!, b!],
      [
        card(0, 12), card(0, 11),
        card(0, 0), card(0, 1),
        card(1, 7), card(3, 7), card(2, 7),
        card(0, 9),
        card(0, 4),
      ],
    );
    act(state, b!, { type: 'raise-to', amount: 2000 }); // 按钮/小盲全下
    act(state, a!, { type: 'call' });                    // 大盲全下跟注
    runoutAll(state);
    const ended = view(state, a!);
    expect(ended.phase).toBe('hand-end');
    expect(stacksOf(state)).toEqual({ [a!]: 4000, [b!]: 0 });
    const endsAt = ended.handEndsAt!;
    advance(state, endsAt, Math.random);
    const final = view(state, a!);
    expect(final.phase).toBe('finished');
    expect(final.winners).toEqual([a!]);
    expect(texasHoldemGame.isFinished(state)).toBe(true);
    expect(() => act(state, a!, { type: 'play-again' }, endsAt + 1, false)).toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    act(state, a!, { type: 'play-again' }, endsAt + 1, true, deckRng([]));
    expect(view(state, a!).phase).toBe('betting');
  });

  it('超时托管：面对下注自动弃牌，无人下注时自动过牌', () => {
    const [p1, p2, p3] = PLAYERS;
    const state = createGame([p1!, p2!, p3!], []);
    // UTG(cyd) 超时：面对盲注自动弃牌。
    expect(advance(state, 1_000 + HOLDEM_ACTION_TIMEOUT_MS, Math.random)).toBe(true);
    expect(view(state, p1!).seats.find((seat) => seat.playerId === p3!)!.folded).toBe(true);
    // 小盲超时弃牌，大盲直接赢池。
    expect(advance(state, 1_000 + HOLDEM_ACTION_TIMEOUT_MS * 2, Math.random)).toBe(true);
    let current = view(state, p1!);
    expect(current.phase).toBe('hand-end');
    expect(current.handResult?.potWinners[0]!.winnerIds).toEqual([p2!]);

    // 第二手按钮轮到 ada：UTG=ada 跟注、ben(小盲) 跟注、cyd(大盲) 过牌 → 翻牌。
    const endsAt = current.handEndsAt!;
    advance(state, endsAt, deckRng([]));
    act(state, p1!, { type: 'call' }, endsAt + 1);
    act(state, p2!, { type: 'call' }, endsAt + 1);
    act(state, p3!, { type: 'check' }, endsAt + 1);
    current = view(state, p1!);
    expect(current.street).toBe('flop');
    // 三次超时依次自动过牌（ben → cyd → ada）→ 转牌。
    for (let step = 0; step < 3; step += 1) {
      const deadline = view(state, p1!).deadlineAt!;
      advance(state, deadline + 1, Math.random);
    }
    current = view(state, p1!);
    expect(current.street).toBe('turn');
    expect(current.phase).toBe('betting');
  });

  it('状态可 JSON 往返并继续对局；下一手只能由房主在 hand-end 推进', () => {
    const [p1, p2, p3] = PLAYERS;
    const state = createGame([p1!, p2!, p3!], []);
    act(state, p3!, { type: 'call' });
    const restored = JSON.parse(JSON.stringify(state));
    act(restored, p1!, { type: 'call' }, 1_100);
    act(restored, p2!, { type: 'check' }, 1_200);
    expect(view(restored, p1!).street).toBe('flop');
    expect(() => act(restored, p1!, { type: 'next-hand' }, 2_000, true)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    act(restored, p1!, { type: 'check' }, 2_000);
    act(restored, p2!, { type: 'check' }, 2_000);
    act(restored, p3!, { type: 'check' }, 2_000);
    expect(view(restored, p1!).street).toBe('turn');
  });

  it('短全下不重开行动权：已行动者只能跟注或弃牌', () => {
    const [p1, p2, p3] = PLAYERS;
    const state = createGame([p1!, p2!, p3!], []);
    // 快照手术：直接把局面改写到翻牌后，构造「两人已行动 + 第三者短全下」场景。
    const restored = JSON.parse(JSON.stringify(state));
    for (const seat of restored.seats) {
      seat.streetBet = 0;
      seat.committed = 0;
      seat.hasActed = false;
    }
    restored.seats[2]!.stack = 60; // cyd 只剩 60，注定是短全下
    restored.street = 'flop';
    restored.community = [card(1, 5), card(2, 8), card(3, 11)];
    restored.currentBet = 0;
    restored.minRaiseTo = 0;
    restored.toActSeat = 0;
    // p1 下注 40；p2 跟注；p3 短全下 60（不足最小加注 80）→ 回到 p1：只能跟/弃。
    act(restored, p1!, { type: 'bet', amount: 40 }, 5_000);
    act(restored, p2!, { type: 'call' }, 5_001);
    act(restored, p3!, { type: 'raise-to', amount: 60 }, 5_002);
    expect(() => act(restored, p1!, { type: 'raise-to', amount: 200 }, 5_003)).toThrowError(expect.objectContaining({ code: 'CANNOT_RERAISE' }));
    act(restored, p1!, { type: 'call' }, 5_004);
    act(restored, p2!, { type: 'call' }, 5_005);
    const current = view(restored, p1!);
    // p3 全下、p1/p2 跟注完毕：p1/p2 仍有筹码，正常进入转牌下注。
    expect(current.street).toBe('turn');
    expect(current.phase).toBe('betting');
  });
});
