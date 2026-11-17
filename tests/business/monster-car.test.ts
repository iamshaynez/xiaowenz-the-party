import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import {
  MONSTER_CAR_PART_IDS,
  MONSTER_CAR_SLOTS,
  monsterCarBuildSchema,
} from '@party/protocol';
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
const CUSTOM_BUILDS: Record<string, MonsterCarBuild> = {
  owner: { wheels: 'banana', front: 'shark', rear: 'washing-machine', roof: 'teapot', driver: 'robot' },
  p2: { wheels: 'duck-float', front: 'piano', rear: 'snail', roof: 'whale', driver: 'lion' },
  p3: { wheels: 'square', front: 'vacuum', rear: 'campfire', roof: 'birdcage', driver: 'penguin' },
  p4: { wheels: 'bubble-tea', front: 'ice-cream', rear: 'jackbox', roof: 'cactus', driver: 'ghost' },
};

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

  it('只有房主能再开一局，保留所有参与者的自定义车辆并重置赛事与随机种子', () => {
    const room = makeRoom(['owner', 'p2', 'p3', 'p4']);
    start(room);
    const initialBuilds = view(room).builds;
    for (const [playerId, build] of Object.entries(CUSTOM_BUILDS)) {
      expect(build).not.toEqual(initialBuilds[playerId]);
      room.act(playerId, { type: 'build-car', build }, { now: NOW, rng });
    }
    const firstPlan = view(room).plan;
    if (!firstPlan) throw new Error('缺少首局赛事计划');
    const endsAt = view(room).raceEndsAt;
    if (!endsAt) throw new Error('缺少赛事终点');
    room.advanceTime(endsAt, rng);
    expect(view(room).standings).toHaveLength(4);
    expect(() => room.act('p2', { type: 'play-again' }, { now: endsAt, rng }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));

    const replayAt = endsAt + 5_000;
    room.act('owner', { type: 'play-again' }, { now: replayAt, rng: () => 0.73 });
    expect(view(room)).toMatchObject({
      phase: 'building',
      participantIds: ['owner', 'p2', 'p3', 'p4'],
      builds: CUSTOM_BUILDS,
      readyPlayerIds: [],
      buildingDeadlineAt: replayAt + 120_000,
      raceStartsAt: null,
      raceEndsAt: null,
      standings: [],
      plan: null,
    });
    expect(room.viewFor('owner').phase).toBe('playing');
    for (const playerId of view(room).participantIds) {
      expect(view(room, playerId).builds[playerId]).toEqual(CUSTOM_BUILDS[playerId]);
    }

    for (const playerId of view(room).participantIds) submit(room, playerId, replayAt);
    expect(view(room).plan?.seed).toBe(Math.floor(0.73 * 4_294_967_296));
    expect(view(room).plan?.seed).not.toBe(firstPlan.seed);
  });

  it('版本 1 的已结束快照恢复后，再来一局仍保留已提交车辆', () => {
    const room = makeRoom(['owner', 'p2', 'p3']);
    start(room);
    for (const playerId of view(room).participantIds) {
      room.act(playerId, { type: 'build-car', build: CUSTOM_BUILDS[playerId]! }, { now: NOW, rng });
    }
    const endsAt = view(room).raceEndsAt;
    if (!endsAt) throw new Error('缺少赛事终点');
    room.advanceTime(endsAt, rng);
    const submittedBuilds = view(room).builds;
    const snapshot = JSON.parse(JSON.stringify(room.snapshot())) as ReturnType<PartyRoom['snapshot']>;
    expect(snapshot.game).toMatchObject({ id: 'monster-car', version: 1 });

    const restored = PartyRoom.restore(snapshot);
    expect(view(restored).phase).toBe('finished');
    restored.act('owner', { type: 'play-again' }, { now: endsAt + 2_500, rng: () => 0.17 });
    expect(view(restored)).toMatchObject({
      phase: 'building',
      builds: submittedBuilds,
      readyPlayerIds: [],
      raceStartsAt: null,
      raceEndsAt: null,
      plan: null,
      standings: [],
    });
    expect(view(restored).builds).toEqual({
      owner: CUSTOM_BUILDS.owner,
      p2: CUSTOM_BUILDS.p2,
      p3: CUSTOM_BUILDS.p3,
    });
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

  it('固定种子的道路、名次与配速保持 golden 回归，避免展示层改动赛事随机序列', () => {
    const plan = createMonsterCarRacePlan({ playerIds: ['owner', 'p2'], builds, seed: 123456, now: NOW });
    expect(plan.events).toEqual([
      { id: 'forest-event-1', kind: 'log', stimulus: 'impact', progress: 0.15, variant: 2 },
      { id: 'forest-event-2', kind: 'hill', stimulus: 'slope', progress: 0.3, variant: 0 },
      { id: 'forest-event-3', kind: 'puddle', stimulus: 'water', progress: 0.46, variant: 0 },
      { id: 'forest-event-4', kind: 'gust', stimulus: 'wind', progress: 0.62, variant: 1 },
      { id: 'forest-event-5', kind: 'puddle', stimulus: 'water', progress: 0.78, variant: 1 },
      { id: 'forest-event-6', kind: 'log', stimulus: 'impact', progress: 0.88, variant: 0 },
    ]);
    expect(plan.finishOrder).toEqual(['p2', 'owner']);
    expect(plan.racers.map(({ playerId, pace, finishAtMs }) => ({ playerId, pace, finishAtMs }))).toEqual([
      {
        playerId: 'owner',
        finishAtMs: 28880,
        pace: [
          { atMs: 0, progress: 0 },
          { atMs: 4956.004715508223, progress: 0.16666666666666666 },
          { atMs: 9839.505524488912, progress: 0.3333333333333333 },
          { atMs: 14968.18348477882, progress: 0.5 },
          { atMs: 19956.36249078643, progress: 0.6666666666666666 },
          { atMs: 24868.155447923753, progress: 0.8333333333333334 },
          { atMs: 28880, progress: 1 },
        ],
      },
      {
        playerId: 'p2',
        finishAtMs: 28600,
        pace: [
          { atMs: 0, progress: 0 },
          { atMs: 4398.469885491905, progress: 0.16666666666666666 },
          { atMs: 9891.757554739515, progress: 0.3333333333333333 },
          { atMs: 14633.00546606387, progress: 0.5 },
          { atMs: 19127.524091566964, progress: 0.6666666666666666 },
          { atMs: 23677.46221569235, progress: 0.8333333333333334 },
          { atMs: 28600, progress: 1 },
        ],
      },
    ]);
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

    const expandedBuilds: Record<string, MonsterCarBuild> = {
      owner: { wheels: 'banana', front: 'shark', rear: 'washing-machine', roof: 'teapot', driver: 'robot' },
      p2: { wheels: 'duck-float', front: 'piano', rear: 'snail', roof: 'whale', driver: 'lion' },
    };
    const expanded = createMonsterCarRacePlan({ playerIds: ['owner', 'p2'], builds: expandedBuilds, seed: 98765, now: NOW });
    expect(expanded.events).toEqual(first.events);
    expect(expanded.finishOrder).toEqual(first.finishOrder);
    expect(expanded.racers.map((racer) => racer.pace)).toEqual(first.racers.map((racer) => racer.pace));
    expect(expanded.racers.map((racer) => racer.finishAtMs)).toEqual(first.racers.map((racer) => racer.finishAtMs));

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

  it('协议与目录逐槽保持八款零件的精确一致，并保留全部旧 ID 顺序', () => {
    expect(MONSTER_CAR_PART_IDS).toEqual({
      wheels: ['classic', 'donut', 'spring', 'balloon', 'banana', 'square', 'bubble-tea', 'duck-float'],
      front: ['smile', 'duck', 'train', 'scoop', 'shark', 'vacuum', 'ice-cream', 'piano'],
      rear: ['trunk', 'rocket', 'bubble', 'tail', 'washing-machine', 'campfire', 'jackbox', 'snail'],
      roof: ['mushroom', 'umbrella', 'propeller', 'antenna', 'teapot', 'birdcage', 'cactus', 'whale'],
      driver: ['bear', 'frog', 'duck', 'alien', 'robot', 'penguin', 'ghost', 'lion'],
    });
    expect(MONSTER_CAR_SLOTS).toEqual(['wheels', 'front', 'rear', 'roof', 'driver']);

    const baseBuild: MonsterCarBuild = {
      wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
    };
    for (const slot of MONSTER_CAR_SLOTS) {
      const partIds = MONSTER_CAR_PART_IDS[slot];
      expect(partIds).toHaveLength(8);
      expect(Object.keys(MONSTER_CAR_PART_CATALOG[slot])).toEqual([...partIds]);
      for (const partId of partIds) {
        const parsed = monsterCarBuildSchema.parse({ ...baseBuild, [slot]: partId });
        expect(parsed[slot]).toBe(partId);
      }
    }
    expect(monsterCarBuildSchema.safeParse({ ...baseBuild, wheels: 'hover' }).success).toBe(false);
  });

  it('校验全部目录元数据与刺激响应，每个声明的响应都能成为主反应或互补反应', () => {
    const stimuli: MonsterCarStimulus[] = ['water', 'impact', 'wind', 'slope'];
    const idleValues = ['none', 'spin', 'bounce', 'sway', 'blink'];
    const newReactionIds = new Set<string>();
    const newHighlights = new Set<string>();
    const baseBuild: MonsterCarBuild = {
      wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
    };

    for (const slot of MONSTER_CAR_SLOTS) {
      for (const [index, partId] of MONSTER_CAR_PART_IDS[slot].entries()) {
        const part = MONSTER_CAR_PART_CATALOG[slot][partId];
        if (!part) throw new Error(`目录缺少零件：${slot}/${partId}`);
        expect(part.slot).toBe(slot);
        expect(part.label).toMatch(/[㐀-鿿]/u);
        expect(part.emoji.trim()).not.toBe('');
        expect(idleValues).toContain(part.idle);
        const build = monsterCarBuildSchema.parse({ ...baseBuild, [slot]: partId });
        let responseCount = 0;

        for (const stimulus of stimuli) {
          const response = part.responses[stimulus];
          const resolved = resolveMonsterCarReaction(build, stimulus);
          expect(resolved.primary.reaction.length).toBeGreaterThan(0);
          expect(resolved.primary.durationMs).toBeGreaterThanOrEqual(500);
          expect(resolved.primary.durationMs).toBeLessThanOrEqual(2_000);
          expect(resolved.secondary.length).toBeGreaterThan(0);
          if (!response) continue;
          responseCount += 1;
          expect(response.reaction).toMatch(/^[a-z][a-z0-9-]*$/);
          expect(response.highlight).toMatch(/[㐀-鿿]/u);
          expect(response.durationMs).toBeGreaterThanOrEqual(500);
          expect(response.durationMs).toBeLessThanOrEqual(2_000);
          expect(Number.isFinite(response.intensity)).toBe(true);
          expect(response.intensity).toBeGreaterThan(0);
          expect(response.intensity).toBeLessThanOrEqual(2);
          expect([resolved.primary, ...resolved.secondary]).toContainEqual(expect.objectContaining({
            partId,
            slot,
            reaction: response.reaction,
            highlight: response.highlight,
          }));

          if (index >= 4) {
            expect(newReactionIds.has(response.reaction)).toBe(false);
            expect(newHighlights.has(response.highlight)).toBe(false);
            newReactionIds.add(response.reaction);
            newHighlights.add(response.highlight);
          }
        }
        if (index >= 4) expect(responseCount).toBeGreaterThan(0);
      }
    }
  });

  it('把非主零件的专属响应加入 secondary，同时保留司机与车身回退', () => {
    const complementary = resolveMonsterCarReaction(builds.p2!, 'water');
    expect(complementary.primary).toMatchObject({ partId: 'donut', reaction: 'donut-splash' });
    expect(complementary.secondary).toEqual([
      expect.objectContaining({
        partId: 'bubble', slot: 'rear', reaction: 'bubble-foam', durationMs: 1_650, intensity: 1.2,
      }),
      expect.objectContaining({
        partId: 'bear', slot: 'driver', reaction: 'driver-water', durationMs: 1_100, intensity: 0.55,
      }),
    ]);

    const driverPrimary = resolveMonsterCarReaction({
      wheels: 'classic', front: 'smile', rear: 'bubble', roof: 'antenna', driver: 'frog',
    }, 'water');
    expect(driverPrimary.primary).toMatchObject({ partId: 'frog', reaction: 'frog-croak' });
    expect(driverPrimary.secondary).toEqual([
      expect.objectContaining({ partId: 'bubble', slot: 'rear', reaction: 'bubble-foam' }),
      expect.objectContaining({
        partId: 'chassis', slot: 'chassis', reaction: 'chassis-wiggle', durationMs: 900, intensity: 0.45,
      }),
    ]);

    const generic = resolveMonsterCarReaction({
      wheels: 'classic', front: 'smile', rear: 'trunk', roof: 'mushroom', driver: 'bear',
    }, 'wind');
    expect(generic.primary).toMatchObject({ partId: 'chassis', reaction: 'classic-wind' });
    expect(generic.secondary).toEqual([
      expect.objectContaining({ partId: 'bear', reaction: 'driver-wind', highlight: '最佳乘客表情' }),
    ]);
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
