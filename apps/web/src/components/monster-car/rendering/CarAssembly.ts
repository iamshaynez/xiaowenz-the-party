import * as THREE from 'three';
import { MONSTER_CAR_PART_CATALOG } from '@party/games';
import type { MonsterCarFrameCar } from '@party/games';
import type { MonsterCarBuild, MonsterCarSlot } from '@party/protocol';
import { createPartModel } from './models';
import { disposeModel } from './models/types';
import type { PartRig } from './models/types';
import { clay, cylinder, glowing, rounded, torus, ball, star, noShadow } from './models/primitives';
import { sampleReactionPose, sampleSecondaryProgress } from './ReactionLibrary';
import type { ReactionPose } from './ReactionLibrary';
import type { CarIdentity } from './presentation/CarIdentity';
import { createAvatarFlag } from './AvatarFlag';
import type { PerformanceTiming } from './presentation/ReactionPerformance';
import type { SocialPose } from './presentation/SocialMoments';

const PAINTS = ['#ff7f73', '#76c9b8', '#a992e8', '#f3bf55'] as const;
const MOUNTS: Record<MonsterCarSlot, readonly [number, number, number]> = {
  wheels: [0, 0, 0],
  front: [1.42, 1.15, 0],
  rear: [-1.42, 1.15, 0],
  roof: [-0.25, 1.48, 0],
  driver: [0.43, 1.48, 0],
};
const WHEEL_MOUNTS = [
  [-1.02, 0.57, -0.82], [-1.02, 0.57, 0.82],
  [1.02, 0.57, -0.82], [1.02, 0.57, 0.82],
] as const;

interface Baseline {
  position: THREE.Vector3;
  rotation: THREE.Euler;
  scale: THREE.Vector3;
}

export class CarAssembly {
  readonly root = new THREE.Group();
  build: MonsterCarBuild;
  private readonly visual = new THREE.Group();
  private readonly suspension = new THREE.Group();
  private readonly identityBody = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wheelLayer = new THREE.Group();
  private readonly rigs: Record<MonsterCarSlot, PartRig[]> = { wheels: [], front: [], rear: [], roof: [], driver: [] };
  private readonly baselines = new WeakMap<THREE.Object3D, Baseline>();
  private readonly swapStarts = new Map<MonsterCarSlot, number>();
  private readonly pendingSwaps = new Set<MonsterCarSlot>();
  private readonly identity: CarIdentity | null;

  constructor(
    build: MonsterCarBuild,
    paint = 0,
    presentation?: { identity: CarIdentity; avatar: string; isOwn?: boolean },
  ) {
    this.build = { ...build };
    this.identity = presentation?.identity ?? null;
    this.root.name = 'monster-car';
    this.root.add(this.visual);
    this.visual.add(this.suspension, this.wheelLayer);
    this.suspension.add(this.identityBody);
    this.identityBody.add(this.body);
    if (this.identity) {
      this.identityBody.scale.set(this.identity.lengthScale, this.identity.heightScale, this.identity.widthScale);
    }
    this.createChassis(this.identity?.baseColor ?? PAINTS[paint % PAINTS.length] ?? PAINTS[0]);
    for (const slot of ['wheels', 'front', 'rear', 'roof', 'driver'] as const) this.createSlot(slot, build[slot]);
    if (presentation) this.createIdentityDetails(presentation.avatar, presentation.isOwn ?? false);
  }

  private createChassis(paint: string) {
    const main = rounded([3.05, 0.72, 1.5], paint, 0.2, clay(paint, 0.62, 0.04));
    main.position.y = 1.02;
    this.body.add(main);
    const lower = rounded([2.75, 0.2, 1.4], '#413d4c', 0.08);
    lower.position.y = 0.7;
    this.body.add(lower);

    const door = rounded([1.08, 0.5, 0.06], '#fff0d1', 0.12);
    door.position.set(-0.15, 1.05, 0.765);
    this.body.add(door);
    const emblem = ball(0.135, paint, [1, 1, 0.25]);
    emblem.position.set(-0.15, 1.05, 0.81);
    this.body.add(emblem);
    for (const x of [-1.12, 1.12]) {
      const trim = rounded([0.5, 0.08, 0.045], '#fff0d1', 0.025);
      trim.position.set(x, 1.19, 0.79);
      this.body.add(trim);
      for (const offset of [-0.15, 0.15]) {
        const rivet = ball(0.035, '#fff6dc');
        rivet.position.set(x + offset, 0.89, 0.775);
        rivet.castShadow = false;
        this.body.add(rivet);
      }
    }
    for (const z of [-0.5, 0.5]) {
      const lamp = ball(0.15, '#fff4b0', [1, 1, 1], glowing('#ffe49a', 1.05));
      lamp.position.set(1.54, 1.12, z);
      this.body.add(lamp);
    }
    for (const x of [-1.02, 1.02]) {
      const axle = cylinder(0.065, 1.75, '#57515d', 10);
      axle.rotation.x = Math.PI / 2;
      axle.position.set(x, 0.58, 0);
      this.body.add(axle);
    }
  }

  private createIdentityDetails(avatar: string, isOwn: boolean) {
    const identity = this.identity;
    if (!identity) return;
    const pattern = new THREE.Group();
    pattern.name = `identity-${identity.pattern}`;
    if (identity.pattern === 'dots') {
      for (const x of [-0.36, -0.15, 0.06]) {
        const dot = ball(0.055, identity.accentColor, [1, 1, 0.25]);
        dot.position.set(x, 1.06, 0.82);
        pattern.add(dot);
      }
    } else if (identity.pattern === 'stripes') {
      for (const x of [-0.36, 0.03]) {
        const stripe = rounded([0.08, 0.43, 0.025], identity.accentColor, 0.015);
        stripe.position.set(x, 1.05, 0.82);
        stripe.rotation.z = -0.25;
        pattern.add(stripe);
      }
    } else if (identity.pattern === 'stars') {
      for (const x of [-0.32, 0.02]) {
        const decal = star(identity.accentColor);
        decal.scale.setScalar(0.2);
        decal.position.set(x, 1.05, 0.82);
        pattern.add(decal);
      }
    } else {
      for (let index = 0; index < 4; index += 1) {
        const square = rounded([0.16, 0.16, 0.025], index % 2 ? identity.accentColor : '#fff5dc', 0.015);
        square.position.set(-0.32 + (index % 2) * 0.16, 0.97 + Math.floor(index / 2) * 0.16, 0.82);
        pattern.add(square);
      }
    }
    noShadow(pattern);
    this.body.add(pattern);

    const scarf = torus(0.24, 0.045, identity.accentColor);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.set(0.43, 1.73, 0);
    this.body.add(scarf);
    const flag = createAvatarFlag(identity, avatar);
    flag.root.position.set(-1.35, 1.22, 0.72);
    this.body.add(flag.root);

    if (isOwn) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(1.75, 0.035, 8, 48),
        new THREE.MeshBasicMaterial({ color: identity.accentColor, transparent: true, opacity: 0.65, depthWrite: false }),
      );
      ring.name = 'own-car-halo';
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.04;
      this.root.add(ring);
    }
  }

  private rememberNode(node: THREE.Object3D) {
    this.baselines.set(node, {
      position: node.position.clone(),
      rotation: node.rotation.clone(),
      scale: node.scale.clone(),
    });
  }

  private remember(rig: PartRig) {
    for (const node of Object.values(rig.nodes)) {
      this.rememberNode(node);
      if (node === rig.nodes.keys) node.children.forEach((key) => this.rememberNode(key));
    }
  }

  private createSlot(slot: MonsterCarSlot, partId: string) {
    const count = slot === 'wheels' ? 4 : 1;
    const rigs: PartRig[] = [];
    for (let index = 0; index < count; index += 1) {
      const rig = createPartModel(slot, partId);
      const rawMount = slot === 'wheels' ? WHEEL_MOUNTS[index]! : MOUNTS[slot];
      const mount: [number, number, number] = slot === 'wheels' && this.identity
        ? [rawMount[0] * this.identity.lengthScale, rawMount[1], rawMount[2] * this.identity.widthScale]
        : [rawMount[0], rawMount[1], rawMount[2]];
      rig.root.position.set(...mount);
      rig.root.userData.mount = [...mount];
      this.remember(rig);
      const parent = slot === 'wheels' ? this.wheelLayer : this.body;
      parent.add(rig.root);
      rigs.push(rig);
    }
    this.rigs[slot] = rigs;
  }

  setPart(slot: MonsterCarSlot, partId: string) {
    if (this.build[slot] === partId) return;
    for (const rig of this.rigs[slot]) {
      rig.root.removeFromParent();
      disposeModel(rig.root);
    }
    this.build = { ...this.build, [slot]: partId } as MonsterCarBuild;
    this.swapStarts.delete(slot);
    this.pendingSwaps.add(slot);
    this.createSlot(slot, partId);
  }

  private resetRig(rig: PartRig) {
    rig.root.rotation.set(0, 0, 0);
    rig.root.scale.set(1, 1, 1);
    const mount = rig.root.userData.mount as number[];
    rig.root.position.set(mount[0]!, mount[1]!, mount[2]!);
    for (const node of Object.values(rig.nodes)) {
      const base = this.baselines.get(node);
      if (!base) continue;
      node.position.copy(base.position);
      node.rotation.copy(base.rotation);
      node.scale.copy(base.scale);
    }
    if (rig.nodes.keys) {
      rig.nodes.keys.children.forEach((key) => {
        const base = this.baselines.get(key);
        if (base) key.position.copy(base.position);
      });
    }
    if (rig.nodes.flame) rig.nodes.flame.visible = false;
  }

  private applyLocalPose(rig: PartRig, pose: ReactionPose) {
    rig.root.rotation.x += pose.pitch * 0.35;
    rig.root.rotation.z += pose.wobble * 0.45;
    rig.root.position.y += pose.bounce * 0.14;
    rig.root.scale.y *= 1 + pose.squash * 0.4;

    const { nodes } = rig;
    if (nodes.rotor) nodes.rotor.rotation.y += pose.spin * Math.PI * 1.5;
    if (nodes.drum) nodes.drum.rotation.z += pose.spin * Math.PI;
    if (nodes.wheel) nodes.wheel.rotation.z += pose.spin * Math.PI;
    if (nodes.motion) nodes.motion.position.y += pose.bounce * 0.24;
    if (nodes.spring) nodes.spring.scale.y *= 1 + pose.bounce * 0.55;
    if (nodes.canopy) nodes.canopy.scale.multiplyScalar(1 + pose.open * 0.38);
    if (nodes.jaw) nodes.jaw.rotation.z -= pose.open * 0.5;
    if (nodes.lid) nodes.lid.rotation.z -= pose.open * 0.75;
    if (nodes.hose) nodes.hose.rotation.z += pose.wobble;
    if (nodes.steam) nodes.steam.scale.multiplyScalar(1 + pose.bounce * 0.6);
    if (nodes.flame && pose.particle === 'popcorn') {
      nodes.flame.visible = true;
      nodes.flame.scale.multiplyScalar(1 + Math.abs(pose.forward) * 0.65 + pose.lift * 0.35);
    }
    if (nodes.spout) nodes.spout.rotation.z += pose.wobble * 0.4;
    if (nodes.bird) nodes.bird.position.y += pose.bounce * 0.22;
    if (nodes.tail) nodes.tail.rotation.y += pose.wag;
    if (nodes.keys) {
      nodes.keys.children.forEach((key, index) => {
        key.position.y += Math.sin(index * 1.7 + pose.cycles) * pose.bounce * 0.07;
      });
    }
  }

  private applyDriverPose(rig: PartRig, pose: ReactionPose, timeSeconds: number) {
    rig.root.position.y += pose.driverLift;
    const { nodes } = rig;
    if (nodes.head) nodes.head.rotation.z += pose.wobble * 0.35 + Math.sin(timeSeconds * 3) * pose.cheer * 0.08;
    if (nodes.leftArm) nodes.leftArm.rotation.z -= pose.cheer * 0.9;
    if (nodes.rightArm) nodes.rightArm.rotation.z += pose.cheer * 0.9;
    if (nodes.antenna) nodes.antenna.rotation.z += pose.wobble * 0.5;
  }

  private applySwapMotion(timeSeconds: number, reducedMotion: boolean) {
    if (reducedMotion) {
      this.pendingSwaps.clear();
      this.swapStarts.clear();
      return;
    }
    for (const slot of this.pendingSwaps) {
      const startedAt = this.swapStarts.get(slot) ?? timeSeconds;
      this.swapStarts.set(slot, startedAt);
      const progress = Math.max(0, Math.min(1, (timeSeconds - startedAt) / 0.45));
      const wave = Math.sin(progress * Math.PI);
      for (const rig of this.rigs[slot]) {
        rig.root.scale.multiplyScalar(1 + wave * 0.18);
        rig.root.position.y += wave * 0.22;
      }
      if (progress >= 1) {
        this.pendingSwaps.delete(slot);
        this.swapStarts.delete(slot);
      }
    }
  }

  update(
    timeSeconds: number,
    travelDistance: number,
    cue: MonsterCarFrameCar['activeCue'],
    reducedMotion = false,
    celebration = 0,
    performance?: PerformanceTiming,
    social?: SocialPose,
  ) {
    const idleAmount = reducedMotion ? 0.25 : 1;
    this.visual.position.set(0, Math.sin(timeSeconds * 5 + travelDistance) * 0.018 * idleAmount, 0);
    this.visual.rotation.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
    const suspensionPhase = this.identity?.suspensionPhase ?? 0;
    this.suspension.position.y = Math.sin(timeSeconds * 3.2 + suspensionPhase) * 0.022 * idleAmount;
    this.suspension.rotation.z = Math.sin(timeSeconds * 2.1 + suspensionPhase) * 0.006 * idleAmount;
    const anticipation = performance?.anticipation ?? 0;
    this.suspension.position.y -= anticipation * 0.075 * idleAmount;

    for (const slot of ['front', 'rear', 'roof', 'driver'] as const) {
      for (const rig of this.rigs[slot]) this.resetRig(rig);
    }
    const primaryWheelBoost = cue ? sampleReactionPose({ ...cue.primary, intensity: cue.intensity }, cue.stimulus, cue.localProgress, reducedMotion).wheelBoost : 0;
    for (const wheel of this.rigs.wheels) {
      this.resetRig(wheel);
      wheel.root.rotation.z = -travelDistance * 2.35 - primaryWheelBoost;
    }

    for (const slot of ['front', 'rear', 'roof', 'driver'] as const) {
      for (const rig of this.rigs[slot]) {
        const definition = MONSTER_CAR_PART_CATALOG[slot][this.build[slot]];
        if (!definition) continue;
        if (definition.idle === 'bounce') rig.root.position.y += Math.abs(Math.sin(timeSeconds * 2.4)) * 0.04 * idleAmount;
        if (definition.idle === 'sway') rig.root.rotation.z += Math.sin(timeSeconds * 2.2) * 0.045 * idleAmount;
        if (definition.idle === 'spin' && rig.nodes.rotor) rig.nodes.rotor.rotation.y += timeSeconds * 7 * idleAmount;
        if (definition.idle === 'blink' && rig.nodes.eyes) {
          const blink = Math.sin(timeSeconds * 0.73 + 1.2) > 0.985 ? 0.12 : 1;
          rig.nodes.eyes.scale.y *= blink;
        }
      }
    }

    if (celebration > 0) {
      const driver = this.rigs.driver[0];
      if (driver) {
        const cheerPose: ReactionPose = {
          lift: 0, forward: 0, pitch: 0, roll: 0, yaw: 0, squash: 0, wobble: 0,
          cycles: 1, wheelBoost: 0, driverLift: celebration * 0.08, cheer: celebration,
          spin: 0, open: 0, bounce: 0, wag: 0, particle: 'stars',
        };
        this.applyDriverPose(driver, cheerPose, timeSeconds);
      }
    }

    const anticipatingDriver = this.rigs.driver[0];
    if (anticipatingDriver && anticipation > 0) {
      anticipatingDriver.root.rotation.y -= anticipation * 0.18 * idleAmount;
      if (anticipatingDriver.nodes.head) anticipatingDriver.nodes.head.rotation.x -= anticipation * 0.08;
      if (anticipatingDriver.nodes.eyes) anticipatingDriver.nodes.eyes.scale.y *= 1 + anticipation * 0.2;
    }

    if (social) {
      this.visual.rotation.z += social.lean * idleAmount;
      const socialDriver = this.rigs.driver[0];
      if (socialDriver) {
        socialDriver.root.rotation.y += social.look * 0.35 * idleAmount;
        if (socialDriver.nodes.head) socialDriver.nodes.head.rotation.y += social.look * 0.45;
        if (socialDriver.nodes.leftArm) socialDriver.nodes.leftArm.rotation.z -= social.cheer * 0.65;
        if (socialDriver.nodes.rightArm) socialDriver.nodes.rightArm.rotation.z += social.cheer * 0.65;
      }
    }

    this.applySwapMotion(timeSeconds, reducedMotion);
    if (!cue) return;
    const primaryPose = sampleReactionPose({ ...cue.primary, intensity: cue.intensity }, cue.stimulus, cue.localProgress, reducedMotion);
    this.visual.position.y += primaryPose.lift;
    this.visual.rotation.x += primaryPose.pitch;
    this.visual.rotation.y += primaryPose.yaw;
    this.visual.rotation.z += primaryPose.roll;
    const followThrough = performance?.followThrough ?? 0;
    this.visual.rotation.z += Math.sin(followThrough * Math.PI) * 0.045 * idleAmount;
    this.visual.scale.set(1 + primaryPose.squash, 1 - primaryPose.squash * 0.75, 1 + primaryPose.squash * 0.35);
    if (cue.primary.slot !== 'chassis') {
      for (const rig of this.rigs[cue.primary.slot]) this.applyLocalPose(rig, primaryPose);
    }
    const driverRig = this.rigs.driver[0];
    if (driverRig) this.applyDriverPose(driverRig, primaryPose, timeSeconds);

    for (const secondary of cue.secondary) {
      const progress = sampleSecondaryProgress(cue, secondary);
      const pose = sampleReactionPose({ ...secondary, intensity: secondary.intensity * 0.48 }, cue.stimulus, progress, reducedMotion);
      if (secondary.slot !== 'chassis') {
        for (const rig of this.rigs[secondary.slot]) this.applyLocalPose(rig, pose);
      } else {
        this.visual.position.y += pose.lift * 0.35;
        this.visual.rotation.x += pose.pitch * 0.4;
        this.visual.rotation.z += pose.wobble * 0.5;
      }
      if (secondary.slot === 'driver' && driverRig) this.applyDriverPose(driverRig, pose, timeSeconds);
    }
  }

  dispose() {
    disposeModel(this.root);
  }
}

export function componentName(build: MonsterCarBuild, slot: MonsterCarSlot) {
  return `${slot}:${build[slot]}`;
}
