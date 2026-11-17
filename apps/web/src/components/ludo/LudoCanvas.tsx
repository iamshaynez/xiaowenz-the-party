import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { LudoView } from '@party/games';
import { LudoWorld } from './LudoScene';
import type { LudoPlayerInfo } from './LudoScene';
import { TabletopRenderer } from '../tabletop/TabletopStage';

interface LudoCanvasProps {
  game: LudoView;
  players: LudoPlayerInfo[];
  playerId: string;
  onMovePlane: (plane: number) => void;
  onFailure: () => void;
}

// 飞行棋画布：展示棋盘、飞机与骰子；点击高亮飞机完成移动选择。
export function LudoCanvas({ game, players, playerId, onMovePlane, onFailure }: LudoCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<LudoWorld | null>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number; moved: number } | null>(null);
  const canPickRef = useRef(false);
  const movableRef = useRef<number[]>([]);
  const gameRef = useRef(game);
  gameRef.current = game;
  canPickRef.current = game.stage === 'move' && game.seat !== null && players[game.seat]?.id === playerId;
  movableRef.current = game.movablePlanes;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new LudoWorld(true);
    worldRef.current = world;
    let surface: TabletopRenderer | null = null;
    try {
      surface = new TabletopRenderer(host, world, 'ludo-canvas', onFailure, Date.now);
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

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, moved: 0 };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved > 8 || !canPickRef.current) return;
    const world = worldRef.current;
    if (!world) return;
    const planeId = world.pickPlaneAt(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect(), movableRef.current);
    if (planeId !== null) onMovePlane(planeId);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    drag.moved += Math.abs(delta);
  };

  return (
    <div
      className="ld-render-host"
      ref={hostRef}
      data-phase={game.phase}
      role="group"
      aria-label="飞行棋棋盘"
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
    />
  );
}
