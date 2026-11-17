import * as THREE from 'three';
import type { DouDizhuView } from '@party/games';
import { parseDouDizhuCombo } from '@party/games';
import { CameraRig, createStage, damp } from '../tabletop/TabletopStage';
import type { TabletopScene } from '../tabletop/TabletopStage';
import { createAvatarBadge, createCardMesh, createLabelSprite, disposeObjectTree, flipCard } from '../tabletop/props';
import { feltTexture } from '../tabletop/textures';

// ---------------------------------------------------------------------------
// 斗地主 3D 场景：墨绿椭圆牌桌，自己是近端扇形手牌，两位对家在远端。
// 出牌摆在桌面中央；地主戴上金色徽记。
// ---------------------------------------------------------------------------

const ACCENT = '#ffce54';
const CARD_W = 1.08;
const HAND_Z = 5.6;
const HAND_Y = 0.72;

export interface DouDizhuPlayerInfo {
  id: string;
  nickname: string;
  avatar: string;
}

/** 扇形手牌第 index 张的位姿（共 count 张，选中时抬高前倾）。 */
export function handCardPose(index: number, count: number, selected: boolean): THREE.Object3D {
  const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
  const spread = Math.min(5.4, count * 0.6);
  const object = new THREE.Object3D();
  object.position.set(
    t * spread / 2,
    selected ? HAND_Y + 0.42 : HAND_Y,
    HAND_Z + t * t * 0.34 - (selected ? 0.18 : 0),
  );
  object.rotation.set(-1.02 + (selected ? -0.2 : 0), -t * 0.1, 0);
  return object;
}

/** 桌面出牌区第 index 张的位姿（anchor 为出牌人一侧的锚点）。 */
export function trickCardPose(anchor: THREE.Vector3, index: number, count: number): THREE.Object3D {
  const object = new THREE.Object3D();
  const spacing = Math.min(0.78, 5.6 / Math.max(count, 1));
  const offset = (index - (count - 1) / 2) * spacing;
  object.position.set(anchor.x + offset, 0.16, anchor.z);
  object.rotation.set(-Math.PI / 2 + 0.06, 0, index * 0.012);
  return object;
}

/** 座位在桌面上的锚点：自己在近端，上下家在远端两侧。 */
export function seatAnchor(seat: number, selfSeat: number): THREE.Vector3 {
  const relative = (seat - selfSeat + 3) % 3;
  if (relative === 0) return new THREE.Vector3(0, 0, 1.7);
  if (relative === 1) return new THREE.Vector3(-3.4, 0, -2.3);
  return new THREE.Vector3(3.4, 0, -2.3);
}

interface CardActor {
  mesh: THREE.Group;
  cardId: number;
  target: THREE.Object3D;
}

export class DouDizhuWorld implements TabletopScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly stage: ReturnType<typeof createStage>;
  private readonly fxGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPlane: THREE.Mesh;
  private hand: CardActor[] = [];
  private tableGroups: THREE.Group[] = [];
  private badges: THREE.Sprite[] = [];
  private clock = 0;

  constructor(shadows: boolean) {
    this.stage = createStage({ accent: ACCENT, ambience: '#12100e', keyLight: '#ffe9c4', shadows });
    this.scene = this.stage.scene;
    this.rig = this.stage.rig;
    this.camera = this.rig.camera;
    this.rig.snap({ focus: new THREE.Vector3(0, 0.2, 0.8), yaw: 0, pitch: 0.86, distance: 15.5 });

    // 椭圆牌桌：墨绿呢面 + 深胡桃围边。
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(7.2, 7.2, 0.36, 48),
      new THREE.MeshStandardMaterial({ map: feltTexture('#1d5c40'), roughness: 0.94 }),
    );
    top.scale.z = 0.72;
    top.position.y = -0.18;
    top.receiveShadow = shadows;
    this.scene.add(top);
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(7.25, 0.34, 12, 56),
      new THREE.MeshStandardMaterial({ color: '#5a3b22', roughness: 0.52, metalness: 0.1 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1, 0.72, 1);
    rim.position.y = -0.16;
    this.scene.add(rim);
    const pedestal = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 2.2, 3.2, 20),
      new THREE.MeshStandardMaterial({ color: '#3a2817', roughness: 0.6 }),
    );
    pedestal.position.y = -1.9;
    this.scene.add(pedestal);
    this.scene.add(this.fxGroup);

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 14),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.pickPlane.position.y = HAND_Y;
    this.scene.add(this.pickPlane);
  }

  setState(view: DouDizhuView, players: DouDizhuPlayerInfo[], selfId: string, selected: number[]) {
    this.syncOwnHand(view, selected);
    this.syncTable(view, players, selfId);
    this.syncBadges(view, players, selfId);
  }

  private syncOwnHand(view: DouDizhuView, selected: number[]) {
    const own = [...view.ownHand];
    // 数量一致时按 cardId 增量复用，避免出牌后整手重建闪烁。
    if (this.hand.length !== own.length || own.some((cardId, index) => this.hand[index]!.cardId !== cardId)) {
      for (const actor of this.hand) {
        this.fxGroup.remove(actor.mesh);
        disposeObjectTree(actor.mesh);
      }
      this.hand = own.map((cardId) => {
        const mesh = createCardMesh(cardId, true, { width: CARD_W, backAccent: ACCENT });
        mesh.userData.pickCardId = cardId;
        this.fxGroup.add(mesh);
        return { mesh, cardId, target: new THREE.Object3D() };
      });
    }
    this.hand.forEach((actor, index) => {
      const isSelected = selected.includes(actor.cardId);
      actor.target = handCardPose(index, this.hand.length, isSelected);
    });
  }

  private clearTable() {
    for (const group of this.tableGroups) {
      this.fxGroup.remove(group);
      disposeObjectTree(group);
    }
    this.tableGroups = [];
  }

  private syncTable(view: DouDizhuView, players: DouDizhuPlayerInfo[], selfId: string) {
    this.clearTable();
    const selfSeat = Math.max(0, players.findIndex((player) => player.id === selfId));
    // 底牌：决定地主后亮在桌顶。
    if (view.bottom && view.landlordId) {
      const group = new THREE.Group();
      view.bottom.forEach((cardId, index) => {
        const card = createCardMesh(cardId, true, { width: 0.62, backAccent: ACCENT });
        const pose = trickCardPose(new THREE.Vector3(0, 0, -4.9), index, 3);
        card.position.copy(pose.position);
        card.rotation.copy(pose.rotation);
        group.add(card);
      });
      this.fxGroup.add(group);
      this.tableGroups.push(group);
    }
    // 当前一轮的出牌/过牌。
    for (const play of view.plays) {
      const seat = players.findIndex((player) => player.id === play.playerId);
      if (seat < 0) continue;
      const anchor = seatAnchor(seat, selfSeat);
      const group = new THREE.Group();
      if (play.cards) {
        play.cards.forEach((cardId, index) => {
          const card = createCardMesh(cardId, true, { width: 0.8, backAccent: ACCENT });
          const pose = trickCardPose(anchor, index, play.cards!.length);
          card.position.copy(pose.position);
          card.rotation.copy(pose.rotation);
          group.add(card);
        });
      } else {
        const label = createLabelSprite('不要', 1.5, { color: '#cbbfa4', background: 'rgba(20,24,18,0.66)' });
        label.position.set(anchor.x, 0.6, anchor.z);
        group.add(label);
      }
      this.fxGroup.add(group);
      this.tableGroups.push(group);
    }
    // 上一手仍在桌面（两人都不要时 plays 会清空，保留最后出牌展示）。
    if (view.plays.length === 0 && view.lastPlay) {
      const seat = players.findIndex((player) => player.id === view.lastPlay!.playerId);
      if (seat >= 0) {
        const anchor = seatAnchor(seat, selfSeat);
        const group = new THREE.Group();
        for (const cardId of view.lastPlay.combo.cards) {
          const card = createCardMesh(cardId, true, { width: 0.8, backAccent: ACCENT });
          const pose = trickCardPose(anchor, 0, 1);
          card.position.copy(pose.position);
          card.rotation.copy(pose.rotation);
          group.add(card);
        }
        // 展开成一行。
        group.children.forEach((child, index) => {
          const spacing = Math.min(0.78, 5.6 / Math.max(group.children.length, 1));
          child.position.x = anchor.x + (index - (group.children.length - 1) / 2) * spacing;
        });
        this.fxGroup.add(group);
        this.tableGroups.push(group);
      }
    }
    void flipCard;
    void parseDouDizhuCombo;
  }

  private fanGroups = new Map<string, THREE.Group>();
  private badgeSignature = '';

  private syncBadges(view: DouDizhuView, players: DouDizhuPlayerInfo[], selfId: string) {
    // 对家牌背扇与徽章按签名重建：仅在手牌数/回合/庄家变化时更新，平时零重建。
    const fanSignature = players.map((player) => `${player.id}:${view.handCounts[player.id] ?? 0}`).join('|');
    if (fanSignature !== this.fanSignature) {
      this.fanSignature = fanSignature;
      for (const group of this.fanGroups.values()) {
        this.fxGroup.remove(group);
        disposeObjectTree(group);
      }
      this.fanGroups.clear();
      const selfSeat = Math.max(0, players.findIndex((player) => player.id === selfId));
      for (let seat = 0; seat < players.length; seat += 1) {
        const relative = (seat - selfSeat + 3) % 3;
        if (relative === 0) continue;
        const count = Math.min(view.handCounts[players[seat]!.id] ?? 0, 17);
        if (count === 0) continue;
        const anchor = seatAnchor(seat, selfSeat).clone().add(new THREE.Vector3(0, 0, -1.7));
        const backGroup = new THREE.Group();
        for (let index = 0; index < count; index += 1) {
          const card = createCardMesh(0, false, { width: 0.5, backAccent: ACCENT });
          const t = count === 1 ? 0 : (index / (count - 1)) * 2 - 1;
          card.position.set(anchor.x + t * 1.5, 1.62, anchor.z - 0.2 + Math.abs(t) * 0.12);
          card.rotation.set(-1.35, t * 0.32, 0);
          backGroup.add(card);
        }
        this.fxGroup.add(backGroup);
        this.fanGroups.set(players[seat]!.id, backGroup);
      }
    }

    const badgeSignature = JSON.stringify([
      view.turnSeat,
      view.landlordId,
      view.phase,
      view.bids.map((entry) => [entry.playerId, entry.points]),
      players.map((player) => player.id),
      selfId,
    ]);
    if (badgeSignature === this.badgeSignature) return;
    this.badgeSignature = badgeSignature;
    for (const badge of this.badges) {
      this.fxGroup.remove(badge);
      badge.material.dispose();
    }
    this.badges = [];
    if (view.phase === 'finished') return;
    const selfSeat = Math.max(0, players.findIndex((player) => player.id === selfId));
    players.forEach((player, seat) => {
      const relative = (seat - selfSeat + 3) % 3;
      const anchor = relative === 0 ? new THREE.Vector3(0, 0, 7.6) : seatAnchor(seat, selfSeat).clone().add(new THREE.Vector3(0, 0, -1.7));
      const isTurn = view.turnSeat === seat && view.phase !== 'hand-result';
      const isLandlord = view.landlordId === player.id;
      const badge = createAvatarBadge(player.avatar, isTurn ? ACCENT : isLandlord ? '#ffce5455' : 'rgba(120,110,96,0.5)', relative === 0 ? 0 : 1.35);
      if (relative !== 0) badge.position.set(anchor.x, 2.35, anchor.z + 0.4);
      this.fxGroup.add(badge);
      this.badges.push(badge);
      const tag = `${isLandlord ? '👑' : ''}${player.nickname}${player.id === selfId ? '（我）' : ''} · ${view.handCounts[player.id] ?? 0} 张`;
      const label = createLabelSprite(tag, 3.0, { color: isTurn ? ACCENT : '#e4dac2', bold: isTurn || isLandlord });
      label.position.set(anchor.x, relative === 0 ? 1.5 : 1.55, anchor.z + 0.4);
      this.fxGroup.add(label);
      this.badges.push(label);
      // 叫分气泡。
      const myBid = view.bids.find((entry) => entry.playerId === player.id);
      if (view.phase === 'bidding' && myBid && relative !== 0) {
        const bubble = createLabelSprite(myBid.points === 0 ? '不叫' : `${myBid.points} 分`, 1.5, {
          color: myBid.points === 0 ? '#b8ad93' : ACCENT,
          background: 'rgba(24,20,14,0.8)',
        });
        bubble.position.set(anchor.x, 2.9, anchor.z + 0.6);
        this.fxGroup.add(bubble);
        this.badges.push(bubble);
      }
    });
  }

  private fanSignature = '';

  /** 屏幕坐标 → 自己手牌的 cardId（tap 选择用）。 */
  pickCardAt(clientX: number, clientY: number, rect: DOMRect): number | null {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.hand.map((actor) => actor.mesh), true);
    if (hits.length === 0) return null;
    let object: THREE.Object3D | null = hits[0]!.object;
    while (object && object.userData.pickCardId === undefined) object = object.parent;
    return object ? (object.userData.pickCardId as number) : null;
  }

  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean) {
    this.clock = timeSeconds;
    this.stage.update(timeSeconds, deltaSeconds, reducedMotion);
    for (const actor of this.hand) {
      actor.mesh.position.x = damp(actor.mesh.position.x, actor.target.position.x, 10, deltaSeconds);
      actor.mesh.position.y = damp(actor.mesh.position.y, actor.target.position.y, 10, deltaSeconds);
      actor.mesh.position.z = damp(actor.mesh.position.z, actor.target.position.z, 10, deltaSeconds);
      actor.mesh.rotation.x = damp(actor.mesh.rotation.x, actor.target.rotation.x, 10, deltaSeconds);
      actor.mesh.rotation.y = damp(actor.mesh.rotation.y, actor.target.rotation.y, 10, deltaSeconds);
    }
    void this.clock;
  }

  resize(width: number, height: number) {
    this.stage.resize(width, height);
  }

  dispose() {
    for (const actor of this.hand) disposeObjectTree(actor.mesh);
    this.hand = [];
    this.clearTable();
    this.stage.dispose();
  }
}
