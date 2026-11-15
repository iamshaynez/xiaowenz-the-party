import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import type { MostLikelyView } from '@party/games';

const context = { now: 5_000, rng: () => 0.3 };
const player = (id: string) => ({ id, nickname: id, avatar: '🦊' });

describe('房间快照恢复', () => {
  it('恢复后的房间保留玩家、票数、私密投票和版本，能够继续下一轮', () => {
    const room = PartyRoom.create({ code: 'ABC234', owner: player('owner'), now: context.now });
    room.addPlayer(player('p2'), context.now);
    room.addPlayer(player('p3'), context.now);
    room.startGame('owner', 'most-likely', { rounds: 3 }, context);
    room.act('owner', { type: 'cast-vote', targetId: 'p2' }, context);
    room.act('p2', { type: 'cast-vote', targetId: 'owner' }, context);
    room.act('p3', { type: 'cast-vote', targetId: 'p2' }, context);
    const before = room.viewFor('p2');

    const restored = PartyRoom.restore(room.snapshot());
    expect(restored.viewFor('p2')).toEqual(before);
    expect((restored.viewFor('owner').game as MostLikelyView).ownVote).toBe('p2');
    expect((restored.viewFor('p2').game as MostLikelyView).ownVote).toBe('owner');

    restored.act('owner', { type: 'next-round' }, context);
    expect((restored.viewFor('owner').game as MostLikelyView)).toMatchObject({ phase: 'voting', round: 2 });
  });
});
