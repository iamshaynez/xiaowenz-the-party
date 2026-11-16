import type { AnyGameDefinition, GameRegistry } from '@party/game-core';
import { toGameInfo } from '@party/game-core';
import { mostLikelyGame } from './most-likely';
import { piggyBankGame } from './piggy-bank';
import { canDriveGame } from './can-drive/can-drive';

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
export { canDriveGame } from './can-drive/can-drive';
export { CAR_AWARDS } from './can-drive/awards';
export { CAR_ENVIRONMENTS } from './can-drive/environments';
export { CAR_PARTS, CAN_DRIVE_SLOTS, DEFAULT_CAR_BUILD } from './can-drive/catalog';
export type { CanDriveSlot } from './can-drive/catalog';
export type {
  CanDriveAwardView,
  CanDriveBuild,
  CanDriveCurrentView,
  CanDriveFinalCarView,
  CanDriveView,
} from './can-drive/can-drive';
export { createCarShowPlan, sampleCarShowPose } from './can-drive/show';
export type { CarShowPlan, CarShowPose, PublicCarShowPlan } from './can-drive/show';

export const gameRegistry: GameRegistry = new Map<string, AnyGameDefinition>([
  [mostLikelyGame.id, mostLikelyGame],
  [piggyBankGame.id, piggyBankGame],
  [canDriveGame.id, canDriveGame],
]);

// 大厅选择器与 /api/config 使用的游戏元数据（展示用途，不参与规则校验）。
export const GAMES = [...gameRegistry.values()].map(toGameInfo);
