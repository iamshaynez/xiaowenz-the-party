import * as THREE from 'three';
import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayPartFactory } from '../types';

const flag: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'flag');
  kit.cylinder(0.03, 0.03, 1.55, C.ink, root, [0.58, 0.78, -0.08], 10);
  kit.sphere(0.07, C.yellow, root, [0.58, 1.58, -0.08]);
  const accessory = kit.group(root, [0.58, 1.34, -0.08]);
  kit.box([0.78, 0.48, 0.065], C.coral, accessory, [0.39, 0, 0], 0.035);
  const patch = kit.box([0.28, 0.28, 0.075], C.yellow, accessory, [0.28, 0, 0], 0.04);
  patch.rotation.z = Math.PI / 4;
  return { root, channels: { accessory } };
};

const umbrella: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'umbrella');
  kit.cylinder(0.032, 0.032, 1.48, C.ink, root, [0.58, 0.74, -0.05], 10);
  const open = kit.group(root, [0.58, 1.48, -0.05]);
  const panelCount = 8;
  for (let index = 0; index < panelCount; index += 1) {
    const geometry = new THREE.SphereGeometry(
      0.9,
      8,
      5,
      (index / panelCount) * Math.PI * 2,
      (Math.PI * 2) / panelCount,
      0,
      Math.PI / 2,
    );
    kit.mesh(geometry, index % 2 === 0 ? C.coral : C.cream, open);
  }
  kit.sphere(0.065, C.yellow, open, [0, 0.9, 0]);
  const rim = kit.torus(0.9, 0.025, C.ink, open);
  rim.rotation.x = Math.PI / 2;
  return { root, channels: { open } };
};

const propeller: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'propeller');
  kit.cylinder(0.055, 0.08, 1.25, C.mint, root, [0, 0.63, -0.18], 12);
  const spin = kit.group(root, [0, 1.3, -0.18]);
  kit.box([1.5, 0.09, 0.22], C.yellow, spin, [0, 0, 0], 0.08);
  kit.box([0.22, 0.09, 1.5], C.coral, spin, [0, 0, 0], 0.08);
  kit.sphere(0.15, C.cream, spin);
  return { root, channels: { spin } };
};

const searchlight: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'searchlight');
  kit.cylinder(0.25, 0.32, 0.25, C.mint, root, [0.5, 0.13, -0.08]);
  kit.rod([0.5, 0.2, -0.08], [0.5, 0.68, -0.08], 0.055, C.ink, root);
  const head = kit.group(root, [0.5, 0.72, -0.08]);
  const housing = kit.cylinder(0.29, 0.24, 0.5, C.yellow, head);
  housing.rotation.x = Math.PI / 2;
  const lensMaterial = kit.material(C.cream, { emissive: C.yellow, emissiveIntensity: 0.55 });
  const lens = kit.cylinder(0.23, 0.23, 0.045, lensMaterial, head, [0, 0, 0.27]);
  lens.rotation.x = Math.PI / 2;
  const beamMaterial = kit.material(C.cream, {
    emissive: C.yellow,
    emissiveIntensity: 0.25,
    opacity: 0.18,
    transparent: true,
    depthWrite: false,
  });
  const open = kit.group(head);
  const beam = kit.cylinder(0.58, 0.045, 1.7, beamMaterial, open, [0, 0, 1.12], 20);
  beam.rotation.x = Math.PI / 2;
  return { root, channels: { head, open } };
};

const trampoline: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'trampoline');
  const centerX = 0.55;
  const centerZ = -0.38;
  for (const [x, z] of [[-0.38, -0.3], [0.38, -0.3], [-0.38, 0.3], [0.38, 0.3]] as const) {
    kit.rod(
      [centerX + x, 0.05, centerZ + z],
      [centerX + x * 0.9, 0.82, centerZ + z * 0.9],
      0.035,
      C.silver,
      root,
    );
  }
  const ring = kit.torus(0.59, 0.065, C.coral, root, [centerX, 0.85, centerZ]);
  ring.rotation.x = Math.PI / 2;
  kit.cylinder(0.55, 0.55, 0.07, C.ink, root, [centerX, 0.84, centerZ]);
  const bounce = kit.group(root, [centerX, 1.13, centerZ]);
  kit.sphere(0.2, C.yellow, bounce);
  kit.ellipsoid([0.06, 0.1, 0.025], C.white, bounce, [-0.06, 0.07, 0.18]);
  return { root, channels: { bounce } };
};

const satellite: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'satellite');
  kit.cylinder(0.05, 0.08, 0.62, C.silver, root, [0, 0.31, -0.2], 12);
  const spin = kit.group(root, [0, 0.63, -0.2]);
  kit.box([0.46, 0.42, 0.42], C.gold, spin, [0, 0.15, 0], 0.08);
  const open = kit.group(spin, [0, 0.15, 0]);
  for (const side of [-1, 1]) {
    kit.box([0.72, 0.06, 0.52], C.blue, open, [side * 0.62, 0, 0], 0.025);
    for (const stripe of [-0.18, 0, 0.18]) {
      kit.box([0.68, 0.065, 0.018], C.cream, open, [side * 0.62, 0.01, stripe], 0.005);
    }
  }
  const dish = kit.mesh(
    new THREE.SphereGeometry(0.45, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    C.cream,
    spin,
    [0, 0.65, 0],
  );
  dish.rotation.x = -0.48;
  kit.rod([0, 0.48, 0], [0, 0.96, 0.2], 0.025, C.ink, spin);
  kit.sphere(0.055, C.coral, spin, [0, 0.96, 0.2]);
  return { root, channels: { spin, open } };
};

const flowerpot: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'flowerpot');
  const accessory = kit.group(root, [0.58, 0, -0.12]);
  kit.cylinder(0.34, 0.24, 0.46, C.coral, accessory, [0, 0.25, 0]);
  kit.torus(0.32, 0.055, C.coralLight, accessory, [0, 0.48, 0]).rotation.x = Math.PI / 2;
  kit.cylinder(0.29, 0.29, 0.035, C.brown, accessory, [0, 0.49, 0]);
  kit.rod([0, 0.48, 0], [0, 1.03, 0], 0.035, C.leaf, accessory);
  for (const side of [-1, 1]) {
    const leaf = kit.ellipsoid([0.2, 0.08, 0.07], C.leaf, accessory, [side * 0.15, 0.7, 0]);
    leaf.rotation.z = side * 0.45;
  }
  const open = kit.group(accessory, [0, 1.08, 0]);
  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;
    kit.ellipsoid(
      [0.12, 0.22, 0.07],
      C.pink,
      open,
      [Math.sin(angle) * 0.19, Math.cos(angle) * 0.19, 0],
    ).rotation.z = -angle;
  }
  kit.sphere(0.14, C.yellow, open, [0, 0, 0.06]);
  return { root, channels: { accessory, open } };
};

const windmill: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'windmill');
  kit.cylinder(0.045, 0.075, 1.22, C.cream, root, [0.55, 0.61, -0.08], 12);
  kit.sphere(0.18, C.coral, root, [0.55, 1.25, -0.08]);
  const spin = kit.group(root, [0.55, 1.25, 0.09]);
  for (let index = 0; index < 4; index += 1) {
    const blade = kit.group(spin);
    blade.rotation.z = (index / 4) * Math.PI * 2;
    kit.box([0.18, 0.66, 0.075], index % 2 === 0 ? C.yellow : C.mint, blade, [0.08, 0.36, 0], 0.04);
  }
  kit.sphere(0.12, C.coralLight, spin, [0, 0, 0.06]);
  return { root, channels: { spin } };
};

export const ROOF_PART_FACTORIES: Record<string, ClayPartFactory> = {
  flag,
  umbrella,
  propeller,
  searchlight,
  trampoline,
  satellite,
  flowerpot,
  windmill,
};
