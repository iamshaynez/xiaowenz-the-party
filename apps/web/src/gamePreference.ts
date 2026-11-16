import { GAME_IDS } from '@party/protocol';
import type { GameId } from '@party/protocol';

// 首页游戏货架的选择偏好：全局记住上次选择，建房时为该房间写入预选，
// 大厅据此初始化选中卡（仅建房者本机有房间偏好，加入者回落到全局偏好）。
const SELECTED_GAME_KEY = 'party.selectedGame';
const roomKey = (code: string) => `party.game.${code}`;

function asGameId(value: string | null): GameId | null {
  return value !== null && (GAME_IDS as readonly string[]).includes(value) ? value as GameId : null;
}

function read(key: string): GameId | null {
  try {
    return asGameId(window.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function readSelectedGame(): GameId {
  return read(SELECTED_GAME_KEY) ?? 'most-likely';
}

export function writeSelectedGame(gameId: GameId) {
  try {
    window.localStorage.setItem(SELECTED_GAME_KEY, gameId);
  } catch {
    // 隐私模式等场景下静默降级，选择只影响默认值。
  }
}

export function readRoomGamePreference(code: string): GameId {
  return read(roomKey(code)) ?? readSelectedGame();
}

export function writeRoomGamePreference(code: string, gameId: GameId) {
  try {
    window.localStorage.setItem(roomKey(code), gameId);
  } catch {
    // 同上，写不进只是丢一次预选。
  }
}
