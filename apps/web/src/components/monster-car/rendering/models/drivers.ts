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
  rounded,
  torus,
  translucent,
  tube,
} from './primitives';
import { makeRig, type PartRig } from './types';

type VectorTuple = readonly [number, number, number];

const DARK = '#2f3040';
const CREAM = '#fff7e8';
const WHEEL = '#484453';

function group(name: string, position: VectorTuple = [0, 0, 0]) {
  const result = new THREE.Group();
  result.name = name;
  result.position.set(...position);
  return result;
}

function makeBody(
  color: THREE.ColorRepresentation,
  scale: VectorTuple = [1, 1.1, 0.9],
  material?: THREE.Material,
) {
  const body = ball(0.32, color, scale, material);
  body.name = 'body';
  body.position.y = 0.13;
  return body;
}

function makeHead(
  color: THREE.ColorRepresentation,
  radius = 0.35,
  scale: VectorTuple = [1, 1, 1],
  material?: THREE.Material,
) {
  const head = group('head', [0, 0.55, 0]);
  const shape = ball(radius, color, scale, material);
  shape.name = 'headShape';
  head.add(shape);
  return head;
}

interface EyeOptions {
  x?: number;
  y?: number;
  spread?: number;
  radius?: number;
  scale?: VectorTuple;
  color?: THREE.ColorRepresentation;
  pupilColor?: THREE.ColorRepresentation;
  pupil?: boolean;
}

function makeEyes(options: EyeOptions = {}) {
  const {
    x = 0.29,
    y = 0.06,
    spread = 0.16,
    radius = 0.052,
    color = '#fffaf0',
    pupilColor = DARK,
    pupil = true,
  } = options;
  const scale = options.scale ?? ([0.58, 1, 1] as const);
  const eyes = group('eyes');
  const whiteMaterial = glossy(color);
  const pupilMaterial = glossy(pupilColor);
  const glintMaterial = glowing('#ffffff', 0.25);

  for (const side of [-1, 1]) {
    const z = side * spread;
    const eye = ball(radius, color, scale, whiteMaterial);
    eye.name = side > 0 ? 'leftEye' : 'rightEye';
    eye.position.set(x, y, z);
    eyes.add(eye);

    const front = x + radius * scale[0];
    if (pupil) {
      const pupilMesh = ball(radius * 0.55, pupilColor, [0.32, 1, 1], pupilMaterial);
      pupilMesh.name = side > 0 ? 'leftPupil' : 'rightPupil';
      pupilMesh.position.set(front + radius * 0.04, y - radius * 0.03, z);
      eyes.add(pupilMesh);
    }

    const glint = ball(radius * 0.18, '#ffffff', [0.45, 1, 1], glintMaterial);
    glint.name = side > 0 ? 'leftEyeGlint' : 'rightEyeGlint';
    glint.position.set(
      front + radius * (pupil ? 0.23 : 0.1),
      y + radius * 0.25,
      z + radius * 0.18,
    );
    eyes.add(glint);
  }
  return eyes;
}

function makeArm(side: number, color: THREE.ColorRepresentation, material?: THREE.Material) {
  const arm = group(side > 0 ? 'leftArm' : 'rightArm', [0, 0.28, side * 0.28]);
  const sleeve = tube([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.17, 0.015, -side * 0.035),
    new THREE.Vector3(0.31, -0.075, -side * 0.085),
  ], 0.06, color, material);
  sleeve.name = 'armShape';
  const hand = ball(0.09, color, [1, 0.85, 1], material);
  hand.name = 'hand';
  hand.position.set(0.35, -0.1, -side * 0.1);
  arm.add(sleeve, hand);
  return arm;
}

function makeSteeringWheel() {
  const wheel = group('steeringWheel', [0.39, 0.18, 0]);
  const material = clay(WHEEL, 0.42, 0.28);
  const rim = torus(0.23, 0.035, WHEEL, material);
  rim.rotation.y = Math.PI / 2;
  const verticalSpoke = cylinder(0.018, 0.34, WHEEL, 10, material);
  const horizontalSpoke = cylinder(0.018, 0.34, WHEEL, 10, material);
  horizontalSpoke.rotation.x = Math.PI / 2;
  const hub = ball(0.055, WHEEL, [0.65, 1, 1], material);
  hub.position.x = 0.015;
  wheel.add(rim, verticalSpoke, horizontalSpoke, hub);
  return wheel;
}

function segment(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  color: THREE.ColorRepresentation,
  material?: THREE.Material,
) {
  const direction = end.clone().sub(start);
  const result = cylinder(radius, direction.length(), color, 12, material);
  result.position.copy(start).add(end).multiplyScalar(0.5);
  result.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return result;
}

function finishDriver(
  id: string,
  motion: THREE.Group,
  nodes: Record<string, THREE.Object3D>,
): PartRig {
  const rig = makeRig('driver', id, { ...nodes, motion });
  rig.root.add(motion);

  // Animation can always restore the authored pose instead of accumulating scale drift.
  rig.root.traverse((object) => {
    object.userData.basePosition = object.position.clone();
    object.userData.baseRotation = object.rotation.clone();
    object.userData.baseScale = object.scale.clone();
  });
  return rig;
}

function createBear(): PartRig {
  const motion = group('motion');
  const skin = '#b98967';
  const body = makeBody('#f4eee0');
  const belly = ball(0.23, '#e7c39c', [0.2, 0.9, 0.82]);
  belly.name = 'belly';
  belly.position.set(0.275, 0.11, 0);

  const head = makeHead(skin);
  for (const side of [-1, 1]) {
    const ear = ball(0.14, skin);
    ear.name = side > 0 ? 'leftEar' : 'rightEar';
    ear.position.set(0, 0.27, side * 0.26);
    const inner = ball(0.075, '#e7c39c', [0.4, 1, 1]);
    inner.position.set(0.125, 0.28, side * 0.26);
    head.add(ear, inner);
  }
  const eyes = makeEyes({ x: 0.292, y: 0.06, spread: 0.16, radius: 0.046, color: DARK, pupil: false });
  const muzzle = ball(0.15, '#e7c39c', [0.7, 0.7, 1]);
  muzzle.name = 'muzzle';
  muzzle.position.set(0.29, -0.07, 0);
  const nose = ball(0.055, DARK, [0.65, 0.7, 1], glossy(DARK));
  nose.position.set(0.397, -0.035, 0);
  const smile = tube([
    new THREE.Vector3(0.405, -0.08, -0.055),
    new THREE.Vector3(0.423, -0.11, 0),
    new THREE.Vector3(0.405, -0.08, 0.055),
  ], 0.008, '#6c4545');
  head.add(eyes, muzzle, nose, smile);

  const leftArm = makeArm(1, skin);
  const rightArm = makeArm(-1, skin);
  motion.add(body, belly, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('bear', motion, { head, eyes, leftArm, rightArm });
}

function createFrog(): PartRig {
  const motion = group('motion');
  const skin = '#7fc36b';
  const body = makeBody('#f4eee0');
  const belly = ball(0.23, '#d8e8a5', [0.2, 0.9, 0.82]);
  belly.position.set(0.275, 0.11, 0);

  const head = makeHead(skin, 0.35, [1.08, 0.92, 1.05]);
  const eyes = makeEyes({
    x: 0.174,
    y: 0.285,
    spread: 0.22,
    radius: 0.078,
    scale: [0.7, 1, 1],
  });
  for (const side of [-1, 1]) {
    const bump = ball(0.13, skin);
    bump.name = side > 0 ? 'leftEyeBump' : 'rightEyeBump';
    bump.position.set(0.06, 0.27, side * 0.22);
    eyes.add(bump);

    const cheek = ball(0.055, '#e9a58e', [0.35, 0.7, 1]);
    cheek.position.set(0.315, -0.09, side * 0.22);
    head.add(cheek);
  }
  const smile = tube([
    new THREE.Vector3(0.345, -0.075, -0.17),
    new THREE.Vector3(0.375, -0.125, 0),
    new THREE.Vector3(0.345, -0.075, 0.17),
  ], 0.012, '#426845');
  head.add(eyes, smile);

  const leftArm = makeArm(1, skin);
  const rightArm = makeArm(-1, skin);
  motion.add(body, belly, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('frog', motion, { head, eyes, leftArm, rightArm });
}

function createDuck(): PartRig {
  const motion = group('motion');
  const skin = '#f6d66c';
  const body = makeBody('#f4eee0');
  const bib = ball(0.22, '#fff3bd', [0.2, 0.85, 0.8]);
  bib.position.set(0.275, 0.12, 0);

  const head = makeHead(skin);
  const eyes = makeEyes({ x: 0.292, y: 0.075, spread: 0.155, radius: 0.048, color: DARK, pupil: false });
  const bill = rounded([0.28, 0.12, 0.34], '#ef9d56', 0.05);
  bill.name = 'bill';
  bill.position.set(0.37, -0.05, 0);
  const lowerBill = rounded([0.24, 0.055, 0.3], '#dc8148', 0.025);
  lowerBill.position.set(0.365, -0.12, 0);
  head.add(eyes, bill, lowerBill);

  for (const [x, y] of [[-0.08, 0.32], [0, 0.37], [0.08, 0.32]] as const) {
    const feather = ball(0.07, '#e9bd51', [0.7, 1.2, 0.8]);
    feather.position.set(x, y, 0);
    head.add(feather);
  }

  const leftArm = makeArm(1, skin);
  const rightArm = makeArm(-1, skin);
  motion.add(body, bib, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('duck', motion, { head, eyes, leftArm, rightArm });
}

function createAlien(): PartRig {
  const motion = group('motion');
  const skin = '#a6d6bd';
  const body = makeBody('#8d81ca');
  const collar = torus(0.24, 0.035, '#c5b9ef', glowing('#8d81ca', 0.25));
  collar.position.y = 0.34;
  collar.rotation.x = Math.PI / 2;

  const head = makeHead(skin, 0.4, [0.9, 1.12, 0.9]);
  const eyes = makeEyes({
    x: 0.302,
    y: 0.07,
    spread: 0.16,
    radius: 0.078,
    scale: [0.55, 1.55, 1],
    color: DARK,
    pupil: false,
  });
  head.add(eyes);

  const antenna = group('antenna');
  const stalkMaterial = clay('#7769a4');
  const tipMaterial = glowing('#f1c5ed', 0.85);
  for (const side of [-1, 1]) {
    const stalk = cylinder(0.025, 0.3, '#7769a4', 12, stalkMaterial);
    stalk.position.set(-0.02, 0.43, side * 0.15);
    const tip = ball(0.07, '#f1c5ed', [1, 1, 1], tipMaterial);
    tip.position.set(-0.02, 0.61, side * 0.15);
    antenna.add(stalk, tip);
  }
  head.add(antenna);

  for (const [index, z] of [-0.09, 0, 0.09].entries()) {
    const button = ball(0.025, index === 1 ? '#f1c5ed' : '#b9f2df', [0.5, 1, 1], glowing(index === 1 ? '#f1c5ed' : '#b9f2df'));
    button.position.set(0.285, 0.15, z);
    motion.add(button);
  }

  const leftArm = makeArm(1, skin);
  const rightArm = makeArm(-1, skin);
  motion.add(body, collar, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('alien', motion, { head, eyes, leftArm, rightArm, antenna });
}

function makeRobotArm(side: number) {
  const arm = group(side > 0 ? 'leftArm' : 'rightArm', [0, 0.28, side * 0.3]);
  const metal = clay('#8ea8b5', 0.38, 0.55);
  const jointMaterial = glossy('#f2a65e');
  const shoulder = ball(0.09, '#8ea8b5', [1, 1, 1], jointMaterial);
  const elbowPosition = new THREE.Vector3(0.14, -0.035, -side * 0.035);
  const elbow = ball(0.07, '#f2a65e', [1, 1, 1], jointMaterial);
  elbow.name = side > 0 ? 'leftJoint' : 'rightJoint';
  elbow.position.copy(elbowPosition);
  const upper = segment(new THREE.Vector3(), elbowPosition, 0.045, '#8ea8b5', metal);
  const handPosition = new THREE.Vector3(0.32, -0.1, -side * 0.1);
  const lower = segment(elbowPosition, handPosition, 0.04, '#8ea8b5', metal);
  arm.add(shoulder, upper, elbow, lower);

  for (const clawSide of [-1, 1]) {
    const claw = rounded([0.09, 0.035, 0.035], '#d5e2e5', 0.015, metal);
    claw.position.copy(handPosition).add(new THREE.Vector3(0.025, clawSide * 0.035, 0));
    arm.add(claw);
  }
  return { arm, joint: elbow };
}

function createRobot(): PartRig {
  const motion = group('motion');
  const metal = clay('#a9c0c8', 0.35, 0.5);
  const body = rounded([0.48, 0.46, 0.46], '#8ea8b5', 0.11, metal);
  body.name = 'body';
  body.position.y = 0.13;

  const chestScreen = rounded([0.035, 0.19, 0.27], '#344653', 0.012, glossy('#344653'));
  chestScreen.position.set(0.25, 0.16, 0);
  for (const [index, z] of [-0.07, 0, 0.07].entries()) {
    const color = index === 1 ? '#ffd271' : '#79e2d0';
    const button = ball(0.026, color, [0.45, 1, 1], glowing(color));
    button.position.set(0.28, 0.17, z);
    motion.add(button);
  }

  const head = group('head', [0, 0.55, 0]);
  const headShape = rounded([0.58, 0.48, 0.56], '#a9c0c8', 0.12, metal);
  headShape.name = 'headShape';
  const screen = rounded([0.045, 0.29, 0.43], '#263844', 0.015, glossy('#263844'));
  screen.name = 'screen';
  screen.position.set(0.303, 0.015, 0);
  const eyes = group('eyes');
  const eyeMaterial = glowing('#79e2d0', 1.1);
  for (const side of [-1, 1]) {
    const eye = rounded([0.028, 0.065, 0.095], '#79e2d0', 0.01, eyeMaterial);
    eye.name = side > 0 ? 'leftEye' : 'rightEye';
    eye.position.set(0.337, 0.065, side * 0.11);
    const glint = ball(0.012, '#ffffff', [0.4, 1, 1], glowing('#ffffff'));
    glint.position.set(0.355, 0.08, side * 0.11 + 0.018);
    eyes.add(eye, glint);
  }
  const smile = tube([
    new THREE.Vector3(0.34, -0.06, -0.07),
    new THREE.Vector3(0.345, -0.09, 0),
    new THREE.Vector3(0.34, -0.06, 0.07),
  ], 0.009, '#79e2d0', glowing('#79e2d0'));
  head.add(headShape, screen, eyes, smile);

  for (const side of [-1, 1]) {
    const ear = cylinder(0.09, 0.07, '#ef8c72', 16, glossy('#ef8c72'));
    ear.position.set(0, 0, side * 0.315);
    ear.rotation.x = Math.PI / 2;
    head.add(ear);
  }

  const antenna = group('antenna');
  const antennaBase = ball(0.08, '#718995', [1, 0.45, 1], metal);
  antennaBase.position.y = 0.25;
  const stalk = cylinder(0.025, 0.22, '#718995', 12, metal);
  stalk.position.y = 0.36;
  const tip = ball(0.07, '#ff8b78', [1, 1, 1], glowing('#ff8b78', 0.9));
  tip.position.y = 0.49;
  antenna.add(antennaBase, stalk, tip);
  head.add(antenna);

  const left = makeRobotArm(1);
  const right = makeRobotArm(-1);
  motion.add(body, chestScreen, head, left.arm, right.arm, makeSteeringWheel());
  return finishDriver('robot', motion, {
    head,
    eyes,
    leftArm: left.arm,
    rightArm: right.arm,
    leftJoint: left.joint,
    rightJoint: right.joint,
    antenna,
    screen,
  });
}

function createPenguin(): PartRig {
  const motion = group('motion');
  const feathers = '#34465c';
  const body = makeBody(feathers, [1, 1.15, 0.92]);
  const belly = ball(0.255, '#f7f3e8', [0.2, 1.05, 0.84]);
  belly.name = 'whiteBelly';
  belly.position.set(0.275, 0.1, 0);

  const head = makeHead(feathers);
  for (const side of [-1, 1]) {
    const patch = ball(0.14, '#f7f3e8', [0.35, 1.05, 0.9]);
    patch.position.set(0.285, 0.015, side * 0.105);
    head.add(patch);
  }
  const eyes = makeEyes({
    x: 0.327,
    y: 0.07,
    spread: 0.11,
    radius: 0.04,
    scale: [0.55, 1, 1],
    color: DARK,
    pupil: false,
  });
  const beak = cone(0.115, 0.25, '#f2a65e', 16, glossy('#f2a65e'));
  beak.name = 'beak';
  beak.position.set(0.42, -0.065, 0);
  beak.rotation.z = -Math.PI / 2;
  head.add(eyes, beak);

  const leftArm = group('leftArm', [0, 0.28, 0.28]);
  const rightArm = group('rightArm', [0, 0.28, -0.28]);
  for (const [arm, side] of [[leftArm, 1], [rightArm, -1]] as const) {
    const flipper = ball(0.13, feathers, [0.65, 1.55, 0.5]);
    flipper.name = side > 0 ? 'leftFlipper' : 'rightFlipper';
    flipper.position.set(0.02, -0.12, side * 0.055);
    flipper.rotation.x = side * 0.35;
    arm.add(flipper);
  }

  for (const side of [-1, 1]) {
    const foot = ball(0.12, '#ef9d56', [1.4, 0.35, 1]);
    foot.name = side > 0 ? 'leftFoot' : 'rightFoot';
    foot.position.set(0.12, -0.245, side * 0.15);
    motion.add(foot);
  }

  motion.add(body, belly, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('penguin', motion, { head, eyes, leftArm, rightArm });
}

function ghostSheet(material: THREE.Material) {
  const geometry = new THREE.CylinderGeometry(0.27, 0.39, 0.54, 32, 5, true);
  const positions = geometry.attributes.position!;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const angle = Math.atan2(z, x);
    const hemWeight = THREE.MathUtils.clamp((0.27 - y) / 0.54, 0, 1);
    const radialWave = 1 + Math.sin(angle * 3 + 0.4) * 0.035 * hemWeight;
    positions.setXYZ(
      index,
      x * radialWave,
      y + Math.sin(angle * 5 + 0.6) * 0.055 * hemWeight * hemWeight,
      z * radialWave,
    );
  }
  geometry.computeVertexNormals();
  const sheet = makeMesh(geometry, material, [0, 0.13, 0]);
  sheet.name = 'body';
  return sheet;
}

function createGhost(): PartRig {
  const motion = group('motion');
  const sheetMaterial = translucent('#d9f2ed', 0.86);
  sheetMaterial.side = THREE.DoubleSide;
  const body = ghostSheet(sheetMaterial);
  const head = makeHead('#d9f2ed', 0.35, [1, 1.08, 1], sheetMaterial);
  const eyes = makeEyes({
    x: 0.296,
    y: 0.035,
    spread: 0.13,
    radius: 0.065,
    scale: [0.5, 1.35, 0.85],
    color: DARK,
    pupil: false,
  });
  const mouth = ball(0.055, DARK, [0.45, 1.3, 0.8]);
  mouth.name = 'mouth';
  mouth.position.set(0.327, -0.12, 0);
  head.add(eyes, mouth);

  const hem = group('flowingHem');
  for (let index = 0; index < 10; index += 1) {
    const angle = index * Math.PI * 2 / 10;
    const scallop = ball(0.085, '#d9f2ed', [1, 0.65, 1], sheetMaterial);
    scallop.position.set(
      Math.cos(angle) * 0.3,
      -0.15 + Math.sin(angle * 5 + 0.6) * 0.04,
      Math.sin(angle) * 0.3,
    );
    hem.add(scallop);
  }

  const leftArm = makeArm(1, '#d9f2ed', sheetMaterial);
  const rightArm = makeArm(-1, '#d9f2ed', sheetMaterial);
  motion.add(body, hem, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('ghost', motion, { head, eyes, leftArm, rightArm });
}

function createLion(): PartRig {
  const motion = group('motion');
  const fur = '#dca85e';
  const body = makeBody(fur);
  const belly = ball(0.23, '#f5ddb0', [0.2, 0.9, 0.82]);
  belly.position.set(0.275, 0.11, 0);

  const head = group('head', [0, 0.55, 0]);
  const mane = group('mane');
  const outerColors = ['#e98252', '#f3b64f', '#d76b66', '#9b6bb5'] as const;
  for (let index = 0; index < 12; index += 1) {
    const angle = index * Math.PI * 2 / 12;
    const color = outerColors[index % outerColors.length] ?? outerColors[0];
    const tuft = cone(0.13, 0.28, color, 12, glossy(color));
    tuft.position.set(-0.12, Math.cos(angle) * 0.4, Math.sin(angle) * 0.4);
    tuft.rotation.x = angle;
    mane.add(tuft);
  }
  const innerColors = ['#f4b95f', '#ed8c5d', '#e6ca68'] as const;
  for (let index = 0; index < 10; index += 1) {
    const angle = (index + 0.5) * Math.PI * 2 / 10;
    const color = innerColors[index % innerColors.length] ?? innerColors[0];
    const tuft = ball(0.14, color, [0.85, 1.15, 1.15]);
    tuft.position.set(-0.035, Math.cos(angle) * 0.34, Math.sin(angle) * 0.34);
    tuft.rotation.x = angle;
    mane.add(tuft);
  }

  const face = ball(0.32, fur);
  face.name = 'headShape';
  head.add(mane, face);
  for (const side of [-1, 1]) {
    const ear = ball(0.11, fur);
    ear.position.set(0.02, 0.24, side * 0.23);
    const inner = ball(0.06, '#d98570', [0.45, 1, 1]);
    inner.position.set(0.1, 0.245, side * 0.23);
    head.add(ear, inner);
  }
  const eyes = makeEyes({ x: 0.275, y: 0.06, spread: 0.125, radius: 0.044, color: DARK, pupil: false });
  head.add(eyes);
  for (const side of [-1, 1]) {
    const muzzle = ball(0.12, '#f5ddb0', [0.65, 0.75, 1]);
    muzzle.position.set(0.28, -0.075, side * 0.065);
    head.add(muzzle);
  }
  const nose = ball(0.055, '#654654', [0.65, 0.7, 1], glossy('#654654'));
  nose.position.set(0.375, -0.035, 0);
  const smile = tube([
    new THREE.Vector3(0.365, -0.09, -0.05),
    new THREE.Vector3(0.38, -0.12, 0),
    new THREE.Vector3(0.365, -0.09, 0.05),
  ], 0.008, '#80534b');
  head.add(nose, smile);

  const leftArm = makeArm(1, fur);
  const rightArm = makeArm(-1, fur);
  motion.add(body, belly, head, leftArm, rightArm, makeSteeringWheel());
  return finishDriver('lion', motion, { head, eyes, leftArm, rightArm, mane });
}

const DRIVER_FACTORIES = {
  bear: createBear,
  frog: createFrog,
  duck: createDuck,
  alien: createAlien,
  robot: createRobot,
  penguin: createPenguin,
  ghost: createGhost,
  lion: createLion,
} satisfies Record<string, () => PartRig>;

export const DRIVER_MODELS: Record<MonsterCarBuild['driver'], () => PartRig> = DRIVER_FACTORIES;

export function createDriverModel(id: MonsterCarBuild['driver']): PartRig {
  return DRIVER_MODELS[id]();
}
