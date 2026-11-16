import type { AnyGameDefinition, GameRegistry } from '@party/game-core';
import { toGameInfo } from '@party/game-core';
import { mostLikelyGame } from './most-likely';
import { piggyBankGame } from './piggy-bank';

export { mostLikelyGame, VOTING_DURATION_MS } from './most-likely';
export type { MostLikelyResults, MostLikelyView } from './most-likely';
export { piggyBankGame } from './piggy-bank';
export type {
  PiggyBankChoice,
  PiggyBankEvent,
  PiggyBankRoundOutcome,
  PiggyBankView,
} from './piggy-bank';
export { PROMPTS } from './prompts';

export const gameRegistry: GameRegistry = new Map<string, AnyGameDefinition>([
  [mostLikelyGame.id, mostLikelyGame],
  [piggyBankGame.id, piggyBankGame],
]);

// 大厅选择器与 /api/config 使用的游戏元数据（展示用途，不参与规则校验）。
export const GAMES = [toGameInfo(mostLikelyGame), toGameInfo(piggyBankGame)];
