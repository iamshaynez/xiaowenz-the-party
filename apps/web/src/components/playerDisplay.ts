import type { PlayerView } from '@party/protocol';

// 两个游戏面板共用的玩家信息展示助手。
export function playerNameOf(players: PlayerView[], id: string) {
  return players.find((player) => player.id === id)?.nickname ?? '离场的朋友';
}

export function playerAvatarOf(players: PlayerView[], id: string) {
  return players.find((player) => player.id === id)?.avatar ?? '👋';
}
