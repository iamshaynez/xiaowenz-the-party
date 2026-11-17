import { lazy, Suspense } from 'react';
import { MostLikelyPanel } from './MostLikelyPanel';
import { PiggyBankPanel } from './PiggyBankPanel';
import type { GamePanelProps } from './gamePanelTypes';

const MonsterCarPanel = lazy(() => import('./monster-car/MonsterCarPanel').then((module) => ({ default: module.MonsterCarPanel })));

// 按 room.game.id 分发到对应游戏的面板；基座能力（重连、版本、动作）全部复用。
export function GamePanel(props: GamePanelProps) {
  switch (props.room.game?.id) {
    case 'piggy-bank':
      return <PiggyBankPanel {...props} />;
    case 'monster-car':
      return <Suspense fallback={<main className="loading-page"><span className="mc-loading-car">🚙</span><p>正在打开怪兽车库…</p></main>}><MonsterCarPanel {...props} /></Suspense>;
    case 'most-likely':
      return <MostLikelyPanel {...props} />;
    default:
      return null;
  }
}

export type { GamePanelProps };
