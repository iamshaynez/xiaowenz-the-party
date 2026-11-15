import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';

const context = { now: 1_000, rng: () => 0.5 };
const player = (id: string, nickname = id, avatar = '🦊') => ({ id, nickname, avatar });

function party() {
  const room = PartyRoom.create({ code: 'ABC234', owner: player('owner'), now: context.now });
  room.addPlayer(player('p2'), context.now);
  room.addPlayer(player('p3'), context.now);
  return room;
}

describe('规则与快照防御边界', () => {
  it('非法玩家资料、重复玩家编号和非法轮数都被拒绝', () => {
    const room = PartyRoom.create({ code: 'ABC234', owner: player('owner'), now: context.now });
    expect(() => room.addPlayer(player('empty', '   '), context.now)).toThrowError(expect.objectContaining({ code: 'INVALID_NICKNAME' }));
    expect(() => room.addPlayer(player('avatar', '头像', 'not-an-avatar'), context.now)).toThrowError(expect.objectContaining({ code: 'INVALID_AVATAR' }));
    expect(() => room.addPlayer(player('owner', '另一个'), context.now)).toThrowError(expect.objectContaining({ code: 'PLAYER_EXISTS' }));
    expect(() => room.startGame('owner', 'most-likely', { rounds: 0 }, context)).toThrowError(expect.objectContaining({ code: 'INVALID_ROUNDS' }));
  });

  it('未知游戏、重复开局和不合时宜的再来一局不能污染状态', () => {
    const room = party();
    expect(() => room.startGame('owner', 'unknown', { rounds: 3 }, context)).toThrowError(expect.objectContaining({ code: 'GAME_NOT_FOUND' }));
    expect(() => room.act('owner', { type: 'play-again' }, context)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    room.startGame('owner', 'most-likely', { rounds: 3 }, context);
    expect(() => room.startGame('owner', 'most-likely', { rounds: 3 }, context)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
    expect(() => room.act('p2', { type: 'play-again' }, context)).toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    expect(() => room.act('owner', { type: 'play-again' }, context)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('重复连接事件幂等，不存在的玩家不能操作', () => {
    const room = party();
    const version = room.viewFor('owner').version;
    room.disconnect('owner', context.now);
    room.disconnect('owner', context.now);
    expect(room.viewFor('owner').version).toBe(version + 1);
    room.reconnect('owner', context.now);
    room.reconnect('owner', context.now);
    expect(room.viewFor('owner').version).toBe(version + 2);
    expect(() => room.leave('stranger', context.now)).toThrowError(expect.objectContaining({ code: 'PLAYER_NOT_FOUND' }));
    expect(() => room.viewFor('stranger')).toThrowError(expect.objectContaining({ code: 'PLAYER_NOT_FOUND' }));
  });

  it('不同版本的游戏快照不能静默加载', () => {
    const room = party();
    room.startGame('owner', 'most-likely', { rounds: 3 }, context);
    const snapshot = room.snapshot();
    snapshot.game!.version = 999;
    expect(() => PartyRoom.restore(snapshot)).toThrowError(expect.objectContaining({ code: 'SNAPSHOT_INCOMPATIBLE' }));
  });
});
