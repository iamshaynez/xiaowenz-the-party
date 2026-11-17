import * as THREE from 'three';
import type { MonsterCarBuild } from '@party/protocol';
import {
  ball,
  clay,
  cone,
  cylinder,
  glossy,
  glowing,
  makeMesh,
  noShadow,
  rounded,
  star,
  torus,
  translucent,
  tube,
} from './primitives';
import { makeRig, type PartRig } from './types';

type Vec3 = readonly [number, number, number];

function place<T extends THREE.Object3D>(object: T, position: Vec3): T {
  object.position.set(...position);
  return object;
}

function namedGroup(name: string, position: Vec3 = [0, 0, 0]): THREE.Group {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  return result;
}

function createMushroom(): PartRig {
  const motion = namedGroup('motion');
  const stem = place(cylinder(0.14, 0.52, '#fff1d4', 20, glossy('#fff1d4')), [0, 0.24, 0]);
  const stemBase = place(ball(0.2, '#f5dfbd', [1, 0.45, 1]), [0, 0.03, 0]);
  const underside = place(cylinder(0.52, 0.065, '#f8ddba', 28), [0, 0.465, 0]);
  const cap = place(ball(0.65, '#ee8076', [1, 0.45, 1], glossy('#ee8076')), [0, 0.62, 0]);
  motion.add(stem, stemBase, underside, cap);

  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10;
    const gill = rounded([0.42, 0.018, 0.022], '#dba982', 0.007);
    gill.position.set(Math.cos(angle) * 0.2, 0.425, Math.sin(angle) * 0.2);
    gill.rotation.y = -angle;
    motion.add(gill);
  }

  const spots = [
    [-0.27, 0.13, 0.1],
    [0.28, 0.22, 0.095],
    [0.05, -0.3, 0.11],
    [-0.38, -0.2, 0.075],
    [0.4, -0.12, 0.075],
    [0.02, 0.08, 0.12],
    [-0.08, 0.4, 0.07],
  ] as const;
  for (const [x, z, radius] of spots) {
    const surface = 0.62 + 0.65 * 0.45 * Math.sqrt(Math.max(0, 1 - (x * x + z * z) / (0.65 * 0.65)));
    const spot = ball(radius, '#fff0d0', [1, 0.28, 1], glossy('#fff0d0'));
    spot.position.set(x, surface + 0.008, z);
    motion.add(spot);
  }

  const rig = makeRig('roof', 'mushroom', { motion });
  rig.root.add(motion);
  return rig;
}

function createUmbrella(): PartRig {
  const motion = namedGroup('motion');
  const pole = place(cylinder(0.045, 0.92, '#685a72', 14, clay('#77677f', 0.35, 0.45)), [0, 0.44, 0]);
  const hook = tube([
    new THREE.Vector3(0, 0.06, 0),
    new THREE.Vector3(0, -0.13, 0),
    new THREE.Vector3(0.12, -0.22, 0),
    new THREE.Vector3(0.23, -0.12, 0),
  ], 0.045, '#685a72', clay('#77677f', 0.35, 0.45));
  motion.add(pole, hook);

  const canopy = namedGroup('canopy', [0, 0.94, 0]);
  const lavender = clay('#9a8bd0');
  const rose = clay('#ef9fae');
  lavender.side = THREE.DoubleSide;
  rose.side = THREE.DoubleSide;
  for (let index = 0; index < 8; index += 1) {
    const panel = makeMesh(
      new THREE.ConeGeometry(0.83, 0.38, 2, 1, true, index * Math.PI / 4, Math.PI / 4),
      index % 2 ? rose : lavender,
    );
    canopy.add(panel);
  }

  for (let index = 0; index < 8; index += 1) {
    const angle = index * Math.PI / 4;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rib = tube([
      new THREE.Vector3(0, 0.185, 0),
      new THREE.Vector3(cosine * 0.42, -0.015, sine * 0.42),
      new THREE.Vector3(cosine * 0.81, -0.18, sine * 0.81),
    ], 0.012, '#f8d88a');
    const scallop = ball(0.16, index % 2 ? '#f4b1b1' : '#b9a9e5', [1, 0.5, 1], glossy(index % 2 ? '#f4b1b1' : '#b9a9e5'));
    scallop.position.set(cosine * 0.67, -0.14, sine * 0.67);
    canopy.add(rib, scallop);
  }
  const ferrule = place(cylinder(0.035, 0.18, '#f3cc72', 12, glossy('#f3cc72')), [0, 0.26, 0]);
  const cap = place(ball(0.065, '#ffe7a2'), [0, 0.36, 0]);
  canopy.add(ferrule, cap);
  motion.add(canopy);

  const rig = makeRig('roof', 'umbrella', { canopy, motion });
  rig.root.add(motion);
  return rig;
}

function createPropeller(): PartRig {
  const base = place(rounded([0.42, 0.12, 0.42], '#777080', 0.05), [0, 0.06, 0]);
  const mast = place(cylinder(0.06, 0.58, '#6f6376', 16, clay('#85909a', 0.32, 0.58)), [0, 0.29, 0]);
  const collar = place(cylinder(0.11, 0.12, '#f2c766', 18, glossy('#f2c766')), [0, 0.55, 0]);
  const rotor = namedGroup('rotor', [0, 0.64, 0]);

  for (let index = 0; index < 3; index += 1) {
    const bladeGroup = namedGroup(`blade-${index}`);
    bladeGroup.rotation.y = index * Math.PI / 3;
    const color = index % 2 ? '#f6c86f' : '#80c9bb';
    const blade = rounded([1.3, 0.055, 0.16], color, 0.025, glossy(color));
    bladeGroup.add(blade);
    for (const x of [-0.58, 0.58]) {
      bladeGroup.add(place(rounded([0.16, 0.065, 0.19], index % 2 ? '#ef887b' : '#f6d67d', 0.025), [x, 0, 0]));
    }
    rotor.add(bladeGroup);
  }
  const hub = place(cylinder(0.12, 0.16, '#f08376', 20, glossy('#f08376')), [0, 0.035, 0]);
  const hubCap = place(ball(0.13, '#f08376', [1, 0.7, 1], glossy('#f08376')), [0, 0.12, 0]);
  rotor.add(hub, hubCap);

  const rig = makeRig('roof', 'propeller', { rotor });
  rig.root.add(base, mast, collar, rotor);
  return rig;
}

function createAntenna(): PartRig {
  const motion = namedGroup('motion');
  const base = place(rounded([0.3, 0.1, 0.3], '#76677e', 0.04), [0, 0.05, 0]);
  const mast = tube([
    new THREE.Vector3(0, 0.08, 0),
    new THREE.Vector3(0.035, 0.43, 0),
    new THREE.Vector3(0.13, 0.82, 0),
  ], 0.04, '#8b94a4', clay('#aab2bf', 0.28, 0.62));
  motion.add(base, mast);
  for (let index = 0; index < 3; index += 1) {
    const coil = place(torus(0.075, 0.018, '#f1c96e', glossy('#f1c96e')), [0.012, 0.14 + index * 0.065, 0]);
    coil.rotation.x = Math.PI / 2;
    motion.add(coil);
  }

  const starTip = place(star('#ffe68a'), [0.13, 0.93, 0]);
  starTip.scale.setScalar(0.82);
  const starCenter = place(ball(0.105, '#fff3ae', [1, 1, 0.45], glowing('#ffd968', 0.75)), [0.13, 0.93, 0.075]);
  motion.add(starTip, starCenter);
  for (const [x, y] of [[-0.16, 0.78], [0.39, 0.93], [0.06, 1.22]] as const) {
    motion.add(place(ball(0.035, '#fff0a0', [1, 1, 1], glowing('#ffe372', 0.8)), [x, y, 0]));
  }

  const rig = makeRig('roof', 'antenna', { motion });
  rig.root.add(motion);
  return rig;
}

function createTeapot(): PartRig {
  const body = place(ball(0.43, '#70c7bd', [1.05, 0.85, 0.95], glossy('#70c7bd')), [0, 0.38, 0]);
  const base = place(cylinder(0.28, 0.1, '#4d9f9c', 24, glossy('#4d9f9c')), [0, 0.08, 0]);
  const band = place(torus(0.37, 0.025, '#f4cc72', glossy('#f4cc72')), [0, 0.37, 0]);
  band.rotation.x = Math.PI / 2;

  const spout = namedGroup('spout', [-0.31, 0.34, 0]);
  const spoutTube = tube([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.23, 0.05, 0),
    new THREE.Vector3(-0.38, 0.25, 0),
    new THREE.Vector3(-0.53, 0.38, 0),
  ], 0.085, '#70c7bd', glossy('#70c7bd'));
  const spoutDirection = new THREE.Vector3(-0.7, 0.7, 0).normalize();
  const spoutRim = place(torus(0.078, 0.018, '#f4cc72', glossy('#f4cc72')), [-0.53, 0.38, 0]);
  spoutRim.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), spoutDirection);
  const spoutOpening = place(cylinder(0.06, 0.018, '#365d64', 18), [-0.535, 0.385, 0]);
  spoutOpening.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), spoutDirection);
  spout.add(spoutTube, spoutRim, spoutOpening);

  const handle = tube([
    new THREE.Vector3(0.32, 0.59, 0),
    new THREE.Vector3(0.62, 0.64, 0),
    new THREE.Vector3(0.71, 0.4, 0),
    new THREE.Vector3(0.57, 0.2, 0),
    new THREE.Vector3(0.31, 0.23, 0),
  ], 0.062, '#58afa9', glossy('#58afa9'));
  const handleGrip = tube([
    new THREE.Vector3(0.61, 0.57, 0),
    new THREE.Vector3(0.65, 0.41, 0),
    new THREE.Vector3(0.57, 0.28, 0),
  ], 0.068, '#f4cc72', glossy('#f4cc72'));

  const lid = namedGroup('lid', [0, 0.7, 0]);
  const lidDisk = cylinder(0.285, 0.065, '#83d4c6', 26, glossy('#83d4c6'));
  const lidRim = place(torus(0.275, 0.025, '#f4cc72', glossy('#f4cc72')), [0, -0.005, 0]);
  lidRim.rotation.x = Math.PI / 2;
  const lidKnob = place(ball(0.09, '#ef8d86', [1, 0.85, 1], glossy('#ef8d86')), [0, 0.105, 0]);
  lid.add(lidDisk, lidRim, lidKnob);

  for (const [x, y] of [[-0.15, 0.45], [0, 0.52], [0.15, 0.45]] as const) {
    const dot = place(ball(0.035, '#fff0b5', [1, 1, 0.45], glossy('#fff0b5')), [x, y, 0.395]);
    body.add(dot);
    dot.position.sub(body.position);
  }

  const steam = namedGroup('steam', [0, 0.82, 0]);
  const steamMaterial = translucent('#f3fbff', 0.52);
  for (let index = 0; index < 3; index += 1) {
    const x = (index - 1) * 0.13;
    const wisp = tube([
      new THREE.Vector3(x, 0, 0),
      new THREE.Vector3(x + 0.07, 0.14, 0.015),
      new THREE.Vector3(x - 0.055, 0.3, -0.015),
      new THREE.Vector3(x + 0.035, 0.48, 0),
    ], 0.022, '#f3fbff', steamMaterial);
    wisp.name = `steam-${index}`;
    steam.add(wisp);
  }
  noShadow(steam);

  const rig = makeRig('roof', 'teapot', { lid, spout, steam });
  rig.root.add(body, base, band, spout, handle, handleGrip, lid, steam);
  return rig;
}

function createBirdcage(): PartRig {
  const brass = clay('#e7bd61', 0.3, 0.58);
  const base = place(cylinder(0.44, 0.12, '#e68778', 28, glossy('#e68778')), [0, 0.06, 0]);
  const floor = place(cylinder(0.39, 0.055, '#f3d791', 28), [0, 0.15, 0]);
  const baseRim = place(torus(0.405, 0.035, '#f1ca70', brass), [0, 0.13, 0]);
  baseRim.rotation.x = Math.PI / 2;

  const bars = namedGroup('bars');
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI * 2 / 12;
    const x = Math.cos(angle) * 0.36;
    const z = Math.sin(angle) * 0.36;
    const bar = place(cylinder(0.018, 0.66, '#e7bd61', 10, brass), [x, 0.5, z]);
    const rib = tube([
      new THREE.Vector3(x, 0.82, z),
      new THREE.Vector3(x * 0.78, 1.01, z * 0.78),
      new THREE.Vector3(x * 0.3, 1.14, z * 0.3),
      new THREE.Vector3(0, 1.17, 0),
    ], 0.018, '#e7bd61', brass);
    bars.add(bar, rib);
  }
  for (const y of [0.22, 0.55, 0.82]) {
    const ring = place(torus(0.36, y === 0.82 ? 0.026 : 0.018, '#e7bd61', brass), [0, y, 0]);
    ring.rotation.x = Math.PI / 2;
    bars.add(ring);
  }

  const door = tube([
    new THREE.Vector3(-0.11, 0.28, 0.365),
    new THREE.Vector3(-0.11, 0.7, 0.365),
    new THREE.Vector3(0.11, 0.7, 0.365),
    new THREE.Vector3(0.11, 0.28, 0.365),
    new THREE.Vector3(-0.11, 0.28, 0.365),
  ], 0.018, '#f6d77f', brass);
  const latch = place(ball(0.035, '#ef8578', [1, 1, 0.65], glossy('#ef8578')), [0.13, 0.48, 0.375]);
  const topKnob = place(ball(0.065, '#f3ce72', [1, 1, 1], brass), [0, 1.18, 0]);
  const hangingLoop = place(torus(0.105, 0.02, '#e7bd61', brass), [0, 1.32, 0]);

  const perch = place(cylinder(0.025, 0.62, '#9b694b', 12), [0, 0.28, 0]);
  perch.rotation.z = Math.PI / 2;
  const bird = namedGroup('bird', [-0.02, 0.43, 0.02]);
  const birdBody = ball(0.16, '#66b9d4', [0.9, 1.1, 0.9], glossy('#66b9d4'));
  const birdHead = place(ball(0.12, '#80d3df', [1, 1, 0.95], glossy('#80d3df')), [0.07, 0.19, 0]);
  const chest = place(ball(0.105, '#f6d67c', [0.75, 1, 0.55]), [0.085, -0.01, 0.09]);
  const beak = place(cone(0.05, 0.13, '#ef9a59', 12), [0.2, 0.19, 0]);
  beak.rotation.z = -Math.PI / 2;
  for (const side of [-1, 1]) {
    const wing = place(ball(0.105, side > 0 ? '#438faf' : '#55a5bf', [1.15, 0.65, 0.45], glossy(side > 0 ? '#438faf' : '#55a5bf')), [-0.035, 0, side * 0.13]);
    wing.rotation.z = -0.35;
    const eye = place(ball(0.025, '#293744', [1, 1, 0.55]), [0.11, 0.225, side * 0.105]);
    bird.add(wing, eye);
  }
  const tail = place(cone(0.075, 0.24, '#397f9f', 12), [-0.17, -0.03, 0]);
  tail.rotation.z = Math.PI / 2;
  for (const x of [-0.045, 0.045]) {
    bird.add(place(cylinder(0.012, 0.1, '#d68e52', 8), [x, -0.16, 0]));
  }
  bird.add(birdBody, birdHead, chest, beak, tail);

  const rig = makeRig('roof', 'birdcage', { bird });
  rig.root.add(base, floor, baseRim, bars, door, latch, topKnob, hangingLoop, perch, bird);
  return rig;
}

function createFlower(position: Vec3, petalColor: THREE.ColorRepresentation): THREE.Group {
  const flower = namedGroup('flower', position);
  for (let index = 0; index < 6; index += 1) {
    const angle = index * Math.PI / 3;
    const petal = ball(0.055, petalColor, [1.15, 0.5, 0.85], glossy(petalColor));
    petal.position.set(Math.cos(angle) * 0.068, 0, Math.sin(angle) * 0.068);
    petal.rotation.y = -angle;
    flower.add(petal);
  }
  flower.add(place(ball(0.05, '#f7cf58', [1, 0.7, 1], glowing('#f7cf58', 0.25)), [0, 0.025, 0]));
  return flower;
}

function createCactus(): PartRig {
  const motion = namedGroup('motion');
  const pot = makeMesh(new THREE.CylinderGeometry(0.27, 0.36, 0.4, 24), glossy('#db8060'), [0, 0.2, 0]);
  const potBand = place(cylinder(0.31, 0.1, '#ed9a70', 24, glossy('#ed9a70')), [0, 0.36, 0]);
  const potRim = place(torus(0.31, 0.045, '#f1ad7e', glossy('#f1ad7e')), [0, 0.42, 0]);
  potRim.rotation.x = Math.PI / 2;
  const soil = place(cylinder(0.275, 0.035, '#685044', 24), [0, 0.435, 0]);
  motion.add(pot, potBand, potRim, soil);

  const cactusMaterial = glossy('#58b975');
  const main = place(cylinder(0.18, 0.78, '#58b975', 20, cactusMaterial), [0, 0.83, 0]);
  const mainTop = place(ball(0.18, '#63c481', [1, 1, 1], cactusMaterial), [0, 1.22, 0]);
  motion.add(main, mainTop);
  for (let index = 0; index < 7; index += 1) {
    const angle = index * Math.PI * 2 / 7;
    const rib = place(cylinder(0.012, 0.65, '#8bd594', 8), [Math.cos(angle) * 0.172, 0.84, Math.sin(angle) * 0.172]);
    motion.add(rib);
  }

  const leftArm = tube([
    new THREE.Vector3(-0.11, 0.77, 0),
    new THREE.Vector3(-0.3, 0.77, 0),
    new THREE.Vector3(-0.39, 0.87, 0),
    new THREE.Vector3(-0.39, 1.03, 0),
  ], 0.09, '#55b471', cactusMaterial);
  const leftTip = place(ball(0.09, '#63c481', [1, 1, 1], cactusMaterial), [-0.39, 1.03, 0]);
  const rightArm = tube([
    new THREE.Vector3(0.11, 0.94, 0),
    new THREE.Vector3(0.28, 0.94, 0),
    new THREE.Vector3(0.36, 1.04, 0),
    new THREE.Vector3(0.36, 1.17, 0),
  ], 0.085, '#55b471', cactusMaterial);
  const rightTip = place(ball(0.085, '#63c481', [1, 1, 1], cactusMaterial), [0.36, 1.17, 0]);
  motion.add(leftArm, leftTip, rightArm, rightTip);

  for (const [x, y] of [[-0.065, 0.65], [0.065, 0.79], [-0.065, 0.94], [0.065, 1.08]] as const) {
    const spine = place(cone(0.018, 0.06, '#fff0bd', 8), [x, y, 0.185]);
    spine.rotation.x = Math.PI / 2;
    motion.add(spine);
  }
  motion.add(
    createFlower([0, 1.41, 0], '#ef7f9d'),
    createFlower([-0.39, 1.14, 0], '#f5a3bc'),
    createFlower([0.36, 1.27, 0], '#ef8c87'),
  );

  const rig = makeRig('roof', 'cactus', { motion });
  rig.root.add(motion);
  return rig;
}

function createWhale(): PartRig {
  const motion = namedGroup('motion');
  const body = place(ball(0.5, '#65a9d5', [1.35, 0.72, 0.75], glossy('#65a9d5')), [-0.05, 0.43, 0]);
  const belly = place(ball(0.45, '#d8eee5', [1.22, 0.52, 0.76], glossy('#d8eee5')), [0.03, 0.29, 0]);
  const tailStock = place(cylinder(0.13, 0.36, '#5998c6', 18, glossy('#5998c6')), [-0.69, 0.44, 0]);
  tailStock.rotation.z = Math.PI / 2;
  motion.add(body, belly, tailStock);

  const tail = namedGroup('tail', [-0.69, 0.44, 0]);
  for (const side of [-1, 1]) {
    const fluke = place(ball(0.2, '#5798c5', [1.15, 0.22, 1.3], glossy('#5798c5')), [-0.2, 0.02, side * 0.17]);
    fluke.rotation.y = side * 0.48;
    tail.add(fluke);

    const fin = place(ball(0.18, '#4e92bd', [1.15, 0.25, 1.35], glossy('#4e92bd')), [0.02, 0.28, side * 0.39]);
    fin.rotation.x = side * 0.35;
    fin.rotation.y = -0.3;
    motion.add(fin);

    const eyeWhite = place(ball(0.06, '#f8f5df', [1, 1, 0.55]), [0.38, 0.57, side * 0.285]);
    const pupil = place(ball(0.03, '#263b50', [1, 1, 0.5]), [0.395, 0.575, side * 0.32]);
    const cheek = place(ball(0.045, '#ee9b9f', [1, 0.65, 0.35]), [0.37, 0.45, side * 0.325]);
    const mouth = tube([
      new THREE.Vector3(0.2, 0.36, side * 0.335),
      new THREE.Vector3(0.36, 0.34, side * 0.34),
      new THREE.Vector3(0.49, 0.39, side * 0.3),
    ], 0.013, '#355e78');
    motion.add(eyeWhite, pupil, cheek, mouth);
  }
  motion.add(tail);

  const blowhole = place(cylinder(0.06, 0.025, '#365e79', 16), [-0.03, 0.795, 0]);
  const spout = namedGroup('spout', [-0.03, 0.81, 0]);
  const waterMaterial = translucent('#a9edf0', 0.7);
  const streams = [
    [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.28, 0), new THREE.Vector3(0, 0.54, 0)],
    [new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(-0.13, 0.36, 0.025), new THREE.Vector3(-0.22, 0.44, 0.06)],
    [new THREE.Vector3(0, 0.18, 0), new THREE.Vector3(0.14, 0.35, -0.025), new THREE.Vector3(0.23, 0.43, -0.06)],
  ];
  for (const points of streams) {
    spout.add(tube(points, 0.032, '#a9edf0', waterMaterial));
    const end = points[points.length - 1];
    if (end) spout.add(place(ball(0.055, '#c7f7f4', [0.8, 1.2, 0.8], waterMaterial), [end.x, end.y, end.z]));
  }
  noShadow(spout);
  motion.add(blowhole, spout);

  const rig = makeRig('roof', 'whale', { spout, motion, tail });
  rig.root.add(motion);
  return rig;
}

export const ROOF_MODELS: Record<MonsterCarBuild['roof'], () => PartRig> = {
  mushroom: createMushroom,
  umbrella: createUmbrella,
  propeller: createPropeller,
  antenna: createAntenna,
  teapot: createTeapot,
  birdcage: createBirdcage,
  cactus: createCactus,
  whale: createWhale,
};

export function createRoofModel(id: MonsterCarBuild['roof']): PartRig {
  return ROOF_MODELS[id]();
}
