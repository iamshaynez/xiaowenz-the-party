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

function createTrunk(): PartRig {
  const motion = namedGroup('motion');
  const lid = namedGroup('lid', [0.15, 0.27, 0]);

  const body = place(rounded([0.66, 0.5, 1.05], '#a57955', 0.11), [-0.18, 0.03, 0]);
  const inset = place(rounded([0.45, 0.25, 0.025], '#82563f', 0.01), [-0.18, 0.025, 0.532]);
  const lidPanel = place(rounded([0.7, 0.25, 1.08], '#b98960', 0.1), [-0.33, 0.09, 0]);
  lid.add(lidPanel);

  for (const z of [-0.31, 0.31]) {
    motion.add(place(rounded([0.7, 0.12, 0.09], '#f2cf79', 0.03), [-0.18, 0.12, z]));
    lid.add(place(rounded([0.72, 0.08, 0.09], '#f7dc91', 0.025), [-0.33, 0.19, z]));
  }

  const latch = place(rounded([0.045, 0.18, 0.2], '#f5cf68', 0.018, glossy('#f5cf68')), [-0.515, 0.12, 0]);
  const keyhole = place(ball(0.028, '#62463d', [0.3, 1, 1]), [-0.542, 0.13, 0]);
  const handle = tube([
    new THREE.Vector3(-0.54, 0.19, -0.17),
    new THREE.Vector3(-0.65, 0.34, -0.13),
    new THREE.Vector3(-0.65, 0.34, 0.13),
    new THREE.Vector3(-0.54, 0.19, 0.17),
  ], 0.035, '#65463b');

  motion.add(body, inset, lid, latch, keyhole, handle);
  const rig = makeRig('rear', 'trunk', { motion, lid });
  rig.root.add(motion);
  return rig;
}

function createRocket(): PartRig {
  const body = place(cylinder(0.3, 0.92, '#e8e1d4', 24, glossy('#e8e1d4')), [-0.35, 0.13, 0]);
  body.rotation.z = Math.PI / 2;
  const nose = place(cone(0.3, 0.48, '#ed786c', 24, glossy('#ed786c')), [-1.02, 0.13, 0]);
  nose.rotation.z = Math.PI / 2;

  const nozzle = place(cylinder(0.19, 0.2, '#66717d', 20, clay('#87939e', 0.32, 0.62)), [0.19, 0.13, 0]);
  nozzle.rotation.z = Math.PI / 2;
  const nozzleHole = place(cylinder(0.115, 0.21, '#343743', 20), [0.22, 0.13, 0]);
  nozzleHole.rotation.z = Math.PI / 2;

  const fins = namedGroup('fins');
  fins.add(place(rounded([0.34, 0.36, 0.07], '#ed786c', 0.03), [-0.01, 0.4, 0]));
  fins.add(place(rounded([0.34, 0.28, 0.07], '#d95f63', 0.03), [-0.01, -0.1, 0]));
  for (const z of [-0.32, 0.32]) {
    fins.add(place(rounded([0.34, 0.07, 0.3], z > 0 ? '#f18979' : '#d95f63', 0.03), [-0.01, 0.13, z]));
  }

  for (const z of [-0.292, 0.292]) {
    const rim = place(torus(0.115, 0.025, '#e9b956', glossy('#e9b956')), [-0.35, 0.16, z]);
    const glass = place(ball(0.1, '#78d6e5', [1, 1, 0.28], glossy('#78d6e5')), [-0.35, 0.16, z * 1.025]);
    fins.add(rim, glass);
  }

  const flame = namedGroup('flame', [0.39, 0.13, 0]);
  const outerFlame = cone(0.19, 0.58, '#ff8b4e', 16, glowing('#ff8b4e', 1.1));
  outerFlame.rotation.z = -Math.PI / 2;
  outerFlame.position.x = 0.22;
  const innerFlame = cone(0.105, 0.4, '#fff1a8', 14, glowing('#ffe678', 1.35));
  innerFlame.rotation.z = -Math.PI / 2;
  innerFlame.position.x = 0.12;
  flame.add(outerFlame, innerFlame);
  for (let index = 0; index < 4; index += 1) {
    const puff = ball(0.075 + index * 0.018, index % 2 ? '#fff1b5' : '#ffad66', [1.25, 0.85, 0.85], glowing(index % 2 ? '#fff1b5' : '#ffad66'));
    puff.position.set(0.42 + index * 0.14, Math.sin(index * 2.1) * 0.055, Math.cos(index * 1.7) * 0.055);
    flame.add(puff);
  }
  flame.visible = false;

  const rig = makeRig('rear', 'rocket', { flame });
  rig.root.add(body, nose, nozzle, nozzleHole, fins, flame);
  return rig;
}

function createBubble(): PartRig {
  const tub = place(rounded([0.85, 0.5, 1.08], '#f5efe5', 0.2, glossy('#f5efe5')), [-0.22, 0.02, 0]);
  const rim = place(rounded([0.9, 0.1, 1.12], '#fffaf1', 0.045), [-0.22, 0.27, 0]);
  const water = place(rounded([0.7, 0.045, 0.88], '#80dbe0', 0.02, glossy('#80dbe0')), [-0.22, 0.325, 0]);

  for (const x of [-0.5, 0.06]) {
    for (const z of [-0.38, 0.38]) {
      const foot = place(ball(0.105, '#e8bd62', [0.8, 1, 0.8], glossy('#e8bd62')), [x, -0.28, z]);
      tub.add(foot);
      foot.position.sub(tub.position);
    }
  }

  const faucet = tube([
    new THREE.Vector3(0.13, 0.28, -0.34),
    new THREE.Vector3(0.13, 0.58, -0.34),
    new THREE.Vector3(-0.03, 0.64, -0.34),
    new THREE.Vector3(-0.12, 0.48, -0.34),
  ], 0.035, '#b7c8ce', clay('#c8d6db', 0.24, 0.7));
  const tap = place(cylinder(0.055, 0.16, '#ef8c86', 12), [0.13, 0.4, -0.2]);
  tap.rotation.x = Math.PI / 2;

  const motion = namedGroup('motion');
  const bubbleMaterial = translucent('#b9f4ef', 0.6);
  for (let index = 0; index < 10; index += 1) {
    const radius = 0.09 + (index % 3) * 0.032;
    const bubble = ball(radius, '#c5f4f1', [1, 1, 1], bubbleMaterial);
    bubble.name = `bubble-${index}`;
    bubble.position.set(
      -0.53 + (index % 5) * 0.16,
      0.4 + Math.floor(index / 5) * 0.2 + (index % 2) * 0.055,
      (index % 2 ? -1 : 1) * (0.16 + (index % 3) * 0.075),
    );
    const highlight = place(ball(radius * 0.22, '#ffffff', [1, 1, 0.45], glossy('#ffffff')), [-radius * 0.28, radius * 0.3, radius * 0.82]);
    bubble.add(highlight);
    motion.add(bubble);
  }
  noShadow(motion);

  const rig = makeRig('rear', 'bubble', { motion });
  rig.root.add(tub, rim, water, faucet, tap, motion);
  return rig;
}

function createTail(): PartRig {
  const motion = namedGroup('motion');
  const tail = namedGroup('tail');
  const points = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-0.55, 0.12, 0),
    new THREE.Vector3(-0.85, 0.58, 0),
    new THREE.Vector3(-0.55, 0.88, 0),
  ];
  tail.add(tube(points, 0.15, '#ed916d', glossy('#ed916d')));
  tail.add(tube([
    new THREE.Vector3(-0.68, 0.3, 0),
    new THREE.Vector3(-0.79, 0.43, 0),
    new THREE.Vector3(-0.84, 0.54, 0),
  ], 0.154, '#cf725d'));
  tail.add(tube([
    new THREE.Vector3(-0.82, 0.61, 0),
    new THREE.Vector3(-0.73, 0.75, 0),
    new THREE.Vector3(-0.62, 0.83, 0),
  ], 0.154, '#cf725d'));
  const tip = place(ball(0.23, '#fff0d2', [1, 1, 1], glossy('#fff0d2')), [-0.55, 0.88, 0]);
  const tipStripe = place(ball(0.12, '#f8d9b7', [1.1, 0.45, 1.02]), [-0.63, 0.82, 0]);
  tail.add(tip, tipStripe);
  motion.add(tail);

  const rig = makeRig('rear', 'tail', { motion, tail });
  rig.root.add(motion);
  return rig;
}

function createWashingMachine(): PartRig {
  const body = place(rounded([0.78, 1, 1.02], '#e8f0ee', 0.12, glossy('#e8f0ee')), [-0.22, 0.22, 0]);
  const sideStripe = place(rounded([0.8, 0.12, 1.035], '#77c9c2', 0.035), [-0.22, 0.54, 0]);
  const top = place(rounded([0.82, 0.1, 1.05], '#f9fcf7', 0.04), [-0.22, 0.73, 0]);

  const drum = namedGroup('drum', [-0.22, 0.12, 0.54]);
  const darkInterior = cylinder(0.29, 0.055, '#334552', 28);
  darkInterior.rotation.x = Math.PI / 2;
  const outerRing = torus(0.315, 0.065, '#bcc9cd', clay('#d3dde0', 0.25, 0.68));
  outerRing.position.z = 0.035;
  const innerRing = torus(0.25, 0.022, '#76d2d2', glossy('#76d2d2'));
  innerRing.position.z = 0.07;
  drum.add(darkInterior, outerRing, innerRing);

  for (let index = 0; index < 3; index += 1) {
    const angle = index * Math.PI * 2 / 3;
    const paddle = rounded([0.17, 0.06, 0.045], '#d9faf4', 0.02);
    paddle.position.set(Math.cos(angle) * 0.15, Math.sin(angle) * 0.15, 0.065);
    paddle.rotation.z = angle;
    drum.add(paddle);
  }
  const glass = ball(0.255, '#a9e7ed', [1, 1, 0.18], translucent('#a9e7ed', 0.42));
  glass.position.z = 0.09;
  drum.add(glass);

  const controls = namedGroup('controls');
  for (const [index, x] of [-0.47, 0.03].entries()) {
    const color = index === 0 ? '#f1b75e' : '#ef857d';
    const knob = place(cylinder(0.068, 0.065, color, 18, glossy(color)), [x, 0.59, 0.55]);
    knob.rotation.x = Math.PI / 2;
    const indicator = place(rounded([0.018, 0.055, 0.018], '#fff7dc', 0.007), [x, 0.625, 0.588]);
    controls.add(knob, indicator);
  }
  const display = place(rounded([0.3, 0.14, 0.04], '#3b747c', 0.016, glowing('#69d8cf', 0.35)), [-0.22, 0.59, 0.535]);
  const displayLine = place(rounded([0.18, 0.025, 0.018], '#c8fff1', 0.008, glowing('#c8fff1', 0.7)), [-0.22, 0.59, 0.56]);
  controls.add(display, displayLine);

  const rig = makeRig('rear', 'washing-machine', { drum });
  rig.root.add(body, sideStripe, top, drum, controls);
  return rig;
}

function createCampfire(): PartRig {
  const centerX = -0.25;
  const stones = namedGroup('stones');
  for (let index = 0; index < 9; index += 1) {
    const angle = index * Math.PI * 2 / 9;
    const stone = ball(0.12, index % 2 ? '#8b8a91' : '#aaa49d', [1.2, 0.7, 1]);
    stone.position.set(centerX + Math.cos(angle) * 0.5, -0.22, Math.sin(angle) * 0.45);
    stone.rotation.y = angle;
    stones.add(stone);
  }

  const logs = namedGroup('logs');
  const logMaterial = clay('#79503a');
  const horizontal = place(cylinder(0.11, 0.86, '#79503a', 14, logMaterial), [centerX, -0.055, 0]);
  horizontal.rotation.z = Math.PI / 2;
  const cross = place(cylinder(0.105, 0.78, '#684331', 14), [centerX, -0.13, 0]);
  cross.rotation.x = Math.PI / 2;
  logs.add(horizontal, cross);
  for (const x of [centerX - 0.435, centerX + 0.435]) {
    const end = place(cylinder(0.083, 0.018, '#d39a62', 14), [x, -0.055, 0]);
    end.rotation.z = Math.PI / 2;
    logs.add(end);
  }
  for (const z of [-0.395, 0.395]) {
    const end = place(cylinder(0.078, 0.018, '#c78c58', 14), [centerX, -0.13, z]);
    end.rotation.x = Math.PI / 2;
    logs.add(end);
  }

  const flame = namedGroup('flame', [centerX, -0.04, 0]);
  const outer = place(cone(0.29, 0.68, '#ff784f', 18, glowing('#ff784f', 1.15)), [0, 0.35, 0]);
  const inner = place(cone(0.17, 0.48, '#ffe778', 16, glowing('#ffe778', 1.35)), [0.035, 0.25, 0.025]);
  const left = place(cone(0.13, 0.44, '#ffad4d', 14, glowing('#ff9b45', 0.95)), [-0.18, 0.22, 0.02]);
  left.rotation.z = 0.28;
  const right = place(cone(0.12, 0.4, '#f95d55', 14, glowing('#f95d55', 0.85)), [0.18, 0.2, -0.02]);
  right.rotation.z = -0.3;
  flame.add(outer, inner, left, right);

  const marshmallows = namedGroup('marshmallows');
  const skewers = [
    { start: [0.08, -0.08, 0.38] as Vec3, end: [-0.38, 0.57, 0.27] as Vec3 },
    { start: [-0.03, -0.12, -0.42] as Vec3, end: [-0.48, 0.48, -0.3] as Vec3 },
    { start: [-0.65, -0.09, 0.3] as Vec3, end: [-0.45, 0.43, 0.13] as Vec3 },
  ];
  for (const [index, skewer] of skewers.entries()) {
    const start = new THREE.Vector3(...skewer.start);
    const end = new THREE.Vector3(...skewer.end);
    marshmallows.add(tube([start, end], 0.018, '#b88756'));
    const treat = rounded([0.15, 0.19, 0.15], index === 1 ? '#f2d3ad' : '#fff4dd', 0.055);
    treat.position.copy(end);
    treat.rotation.z = index % 2 ? -0.35 : 0.3;
    const toasted = place(ball(0.045, '#c78656', [1, 0.25, 0.8]), [0, 0.095, 0]);
    treat.add(toasted);
    marshmallows.add(treat);
  }

  const rig = makeRig('rear', 'campfire', { flame });
  rig.root.add(stones, logs, flame, marshmallows);
  return rig;
}

function createJackbox(): PartRig {
  const box = place(rounded([0.75, 0.65, 0.86], '#8767c7', 0.09, glossy('#8767c7')), [-0.25, -0.05, 0]);
  const base = place(rounded([0.82, 0.1, 0.93], '#f1b957', 0.04), [-0.25, -0.36, 0]);
  const frontPanel = place(rounded([0.58, 0.45, 0.035], '#ef7f91', 0.03), [-0.25, -0.05, 0.445]);
  const decoration = place(star('#ffe78b'), [-0.25, -0.12, 0.47]);
  decoration.scale.setScalar(0.58);

  const lid = namedGroup('lid', [0.13, 0.3, 0]);
  const lidPanel = place(rounded([0.82, 0.1, 0.93], '#f2c65e', 0.045), [-0.38, 0.05, 0]);
  const lidInset = place(rounded([0.58, 0.035, 0.67], '#ef7f91', 0.015), [-0.38, 0.11, 0]);
  lid.add(lidPanel, lidInset);
  lid.rotation.z = -0.75;

  const motion = namedGroup('motion');
  const spring = namedGroup('spring', [-0.25, 0.28, 0]);
  const coilPoints: THREE.Vector3[] = [];
  for (let index = 0; index <= 48; index += 1) {
    const progress = index / 48;
    const angle = progress * Math.PI * 6;
    coilPoints.push(new THREE.Vector3(Math.cos(angle) * 0.17, progress * 0.5, Math.sin(angle) * 0.17));
  }
  spring.add(tube(coilPoints, 0.033, '#d7e1df', clay('#d7e1df', 0.28, 0.65)));

  const clownBody = place(ball(0.21, '#6bc6b5', [1, 1.15, 0.9], glossy('#6bc6b5')), [-0.25, 0.83, 0]);
  const collar = place(torus(0.2, 0.055, '#f6cf64'), [-0.25, 0.99, 0]);
  collar.rotation.x = Math.PI / 2;
  const head = place(ball(0.23, '#fff0d5', [1, 1, 0.95]), [-0.25, 1.16, 0]);
  const nose = place(ball(0.065, '#ef6f6c'), [-0.25, 1.14, 0.22]);
  const smile = makeMesh(new THREE.TorusGeometry(0.085, 0.018, 8, 18, Math.PI), clay('#b85162'));
  smile.position.set(-0.25, 1.075, 0.211);
  smile.rotation.z = Math.PI;
  for (const x of [-0.32, -0.18]) {
    const eyeWhite = place(ball(0.048, '#ffffff', [1, 1.2, 0.55]), [x, 1.22, 0.202]);
    const pupil = place(ball(0.023, '#343449', [1, 1, 0.5]), [x, 1.22, 0.229]);
    motion.add(eyeWhite, pupil);
  }
  for (const x of [-0.475, -0.025]) {
    motion.add(place(ball(0.11, '#ed805f', [0.85, 1.1, 0.9]), [x, 1.2, 0]));
  }
  const hat = place(cone(0.17, 0.36, '#ed6f8d', 18, glossy('#ed6f8d')), [-0.25, 1.48, 0]);
  const hatBand = place(cylinder(0.17, 0.055, '#f6cf64', 18), [-0.25, 1.315, 0]);
  const hatPom = place(ball(0.06, '#fff0a5'), [-0.25, 1.68, 0]);
  motion.add(spring, clownBody, collar, head, nose, smile, hat, hatBand, hatPom);

  const crank = place(cylinder(0.055, 0.16, '#d3dee0', 14, clay('#d3dee0', 0.3, 0.65)), [-0.03, -0.08, 0.49]);
  crank.rotation.x = Math.PI / 2;
  const crankArm = place(rounded([0.2, 0.045, 0.045], '#f2cf64', 0.018), [0.04, -0.08, 0.59]);
  const crankHandle = place(ball(0.055, '#ef7f91'), [0.15, -0.08, 0.59]);

  const rig = makeRig('rear', 'jackbox', { lid, spring, motion });
  rig.root.add(box, base, frontPanel, decoration, lid, motion, crank, crankArm, crankHandle);
  return rig;
}

function createSnail(): PartRig {
  const motion = namedGroup('motion');
  const body = place(ball(0.42, '#83c99b', [1.55, 0.45, 0.7], glossy('#83c99b')), [-0.25, -0.06, 0]);
  const head = place(ball(0.26, '#93d7a5', [1.05, 1, 0.95], glossy('#93d7a5')), [-0.86, 0.11, 0]);
  const tail = place(cone(0.18, 0.45, '#75b98c', 16), [0.37, -0.06, 0]);
  tail.rotation.z = -Math.PI / 2;

  const shell = namedGroup('shell', [-0.13, 0.39, 0]);
  const shellBody = ball(0.46, '#ed9a65', [1, 1, 0.72], glossy('#ed9a65'));
  const shellCap = place(ball(0.12, '#f6c777', [1, 1, 0.5], glossy('#f6c777')), [0, 0, 0.32]);
  shell.add(shellBody, shellCap);
  for (const side of [-1, 1]) {
    const spiralPoints: THREE.Vector3[] = [];
    for (let index = 0; index <= 48; index += 1) {
      const progress = index / 48;
      const angle = progress * Math.PI * 4.2;
      const radius = 0.36 * (1 - progress) + 0.018;
      spiralPoints.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, side * 0.325));
    }
    shell.add(tube(spiralPoints, 0.026, side > 0 ? '#ffd083' : '#d77b5c', glossy(side > 0 ? '#ffd083' : '#d77b5c')));
  }

  for (const z of [-0.13, 0.13]) {
    const stalk = tube([
      new THREE.Vector3(-0.9, 0.25, z),
      new THREE.Vector3(-0.98, 0.42, z * 1.15),
      new THREE.Vector3(-1.01, 0.57, z * 1.25),
    ], 0.033, '#83c99b');
    const eye = place(ball(0.09, '#fff9df'), [-1.015, 0.59, z * 1.25]);
    const pupil = place(ball(0.041, '#35434a', [0.55, 1, 1]), [-1.085, 0.6, z * 1.25]);
    motion.add(stalk, eye, pupil);
  }
  const blush = place(ball(0.055, '#ef9c91', [0.4, 0.7, 1]), [-1.08, 0.08, 0.13]);
  motion.add(body, head, tail, shell, blush);

  const rig = makeRig('rear', 'snail', { shell, motion });
  rig.root.add(motion);
  return rig;
}

export const REAR_MODELS: Record<MonsterCarBuild['rear'], () => PartRig> = {
  trunk: createTrunk,
  rocket: createRocket,
  bubble: createBubble,
  tail: createTail,
  'washing-machine': createWashingMachine,
  campfire: createCampfire,
  jackbox: createJackbox,
  snail: createSnail,
};

export function createRearModel(id: MonsterCarBuild['rear']): PartRig {
  return REAR_MODELS[id]();
}
