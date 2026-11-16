import { lazy, Suspense } from 'react';
import { MostLikelyPanel } from './MostLikelyPanel';
import type { GamePanelProps } from './MostLikelyPanel';
import { PiggyBankPanel } from './PiggyBankPanel';
import { CanDriveBoundary } from '../games/can-drive/CanDriveBoundary';

const CanDrivePanel = lazy(async () => {
  const module = await import('../games/can-drive/CanDrivePanel');
  return { default: module.CanDrivePanel };
});

// 按 room.game.id 分发到对应游戏的面板；基座能力（重连、版本、动作）全部复用。
export function GamePanel(props: GamePanelProps) {
  switch (props.room.game?.id) {
    case 'can-drive':
      return (
        <CanDriveBoundary>
          <Suspense fallback={<div className="loading-page"><p>正在打开怪车改装台…</p></div>}>
            <CanDrivePanel {...props} />
          </Suspense>
        </CanDriveBoundary>
      );
    case 'piggy-bank':
      return <PiggyBankPanel {...props} />;
    case 'most-likely':
      return <MostLikelyPanel {...props} />;
    default:
      return null;
  }
}

export type { GamePanelProps };
