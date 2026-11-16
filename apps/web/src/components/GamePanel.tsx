import { MostLikelyPanel } from './MostLikelyPanel';
import type { GamePanelProps } from './MostLikelyPanel';
import { PiggyBankPanel } from './PiggyBankPanel';

// 按 room.game.id 分发到对应游戏的面板；基座能力（重连、版本、动作）全部复用。
export function GamePanel(props: GamePanelProps) {
  switch (props.room.game?.id) {
    case 'piggy-bank':
      return <PiggyBankPanel {...props} />;
    case 'most-likely':
      return <MostLikelyPanel {...props} />;
    default:
      return null;
  }
}

export type { GamePanelProps };
