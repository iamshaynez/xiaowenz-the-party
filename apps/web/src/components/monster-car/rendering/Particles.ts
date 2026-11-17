import * as THREE from 'three';
import type { MonsterCarFrameCar } from '@party/games';

interface ParticleCar {
  position: THREE.Vector3;
  cue: MonsterCarFrameCar['activeCue'];
  paint: number;
}

function hash(value: number) {
  const result = Math.sin(value * 91.733 + 17.13) * 43_758.5453;
  return result - Math.floor(result);
}

const CONFETTI = ['#ff8f7d', '#f8d56f', '#8ed1b6', '#b7a2e1', '#f6eee0'];

export class ParticleField {
  readonly mesh: THREE.InstancedMesh;
  private readonly transform = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private cursor = 0;
  private readonly capacity: number;

  constructor(detailed: boolean) {
    this.capacity = detailed ? 420 : 220;
    const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65, transparent: true, opacity: 0.86, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.065, 7, 5), material, this.capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
  }

  private add(position: THREE.Vector3, scale: number, color: string, rotation = 0) {
    if (this.cursor >= this.capacity) return;
    this.transform.position.copy(position);
    this.transform.scale.setScalar(scale);
    this.transform.rotation.set(rotation, rotation * 0.7, rotation * 1.3);
    this.transform.updateMatrix();
    this.mesh.setMatrixAt(this.cursor, this.transform.matrix);
    this.mesh.setColorAt(this.cursor, this.color.set(color));
    this.cursor += 1;
  }

  update(timeSeconds: number, focusX: number, cars: ParticleCar[], celebrating: boolean, reducedMotion: boolean) {
    this.cursor = 0;
    const time = reducedMotion ? 0 : timeSeconds;
    const ambientCount = reducedMotion ? 24 : 76;
    for (let index = 0; index < ambientCount; index += 1) {
      const span = 36;
      const x = focusX - span / 2 + ((hash(index) * span + time * (0.08 + hash(index + 3) * 0.12)) % span);
      const y = 0.8 + hash(index + 5) * 6 + Math.sin(time * 0.5 + index) * 0.35;
      const z = -4 + hash(index + 9) * 11;
      this.add(new THREE.Vector3(x, y, z), 0.38 + hash(index + 7) * 0.65, index % 3 ? '#fff1ae' : '#e7f6cf');
    }

    if (!reducedMotion) {
      for (const car of cars) {
        if (car.cue) this.addReaction(car, time);
        if (celebrating) this.addConfetti(car, time);
      }
    }
    this.mesh.count = this.cursor;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private addReaction(car: ParticleCar, time: number) {
    const cue = car.cue;
    if (!cue) return;
    const age = cue.localProgress * cue.durationMs / 1_000;
    const fade = Math.sin(cue.localProgress * Math.PI);
    const water = cue.stimulus === 'water';
    const wind = cue.stimulus === 'wind';
    const popcorn = cue.primary.reaction === 'rocket-popcorn';
    const bubbles = cue.primary.reaction === 'bubble-foam' || cue.primary.reaction === 'bubble-trail';
    const count = popcorn || bubbles ? 24 : water ? 22 : wind ? 16 : 13;
    for (let index = 0; index < count; index += 1) {
      const a = hash(index + car.paint * 71 + cue.startAtMs * 0.01);
      const b = hash(index * 3.17 + car.paint * 37);
      const c = hash(index * 7.31 + 4);
      const position = car.position.clone();
      if (water) {
        position.x += -0.8 - age * (1.2 + a * 2.4);
        position.y += 0.3 + age * (2.2 + b * 2.4) - age * age * 3.2;
        position.z += (c - 0.5) * 2.2;
      } else if (wind) {
        position.x += -2 + age * (3 + a * 3);
        position.y += 0.4 + b * 2 + Math.sin(age * 7 + index) * 0.35;
        position.z += (c - 0.5) * 4;
      } else if (popcorn || bubbles) {
        position.x += -1.8 - age * (0.7 + a);
        position.y += 1.1 + age * (1.5 + b * 2) - (popcorn ? age * age * 1.5 : 0);
        position.z += (c - 0.5) * 1.5;
      } else {
        position.x += -0.9 - age * (0.8 + a * 1.4);
        position.y += 0.2 + b * 0.5 + age * 0.3;
        position.z += (c - 0.5) * 1.8;
      }
      const color = water ? (index % 2 ? '#bceee8' : '#6fc5d2')
        : popcorn ? (index % 2 ? '#fff0ae' : '#f6b36c')
          : bubbles ? '#d5f5ee'
            : wind ? (index % 2 ? '#b5d47f' : '#f1d389')
              : '#d5ba8c';
      this.add(position, Math.max(0.05, fade) * (0.55 + a * 1.15), color, time + index);
    }
  }

  private addConfetti(car: ParticleCar, time: number) {
    for (let index = 0; index < 24; index += 1) {
      const cycle = (time * 0.22 + hash(index + car.paint * 17)) % 1;
      const position = car.position.clone();
      position.x += (hash(index * 2.3) - 0.5) * 7;
      position.y += 7 - cycle * 7;
      position.z += (hash(index * 5.1) - 0.5) * 5;
      this.add(position, 0.8 + hash(index) * 0.7, CONFETTI[index % CONFETTI.length]!, time * 2 + index);
    }
  }

  dispose() {
    this.mesh.dispose();
    this.mesh.geometry.dispose();
    if (Array.isArray(this.mesh.material)) this.mesh.material.forEach((material) => material.dispose());
    else this.mesh.material.dispose();
  }
}
