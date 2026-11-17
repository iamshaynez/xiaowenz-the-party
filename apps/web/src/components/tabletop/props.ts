import * as THREE from 'three';
import {
  avatarBadgeTexture,
  cardBackTexture,
  cardFaceTexture,
  chipEdgeTexture,
  chipFaceTexture,
  diceFaceTexture,
  dotTexture,
  labelTexture,
} from './textures';

// ---------------------------------------------------------------------------
// 桌面游戏共享的道具工厂：扑克牌、筹码、骰子、徽章与标签。
// 返回的 Group 由各游戏场景负责放置与释放。
// ---------------------------------------------------------------------------

export interface CardMeshOptions {
  width?: number;
  backAccent?: string;
}

// 共享几何体/材质缓存：扑克牌是最高频的道具，绝不逐张分配 GPU 资源。
const cardGeometryCache = new Map<string, { body: THREE.BoxGeometry; face: THREE.PlaneGeometry }>();
const cardFaceMaterialCache = new Map<number, THREE.MeshStandardMaterial>();
const cardBackMaterialCache = new Map<string, THREE.MeshStandardMaterial>();
let cardBodyMaterial: THREE.MeshStandardMaterial | null = null;

function sharedCardAssets(width: number) {
  const key = width.toFixed(2);
  let assets = cardGeometryCache.get(key);
  if (!assets) {
    const height = width * 1.4;
    const depth = width * 0.045;
    assets = {
      body: new THREE.BoxGeometry(width, height, depth, 1, 1, 1),
      face: new THREE.PlaneGeometry(width * 0.96, height * 0.965),
    };
    assets.body.userData.shared = true;
    assets.face.userData.shared = true;
    cardGeometryCache.set(key, assets);
  }
  return assets;
}

/** 一张扑克牌：薄盒身 + 正面牌面 + 背面花纹；几何与材质全部走共享缓存。 */
export function createCardMesh(cardId: number, faceUp: boolean, options: CardMeshOptions = {}): THREE.Group {
  const width = options.width ?? 1;
  const { body: bodyGeometry, face: faceGeometry } = sharedCardAssets(width);
  const group = new THREE.Group();
  cardBodyMaterial ??= new THREE.MeshStandardMaterial({ color: '#f6f1e4', roughness: 0.72, metalness: 0.02 });
  cardBodyMaterial.userData.shared = true;
  const body = new THREE.Mesh(bodyGeometry, cardBodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  let faceMaterial = cardFaceMaterialCache.get(cardId);
  if (!faceMaterial) {
    faceMaterial = new THREE.MeshStandardMaterial({ map: cardFaceTexture(cardId), roughness: 0.6, metalness: 0.02 });
    faceMaterial.userData.shared = true;
    cardFaceMaterialCache.set(cardId, faceMaterial);
  }
  const face = new THREE.Mesh(faceGeometry, faceMaterial);
  face.position.z = bodyGeometry.parameters.depth / 2 + 0.001;
  group.add(face);
  const backKey = options.backAccent ?? '';
  let backMaterial = cardBackMaterialCache.get(backKey);
  if (!backMaterial) {
    backMaterial = new THREE.MeshStandardMaterial({ map: cardBackTexture(backKey || '#c8a24a'), roughness: 0.66 });
    backMaterial.userData.shared = true;
    cardBackMaterialCache.set(backKey, backMaterial);
  }
  const back = new THREE.Mesh(faceGeometry, backMaterial);
  back.position.z = -bodyGeometry.parameters.depth / 2 - 0.001;
  back.rotation.y = Math.PI;
  group.add(back);
  group.userData.cardId = cardId;
  group.userData.face = face;
  group.userData.back = back;
  if (!faceUp) flipCard(group, false);
  return group;
}

/** 翻转一张牌（带动画由场景驱动，这里只设置静止状态）。 */
export function flipCard(card: THREE.Group, faceUp: boolean) {
  card.userData.face.visible = faceUp;
  card.userData.back.visible = !faceUp;
}

// 筹码几何与材质同样按配色共享，避免牌桌上反复分配。
const chipAssetsCache = new Map<string, {
  edge: THREE.CylinderGeometry;
  face: THREE.CylinderGeometry;
  edgeMaterial: THREE.MeshStandardMaterial;
  faceMaterial: THREE.MeshStandardMaterial;
}>();

/** 筹码柱：count 枚筹码错位堆叠（几何/材质共享缓存）。 */
export function createChipStackMesh(count: number, base: string, stripe: string, options: { radius?: number; chipHeight?: number } = {}): THREE.Group {
  const group = new THREE.Group();
  const radius = options.radius ?? 0.22;
  const chipHeight = options.chipHeight ?? 0.06;
  const capped = Math.min(count, 14);
  const key = `${base}:${stripe}:${radius.toFixed(2)}:${chipHeight.toFixed(2)}`;
  let assets = chipAssetsCache.get(key);
  if (!assets) {
    assets = {
      edge: new THREE.CylinderGeometry(radius, radius, chipHeight, 28, 1, true),
      face: new THREE.CylinderGeometry(radius * 0.99, radius * 0.99, chipHeight * 0.2, 28),
      edgeMaterial: new THREE.MeshStandardMaterial({ map: chipEdgeTexture(base, stripe), roughness: 0.5 }),
      faceMaterial: new THREE.MeshStandardMaterial({ map: chipFaceTexture(base, stripe), roughness: 0.45 }),
    };
    assets.edge.userData.shared = true;
    assets.face.userData.shared = true;
    assets.edgeMaterial.userData.shared = true;
    assets.faceMaterial.userData.shared = true;
    chipAssetsCache.set(key, assets);
  }
  for (let index = 0; index < capped; index += 1) {
    const chip = new THREE.Group();
    const edge = new THREE.Mesh(assets.edge, assets.edgeMaterial);
    edge.castShadow = true;
    chip.add(edge);
    const top = new THREE.Mesh(assets.face, assets.faceMaterial);
    top.position.y = chipHeight * 0.42;
    chip.add(top);
    const bottom = new THREE.Mesh(assets.face, assets.faceMaterial);
    bottom.position.y = -chipHeight * 0.42;
    chip.add(bottom);
    chip.position.set(
      (Math.sin(index * 2.399) + Math.cos(index * 1.13)) * radius * 0.08,
      chipHeight * (index + 0.5),
      (Math.cos(index * 2.01) - Math.sin(index * 0.77)) * radius * 0.08,
    );
    chip.rotation.y = index * 0.6;
    group.add(chip);
  }
  return group;
}

/** 骰子：六个点面的圆角方块；setDiceFace 转到指定点数朝上。 */
export function createDiceMesh(size = 0.5): THREE.Group {
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(size, size, size);
  const faceOrder: Array<[number, number]> = [[1, 4], [2, 5], [3, 6]];
  const materials: THREE.Material[] = [];
  for (const [a, b] of faceOrder) {
    for (const pips of [b, a]) {
      materials.push(new THREE.MeshStandardMaterial({ map: diceFaceTexture(pips), roughness: 0.55 }));
    }
  }
  // BoxGeometry 材质顺序：+x,-x,+y,-y,+z,-z；标准骰子对面之和为 7。
  const dice = new THREE.Mesh(geometry, [materials[2]!, materials[3]!, materials[4]!, materials[5]!, materials[0]!, materials[1]!]);
  dice.castShadow = true;
  group.add(dice);
  group.userData.dice = dice;
  return group;
}

/** 让骰子某个点数朝上（+Y），带轻微随机偏转。 */
export function faceDiceUp(group: THREE.Group, pips: number, jitter = 0.18) {
  const dice = group.userData.dice as THREE.Mesh | undefined;
  if (!dice) return;
  // 各点数朝上所需的欧拉角（BoxGeometry 面序 +x,-x,+y,-y,+z,-z）。
  const eulerByPips: Record<number, [number, number, number]> = {
    5: [0, 0, 0],       // +y 已是 5
    2: [Math.PI / 2, 0, 0],
    1: [0, 0, -Math.PI / 2],
    3: [0, 0, Math.PI / 2],
    6: [-Math.PI / 2, 0, 0],
    4: [Math.PI, 0, 0],
  };
  const [rx, ry, rz] = eulerByPips[pips] ?? [0, 0, 0];
  dice.rotation.set(rx + jitter, ry + jitter * 1.7, rz + jitter * 0.6);
}

/** 头像徽章 Sprite（Billboard）。 */
export function createAvatarBadge(emoji: string, ringColor: string, worldSize = 0.9): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: avatarBadgeTexture(emoji, ringColor), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(worldSize);
  return sprite;
}

/** 文字标签 Sprite。 */
export function createLabelSprite(text: string, worldWidth = 2.2, options: Parameters<typeof labelTexture>[1] = {}): THREE.Sprite {
  const material = new THREE.SpriteMaterial({ map: labelTexture(text, options), transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(worldWidth, worldWidth * 0.5, 1);
  return sprite;
}

/** 高亮圆点（可移动/最近落子提示）。 */
export function createHighlightDot(color: string, radius = 0.18): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 24);
  const material = new THREE.MeshBasicMaterial({
    map: dotTexture(color),
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/** 释放一个 Group 树里的几何体与材质；共享缓存资产（userData.shared）跳过。 */
export function disposeObjectTree(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    for (const material of materials) {
      if ((material instanceof THREE.SpriteMaterial || material instanceof THREE.MeshStandardMaterial) && !material.userData.shared) {
        material.dispose();
      }
    }
  });
}
