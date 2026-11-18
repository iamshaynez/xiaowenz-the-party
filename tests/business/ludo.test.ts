import { describe, expect, it } from 'vitest';
import { DomainError } from '@party/game-core';
import type { GameActionContext } from '@party/game-core';
import { ludoGame, LUDO_MOVE_TIMEOUT_MS, LUDO_ROLL_TIMEOUT_MS } from '@party/games';
import type { LudoView } from '@party/games';

// 用固定序列控制骰子：每次 rng() 弹出一个预设值。
function diceRng(...rolls: number[]) {
  const queue = [...rolls];
  return () => {
    const next = queue.shift();
    if (next === undefined) throw new Error('测试骰子序列用尽');
    return next;
  };
}

const D6 = (dice: number) => (dice - 1) / 6 + 0.01; // rng 值 → 指定骰面

function createGame(playerIds: string[] = ['red', 'yellow'], now = 1_000) {
  return ludoGame.create({ playerIds, rounds: 1, now, rng: Math.random });
}

type State = ReturnType<typeof createGame>;

function roll(state: State, playerId: string, dice: number, now = 1_000) {
  ludoGame.act(state, { now, rng: diceRng(D6(dice)), playerId, isOwner: false, action: { type: 'roll-dice' } });
}

function move(state: State, playerId: string, plane: number, now = 1_000) {
  ludoGame.act(state, { now, rng: Math.random, playerId, isOwner: false, action: { type: 'move-plane', plane } });
}

function view(state: State, playerId = 'red'): LudoView {
  return ludoGame.view(state, playerId) as LudoView;
}

function planeP(current: LudoView, seat: number, index: number) {
  return current.planes.find((plane) => plane.seat === seat && plane.index === index)?.p;
}

describe('飞行棋 · 开局与掷骰', () => {
  it('座位 0 先掷骰，飞机全部在停机坪待命', () => {
    const state = createGame();
    const first = view(state);
    expect(first.phase).toBe('playing');
    expect(first.stage).toBe('roll');
    expect(first.seat).toBe(0);
    expect(first.planes).toHaveLength(8);
    expect(first.planes.every((plane) => plane.p === -1)).toBe(true);
    expect(first.rollDeadlineAt).toBe(1_000 + LUDO_ROLL_TIMEOUT_MS);
  });

  it('只支持 2–4 人；只有轮到的玩家能掷骰', () => {
    expect(() => createGame(['a'])).toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    expect(() => createGame(['a', 'b', 'c', 'd', 'e'])).toThrowError(expect.objectContaining({ code: 'INVALID_PLAYER_COUNT' }));
    const state = createGame();
    expect(() => roll(state, 'yellow', 3)).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    expect(() => roll(state, 'stranger', 3)).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
  });

  it('掷 6 起飞并再掷一次；非 6 点无法让停机坪飞机行动', () => {
    const state = createGame();
    roll(state, 'red', 6);
    let current = view(state);
    expect(current.dice).toBe(6);
    expect(current.stage).toBe('move');
    expect(current.movablePlanes).toEqual([0, 1, 2, 3]);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(0);
    // 6 点行动后再掷一次，仍是红方。
    current = view(state);
    expect(current.stage).toBe('roll');
    expect(current.seat).toBe(0);
    roll(state, 'red', 3);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(3);
    // 非 6 点移动后回合交给黄方；黄方全在停机坪又掷出 2 → 自动轮空。
    current = view(state);
    expect(current.seat).toBe(1);
    roll(state, 'yellow', 2);
    current = view(state);
    expect(current.blocked).toBe(true);
    expect(current.seat).toBe(0);
    expect(current.stage).toBe('roll');
  });
});

describe('飞行棋 · 行进与特殊格', () => {
  it('己色格跳跃：落在 p=2 跳到 p=6', () => {
    const state = createGame();
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 2);
    move(state, 'red', 0);
    // 0 + 2 = 2 是己色格，跳 4 格到 6。
    expect(planeP(view(state), 0, 0)).toBe(6);
    expect(view(state).seat).toBe(1);
  });

  it('飞行格：落在 18 飞到 30，30 是己色格再跳到 34', () => {
    const state = createGame();
    // 起飞(0) → 5 → 5→10(己色)跳14 → 4→18 飞行 30 → 己色跳 34。
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(5);
    roll(state, 'yellow', 2);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(14);
    roll(state, 'yellow', 2);
    roll(state, 'red', 4);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(34);
  });

  it('终点前反弹：超过中心点的步数折返，恰好到达才算回家', () => {
    const state = createGame();
    // 起飞0 → 5 → 5→10跳14 → 4→18飞34 → 6→40 → 6→46(己色但跳界不跳) → 5→51 → 6→反弹55 → 6→反弹51 → 5→56。
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(5);
    roll(state, 'yellow', 2);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(14);
    roll(state, 'yellow', 2);
    roll(state, 'red', 4);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(34);
    roll(state, 'yellow', 2);
    roll(state, 'red', 6);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(40);
    roll(state, 'red', 6);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(46);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(51);
    roll(state, 'yellow', 2);
    // 51 + 6 = 57 越过 56 → 反弹到 112-57=55；6 点行动后仍追加一掷。
    roll(state, 'red', 6);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(55);
    roll(state, 'red', 6);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(51);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(56);
  });

  it('落在对手飞机所在环格，对手飞机全部退回停机坪', () => {
    const state = createGame();
    // 红方 0 号机走到 p=13（黄方入口环格 13）后停留。
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 3);
    move(state, 'red', 0);
    roll(state, 'yellow', 2); // 黄方轮空
    roll(state, 'red', 5);
    move(state, 'red', 0);
    roll(state, 'yellow', 2);
    roll(state, 'red', 5);
    move(state, 'red', 0);
    expect(planeP(view(state), 0, 0)).toBe(13);
    // 黄方掷 6 起飞（黄方飞机全局编号 4），落在自己的入口格 13 → 撞飞红机。
    roll(state, 'yellow', 6);
    move(state, 'yellow', 0);
    const current = view(state);
    expect(planeP(current, 0, 0)).toBe(-1);
    expect(planeP(current, 1, 0)).toBe(0);
    // 起飞是 6 点：黄方获得追加掷骰。
    expect(current.seat).toBe(1);
    expect(current.stage).toBe('roll');
  });
});

describe('飞行棋 · 座位映射', () => {
  it('视图暴露按座位顺序的玩家表，回合推进不改变座位', () => {
    const state = createGame(['red', 'yellow', 'green']);
    expect(view(state).seats).toEqual(['red', 'yellow', 'green']);
    // 红方掷 3 无棋可动轮空，座位交给黄方，但座位表保持开局顺序。
    roll(state, 'red', 3);
    const current = view(state);
    expect(current.seat).toBe(1);
    expect(current.seats).toEqual(['red', 'yellow', 'green']);
  });
});

describe('飞行棋 · 连续 6 点、超时与收尾', () => {
  it('连续第三个 6 作废本轮，直接交给下家', () => {
    const state = createGame();
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 6);
    move(state, 'red', 0);
    roll(state, 'red', 6);
    const current = view(state);
    expect(current.seat).toBe(1);
    expect(current.stage).toBe('roll');
    expect(current.blocked).toBe(true);
  });

  it('掷骰/移动超时自动掷骰并自动移动第一架合法飞机', () => {
    const state = createGame();
    expect(ludoGame.advanceTime(state, { now: 1_000 + LUDO_ROLL_TIMEOUT_MS - 1, rng: diceRng(D6(6)) })).toBe(false);
    expect(ludoGame.advanceTime(state, { now: 1_000 + LUDO_ROLL_TIMEOUT_MS, rng: diceRng(D6(6)) })).toBe(true);
    let current = view(state);
    expect(current.stage).toBe('move');
    expect(current.dice).toBe(6);
    expect(ludoGame.advanceTime(state, { now: 1_000 + LUDO_ROLL_TIMEOUT_MS + LUDO_MOVE_TIMEOUT_MS, rng: Math.random })).toBe(true);
    current = view(state);
    expect(planeP(current, 0, 0)).toBe(0);
    expect(current.stage).toBe('roll');
    expect(current.seat).toBe(0);
  });

  it('移动阶段超时时若无棋可动（异常快照防御）轮空而不是卡死', () => {
    const state = createGame();
    roll(state, 'red', 6);
    // 强行把红方四架飞机都标记为已到家，制造「move 阶段却无合法飞机」的异常状态。
    for (const plane of (state as { planes: Array<{ p: number }> }).planes) plane.p = 56;
    expect(ludoGame.advanceTime(state, { now: 1_000 + LUDO_MOVE_TIMEOUT_MS, rng: Math.random })).toBe(true);
    const current = view(state);
    expect(current.seat).toBe(1);
    expect(current.stage).toBe('roll');
  });

  it('四架飞机全部回家即获胜并结束整局', () => {
    const state = createGame(['red', 'yellow']);
    // 逐步把红方四架飞机送到 p=56；非 6 点避免追加掷骰，黄方全程轮空。
    const walkHome = (plane: number) => {
      roll(state, 'red', 6);
      move(state, 'red', plane);
      let guard = 0;
      while (planeP(view(state), 0, plane) !== 56 && guard < 40) {
        guard += 1;
        const p = planeP(view(state), 0, plane)!;
        const need = 56 - p;
        roll(state, 'red', Math.min(5, need));
        move(state, 'red', plane);
        if (planeP(view(state), 0, plane) === 56) break; // 到家即止，整局可能就此结束
        roll(state, 'yellow', 2); // 黄方轮空交回
      }
      if (planeP(view(state), 0, plane) !== 56) throw new Error('测试走位未到家');
      // 到家用的是非 6 点时回合已交给黄方，先轮空交还给红方再开下一架。
      if (!ludoGame.isFinished(state) && view(state).seat !== 0) roll(state, 'yellow', 2);
    };
    for (let plane = 0; plane < 4; plane += 1) walkHome(plane);
    const current = view(state);
    expect(current.phase).toBe('finished');
    expect(current.winnerId).toBe('red');
    expect(ludoGame.isFinished(state)).toBe(true);
    expect(current.rankings[0]!.playerId).toBe('red');
  });

  it('非法动作与错误阶段被拒绝；状态可 JSON 往返', () => {
    const state = createGame();
    expect(() => ludoGame.act(state, { now: 1, rng: Math.random, playerId: 'red', isOwner: false, action: { type: 'place-stone', x: 0, y: 0 } as never }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));
    expect(() => move(state, 'red', 0)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    roll(state, 'red', 6);
    expect(() => roll(state, 'red', 6)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    expect(() => move(state, 'yellow', 0)).toThrowError(expect.objectContaining({ code: 'NOT_YOUR_TURN' }));
    move(state, 'red', 1);
    expect(planeP(view(state), 0, 1)).toBe(0);
    const restored = JSON.parse(JSON.stringify(state));
    roll(restored, 'red', 3);
    move(restored, 'red', 1);
    expect(planeP(view(restored), 0, 1)).toBe(3);
  });
});
