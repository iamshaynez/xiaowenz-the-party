import { describe, expect, it } from 'vitest';
import { PartyRoom } from '@party/room';
import type { MostLikelyView } from '@party/games';

const NOW = 1_000;
const rng = () => 0.42;

function player(id: string, nickname = id) {
  return { id, nickname, avatar: '🦊' };
}

function roomWithPlayers(ids = ['owner', 'p2', 'p3']) {
  const room = PartyRoom.create({ code: 'PARTY7', owner: player(ids[0]!, '房主'), now: NOW });
  for (const id of ids.slice(1)) room.addPlayer(player(id), NOW);
  return room;
}

function start(room: PartyRoom, rounds = 3) {
  room.startGame('owner', 'most-likely', { rounds }, { now: NOW, rng });
}

function gameView(room: PartyRoom, playerId = 'owner') {
  const game = room.viewFor(playerId).game;
  if (!game) throw new Error('游戏尚未开始');
  return game as MostLikelyView;
}

function vote(room: PartyRoom, voter: string, target: string) {
  room.act(voter, { type: 'cast-vote', targetId: target }, { now: NOW, rng });
}

function finishRound(room: PartyRoom, target = 'p2') {
  vote(room, 'owner', target);
  if (gameView(room).phase === 'voting') vote(room, 'p2', target === 'p2' ? 'owner' : target);
  if (gameView(room).phase === 'voting') vote(room, 'p3', target === 'p3' ? 'owner' : target);
}

describe('「谁最可能」完整对局', () => {
  it('朋友投票前看不到彼此选择，全员提交后立即揭晓并给最高票玩家计分', () => {
    const room = roomWithPlayers();
    start(room);

    expect(gameView(room)).toMatchObject({
      phase: 'voting',
      round: 1,
      totalRounds: 3,
      ownVote: null,
      deadlineAt: NOW + 60_000,
    });
    expect(gameView(room).prompt).toBeTypeOf('string');

    vote(room, 'owner', 'p2');
    expect(gameView(room, 'p2').ownVote).toBeNull();
    expect(gameView(room, 'p2').submittedPlayerIds).toEqual(['owner']);
    expect(gameView(room, 'p2').results).toBeNull();

    vote(room, 'p2', 'owner');
    vote(room, 'p3', 'p2');

    expect(gameView(room, 'p3')).toMatchObject({ phase: 'results', ownVote: 'p2' });
    expect(gameView(room).results).toMatchObject({
      counts: { owner: 1, p2: 2, p3: 0 },
      winners: ['p2'],
      votes: { owner: 'p2', p2: 'owner', p3: 'p2' },
    });
    expect(gameView(room).scores).toEqual({ owner: 0, p2: 1, p3: 0 });
  });

  it('平票时并列玩家都得一分', () => {
    const room = roomWithPlayers();
    start(room);

    vote(room, 'owner', 'p2');
    vote(room, 'p2', 'p3');
    vote(room, 'p3', 'owner');

    expect(gameView(room).results?.winners).toEqual(['owner', 'p2', 'p3']);
    expect(gameView(room).scores).toEqual({ owner: 1, p2: 1, p3: 1 });
  });

  it('不能投自己、不能投旁观者，也不能在揭晓后改票', () => {
    const room = roomWithPlayers();
    start(room);
    room.addPlayer(player('late'), NOW);

    expect(() => vote(room, 'owner', 'owner')).toThrowError(expect.objectContaining({ code: 'SELF_VOTE' }));
    expect(() => vote(room, 'owner', 'late')).toThrowError(expect.objectContaining({ code: 'INVALID_TARGET' }));
    expect(() => vote(room, 'late', 'p2')).toThrowError(expect.objectContaining({ code: 'NOT_A_PARTICIPANT' }));

    finishRound(room);
    expect(() => vote(room, 'owner', 'p3')).toThrowError(expect.objectContaining({ code: 'INVALID_PHASE' }));
  });

  it('只有房主能推进下一轮，最终轮之后进入总结，再来一局会清零分数', () => {
    const room = roomWithPlayers();
    start(room, 2);
    finishRound(room);

    expect(() => room.act('p2', { type: 'next-round' }, { now: NOW, rng })).toThrowError(
      expect.objectContaining({ code: 'OWNER_ONLY' }),
    );

    room.act('owner', { type: 'next-round' }, { now: NOW, rng });
    expect(gameView(room)).toMatchObject({ phase: 'voting', round: 2 });
    finishRound(room, 'p3');
    room.act('owner', { type: 'next-round' }, { now: NOW, rng });
    expect(gameView(room).phase).toBe('finished');
    expect(gameView(room).winners).toEqual(['p2', 'p3']);

    room.act('owner', { type: 'play-again' }, { now: NOW, rng });
    expect(gameView(room)).toMatchObject({ phase: 'voting', round: 1 });
    expect(gameView(room).scores).toEqual({ owner: 0, p2: 0, p3: 0 });
  });

  it('没人投票时也会按时揭晓，避免一个人的掉线卡住整场聚会', () => {
    const room = roomWithPlayers();
    start(room);

    room.advanceTime(NOW + 59_999);
    expect(gameView(room).phase).toBe('voting');
    room.advanceTime(NOW + 60_000);
    expect(gameView(room)).toMatchObject({ phase: 'results', results: { winners: [] } });
  });

  it('一局中的题目不重复', () => {
    const prompts = new Set<string>();
    const room = roomWithPlayers();
    start(room, 8);

    for (let round = 1; round <= 8; round += 1) {
      prompts.add(gameView(room).prompt);
      finishRound(room);
      room.act('owner', { type: 'next-round' }, { now: NOW, rng });
    }

    expect(prompts.size).toBe(8);
  });
});
