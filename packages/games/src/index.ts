import type { AnyGameDefinition, GameRegistry } from '@party/game-core';
import { toGameInfo } from '@party/game-core';
import { mostLikelyGame } from './most-likely';
import { piggyBankGame } from './piggy-bank';
import { monsterCarGame } from './monster-car';
import { gomokuGame } from './gomoku';
import { ludoGame } from './ludo';
import { douDizhuGame } from './dou-dizhu';
import { texasHoldemGame } from './texas-holdem';

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
export { GOMOKU_MOVE_TIMEOUT_MS, GOMOKU_ROUND_RESULT_MS, gomokuGame } from './gomoku';
export type { GomokuCell, GomokuPoint, GomokuView } from './gomoku';
export { LUDO_FLY_DISTANCE, LUDO_FLY_FROM, LUDO_HOME_STEPS, LUDO_MOVE_TIMEOUT_MS, LUDO_RING_SIZE, LUDO_ROLL_TIMEOUT_MS, ludoGame } from './ludo';
export type { LudoPlaneState, LudoView } from './ludo';
export {
  DOU_DIZHU_BID_TIMEOUT_MS,
  DOU_DIZHU_HAND_RESULT_MS,
  DOU_DIZHU_PLAY_TIMEOUT_MS,
  douDizhuBeats,
  douDizhuGame,
  douDizhuStrength,
  parseDouDizhuCombo,
  sortDouDizhuCards,
} from './dou-dizhu';
export type { DouDizhuCombo, DouDizhuComboType } from './dou-dizhu/combo';
export type { DouDizhuHandResult, DouDizhuView } from './dou-dizhu';
export {
  HOLDEM_ACTION_TIMEOUT_MS,
  HOLDEM_BASE_BB,
  HOLDEM_BASE_SB,
  HOLDEM_HAND_END_MS,
  HOLDEM_HANDS_PER_BLIND_LEVEL,
  HOLDEM_RUNOUT_STEP_MS,
  HOLDEM_ROUNDS,
  HOLDEM_STARTING_STACK,
  texasHoldemGame,
} from './texas-holdem';
export type {
  HoldemHandResult,
  HoldemPhase,
  HoldemPotResult,
  HoldemSeatView,
  HoldemStreet,
  HoldemView,
} from './texas-holdem';
export { evaluateHoldem, describeHoldemCards, describeHoldemHand, HOLDEM_CATEGORY_LABELS } from './texas-holdem/evaluator';
export type { HoldemCategory, HoldemHandScore } from './texas-holdem/evaluator';
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
  [gomokuGame.id, gomokuGame],
  [ludoGame.id, ludoGame],
  [douDizhuGame.id, douDizhuGame],
  [texasHoldemGame.id, texasHoldemGame],
]);

// 大厅选择器与 /api/config 使用的游戏元数据（展示用途，不参与规则校验）。
export const GAMES = [
  toGameInfo(mostLikelyGame),
  toGameInfo(piggyBankGame),
  toGameInfo(monsterCarGame),
  toGameInfo(gomokuGame),
  toGameInfo(ludoGame),
  toGameInfo(douDizhuGame),
  toGameInfo(texasHoldemGame),
];
