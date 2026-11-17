import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { GOMOKU_BOARD_SIZE } from '@party/protocol';
import type { GomokuView } from '@party/games';
import { GomokuWorld } from './GomokuScene';
import type { GomokuPlayers } from './GomokuScene';
import { TabletopRenderer } from '../tabletop/TabletopStage';

interface GomokuCanvasProps {
  game: GomokuView;
  players: GomokuPlayers[];
  playerId: string;
  /** 是否允许落子（轮到本人且棋盘进行中）。 */
  canPlace: boolean;
  onPlace: (x: number, y: number) => void;
  onFailure: () => void;
}

// 五子棋画布：拖动旋转视角、点按落子、悬停预览；键盘方向键 + 回车同样可落子。
export function GomokuCanvas({ game, players, playerId, canPlace, onPlace, onFailure }: GomokuCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<GomokuWorld | null>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number; moved: number } | null>(null);
  const cursorRef = useRef({ x: (GOMOKU_BOARD_SIZE - 1) / 2, y: (GOMOKU_BOARD_SIZE - 1) / 2 });
  const canPlaceRef = useRef(canPlace);
  const myColorRef = useRef<0 | 1>(0);
  canPlaceRef.current = canPlace;

  const seatOfSelf = players.findIndex((player) => player.id === playerId);
  myColorRef.current = seatOfSelf >= 0 && seatOfSelf === game.blackSeat ? 0 : 1;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new GomokuWorld(true);
    worldRef.current = world;
    let surface: TabletopRenderer | null = null;
    try {
      surface = new TabletopRenderer(host, world, 'gomoku-canvas', onFailure, Date.now);
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

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const world = worldRef.current;
    if (!world) return;
    if (!drag || drag.pointerId !== event.pointerId) {
      if (canPlaceRef.current) {
        const cell = world.pickCell(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
        world.setHover(cell, myColorRef.current);
        event.currentTarget.style.cursor = cell ? 'pointer' : 'default';
      }
      return;
    }
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    drag.moved += Math.abs(delta);
    world.orbit(delta * 0.006);
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (drag.moved > 8 || !canPlaceRef.current) return;
    const world = worldRef.current;
    if (!world) return;
    const cell = world.pickCell(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (cell) {
      cursorRef.current = cell;
      onPlace(cell.x, cell.y);
    }
  };

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canPlaceRef.current) return;
    const cursor = cursorRef.current;
    const move = (dx: number, dy: number) => {
      event.preventDefault();
      cursorRef.current = {
        x: Math.max(0, Math.min(GOMOKU_BOARD_SIZE - 1, cursor.x + dx)),
        y: Math.max(0, Math.min(GOMOKU_BOARD_SIZE - 1, cursor.y + dy)),
      };
      worldRef.current?.setHover(cursorRef.current, myColorRef.current);
    };
    if (event.key === 'ArrowLeft') move(-1, 0);
    else if (event.key === 'ArrowRight') move(1, 0);
    else if (event.key === 'ArrowUp') move(0, -1);
    else if (event.key === 'ArrowDown') move(0, 1);
    else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPlace(cursor.x, cursor.y);
    }
  };

  return (
    <div
      className="gm-render-host"
      ref={hostRef}
      data-phase={game.phase}
      role="group"
      aria-label={`五子棋棋盘，方向键移动光标，回车落子，当前光标在第 ${cursorRef.current.y + 1} 行第 ${cursorRef.current.x + 1} 列`}
      tabIndex={canPlace ? 0 : -1}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      onKeyDown={keyDown}
    />
  );
}
