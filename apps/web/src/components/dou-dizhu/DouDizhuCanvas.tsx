import { useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { DouDizhuView } from '@party/games';
import { DouDizhuWorld } from './DouDizhuScene';
import type { DouDizhuPlayerInfo } from './DouDizhuScene';
import { TabletopRenderer } from '../tabletop/TabletopStage';

interface DouDizhuCanvasProps {
  game: DouDizhuView;
  players: DouDizhuPlayerInfo[];
  playerId: string;
  selected: number[];
  canSelect: boolean;
  onToggleCard: (cardId: number) => void;
  /** 键盘回车提交当前选中牌组（面板负责校验）。 */
  onPlaySelected: () => void;
  onFailure: () => void;
}

// 斗地主画布：点选或键盘（←→ 移动、空格选牌、回车出牌）操作自己的手牌。
export function DouDizhuCanvas({ game, players, playerId, selected, canSelect, onToggleCard, onPlaySelected, onFailure }: DouDizhuCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<DouDizhuWorld | null>(null);
  const dragRef = useRef<{ pointerId: number; lastX: number; moved: number } | null>(null);
  const cursorIndexRef = useRef(0);
  const canSelectRef = useRef(canSelect);
  const handRef = useRef(game.ownHand);
  canSelectRef.current = canSelect;
  handRef.current = game.ownHand;
  if (cursorIndexRef.current >= game.ownHand.length) cursorIndexRef.current = Math.max(0, game.ownHand.length - 1);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const world = new DouDizhuWorld(true);
    worldRef.current = world;
    let surface: TabletopRenderer | null = null;
    try {
      surface = new TabletopRenderer(host, world, 'dou-dizhu-canvas', onFailure, Date.now);
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
    worldRef.current?.setState(game, players, playerId, selected);
  }, [game, players, playerId, selected]);

  const pointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: event.pointerId, lastX: event.clientX, moved: 0 };
  };

  const pointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.pointerId !== event.pointerId || drag.moved > 8 || !canSelectRef.current) return;
    const world = worldRef.current;
    if (!world) return;
    const cardId = world.pickCardAt(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
    if (cardId !== null) onToggleCard(cardId);
  };

  const pointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.lastX;
    drag.lastX = event.clientX;
    drag.moved += Math.abs(delta);
  };

  const keyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canSelectRef.current) return;
    const hand = handRef.current;
    if (hand.length === 0) return;
    const cursor = cursorIndexRef.current;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      cursorIndexRef.current = (cursor - 1 + hand.length) % hand.length;
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      cursorIndexRef.current = (cursor + 1) % hand.length;
    } else if (event.key === ' ' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      onToggleCard(hand[cursor]!);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onPlaySelected();
    }
  };

  const cursorCard = game.ownHand[cursorIndexRef.current];
  return (
    <div
      className="dd-render-host"
      ref={hostRef}
      data-phase={game.phase}
      role="group"
      aria-label={`斗地主牌桌，点击手牌选择要出的牌；键盘光标停在第 ${cursorIndexRef.current + 1} 张`}
      tabIndex={canSelect ? 0 : -1}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={() => { dragRef.current = null; }}
      onKeyDown={keyDown}
      data-cursor-card={cursorCard}
    />
  );
}
