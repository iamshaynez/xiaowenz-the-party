import { describe, expect, it } from 'vitest';
import { GAMES } from '@party/games';
import { GAME_IDS } from '@party/protocol';

describe('游戏目录', () => {
  it('每个游戏都带完整的展示元数据，大厅、首页货架与 /api/config 共用一套', () => {
    expect(GAMES.map((game) => game.id)).toEqual([...GAME_IDS]);
    for (const game of GAMES) {
      expect(game.englishName.length).toBeGreaterThan(0);
      expect(game.rules.length).toBeGreaterThan(0);
      for (const rule of game.rules) expect(rule.length).toBeGreaterThan(0);
      expect(game.minutesPerRound).toBeGreaterThanOrEqual(1);
      expect(game.minPlayers).toBeLessThanOrEqual(game.maxPlayers);
      expect(game.roundsOptions.length).toBeGreaterThan(0);
    }
  });

  it('预计时长按「每轮分钟数 × 轮数」推算，单场游戏也成立', () => {
    const monsterCar = GAMES.find((game) => game.id === 'monster-car');
    expect(monsterCar?.roundsOptions).toEqual([1]);
    expect(monsterCar!.roundsOptions[0]! * monsterCar!.minutesPerRound).toBeGreaterThanOrEqual(3);
  });
});
