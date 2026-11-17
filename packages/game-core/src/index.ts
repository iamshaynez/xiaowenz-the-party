import type { GameAction, GameViewBase } from '@party/protocol';

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export interface PlayerInput {
  id: string;
  nickname: string;
  avatar: string;
}

export interface GameContext {
  now: number;
  rng: () => number;
}

export interface GameActionContext extends GameContext {
  playerId: string;
  isOwner: boolean;
  action: GameAction;
}

export interface CreateGameOptions extends GameContext {
  playerIds: string[];
  rounds: number;
}

export interface GameDefinition<State, View extends GameViewBase> {
  readonly id: string;
  readonly version: number;
  readonly name: string;
  readonly emoji: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly rules: readonly string[];
  readonly englishName: string;
  readonly minutesPerRound: number;
  readonly roundsOptions: readonly number[];
  readonly minPlayers: number;
  readonly maxPlayers: number;
  create(options: CreateGameOptions): State;
  act(state: State, context: GameActionContext): void;
  advanceTime(state: State, context: GameContext): boolean;
  view(state: State, playerId: string): View;
  isFinished(state: State): boolean;
}

// 展示元数据供首页货架、大厅选择器与 /api/config 使用，不参与规则校验。
export interface GameInfo {
  id: string;
  name: string;
  emoji: string;
  description: string;
  tags: readonly string[];
  rules: readonly string[];
  englishName: string;
  minutesPerRound: number;
  roundsOptions: readonly number[];
  minPlayers: number;
  maxPlayers: number;
}

export function toGameInfo(definition: AnyGameDefinition): GameInfo {
  return {
    id: definition.id,
    name: definition.name,
    emoji: definition.emoji,
    description: definition.description,
    tags: definition.tags,
    rules: definition.rules,
    englishName: definition.englishName,
    minutesPerRound: definition.minutesPerRound,
    roundsOptions: definition.roundsOptions,
    minPlayers: definition.minPlayers,
    maxPlayers: definition.maxPlayers,
  };
}

// A registry intentionally erases each game's private state at the composition boundary.
export type AnyGameDefinition = GameDefinition<any, any>;
export type GameRegistry = ReadonlyMap<string, AnyGameDefinition>;
