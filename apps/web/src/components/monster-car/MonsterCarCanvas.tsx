import { useEffect, useRef } from 'react';
import type { MonsterCarBuild } from '@party/protocol';
import type { MonsterCarRaceFrame, MonsterCarView } from '@party/games';
import { MonsterCarWorld } from './rendering/MonsterCarScene';
import { RenderSurface } from './rendering/RenderSurface';

interface MonsterCarCanvasProps {
  game: MonsterCarView;
  previewBuild: MonsterCarBuild;
  paint: number;
  clockOffsetMs: number;
  onFrame: (frame: MonsterCarRaceFrame) => void;
  onFailure: () => void;
}

export function MonsterCarCanvas({ game, previewBuild, paint, clockOffsetMs, onFrame, onFailure }: MonsterCarCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<MonsterCarWorld | null>(null);
  const clockOffsetRef = useRef(clockOffsetMs);
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
      world.setGarage(previewBuild, paint);
      world.resize(hostRef.current?.clientWidth ?? 1, hostRef.current?.clientHeight ?? 1);
    } else if (game.plan && game.raceStartsAt !== null) {
      world.setRace(game.plan, game.raceStartsAt, game.phase === 'finished');
    }
  }, [game, paint, previewBuild]);

  useEffect(() => {
    const world = worldRef.current;
    world?.setFrameListener(onFrame);
    return () => world?.setFrameListener(null);
  }, [onFrame]);

  return <div className="mc-render-host" ref={hostRef} data-phase={game.phase} />;
}
