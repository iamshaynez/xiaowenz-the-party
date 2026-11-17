import { useEffect, useRef } from 'react';
import type { KeyboardEvent, PointerEvent } from 'react';
import type { MonsterCarBuild } from '@party/protocol';
import type { MonsterCarRaceFrame, MonsterCarView } from '@party/games';
import { MonsterCarWorld } from './rendering/MonsterCarScene';
import { RenderSurface } from './rendering/RenderSurface';
import type { CarIdentity } from './rendering/presentation/CarIdentity';
import type { MonsterCarShowPlan } from './rendering/presentation/ShowPlan';

interface MonsterCarCanvasProps {
  game: MonsterCarView;
  previewBuild: MonsterCarBuild;
  paint: number;
  identity: CarIdentity;
  avatar: string;
  isOwn: boolean;
  viewerId: string;
  showPlan: MonsterCarShowPlan | null;
  photoMode: boolean;
  clockOffsetMs: number;
  onFrame: (frame: MonsterCarRaceFrame) => void;
  onFailure: () => void;
}

export function MonsterCarCanvas({ game, previewBuild, paint, identity, avatar, isOwn, viewerId, showPlan, photoMode, clockOffsetMs, onFrame, onFailure }: MonsterCarCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<MonsterCarWorld | null>(null);
  const clockOffsetRef = useRef(clockOffsetMs);
  const dragRef = useRef<{ pointerId: number; lastX: number } | null>(null);
  clockOffsetRef.current = clockOffsetMs;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new MonsterCarWorld();
    worldRef.current = world;
    let surface: RenderSurface | null = null;
    try {
      surface = new RenderSurface(host, world, onFailure, () => Date.now() + clockOffsetRef.current);
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
    const world = worldRef.current;
    if (!world) return;
    if (game.phase === 'building') {
      world.setGarage(previewBuild, paint, { identity, avatar, isOwn });
      world.resize(hostRef.current?.clientWidth ?? 1, hostRef.current?.clientHeight ?? 1);
    } else if (game.plan && game.raceStartsAt !== null && showPlan) {
      world.setRace(game.plan, game.raceStartsAt, {
        show: showPlan,
        celebrating: game.phase === 'finished',
        photoMode,
        viewerId,
      });
    }
  }, [avatar, game, identity, isOwn, paint, photoMode, previewBuild, showPlan, viewerId]);

  useEffect(() => {
    const world = worldRef.current;
    world?.setFrameListener(onFrame);
    return () => world?.setFrameListener(null);
  }, [onFrame]);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (game.phase !== 'building') return;
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    worldRef.current?.rotateGarage(delta * 0.012);
  };
  const pointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (game.phase !== 'building' || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    worldRef.current?.rotateGarage(event.key === 'ArrowLeft' ? -0.18 : 0.18);
  };

  return (
    <div
      className="mc-render-host"
      ref={hostRef}
      data-phase={game.phase}
      role="group"
      aria-label="拖动汽车旋转，或用左右方向键"
      tabIndex={game.phase === 'building' ? 0 : -1}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerEnd}
      onPointerCancel={pointerEnd}
      onLostPointerCapture={() => { dragRef.current = null; }}
      onKeyDown={keyDown}
    />
  );
}
