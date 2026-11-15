import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';

const NOW = 1_000;
const rng = () => 0.2;
const player = (id: string, nickname = id) => ({ id, nickname, avatar: '🐼' });

function makeRoom() {
  const room = PartyRoom.create({ code: 'ABC234', owner: player('owner', '房主'), now: NOW });
  room.addPlayer(player('p2'), NOW);
  room.addPlayer(player('p3'), NOW);
  return room;
}

describe('朋友聚会房间', () => {
  it('创建者自动成为房主，朋友在大厅看到彼此和空游戏状态', () => {
    const room = makeRoom();
    const view = room.viewFor('p2');

    expect(view).toMatchObject({ code: 'ABC234', phase: 'lobby', ownerId: 'owner', game: null });
    expect(view.players.map((person) => person.nickname)).toEqual(['房主', 'p2', 'p3']);
    expect(view.players.every((person) => person.role === 'player' && person.connected)).toBe(true);
  });

  it('昵称去空格且不能重名，房间最多容纳十二人', () => {
    const room = PartyRoom.create({ code: 'ABC234', owner: player('owner', ' 房主 '), now: NOW });
    expect(room.viewFor('owner').players[0]?.nickname).toBe('房主');
    expect(() => room.addPlayer(player('p2', '房主'), NOW)).toThrowError(
      expect.objectContaining({ code: 'NICKNAME_TAKEN' }),
    );

    for (let index = 2; index <= 12; index += 1) room.addPlayer(player(`p${index}`), NOW);
    expect(() => room.addPlayer(player('p13'), NOW)).toThrowError(
      expect.objectContaining({ code: 'ROOM_FULL' }),
    );
  });

  it('人数不足不能开始，非房主也不能替大家开局', () => {
    const room = PartyRoom.create({ code: 'ABC234', owner: player('owner'), now: NOW });
    room.addPlayer(player('p2'), NOW);
    expect(() => room.startGame('owner', 'most-likely', { rounds: 3 }, { now: NOW, rng })).toThrowError(
      expect.objectContaining({ code: 'NOT_ENOUGH_PLAYERS' }),
    );
    room.addPlayer(player('p3'), NOW);
    expect(() => room.startGame('p2', 'most-likely', { rounds: 3 }, { now: NOW, rng })).toThrowError(
      expect.objectContaining({ code: 'OWNER_ONLY' }),
    );
  });

  it('对局中加入的朋友先观战，不会收到参与者的投票权限', () => {
    const room = makeRoom();
    room.startGame('owner', 'most-likely', { rounds: 3 }, { now: NOW, rng });
    room.addPlayer(player('late'), NOW);

    expect(room.viewFor('late').players.find((person) => person.id === 'late')).toMatchObject({ role: 'spectator' });
    expect(() => room.act('late', { type: 'cast-vote', targetId: 'p2' }, { now: NOW, rng })).toThrowError(
      expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }),
    );
  });

  it('短暂断线保留座位和房主身份，刷新后能恢复；主动退出才转让房主', () => {
    const room = makeRoom();
    room.disconnect('owner', NOW + 1);
    expect(room.viewFor('p2').ownerId).toBe('owner');
    expect(room.viewFor('p2').players.find((person) => person.id === 'owner')?.connected).toBe(false);

    room.reconnect('owner', NOW + 2);
    expect(room.viewFor('owner').players.find((person) => person.id === 'owner')?.connected).toBe(true);

    room.leave('owner', NOW + 3);
    expect(room.viewFor('p2').ownerId).toBe('p2');
    expect(room.viewFor('p2').players.some((person) => person.id === 'owner')).toBe(false);
  });
});
