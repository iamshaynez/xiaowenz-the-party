import { DomainError } from '@party/game-core';
import type { CreateGameOptions, GameActionContext, GameDefinition } from '@party/game-core';
import { PROMPTS } from './prompts';

export const VOTING_DURATION_MS = 60_000;

export interface MostLikelyResults {
  votes: Record<string, string>;
  counts: Record<string, number>;
  winners: string[];
}

export interface MostLikelyView {
  id: 'most-likely';
  phase: 'voting' | 'results' | 'finished';
  round: number;
  totalRounds: number;
  prompt: string;
  submittedPlayerIds: string[];
  ownVote: string | null;
  deadlineAt: number | null;
  scores: Record<string, number>;
  results: MostLikelyResults | null;
  winners: string[];
}

interface MostLikelyState {
  participantIds: string[];
  round: number;
  totalRounds: number;
  phase: 'voting' | 'results' | 'finished';
  promptDeck: string[];
  votes: Record<string, string>;
  scores: Record<string, number>;
  results: MostLikelyResults | null;
  deadlineAt: number | null;
}

function shuffledPrompts(rng: () => number) {
  const deck = [...PROMPTS];
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [deck[index], deck[other]] = [deck[other]!, deck[index]!];
  }
  return deck;
}

function create(options: CreateGameOptions): MostLikelyState {
  return {
    participantIds: [...options.playerIds],
    round: 1,
    totalRounds: options.rounds,
    phase: 'voting',
    promptDeck: shuffledPrompts(options.rng),
    votes: {},
    scores: Object.fromEntries(options.playerIds.map((id) => [id, 0])),
    results: null,
    deadlineAt: options.now + VOTING_DURATION_MS,
  };
}

function reveal(state: MostLikelyState) {
  const counts = Object.fromEntries(state.participantIds.map((id) => [id, 0]));
  for (const targetId of Object.values(state.votes)) counts[targetId] = (counts[targetId] ?? 0) + 1;
  const highest = Math.max(0, ...Object.values(counts));
  const winners = highest === 0 ? [] : state.participantIds.filter((id) => counts[id] === highest);
  for (const winner of winners) state.scores[winner] = (state.scores[winner] ?? 0) + 1;
  state.results = { votes: { ...state.votes }, counts, winners };
  state.phase = 'results';
  state.deadlineAt = null;
}

function act(state: MostLikelyState, context: GameActionContext) {
  switch (context.action.type) {
    case 'cast-vote': {
      if (state.phase !== 'voting') throw new DomainError('INVALID_PHASE', '本轮投票已经结束');
      if (!state.participantIds.includes(context.playerId)) {
        throw new DomainError('NOT_A_PARTICIPANT', '旁观者将在下一局加入');
      }
      const targetId = context.action.targetId;
      if (targetId === context.playerId) throw new DomainError('SELF_VOTE', '这一票要投给身边的朋友');
      if (!state.participantIds.includes(targetId)) throw new DomainError('INVALID_TARGET', '投票对象不在本局中');
      state.votes[context.playerId] = targetId;
      if (state.participantIds.every((id) => state.votes[id])) reveal(state);
      return;
    }
    case 'next-round': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以推进下一轮');
      if (state.phase !== 'results') throw new DomainError('INVALID_PHASE', '现在还不能进入下一轮');
      if (state.round === state.totalRounds) {
        state.phase = 'finished';
        return;
      }
      state.round += 1;
      state.phase = 'voting';
      state.votes = {};
      state.results = null;
      state.deadlineAt = context.now + VOTING_DURATION_MS;
      return;
    }
    case 'play-again': {
      if (!context.isOwner) throw new DomainError('OWNER_ONLY', '只有房主可以再开一局');
      if (state.phase !== 'finished') throw new DomainError('INVALID_PHASE', '本局还没有结束');
      Object.assign(state, create({
        playerIds: state.participantIds,
        rounds: state.totalRounds,
        now: context.now,
        rng: context.rng,
      }));
      return;
    }
    default:
      throw new DomainError('INVALID_ACTION', '这不是「谁最可能」的动作');
  }
}

export const mostLikelyGame: GameDefinition<MostLikelyState, MostLikelyView> = {
  id: 'most-likely',
  version: 1,
  name: '谁最可能',
  emoji: '🗳️',
  description: '一道题，一票默契。看看在朋友眼里，谁是那个“十有八九”的人。',
  tags: ['破冰', '默契', '轻松'],
  rules: ['3–12 人', '不能投自己', '平票都得分'],
  englishName: "WHO'S MOST LIKELY",
  minutesPerRound: 2,
  roundsOptions: [3, 5, 8],
  minPlayers: 3,
  maxPlayers: 12,
  create,
  act,
  advanceTime(state, context) {
    if (state.phase !== 'voting' || state.deadlineAt === null || context.now < state.deadlineAt) return false;
    reveal(state);
    return true;
  },
  view(state, playerId): MostLikelyView {
    const highest = Math.max(0, ...Object.values(state.scores));
    return {
      id: 'most-likely',
      phase: state.phase,
      round: state.round,
      totalRounds: state.totalRounds,
      prompt: state.promptDeck[state.round - 1]!,
      submittedPlayerIds: state.participantIds.filter((id) => state.votes[id]),
      ownVote: state.votes[playerId] ?? null,
      deadlineAt: state.deadlineAt,
      scores: { ...state.scores },
      results: state.results ? {
        votes: { ...state.results.votes },
        counts: { ...state.results.counts },
        winners: [...state.results.winners],
      } : null,
      winners: state.phase === 'finished' ? state.participantIds.filter((id) => state.scores[id] === highest && highest > 0) : [],
    };
  },
  isFinished: (state) => state.phase === 'finished',
};
