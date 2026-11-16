import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayGeometryKit } from '../geometry';
import type { ClayDriverRig, ClayPartFactory, ClayPartVisual } from '../types';

interface DriverBase {
  readonly visual: ClayPartVisual;
  readonly rig: ClayDriverRig;
  readonly body: import('three').Group;
  readonly head: import('three').Group;
}

type DriverCustomization = (kit: ClayGeometryKit, base: DriverBase) => void;

function driver(color: string, customize: DriverCustomization): ClayPartFactory {
  return (kit) => {
    const root = kit.group(undefined, [0, 0, 0], 'driver');
    const bounce = kit.group(root);
    const body = kit.group(bounce);
    const head = kit.group(bounce, [0, 0.88, 0.02], 'driver-head');
    const arms = kit.group(bounce, [0, 0, 0], 'driver-arms');

    kit.ellipsoid([0.31, 0.35, 0.27], color, body, [0, 0.35, 0]);
    kit.sphere(0.39, color, head);

    const leftEye = kit.group(head, [-0.14, 0.06, 0.355]);
    const rightEye = kit.group(head, [0.14, 0.06, 0.355]);
    kit.ellipsoid([0.047, 0.062, 0.032], C.ink, leftEye);
    kit.ellipsoid([0.047, 0.062, 0.032], C.ink, rightEye);

    const mouth = kit.group(head, [0, -0.13, 0.382]);
    const smile = kit.torus(0.075, 0.014, C.ink, mouth);
    smile.rotation.z = Math.PI;

    const leftArm = kit.group(arms, [-0.25, 0.5, 0.08]);
    const rightArm = kit.group(arms, [0.25, 0.5, 0.08]);
    kit.rod([0, 0, 0], [0.05, -0.18, 0.42], 0.075, color, leftArm);
    kit.rod([0, 0, 0], [-0.05, -0.18, 0.42], 0.075, color, rightArm);
    kit.sphere(0.09, color, leftArm, [0.05, -0.18, 0.42]);
    kit.sphere(0.09, color, rightArm, [-0.05, -0.18, 0.42]);

    const rig: ClayDriverRig = { leftEye, rightEye, mouth, leftArm, rightArm };
    const visual: ClayPartVisual = {
      root,
      channels: { bounce, head, accessory: arms },
      driver: rig,
    };
    customize(kit, { visual, rig, body, head });
    return visual;
  };
}

function whiskers(kit: ClayGeometryKit, head: import('three').Group): void {
  for (const side of [-1, 1]) {
    for (const offset of [-0.045, 0.045]) {
      kit.rod(
        [side * 0.18, -0.09 + offset, 0.36],
        [side * 0.43, -0.07 + offset * 1.8, 0.4],
        0.009,
        C.ink,
        head,
      );
    }
  }
}

const cat = driver(C.yellow, (kit, { head }) => {
  for (const side of [-1, 1]) {
    const ear = kit.cone(0.18, 0.38, C.yellow, head, [side * 0.23, 0.34, -0.02], 12);
    ear.rotation.z = side * -0.12;
    const inner = kit.cone(0.085, 0.2, C.pink, head, [side * 0.23, 0.35, 0.09], 10);
    inner.rotation.z = side * -0.12;
  }
  kit.ellipsoid([0.06, 0.045, 0.035], C.coral, head, [0, -0.045, 0.4]);
  whiskers(kit, head);
});

const robot = driver(C.mint, (kit, { head, rig }) => {
  kit.box([0.62, 0.32, 0.1], C.silver, head, [0, 0.06, 0.34], 0.09);
  for (const eye of [rig.leftEye, rig.rightEye]) {
    eye.position.z = 0.405;
    eye.scale.set(1.25, 0.7, 1);
  }
  kit.box([0.18, 0.2, 0.22], C.silver, head, [-0.4, 0, 0], 0.04);
  kit.box([0.18, 0.2, 0.22], C.silver, head, [0.4, 0, 0], 0.04);
  kit.rod([0, 0.34, 0], [0, 0.62, 0], 0.035, C.ink, head);
  kit.sphere(0.09, C.coral, head, [0, 0.65, 0]);
  rig.mouth.rotation.z = Math.PI / 2;
});

const banana = driver(C.yellow, (kit, { head, rig }) => {
  for (const side of [-1, 1]) {
    const peel = kit.capsule(0.1, 0.52, C.yellow, head, [side * 0.34, 0.03, -0.04]);
    peel.rotation.z = side * 0.3;
    kit.sphere(0.055, C.brown, head, [side * 0.45, -0.25, -0.04]);
  }
  const top = kit.capsule(0.11, 0.48, C.yellow, head, [0.11, 0.42, -0.05]);
  top.rotation.z = -0.35;
  kit.capsule(0.045, 0.12, C.brown, head, [0.23, 0.72, -0.05]).rotation.z = -0.35;
  rig.leftEye.rotation.z = -0.18;
  rig.rightEye.rotation.z = 0.18;
});

const riceBall = driver(C.cream, (kit, { head, body }) => {
  kit.cone(0.48, 0.82, C.cream, head, [0, 0.04, -0.19], 3);
  kit.box([0.42, 0.38, 0.07], C.ink, body, [0, 0.25, 0.255], 0.04);
  for (const [x, y] of [[-0.22, 0.2], [0.2, 0.23], [-0.08, 0.34]] as const) {
    const grain = kit.ellipsoid([0.035, 0.075, 0.025], C.white, head, [x, y, 0.32]);
    grain.rotation.z = x * 1.4;
  }
  const leaf = kit.ellipsoid([0.1, 0.22, 0.035], C.leaf, head, [0.4, -0.05, 0]);
  leaf.rotation.z = -0.55;
});

const alien = driver('#a9c6a0', (kit, { head, rig }) => {
  for (const side of [-1, 1]) {
    const eye = side < 0 ? rig.leftEye : rig.rightEye;
    eye.scale.set(1.65, 2.05, 1.15);
    eye.rotation.z = side * -0.22;
    const ear = kit.ellipsoid([0.19, 0.09, 0.08], '#a9c6a0', head, [side * 0.4, 0.02, 0]);
    ear.rotation.z = side * 0.25;
    kit.rod([side * 0.13, 0.32, 0], [side * 0.25, 0.61, 0], 0.025, C.mint, head);
    kit.sphere(0.07, C.yellow, head, [side * 0.25, 0.62, 0]);
  }
});

const hippo = driver(C.purple, (kit, { head }) => {
  for (const side of [-1, 1]) {
    kit.sphere(0.12, C.purple, head, [side * 0.25, 0.33, -0.02]);
    kit.sphere(0.055, C.pink, head, [side * 0.25, 0.35, 0.07]);
  }
  kit.ellipsoid([0.3, 0.17, 0.2], '#b7a2bd', head, [0, -0.12, 0.39]);
  for (const side of [-1, 1]) {
    kit.ellipsoid([0.035, 0.025, 0.018], C.ink, head, [side * 0.1, -0.06, 0.575]);
    kit.box([0.07, 0.1, 0.035], C.white, head, [side * 0.12, -0.26, 0.44], 0.015);
  }
});

const ghost = driver(C.white, (kit, { body, head, rig }) => {
  for (const side of [-1, 1]) {
    kit.ellipsoid([0.17, 0.32, 0.23], C.white, body, [side * 0.29, 0.27, 0]);
    kit.sphere(0.14, C.white, body, [side * 0.18, 0.03, 0]);
    const eye = side < 0 ? rig.leftEye : rig.rightEye;
    eye.scale.set(1.2, 1.65, 1);
  }
  kit.sphere(0.14, C.white, body, [0, 0.01, 0]);
  rig.mouth.clear();
  kit.torus(0.055, 0.018, C.ink, rig.mouth);
  kit.ellipsoid([0.12, 0.06, 0.04], C.pink, head, [0, -0.27, 0.32]);
});

const sock = driver(C.coral, (kit, { head, rig }) => {
  const cuff = kit.torus(0.34, 0.075, C.cream, head, [0, 0.24, 0]);
  cuff.rotation.x = Math.PI / 2;
  const cap = kit.capsule(0.14, 0.42, C.coral, head, [0.1, 0.48, -0.04]);
  cap.rotation.z = -0.5;
  const capTip = kit.capsule(0.11, 0.25, C.coral, head, [0.31, 0.66, -0.04]);
  capTip.rotation.z = -1.05;
  kit.sphere(0.07, C.yellow, head, [0.47, 0.58, -0.04]);
  for (const eye of [rig.leftEye, rig.rightEye]) {
    kit.sphere(0.018, C.white, eye, [0, 0, 0.032]);
  }
  const heel = kit.ellipsoid([0.07, 0.16, 0.15], C.yellow, head, [-0.36, -0.08, -0.03]);
  heel.rotation.z = -0.2;
  for (const x of [-0.045, 0, 0.045]) {
    kit.rod([x - 0.015, -0.15, 0.402], [x + 0.015, -0.11, 0.402], 0.008, C.cream, head);
  }
});

export const DRIVER_PART_FACTORIES: Record<string, ClayPartFactory> = {
  cat,
  robot,
  banana,
  'rice-ball': riceBall,
  alien,
  hippo,
  ghost,
  sock,
};
