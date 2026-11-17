import { lazy, Suspense } from 'react';
import { MostLikelyPanel } from './MostLikelyPanel';
import { PiggyBankPanel } from './PiggyBankPanel';
import type { GamePanelProps } from './gamePanelTypes';

const MonsterCarPanel = lazy(() => import('./monster-car/MonsterCarPanel').then((module) => ({ default: module.MonsterCarPanel })));
const GomokuPanel = lazy(() => import('./gomoku/GomokuPanel').then((module) => ({ default: module.GomokuPanel })));
const LudoPanel = lazy(() => import('./ludo/LudoPanel').then((module) => ({ default: module.LudoPanel })));
const DouDizhuPanel = lazy(() => import('./dou-dizhu/DouDizhuPanel').then((module) => ({ default: module.DouDizhuPanel })));
const TexasHoldemPanel = lazy(() => import('./texas-holdem/TexasHoldemPanel').then((module) => ({ default: module.TexasHoldemPanel })));

const tableLoading = (label: string) => (
  <main className="loading-page"><span className="bt-loading-chip">🂡</span><p>{label}</p></main>
);

// 按 room.game.id 分发到对应游戏的面板；基座能力（重连、版本、动作）全部复用。
export function GamePanel(props: GamePanelProps) {
  switch (props.room.game?.id) {
    case 'piggy-bank':
      return <PiggyBankPanel {...props} />;
    case 'monster-car':
      return <Suspense fallback={tableLoading('正在打开怪兽车库…')}><MonsterCarPanel {...props} /></Suspense>;
    case 'gomoku':
      return <Suspense fallback={tableLoading('正在铺开棋盘…')}><GomokuPanel {...props} /></Suspense>;
    case 'ludo':
      return <Suspense fallback={tableLoading('正在布置机场…')}><LudoPanel {...props} /></Suspense>;
    case 'dou-dizhu':
      return <Suspense fallback={tableLoading('正在洗牌…')}><DouDizhuPanel {...props} /></Suspense>;
    case 'texas-holdem':
      return <Suspense fallback={tableLoading('正在码放筹码…')}><TexasHoldemPanel {...props} /></Suspense>;
    case 'most-likely':
      return <MostLikelyPanel {...props} />;
    default:
      return null;
  }
}

export type { GamePanelProps };
