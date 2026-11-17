import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function clay(color: THREE.ColorRepresentation, roughness = 0.72, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export function glossy(color: THREE.ColorRepresentation, roughness = 0.28) {
  return new THREE.MeshPhysicalMaterial({ color, roughness, metalness: 0.03, clearcoat: 0.45, clearcoatRoughness: 0.3 });
}

export function glowing(color: THREE.ColorRepresentation, intensity = 0.65) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.42 });
}

export function translucent(color: THREE.ColorRepresentation, opacity = 0.72) {
  return new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.22, depthWrite: false });
}

export function makeMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number] = [0, 0, 0],
) {
  const result = new THREE.Mesh(geometry, material);
  result.position.set(...position);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export function ball(
  radius: number,
  color: THREE.ColorRepresentation,
  scale: readonly [number, number, number] = [1, 1, 1],
  material?: THREE.Material,
) {
  const result = makeMesh(new THREE.SphereGeometry(radius, 20, 14), material ?? clay(color));
  result.scale.set(...scale);
  return result;
}

export function rounded(
  size: readonly [number, number, number],
  color: THREE.ColorRepresentation,
  radius = 0.12,
  material?: THREE.Material,
) {
  return makeMesh(new RoundedBoxGeometry(...size, 4, radius), material ?? clay(color));
}

export function cylinder(
  radius: number,
  length: number,
  color: THREE.ColorRepresentation,
  segments = 16,
  material?: THREE.Material,
) {
  return makeMesh(new THREE.CylinderGeometry(radius, radius, length, segments), material ?? clay(color));
}

export function cone(
  radius: number,
  length: number,
  color: THREE.ColorRepresentation,
  segments = 16,
  material?: THREE.Material,
) {
  return makeMesh(new THREE.ConeGeometry(radius, length, segments), material ?? clay(color));
}

export function torus(
  radius: number,
  tube: number,
  color: THREE.ColorRepresentation,
  material?: THREE.Material,
) {
  return makeMesh(new THREE.TorusGeometry(radius, tube, 12, 28), material ?? clay(color));
}

export function tube(
  points: THREE.Vector3[],
  radius: number,
  color: THREE.ColorRepresentation,
  material?: THREE.Material,
) {
  const curve = new THREE.CatmullRomCurve3(points);
  return makeMesh(new THREE.TubeGeometry(curve, 24, radius, 10, false), material ?? clay(color));
}

export function star(color: THREE.ColorRepresentation) {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? 0.36 : 0.16;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return makeMesh(
    new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2 }),
    glowing(color),
  );
}

export function noShadow<T extends THREE.Object3D>(object: T) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh) child.castShadow = false;
  });
  return object;
}
