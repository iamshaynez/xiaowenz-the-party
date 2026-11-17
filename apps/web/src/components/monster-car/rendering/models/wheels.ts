import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MonsterCarBuild } from '@party/protocol';
import {
  ball,
  clay,
  cone,
  cylinder,
  glossy,
  makeMesh,
  noShadow,
  rounded,
  torus,
  translucent,
  tube,
} from './primitives';
import { makeRig, type PartRig } from './types';

type VectorTuple = readonly [number, number, number];

const TAU = Math.PI * 2;

function at<T extends THREE.Object3D>(object: T, position: VectorTuple, rotation?: VectorTuple) {
  object.position.set(...position);
  if (rotation) object.rotation.set(...rotation);
  return object;
}

function motionGroup() {
  const motion = new THREE.Group();
  motion.name = 'motion';
  return motion;
}

function finishWheel(id: string, motion: THREE.Group): PartRig {
  const rig = makeRig('wheels', id, { motion });
  rig.root.add(motion);
  return rig;
}

function zAxle(radius: number, length: number, color: string, material?: THREE.Material) {
  return cylinder(radius, length, color, 20, material).rotateX(Math.PI / 2);
}

function classicWheel(): PartRig {
  const motion = motionGroup();
  const rubber = clay('#383441', 0.88);
  const sidewall = clay('#514b5b', 0.8);
  const brass = clay('#f4cf72', 0.34, 0.5);
  const chrome = glossy('#d9edf0', 0.22);

  motion.add(makeMesh(new THREE.TorusGeometry(0.37, 0.15, 14, 32), rubber));
  for (const z of [-0.115, 0.115]) {
    motion.add(at(torus(0.36, 0.035, '#514b5b', sidewall), [0, 0, z]));
    motion.add(at(zAxle(0.235, 0.045, '#f4cf72', brass), [0, 0, z * 1.25]));
    motion.add(at(zAxle(0.115, 0.065, '#d9edf0', chrome), [0, 0, z * 1.55]));
  }

  const transform = new THREE.Object3D();
  const spokes = new THREE.InstancedMesh(new RoundedBoxGeometry(0.055, 0.25, 0.035, 2, 0.012), brass, 12);
  const bolts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10), glossy('#fff2bd'), 12);
  let spokeIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 6; index += 1) {
      const angle = index * TAU / 6;
      transform.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, side * 0.155);
      transform.rotation.set(0, 0, angle - Math.PI / 2);
      transform.updateMatrix();
      spokes.setMatrixAt(spokeIndex, transform.matrix);
      transform.position.set(Math.cos(angle) * 0.17, Math.sin(angle) * 0.17, side * 0.195);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.updateMatrix();
      bolts.setMatrixAt(spokeIndex, transform.matrix);
      spokeIndex += 1;
    }
  }
  noShadow(spokes);
  noShadow(bolts);
  motion.add(spokes, bolts);

  const treads = new THREE.InstancedMesh(new RoundedBoxGeometry(0.14, 0.065, 0.24, 2, 0.018), rubber, 16);
  for (let index = 0; index < 16; index += 1) {
    const angle = index * TAU / 16;
    transform.position.set(Math.cos(angle) * 0.49, Math.sin(angle) * 0.49, 0);
    transform.rotation.set(0, 0, angle - Math.PI / 2);
    transform.updateMatrix();
    treads.setMatrixAt(index, transform.matrix);
  }
  noShadow(treads);
  motion.add(treads);
  return finishWheel('classic', motion);
}

function donutWheel(): PartRig {
  const motion = motionGroup();
  const dough = clay('#d99b61', 0.78);
  const icing = glossy('#f59cb7', 0.38);
  const sprinkleColors = ['#fff0a0', '#8fe1d2', '#9d8bd8', '#fff7ea'] as const;

  motion.add(makeMesh(new THREE.TorusGeometry(0.36, 0.18, 16, 36), dough));
  for (const side of [-1, 1]) {
    motion.add(at(torus(0.36, 0.125, '#f59cb7', icing), [0, 0, side * 0.105]));
  }

  const transform = new THREE.Object3D();
  const drips = new THREE.InstancedMesh(new THREE.SphereGeometry(0.072, 12, 8), icing, 18);
  let dripIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 9; index += 1) {
      const angle = index * TAU / 9 + 0.12;
      transform.position.set(Math.cos(angle) * 0.45, Math.sin(angle) * 0.45, side * 0.17);
      transform.rotation.set(0, 0, angle);
      transform.scale.set(1.15, 0.72, 0.36);
      transform.updateMatrix();
      drips.setMatrixAt(dripIndex, transform.matrix);
      dripIndex += 1;
    }
  }
  noShadow(drips);
  motion.add(drips);

  const sprinkles = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.034, 0.105, 0.026, 2, 0.008),
    new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5 }),
    28,
  );
  const color = new THREE.Color();
  let sprinkleIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 14; index += 1) {
      const angle = index * TAU / 14 + side * 0.09;
      const radius = 0.355 + Math.sin(index * 2.3) * 0.035;
      transform.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, side * 0.237);
      transform.rotation.set(0, 0, angle + (index % 3 - 1) * 0.55);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      sprinkles.setMatrixAt(sprinkleIndex, transform.matrix);
      sprinkles.setColorAt(sprinkleIndex, color.set(sprinkleColors[(index + (side > 0 ? 0 : 2)) % sprinkleColors.length] ?? '#fff0a0'));
      sprinkleIndex += 1;
    }
  }
  noShadow(sprinkles);
  motion.add(sprinkles);
  return finishWheel('donut', motion);
}

function springWheel(): PartRig {
  const motion = motionGroup();
  const steel = clay('#d7e1df', 0.28, 0.7);
  const darkSteel = clay('#625d70', 0.42, 0.45);
  const coral = glossy('#ef8a78', 0.3);

  const helix: THREE.Vector3[] = [];
  const turns = 4;
  for (let index = 0; index <= 64; index += 1) {
    const progress = index / 64;
    const angle = progress * TAU * turns;
    helix.push(new THREE.Vector3(
      Math.cos(angle) * 0.305,
      Math.sin(angle) * 0.305,
      (progress - 0.5) * 0.5,
    ));
  }
  const springCurve = new THREE.CatmullRomCurve3(helix);
  motion.add(makeMesh(new THREE.TubeGeometry(springCurve, 96, 0.043, 10, false), steel));

  for (const z of [-0.29, 0.29]) {
    motion.add(at(torus(0.34, 0.055, '#625d70', darkSteel), [0, 0, z]));
    motion.add(at(zAxle(0.19, 0.06, '#ef8a78', coral), [0, 0, z]));
    for (let index = 0; index < 3; index += 1) {
      const angle = index * TAU / 3;
      const brace = rounded([0.045, 0.27, 0.035], '#625d70', 0.01, darkSteel);
      brace.position.set(Math.cos(angle) * 0.13, Math.sin(angle) * 0.13, z);
      brace.rotation.z = angle - Math.PI / 2;
      motion.add(brace);
    }
  }
  motion.add(zAxle(0.09, 0.66, '#d7e1df', steel));
  motion.add(zAxle(0.125, 0.1, '#ef8a78', coral));
  return finishWheel('spring', motion);
}

function balloonWheel(): PartRig {
  const motion = motionGroup();
  const balloonMaterial = new THREE.MeshPhysicalMaterial({
    color: '#a9e7ef',
    roughness: 0.18,
    metalness: 0,
    transmission: 0.12,
    transparent: true,
    opacity: 0.9,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
  });
  const knotMaterial = glossy('#ef9baf', 0.34);

  motion.add(ball(0.48, '#a9e7ef', [1, 1.06, 0.94], balloonMaterial));
  const knot = cone(0.095, 0.18, '#ef9baf', 10, knotMaterial);
  knot.position.y = -0.51;
  knot.rotation.z = Math.PI;
  motion.add(knot);
  motion.add(tube([
    new THREE.Vector3(0, -0.59, 0),
    new THREE.Vector3(0.06, -0.69, 0.02),
    new THREE.Vector3(-0.055, -0.78, 0.025),
    new THREE.Vector3(0.035, -0.88, 0),
  ], 0.014, '#ef9baf', knotMaterial));

  const highlightMaterial = glossy('#f5ffff', 0.12);
  const highlight = noShadow(ball(0.105, '#f5ffff', [0.55, 1.35, 0.16], highlightMaterial));
  highlight.position.set(-0.19, 0.2, 0.405);
  highlight.rotation.z = -0.45;
  motion.add(highlight);
  const smallHighlight = noShadow(ball(0.045, '#f5ffff', [0.65, 1, 0.16], highlightMaterial));
  smallHighlight.position.set(-0.3, 0.06, 0.36);
  motion.add(smallHighlight);

  const patchColors = ['#f7b3c4', '#ffe59a', '#9d8bd8'] as const;
  const patches: VectorTuple[] = [[0.19, 0.17, 0.41], [0.26, -0.12, 0.36], [-0.08, -0.25, 0.4]];
  patches.forEach((position, index) => {
    const patch = ball(0.052, patchColors[index] ?? '#f7b3c4', [1, 1, 0.18], glossy(patchColors[index] ?? '#f7b3c4'));
    patch.position.set(...position);
    motion.add(patch);
  });
  return finishWheel('balloon', motion);
}

function bananaArc(radius: number, z: number, start: number, end: number, count = 18) {
  return Array.from({ length: count }, (_, index) => {
    const angle = start + (end - start) * index / (count - 1);
    return new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
  });
}

function bananaWheel(): PartRig {
  const motion = motionGroup();
  const yellow = glossy('#f6d64a', 0.42);
  const light = clay('#ffe985', 0.62);
  const ridge = clay('#d9ad32', 0.64);
  const brown = clay('#72503b', 0.82);
  const start = -Math.PI * 0.22;
  const end = Math.PI * 1.22;

  motion.add(tube(bananaArc(0.31, 0, start, end, 22), 0.145, '#f6d64a', yellow));
  motion.add(tube(bananaArc(0.32, 0.125, start + 0.05, end - 0.05, 20), 0.025, '#ffe985', light));
  motion.add(tube(bananaArc(0.395, -0.055, start + 0.08, end - 0.08, 20), 0.018, '#d9ad32', ridge));
  motion.add(tube(bananaArc(0.23, -0.06, start + 0.09, end - 0.09, 20), 0.016, '#d9ad32', ridge));

  for (const angle of [start, end]) {
    const tip = ball(0.105, '#72503b', [1, 0.75, 0.85], brown);
    tip.position.set(Math.cos(angle) * 0.31, Math.sin(angle) * 0.31, 0);
    tip.rotation.z = angle;
    motion.add(tip);
  }
  const stem = cylinder(0.065, 0.2, '#71934b', 10, clay('#71934b', 0.8));
  stem.position.set(Math.cos(start) * 0.4, Math.sin(start) * 0.4, 0);
  stem.rotation.z = start - Math.PI / 2;
  motion.add(stem);

  const freckles: ReadonlyArray<readonly [number, number, number]> = [
    [0.16, 0.42, 0.132],
    [-0.19, 0.38, 0.135],
    [-0.34, 0.04, 0.13],
    [0.34, 0.13, 0.13],
  ];
  freckles.forEach(([x, y, z], index) => {
    const spot = ball(0.025 + index % 2 * 0.008, '#9a6b37', [1, 0.7, 0.25], brown);
    spot.position.set(x ?? 0, y ?? 0, z ?? 0);
    motion.add(spot);
  });
  return finishWheel('banana', motion);
}

function squareWheel(): PartRig {
  const motion = motionGroup();
  const rubber = clay('#34313e', 0.9);
  const treadMaterial = clay('#24222c', 0.92);
  const hubMaterial = clay('#77c8ba', 0.36, 0.28);

  motion.add(rounded([0.9, 0.9, 0.46], '#34313e', 0.15, rubber));
  for (let side = 0; side < 4; side += 1) {
    const treadSide = new THREE.Group();
    treadSide.rotation.z = side * Math.PI / 2;
    for (let index = 0; index < 5; index += 1) {
      const tread = rounded([0.125, 0.105, 0.54], '#24222c', 0.025, treadMaterial);
      tread.position.set((index - 2) * 0.17, 0.455, 0);
      treadSide.add(tread);
    }
    motion.add(treadSide);
  }
  for (const z of [-0.245, 0.245]) {
    motion.add(at(rounded([0.67, 0.67, 0.04], '#464150', 0.014), [0, 0, z]));
    motion.add(at(zAxle(0.225, 0.055, '#77c8ba', hubMaterial), [0, 0, z * 1.08]));
    motion.add(at(zAxle(0.115, 0.075, '#f5d680', glossy('#f5d680')), [0, 0, z * 1.18]));
    for (let index = 0; index < 4; index += 1) {
      const angle = Math.PI / 4 + index * Math.PI / 2;
      const bolt = zAxle(0.026, 0.025, '#f5d680', glossy('#f5d680'));
      bolt.position.set(Math.cos(angle) * 0.225, Math.sin(angle) * 0.225, z * 1.17);
      motion.add(bolt);
    }
  }
  return finishWheel('square', motion);
}

function bubbleTeaWheel(): PartRig {
  const motion = motionGroup();
  const cupMaterial = translucent('#e9fbf7', 0.42);
  const teaMaterial = translucent('#b87950', 0.82);
  const lidMaterial = glossy('#f4a8b8', 0.3);
  const pearlMaterial = glossy('#4b3440', 0.25);

  const tea = makeMesh(new THREE.CylinderGeometry(0.34, 0.28, 0.5, 24), teaMaterial);
  tea.position.y = -0.1;
  motion.add(tea);
  const cup = makeMesh(new THREE.CylinderGeometry(0.39, 0.31, 0.72, 24, 1, true), cupMaterial);
  cup.position.y = -0.015;
  motion.add(cup);
  motion.add(at(cylinder(0.315, 0.045, '#e9fbf7', 24, cupMaterial), [0, -0.37, 0]));
  motion.add(at(cylinder(0.415, 0.075, '#f4a8b8', 24, lidMaterial), [0, 0.36, 0]));
  motion.add(at(torus(0.395, 0.025, '#fff0dc', glossy('#fff0dc')), [0, 0.405, 0], [Math.PI / 2, 0, 0]));
  const dome = ball(0.385, '#e9fbf7', [1, 0.32, 1], cupMaterial);
  dome.position.y = 0.405;
  motion.add(dome);

  const pearlPositions: ReadonlyArray<VectorTuple> = [
    [-0.2, -0.28, 0.19], [0, -0.3, 0.25], [0.2, -0.27, 0.18],
    [-0.12, -0.17, 0.27], [0.12, -0.16, 0.27], [-0.25, -0.12, 0.12],
    [0.25, -0.11, 0.12], [0, -0.08, 0.3],
  ];
  pearlPositions.forEach((position, index) => {
    const pearl = ball(0.07 + index % 3 * 0.006, '#4b3440', [1, 1, 1], pearlMaterial);
    pearl.position.set(...position);
    motion.add(pearl);
  });

  const label = rounded([0.43, 0.19, 0.025], '#fff1d2', 0.01, glossy('#fff1d2'));
  label.position.set(0, 0.02, 0.345);
  motion.add(label);
  for (let index = 0; index < 3; index += 1) {
    const dot = ball(0.036, '#7b5148', [1, 1, 0.25], pearlMaterial);
    dot.position.set((index - 1) * 0.1, 0.02, 0.365);
    motion.add(dot);
  }

  const straw = new THREE.Group();
  straw.position.set(0.1, 0.58, 0);
  straw.rotation.z = -0.2;
  straw.add(cylinder(0.052, 0.76, '#86d6c5', 14, glossy('#86d6c5')));
  for (const y of [-0.21, 0.02, 0.25]) {
    straw.add(at(cylinder(0.055, 0.07, '#f47f98', 14, lidMaterial), [0, y, 0]));
  }
  motion.add(straw);
  return finishWheel('bubble-tea', motion);
}

function duckFloatWheel(): PartRig {
  const motion = motionGroup();
  const yellow = glossy('#f7d75f', 0.3);
  const lightYellow = glossy('#fff09a', 0.32);
  const orange = glossy('#f39b57', 0.34);
  const dark = glossy('#293044', 0.2);

  motion.add(torus(0.335, 0.16, '#f7d75f', yellow));
  for (const z of [-0.12, 0.12]) {
    motion.add(at(torus(0.335, 0.025, '#fff09a', lightYellow), [0, 0, z]));
  }
  const head = ball(0.245, '#f7d75f', [1, 1.08, 1], yellow);
  head.position.set(0.16, 0.37, 0);
  motion.add(head);
  const bill = rounded([0.3, 0.115, 0.32], '#f39b57', 0.05, orange);
  bill.position.set(0.39, 0.32, 0);
  motion.add(bill);
  const billLine = rounded([0.22, 0.018, 0.325], '#c97446', 0.006);
  billLine.position.set(0.405, 0.31, 0);
  motion.add(billLine);
  for (const side of [-1, 1]) {
    const eyeWhite = ball(0.07, '#fff9e8', [1, 1, 0.5], glossy('#fff9e8'));
    eyeWhite.position.set(0.235, 0.46, side * 0.185);
    motion.add(eyeWhite);
    const eye = ball(0.036, '#293044', [1, 1, 0.45], dark);
    eye.position.set(0.26, 0.465, side * 0.218);
    motion.add(eye);
    const wing = ball(0.17, '#fff09a', [1.35, 0.6, 0.38], lightYellow);
    wing.position.set(-0.1, 0.025, side * 0.17);
    wing.rotation.z = -0.45;
    motion.add(wing);
  }
  const tail = cone(0.14, 0.28, '#f7d75f', 12, yellow);
  tail.position.set(-0.43, 0.17, 0);
  tail.rotation.z = Math.PI / 2;
  motion.add(tail);
  const valve = cylinder(0.045, 0.09, '#f39b57', 12, orange);
  valve.position.set(0.34, -0.34, 0);
  valve.rotation.z = -Math.PI / 4;
  motion.add(valve);
  return finishWheel('duck-float', motion);
}

const WHEEL_FACTORIES = {
  classic: classicWheel,
  donut: donutWheel,
  spring: springWheel,
  balloon: balloonWheel,
  banana: bananaWheel,
  square: squareWheel,
  'bubble-tea': bubbleTeaWheel,
  'duck-float': duckFloatWheel,
} satisfies Record<string, () => PartRig>;

export const WHEEL_MODELS: Record<MonsterCarBuild['wheels'], () => PartRig> = WHEEL_FACTORIES;

export function createWheelModel(id: MonsterCarBuild['wheels']): PartRig {
  return WHEEL_MODELS[id]();
}
