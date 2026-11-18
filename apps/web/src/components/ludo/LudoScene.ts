import * as THREE from 'three';
import type { LudoView } from '@party/games';
import { LUDO_FLY_DISTANCE, LUDO_FLY_FROM, LUDO_HOME_STEPS, LUDO_RING_SIZE } from '@party/games';
import { CameraRig, createStage, damp } from '../tabletop/TabletopStage';
import type { TabletopScene } from '../tabletop/TabletopStage';
import { createAvatarBadge, createDiceMesh, createLabelSprite, disposeObjectTree, faceDiceUp } from '../tabletop/props';
import { woodTexture } from '../tabletop/textures';

// ---------------------------------------------------------------------------
// 飞行棋 3D 场景：标准飞行棋布局——52 格方形环道 + 四角机场 +
// 从四条边垂直指向中心的直线跑道 + 中央四色大本营。
// 纯函数布局可脱离 WebGL 单测；场景只做差异驱动的摆放与动画。
// ---------------------------------------------------------------------------

export const LUDO_SEAT_COLORS = ['#e0524a', '#e8b33c', '#4f7bd9', '#58a95c'] as const;
const RING_HALF = 6.5;
const HANGAR_CENTER = 8.0;
const ACCENT = '#ffd76e';

/** 环道格 k(0..51) → 世界坐标（顺时针方形环）。 */
export function ringCellWorld(k: number): THREE.Vector3 {
  const index = ((k % LUDO_RING_SIZE) + LUDO_RING_SIZE) % LUDO_RING_SIZE;
  const side = Math.floor(index / 13);
  const t = index % 13;
  if (side === 0) return new THREE.Vector3(-RING_HALF + t, 0, -RING_HALF);
  if (side === 1) return new THREE.Vector3(RING_HALF, 0, -RING_HALF + t);
  if (side === 2) return new THREE.Vector3(RING_HALF - t, 0, RING_HALF);
  return new THREE.Vector3(-RING_HALF, 0, RING_HALF - t);
}

/** 座位 i 的入口 corner（环道 i*13 处）方向。 */
export function seatCorner(seat: number): THREE.Vector3 {
  const entry = ringCellWorld(seat * 13);
  return entry.clone().normalize();
}

/** 座位 i 的跑道入口：环道上离家门两格处（p=50 对应的格子）。 */
function laneEntryWorld(seat: number): THREE.Vector3 {
  return ringCellWorld(seat * 13 + 50);
}

/** 终点跑道第 h 格（h=0..5）：从本方入口贴边垂直指向中心的直线。 */
export function homeCellWorld(seat: number, h: number): THREE.Vector3 {
  const entry = laneEntryWorld(seat);
  // 入口贴着某条边：沿指向中心的轴向逐格推进，跑道因此永远垂直于该边。
  if (Math.abs(entry.x) > Math.abs(entry.z)) {
    const step = -Math.sign(entry.x);
    return new THREE.Vector3(entry.x + step * (h + 1), 0, entry.z);
  }
  const step = -Math.sign(entry.z);
  return new THREE.Vector3(entry.x, 0, entry.z + step * (h + 1));
}

/** 停机坪位（seat 机场 2×2 之一）。 */
export function hangarSlotWorld(seat: number, index: number): THREE.Vector3 {
  const corner = seatCorner(seat);
  const center = corner.clone().multiplyScalar(HANGAR_CENTER);
  const dx = (index % 2 - 0.5) * 1.5;
  const dz = (Math.floor(index / 2) - 0.5) * 1.5;
  const sideways = new THREE.Vector3(-corner.z, 0, corner.x);
  return center.add(sideways.multiplyScalar(dx)).add(corner.multiplyScalar(dz));
}

/** 飞机所在世界坐标：停机坪 / 环道 / 终点跑道 / 大本营（到家按编号分散）。 */
export function planeWorld(seat: number, p: number, index: number): THREE.Vector3 {
  if (p < 0) return hangarSlotWorld(seat, index);
  if (p >= LUDO_HOME_STEPS) {
    // 到家：停进中央大本营本方扇区，四架按编号排开，不叠在同一点。
    const corner = seatCorner(seat);
    const sideways = new THREE.Vector3(-corner.z, 0, corner.x);
    return corner.clone().multiplyScalar(1.15).add(sideways.multiplyScalar((index - 1.5) * 0.62));
  }
  if (p >= 50) return homeCellWorld(seat, p - 50);
  return ringCellWorld(seat * 13 + p);
}

export interface LudoCellStyle {
  /** 染本方颜色（己色格、起飞格、飞行格）。 */
  tinted: boolean;
  /** 起飞格（p=0）：额外描白圈。 */
  entry: boolean;
  /** 飞行格（p=18）：额外标金星。 */
  fly: boolean;
}

/** 相对座位 p 的格子样式：己色格 p%4==2，起飞格与飞行格一并染色。 */
export function ludoCellStyle(p: number): LudoCellStyle {
  if (p < 0 || p > 49) return { tinted: false, entry: false, fly: false };
  const entry = p === 0;
  const fly = p === 18;
  return { tinted: entry || fly || p % 4 === 2, entry, fly };
}

/** 座位 s 的虚线飞行航线：从飞行格（p=18）横穿棋盘到落点（p=30）。 */
export function flyLaneWorld(seat: number): { from: THREE.Vector3; to: THREE.Vector3 } {
  return { from: ringCellWorld(seat * 13 + LUDO_FLY_FROM), to: ringCellWorld(seat * 13 + LUDO_FLY_FROM + LUDO_FLY_DISTANCE) };
}

/** 航线与对面家终点跑道的交叉点（对面跑道第 3 格）。 */
export function flyCrossWorld(seat: number): THREE.Vector3 {
  return homeCellWorld((seat + 2) % 4, 2);
}

/** 圆角矩形 Shape（机场色块用）。 */
function roundedSquareShape(size: number, radius: number): THREE.Shape {
  const half = size / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half + radius, -half);
  shape.lineTo(half - radius, -half);
  shape.absarc(half - radius, -half + radius, radius, -Math.PI / 2, 0, false);
  shape.lineTo(half, half - radius);
  shape.absarc(half - radius, half - radius, radius, 0, Math.PI / 2, false);
  shape.lineTo(-half + radius, half);
  shape.absarc(-half + radius, half - radius, radius, Math.PI / 2, Math.PI, false);
  shape.lineTo(-half, -half + radius);
  shape.absarc(-half + radius, -half + radius, radius, Math.PI, Math.PI * 1.5, false);
  return shape;
}

/** 纸飞机造型（拉长锥 + 双翼 + 尾翼 + 编号牌）。 */
export function createPlaneMesh(seat: number, index: number): THREE.Group {
  const color = LUDO_SEAT_COLORS[seat] ?? LUDO_SEAT_COLORS[0]!;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.34, metalness: 0.18 });
  const group = new THREE.Group();
  // 机身：纸飞机造型（拉长锥 + 双翼 + 尾翼）。
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.78, 5), material);
  body.rotation.x = Math.PI / 2;
  body.castShadow = true;
  group.add(body);
  const wingGeometry = new THREE.BoxGeometry(0.78, 0.05, 0.3);
  const wing = new THREE.Mesh(wingGeometry, material);
  wing.position.set(0, 0.02, -0.1);
  wing.castShadow = true;
  group.add(wing);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.2), material);
  tail.position.set(0, 0.06, 0.3);
  group.add(tail);
  // 编号牌：悬浮在机身上方，玩家能看清是几号机。
  const badge = createLabelSprite(`${index + 1}`, 0.6, {
    color: '#221b10',
    background: '#fffbe8',
    bold: true,
  });
  badge.position.set(0, 0.52, 0);
  badge.userData.numberBadge = index + 1;
  group.add(badge);
  return group;
}

interface PlaneActor {
  group: THREE.Group;
  seat: number;
  index: number;
  targetP: number;
  liftUntil: number;
}

export interface LudoPlayerInfo {
  id: string;
  nickname: string;
  avatar: string;
}

export class LudoWorld implements TabletopScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly stage: ReturnType<typeof createStage>;
  private readonly actors = new Map<string, PlaneActor>();
  private readonly boardGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPlane: THREE.Mesh;
  private readonly dice: ReturnType<typeof createDiceMesh>;
  private diceValue = 0;
  private diceSpinUntil = 0;
  private clock = 0;
  private badges: THREE.Sprite[] = [];
  private highlights: THREE.Mesh[] = [];

  constructor(shadows: boolean) {
    this.stage = createStage({ accent: ACCENT, ambience: '#101613', shadows });
    this.scene = this.stage.scene;
    this.rig = this.stage.rig;
    this.camera = this.rig.camera;
    this.rig.snap({ focus: new THREE.Vector3(0, 0, 0.4), yaw: 0.35, pitch: 0.98, distance: 21 });

    this.buildBoard();
    this.scene.add(this.boardGroup);
    this.scene.add(this.fxGroup);

    this.dice = createDiceMesh(1.15);
    this.dice.position.set(0, 0.95, 0);
    this.fxGroup.add(this.dice);
    faceDiceUp(this.dice, 6, 0.1);

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);
  }

  private buildBoard() {
    // 底板：奶油木质 + 深色包边。
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(17.4, 0.5, 17.4),
      new THREE.MeshStandardMaterial({ map: woodTexture('oak'), roughness: 0.66 }),
    );
    base.position.y = -0.4;
    base.receiveShadow = true;
    this.boardGroup.add(base);
    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(18.1, 0.32, 18.1),
      new THREE.MeshStandardMaterial({ color: '#3a2c1c', roughness: 0.6 }),
    );
    rim.position.y = -0.66;
    this.boardGroup.add(rim);

    const tileGeometry = new THREE.BoxGeometry(0.88, 0.14, 0.88);
    const plainMaterial = new THREE.MeshStandardMaterial({ color: '#f4ecd8', roughness: 0.6 });
    const seatMaterials = LUDO_SEAT_COLORS.map((color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }));

    // 环道 52 格：一格一主。己色格/起飞格/飞行格染本方颜色，起飞格描白圈，飞行格标金星。
    for (let k = 0; k < LUDO_RING_SIZE; k += 1) {
      let colorSeat: number | null = null;
      let entrySeat: number | null = null;
      let flySeat: number | null = null;
      for (let seat = 0; seat < 4; seat += 1) {
        const p = (((k - seat * 13) % LUDO_RING_SIZE) + LUDO_RING_SIZE) % LUDO_RING_SIZE;
        const style = ludoCellStyle(p);
        if (style.tinted) colorSeat = seat;
        if (style.entry) entrySeat = seat;
        if (style.fly) flySeat = seat;
      }
      const world = ringCellWorld(k);
      const tile = new THREE.Mesh(tileGeometry, colorSeat !== null ? seatMaterials[colorSeat]! : plainMaterial);
      tile.position.set(world.x, 0, world.z);
      tile.receiveShadow = true;
      this.boardGroup.add(tile);
      if (entrySeat !== null) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(0.52, 0.035, 8, 22),
          new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(world.x, 0.12, world.z);
        this.boardGroup.add(ring);
      }
      if (flySeat !== null) {
        const star = new THREE.Mesh(
          new THREE.TorusGeometry(0.4, 0.05, 8, 5),
          new THREE.MeshBasicMaterial({ color: ACCENT }),
        );
        star.rotation.x = -Math.PI / 2;
        star.position.set(world.x, 0.12, world.z);
        this.boardGroup.add(star);
      }
    }

    for (let seat = 0; seat < 4; seat += 1) {
      // 终点跑道：本方颜色直线格子一路指向大本营。
      for (let h = 0; h < 6; h += 1) {
        const world = homeCellWorld(seat, h);
        const lane = new THREE.Mesh(tileGeometry, seatMaterials[seat]!);
        lane.position.set(world.x, 0.02, world.z);
        lane.scale.setScalar(0.94 - h * 0.02);
        this.boardGroup.add(lane);
      }
      // 机场：四角方形圆角色块 + 白描边 + 2×2 停机位圆环（标准飞行棋观感）。
      const hangar = seatCorner(seat).multiplyScalar(HANGAR_CENTER);
      const rimShape = new THREE.Mesh(
        new THREE.ShapeGeometry(roundedSquareShape(4.0, 0.55)),
        new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.62 }),
      );
      rimShape.rotation.x = -Math.PI / 2;
      rimShape.position.set(hangar.x, -0.07, hangar.z);
      this.boardGroup.add(rimShape);
      const pad = new THREE.Mesh(
        new THREE.ShapeGeometry(roundedSquareShape(3.76, 0.45)),
        new THREE.MeshStandardMaterial({ color: LUDO_SEAT_COLORS[seat]!, roughness: 0.7 }),
      );
      pad.rotation.x = -Math.PI / 2;
      pad.position.set(hangar.x, -0.055, hangar.z);
      this.boardGroup.add(pad);
      for (let index = 0; index < 4; index += 1) {
        const slot = hangarSlotWorld(seat, index);
        const padRim = new THREE.Mesh(
          new THREE.TorusGeometry(0.55, 0.05, 8, 26),
          new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
        );
        padRim.rotation.x = -Math.PI / 2;
        padRim.position.set(slot.x, -0.02, slot.z);
        this.boardGroup.add(padRim);
      }
    }

    // 中央大本营：四色扇形拼盘，各家扇区正对自家角（到家飞机就停在那里）。
    for (let seat = 0; seat < 4; seat += 1) {
      const sector = new THREE.Mesh(
        new THREE.CircleGeometry(2.35, 18, Math.PI / 2 - (seat * Math.PI) / 2, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: LUDO_SEAT_COLORS[seat]!, roughness: 0.6 }),
      );
      sector.rotation.x = -Math.PI / 2;
      sector.position.y = 0.02;
      this.boardGroup.add(sector);
    }
    const hub = new THREE.Mesh(
      new THREE.CircleGeometry(0.9, 24),
      new THREE.MeshStandardMaterial({ color: '#fffbe8', roughness: 0.5 }),
    );
    hub.rotation.x = -Math.PI / 2;
    hub.position.y = 0.05;
    this.boardGroup.add(hub);

    // 虚线飞行航线：从各家飞行格横穿棋盘到对面落点，与对面家终点跑道交叉。
    for (let seat = 0; seat < 4; seat += 1) {
      const lane = flyLaneWorld(seat);
      const points = [
        new THREE.Vector3(lane.from.x, 0.14, lane.from.z),
        new THREE.Vector3(lane.to.x, 0.14, lane.to.z),
      ];
      const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(lineGeometry, new THREE.LineDashedMaterial({
        color: LUDO_SEAT_COLORS[seat]!,
        dashSize: 0.42,
        gapSize: 0.3,
        transparent: true,
        opacity: 0.9,
      }));
      line.computeLineDistances();
      this.boardGroup.add(line);
      // 航线起终点小色块，明确「从这里起飞、落到对面」。
      for (const end of [lane.from, lane.to]) {
        const dot = new THREE.Mesh(
          new THREE.CircleGeometry(0.3, 20),
          new THREE.MeshBasicMaterial({ color: LUDO_SEAT_COLORS[seat]! }),
        );
        dot.rotation.x = -Math.PI / 2;
        dot.position.set(end.x, 0.13, end.z);
        this.boardGroup.add(dot);
      }
      // 交叉点标记：航线穿过对面家跑道的位置，停在这里的飞机会被撞回机场。
      const cross = flyCrossWorld(seat);
      const crossMark = new THREE.Mesh(
        new THREE.TorusGeometry(0.36, 0.06, 8, 24),
        new THREE.MeshBasicMaterial({ color: '#fffbe8' }),
      );
      crossMark.rotation.x = -Math.PI / 2;
      crossMark.position.set(cross.x, 0.16, cross.z);
      this.boardGroup.add(crossMark);
    }
  }

  setState(view: LudoView, players: LudoPlayerInfo[], selfId: string) {
    const seen = new Set<string>();
    // 飞机随游戏状态走（座位固定为开局顺序），房内玩家变动不影响摆放。
    for (const plane of view.planes) {
      const key = `${plane.seat}:${plane.index}`;
      seen.add(key);
      this.syncPlane(plane.seat, plane.index, plane.p);
    }
    for (const [key, actor] of this.actors) {
      if (!seen.has(key)) {
        this.fxGroup.remove(actor.group);
        disposeObjectTree(actor.group);
        this.actors.delete(key);
      }
    }
    // 骰子：换值时旋转一番再停在新点数。
    if (view.lastRoll && view.lastRoll.dice !== this.diceValue) {
      this.diceValue = view.lastRoll.dice;
      this.diceSpinUntil = this.clock + 0.85;
    }
    if (view.phase === 'finished') this.diceSpinUntil = 0;
    this.updateHighlights(view);
    this.updateBadges(view, players, selfId);
  }

  private syncPlane(seat: number, index: number, p: number) {
    const key = `${seat}:${index}`;
    let actor = this.actors.get(key);
    if (!actor) {
      actor = { group: createPlaneMesh(seat, index), seat, index, targetP: p, liftUntil: -1 };
      this.actors.set(key, actor);
      this.fxGroup.add(actor.group);
    }
    if (actor.targetP !== p) {
      actor.liftUntil = this.clock + 0.5;
      actor.targetP = p;
    }
  }

  private updateHighlights(view: LudoView) {
    for (const mesh of this.highlights) {
      this.fxGroup.remove(mesh);
      disposeObjectTree(mesh);
    }
    this.highlights = [];
    const movableGlobalIds = view.seat !== null ? view.movablePlanes.map((index) => view.seat! * 4 + index) : [];
    for (const planeId of movableGlobalIds) {
      const actor = this.actors.get(`${Math.floor(planeId / 4)}:${planeId % 4}`);
      if (!actor) continue;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.52, 0.05, 8, 24),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(actor.group.position).setY(0.1);
      this.fxGroup.add(ring);
      this.highlights.push(ring);
    }
  }

  private updateBadges(view: LudoView, players: LudoPlayerInfo[], selfId: string) {
    for (const badge of this.badges) {
      this.fxGroup.remove(badge);
      badge.material.dispose();
    }
    this.badges = [];
    if (view.phase === 'finished') return;
    view.seats.forEach((seatPlayerId, seat) => {
      const player = players.find((entry) => entry.id === seatPlayerId);
      if (!player) return; // 已退出房间的玩家保留座位，但不再展示徽章。
      const isTurn = view.seat === seat;
      const corner = seatCorner(seat).multiplyScalar(HANGAR_CENTER);
      const badge = createAvatarBadge(player.avatar, isTurn ? ACCENT : 'rgba(130,120,100,0.5)', 1.5);
      badge.position.set(corner.x, 2.0, corner.z);
      this.fxGroup.add(badge);
      this.badges.push(badge);
      const label = createLabelSprite(`${player.nickname}${player.id === selfId ? '（我）' : ''}`, 3.1, {
        color: isTurn ? ACCENT : '#e8dfc9',
        bold: isTurn,
      });
      label.position.set(corner.x, 1.1, corner.z);
      this.fxGroup.add(label);
      this.badges.push(label);
    });
  }

  /** 屏幕坐标 → 可点击飞机（仅高亮可动的）；movable 为全局飞机编号。 */
  pickPlaneAt(clientX: number, clientY: number, rect: DOMRect, movable: number[]): number | null {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const candidates = [...this.actors.values()].filter((actor) => {
      const id = actor.seat * 4 + actor.index;
      return movable.includes(id);
    });
    const meshes = candidates.flatMap((actor) => {
      const parts: THREE.Object3D[] = [];
      actor.group.traverse((child) => {
        child.userData.planeId = actor.seat * 4 + actor.index;
        parts.push(child);
      });
      return parts;
    });
    const hits = this.raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    return hits[0]!.object.userData.planeId as number;
  }

  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean) {
    this.clock = timeSeconds;
    this.stage.update(timeSeconds, deltaSeconds, reducedMotion);
    for (const actor of this.actors.values()) {
      const goal = planeWorld(actor.seat, actor.targetP, actor.index);
      const moving = timeSeconds < actor.liftUntil;
      actor.group.position.x = damp(actor.group.position.x, goal.x, 7, deltaSeconds);
      actor.group.position.z = damp(actor.group.position.z, goal.z, 7, deltaSeconds);
      const baseY = 0.32;
      const lift = moving ? Math.sin(Math.min(1, (actor.liftUntil - timeSeconds) / 0.5) * Math.PI) * 1.15 : 0;
      actor.group.position.y = baseY + lift;
      actor.group.rotation.y += deltaSeconds * (moving ? 9 : 0.8);
    }
    // 骰子：换值时翻滚，落定在最新点数（一面平躺朝上）。
    if (timeSeconds < this.diceSpinUntil) {
      this.dice.rotation.x += deltaSeconds * 14;
      this.dice.rotation.z += deltaSeconds * 9;
    } else if (this.diceValue > 0) {
      faceDiceUp(this.dice, this.diceValue, 0.12);
    }
    for (const mesh of this.highlights) {
      const material = mesh.material as THREE.MeshBasicMaterial;
      material.opacity = 0.55 + Math.sin(timeSeconds * 5.5) * 0.35;
    }

  }

  resize(width: number, height: number) {
    this.stage.resize(width, height);
  }

  dispose() {
    for (const actor of this.actors.values()) disposeObjectTree(actor.group);
    this.actors.clear();
    this.stage.dispose();
  }
}
