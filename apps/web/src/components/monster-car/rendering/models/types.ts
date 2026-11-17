import * as THREE from 'three';
import type { MonsterCarSlot } from '@party/protocol';

export interface PartRig {
  root: THREE.Group;
  nodes: Record<string, THREE.Object3D>;
}

export function makeRig(slot: MonsterCarSlot, partId: string, nodes: Record<string, THREE.Object3D> = {}) {
  const root = new THREE.Group();
  root.name = `${slot}:${partId}`;
  root.userData.slot = slot;
  root.userData.partId = partId;
  return { root, nodes };
}

export function disposeModel(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Points)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
    else materials.add(object.material);
  });
  for (const material of materials) {
    if ((material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshBasicMaterial) && material.map) {
      textures.add(material.map);
    }
  }
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}
