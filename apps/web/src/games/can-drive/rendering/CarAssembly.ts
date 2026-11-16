import * as THREE from 'three';
import { ClayGeometryKit } from './geometry';
import { CLAY_PRESET as C } from './clayPreset';
import { CAR_PART_FACTORIES } from './parts';
import { CLAY_CAR_SLOTS } from './types';
import type {
  CarVisualPose,
  ClayCarBuild,
  ClayCarSlot,
  ClayDriverRig,
  ClayPartChannel,
  ClayPartVisual,
  DriverReaction,
} from './types';

export const DEFAULT_CLAY_CAR_BUILD: Readonly<ClayCarBuild> = {
  driver: 'cat',
  motion: 'square-wheels',
  front: 'pillow',
  rear: 'rocket',
  roof: 'umbrella',
};

const INITIAL_POSE: CarVisualPose = {
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  speed: 0,
  wheelSpin: 0,
  activation: { driver: 0, motion: 0, front: 0, rear: 0, roof: 0 },
  driverReaction: 'drive',
  timeMs: 0,
};

interface DriverRestPose {
  readonly headRotation: THREE.Euler;
  readonly leftEyeScale: THREE.Vector3;
  readonly rightEyeScale: THREE.Vector3;
  readonly mouthScale: THREE.Vector3;
  readonly mouthRotation: THREE.Euler;
  readonly leftArmRotation: THREE.Euler;
  readonly rightArmRotation: THREE.Euler;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function amount(pose: CarVisualPose, slot: ClayCarSlot): number {
  return THREE.MathUtils.clamp(finite(pose.activation[slot]), 0, 1);
}

function channel(visual: ClayPartVisual, name: ClayPartChannel): THREE.Object3D | undefined {
  return visual.channels[name];
}

/** A complete socket-based clay car. The caller owns rendering and the frame loop. */
export class CarAssembly {
  readonly root: THREE.Group;

  private readonly kit = new ClayGeometryKit();
  private readonly sockets: Record<ClayCarSlot, THREE.Group>;
  private readonly visuals: Partial<Record<ClayCarSlot, ClayPartVisual>> = {};
  private readonly driverRest = new WeakMap<ClayDriverRig, DriverRestPose>();
  private currentBuild: ClayCarBuild = { ...DEFAULT_CLAY_CAR_BUILD };
  private lastPose: CarVisualPose = INITIAL_POSE;
  private disposed = false;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'clay-car-assembly';
    this.buildChassis();
    this.sockets = {
      driver: this.kit.group(this.root, [0, 1.1, -0.18], 'socket.driver'),
      motion: this.kit.group(this.root, [0, 0, 0], 'socket.motion'),
      front: this.kit.group(this.root, [0, 0.82, 1.28], 'socket.front'),
      rear: this.kit.group(this.root, [0, 0.86, -1.28], 'socket.rear'),
      roof: this.kit.group(this.root, [0, 1.12, -0.2], 'socket.roof'),
    };
    this.setBuild(DEFAULT_CLAY_CAR_BUILD);
  }

  get build(): ClayCarBuild {
    return { ...this.currentBuild };
  }

  setBuild(build: Readonly<ClayCarBuild>): void {
    this.assertActive();
    const next = {} as ClayCarBuild;
    for (const slot of CLAY_CAR_SLOTS) {
      const previous = this.visuals[slot];
      previous?.root.removeFromParent();
      const factories = CAR_PART_FACTORIES[slot];
      const requested = build[slot];
      const selected = Object.hasOwn(factories, requested) ? requested : DEFAULT_CLAY_CAR_BUILD[slot];
      const factory = factories[selected];
      if (!factory) throw new Error(`Missing default clay part: ${slot}/${selected}`);
      const visual = factory(this.kit);
      visual.root.name = `${slot}:${selected}`;
      this.sockets[slot].add(visual.root);
      this.visuals[slot] = visual;
      next[slot] = selected;
    }
    this.currentBuild = next;
    this.applyVisuals(this.lastPose);
  }

  update(pose: CarVisualPose): void {
    if (this.disposed) return;
    this.lastPose = pose;
    this.root.position.set(...pose.position);
    this.root.rotation.set(...pose.rotation);
    this.applyVisuals(pose);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    this.root.clear();
    for (const slot of CLAY_CAR_SLOTS) delete this.visuals[slot];
    this.kit.dispose();
  }

  private buildChassis(): void {
    this.kit.box([1.78, 0.56, 2.58], C.coral, this.root, [0, 0.82, 0], 0.18);
    this.kit.box([1.62, 0.28, 1.04], C.coralLight, this.root, [0, 1.17, 0.66], 0.11);
    this.kit.box([1.12, 0.76, 0.2], C.ink, this.root, [0, 1.34, -0.68], 0.08);
    this.kit.box([1.18, 0.12, 0.76], C.ink, this.root, [0, 1.11, -0.25], 0.04);
    for (const x of [-0.58, 0.58]) {
      this.kit.sphere(0.14, C.yellow, this.root, [x, 0.91, 1.31]);
    }
    this.kit.rod([0, 1.08, 0.55], [0, 1.37, 0.4], 0.035, C.ink, this.root);
    const steering = this.kit.torus(0.25, 0.035, C.ink, this.root, [0, 1.37, 0.4]);
    steering.rotation.x = -0.25;
  }

  private applyVisuals(pose: CarVisualPose): void {
    const time = finite(pose.timeMs ?? pose.wheelSpin * 120) / 1000;
    const spin = finite(pose.wheelSpin);
    const speed = finite(pose.speed);
    this.updateMotion(spin, speed, time, amount(pose, 'motion'));
    this.updateFront(time, amount(pose, 'front'));
    this.updateRear(time, amount(pose, 'rear'));
    this.updateRoof(time, amount(pose, 'roof'));
    this.updateDriver(pose.driverReaction, speed, time, amount(pose, 'driver'));
  }

  private updateMotion(spinAngle: number, speed: number, time: number, activation: number): void {
    const id = this.currentBuild.motion;
    const visual = this.visuals.motion;
    if (!visual) return;
    const spin = channel(visual, 'spin');
    if (spin) {
      spin.children.forEach((pivot, index) => {
        if (id === 'duck-feet') {
          const phase = spinAngle * 1.8 + index * Math.PI;
          pivot.rotation.x = Math.sin(phase) * 0.42 * Math.min(1, Math.abs(speed) / 2 + 0.25);
          pivot.position.y = 0.22 + Math.max(0, Math.sin(phase)) * 0.14;
        } else {
          pivot.rotation.x = -spinAngle;
        }
      });
    }
    const bounce = channel(visual, 'bounce');
    if (bounce && id === 'springs') {
      const compression = Math.sin(spinAngle * 2 + time * 3) * (0.035 + activation * 0.16);
      bounce.scale.set(1 - compression * 0.2, 1 + compression, 1 - compression * 0.2);
    }
    if (bounce && id === 'balloons') {
      bounce.position.y = Math.sin(time * 2.1) * 0.055 + activation * 0.12;
      bounce.rotation.z = Math.sin(time * 1.4) * 0.025;
    }
    const steer = channel(visual, 'steer');
    if (steer) steer.rotation.y = Math.sin(spinAngle * 0.2) * 0.08 * Math.min(1, Math.abs(speed) / 3);
    const trail = channel(visual, 'trail');
    if (trail && id === 'tracks') trail.position.z = Math.sin(spinAngle) * 0.035;
  }

  private updateFront(time: number, activation: number): void {
    const id = this.currentBuild.front;
    const visual = this.visuals.front;
    if (!visual) return;
    const open = channel(visual, 'open');
    const spin = channel(visual, 'spin');
    const accessory = channel(visual, 'accessory');
    if (id === 'bumper' && open) open.position.z = activation * 0.18;
    if (id === 'plow' && open) {
      open.position.z = activation * 0.12;
      open.rotation.x = -activation * 0.18;
    }
    if (id === 'boxing-glove' && open) {
      open.position.z = activation * (0.48 + Math.sin(time * 12) * 0.06);
      open.scale.setScalar(1 + activation * 0.04 * Math.sin(time * 12));
    }
    if (id === 'vacuum') {
      if (open) open.scale.x = 1 + activation * 0.09;
      if (spin) spin.rotation.z = -time * (2 + activation * 18);
    }
    if (id === 'magnet') {
      if (open) open.position.z = 0.24 + activation * 0.18;
      if (accessory) {
        accessory.rotation.z = Math.sin(time * 4) * activation * 0.12;
        accessory.position.z = activation * 0.1;
      }
    }
    if (id === 'drill' && spin) spin.rotation.z = time * (2 + activation * 24);
    if (id === 'pillow' && open) {
      const squash = activation * (0.12 + Math.sin(time * 8) * 0.055);
      open.scale.set(1 + squash, 1 - squash, 1 + squash * 0.4);
    }
    if (id === 'duck-bill' && open) open.rotation.x = activation * 0.42;
  }

  private updateRear(time: number, activation: number): void {
    const id = this.currentBuild.rear;
    const visual = this.visuals.rear;
    if (!visual) return;
    const open = channel(visual, 'open');
    const spin = channel(visual, 'spin');
    const flame = channel(visual, 'flame');
    const trail = channel(visual, 'trail');
    const bounce = channel(visual, 'bounce');
    const accessory = channel(visual, 'accessory');
    if (id === 'spoiler' && open) open.rotation.x = -activation * 0.58;
    if (id === 'rocket' && flame) {
      flame.visible = activation > 0.015;
      flame.scale.set(0.82 + activation * 0.18, 0.2 + activation * (0.9 + Math.sin(time * 24) * 0.18), 0.82 + activation * 0.18);
    }
    if (id === 'fan' && spin) spin.rotation.z = -time * (1 + activation * 20);
    if (id === 'bubbles' && trail) {
      trail.visible = activation > 0.015;
      trail.position.y = Math.sin(time * 2.5) * 0.1;
      trail.rotation.z = Math.sin(time * 1.8) * 0.08;
      trail.scale.setScalar(0.65 + activation * 0.45);
    }
    if (id === 'water-cannon') {
      if (open) open.rotation.x = -activation * 0.18;
      if (trail) {
        trail.visible = activation > 0.015;
        trail.scale.set(0.7 + activation * 0.3, 0.7 + activation * 0.3, 0.25 + activation * 1.1);
      }
    }
    if (id === 'confetti') {
      if (open) open.rotation.x = -activation * 0.1;
      if (trail) {
        trail.visible = activation > 0.015;
        trail.scale.setScalar(0.35 + activation * 0.8);
        trail.rotation.z = time * 0.6;
        trail.position.y = activation * Math.abs(Math.sin(time * 3)) * 0.12;
      }
    }
    if (id === 'spring-tail') {
      if (bounce) bounce.scale.z = 1 + Math.sin(time * 6) * (0.05 + activation * 0.3);
      if (accessory) {
        accessory.rotation.z = Math.sin(time * 4) * (0.1 + activation * 0.2);
        accessory.position.y = 0.23 + Math.sin(time * 6) * activation * 0.08;
      }
    }
    if (id === 'music-horn') {
      if (open) open.scale.setScalar(1 + activation * Math.sin(time * 10) * 0.05);
      if (accessory) {
        accessory.visible = activation > 0.015;
        accessory.position.y = Math.sin(time * 3) * 0.08;
        accessory.rotation.z = Math.sin(time * 2) * 0.1;
      }
    }
  }

  private updateRoof(time: number, activation: number): void {
    const id = this.currentBuild.roof;
    const visual = this.visuals.roof;
    if (!visual) return;
    const open = channel(visual, 'open');
    const spin = channel(visual, 'spin');
    const bounce = channel(visual, 'bounce');
    const accessory = channel(visual, 'accessory');
    const head = channel(visual, 'head');
    if (id === 'flag' && accessory) accessory.rotation.y = Math.sin(time * 5) * (0.08 + activation * 0.3);
    if (id === 'umbrella' && open) {
      const opening = 0.45 + activation * 0.55;
      open.scale.set(opening, 1, opening);
      open.rotation.y = Math.sin(time * 1.8) * 0.08;
    }
    if (id === 'propeller' && spin) spin.rotation.y = time * (1.5 + activation * 22);
    if (id === 'searchlight') {
      if (head) head.rotation.y = Math.sin(time * 0.9) * 0.65;
      if (open) {
        open.visible = activation > 0.015;
        open.scale.z = 0.65 + activation * 0.5;
      }
    }
    if (id === 'trampoline' && bounce) {
      bounce.position.y = 1.13 + Math.abs(Math.sin(time * (2.5 + activation * 5))) * (0.05 + activation * 0.25);
    }
    if (id === 'satellite') {
      if (spin) spin.rotation.y = time * (0.2 + activation * 0.8);
      if (open) open.scale.x = 0.65 + activation * 0.35;
    }
    if (id === 'flowerpot') {
      if (accessory) accessory.rotation.z = Math.sin(time * 1.8) * (0.05 + activation * 0.08);
      if (open) open.scale.setScalar(0.85 + activation * 0.15 + Math.sin(time * 2.2) * 0.025);
    }
    if (id === 'windmill' && spin) spin.rotation.z = -time * (1 + activation * 15);
  }

  private updateDriver(reaction: DriverReaction, speed: number, time: number, activation: number): void {
    const visual = this.visuals.driver;
    const rig = visual?.driver;
    if (!visual || !rig) return;
    const bounce = channel(visual, 'bounce');
    const head = channel(visual, 'head');
    const rest = this.restPose(rig);
    if (bounce) {
      bounce.position.set(0, 0, 0);
      bounce.rotation.set(0, 0, 0);
    }
    if (head) head.rotation.copy(rest.headRotation);
    rig.leftEye.scale.copy(rest.leftEyeScale);
    rig.rightEye.scale.copy(rest.rightEyeScale);
    rig.mouth.scale.copy(rest.mouthScale);
    rig.mouth.rotation.copy(rest.mouthRotation);
    rig.leftArm.rotation.copy(rest.leftArmRotation);
    rig.rightArm.rotation.copy(rest.rightArmRotation);

    if (reaction === 'drive') {
      if (head) {
        head.rotation.z += Math.sin(time * 2.2) * 0.035;
        head.rotation.x += THREE.MathUtils.clamp(speed, -4, 6) * 0.006;
      }
      rig.leftArm.rotation.x -= activation * Math.sin(time * 5) * 0.06;
      return;
    }
    if (reaction === 'brace') {
      if (bounce) bounce.position.y = -0.04;
      if (head) head.rotation.x += 0.22;
      rig.leftArm.rotation.x -= 0.28;
      rig.rightArm.rotation.x -= 0.28;
      rig.leftEye.scale.multiplyScalar(1.25);
      rig.rightEye.scale.multiplyScalar(1.25);
      rig.mouth.scale.multiplyScalar(1.3);
      return;
    }
    if (reaction === 'dizzy') {
      if (bounce) bounce.rotation.z = Math.sin(time * 4) * 0.04;
      if (head) {
        head.rotation.z += Math.sin(time * 7) * 0.18;
        head.rotation.y += Math.sin(time * 5) * 0.22;
      }
      rig.leftEye.scale.y *= 0.7 + Math.sin(time * 8) * 0.25;
      rig.rightEye.scale.y *= 0.7 - Math.sin(time * 8) * 0.25;
      rig.mouth.rotation.z += Math.sin(time * 6) * 0.35;
      return;
    }
    if (reaction === 'cheer') {
      if (bounce) bounce.position.y = Math.abs(Math.sin(time * 5)) * 0.12;
      if (head) head.rotation.z += Math.sin(time * 4) * 0.08;
      rig.leftArm.rotation.x -= 1.2 + Math.sin(time * 5) * 0.25;
      rig.rightArm.rotation.x -= 1.2 + Math.sin(time * 5) * 0.25;
      rig.leftEye.scale.y *= 0.35;
      rig.rightEye.scale.y *= 0.35;
      rig.mouth.scale.multiplyScalar(1.35);
      return;
    }
    if (head) head.rotation.z -= 0.08;
    rig.rightArm.rotation.x -= 1.35;
    rig.rightArm.rotation.z += Math.sin(time * 7) * 0.38;
    rig.leftEye.scale.y *= 0.75;
  }

  private restPose(rig: ClayDriverRig): DriverRestPose {
    const cached = this.driverRest.get(rig);
    if (cached) return cached;
    const head = this.visuals.driver?.channels.head;
    const rest: DriverRestPose = {
      headRotation: head?.rotation.clone() ?? new THREE.Euler(),
      leftEyeScale: rig.leftEye.scale.clone(),
      rightEyeScale: rig.rightEye.scale.clone(),
      mouthScale: rig.mouth.scale.clone(),
      mouthRotation: rig.mouth.rotation.clone(),
      leftArmRotation: rig.leftArm.rotation.clone(),
      rightArmRotation: rig.rightArm.rotation.clone(),
    };
    this.driverRest.set(rig, rest);
    return rest;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('CarAssembly has been disposed');
  }
}
