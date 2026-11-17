import * as THREE from 'three';
import type { GomokuView } from '@party/games';
import { GOMOKU_BOARD_SIZE } from '@party/protocol';
import { CameraRig, createStage, damp } from '../tabletop/TabletopStage';
import type { TabletopScene } from '../tabletop/TabletopStage';
import { createAvatarBadge, createLabelSprite, disposeObjectTree } from '../tabletop/props';
import { woodTexture } from '../tabletop/textures';

// ---------------------------------------------------------------------------
// 五子棋 3D 场景：胡桃木棋盘 + 玉石质感棋子。视图差异驱动：
// 新落子从空中落下弹一下，胜利五子点亮金色光环。
// ---------------------------------------------------------------------------

const CELL = 1;
const MARGIN = 1.1;
const BOARD_UNITS = (GOMOKU_BOARD_SIZE - 1) * CELL + MARGIN * 2;
const STONE_R = 0.46;
const ACCENT = '#e8b04b';

/** 交叉点 → 世界坐标（棋盘面 y=0）。 */
export function cellToWorld(x: number, y: number): THREE.Vector3 {
  const offset = (GOMOKU_BOARD_SIZE - 1) / 2;
  return new THREE.Vector3((x - offset) * CELL, 0, (y - offset) * CELL);
}

/** 世界坐标 → 最近交叉点（拾取用，超出棋盘返回 null）。 */
export function worldToCell(point: THREE.Vector3): { x: number; y: number } | null {
  const offset = (GOMOKU_BOARD_SIZE - 1) / 2;
  const x = Math.round(point.x / CELL + offset);
  const y = Math.round(point.z / CELL + offset);
  if (x < 0 || x >= GOMOKU_BOARD_SIZE || y < 0 || y >= GOMOKU_BOARD_SIZE) return null;
  return { x, y };
}

function boardTopTexture(): THREE.Texture {
  const size = 1_024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(woodTexture('walnut').image as CanvasImageSource, 0, 0, size, size);
  // 网格线：留出边距，15 条经纬线。
  const gridSpan = size * 0.858;
  const step = gridSpan / (GOMOKU_BOARD_SIZE - 1);
  const start = (size - gridSpan) / 2;
  ctx.strokeStyle = 'rgba(46,30,16,0.85)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  for (let index = 0; index < GOMOKU_BOARD_SIZE; index += 1) {
    const position = start + step * index;
    ctx.moveTo(start, position);
    ctx.lineTo(size - start, position);
    ctx.moveTo(position, start);
    ctx.lineTo(position, size - start);
  }
  ctx.stroke();
  // 星位。
  ctx.fillStyle = 'rgba(40,25,12,0.95)';
  for (const star of [3, 7, 11]) {
    for (const starY of [3, 7, 11]) {
      ctx.beginPath();
      ctx.arc(start + step * star, start + step * starY, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

interface StoneActor {
  mesh: THREE.Group;
  bornAt: number;
  x: number;
  y: number;
}

export interface GomokuPlayers {
  id: string;
  nickname: string;
  avatar: string;
}

export class GomokuWorld implements TabletopScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly stage: ReturnType<typeof createStage>;
  private readonly stones = new Map<string, StoneActor>();
  private readonly boardGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();
  private readonly raycaster = new THREE.Raycaster();
  private readonly pickPlane: THREE.Mesh;
  private readonly stoneGeometry = new THREE.SphereGeometry(STONE_R, 26, 18);
  private readonly stoneMaterials = {
    black: new THREE.MeshStandardMaterial({ color: '#17161c', roughness: 0.28, metalness: 0.16 }),
    white: new THREE.MeshStandardMaterial({ color: '#f3ecdc', roughness: 0.42, metalness: 0.04 }),
  };
  private hoverMesh: THREE.Mesh | null = null;
  private lastMoveRing: THREE.Mesh | null = null;
  private winDiscs: THREE.Mesh[] = [];
  private labels: THREE.Sprite[] = [];
  private clock = 0;

  constructor(shadows: boolean) {
    this.stage = createStage({ accent: ACCENT, ambience: '#15100c', shadows });
    this.scene = this.stage.scene;
    this.rig = this.stage.rig;
    this.camera = this.rig.camera;
    this.rig.snap({ focus: new THREE.Vector3(0, 0, 0.4), yaw: 0.0, pitch: 1.02, distance: 21.5 });

    // 棋盘：面 + 深色侧沿 + 桌面投影。
    const boardTop = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_UNITS, 0.5, BOARD_UNITS),
      [
        new THREE.MeshStandardMaterial({ color: '#5b3a20', roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: '#5b3a20', roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ map: boardTopTexture(), roughness: 0.58, metalness: 0.04 }),
        new THREE.MeshStandardMaterial({ color: '#4a2e18', roughness: 0.75 }),
        new THREE.MeshStandardMaterial({ color: '#5b3a20', roughness: 0.7 }),
        new THREE.MeshStandardMaterial({ color: '#5b3a20', roughness: 0.7 }),
      ],
    );
    boardTop.position.y = -0.25;
    boardTop.receiveShadow = shadows;
    boardTop.castShadow = shadows;
    this.boardGroup.add(boardTop);

    const rim = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_UNITS + 0.7, 0.34, BOARD_UNITS + 0.7),
      new THREE.MeshStandardMaterial({ color: '#2c1c0f', roughness: 0.66 }),
    );
    rim.position.y = -0.58;
    rim.receiveShadow = true;
    this.boardGroup.add(rim);
    this.scene.add(this.boardGroup);
    this.scene.add(this.fxGroup);

    this.pickPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(BOARD_UNITS, BOARD_UNITS),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.pickPlane.rotation.x = -Math.PI / 2;
    this.scene.add(this.pickPlane);
    this.updateShadowCasting(shadows);
  }

  private updateShadowCasting(shadows: boolean) {
    this.stage.keyLight.castShadow = shadows;
  }

  resize(width: number, height: number) {
    this.stage.resize(width, height);
  }

  /** 旋转视角（限制在舒适范围内）。 */
  orbit(deltaYaw: number) {
    this.rigGoalYaw = THREE.MathUtils.clamp(this.rigGoalYaw + deltaYaw, -0.85, 0.85);
    this.rig.setGoal({ yaw: this.rigGoalYaw });
  }

  private rigGoalYaw = 0;

  setState(view: GomokuView, players: GomokuPlayers[], selfId: string) {
    const seen = new Set<string>();
    view.board.forEach((cell, index) => {
      if (cell === null) return;
      const x = index % GOMOKU_BOARD_SIZE;
      const y = Math.floor(index / GOMOKU_BOARD_SIZE);
      const key = `${x},${y}`;
      seen.add(key);
      if (!this.stones.has(key)) this.addStone(x, y, cell);
    });
    for (const [key, actor] of this.stones) {
      if (!seen.has(key)) {
        this.fxGroup.remove(actor.mesh);
        disposeObjectTree(actor.mesh);
        this.stones.delete(key);
      }
    }
    this.updateLastMoveRing(view);
    this.updateWinDiscs(view);
    this.updatePlayerBadges(view, players, selfId);
    // 悬停提示只在轮到自己且棋盘未结束时显示。
    this.updateHoverAvailability(view);
  }

  private addStone(x: number, y: number, cell: 0 | 1) {
    const mesh = new THREE.Group();
    const stone = new THREE.Mesh(this.stoneGeometry, this.stoneMaterials[cell === 0 ? 'black' : 'white']!);
    stone.scale.y = 0.52;
    stone.castShadow = true;
    stone.receiveShadow = true;
    mesh.add(stone);
    const world = cellToWorld(x, y);
    mesh.position.set(world.x, 1.4, world.z);
    this.fxGroup.add(mesh);
    this.stones.set(`${x},${y}`, { mesh, bornAt: this.clock, x, y });
  }

  private updateLastMoveRing(view: GomokuView) {
    const has = view.lastMove !== null && view.phase !== 'finished';
    if (!has) {
      if (this.lastMoveRing) {
        this.fxGroup.remove(this.lastMoveRing);
        disposeObjectTree(this.lastMoveRing);
        this.lastMoveRing = null;
      }
      return;
    }
    const { x, y } = view.lastMove!;
    if (!this.lastMoveRing) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(STONE_R * 0.62, 0.05, 10, 28),
        new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.95 }),
      );
      ring.rotation.x = -Math.PI / 2;
      this.lastMoveRing = ring;
      this.fxGroup.add(ring);
    }
    const world = cellToWorld(x, y);
    this.lastMoveRing.position.set(world.x, STONE_R * 0.52 + 0.05, world.z);
  }

  private updateWinDiscs(view: GomokuView) {
    for (const disc of this.winDiscs) {
      this.fxGroup.remove(disc);
      disposeObjectTree(disc);
    }
    this.winDiscs = [];
    if (!view.winLine || view.boardWinnerId === null) return;
    for (const point of view.winLine) {
      const disc = new THREE.Mesh(
        new THREE.TorusGeometry(STONE_R * 0.86, 0.055, 10, 30),
        new THREE.MeshBasicMaterial({ color: '#ffd76e', transparent: true, opacity: 0.96 }),
      );
      disc.rotation.x = -Math.PI / 2;
      const world = cellToWorld(point.x, point.y);
      disc.position.set(world.x, STONE_R * 0.52 + 0.08, world.z);
      this.fxGroup.add(disc);
      this.winDiscs.push(disc);
    }
  }

  private updatePlayerBadges(view: GomokuView, players: GomokuPlayers[], selfId: string) {
    for (const label of this.labels) {
      this.fxGroup.remove(label);
      label.material.dispose();
    }
    this.labels = [];
    if (view.phase === 'finished') return;
    const blackId = view.blackSeat < players.length ? players[view.blackSeat]!.id : null;
    void blackId;
    const turnId = view.turnSeat !== null && view.turnSeat < players.length ? players[view.turnSeat]!.id : null;
    players.forEach((player, index) => {
      const isTurn = player.id === turnId;
      const side = index === 0 ? -1 : 1;
      const badge = createAvatarBadge(player.avatar, isTurn ? ACCENT : 'rgba(120,110,96,0.5)', 1.15);
      badge.position.set(side * (BOARD_UNITS / 2 + 2.1), 1.05, BOARD_UNITS / 2 - 1.4);
      this.fxGroup.add(badge);
      this.labels.push(badge);
      const name = createLabelSprite(`${player.nickname}${player.id === selfId ? '（我）' : ''}`, 2.6, {
        color: isTurn ? '#ffd76e' : '#ded4bd',
        bold: isTurn,
      });
      name.position.set(side * (BOARD_UNITS / 2 + 2.1), 0.28, BOARD_UNITS / 2 - 1.4);
      this.fxGroup.add(name);
      this.labels.push(name);
    });
  }

  private hoverEnabled = false;
  private updateHoverAvailability(view: GomokuView) {
    this.hoverEnabled = view.phase === 'playing';
  }

  setHover(cell: { x: number; y: number } | null, color: 0 | 1 = 0) {
    if (this.hoverMesh) {
      this.fxGroup.remove(this.hoverMesh);
      disposeObjectTree(this.hoverMesh);
      this.hoverMesh = null;
    }
    if (!cell || !this.hoverEnabled) return;
    const ghost = new THREE.Mesh(
      this.stoneGeometry,
      new THREE.MeshStandardMaterial({
        color: color === 0 ? '#17161c' : '#f3ecdc',
        roughness: 0.4,
        transparent: true,
        opacity: 0.42,
      }),
    );
    ghost.scale.y = 0.52;
    const world = cellToWorld(cell.x, cell.y);
    ghost.position.set(world.x, 0, world.z);
    this.fxGroup.add(ghost);
    this.hoverMesh = ghost;
  }

  /** 拾取：屏幕坐标 → 交叉点。 */
  pickCell(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number } | null {
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObject(this.pickPlane, false);
    if (hits.length === 0) return null;
    return worldToCell(hits[0]!.point);
  }

  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean) {
    this.clock = timeSeconds;
    this.stage.update(timeSeconds, deltaSeconds, reducedMotion);
    for (const actor of this.stones.values()) {
      const age = timeSeconds - actor.bornAt;
      if (age < 0.6) {
        // 落子：从高处落下并轻微回弹。
        const progress = Math.min(1, age / 0.45);
        const eased = 1 - (1 - progress) ** 3;
        const bounce = progress < 1 ? Math.sin(progress * Math.PI) * 0.06 : 0;
        actor.mesh.position.y = damp(actor.mesh.position.y, 1.4 - eased * 1.4 + bounce, 18, deltaSeconds);
      } else if (actor.mesh.position.y > 0) {
        actor.mesh.position.y = damp(actor.mesh.position.y, 0, 20, deltaSeconds);
      }
    }
    if (this.lastMoveRing) {
      const pulse = 0.85 + Math.sin(timeSeconds * 4) * 0.15;
      (this.lastMoveRing.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
    for (const disc of this.winDiscs) {
      const pulse = 0.7 + Math.sin(timeSeconds * 3.2) * 0.3;
      (disc.material as THREE.MeshBasicMaterial).opacity = pulse;
    }
  }

  dispose() {
    for (const actor of this.stones.values()) disposeObjectTree(actor.mesh);
    this.stones.clear();
    this.stage.dispose();
  }
}
