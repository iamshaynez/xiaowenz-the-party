import * as THREE from 'three';
import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayGeometryKit } from '../geometry';
import type { ClayPartFactory } from '../types';

const WHEEL_POSITIONS = [
  [-1.01, -0.84],
  [1.01, -0.84],
  [-1.01, 0.84],
  [1.01, 0.84],
] as const;

function rollingWheel(
  kit: ClayGeometryKit,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  radius: number,
  width: number,
  hubColor: string,
): THREE.Group {
  const pivot = kit.group(parent, [x, y, z]);
  const tire = kit.cylinder(radius, radius, width, C.ink, pivot);
  tire.rotation.z = Math.PI / 2;
  const hub = kit.cylinder(radius * 0.43, radius * 0.43, width + 0.035, hubColor, pivot);
  hub.rotation.z = Math.PI / 2;
  const cap = kit.cylinder(radius * 0.16, radius * 0.16, width + 0.055, C.cream, pivot);
  cap.rotation.z = Math.PI / 2;
  return pivot;
}

const normalWheels: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'normal-wheels');
  const spin = kit.group(root);
  for (const [x, z] of WHEEL_POSITIONS) rollingWheel(kit, spin, x, 0.48, z, 0.43, 0.34, C.yellow);
  return { root, channels: { spin } };
};

const monsterWheels: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'monster-wheels');
  const spin = kit.group(root);
  for (const [x, z] of WHEEL_POSITIONS) {
    const pivot = rollingWheel(kit, spin, x * 1.12, 0.67, z, 0.61, 0.46, C.coral);
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2;
      const lug = kit.box(
        [0.5, 0.12, 0.22],
        C.ink,
        pivot,
        [0, Math.sin(angle) * 0.6, Math.cos(angle) * 0.6],
        0.035,
      );
      lug.rotation.x = -angle;
    }
  }
  return { root, channels: { spin } };
};

const squareWheels: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'square-wheels');
  const spin = kit.group(root);
  for (const [x, z] of WHEEL_POSITIONS) {
    const pivot = kit.group(spin, [x, 0.5, z]);
    kit.box([0.36, 0.84, 0.84], C.ink, pivot, [0, 0, 0], 0.1);
    const hub = kit.cylinder(0.19, 0.19, 0.4, C.yellow, pivot);
    hub.rotation.z = Math.PI / 2;
    const cap = kit.cylinder(0.07, 0.07, 0.42, C.cream, pivot);
    cap.rotation.z = Math.PI / 2;
  }
  return { root, channels: { spin } };
};

const tracks: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'tracks');
  const spin = kit.group(root);
  const trail = kit.group(root);
  for (const side of [-1, 1]) {
    kit.box([0.46, 0.7, 2.32], C.ink, root, [side * 1.01, 0.48, 0], 0.3);
    kit.box([0.48, 0.4, 1.82], C.mint, root, [side * 1.01, 0.48, 0], 0.18);
    for (const z of [-0.73, 0, 0.73]) {
      rollingWheel(kit, spin, side * 1.02, 0.48, z, 0.26, 0.5, C.yellow);
    }
    for (const z of [-0.88, -0.44, 0, 0.44, 0.88]) {
      kit.box([0.54, 0.09, 0.2], C.silver, trail, [side * 1.01, 0.83, z], 0.025);
      kit.box([0.54, 0.09, 0.2], C.silver, trail, [side * 1.01, 0.13, z], 0.025);
    }
  }
  return { root, channels: { spin, trail } };
};

const springs: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'springs');
  const bounce = kit.group(root);
  for (const [x, z] of [[-0.82, -0.78], [0.82, -0.78], [-0.82, 0.78], [0.82, 0.78]] as const) {
    kit.ellipsoid([0.34, 0.1, 0.38], C.ink, root, [x, 0.12, z]);
    for (let index = 0; index < 5; index += 1) {
      const coil = kit.torus(0.2, 0.042, C.coral, bounce, [x, 0.19 + index * 0.105, z]);
      coil.rotation.x = Math.PI / 2;
      coil.rotation.y = index * 0.25;
    }
    kit.cylinder(0.25, 0.25, 0.08, C.yellow, bounce, [x, 0.68, z]);
  }
  return { root, channels: { bounce } };
};

const balloons: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'balloons');
  const bounce = kit.group(root);
  const colors = [C.coral, C.yellow, C.blue, C.pink] as const;
  WHEEL_POSITIONS.forEach(([x, z], index) => {
    const color = colors[index % colors.length] ?? C.coral;
    kit.ellipsoid([0.39, 0.53, 0.39], color, bounce, [x * 1.08, 0.59, z]);
    const knot = kit.cone(0.09, 0.16, color, bounce, [x * 1.08, 0.06, z], 10);
    knot.rotation.z = Math.PI;
    kit.rod([x * 0.78, 0.82, z], [x * 1.08, 0.84, z], 0.018, C.cream, root);
    kit.ellipsoid([0.09, 0.18, 0.025], C.white, bounce, [x * 1.08 - 0.13, 0.73, z + 0.35]);
  });
  return { root, channels: { bounce } };
};

const skis: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'skis');
  const steer = kit.group(root);
  for (const side of [-1, 1]) {
    const x = side * 0.83;
    kit.box([0.5, 0.16, 3.15], C.blue, steer, [x, 0.16, 0.12], 0.08);
    const tip = kit.box([0.5, 0.15, 0.64], C.yellow, steer, [x, 0.31, 1.58], 0.07);
    tip.rotation.x = -0.42;
    kit.box([0.34, 0.34, 0.7], C.coral, root, [x, 0.39, -0.15], 0.07);
    for (const z of [-0.55, 0.55]) {
      kit.rod([x - 0.23, 0.16, z], [x + 0.23, 0.16, z], 0.025, C.cream, steer);
    }
  }
  return { root, channels: { steer } };
};

const duckFeet: ClayPartFactory = (kit) => {
  const root = kit.group(undefined, [0, 0, 0], 'duck-feet');
  const spin = kit.group(root);
  for (const [x, z] of WHEEL_POSITIONS) {
    const pivot = kit.group(spin, [x * 0.9, 0.22, z]);
    kit.ellipsoid([0.34, 0.11, 0.42], C.orange, pivot, [0, 0, 0.08]);
    for (const toe of [-1, 0, 1]) {
      const digit = kit.ellipsoid([0.12, 0.075, 0.34], C.orange, pivot, [toe * 0.18, 0, 0.42]);
      digit.rotation.y = toe * -0.25;
    }
    kit.capsule(0.085, 0.24, C.yellow, pivot, [0, 0.25, -0.08]);
  }
  return { root, channels: { spin } };
};

export const MOTION_PART_FACTORIES: Record<string, ClayPartFactory> = {
  'normal-wheels': normalWheels,
  'monster-wheels': monsterWheels,
  'square-wheels': squareWheels,
  tracks,
  springs,
  balloons,
  skis,
  'duck-feet': duckFeet,
};
