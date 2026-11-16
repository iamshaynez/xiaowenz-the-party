import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import type { PiggyBankView } from '@party/games';

const NOW = 1_000;

// 脚本化随机数：按序出队，用尽后重复最后一个值（sticky），
// 让「create 一次 + 每轮事件一次（盲罐再一次）」的调用顺序在测试里可精确编排。
function rngScript(...values: number[]) {
  let index = 0;
  return () => {
    if (index >= values.length) return values[values.length - 1] ?? 0;
    return values[index++]!;
  };
}

function player(id: string, nickname = id) {
  return { id, nickname, avatar: '🦊' };
}

function roomWithPlayers(ids = ['owner', 'p2', 'p3']) {
  const room = PartyRoom.create({ code: 'PARTY7', owner: player(ids[0]!, '房主'), now: NOW });
  for (const id of ids.slice(1)) room.addPlayer(player(id), NOW);
  return room;
}

function start(room: PartyRoom, rounds = 4, rng: () => number = rngScript(0.5, 0.1)) {
  room.startGame('owner', 'piggy-bank', { rounds }, { now: NOW, rng });
}

function gameView(room: PartyRoom, playerId = 'owner') {
  const game = room.viewFor(playerId).game;
  if (!game) throw new Error('游戏尚未开始');
  return game as PiggyBankView;
}

function choose(room: PartyRoom, playerId: string, choice: 'guard' | 'smash') {
  room.act(playerId, { type: 'choose', choice }, { now: NOW, rng: rngScript(0.1) });
}

// 以 40 秒为步长推进时钟。全员提前提交的轮次一步即可进入下一轮；
// 无人提交的轮次（等截止）消耗两步。
function step(room: PartyRoom, clock: { t: number }, rng: () => number) {
  clock.t += 40_000;
  room.advanceTime(clock.t, rng);
}

describe('「存钱罐」完整对局', () => {
  it('砸罐者独吞罐中金币、守护者各得一枚安慰币，他人选择在揭晓前不可见', () => {
    const room = roomWithPlayers();
    start(room);

    expect(gameView(room)).toMatchObject({
      phase: 'choosing',
      round: 1,
      roundsRange: [3, 5],
      pot: 3,
      event: null,
      ownHammers: 2,
      ownChoice: null,
      submittedPlayerIds: [],
      deadlineAt: NOW + 30_000,
      finalSplit: 0,
      winners: [],
    });
    expect(gameView(room).hammers).toEqual({ owner: 2, p2: 2, p3: 2 });
    expect(gameView(room).coins).toEqual({ owner: 0, p2: 0, p3: 0 });

    choose(room, 'owner', 'smash');
    const othersView = gameView(room, 'p2');
    expect(othersView.submittedPlayerIds).toEqual(['owner']);
    expect(othersView.ownChoice).toBeNull();
    expect(othersView.phase).toBe('choosing');
    // 秘密永远不出现在任何人的视图里。
    expect(othersView).not.toHaveProperty('finalRound');
    expect(othersView).not.toHaveProperty('choices');

    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');

    expect(gameView(room).phase).toBe('reveal');
    expect(gameView(room).lastRound).toEqual({
      round: 1,
      event: 'none',
      smashers: ['owner'],
      payouts: { owner: 3, p2: 1, p3: 1 },
      potBefore: 3,
      potAfter: 0,
      blindBonus: 0,
    });
    expect(gameView(room).coins).toEqual({ owner: 3, p2: 1, p3: 1 });
    expect(gameView(room).hammers).toEqual({ owner: 1, p2: 2, p3: 2 });
  });

  it('揭晓前可以反悔改选，结算只看最后一刻的选择', () => {
    const room = roomWithPlayers();
    start(room);

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'owner', 'guard');
    choose(room, 'p3', 'smash');

    expect(gameView(room).lastRound).toMatchObject({ smashers: ['p3'], payouts: { owner: 1, p2: 1, p3: 3 } });
  });

  it('到点未提交的玩家视为守护，不让一个人的掉线卡住整场聚会', () => {
    const room = roomWithPlayers();
    start(room);

    room.advanceTime(NOW + 30_000, rngScript(0.1));

    expect(gameView(room).phase).toBe('reveal');
    expect(gameView(room).lastRound).toEqual({
      round: 1,
      event: 'none',
      smashers: [],
      payouts: {},
      potBefore: 3,
      potAfter: 3,
      blindBonus: 0,
    });
  });

  it('不能在揭晓后继续选择，旁观者和别的游戏的动作都会被拒绝', () => {
    const room = roomWithPlayers();
    start(room);
    room.addPlayer(player('late'), NOW);

    expect(() => choose(room, 'late', 'guard')).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    expect(() => room.act('owner', { type: 'cast-vote', targetId: 'p2' }, { now: NOW, rng: rngScript(0.1) }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');
    expect(() => choose(room, 'owner', 'guard')).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('存钱罐只支持 4、6、8 轮', () => {
    const room = roomWithPlayers();
    for (const rounds of [3, 5, 7]) {
      expect(() => start(room, rounds)).toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
    }
    expect(() => start(room, 6)).not.toThrow();
  });
});

describe('「存钱罐」锤子规则', () => {
  it('锤子按桌型和轮数自动配给：3 人双锤、6 人 6 轮双锤、12 人 8 轮单锤', () => {
    const three = roomWithPlayers();
    start(three, 8);
    expect(gameView(three).ownHammers).toBe(2);

    const six = roomWithPlayers(['owner', 'p2', 'p3', 'p4', 'p5', 'p6']);
    start(six, 6);
    expect(gameView(six).hammers).toEqual({ owner: 2, p2: 2, p3: 2, p4: 2, p5: 2, p6: 2 });

    const twelve = roomWithPlayers(['owner', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12']);
    start(twelve, 8);
    expect(gameView(twelve).ownHammers).toBe(1);
  });

  it('锤子用完后不能再砸，但守护不受影响；无锤者不需要提交', () => {
    const room = roomWithPlayers();
    const clock = { t: NOW };
    start(room);

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');
    step(room, clock, rngScript(0.1));
    expect(gameView(room)).toMatchObject({ round: 2, phase: 'choosing' });

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');
    expect(gameView(room).ownHammers).toBe(0);
    step(room, clock, rngScript(0.1));
    expect(gameView(room)).toMatchObject({ round: 3, phase: 'choosing' });

    expect(() => choose(room, 'owner', 'smash')).toThrowError(expect.objectContaining({ code: 'NO_HAMMER' }));
    choose(room, 'owner', 'guard');
    // 持锤者只剩 p2、p3，他们交完就立即结算。
    choose(room, 'p2', 'guard');
    expect(gameView(room).phase).toBe('choosing');
    choose(room, 'p3', 'guard');
    expect(gameView(room).phase).toBe('reveal');
  });

  it('全员锤子用尽后进入和平快进轮，终局仍平分罐中金币', () => {
    const room = roomWithPlayers();
    const clock = { t: NOW };
    start(room);

    for (const id of ['owner', 'p2', 'p3']) choose(room, id, 'smash');
    step(room, clock, rngScript(0.1));
    for (const id of ['owner', 'p2', 'p3']) choose(room, id, 'smash');

    // 第 3 轮无人有锤：直接进入短暂的和平展示，跳过 30 秒抉择。
    step(room, clock, rngScript(0.1));
    expect(gameView(room)).toMatchObject({ round: 3, phase: 'reveal' });
    expect(gameView(room).lastRound).toEqual({
      round: 3,
      event: 'none',
      smashers: [],
      payouts: {},
      potBefore: 0,
      potAfter: 3,
      blindBonus: 0,
    });

    step(room, clock, rngScript(0.1));
    step(room, clock, rngScript(0.1));

    // 两轮全员互砸各得 2 枚，第 3、4 轮和平攒到 6 枚终局平分：人人 4 枚。
    expect(gameView(room)).toMatchObject({ phase: 'finished', finalSplit: 2 });
    expect(gameView(room).coins).toEqual({ owner: 4, p2: 4, p3: 4 });
    expect(gameView(room).winners).toEqual(['owner', 'p2', 'p3']);
  });
});

describe('「存钱罐」随机落幕', () => {
  // 无人提交、等到截止的完整对局：每轮消耗两步（结算 + 开下一轮）。
  function playGuardedToEnd(room: PartyRoom, rounds: number) {
    const clock = { t: NOW };
    for (let round = 1; round <= rounds; round += 1) {
      step(room, clock, rngScript(0.1));
      step(room, clock, rngScript(0.1));
    }
    return clock;
  }

  it('游戏可能在名义轮数的前一轮突然结束，且落幕轮永远是秘密', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.0, 0.1));

    playGuardedToEnd(room, 3);

    expect(gameView(room)).toMatchObject({ phase: 'finished', round: 3, finalSplit: 3 });
    expect(gameView(room).coins).toEqual({ owner: 3, p2: 3, p3: 3 });
    expect(JSON.stringify(gameView(room, 'p2'))).not.toContain('finalRound');
  });

  it('游戏也可能拖到名义轮数的后一轮才落幕', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.9, 0.1));

    playGuardedToEnd(room, 5);

    expect(gameView(room)).toMatchObject({ phase: 'finished', round: 5, finalSplit: 5 });
    expect(gameView(room).coins).toEqual({ owner: 5, p2: 5, p3: 5 });
  });
});

describe('「存钱罐」天降事件', () => {
  // 第 1 轮全员提前提交守护后，推进一步进入第 2 轮；
  // 事件骰的值由传入脚本的首个值决定（盲罐再加第二个值）。
  function beginSecondRound(room: PartyRoom, eventRoll: number, blindRoll?: number) {
    choose(room, 'owner', 'guard');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');
    const rng = blindRoll === undefined ? rngScript(eventRoll, 0.1) : rngScript(eventRoll, blindRoll, 0.1);
    step(room, { t: NOW }, rng);
  }

  it('金币雨：罐子额外多攒一轮投币的两倍', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.5);

    expect(gameView(room)).toMatchObject({ round: 2, phase: 'choosing', pot: 12, event: 'rain' });
  });

  it('烫手罐：砸罐者只能拿走一半，另一半留在罐里', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.65);

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');

    expect(gameView(room).lastRound).toEqual({
      round: 2,
      event: 'hot',
      smashers: ['owner'],
      payouts: { owner: 3, p2: 1, p3: 1 },
      potBefore: 6,
      potAfter: 3,
      blindBonus: 0,
    });
  });

  it('纸糊罐：暗牌到砸罐瞬间才揭晓，砸了白砸但真罐无损', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.9);

    // 抉择阶段任何人都看不到暗牌事件，包括自己。
    expect(gameView(room).event).toBeNull();
    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');

    expect(gameView(room).lastRound).toEqual({
      round: 2,
      event: 'paper',
      smashers: ['owner'],
      payouts: { p2: 1, p3: 1 },
      potBefore: 6,
      potAfter: 6,
      blindBonus: 0,
    });
    expect(gameView(room).hammers).toEqual({ owner: 1, p2: 2, p3: 2 });
    expect(gameView(room).coins).toEqual({ owner: 0, p2: 1, p3: 1 });
  });

  it('警报轮：独自砸罐触发警报一无所获，罐子平分给其他所有人', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.99);

    expect(gameView(room).event).toBeNull();
    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');

    expect(gameView(room).lastRound).toEqual({
      round: 2,
      event: 'alarm',
      smashers: ['owner'],
      payouts: { p2: 3, p3: 3 },
      potBefore: 6,
      potAfter: 0,
      blindBonus: 0,
    });
  });

  it('警报轮多人同砸不触发警报，按平常规则平分', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.99);

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'smash');
    choose(room, 'p3', 'guard');

    expect(gameView(room).lastRound).toMatchObject({
      event: 'alarm',
      smashers: ['owner', 'p2'],
      payouts: { owner: 3, p2: 3, p3: 1 },
      potAfter: 0,
    });
  });

  it('盲罐轮：抉择阶段看不到罐里金额，轮末揭晓黑暗投币', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.5));
    beginSecondRound(room, 0.8, 0.5);

    const masked = gameView(room);
    expect(masked).toMatchObject({ round: 2, phase: 'choosing', event: 'blind' });
    expect(masked.pot).toBeNull();

    choose(room, 'owner', 'guard');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');

    expect(gameView(room).lastRound).toEqual({
      round: 2,
      event: 'blind',
      smashers: [],
      payouts: {},
      potBefore: 9,
      potAfter: 9,
      blindBonus: 3,
    });
    expect(gameView(room).pot).toBe(9);
  });
});

describe('「存钱罐」收尾与恢复', () => {
  it('只有房主能在结束后再开一局，分数清零且重新随机落幕轮', () => {
    const room = roomWithPlayers();
    start(room, 4, rngScript(0.0, 0.1));

    const clock = { t: NOW };
    for (let round = 1; round <= 3; round += 1) {
      step(room, clock, rngScript(0.1));
      step(room, clock, rngScript(0.1));
    }
    expect(gameView(room).phase).toBe('finished');

    expect(() => room.act('p2', { type: 'play-again' }, { now: NOW, rng: rngScript(0.1) }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    expect(() => room.act('owner', { type: 'play-again' }, { now: NOW, rng: rngScript(0.1) }))
      .not.toThrow();
    expect(gameView(room)).toMatchObject({ phase: 'choosing', round: 1, pot: 3 });
    expect(gameView(room).coins).toEqual({ owner: 0, p2: 0, p3: 0 });
    expect(gameView(room).hammers).toEqual({ owner: 2, p2: 2, p3: 2 });
  });

  it('对局中途的快照可以完整恢复：罐子、锤子、金币与落幕轮都保留', () => {
    const room = roomWithPlayers();
    const clock = { t: NOW };
    start(room, 4, rngScript(0.0, 0.1));

    choose(room, 'owner', 'smash');
    choose(room, 'p2', 'guard');
    choose(room, 'p3', 'guard');
    step(room, clock, rngScript(0.1));
    expect(gameView(room)).toMatchObject({ round: 2, phase: 'choosing' });

    const snapshot = room.snapshot();
    const restored = PartyRoom.restore(snapshot);

    expect(restored.viewFor('p2')).toEqual(room.viewFor('p2'));
    // 恢复后游戏在同一个保密落幕轮（3）收尾：第 2、3 轮守护到终局平分。
    const restoredClock = { t: NOW };
    for (let i = 0; i < 5; i += 1) step(restored, restoredClock, rngScript(0.1));
    const finished = gameView(restored);
    expect(finished).toMatchObject({ phase: 'finished', round: 3 });
    expect(finished.coins).toEqual({ owner: 5, p2: 3, p3: 3 });
    expect(finished.winners).toEqual(['owner']);

    snapshot.game!.version = 999;
    expect(() => PartyRoom.restore(snapshot)).toThrowError(expect.objectContaining({ code: 'SNAPSHOT_INCOMPATIBLE' }));
  });
});
