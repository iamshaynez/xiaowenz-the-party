import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayPartFactory } from '../types';

const spoiler: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'spoiler');
  for (const side of [-1, 1]) {
    const strut = kit.box([0.12, 0.5, 0.18], C.ink, root, [side * 0.58, 0.22, -0.12], 0.04);
    strut.rotation.x = -0.15;
  }
  const open = kit.group(root, [0, 0.5, -0.18]);
  kit.box([1.95, 0.16, 0.58], C.coral, open, [0, 0, 0], 0.07);
  for (const side of [-1, 1]) {
    kit.box([0.1, 0.36, 0.62], C.yellow, open, [side * 0.96, 0.1, 0], 0.035);
  }
  return { root, channels: { open } };
};

const rocket: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'rocket');
  const metal = kit.material(C.mint, { roughness: 0.72, metalness: 0.12 });
  const barrel = kit.cylinder(0.32, 0.36, 0.92, metal, root, [0, 0, -0.28]);
  barrel.rotation.x = Math.PI / 2;
  const nozzle = kit.cylinder(0.23, 0.31, 0.25, C.ink, root, [0, 0, -0.82]);
  nozzle.rotation.x = Math.PI / 2;
  for (const side of [-1, 1]) {
    kit.box([0.17, 0.46, 0.54], C.coralLight, root, [side * 0.36, -0.03, -0.35], 0.045);
  }
  const flameMaterial = kit.material(C.yellow, {
    emissive: C.orange,
    emissiveIntensity: 0.4,
  });
  const flame = kit.cone(0.24, 0.78, flameMaterial, root, [0, 0, -1.28], 16);
  flame.rotation.x = -Math.PI / 2;
  const core = kit.cone(0.12, 0.48, C.cream, flame, [0, -0.05, 0], 14);
  return { root, channels: { flame } };
};

const fan: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'fan');
  kit.torus(0.51, 0.09, C.mint, root, [0, 0.05, -0.3]);
  kit.torus(0.39, 0.025, C.cream, root, [0, 0.05, -0.34]);
  const spin = kit.group(root, [0, 0.05, -0.36]);
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    const blade = kit.ellipsoid(
      [0.13, 0.34, 0.055],
      C.yellow,
      spin,
      [Math.sin(angle) * 0.18, Math.cos(angle) * 0.18, 0],
    );
    blade.rotation.z = -angle + 0.55;
  }
  kit.sphere(0.13, C.coral, spin);
  return { root, channels: { spin } };
};

const bubbles: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'bubbles');
  kit.cylinder(0.25, 0.3, 0.42, C.pink, root, [0, -0.1, -0.15]);
  kit.rod([0, 0.05, -0.2], [0, 0.22, -0.48], 0.045, C.yellow, root);
  kit.torus(0.3, 0.045, C.yellow, root, [0, 0.24, -0.55]);
  const trail = kit.group(root);
  const bubbleMaterial = kit.material(C.ice, {
    opacity: 0.58,
    transparent: true,
    roughness: 0.35,
    depthWrite: false,
  });
  for (const [x, y, z, radius] of [
    [-0.26, 0.35, -0.9, 0.16],
    [0.22, 0.52, -1.18, 0.22],
    [-0.08, 0.13, -1.45, 0.12],
    [0.36, 0.28, -1.7, 0.14],
  ] as const) {
    const bubble = kit.sphere(radius, bubbleMaterial, trail, [x, y, z]);
    kit.sphere(radius * 0.22, C.white, bubble, [-0.35, 0.35, 0.8]);
  }
  return { root, channels: { trail } };
};

const waterCannon: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'water-cannon');
  kit.sphere(0.35, C.blue, root, [0, 0.05, -0.1]);
  const open = kit.group(root, [0, 0.18, -0.25]);
  const barrel = kit.cylinder(0.14, 0.2, 0.78, C.yellow, open, [0, 0, -0.3]);
  barrel.rotation.x = Math.PI / 2;
  const nozzle = kit.cylinder(0.21, 0.21, 0.2, C.coral, open, [0, 0, -0.73]);
  nozzle.rotation.x = Math.PI / 2;
  const trail = kit.group(open);
  const waterMaterial = kit.material(C.water, { opacity: 0.78, transparent: true, depthWrite: false });
  kit.ellipsoid([0.1, 0.1, 0.65], waterMaterial, trail, [0, 0, -1.25]);
  for (const [x, y, z] of [[-0.12, 0.06, -1.85], [0.14, -0.04, -2.05], [0, 0.13, -2.25]] as const) {
    kit.sphere(0.09, waterMaterial, trail, [x, y, z]);
  }
  return { root, channels: { open, trail } };
};

const confetti: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'confetti');
  const open = kit.group(root);
  for (const side of [-1, 1]) {
    const tube = kit.cylinder(0.14, 0.22, 0.65, side < 0 ? C.coral : C.mint, open, [side * 0.32, 0.1, -0.35]);
    tube.rotation.x = Math.PI / 2 + side * 0.16;
    tube.rotation.z = side * -0.2;
  }
  const trail = kit.group(root);
  const colors = [C.yellow, C.coral, C.blue, C.pink, C.leaf] as const;
  for (let index = 0; index < 18; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const depth = 0.75 + (index % 6) * 0.25;
    const piece = kit.box(
      [0.08, 0.035, 0.16],
      colors[index % colors.length] ?? C.yellow,
      trail,
      [side * (0.2 + (index % 3) * 0.17), 0.1 + (index % 5) * 0.14, -depth],
      0.012,
    );
    piece.rotation.set(index * 0.31, index * 0.47, index * 0.23);
  }
  return { root, channels: { open, trail } };
};

const springTail: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'spring-tail');
  const bounce = kit.group(root);
  for (let index = 0; index < 7; index += 1) {
    const coil = kit.torus(0.19, 0.04, C.silver, bounce, [0, 0.06 + index * 0.025, -0.15 - index * 0.13]);
    coil.rotation.z = index * 0.28;
  }
  const accessory = kit.group(root, [0, 0.23, -1.08]);
  kit.sphere(0.23, C.coral, accessory);
  kit.sphere(0.07, C.cream, accessory, [-0.07, 0.08, -0.18]);
  return { root, channels: { bounce, accessory } };
};

const musicHorn: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'music-horn');
  const open = kit.group(root);
  const horn = kit.cylinder(0.4, 0.09, 0.78, C.gold, open, [0, 0.08, -0.45]);
  horn.rotation.x = -Math.PI / 2;
  kit.torus(0.4, 0.045, C.yellow, open, [0, 0.08, -0.84]);
  const accessory = kit.group(root);
  for (const [x, y, z] of [[-0.36, 0.42, -0.85], [0.28, 0.63, -1.15], [0.5, 0.3, -1.42]] as const) {
    const note = kit.group(accessory, [x, y, z]);
    kit.sphere(0.09, C.purple, note);
    kit.rod([0.07, 0, 0], [0.07, 0.35, 0], 0.025, C.purple, note);
    kit.rod([0.07, 0.35, 0], [0.22, 0.28, 0], 0.025, C.purple, note);
  }
  return { root, channels: { open, accessory } };
};

export const REAR_PART_FACTORIES: Record<string, ClayPartFactory> = {
  spoiler,
  rocket,
  fan,
  bubbles,
  'water-cannon': waterCannon,
  confetti,
  'spring-tail': springTail,
  'music-horn': musicHorn,
};
