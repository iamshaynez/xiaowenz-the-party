import { useEffect, useRef } from 'react';
import type { HoldemView } from '@party/games';
import { TexasHoldemWorld } from './TexasHoldemScene';
import type { HoldemPlayerInfo } from './TexasHoldemScene';
import { TabletopRenderer } from '../tabletop/TabletopStage';

interface TexasHoldemCanvasProps {
  game: HoldemView;
  players: HoldemPlayerInfo[];
  playerId: string;
  onFailure: () => void;
}

// 德州扑克画布：纯展示（牌桌、座位、公共牌、彩池），下注操作在 DOM 操作栏。
export function TexasHoldemCanvas({ game, players, playerId, onFailure }: TexasHoldemCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<TexasHoldemWorld | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new TexasHoldemWorld(true);
    worldRef.current = world;
    let surface: TabletopRenderer | null = null;
    try {
      surface = new TabletopRenderer(host, world, 'texas-holdem-canvas', onFailure, Date.now);
    } catch {
      worldRef.current = null;
    }
    return () => {
      surface?.dispose();
      if (!surface) world.dispose();
      worldRef.current = null;
    };
  }, [onFailure]);

  useEffect(() => {
    worldRef.current?.setState(game, players, playerId);
  }, [game, players, playerId]);

  return (
    <div
      className="th-render-host"
      ref={hostRef}
      data-phase={game.phase}
      role="img"
      aria-label="德州扑克牌桌"
    />
  );
}
