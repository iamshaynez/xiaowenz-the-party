import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { MonsterCarBuild, MonsterCarSlot } from '@party/protocol';
import type { MonsterCarFrameCar } from '@party/games';

const PAINTS = ['#ff7f73', '#76c9b8', '#a992e8', '#f3bf55'] as const;

function clay(color: string, roughness = 0.72, metalness = 0.02) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function makeMesh(geometry: THREE.BufferGeometry, material: THREE.Material, position = [0, 0, 0]) {
  const result = new THREE.Mesh(geometry, material);
  const [x = 0, y = 0, z = 0] = position;
  result.position.set(x, y, z);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

function ball(radius: number, color: string, scale: [number, number, number] = [1, 1, 1]) {
  const result = makeMesh(new THREE.SphereGeometry(radius, 20, 14), clay(color));
  result.scale.set(...scale);
  return result;
}

function box(size: [number, number, number], color: string, radius = 0.12) {
  return makeMesh(new RoundedBoxGeometry(...size, 4, radius), clay(color));
}

function cylinder(radius: number, length: number, color: string, segments = 16) {
  return makeMesh(new THREE.CylinderGeometry(radius, radius, length, segments), clay(color));
}

function starGeometry() {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? 0.36 : 0.16;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: true, bevelSize: 0.035, bevelThickness: 0.035, bevelSegments: 2 });
}

export class CarAssembly {
  readonly root = new THREE.Group();
  readonly build: MonsterCarBuild;
  private readonly visual = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly spinners: THREE.Group[] = [];
  private readonly driver = new THREE.Group();
  private readonly roof = new THREE.Group();
  private readonly rear = new THREE.Group();
  private readonly front = new THREE.Group();
  private readonly umbrella = new THREE.Group();
  private readonly mushroom = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly rocketFlame = new THREE.Group();
  private readonly eyes: THREE.Object3D[] = [];
  private readonly baseColor: string;

  constructor(build: MonsterCarBuild, paint = 0) {
    this.build = { ...build };
    this.baseColor = PAINTS[paint % PAINTS.length] ?? PAINTS[0];
    this.root.name = 'monster-car';
    this.root.add(this.visual);
    this.visual.add(this.body);
    this.createChassis();
    this.createWheels(build.wheels);
    this.createFront(build.front);
    this.createRear(build.rear);
    this.createRoof(build.roof);
    this.createDriver(build.driver);
    this.body.add(this.front, this.rear, this.roof, this.driver);
  }

  private createChassis() {
    const main = box([3.05, 0.72, 1.5], this.baseColor, 0.2);
    main.position.y = 1.02;
    this.body.add(main);

    const lower = box([2.7, 0.2, 1.38], '#493f52', 0.08);
    lower.position.y = 0.7;
    this.body.add(lower);

    const door = box([1.05, 0.48, 0.055], '#fff1d2', 0.12);
    door.position.set(-0.15, 1.05, 0.765);
    this.body.add(door);
    const emblem = ball(0.13, this.baseColor, [1, 1, 0.25]);
    emblem.position.set(-0.15, 1.05, 0.81);
    this.body.add(emblem);

    for (const z of [-0.5, 0.5]) {
      const lampMaterial = new THREE.MeshStandardMaterial({
        color: '#fff4b0', emissive: '#ffd86b', emissiveIntensity: 1.1, roughness: 0.35,
      });
      const lamp = makeMesh(new THREE.SphereGeometry(0.14, 16, 10), lampMaterial, [1.54, 1.12, z]);
      this.body.add(lamp);
    }
  }

  private createWheels(kind: MonsterCarBuild['wheels']) {
    for (const x of [-1.02, 1.02]) {
      for (const z of [-0.82, 0.82]) {
        const wheel = new THREE.Group();
        wheel.position.set(x, 0.57, z);
        if (kind === 'classic') {
          wheel.add(makeMesh(new THREE.TorusGeometry(0.38, 0.145, 12, 24), clay('#3c3745')));
          const hub = cylinder(0.21, 0.12, '#f7d987');
          hub.rotation.x = Math.PI / 2;
          wheel.add(hub);
        } else if (kind === 'donut') {
          wheel.add(makeMesh(new THREE.TorusGeometry(0.37, 0.18, 14, 28), clay('#d99b61')));
          const icing = makeMesh(new THREE.TorusGeometry(0.37, 0.12, 10, 28), clay('#f59cb7'));
          icing.position.z = z > 0 ? 0.11 : -0.11;
          wheel.add(icing);
          for (let index = 0; index < 7; index += 1) {
            const sprinkle = box([0.04, 0.11, 0.035], index % 2 ? '#fff0a0' : '#8fe1d2', 0.01);
            const angle = index * Math.PI * 2 / 7;
            sprinkle.position.set(Math.cos(angle) * 0.38, Math.sin(angle) * 0.38, z > 0 ? 0.22 : -0.22);
            sprinkle.rotation.z = angle;
            wheel.add(sprinkle);
          }
        } else if (kind === 'spring') {
          for (let index = 0; index < 5; index += 1) {
            const coil = makeMesh(new THREE.TorusGeometry(0.31, 0.045, 8, 20), clay('#d7e1df', 0.35, 0.55));
            coil.position.z = (index - 2) * 0.075;
            wheel.add(coil);
          }
          wheel.add(makeMesh(new THREE.TorusGeometry(0.37, 0.075, 10, 24), clay('#6b6676')));
        } else {
          const balloonMaterial = new THREE.MeshPhysicalMaterial({
            color: '#a9e7ef', roughness: 0.2, transmission: 0.08, transparent: true, opacity: 0.88,
          });
          wheel.add(makeMesh(new THREE.SphereGeometry(0.48, 20, 16), balloonMaterial));
          const knot = makeMesh(new THREE.ConeGeometry(0.09, 0.18, 8), clay('#ef9baf'));
          knot.position.y = -0.49;
          knot.rotation.z = Math.PI;
          wheel.add(knot);
        }
        this.wheels.push(wheel);
        this.body.add(wheel);
      }
    }
  }

  private createFront(kind: MonsterCarBuild['front']) {
    this.front.position.set(1.42, 1.15, 0);
    if (kind === 'smile') {
      const nose = ball(0.19, '#ffd7a1', [1, 0.8, 1]);
      nose.position.x = 0.2;
      this.front.add(nose);
      const smile = makeMesh(new THREE.TorusGeometry(0.22, 0.035, 8, 18, Math.PI), clay('#6c4545'));
      smile.position.set(0.24, -0.18, 0.38);
      smile.rotation.set(0, Math.PI / 2, Math.PI);
      this.front.add(smile);
    } else if (kind === 'duck') {
      const head = ball(0.43, '#f8d867', [1.1, 1, 1]);
      head.position.set(0.18, 0.22, 0);
      const bill = box([0.52, 0.18, 0.55], '#f39b57', 0.08);
      bill.position.set(0.57, 0.12, 0);
      this.front.add(head, bill);
      for (const z of [-0.25, 0.25]) {
        const eye = ball(0.055, '#292d3b');
        eye.position.set(0.34, 0.39, z);
        this.front.add(eye);
      }
    } else if (kind === 'train') {
      const boiler = cylinder(0.39, 0.72, '#596873');
      boiler.rotation.z = Math.PI / 2;
      boiler.position.x = 0.15;
      const chimney = cylinder(0.13, 0.58, '#3b404d');
      chimney.position.set(0.15, 0.58, 0);
      const rim = cylinder(0.2, 0.12, '#ef835f');
      rim.position.set(0.15, 0.88, 0);
      this.front.add(boiler, chimney, rim);
    } else {
      const scoop = makeMesh(new THREE.ConeGeometry(0.65, 0.75, 4), clay('#e9a55e', 0.48, 0.18));
      scoop.rotation.set(0, 0, -Math.PI / 2);
      scoop.position.set(0.43, -0.32, 0);
      scoop.scale.z = 1.25;
      this.front.add(scoop);
      const nose = ball(0.2, '#80604e');
      nose.position.set(0.15, 0.12, 0);
      this.front.add(nose);
    }
  }

  private createRear(kind: MonsterCarBuild['rear']) {
    this.rear.position.set(-1.42, 1.15, 0);
    if (kind === 'trunk') {
      const trunk = box([0.66, 0.68, 1.05], '#a57955', 0.12);
      trunk.position.set(-0.18, 0.13, 0);
      this.rear.add(trunk);
      for (const z of [-0.31, 0.31]) {
        const strap = box([0.7, 0.12, 0.09], '#f2cf79', 0.03);
        strap.position.set(-0.18, 0.16, z);
        this.rear.add(strap);
      }
    } else if (kind === 'rocket') {
      const rocket = cylinder(0.3, 0.92, '#e8e1d4');
      rocket.rotation.z = Math.PI / 2;
      rocket.position.set(-0.35, 0.13, 0);
      const nose = makeMesh(new THREE.ConeGeometry(0.3, 0.48, 16), clay('#ed786c'));
      nose.rotation.z = Math.PI / 2;
      nose.position.set(-1.02, 0.13, 0);
      this.rear.add(rocket, nose);
      this.rocketFlame.position.set(-1.25, 0.13, 0);
      for (let index = 0; index < 5; index += 1) {
        const puff = ball(0.13 + index * 0.015, index % 2 ? '#fff1b5' : '#ffad66');
        puff.position.x = -index * 0.17;
        this.rocketFlame.add(puff);
      }
      this.rocketFlame.visible = false;
      this.rear.add(this.rocketFlame);
    } else if (kind === 'bubble') {
      const tub = box([0.85, 0.5, 1.08], '#f5efe5', 0.2);
      tub.position.set(-0.22, 0.02, 0);
      this.rear.add(tub);
      const bubbleMaterial = new THREE.MeshPhysicalMaterial({ color: '#c5f4f1', transparent: true, opacity: 0.64, roughness: 0.1 });
      for (let index = 0; index < 7; index += 1) {
        const bubble = makeMesh(new THREE.SphereGeometry(0.11 + (index % 3) * 0.035, 12, 10), bubbleMaterial);
        bubble.position.set(-0.5 + (index % 4) * 0.2, 0.37 + Math.floor(index / 4) * 0.17, (index % 2 ? -1 : 1) * 0.25);
        this.rear.add(bubble);
      }
    } else {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(-0.55, 0.12, 0),
        new THREE.Vector3(-0.85, 0.58, 0),
        new THREE.Vector3(-0.55, 0.88, 0),
      ]);
      this.tail.add(makeMesh(new THREE.TubeGeometry(curve, 20, 0.15, 10, false), clay('#ed916d')));
      const tip = ball(0.23, '#fff0d2');
      tip.position.set(-0.55, 0.88, 0);
      this.tail.add(tip);
      this.rear.add(this.tail);
    }
  }

  private createRoof(kind: MonsterCarBuild['roof']) {
    this.roof.position.set(-0.25, 1.48, 0);
    if (kind === 'mushroom') {
      const stem = cylinder(0.14, 0.52, '#fff1d4');
      stem.position.y = 0.24;
      this.mushroom.add(stem);
      const cap = ball(0.65, '#ee8076', [1, 0.45, 1]);
      cap.position.y = 0.62;
      this.mushroom.add(cap);
      for (const [x, z] of [[0.28, 0.22], [-0.27, 0.13], [0.05, -0.3]] as const) {
        const spot = ball(0.09, '#fff0d0', [1, 0.35, 1]);
        spot.position.set(x, 0.89, z);
        this.mushroom.add(spot);
      }
      this.roof.add(this.mushroom);
    } else if (kind === 'umbrella') {
      const pole = cylinder(0.045, 0.92, '#685a72');
      pole.position.y = 0.44;
      const canopy = makeMesh(new THREE.ConeGeometry(0.83, 0.38, 16, 1, true), clay('#9a8bd0'));
      canopy.position.y = 0.94;
      this.umbrella.add(pole, canopy);
      for (let index = 0; index < 8; index += 1) {
        const angle = index * Math.PI / 4;
        const scallop = ball(0.16, index % 2 ? '#f4b1b1' : '#b9a9e5', [1, 0.5, 1]);
        scallop.position.set(Math.cos(angle) * 0.67, 0.8, Math.sin(angle) * 0.67);
        this.umbrella.add(scallop);
      }
      this.roof.add(this.umbrella);
    } else if (kind === 'propeller') {
      const mast = cylinder(0.06, 0.58, '#6f6376');
      mast.position.y = 0.29;
      this.roof.add(mast);
      const rotor = new THREE.Group();
      rotor.position.y = 0.62;
      for (let index = 0; index < 3; index += 1) {
        const blade = box([1.3, 0.055, 0.16], index % 2 ? '#f6c86f' : '#80c9bb', 0.05);
        blade.rotation.y = index * Math.PI / 3;
        rotor.add(blade);
      }
      rotor.add(ball(0.13, '#f08376'));
      this.spinners.push(rotor);
      this.roof.add(rotor);
    } else {
      const mast = cylinder(0.04, 0.78, '#6d6079');
      mast.position.y = 0.37;
      mast.rotation.z = -0.18;
      const star = makeMesh(starGeometry(), new THREE.MeshStandardMaterial({ color: '#ffe68a', emissive: '#ffca55', emissiveIntensity: 0.55, roughness: 0.45 }));
      star.position.set(0.08, 0.91, 0);
      star.scale.setScalar(0.8);
      this.roof.add(mast, star);
    }
  }

  private createDriver(kind: MonsterCarBuild['driver']) {
    this.driver.position.set(0.43, 1.48, 0);
    const skin = kind === 'frog' ? '#7fc36b' : kind === 'duck' ? '#f6d66c' : kind === 'alien' ? '#a6d6bd' : '#b98967';
    const body = ball(0.32, kind === 'alien' ? '#8d81ca' : '#f4eee0', [1, 1.1, 0.9]);
    body.position.y = 0.13;
    const head = ball(kind === 'alien' ? 0.4 : 0.35, skin, kind === 'alien' ? [0.9, 1.12, 0.9] : [1, 1, 1]);
    head.position.y = 0.55;
    this.driver.add(body, head);
    for (const z of [-0.19, 0.19]) {
      const eye = ball(kind === 'alien' ? 0.075 : 0.048, '#2f3040', kind === 'alien' ? [1, 1.5, 0.5] : [1, 1, 0.6]);
      eye.position.set(0.27, 0.61, z);
      this.eyes.push(eye);
      this.driver.add(eye);
    }
    if (kind === 'bear') {
      for (const z of [-0.26, 0.26]) {
        const ear = ball(0.14, skin);
        ear.position.set(0, 0.82, z);
        this.driver.add(ear);
      }
      const muzzle = ball(0.15, '#e7c39c', [0.7, 0.7, 1]);
      muzzle.position.set(0.29, 0.48, 0);
      this.driver.add(muzzle);
    } else if (kind === 'frog') {
      for (const z of [-0.24, 0.24]) {
        const bump = ball(0.13, skin);
        bump.position.set(0.06, 0.83, z);
        this.driver.add(bump);
      }
    } else if (kind === 'duck') {
      const bill = box([0.28, 0.12, 0.34], '#ef9d56', 0.05);
      bill.position.set(0.37, 0.5, 0);
      this.driver.add(bill);
    } else {
      for (const z of [-0.15, 0.15]) {
        const antenna = cylinder(0.025, 0.3, '#7769a4');
        antenna.position.set(0, 0.99, z);
        const tip = ball(0.07, '#f1c5ed');
        tip.position.set(0, 1.16, z);
        this.driver.add(antenna, tip);
      }
    }
    const wheel = makeMesh(new THREE.TorusGeometry(0.23, 0.035, 8, 18), clay('#484453'));
    wheel.position.set(0.36, 0.18, 0);
    wheel.rotation.y = Math.PI / 2;
    this.driver.add(wheel);
  }

  update(timeSeconds: number, travelDistance: number, cue: MonsterCarFrameCar['activeCue'], reducedMotion = false) {
    const idleAmount = reducedMotion ? 0.25 : 1;
    this.visual.position.set(0, Math.sin(timeSeconds * 5 + travelDistance) * 0.018 * idleAmount, 0);
    this.visual.rotation.set(0, 0, 0);
    this.visual.scale.set(1, 1, 1);
    this.driver.rotation.set(0, 0, Math.sin(timeSeconds * 2.4) * 0.025 * idleAmount);
    this.roof.rotation.set(0, 0, 0);
    this.front.rotation.set(0, 0, 0);
    this.rear.rotation.set(0, 0, 0);
    this.umbrella.scale.setScalar(1);
    this.mushroom.scale.setScalar(1);
    this.rocketFlame.visible = false;

    for (const wheel of this.wheels) wheel.rotation.z = -travelDistance * 2.35;
    for (const rotor of this.spinners) rotor.rotation.y = timeSeconds * 7;
    const blink = Math.sin(timeSeconds * 0.73 + 1.2) > 0.985 ? 0.12 : 1;
    for (const eye of this.eyes) eye.scale.y = blink;

    if (this.build.roof === 'mushroom') this.mushroom.rotation.z = Math.sin(timeSeconds * 3) * 0.035 * idleAmount;
    if (this.build.rear === 'tail') this.tail.rotation.y = Math.sin(timeSeconds * 5) * 0.2 * idleAmount;
    if (this.build.driver === 'frog') this.driver.position.y = 1.48 + Math.abs(Math.sin(timeSeconds * 2.2)) * 0.035 * idleAmount;
    else this.driver.position.y = 1.48;

    if (!cue) return;
    const wave = Math.sin(cue.localProgress * Math.PI);
    const wiggle = Math.sin(cue.localProgress * Math.PI * 6) * (1 - cue.localProgress);
    const strength = cue.intensity * idleAmount;
    const reaction = cue.primary.reaction;

    if (['spring-bounce', 'frog-hop', 'mushroom-boing', 'scoop-hop', 'donut-roll'].includes(reaction)) {
      this.visual.position.y += wave * 1.15 * strength;
      this.visual.rotation.z = wiggle * 0.11 * strength;
    } else if (['balloon-float', 'umbrella-sail', 'propeller-flight', 'alien-float'].includes(reaction)) {
      this.visual.position.y += wave * 1.35 * strength;
      this.visual.rotation.z = Math.sin(cue.localProgress * Math.PI * 2) * 0.13 * strength;
      this.driver.rotation.z -= wave * 0.18;
    } else if (['rocket-popcorn', 'bubble-trail', 'train-toot'].includes(reaction)) {
      this.visual.position.y += Math.abs(wiggle) * 0.12;
      this.rocketFlame.visible = reaction === 'rocket-popcorn';
      this.rocketFlame.scale.setScalar(0.7 + wave * 1.3);
    } else if (['classic-bump', 'soft-squash'].includes(reaction)) {
      this.visual.position.y += wave * 0.38 * strength;
      this.visual.scale.set(1 + wave * 0.05, 1 - wave * 0.08, 1 + wave * 0.04);
    } else {
      this.visual.position.y += wave * 0.16 * strength;
      this.visual.rotation.z = wiggle * 0.065 * strength;
    }

    if (reaction === 'umbrella-open' || reaction === 'umbrella-sail') this.umbrella.scale.setScalar(1 + wave * 0.45);
    if (reaction === 'mushroom-bloom') this.mushroom.scale.setScalar(1 + wave * 0.3);
    if (reaction === 'tail-wag') this.tail.rotation.y += wiggle * 0.65;
    if (reaction === 'antenna-wobble' || reaction === 'antenna-boing') this.roof.rotation.z = wiggle * 0.25;
    if (reaction === 'duck-paddle' || reaction === 'frog-croak') this.front.rotation.z = wave * 0.12;
    if (reaction === 'propeller-flight') {
      for (const rotor of this.spinners) rotor.rotation.y = timeSeconds * 22;
    }
    this.driver.rotation.z += wave * 0.12 + wiggle * 0.06;
    if (cue.stimulus === 'water') this.driver.rotation.x = wave * 0.1;
    else this.driver.rotation.x = 0;
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}

export function componentName(build: MonsterCarBuild, slot: MonsterCarSlot) {
  return `${slot}:${build[slot]}`;
}
