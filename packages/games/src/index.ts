import type { AnyGameDefinition, GameRegistry } from '@party/game-core';
import { toGameInfo } from '@party/game-core';
import { mostLikelyGame } from './most-likely';
import { piggyBankGame } from './piggy-bank';
import { monsterCarGame } from './monster-car';

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
export { BUILDING_DURATION_MS, COUNTDOWN_DURATION_MS, monsterCarGame } from './monster-car';
export type { MonsterCarStanding, MonsterCarView } from './monster-car';
export { MONSTER_CAR_PART_CATALOG, resolveMonsterCarReaction } from './monster-car/parts';
export type {
  MonsterCarPartDefinition,
  MonsterCarReactionDefinition,
  MonsterCarReactionSlot,
  MonsterCarStimulus,
  ResolvedMonsterCarCarReaction,
  ResolvedMonsterCarReaction,
} from './monster-car/parts';
export {
  RACE_DURATION_MS,
  createMonsterCarRacePlan,
  sampleMonsterCarFrame,
  sampleMonsterCarPace,
} from './monster-car/race';
export type {
  MonsterCarCourseEvent,
  MonsterCarEnvironment,
  MonsterCarFrameCar,
  MonsterCarPaceFrame,
  MonsterCarRaceFrame,
  MonsterCarRacePlan,
  MonsterCarRacerPlan,
  MonsterCarReactionCue,
} from './monster-car/race';
export type { MonsterCarBuild } from '@party/protocol';


export const gameRegistry: GameRegistry = new Map<string, AnyGameDefinition>([
  [mostLikelyGame.id, mostLikelyGame],
  [piggyBankGame.id, piggyBankGame],
  [monsterCarGame.id, monsterCarGame],
]);

// 大厅选择器与 /api/config 使用的游戏元数据（展示用途，不参与规则校验）。
export const GAMES = [toGameInfo(mostLikelyGame), toGameInfo(piggyBankGame), toGameInfo(monsterCarGame)];
