import type { GameRegistry } from '@party/game-core';
import { mostLikelyGame } from './most-likely';

export { mostLikelyGame } from './most-likely';
export type { MostLikelyResults, MostLikelyView } from './most-likely';
export { PROMPTS } from './prompts';

export const gameRegistry: GameRegistry = new Map([[mostLikelyGame.id, mostLikelyGame]]);
