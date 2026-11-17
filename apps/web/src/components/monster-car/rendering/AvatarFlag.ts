import * as THREE from 'three';
import type { CarIdentity } from './presentation/CarIdentity';
import { clay, cylinder } from './models/primitives';

export function createAvatarFlag(identity: CarIdentity, avatar: string) {
  const root = new THREE.Group();
  root.name = 'identity-flag';
  const pole = cylinder(0.025, 0.82, '#f6ecd1', 10);
  pole.position.y = 0.35;
  root.add(pole);

  let texture: THREE.CanvasTexture | null = null;
  let material: THREE.MeshStandardMaterial;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 80;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('NO_2D_CONTEXT');
    context.fillStyle = identity.accentColor;
    context.fillRect(0, 0, 128, 80);
    context.strokeStyle = '#fff7df';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 120, 72);
    context.fillStyle = '#fff7df';
    context.beginPath();
    context.arc(36, 40, 25, 0, Math.PI * 2);
    context.fill();
    context.font = '32px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(avatar, 36, 42);
    context.font = 'bold 34px sans-serif';
    context.fillStyle = '#203c35';
    context.fillText(String(identity.flagNumber), 93, 42);
    texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, side: THREE.DoubleSide });
  } catch {
    material = new THREE.MeshStandardMaterial({ color: identity.accentColor, roughness: 0.7, side: THREE.DoubleSide });
  }
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45), material);
  flag.name = 'identity-flag-cloth';
  flag.position.set(0.36, 0.67, 0);
  flag.castShadow = true;
  root.add(flag);
  return { root, texture };
}
