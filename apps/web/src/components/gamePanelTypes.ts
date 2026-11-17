import type { GameAction, RoomView } from '@party/protocol';

export interface GamePanelProps {
  room: RoomView;
  playerId: string;
  onAction: (action: GameAction) => void;
  pending: boolean;
  serverClockOffsetMs?: number;
}
