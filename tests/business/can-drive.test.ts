import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import { CAR_AWARDS, CAR_ENVIRONMENTS, CAR_PARTS, CAN_DRIVE_SLOTS, DEFAULT_CAR_BUILD, GAMES, createCarShowPlan, gameRegistry, sampleCarShowPose } from '@party/games';
import type { CanDriveView } from '@party/games';

const NOW = 10_000;
const BUILD_TIME = 120_000;
const SHOW_TIME = 40_000;
const AWARD_TIME = 7_000;

function rngScript(...values: number[]) {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1] ?? 0.5;
}

function player(id: string) {
  return { id, nickname: id, avatar: '🦊' };
}

function roomWithPlayers(ids = ['owner', 'p2']) {
  const room = PartyRoom.create({ code: 'CAR123', owner: player(ids[0]!), now: NOW });
  for (const id of ids.slice(1)) room.addPlayer(player(id), NOW);
  return room;
}

function start(room: PartyRoom, rng = rngScript(0.42), rounds = 1) {
  room.startGame('owner', 'can-drive', { rounds }, { now: NOW, rng });
}

function view(room: PartyRoom, playerId = 'owner') {
  const game = room.viewFor(playerId).game;
  if (!game) throw new Error('游戏尚未开始');
  return game as CanDriveView;
}

function act(room: PartyRoom, playerId: string, action: Parameters<PartyRoom['act']>[1], now = NOW) {
  room.act(playerId, action, { now, rng: rngScript(0.5) });
}

function submitAll(room: PartyRoom, ids = ['owner', 'p2']) {
  for (const id of ids) act(room, id, { type: 'submit-car' });
}

describe('「这车能开？」内容与注册', () => {
  it('五类各有 8 种零件，每种都有基础行为和至少两个环境响应', () => {
    expect(CAN_DRIVE_SLOTS).toEqual(['driver', 'motion', 'front', 'rear', 'roof']);
    const ids = new Set<string>();
    for (const slot of CAN_DRIVE_SLOTS) {
      const parts = CAR_PARTS[slot];
      expect(parts).toHaveLength(8);
      for (const part of parts) {
        expect(part.slot).toBe(slot);
        expect(part.name.length).toBeGreaterThan(0);
        expect(part.behavior.length).toBeGreaterThan(0);
        expect(part.tags.length).toBeGreaterThan(0);
        expect(part.reactions.length).toBeGreaterThanOrEqual(2);
        expect(ids.has(part.id)).toBe(false);
        ids.add(part.id);
      }
    }
    expect(ids.size).toBe(40);
    expect(CAR_ENVIRONMENTS.map((environment) => environment.id)).toEqual([
      'washboard', 'mud', 'water', 'ice', 'crosswind', 'rain', 'low-tunnel', 'dark-cave', 'soft-blocks', 'jump',
    ]);
    expect(CAR_AWARDS.length).toBeGreaterThanOrEqual(12);
  });

  it('全部 40 种零件都能生成可完成、数值有效的 40 秒展示', () => {
    for (const slot of CAN_DRIVE_SLOTS) {
      for (const part of CAR_PARTS[slot]) {
        const build = { ...DEFAULT_CAR_BUILD, [slot]: part.id };
        const plan = createCarShowPlan(build, 123_456);
        expect(plan.stats.finished).toBe(true);
        expect(plan.events.length).toBeGreaterThan(0);
        for (let atMs = 0; atMs <= plan.durationMs; atMs += 1_000) {
          const pose = sampleCarShowPose(plan, atMs);
          expect(Number.isFinite(pose.heightM)).toBe(true);
          expect(Number.isFinite(pose.speedKph)).toBe(true);
          expect(Number.isFinite(pose.pitch)).toBe(true);
          expect(Number.isFinite(pose.roll)).toBe(true);
        }
      }
    }
  });

  it('大厅和配置来自同一套游戏注册表', () => {
    expect(gameRegistry.has('can-drive')).toBe(true);
    expect(GAMES.map((game) => game.id)).toEqual([...gameRegistry.keys()]);
    expect(GAMES.find((game) => game.id === 'can-drive')).toMatchObject({ minPlayers: 2, maxPlayers: 6, roundsOptions: [1] });
  });
});

describe('「这车能开？」组装与开局', () => {
  it('两人可以开局，一人不足，七人不能超过车辆展示上限', () => {
    const two = roomWithPlayers();
    start(two);
    expect(view(two)).toMatchObject({ phase: 'building', totalCars: 2, buildDeadlineAt: NOW + BUILD_TIME });

    const one = roomWithPlayers(['owner']);
    expect(() => start(one)).toThrowError(expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }));

    const seven = roomWithPlayers(['owner', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
    expect(() => start(seven)).toThrowError(expect.objectContaining({ code: 'ROOM_FULL' }));

    const six = roomWithPlayers(['owner', 'p2', 'p3', 'p4', 'p5', 'p6']);
    start(six);
    expect(view(six).totalCars).toBe(6);
  });

  it('默认车辆完整，改装只发给本人；准备后继续改装会取消准备', () => {
    const room = roomWithPlayers();
    start(room);
    expect(view(room).ownBuild).toEqual({
      driver: 'cat', motion: 'square-wheels', front: 'pillow', rear: 'rocket', roof: 'umbrella',
    });

    act(room, 'owner', { type: 'select-car-part', slot: 'driver', partId: 'ghost' });
    act(room, 'owner', { type: 'submit-car' });
    expect(view(room).ownReady).toBe(true);
    expect(view(room, 'p2').readyPlayerIds).toEqual(['owner']);
    expect(JSON.stringify(view(room, 'p2'))).not.toContain('ghost');

    act(room, 'owner', { type: 'select-car-part', slot: 'roof', partId: 'flowerpot' });
    expect(view(room)).toMatchObject({ ownReady: false, ownBuild: { driver: 'ghost', roof: 'flowerpot' } });
    expect(view(room).readyPlayerIds).toEqual([]);
  });

  it('非法零件、旁观者、跨游戏动作和展示后的改装都会被拒绝', () => {
    const room = roomWithPlayers();
    start(room);
    room.addPlayer(player('late'), NOW);

    expect(() => act(room, 'owner', { type: 'select-car-part', slot: 'driver', partId: 'rocket' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PART' }));
    expect(() => act(room, 'owner', { type: 'select-car-part', slot: 'driver', partId: 'missing' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PART' }));
    expect(() => act(room, 'late', { type: 'submit-car' }))
      .toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));
    expect(() => act(room, 'owner', { type: 'cast-vote', targetId: 'p2' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_ACTION' }));

    submitAll(room);
    expect(view(room).phase).toBe('presenting');
    expect(() => act(room, 'owner', { type: 'select-car-part', slot: 'driver', partId: 'cat' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('只接受单次展示配置', () => {
    const room = roomWithPlayers();
    expect(() => start(room, rngScript(0.2), 2)).toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
  });
});

describe('「这车能开？」权威展示与颁奖', () => {
  it('全员准备后冻结车辆，首车 40 秒且未来计划和奖项不泄露', () => {
    const room = roomWithPlayers();
    start(room);
    submitAll(room);

    const current = view(room).current;
    expect(current).toMatchObject({
      id: '1:test:0', kind: 'test', index: 0, playerId: 'owner', startedAt: NOW, endsAt: NOW + SHOW_TIME, award: null,
    });
    expect(current?.show.durationMs).toBe(SHOW_TIME);
    expect(current?.show.environments).toHaveLength(5);
    expect(current?.show.environments.at(-1)?.id).toBe('jump');
    expect(current?.show.highlight.endMs).toBeGreaterThan(current?.show.highlight.startMs ?? 0);
    expect(view(room).awards).toEqual([]);
    expect(view(room)).not.toHaveProperty('plans');
    expect(current?.show).not.toHaveProperty('stats');
    expect(current?.show).not.toHaveProperty('awardId');
  });

  it('相同种子生成相同计划，完整环境池都能被选中', () => {
    const first = roomWithPlayers();
    const second = roomWithPlayers();
    start(first, rngScript(0.123));
    start(second, rngScript(0.123));
    submitAll(first);
    submitAll(second);
    expect(view(first).current?.show).toEqual(view(second).current?.show);

    const seen = new Set<string>();
    for (let index = 0; index < 60; index += 1) {
      const room = roomWithPlayers();
      start(room, rngScript(index / 60));
      submitAll(room);
      for (const environment of view(room).current?.show.environments ?? []) seen.add(environment.id);
    }
    expect(seen).toEqual(new Set(CAR_ENVIRONMENTS.map((environment) => environment.id)));
  });

  it('截止时自动使用当前车辆，断线玩家不会卡住展示', () => {
    const room = roomWithPlayers();
    start(room);
    room.disconnect('p2', NOW + 1);
    room.advanceTime(NOW + BUILD_TIME, rngScript(0.9));

    expect(view(room).phase).toBe('presenting');
    expect(view(room).current).toMatchObject({ kind: 'test', index: 0, startedAt: NOW + BUILD_TIME });
    expect(view(room, 'p2').ownReady).toBe(false);
  });

  it('两辆测试后逐车颁奖，每车一个奖，最后房间与游戏一起结束', () => {
    const room = roomWithPlayers();
    start(room);
    submitAll(room);

    room.advanceTime(NOW + SHOW_TIME, rngScript(0.1));
    expect(view(room).current).toMatchObject({ kind: 'test', index: 1, playerId: 'p2' });

    room.advanceTime(NOW + SHOW_TIME * 2, rngScript(0.1));
    expect(view(room).current).toMatchObject({ kind: 'award', index: 0, playerId: 'owner' });
    expect(view(room).current?.award?.name.length).toBeGreaterThan(0);
    expect(view(room).awards).toHaveLength(1);

    room.advanceTime(NOW + SHOW_TIME * 2 + AWARD_TIME, rngScript(0.1));
    expect(view(room).current).toMatchObject({ kind: 'award', index: 1, playerId: 'p2' });
    expect(view(room).awards).toHaveLength(2);

    room.advanceTime(NOW + SHOW_TIME * 2 + AWARD_TIME * 2, rngScript(0.1));
    expect(view(room)).toMatchObject({ phase: 'finished', current: null });
    expect(view(room).finalCars).toHaveLength(2);
    expect(new Set(view(room).awards.map((award) => award.awardId)).size).toBe(2);
    expect(room.viewFor('owner').phase).toBe('finished');
  });

  it('一次时间跳跃可以跨越多辆展示和颁奖，不错过最终状态', () => {
    const room = roomWithPlayers(['owner', 'p2', 'p3']);
    start(room);
    submitAll(room, ['owner', 'p2', 'p3']);

    room.advanceTime(NOW + SHOW_TIME * 3 + AWARD_TIME * 3 + 1, rngScript(0.1));
    expect(view(room).phase).toBe('finished');
    expect(view(room).awards).toHaveLength(3);
    expect(view(room).finalCars.map((car) => car.playerId)).toEqual(['owner', 'p2', 'p3']);
    expect(room.advanceTime(NOW + SHOW_TIME * 4 + AWARD_TIME * 4, rngScript(0.1))).toBe(false);
  });

  it('快照恢复保留当前展示和已揭晓奖项，之后可以继续推进', () => {
    const room = roomWithPlayers();
    start(room);
    submitAll(room);
    room.advanceTime(NOW + SHOW_TIME * 2, rngScript(0.1));

    const restored = PartyRoom.restore(JSON.parse(JSON.stringify(room.snapshot())));
    expect(view(restored).current).toEqual(view(room).current);
    expect(view(restored).awards).toEqual(view(room).awards);

    restored.advanceTime(NOW + SHOW_TIME * 2 + AWARD_TIME * 2, rngScript(0.1));
    expect(view(restored).phase).toBe('finished');
    expect(restored.viewFor('owner').phase).toBe('finished');
  });

  it('非房主不能重开；房主重开保留车辆并回到组装阶段', () => {
    const room = roomWithPlayers();
    start(room);
    act(room, 'owner', { type: 'select-car-part', slot: 'driver', partId: 'robot' });
    submitAll(room);
    room.advanceTime(NOW + SHOW_TIME * 2 + AWARD_TIME * 2, rngScript(0.1));

    expect(() => act(room, 'p2', { type: 'play-again' }))
      .toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    act(room, 'owner', { type: 'play-again' });
    expect(view(room)).toMatchObject({ phase: 'building', round: 2, current: null });
    expect(view(room).ownBuild?.driver).toBe('robot');
    expect(view(room).awards).toEqual([]);
    expect(room.viewFor('owner').phase).toBe('playing');
  });
});
