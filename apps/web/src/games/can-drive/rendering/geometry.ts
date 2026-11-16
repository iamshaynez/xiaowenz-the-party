import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CLAY_MATERIAL_DEFAULTS } from './clayPreset';
import type { ClayVector3 } from './types';

const ORIGIN: ClayVector3 = [0, 0, 0];
const UP = new THREE.Vector3(0, 1, 0);

export interface ClayMaterialOptions {
  readonly roughness?: number;
  readonly metalness?: number;
  readonly emissive?: string;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly transparent?: boolean;
  readonly depthWrite?: boolean;
  readonly side?: THREE.Side;
}

type MaterialSource = string | THREE.MeshStandardMaterial;

/**
 * Small geometry factory with one owner for every GPU resource it creates.
 * Geometry and materials are cached, so rebuilding a car does not duplicate them.
 */
export class ClayGeometryKit {
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly geometryCache = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.MeshStandardMaterial>();
  private readonly textures = new Set<THREE.Texture>();
  private disposed = false;

  get resourceCounts(): Readonly<{ geometries: number; materials: number; textures: number }> {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      textures: this.textures.size,
    };
  }

  group(parent?: THREE.Object3D, position: ClayVector3 = ORIGIN, name?: string): THREE.Group {
    this.assertActive();
    const group = new THREE.Group();
    group.position.set(...position);
    if (name !== undefined) group.name = name;
    parent?.add(group);
    return group;
  }

  material(color: string, options: ClayMaterialOptions = {}): THREE.MeshStandardMaterial {
    this.assertActive();
    const opacity = options.opacity ?? 1;
    const transparent = options.transparent ?? opacity < 1;
    const roughness = options.roughness ?? CLAY_MATERIAL_DEFAULTS.roughness;
    const metalness = options.metalness ?? CLAY_MATERIAL_DEFAULTS.metalness;
    const emissive = options.emissive ?? '#000000';
    const emissiveIntensity = options.emissiveIntensity ?? 0;
    const depthWrite = options.depthWrite ?? !transparent;
    const side = options.side ?? THREE.FrontSide;
    const normalizedColor = new THREE.Color(color).getHexString();
    const normalizedEmissive = new THREE.Color(emissive).getHexString();
    const key = [
      normalizedColor,
      roughness,
      metalness,
      normalizedEmissive,
      emissiveIntensity,
      opacity,
      transparent,
      depthWrite,
      side,
    ].join(':');
    const cached = this.materials.get(key);
    if (cached) return cached;

    const material = new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness,
      emissive,
      emissiveIntensity,
      opacity,
      transparent,
      depthWrite,
      side,
    });
    this.materials.set(key, material);
    return material;
  }

  trackTexture<T extends THREE.Texture>(texture: T): T {
    this.assertActive();
    this.textures.add(texture);
    return texture;
  }

  mesh(
    geometry: THREE.BufferGeometry,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    this.assertActive();
    const resolved = typeof material === 'string' ? this.material(material) : material;
    this.geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, resolved);
    mesh.position.set(...position);
    mesh.castShadow = !resolved.transparent;
    mesh.receiveShadow = !resolved.transparent;
    parent.add(mesh);
    return mesh;
  }

  box(
    size: ClayVector3,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
    radius = 0.08,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const [width, height, depth] = size;
    const safeRadius = Math.min(Math.max(0, radius), Math.min(width, height, depth) * 0.48);
    const key = `rounded-box:${width}:${height}:${depth}:${safeRadius}`;
    const geometry = this.cachedGeometry(
      key,
      () => new RoundedBoxGeometry(width, height, depth, 3, safeRadius),
    );
    return this.mesh(geometry, material, parent, position);
  }

  sphere(
    radius: number,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    return this.ellipsoid([radius, radius, radius], material, parent, position);
  }

  ellipsoid(
    radii: ClayVector3,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const geometry = this.cachedGeometry(
      'unit-sphere:20:14',
      () => new THREE.SphereGeometry(1, 20, 14),
    );
    const mesh = this.mesh(geometry, material, parent, position);
    mesh.scale.set(...radii);
    return mesh;
  }

  cylinder(
    radiusTop: number,
    radiusBottom: number,
    height: number,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
    segments = 20,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const key = `cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`;
    const geometry = this.cachedGeometry(
      key,
      () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    );
    return this.mesh(geometry, material, parent, position);
  }

  cone(
    radius: number,
    height: number,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
    segments = 20,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    return this.cylinder(0, radius, height, material, parent, position, segments);
  }

  torus(
    radius: number,
    tube: number,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
    arc = Math.PI * 2,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const key = `torus:${radius}:${tube}:${arc}`;
    const geometry = this.cachedGeometry(
      key,
      () => new THREE.TorusGeometry(radius, tube, 8, 28, arc),
    );
    return this.mesh(geometry, material, parent, position);
  }

  capsule(
    radius: number,
    length: number,
    material: MaterialSource,
    parent: THREE.Object3D,
    position: ClayVector3 = ORIGIN,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const key = `capsule:${radius}:${length}`;
    const geometry = this.cachedGeometry(
      key,
      () => new THREE.CapsuleGeometry(radius, length, 6, 12),
    );
    return this.mesh(geometry, material, parent, position);
  }

  rod(
    start: ClayVector3,
    end: ClayVector3,
    radius: number,
    material: MaterialSource,
    parent: THREE.Object3D,
  ): THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
    const from = new THREE.Vector3(...start);
    const to = new THREE.Vector3(...end);
    const direction = to.clone().sub(from);
    const length = direction.length();
    const midpoint = from.clone().add(to).multiplyScalar(0.5);
    const mesh = this.cylinder(
      radius,
      radius,
      length,
      material,
      parent,
      [midpoint.x, midpoint.y, midpoint.z],
      10,
    );
    if (length > 0) mesh.quaternion.setFromUnitVectors(UP, direction.multiplyScalar(1 / length));
    return mesh;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.geometries.clear();
    this.geometryCache.clear();
    this.materials.clear();
    this.textures.clear();
  }

  private cachedGeometry(key: string, create: () => THREE.BufferGeometry): THREE.BufferGeometry {
    this.assertActive();
    const cached = this.geometryCache.get(key);
    if (cached) return cached;
    const geometry = create();
    this.geometryCache.set(key, geometry);
    this.geometries.add(geometry);
    return geometry;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('ClayGeometryKit has been disposed');
  }
}
