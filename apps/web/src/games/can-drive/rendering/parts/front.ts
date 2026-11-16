import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayPartFactory } from '../types';

const bumper: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'bumper');
  const open = kit.group(root);
  kit.box([1.9, 0.32, 0.35], C.silver, open, [0, -0.03, 0.2], 0.12);
  for (const side of [-1, 1]) {
    kit.box([0.22, 0.58, 0.26], C.silver, open, [side * 0.62, 0.06, 0.26], 0.08);
    kit.sphere(0.09, C.yellow, open, [side * 0.62, 0.12, 0.42]);
  }
  return { root, channels: { open } };
};

const plow: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'plow');
  const open = kit.group(root);
  for (const section of [-1, 0, 1]) {
    const blade = kit.box(
      [0.82, 0.7, 0.22],
      C.orange,
      open,
      [section * 0.69, -0.08, 0.38 + Math.abs(section) * -0.08],
      0.09,
    );
    blade.rotation.y = section * -0.28;
    blade.rotation.x = -0.18;
  }
  const wedge = kit.cone(0.47, 0.68, C.yellow, open, [0, -0.1, 0.63], 4);
  wedge.rotation.x = Math.PI / 2;
  wedge.rotation.z = Math.PI / 4;
  for (const side of [-1, 1]) {
    kit.rod([side * 0.55, 0.08, 0], [side * 0.55, -0.05, 0.43], 0.055, C.ink, root);
  }
  return { root, channels: { open } };
};

const boxingGlove: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'boxing-glove');
  const open = kit.group(root);
  const arm = kit.cylinder(0.17, 0.17, 0.52, C.cream, open, [0, 0, 0.28]);
  arm.rotation.x = Math.PI / 2;
  const cuff = kit.cylinder(0.3, 0.3, 0.28, C.yellow, open, [0, 0, 0.55]);
  cuff.rotation.x = Math.PI / 2;
  kit.ellipsoid([0.46, 0.4, 0.48], C.red, open, [0, 0.07, 0.91]);
  kit.ellipsoid([0.22, 0.25, 0.26], C.red, open, [-0.34, -0.11, 0.78]);
  kit.box([0.34, 0.06, 0.04], C.coralLight, open, [0.06, 0.22, 1.34], 0.02);
  return { root, channels: { open } };
};

const vacuum: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'vacuum');
  const open = kit.group(root);
  const neck = kit.cylinder(0.25, 0.19, 0.65, C.mint, open, [0, 0.02, 0.3]);
  neck.rotation.x = Math.PI / 2;
  kit.box([1.15, 0.44, 0.5], C.mint, open, [0, -0.16, 0.76], 0.15);
  kit.box([0.88, 0.2, 0.035], C.ink, open, [0, -0.2, 1.025], 0.07);
  const spin = kit.group(root, [0, 0.07, 0.67]);
  kit.torus(0.25, 0.045, C.yellow, spin);
  for (let index = 0; index < 4; index += 1) {
    const angle = (index / 4) * Math.PI * 2;
    const blade = kit.ellipsoid(
      [0.08, 0.2, 0.035],
      C.cream,
      spin,
      [Math.sin(angle) * 0.11, Math.cos(angle) * 0.11, 0],
    );
    blade.rotation.z = -angle + 0.45;
  }
  return { root, channels: { open, spin } };
};

const magnet: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'magnet');
  const open = kit.group(root, [0, 0.08, 0.24]);
  kit.torus(0.42, 0.14, C.red, open, [0, 0.1, 0.25], Math.PI);
  for (const side of [-1, 1]) {
    kit.box([0.28, 0.48, 0.28], C.red, open, [side * 0.42, -0.12, 0.25], 0.09);
    kit.box([0.3, 0.2, 0.3], C.silver, open, [side * 0.42, -0.39, 0.25], 0.04);
  }
  const accessory = kit.group(root);
  for (const [x, y, z] of [[-0.5, 0.15, 1.05], [0.42, -0.12, 1.2], [0.05, 0.4, 1.12]] as const) {
    const clip = kit.torus(0.09, 0.022, C.silver, accessory, [x, y, z]);
    clip.scale.y = 1.5;
    clip.rotation.z = x;
  }
  return { root, channels: { open, accessory } };
};

const drill: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'drill');
  const spin = kit.group(root);
  const base = kit.cylinder(0.4, 0.4, 0.32, C.mint, spin, [0, 0, 0.18]);
  base.rotation.x = Math.PI / 2;
  const bit = kit.cone(0.39, 1.12, C.silver, spin, [0, 0, 0.83]);
  bit.rotation.x = Math.PI / 2;
  for (const [z, radius] of [[0.47, 0.36], [0.7, 0.27], [0.91, 0.18]] as const) {
    const thread = kit.torus(radius, 0.045, C.yellow, spin, [0, 0, z]);
    thread.rotation.z = z * 2;
  }
  return { root, channels: { spin } };
};

const pillow: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'pillow');
  const open = kit.group(root);
  kit.box([1.6, 0.62, 0.48], C.cream, open, [0, 0, 0.25], 0.22);
  for (const x of [-0.38, 0.38]) {
    kit.sphere(0.052, C.coralLight, open, [x, 0, 0.5]);
  }
  for (const side of [-1, 1]) {
    const seam = kit.torus(0.16, 0.018, C.white, open, [side * 0.68, 0, 0.47], Math.PI);
    seam.rotation.z = side * Math.PI / 2;
  }
  return { root, channels: { open } };
};

const duckBill: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'duck-bill');
  kit.ellipsoid([0.69, 0.17, 0.65], C.orange, root, [0, 0.11, 0.63]);
  const open = kit.group(root, [0, -0.02, 0.18]);
  kit.ellipsoid([0.65, 0.14, 0.61], C.yellow, open, [0, -0.15, 0.44]);
  for (const side of [-1, 1]) {
    kit.ellipsoid([0.055, 0.025, 0.07], C.ink, root, [side * 0.22, 0.26, 0.85]);
  }
  kit.rod([-0.5, 0.03, 0.7], [0.5, 0.03, 0.7], 0.018, C.brown, root);
  return { root, channels: { open } };
};

export const FRONT_PART_FACTORIES: Record<string, ClayPartFactory> = {
  bumper,
  plow,
  'boxing-glove': boxingGlove,
  vacuum,
  magnet,
  drill,
  pillow,
  'duck-bill': duckBill,
};
