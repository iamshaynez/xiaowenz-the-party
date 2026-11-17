import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import type { GameAction } from '@party/protocol';
import {
  COUNTDOWN_DURATION_MS,
  MONSTER_CAR_PART_CATALOG,
  RACE_DURATION_MS,
  createMonsterCarRacePlan,
  monsterCarGame,
  resolveMonsterCarReaction,
  sampleMonsterCarFrame,
} from '@party/games';
import type { MonsterCarBuild, MonsterCarStimulus, MonsterCarView } from '@party/games';

const NOW = 1_000_000;
const rng = () => 0.42;
const player = (id: string) => ({ id, nickname: id, avatar: '🦊' });

function makeRoom(ids = ['owner', 'p2']) {
  const room = PartyRoom.create({ code: 'CARS24', owner: player(ids[0]!), now: NOW });
  for (const id of ids.slice(1)) room.addPlayer(player(id), NOW);
  return room;
}

function start(room: PartyRoom, random = rng) {
  room.startGame('owner', 'monster-car', { rounds: 1 }, { now: NOW, rng: random });
}

function view(room: PartyRoom, playerId = 'owner') {
  const game = room.viewFor(playerId).game;
  if (!game) throw new Error('游戏尚未开始');
  return game as MonsterCarView;
}

function submit(room: PartyRoom, playerId: string, at = NOW) {
  const build = view(room, playerId).builds[playerId];
  if (!build) throw new Error('缺少默认车辆');
  room.act(playerId, { type: 'build-car', build }, { now: at, rng });
}

function beginRace(room: PartyRoom) {
  for (const id of view(room).participantIds) submit(room, id);
  return view(room);
}

describe('「怪兽汽车」房间与完整对局', () => {
  it('只支持 2–4 人和单次森林旅行，为每位参与者准备完整默认车辆', () => {
    const alone = makeRoom(['owner']);
    expect(() => start(alone)).toThrowError(expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }));

    const crowded = makeRoom(['owner', 'p2', 'p3', 'p4', 'p5']);
    expect(() => start(crowded)).toThrowError(expect.objectContaining({ code: 'ROOM_FULL' }));

    const room = makeRoom(['owner', 'p2', 'p3', 'p4']);
    start(room);
    expect(monsterCarGame).toMatchObject({ id: 'monster-car', version: 1, minPlayers: 2, maxPlayers: 4 });
    expect(view(room)).toMatchObject({ phase: 'building', readyPlayerIds: [], standings: [] });
    expect(Object.keys(view(room).builds)).toEqual(['owner', 'p2', 'p3', 'p4']);
    for (const build of Object.values(view(room).builds)) {
      expect(monsterCarGame.id).toBe('monster-car');
      expect(Object.keys(build)).toEqual(['wheels', 'front', 'rear', 'roof', 'driver']);
    }

    expect(() => room.startGame('owner', 'monster-car', { rounds: 2 }, { now: NOW, rng }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    const fresh = makeRoom();
    expect(() => fresh.startGame('owner', 'monster-car', { rounds: 2 }, { now: NOW, rng }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
  });

  it('全员提交后进入倒计时，30 秒竞演后公布完全一致的随机名次与高光', () => {
    const room = makeRoom(['owner', 'p2', 'p3']);
    start(room);
    submit(room, 'owner');
    submit(room, 'p2');
    expect(view(room)).toMatchObject({ phase: 'building', readyPlayerIds: ['owner', 'p2'] });

    submit(room, 'p3');
    const countdown = view(room);
    expect(countdown.phase).toBe('countdown');
    expect(countdown.raceStartsAt).toBe(NOW + COUNTDOWN_DURATION_MS);
    expect(countdown.plan?.durationMs).toBe(RACE_DURATION_MS);
    expect(countdown.plan?.racers).toHaveLength(3);
    expect(countdown.plan?.events.length).toBeGreaterThanOrEqual(5);

    expect(room.advanceTime(NOW + COUNTDOWN_DURATION_MS - 1, rng)).toBe(false);
    expect(room.advanceTime(NOW + COUNTDOWN_DURATION_MS, rng)).toBe(true);
    expect(view(room).phase).toBe('racing');
    expect(view(room).standings).toEqual([]);

    const raceEndsAt = countdown.raceEndsAt;
    if (!raceEndsAt) throw new Error('缺少终点时间');
    expect(room.advanceTime(raceEndsAt - 1, rng)).toBe(false);
    expect(room.advanceTime(raceEndsAt, rng)).toBe(true);
    const finished = view(room);
    expect(finished.phase).toBe('finished');
    expect(room.viewFor('owner').phase).toBe('finished');
    expect(finished.standings.map((entry) => entry.playerId)).toEqual(finished.plan?.finishOrder);
    expect(finished.standings.map((entry) => entry.place)).toEqual([1, 2, 3]);
    expect(finished.standings.every((entry) => entry.highlight.length > 0)).toBe(true);
    expect(view(room, 'p2').standings).toEqual(finished.standings);
  });

  it('准备前可以修改，进入倒计时后不能改车；旁观者和其他游戏动作被拒绝', () => {
    const room = makeRoom();
    start(room);
    submit(room, 'owner');
    const changed: MonsterCarBuild = {
      wheels: 'spring',
      front: 'duck',
      rear: 'rocket',
      roof: 'umbrella',
      driver: 'frog',
    };
    room.act('owner', { type: 'build-car', build: changed }, { now: NOW, rng });
    expect(view(room).builds.owner).toEqual(changed);
    expect(view(room).readyPlayerIds).toEqual(['owner']);

    room.addPlayer(player('late'), NOW);
    expect(() => room.act('late', { type: 'build-car', build: view(room).builds.owner! }, { now: NOW, rng }))
      .toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    expect(() => room.act('owner', { type: 'choose', choice: 'guard' }, { now: NOW, rng }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));

    submit(room, 'p2');
    expect(() => room.act('owner', { type: 'build-car', build: changed }, { now: NOW, rng }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('即使用户直接调用领域层，非法零件与过期动作也不能绕过校验', () => {
    const state = monsterCarGame.create({ playerIds: ['owner', 'p2'], rounds: 1, now: NOW, rng });
    const invalid = {
      type: 'build-car',
      build: { wheels: 'rocket', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear' },
    } as unknown as GameAction;
    expect(() => monsterCarGame.act(state, {
      playerId: 'owner', isOwner: true, action: invalid, now: NOW, rng,
    })).toThrowError(expect.objectContaining({ code: 'INVALID_BUILD' }));
  });

  it('未准备的玩家在宽松期限后使用当前车辆自动出发，大时间跳跃不会卡阶段', () => {
    const room = makeRoom();
    start(room);
    const deadline = view(room).buildingDeadlineAt;
    room.advanceTime(deadline, rng);
    expect(view(room).phase).toBe('countdown');
    const endsAt = view(room).raceEndsAt;
    if (!endsAt) throw new Error('缺少赛事终点');
    room.advanceTime(endsAt + 100_000, rng);
    expect(view(room).phase).toBe('finished');
    expect(view(room).standings).toHaveLength(2);
  });

  it('只有房主能再开一局，新比赛重新组装且不会复用旧名次', () => {
    const room = makeRoom();
    start(room);
    beginRace(room);
    const endsAt = view(room).raceEndsAt;
    if (!endsAt) throw new Error('缺少赛事终点');
    room.advanceTime(endsAt, rng);
    expect(() => room.act('p2', { type: 'play-again' }, { now: endsAt, rng }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    room.act('owner', { type: 'play-again' }, { now: endsAt, rng });
    expect(view(room)).toMatchObject({ phase: 'building', readyPlayerIds: [], standings: [], plan: null });
    expect(room.viewFor('owner').phase).toBe('playing');
  });

  it('比赛中的 JSON 快照完整恢复，相同计划、车辆和时间边界不会重掷', () => {
    const room = makeRoom(['owner', 'p2', 'p3', 'p4']);
    start(room);
    beginRace(room);
    const before = view(room);
    room.advanceTime(before.raceStartsAt ?? NOW, rng);
    const restored = PartyRoom.restore(JSON.parse(JSON.stringify(room.snapshot())) as ReturnType<PartyRoom['snapshot']>);
    expect(restored.viewFor('p3')).toEqual(room.viewFor('p3'));
    const incompatible = room.snapshot();
    if (!incompatible.game) throw new Error('缺少游戏快照');
    incompatible.game.version = 999;
    expect(() => PartyRoom.restore(incompatible)).toThrowError(expect.objectContaining({ code: 'SNAPSHOT_INCOMPATIBLE' }));
  });
});

describe('「怪兽汽车」确定性赛事与组件协议', () => {
  const builds: Record<string, MonsterCarBuild> = {
    owner: { wheels: 'spring', front: 'duck', rear: 'rocket', roof: 'umbrella', driver: 'frog' },
    p2: { wheels: 'donut', front: 'train', rear: 'bubble', roof: 'propeller', driver: 'bear' },
  };

  it('相同种子与车辆生成相同计划，任意顺序采样都一致', () => {
    const options = { playerIds: ['owner', 'p2'], builds, seed: 123456, now: NOW };
    const first = createMonsterCarRacePlan(options);
    const second = createMonsterCarRacePlan(options);
    expect(first).toEqual(second);
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);

    const times = [0, 7_777, 29_999, 12_345, 4_321, 30_000];
    const forward = times.map((atMs) => sampleMonsterCarFrame(first, atMs));
    const reverse = times.map((atMs) => sampleMonsterCarFrame(second, atMs));
    expect(reverse).toEqual(forward);
    for (const frame of forward) {
      expect(frame.cars).toHaveLength(2);
      for (const car of frame.cars) {
        expect(Number.isFinite(car.progress)).toBe(true);
        expect(car.progress).toBeGreaterThanOrEqual(0);
        expect(car.progress).toBeLessThanOrEqual(1.08);
      }
    }
  });

  it('最终顺序独立于零件，基础里程单调且途中存在领先交换', () => {
    const changedBuilds = {
      owner: builds.p2!,
      p2: builds.owner!,
    };
    const first = createMonsterCarRacePlan({ playerIds: ['owner', 'p2'], builds, seed: 98765, now: NOW });
    const changed = createMonsterCarRacePlan({ playerIds: ['owner', 'p2'], builds: changedBuilds, seed: 98765, now: NOW });
    expect(changed.finishOrder).toEqual(first.finishOrder);
    expect(changed.racers.map((racer) => racer.pace)).toEqual(first.racers.map((racer) => racer.pace));

    for (const racer of first.racers) {
      let previous = 0;
      for (let atMs = 0; atMs <= RACE_DURATION_MS; atMs += 100) {
        const frame = sampleMonsterCarFrame(first, atMs);
        const car = frame.cars.find((entry) => entry.playerId === racer.playerId);
        if (!car) throw new Error('缺少车辆帧');
        expect(car.progress).toBeGreaterThanOrEqual(previous);
        previous = car.progress;
      }
    }
    const leaders = new Set<string>();
    for (let atMs = 0; atMs <= RACE_DURATION_MS; atMs += 250) leaders.add(sampleMonsterCarFrame(first, atMs).leaderId);
    expect(leaders.size).toBeGreaterThan(1);
    expect(first.racers.every((racer) => racer.cues.length >= first.events.length)).toBe(true);
  });

  it('每个零件都属于正确槽位，每种标准刺激都有具体反应或安全回退', () => {
    const stimuli: MonsterCarStimulus[] = ['water', 'impact', 'wind', 'slope'];
    for (const [slot, parts] of Object.entries(MONSTER_CAR_PART_CATALOG)) {
      expect(Object.keys(parts).length).toBeGreaterThanOrEqual(4);
      for (const part of Object.values(parts)) expect(part.slot).toBe(slot);
    }
    for (const build of Object.values(builds)) {
      for (const stimulus of stimuli) {
        const reaction = resolveMonsterCarReaction(build, stimulus);
        expect(reaction.primary.reaction.length).toBeGreaterThan(0);
        expect(reaction.primary.durationMs).toBeGreaterThanOrEqual(500);
        expect(reaction.primary.durationMs).toBeLessThanOrEqual(2_000);
        expect(reaction.secondary.length).toBeGreaterThan(0);
      }
    }
  });

  it('最终名次在不同种子间随机变化，不由玩家数组顺序固定', () => {
    const orders = new Set<string>();
    for (let seed = 1; seed <= 12; seed += 1) {
      const plan = createMonsterCarRacePlan({ playerIds: ['owner', 'p2'], builds, seed, now: NOW });
      orders.add(plan.finishOrder.join(','));
      expect([...plan.finishOrder].sort()).toEqual(['owner', 'p2']);
    }
    expect(orders.size).toBeGreaterThan(1);
  });
});
