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

// 三人快速打完一局「谁最可能」到达 finished：每轮全员投票立即揭晓，房主推进。
function finishedParty() {
  const room = party();
  room.startGame('owner', 'most-likely', { rounds: 3 }, context);
  for (let round = 1; round <= 3; round += 1) {
    room.act('owner', { type: 'cast-vote', targetId: 'p2' }, context);
    room.act('p2', { type: 'cast-vote', targetId: 'p3' }, context);
    room.act('p3', { type: 'cast-vote', targetId: 'owner' }, context);
    room.act('owner', { type: 'next-round' }, context);
  }
  return room;
}

describe('结束本局回大厅', () => {
  it('房主在结算后结束本局：房间回到大厅，游戏清空，旁观者随之转回参与者', () => {
    const room = finishedParty();
    room.addPlayer(player('late'), context.now);
    expect(room.viewFor('late').players.find((person) => person.id === 'late')).toMatchObject({ role: 'spectator' });

    const version = room.viewFor('owner').version;
    room.endGame('owner', context.now + 1);

    const view = room.viewFor('late');
    expect(view).toMatchObject({ phase: 'lobby', game: null, ownerId: 'owner' });
    expect(view.version).toBe(version + 1);
    expect(view.players.every((person) => person.role === 'player')).toBe(true);
  });

  it('回到大厅后可以换一个游戏重新开局', () => {
    const room = finishedParty();
    room.endGame('owner', context.now + 1);

    room.startGame('owner', 'piggy-bank', { rounds: 4 }, context);
    const view = room.viewFor('owner');
    expect(view.phase).toBe('playing');
    expect(view.game).toMatchObject({ id: 'piggy-bank' });
  });

  it('非房主不能结束本局；没有开局和进行中的房间也不能回大厅', () => {
    const idleRoom = party();
    expect(() => idleRoom.endGame('owner', context.now)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));

    const playingRoom = party();
    playingRoom.startGame('owner', 'most-likely', { rounds: 3 }, context);
    expect(() => playingRoom.endGame('owner', context.now)).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));

    const finishedRoom = finishedParty();
    expect(() => finishedRoom.endGame('p2', context.now)).toThrowError(expect.objectContaining({ code: 'OWNER_ONLY' }));
    expect(finishedRoom.viewFor('owner').phase).toBe('finished');
  });

  it('回大厅后的房间快照恢复仍然是大厅，参与者角色保留', () => {
    const room = finishedParty();
    room.addPlayer(player('late'), context.now);
    room.endGame('owner', context.now + 1);

    const restored = PartyRoom.restore(room.snapshot());
    const view = restored.viewFor('owner');
    expect(view).toMatchObject({ phase: 'lobby', game: null });
    expect(view.players.every((person) => person.role === 'player')).toBe(true);
  });
});
