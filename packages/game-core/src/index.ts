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
  readonly minPlayers: number;
  readonly maxPlayers: number;
  create(options: CreateGameOptions): State;
  act(state: State, context: GameActionContext): void;
  advanceTime(state: State, now: number): boolean;
  view(state: State, playerId: string): View;
  isFinished(state: State): boolean;
}

// A registry intentionally erases each game's private state at the composition boundary.
export type AnyGameDefinition = GameDefinition<any, any>;
export type GameRegistry = ReadonlyMap<string, AnyGameDefinition>;
