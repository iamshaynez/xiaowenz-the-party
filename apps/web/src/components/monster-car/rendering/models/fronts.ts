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

function namedGroup(name: string) {
  const group = new THREE.Group();
  group.name = name;
  return group;
}

function xCylinder(radius: number, length: number, color: string, material?: THREE.Material) {
  return cylinder(radius, length, color, 20, material).rotateZ(Math.PI / 2);
}

function finishFront(
  id: string,
  motion: THREE.Group,
  animatedNodes: Record<string, THREE.Object3D> = {},
): PartRig {
  const rig = makeRig('front', id, { motion, ...animatedNodes });
  rig.root.add(motion);
  return rig;
}

function smileFront(): PartRig {
  const motion = namedGroup('motion');
  const faceMaterial = glossy('#f6b29f', 0.4);
  const cream = clay('#fff0d2', 0.64);
  const dark = glossy('#67454f', 0.32);

  motion.add(at(rounded([0.13, 0.76, 1.1], '#fff0d2', 0.055, cream), [-0.09, 0, 0]));
  motion.add(rounded([0.25, 0.67, 1.01], '#f6b29f', 0.11, faceMaterial));
  const nose = ball(0.19, '#ffd7a1', [0.9, 0.8, 1], glossy('#ffd7a1'));
  nose.position.set(0.23, 0.015, 0);
  motion.add(nose);

  const smile = tube([
    new THREE.Vector3(0.16, -0.09, -0.24),
    new THREE.Vector3(0.19, -0.18, -0.12),
    new THREE.Vector3(0.2, -0.205, 0),
    new THREE.Vector3(0.19, -0.18, 0.12),
    new THREE.Vector3(0.16, -0.09, 0.24),
  ], 0.032, '#67454f', dark);
  motion.add(smile);

  for (const side of [-1, 1]) {
    const eye = ball(0.068, '#403543', [0.35, 1, 0.85], dark);
    eye.position.set(0.145, 0.19, side * 0.22);
    motion.add(eye);
    const glint = ball(0.018, '#fff9e9', [0.25, 1, 1], glossy('#fff9e9'));
    glint.position.set(0.172, 0.215, side * 0.205);
    motion.add(glint);
    const cheek = ball(0.095, '#f48695', [0.28, 0.7, 1], glossy('#f48695'));
    cheek.position.set(0.15, -0.015, side * 0.35);
    motion.add(cheek);
    const brow = rounded([0.025, 0.035, 0.16], '#67454f', 0.01, dark);
    brow.position.set(0.15, 0.295, side * 0.22);
    brow.rotation.x = side * 0.12;
    motion.add(brow);
  }
  motion.add(at(rounded([0.39, 0.11, 1.06], '#83cbbc', 0.045, glossy('#83cbbc')), [0.025, -0.37, 0]));
  for (const z of [-0.39, 0.39]) {
    motion.add(at(ball(0.045, '#f8d778', [0.5, 1, 1], glowing('#f8d778', 0.3)), [0.24, -0.35, z]));
  }
  return finishFront('smile', motion);
}

function duckFront(): PartRig {
  const motion = namedGroup('motion');
  const jaw = namedGroup('jaw');
  const yellow = glossy('#f8d867', 0.35);
  const orange = glossy('#f39b57', 0.35);
  const dark = glossy('#292d3b', 0.24);

  motion.add(at(rounded([0.48, 0.24, 0.8], '#f8d867', 0.1, yellow), [-0.06, -0.25, 0]));
  const head = ball(0.43, '#f8d867', [1.1, 1, 1], yellow);
  head.position.set(0.14, 0.16, 0);
  motion.add(head);
  motion.add(at(rounded([0.53, 0.17, 0.56], '#f39b57', 0.07, orange), [0.53, 0.065, 0]));
  motion.add(at(rounded([0.42, 0.022, 0.5], '#9f5a45', 0.008), [0.55, 0.005, 0]));

  jaw.position.set(0.28, -0.015, 0);
  jaw.add(at(rounded([0.48, 0.115, 0.52], '#ed8b4e', 0.05, orange), [0.23, -0.035, 0]));
  const tongue = rounded([0.28, 0.025, 0.3], '#ef8f91', 0.01, glossy('#ef8f91'));
  tongue.position.set(0.24, 0.028, 0);
  jaw.add(tongue);
  motion.add(jaw);

  for (const side of [-1, 1]) {
    const eyeWhite = ball(0.108, '#fffbed', [1, 1, 0.55], glossy('#fffbed'));
    eyeWhite.position.set(0.29, 0.35, side * 0.285);
    motion.add(eyeWhite);
    const pupil = ball(0.052, '#292d3b', [1, 1, 0.45], dark);
    pupil.position.set(0.335, 0.355, side * 0.342);
    motion.add(pupil);
    const glint = ball(0.016, '#ffffff', [1, 1, 0.4], glossy('#ffffff'));
    glint.position.set(0.35, 0.38, side * 0.364);
    motion.add(glint);
    const nostril = ball(0.025, '#9f5a45', [1.2, 0.35, 0.8], dark);
    nostril.position.set(0.665, 0.154, side * 0.14);
    motion.add(nostril);
    const cheek = ball(0.09, '#f5b86b', [0.8, 0.55, 0.25], glossy('#f5b86b'));
    cheek.position.set(0.35, 0.15, side * 0.36);
    motion.add(cheek);
  }
  for (let index = 0; index < 3; index += 1) {
    const feather = cone(0.055, 0.2, '#f8d867', 10, yellow);
    feather.position.set(-0.04 + index * 0.075, 0.59 + (index === 1 ? 0.035 : 0), 0);
    feather.rotation.z = (index - 1) * 0.35;
    motion.add(feather);
  }
  return finishFront('duck', motion, { jaw });
}

function trainFront(): PartRig {
  const motion = namedGroup('motion');
  const steam = namedGroup('steam');
  const boilerMaterial = clay('#596873', 0.4, 0.42);
  const darkMetal = clay('#343b48', 0.38, 0.5);
  const coral = glossy('#ef835f', 0.3);
  const brass = clay('#edc36c', 0.32, 0.55);

  motion.add(at(xCylinder(0.39, 0.78, '#596873', boilerMaterial), [0.08, 0, 0]));
  for (const x of [-0.2, 0.25]) {
    motion.add(at(torus(0.39, 0.035, '#edc36c', brass), [x, 0, 0], [0, Math.PI / 2, 0]));
  }
  motion.add(at(xCylinder(0.325, 0.12, '#343b48', darkMetal), [0.49, 0, 0]));
  motion.add(at(torus(0.31, 0.04, '#ef835f', coral), [0.56, 0, 0], [0, Math.PI / 2, 0]));
  motion.add(at(xCylinder(0.24, 0.035, '#596873', boilerMaterial), [0.565, 0, 0]));
  for (let index = 0; index < 6; index += 1) {
    const angle = index * TAU / 6;
    const bolt = ball(0.026, '#edc36c', [0.5, 1, 1], brass);
    bolt.position.set(0.595, Math.cos(angle) * 0.245, Math.sin(angle) * 0.245);
    motion.add(bolt);
  }

  motion.add(at(cylinder(0.13, 0.55, '#343b48', 18, darkMetal), [-0.07, 0.59, 0]));
  motion.add(at(cone(0.19, 0.2, '#343b48', 18, darkMetal), [-0.07, 0.83, 0]));
  motion.add(at(cylinder(0.2, 0.11, '#ef835f', 18, coral), [-0.07, 0.94, 0]));
  motion.add(at(cylinder(0.065, 0.35, '#edc36c', 14, brass), [-0.29, 0.49, 0.18]));
  motion.add(at(cylinder(0.095, 0.07, '#edc36c', 14, brass), [-0.29, 0.68, 0.18]));

  for (const side of [-1, 1]) {
    motion.add(tube([
      new THREE.Vector3(-0.26, -0.13, side * 0.34),
      new THREE.Vector3(-0.05, -0.24, side * 0.4),
      new THREE.Vector3(0.31, -0.22, side * 0.39),
      new THREE.Vector3(0.43, -0.08, side * 0.34),
    ], 0.035, '#edc36c', brass));
  }

  motion.add(at(xCylinder(0.115, 0.13, '#edc36c', brass), [0.64, 0.12, 0]));
  const lamp = ball(0.105, '#fff2a8', [0.45, 1, 1], glowing('#fff2a8', 1.1));
  lamp.position.set(0.72, 0.12, 0);
  motion.add(lamp);
  motion.add(at(rounded([0.34, 0.11, 0.94], '#ef835f', 0.04, coral), [0.38, -0.37, 0]));
  for (let index = 0; index < 7; index += 1) {
    const slat = rounded([0.34, 0.055, 0.055], '#343b48', 0.015, darkMetal);
    slat.position.set(0.48, -0.46, (index - 3) * 0.13);
    slat.rotation.z = -0.45;
    motion.add(slat);
  }

  steam.position.set(-0.07, 1.03, 0);
  const steamMaterial = translucent('#f4f4e9', 0.55);
  const puffs: ReadonlyArray<VectorTuple> = [[0, 0, 0], [0.04, 0.2, 0.03], [-0.04, 0.43, -0.02], [0.08, 0.68, 0.02]];
  puffs.forEach((position, index) => {
    const puff = ball(0.11 + index * 0.035, '#f4f4e9', [1, 0.85, 1], steamMaterial);
    puff.position.set(...position);
    steam.add(puff);
  });
  motion.add(noShadow(steam));
  return finishFront('train', motion, { steam });
}

function scoopFront(): PartRig {
  const motion = namedGroup('motion');
  const scoop = namedGroup('scoop');
  const orange = clay('#e9a55e', 0.44, 0.25);
  const edge = clay('#f4c777', 0.34, 0.45);
  const darkMetal = clay('#6c6265', 0.44, 0.45);

  scoop.add(at(rounded([0.84, 0.12, 1.12], '#e9a55e', 0.05, orange), [0.35, -0.36, 0]));
  scoop.add(at(rounded([0.16, 0.53, 1.12], '#e9a55e', 0.055, orange), [-0.04, -0.14, 0]));
  for (const side of [-1, 1]) {
    scoop.add(at(rounded([0.77, 0.38, 0.1], '#e9a55e', 0.04, orange), [0.32, -0.18, side * 0.52]));
    scoop.add(at(rounded([0.75, 0.055, 0.055], '#f4c777', 0.018, edge), [0.36, 0.025, side * 0.53]));
    const arm = tube([
      new THREE.Vector3(-0.42, 0.24, side * 0.34),
      new THREE.Vector3(-0.15, 0.16, side * 0.43),
      new THREE.Vector3(0.02, -0.05, side * 0.5),
    ], 0.065, '#6c6265', darkMetal);
    motion.add(arm);
    const pin = cylinder(0.105, 0.07, '#f4c777', 16, edge);
    pin.position.set(-0.02, -0.08, side * 0.54);
    pin.rotation.x = Math.PI / 2;
    motion.add(pin);
  }
  scoop.add(at(rounded([0.12, 0.13, 1.17], '#f4c777', 0.035, edge), [0.76, -0.345, 0]));
  for (let index = 0; index < 5; index += 1) {
    const tooth = cone(0.09, 0.3, '#f4c777', 8, edge);
    tooth.position.set(0.94, -0.36, (index - 2) * 0.235);
    tooth.rotation.z = -Math.PI / 2;
    scoop.add(tooth);
  }
  for (const z of [-0.35, 0, 0.35]) {
    const rivet = ball(0.035, '#f4c777', [0.5, 1, 1], edge);
    rivet.position.set(0.055, -0.1, z);
    scoop.add(rivet);
  }
  motion.add(scoop);

  const nose = ball(0.2, '#80604e', [1.05, 0.9, 1], glossy('#80604e'));
  nose.position.set(0.03, 0.22, 0);
  motion.add(nose);
  const noseTip = ball(0.075, '#4c3c3e', [0.75, 0.8, 1], glossy('#4c3c3e'));
  noseTip.position.set(0.205, 0.22, 0);
  motion.add(noseTip);
  for (const side of [-1, 1]) {
    const eye = ball(0.036, '#292d3b', [0.6, 1, 1], glossy('#292d3b'));
    eye.position.set(0.13, 0.34, side * 0.12);
    motion.add(eye);
    const ear = ball(0.09, '#a77b62', [0.7, 1, 0.55], clay('#a77b62'));
    ear.position.set(-0.08, 0.34, side * 0.15);
    motion.add(ear);
  }
  return finishFront('scoop', motion, { scoop });
}

function sharkFront(): PartRig {
  const motion = namedGroup('motion');
  const jaw = namedGroup('jaw');
  const blue = glossy('#638da5', 0.38);
  const pale = glossy('#d7e6df', 0.42);
  const mouth = clay('#733e52', 0.62);
  const teeth = glossy('#fff8df', 0.25);

  motion.add(at(ball(0.5, '#638da5', [1.2, 0.85, 1], blue), [0.02, 0.12, 0]));
  motion.add(at(ball(0.39, '#638da5', [1.12, 0.58, 1.08], blue), [0.37, 0.055, 0]));
  motion.add(at(rounded([0.18, 0.32, 0.82], '#733e52', 0.065, mouth), [0.59, -0.14, 0]));
  motion.add(at(rounded([0.48, 0.12, 0.84], '#638da5', 0.05, blue), [0.4, -0.055, 0]));

  for (let index = 0; index < 5; index += 1) {
    const tooth = cone(0.052, 0.16, '#fff8df', 8, teeth);
    tooth.position.set(0.7, -0.14, (index - 2) * 0.16);
    tooth.rotation.z = Math.PI;
    motion.add(tooth);
  }
  for (const side of [-1, 1]) {
    for (const x of [0.28, 0.45, 0.6]) {
      const tooth = cone(0.045, 0.14, '#fff8df', 8, teeth);
      tooth.position.set(x, -0.14, side * 0.39);
      tooth.rotation.z = Math.PI;
      motion.add(tooth);
    }
  }

  jaw.position.set(0.1, -0.18, 0);
  jaw.add(at(rounded([0.61, 0.16, 0.87], '#d7e6df', 0.065, pale), [0.29, -0.13, 0]));
  jaw.add(at(rounded([0.46, 0.035, 0.67], '#a65465', 0.014, mouth), [0.36, -0.035, 0]));
  for (let index = 0; index < 5; index += 1) {
    const tooth = cone(0.05, 0.15, '#fff8df', 8, teeth);
    tooth.position.set(0.6, 0.02, (index - 2) * 0.16);
    jaw.add(tooth);
  }
  motion.add(jaw);

  for (const side of [-1, 1]) {
    const eyeWhite = ball(0.105, '#fff9e9', [1, 1, 0.55], glossy('#fff9e9'));
    eyeWhite.position.set(0.26, 0.32, side * 0.34);
    motion.add(eyeWhite);
    const pupil = ball(0.052, '#203348', [1, 1, 0.45], glossy('#203348'));
    pupil.position.set(0.3, 0.325, side * 0.397);
    motion.add(pupil);
    const brow = rounded([0.2, 0.035, 0.035], '#38566d', 0.012);
    brow.position.set(0.23, 0.415, side * 0.375);
    brow.rotation.z = side * 0.25;
    motion.add(brow);
    for (let index = 0; index < 3; index += 1) {
      const gill = rounded([0.035, 0.18, 0.025], '#38566d', 0.009);
      gill.position.set(-0.18 + index * 0.1, 0.04, side * 0.46);
      gill.rotation.z = -0.25;
      motion.add(gill);
    }
    const fin = cone(0.17, 0.42, '#638da5', 3, blue);
    fin.position.set(-0.05, -0.04, side * 0.48);
    fin.rotation.x = side * Math.PI / 2;
    fin.scale.x = 0.6;
    motion.add(fin);
  }
  const dorsal = cone(0.2, 0.43, '#638da5', 3, blue);
  dorsal.position.set(-0.14, 0.54, 0);
  dorsal.rotation.z = -0.25;
  dorsal.scale.z = 0.35;
  motion.add(dorsal);
  return finishFront('shark', motion, { jaw });
}

function vacuumFront(): PartRig {
  const motion = namedGroup('motion');
  const hose = namedGroup('hose');
  const mint = glossy('#79c9b8', 0.34);
  const coral = glossy('#ef8b7d', 0.32);
  const dark = clay('#494254', 0.5, 0.25);
  const hoseMaterial = clay('#756787', 0.5, 0.18);

  motion.add(at(rounded([0.65, 0.64, 0.86], '#79c9b8', 0.16, mint), [-0.06, 0.02, 0]));
  motion.add(at(rounded([0.16, 0.48, 0.7], '#ef8b7d', 0.065, coral), [0.28, 0.04, 0]));
  const chamberMaterial = translucent('#d8f2ec', 0.52);
  motion.add(at(xCylinder(0.225, 0.22, '#d8f2ec', chamberMaterial), [0.36, 0.08, 0]));
  const lintColors = ['#f5cf77', '#b39bdb', '#f5a2aa'] as const;
  const lintPositions: ReadonlyArray<VectorTuple> = [[0.43, 0.03, -0.09], [0.44, 0.14, 0.07], [0.42, -0.02, 0.1]];
  lintPositions.forEach((position, index) => {
    const lint = ball(0.05, lintColors[index] ?? '#f5cf77', [0.7, 1, 1]);
    lint.position.set(...position);
    motion.add(lint);
  });

  motion.add(at(rounded([0.36, 0.23, 1.14], '#494254', 0.075, dark), [0.58, -0.29, 0]));
  motion.add(at(rounded([0.12, 0.1, 1.17], '#ef8b7d', 0.035, coral), [0.75, -0.37, 0]));
  const brush = cylinder(0.052, 1.0, '#edc36c', 16, glossy('#edc36c'));
  brush.position.set(0.77, -0.405, 0);
  brush.rotation.x = Math.PI / 2;
  motion.add(brush);
  for (let index = 0; index < 11; index += 1) {
    const bristle = rounded([0.13, 0.12, 0.035], '#f6d89a', 0.012);
    bristle.position.set(0.78, -0.45, (index - 5) * 0.095);
    bristle.rotation.z = -0.25;
    motion.add(bristle);
  }

  const hoseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.28, 0.12, 0.38),
    new THREE.Vector3(-0.5, 0.48, 0.4),
    new THREE.Vector3(-0.25, 0.82, 0.42),
    new THREE.Vector3(0.18, 0.76, 0.4),
    new THREE.Vector3(0.4, 0.42, 0.36),
  ]);
  hose.add(makeMesh(new THREE.TubeGeometry(hoseCurve, 48, 0.09, 12, false), hoseMaterial));
  const torusNormal = new THREE.Vector3(0, 0, 1);
  for (let index = 1; index <= 13; index += 1) {
    const progress = index / 14;
    const rib = torus(0.092, 0.018, '#9a89ab', glossy('#9a89ab'));
    rib.position.copy(hoseCurve.getPoint(progress));
    rib.quaternion.setFromUnitVectors(torusNormal, hoseCurve.getTangent(progress).normalize());
    hose.add(rib);
  }
  for (const point of [hoseCurve.getPoint(0), hoseCurve.getPoint(1)]) {
    const coupling = ball(0.125, '#ef8b7d', [1, 1, 1], coral);
    coupling.position.copy(point);
    hose.add(coupling);
  }
  motion.add(hose);

  const button = cylinder(0.08, 0.055, '#ffe488', 16, glowing('#ffe488', 0.6));
  button.position.set(-0.1, 0.37, 0);
  motion.add(button);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const vent = rounded([0.26, 0.035, 0.025], '#494254', 0.009, dark);
      vent.position.set(-0.1, 0.13 - index * 0.09, side * 0.435);
      motion.add(vent);
    }
  }
  return finishFront('vacuum', motion, { hose });
}

function iceCreamFront(): PartRig {
  const motion = namedGroup('motion');
  const scoop = namedGroup('scoop');
  const waffle = clay('#dca15f', 0.76);
  const waffleLine = clay('#ad7448', 0.78);
  const scoopMaterials = [glossy('#f3a5b6', 0.42), glossy('#9bd8bd', 0.42), glossy('#fff0c9', 0.4)] as const;

  const coneBody = cone(0.4, 0.78, '#dca15f', 24, waffle);
  coneBody.position.set(0.02, -0.2, 0);
  coneBody.rotation.z = Math.PI;
  motion.add(coneBody);
  for (const [y, radius] of [[0.08, 0.345], [-0.1, 0.25], [-0.28, 0.16]] as const) {
    motion.add(at(torus(radius, 0.014, '#ad7448', waffleLine), [0.02, y, 0], [Math.PI / 2, 0, 0]));
  }
  for (let index = 0; index < 6; index += 1) {
    const points: THREE.Vector3[] = [];
    const direction = index < 3 ? 1 : -1;
    for (let step = 0; step <= 10; step += 1) {
      const progress = step / 10;
      const radius = 0.045 + progress * 0.34;
      const angle = (index % 3) * TAU / 3 + direction * progress * 1.25;
      points.push(new THREE.Vector3(
        0.02 + Math.cos(angle) * radius,
        -0.55 + progress * 0.7,
        Math.sin(angle) * radius,
      ));
    }
    motion.add(tube(points, 0.009, '#ad7448', waffleLine));
  }

  const scoopData = [
    { center: new THREE.Vector3(0, 0.25, -0.21), color: '#f3a5b6', material: scoopMaterials[0] },
    { center: new THREE.Vector3(0, 0.25, 0.21), color: '#9bd8bd', material: scoopMaterials[1] },
    { center: new THREE.Vector3(0.06, 0.57, 0), color: '#fff0c9', material: scoopMaterials[2] },
  ];
  scoopData.forEach(({ center, color, material }, scoopIndex) => {
    const body = ball(0.325, color, [1.04, 1, 1], material);
    body.position.copy(center);
    scoop.add(body);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * TAU / 8;
      const lump = ball(0.075, color, [1, 0.8, 1], material);
      lump.position.set(
        center.x + Math.cos(angle) * 0.245,
        center.y - 0.19 + Math.sin(index * 1.7) * 0.018,
        center.z + Math.sin(angle) * 0.245,
      );
      scoop.add(lump);
    }
    if (scoopIndex < 2) {
      const drip = ball(0.06, color, [0.65, 1.6, 0.75], material);
      drip.position.set(center.x + 0.27, center.y - 0.25, center.z * 0.6);
      scoop.add(drip);
    }
  });

  const sprinkleColors = ['#ef7f84', '#75c9ba', '#d5a45e', '#a58bd4'] as const;
  for (let index = 0; index < 12; index += 1) {
    const theta = index * TAU / 12;
    const phi = 0.42 + (index % 3) * 0.25;
    const sprinkle = rounded([0.026, 0.082, 0.02], sprinkleColors[index % sprinkleColors.length] ?? '#ef7f84', 0.007);
    sprinkle.position.set(
      0.06 + Math.cos(theta) * Math.sin(phi) * 0.326,
      0.57 + Math.cos(phi) * 0.326,
      Math.sin(theta) * Math.sin(phi) * 0.326,
    );
    sprinkle.rotation.set(theta * 0.4, theta, theta + 0.35);
    scoop.add(sprinkle);
  }
  const cherry = ball(0.12, '#e96767', [1, 0.95, 1], glossy('#e96767', 0.2));
  cherry.position.set(0.06, 0.94, 0);
  scoop.add(cherry);
  scoop.add(tube([
    new THREE.Vector3(0.06, 1.03, 0),
    new THREE.Vector3(0.07, 1.12, 0),
    new THREE.Vector3(0.15, 1.17, 0.01),
  ], 0.018, '#658251', clay('#658251')));
  motion.add(scoop);
  return finishFront('ice-cream', motion, { scoop });
}

function pianoFront(): PartRig {
  const motion = namedGroup('motion');
  const keys = namedGroup('keys');
  const lacquer = glossy('#493b63', 0.24);
  const velvet = glossy('#b86678', 0.38);
  const ivory = glossy('#fff8df', 0.3);
  const ebony = glossy('#302b3d', 0.22);
  const gold = clay('#e9c36e', 0.3, 0.55);

  motion.add(at(rounded([0.5, 0.68, 1.16], '#493b63', 0.12, lacquer), [0.01, 0.04, 0]));
  motion.add(at(rounded([0.69, 0.1, 1.22], '#493b63', 0.04, lacquer), [0.08, 0.43, 0]));
  motion.add(at(rounded([0.09, 0.075, 1.12], '#e9c36e', 0.025, gold), [0.29, 0.32, 0]));
  motion.add(at(rounded([0.18, 0.18, 1.08], '#b86678', 0.055, velvet), [0.29, 0.06, 0]));

  for (let index = 0; index < 10; index += 1) {
    const key = rounded([0.49, 0.09, 0.096], '#fff8df', 0.012, ivory);
    key.name = `key-white-${index}`;
    key.position.set(0.46, -0.18, (index - 4.5) * 0.105);
    keys.add(key);
    if (index < 9 && [0, 1, 3, 4, 5, 7, 8].includes(index)) {
      const blackKey = rounded([0.29, 0.12, 0.058], '#302b3d', 0.012, ebony);
      blackKey.name = `key-black-${index}`;
      blackKey.position.set(0.325, -0.075, (index - 4) * 0.105);
      keys.add(blackKey);
    }
  }
  motion.add(keys);
  motion.add(at(rounded([0.1, 0.12, 1.13], '#493b63', 0.035, lacquer), [0.735, -0.19, 0]));
  for (const side of [-1, 1]) {
    motion.add(at(rounded([0.64, 0.2, 0.09], '#493b63', 0.035, lacquer), [0.37, -0.1, side * 0.555]));
    motion.add(at(ball(0.04, '#e9c36e', [0.5, 1, 1], gold), [0.705, -0.18, side * 0.51]));
  }

  const sheet = namedGroup('sheet-music');
  sheet.position.set(0.285, 0.285, 0);
  sheet.rotation.z = -0.1;
  sheet.add(rounded([0.045, 0.32, 0.67], '#fff7df', 0.014, ivory));
  for (const y of [-0.075, -0.025, 0.025, 0.075]) {
    sheet.add(at(rounded([0.014, 0.009, 0.54], '#a59483', 0.003), [0.03, y, 0]));
  }
  const noteData: ReadonlyArray<VectorTuple> = [[0.045, -0.045, -0.18], [0.045, 0.015, -0.02], [0.045, -0.02, 0.17]];
  noteData.forEach((position) => {
    const note = ball(0.032, '#59495e', [0.25, 0.75, 1], ebony);
    note.position.set(...position);
    sheet.add(note);
    sheet.add(at(cylinder(0.009, 0.105, '#59495e', 8, ebony), [position[0], position[1] + 0.065, position[2] + 0.027]));
  });
  motion.add(sheet);

  for (const z of [-0.17, 0.17]) {
    motion.add(at(rounded([0.29, 0.06, 0.1], '#e9c36e', 0.025, gold), [0.35, -0.43, z]));
    motion.add(at(ball(0.075, '#493b63', [1, 0.75, 1], lacquer), [-0.03, -0.38, z * 2.5]));
  }
  return finishFront('piano', motion, { keys });
}

const FRONT_FACTORIES = {
  smile: smileFront,
  duck: duckFront,
  train: trainFront,
  scoop: scoopFront,
  shark: sharkFront,
  vacuum: vacuumFront,
  'ice-cream': iceCreamFront,
  piano: pianoFront,
} satisfies Record<string, () => PartRig>;

export const FRONT_MODELS: Record<MonsterCarBuild['front'], () => PartRig> = FRONT_FACTORIES;

export function createFrontModel(id: MonsterCarBuild['front']): PartRig {
  return FRONT_MODELS[id]();
}
