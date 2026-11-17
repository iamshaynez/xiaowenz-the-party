import * as THREE from 'three';
import type { HoldemView } from '@party/games';
import { CameraRig, createStage, damp } from '../tabletop/TabletopStage';
import type { TabletopScene } from '../tabletop/TabletopStage';
import { createAvatarBadge, createCardMesh, createChipStackMesh, createLabelSprite, disposeObjectTree, flipCard } from '../tabletop/props';
import { feltTexture } from '../tabletop/textures';

// ---------------------------------------------------------------------------
// 德州扑克 3D 场景：深蓝毛毡椭圆桌，自己坐近端，公共牌居中，彩池筹码随注增长。
// ---------------------------------------------------------------------------

const ACCENT = '#ffcf5c';
const CARD_W = 1.0;
const RING_X = 6.9;
const RING_Z = 4.5;

export interface HoldemPlayerInfo {
  id: string;
  nickname: string;
  avatar: string;
}

/** 座位在椭圆桌上的位置：自己永远在近端正中，其余顺时针排开。 */
export function seatPosition(seat: number, selfSeat: number, count: number): THREE.Vector3 {
  const theta = ((seat - selfSeat) / count) * Math.PI * 2;
  return new THREE.Vector3(Math.sin(theta) * RING_X, 0, Math.cos(theta) * RING_Z);
}

interface SeatActor {
  badge: THREE.Sprite;
  label: THREE.Sprite;
  betChips: THREE.Group | null;
  betLabel: THREE.Sprite | null;
  cards: THREE.Group[];
  clockRing: THREE.Mesh | null;
  playerId: string;
}

export class TexasHoldemWorld implements TabletopScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly stage: ReturnType<typeof createStage>;
  private readonly seatActors: SeatActor[] = [];
  private readonly dynamic = new THREE.Group();
  private communityCards: THREE.Group[] = [];
  private potChips: THREE.Group | null = null;
  private potLabel: THREE.Sprite | null = null;
  private dealerButton: THREE.Mesh | null = null;
  private clock = 0;

  constructor(shadows: boolean) {
    this.stage = createStage({ accent: ACCENT, ambience: '#0d1118', keyLight: '#ffeccb', shadows });
    this.scene = this.stage.scene;
    this.rig = this.stage.rig;
    this.camera = this.rig.camera;
    this.rig.snap({ focus: new THREE.Vector3(0, 0.2, -0.4), yaw: 0, pitch: 0.82, distance: 16.8 });

    // 椭圆牌桌。
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(7.9, 7.9, 0.34, 56),
      new THREE.MeshStandardMaterial({ map: feltTexture('#1c4a6e'), roughness: 0.95 }),
    );
    top.scale.z = 0.66;
    top.position.y = -0.17;
    top.receiveShadow = shadows;
    this.scene.add(top);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(7.95, 0.36, 12, 60),
      new THREE.MeshStandardMaterial({ color: '#2c2118', roughness: 0.5, metalness: 0.12 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 0.66, 1);
    rim.position.y = -0.14;
    this.scene.add(rim);
    const inlay = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 0.06, 8, 48),
      new THREE.MeshBasicMaterial({ color: '#d8b56a', transparent: true, opacity: 0.4 }),
    );
    inlay.rotation.x = Math.PI / 2;
    inlay.scale.set(1, 0.66, 1);
    inlay.position.y = 0.06;
    this.scene.add(inlay);
    this.scene.add(this.dynamic);
  }

  setState(view: HoldemView, players: HoldemPlayerInfo[], selfId: string) {
    const selfSeat = Math.max(0, view.seats.findIndex((seat) => seat.playerId === selfId));
    this.syncSeats(view, players, selfSeat);
    this.syncCommunity(view);
    this.syncPot(view);
    this.syncDealerButton(view, selfSeat);
  }

  private clearGroup(group: THREE.Group) {
    for (const child of [...group.children]) {
      group.remove(child);
      disposeObjectTree(child);
    }
  }

  private syncSeats(view: HoldemView, players: HoldemPlayerInfo[], selfSeat: number) {
    // 座位集合变化时整体重建（每手开始座位可能因淘汰变化）。
    const sameSet = this.seatActors.length === view.seats.length
      && view.seats.every((seat, index) => this.seatActors[index]?.playerId === seat.playerId);
    if (!sameSet) {
      for (const actor of this.seatActors) {
        this.dynamic.remove(actor.badge, actor.label);
        if (actor.betChips) this.dynamic.remove(actor.betChips);
        if (actor.betLabel) this.dynamic.remove(actor.betLabel);
        for (const card of actor.cards) this.dynamic.remove(card);
      }
      this.seatActors.length = 0;
    }
    view.seats.forEach((seatView, index) => {
      const position = seatPosition(index, selfSeat, view.seats.length);
      const towardCenter = position.clone().multiplyScalar(0.62).setY(0);
      let actor = this.seatActors[index];
      if (!actor) {
        const player = players.find((entry) => entry.id === seatView.playerId)!;
        actor = {
          playerId: seatView.playerId,
          badge: createAvatarBadge(player?.avatar ?? '🦊', 'rgba(120,130,150,0.6)', 1.25),
          label: createLabelSprite(`${player?.nickname ?? '?'} · ${seatView.stack}`, 3.2),
          betChips: null,
          betLabel: null,
          cards: [],
          clockRing: null,
        };
        this.dynamic.add(actor.badge);
        this.dynamic.add(actor.label);
        this.seatActors[index] = actor;
      }
      const isSelf = seatView.playerId === players[selfSeat]?.id;
      const isTurn = view.toActSeat === index;
      const away = position.clone().normalize();
      actor.badge.position.set(position.x + away.x * 0.9, 1.9, position.z + away.z * 0.9);
      const player = players.find((entry) => entry.id === seatView.playerId);
      const label = createLabelSprite(
        `${player?.nickname ?? '?'}${isSelf ? '（我）' : ''} · ${seatView.stack}${seatView.folded ? ' · 已弃牌' : seatView.allIn ? ' · 全下' : ''}`,
        3.3,
        { color: isTurn ? ACCENT : seatView.folded ? '#8d94a3' : '#e7e2d3', bold: isTurn },
      );
      label.position.copy(actor.label.position);
      this.dynamic.remove(actor.label);
      actor.label.material.dispose();
      this.dynamic.add(label);
      actor.label = label;

      // 底牌：自己大牌正面，别人小牌背面；弃牌收回。
      for (const card of actor.cards) this.dynamic.remove(card);
      actor.cards = [];
      if (!seatView.folded && (view.phase === 'betting' || view.phase === 'runout' || view.phase === 'hand-end')) {
        const revealed = view.revealed?.[seatView.playerId];
        for (let cardIndex = 0; cardIndex < 2; cardIndex += 1) {
          const cardId = revealed?.[cardIndex] ?? (isSelf ? view.ownCards?.[cardIndex] : undefined);
          const faceUp = cardId !== undefined;
          const card = createCardMesh(cardId ?? 0, faceUp, { width: isSelf ? CARD_W : 0.62, backAccent: ACCENT });
          if (!faceUp) flipCard(card, false);
          const spread = isSelf ? 0.9 : 0.5;
          card.position.set(
            position.x + away.x * 1.35 + (cardIndex === 0 ? -spread / 2 : spread / 2),
            1.0,
            position.z + away.z * 1.35,
          );
          card.rotation.set(-1.15, (cardIndex === 0 ? 1 : -1) * 0.12, 0);
          this.dynamic.add(card);
          actor.cards.push(card);
        }
      }

      // 本街注筹码。
      if (actor.betChips) {
        this.dynamic.remove(actor.betChips);
        actor.betChips = null;
      }
      if (actor.betLabel) {
        this.dynamic.remove(actor.betLabel);
        actor.betLabel = null;
      }
      if (seatView.streetBet > 0) {
        const chips = createChipStackMesh(Math.ceil(seatView.streetBet / Math.max(40, seatView.streetBet)) * 4 + 1, '#e8e3d4', '#1c4a6e');
        chips.position.set(towardCenter.x, 0.05, towardCenter.z);
        this.dynamic.add(chips);
        actor.betChips = chips;
        const betLabel = createLabelSprite(`${seatView.streetBet}`, 1.5, { color: '#ffe9ad', background: 'rgba(10,14,20,0.75)' });
        betLabel.position.set(towardCenter.x, 0.75, towardCenter.z);
        this.dynamic.add(betLabel);
        actor.betLabel = betLabel;
      }
    });
  }

  private communitySignature = '';
  private potSignature = '';

  private syncCommunity(view: HoldemView) {
    const signature = view.community.join(',');
    if (signature === this.communitySignature) return;
    this.communitySignature = signature;
    for (const card of this.communityCards) this.dynamic.remove(card);
    this.communityCards = [];
    view.community.forEach((cardId, index) => {
      const card = createCardMesh(cardId, true, { width: 1.0, backAccent: ACCENT });
      card.position.set((index - (view.community.length - 1) / 2) * 1.22, 0.6, -0.6);
      card.rotation.set(-Math.PI / 2 + 0.03, 0, 0);
      this.dynamic.add(card);
      this.communityCards.push(card);
    });
  }

  private syncPot(view: HoldemView) {
    const stacks = Math.min(5, 1 + Math.floor(Math.log10(Math.max(view.pot, 1))));
    const signature = `${stacks}:${view.pot}`;
    if (signature === this.potSignature) return;
    this.potSignature = signature;
    if (this.potChips) {
      this.dynamic.remove(this.potChips);
      this.potChips = null;
    }
    if (this.potLabel) {
      this.dynamic.remove(this.potLabel);
      this.potLabel = null;
    }
    if (view.pot > 0) {
      const chips = createChipStackMesh(stacks * 3, '#dcd2b8', '#1c4a6e');
      chips.position.set(-2.2, 0.05, -1.8);
      this.dynamic.add(chips);
      this.potChips = chips;
      const label = createLabelSprite(`彩池 ${view.pot}`, 3.2, { color: '#ffe9ad', bold: true, background: 'rgba(10,14,20,0.72)' });
      label.position.set(0, 0.9, -2.1);
      this.dynamic.add(label);
      this.potLabel = label;
    }
  }

  private syncDealerButton(view: HoldemView, selfSeat: number) {
    if (this.dealerButton) {
      this.dynamic.remove(this.dealerButton);
      this.dealerButton = null;
    }
    if (view.seats.length === 0 || view.buttonSeat < 0) return;
    const position = seatPosition(view.buttonSeat, selfSeat, view.seats.length);
    const toward = position.clone().multiplyScalar(0.5);
    const button = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.08, 20),
      new THREE.MeshStandardMaterial({ color: '#f5efdd', roughness: 0.5 }),
    );
    button.position.set(toward.x + 0.5, 0.1, toward.z + 0.3);
    this.dynamic.add(button);
    this.dealerButton = button;
  }

  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean) {
    this.clock = timeSeconds;
    this.stage.update(timeSeconds, deltaSeconds, reducedMotion);
    for (const card of this.communityCards) {
      card.position.y = damp(card.position.y, 0.08, 12, deltaSeconds);
    }
    if (this.dealerButton) {
      this.dealerButton.rotation.y += deltaSeconds * 0.6;
    }
  }

  resize(width: number, height: number) {
    this.stage.resize(width, height);
  }

  dispose() {
    this.clearGroup(this.dynamic);
    this.stage.dispose();
  }
}
