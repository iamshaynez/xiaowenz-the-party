import * as THREE from 'three';
import type { MonsterCarBuild } from '@party/protocol';
import { sampleMonsterCarFrame } from '@party/games';
import type { MonsterCarRacePlan, MonsterCarRaceFrame } from '@party/games';
import { CarAssembly } from './CarAssembly';
import { CourseVisual } from './CourseVisual';
import { ParticleField } from './Particles';
import { sampleCourse, COURSE_LENGTH } from './courseMath';
import { sampleReactionPose } from './ReactionLibrary';
import { FireworksField } from './FireworksField';
import { WeatherField } from './WeatherField';
import type { CarIdentity } from './presentation/CarIdentity';
import type { MonsterCarShowPlan } from './presentation/ShowPlan';
import { samplePerformanceCue } from './presentation/ReactionPerformance';
import { sampleSocialMoment, sampleSocialPose } from './presentation/SocialMoments';
import type { SocialPose } from './presentation/SocialMoments';
import { sampleRaceCamera } from './presentation/RaceCamera';
import { sampleFinaleMotion } from './presentation/FinaleMotion';
import { samplePlaygroundCamera } from './PlaygroundCamera';
import type { MonsterCarRenderScene } from './RenderSurface';

function material(color: string, roughness = 0.82) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    if (Array.isArray(object.material)) object.material.forEach((item) => materials.add(item));
    else materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((item) => item.dispose());
}

export class MonsterCarWorld implements MonsterCarRenderScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 400);
  private readonly root = new THREE.Group();
  private readonly cars = new Map<string, CarAssembly>();
  private readonly shadows = new Map<string, THREE.Mesh>();
  private readonly sun = new THREE.DirectionalLight('#ffd5a0', 3.1);
  private readonly sunTarget = new THREE.Object3D();
  private mode: 'empty' | 'garage' | 'race' = 'empty';
  private garage: THREE.Group | null = null;
  private garageCar: CarAssembly | null = null;
  private garageSignature = '';
  private garagePresentationSignature = '';
  private garagePaint = 0;
  private garageYaw = -0.35;
  private course: CourseVisual | null = null;
  private particles: ParticleField | null = null;
  private fireworks: FireworksField | null = null;
  private plan: MonsterCarRacePlan | null = null;
  private show: MonsterCarShowPlan | null = null;
  private weather: WeatherField | null = null;
  private photoMode = false;
  private viewerId = '';
  private raceStartsAt = 0;
  private celebrating = false;
  private frameListener: ((frame: MonsterCarRaceFrame) => void) | null = null;
  private lastHudTick = -1;
  private aspect = 1;
  private width = 1;
  private height = 1;

  constructor() {
    this.scene.add(this.root);
    const hemisphere = new THREE.HemisphereLight('#c8e6e0', '#596348', 2.15);
    this.scene.add(hemisphere);
    const fill = new THREE.DirectionalLight('#b7c9ed', 0.85);
    fill.position.set(-8, 7, -10);
    this.scene.add(fill);
    this.sun.position.set(-8, 18, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -18;
    this.sun.shadow.camera.right = 18;
    this.sun.shadow.camera.top = 18;
    this.sun.shadow.camera.bottom = -18;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 75;
    this.sun.shadow.bias = -0.0008;
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun, this.sunTarget);
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.aspect = this.width / this.height;
    this.updateProjection(7);
  }

  private updateProjection(halfWidth: number) {
    const halfHeight = halfWidth / this.aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  setGarage(
    build: MonsterCarBuild,
    paint: number,
    presentation: { identity: CarIdentity; avatar: string; isOwn: boolean },
  ) {
    const presentationSignature = JSON.stringify(presentation);
    const signature = JSON.stringify({ build, paint, presentation });
    if (this.mode === 'garage' && signature === this.garageSignature) return;
    if (
      this.mode === 'garage' && this.garageCar && this.garagePaint === paint
      && this.garagePresentationSignature === presentationSignature
    ) {
      for (const slot of ['wheels', 'front', 'rear', 'roof', 'driver'] as const) {
        if (this.garageCar.build[slot] !== build[slot]) this.garageCar.setPart(slot, build[slot]);
      }
      this.garageSignature = signature;
      return;
    }
    if (this.mode !== 'garage') {
      this.clearWorld();
      this.mode = 'garage';
      this.scene.fog = new THREE.FogExp2('#b8d5bd', 0.022);
      this.scene.background = new THREE.Color('#b9d7c3');
      this.createGarage();
    }
    this.garageSignature = signature;
    this.garagePresentationSignature = presentationSignature;
    this.garagePaint = paint;
    if (this.garageCar) {
      this.root.remove(this.garageCar.root);
      this.garageCar.dispose();
    }
    this.garageCar = new CarAssembly(build, paint, presentation);
    this.garageCar.root.position.set(0, 0.32, 0);
    this.garageCar.root.scale.setScalar(1.15);
    this.root.add(this.garageCar.root);
  }

  private createGarage() {
    this.garage = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.1, 0.42, 64), material('#789d78'));
    floor.position.y = -0.08;
    floor.receiveShadow = true;
    this.garage.add(floor);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 3.7, 0.28, 64), material('#e6cf9f'));
    platform.position.y = 0.17;
    platform.receiveShadow = true;
    this.garage.add(platform);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.055, 8, 64), material('#fff0ba'));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.34;
    this.garage.add(ring);

    const trunkMaterial = material('#7b604a');
    const greens = ['#427665', '#5f9274', '#78a879'];
    for (let index = 0; index < 14; index += 1) {
      const angle = Math.PI + index / 13 * Math.PI;
      const distance = 4.8 + (index % 3) * 0.65;
      const scale = 0.65 + (index % 4) * 0.14;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.7, 7), trunkMaterial);
      trunk.position.set(Math.cos(angle) * distance, 0.8 * scale, Math.sin(angle) * distance);
      trunk.scale.setScalar(scale);
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), material(greens[index % greens.length]!));
      crown.position.copy(trunk.position);
      crown.position.y += 1.2 * scale;
      crown.scale.setScalar(scale);
      crown.castShadow = true;
      this.garage.add(trunk, crown);
    }
    this.root.add(this.garage);
    this.particles = new ParticleField(this.width > 720);
    this.root.add(this.particles.mesh);
    this.camera.position.set(6.5, 5.3, 10.5);
    this.camera.lookAt(0, 1.2, 0);
    this.updateProjection(this.aspect < 0.85 ? 6.7 : 5.6);
    this.sun.position.set(-7, 15, 9);
    this.sun.intensity = 3.1;
    this.sunTarget.position.set(0, 0, 0);
  }

  setRace(
    plan: MonsterCarRacePlan,
    raceStartsAt: number,
    options: { show: MonsterCarShowPlan; celebrating: boolean; photoMode: boolean; viewerId: string },
  ) {
    if (this.mode !== 'race' || this.plan?.id !== plan.id) {
      this.clearWorld();
      this.mode = 'race';
      this.plan = plan;
      this.show = options.show;
      this.raceStartsAt = raceStartsAt;
      this.scene.background = new THREE.Color(options.show.story.backgroundColor);
      this.scene.fog = new THREE.FogExp2(options.show.story.fogColor, 0.012);
      this.sun.color.set(options.show.story.sunColor);
      this.course = new CourseVisual(plan, this.width > 720, options.show.story);
      this.root.add(this.course.group);
      this.weather = new WeatherField(options.show.story, this.width > 720);
      this.root.add(this.weather.points);
      for (const racer of plan.racers) {
        const identity = options.show.identities[racer.playerId];
        const presentation = identity ? {
          identity,
          avatar: options.show.avatars[racer.playerId] ?? '🚗',
          isOwn: racer.playerId === options.viewerId,
        } : undefined;
        const car = new CarAssembly(racer.build, racer.paint, presentation);
        car.root.scale.setScalar(0.82);
        this.cars.set(racer.playerId, car);
        this.root.add(car.root);
        const shadow = new THREE.Mesh(
          new THREE.CircleGeometry(1.45, 24),
          new THREE.MeshBasicMaterial({ color: '#273e35', transparent: true, opacity: 0.22, depthWrite: false }),
        );
        shadow.rotation.x = -Math.PI / 2;
        shadow.scale.y = 0.62;
        this.shadows.set(racer.playerId, shadow);
        this.root.add(shadow);
      }
      this.particles = new ParticleField(this.width > 720);
      this.root.add(this.particles.mesh);
    }
    this.show = options.show;
    this.photoMode = options.photoMode;
    this.viewerId = options.viewerId;
    this.celebrating = options.celebrating;
    if (options.celebrating && !this.fireworks) {
      this.fireworks = new FireworksField(this.width > 720, this.show?.finaleSeed);
      this.root.add(this.fireworks.points);
    }
  }

  rotateGarage(delta: number) {
    if (Number.isFinite(delta)) this.garageYaw += delta;
  }

  preferredFrameIntervalMs() {
    return this.celebrating ? 33 : 0;
  }

  setFrameListener(listener: ((frame: MonsterCarRaceFrame) => void) | null) {
    this.frameListener = listener;
  }

  update(timeSeconds: number, reducedMotion: boolean) {
    if (this.mode === 'garage') {
      if (this.garageCar) {
        this.garageCar.root.rotation.y = this.garageYaw + Math.sin(timeSeconds * 0.32) * (reducedMotion ? 0 : 0.09);
        this.garageCar.update(timeSeconds, 0, null, reducedMotion);
      }
      this.particles?.update(timeSeconds, 0, [], false, reducedMotion);
      return;
    }
    if (this.mode !== 'race' || !this.plan) return;
    const show = this.show;
    if (!show) return;
    const rawElapsed = Math.max(0, timeSeconds * 1_000 - this.raceStartsAt);
    const elapsed = Math.min(this.plan.durationMs, rawElapsed);
    const frame = sampleMonsterCarFrame(this.plan, elapsed);
    const hudTick = Math.floor(elapsed / 125);
    if (hudTick !== this.lastHudTick) {
      this.lastHudTick = hudTick;
      this.frameListener?.(frame);
    }

    if (this.celebrating) {
      const celebrationMs = Math.max(0, rawElapsed - this.plan.durationMs);
      const playgroundCars = sampleFinaleMotion(this.plan, celebrationMs, reducedMotion);
      const finish = sampleCourse(1);
      const centerX = COURSE_LENGTH + 5;
      const cameraPose = samplePlaygroundCamera(
        playgroundCars,
        this.aspect,
        this.photoMode ? 'photo' : 'results',
        playgroundCars.some((pose) => pose.photo),
      );
      const particleCars: { position: THREE.Vector3; cue: null; paint: number }[] = [];
      for (const pose of playgroundCars) {
        const car = this.cars.get(pose.playerId);
        const racer = this.plan.racers.find((entry) => entry.playerId === pose.playerId);
        if (!car || !racer) continue;
        car.root.position.set(pose.position.x, pose.position.y, pose.position.z);
        car.root.rotation.set(0, pose.yaw, pose.pitch);
        car.update(timeSeconds, pose.travelDistance, null, reducedMotion, pose.celebration);
        const shadow = this.shadows.get(pose.playerId);
        if (shadow) {
          shadow.position.set(pose.position.x, pose.position.y - pose.jump + 0.14, pose.position.z);
          shadow.scale.set(1 + pose.jump * 0.3, 0.62 + pose.jump * 0.1, 1);
          (shadow.material as THREE.MeshBasicMaterial).opacity = Math.max(0.08, 0.22 - pose.jump * 0.12);
        }
        particleCars.push({ position: car.root.position.clone(), cue: null, paint: racer.paint });
      }
      this.updateProjection(cameraPose.halfWidth);
      this.camera.position.set(
        cameraPose.targetX + cameraPose.offsetX,
        cameraPose.targetY + cameraPose.offsetY,
        cameraPose.targetZ + cameraPose.offsetZ,
      );
      this.camera.lookAt(cameraPose.targetX, cameraPose.targetY, cameraPose.targetZ);
      this.sun.position.set(centerX - 9, finish.y + 19, finish.z + 12);
      this.sun.intensity = 2.15;
      this.sunTarget.position.set(centerX, finish.y, finish.z);
      this.course?.update(timeSeconds, reducedMotion, celebrationMs / 1_000);
      this.weather?.update(timeSeconds, cameraPose.targetX, reducedMotion);
      this.particles?.update(timeSeconds, centerX, particleCars, true, reducedMotion);
      this.fireworks?.update(celebrationMs / 1_000, reducedMotion, playgroundCars.some((pose) => pose.photo) ? 0.55 : 1);
      return;
    }

    const socialMoment = sampleSocialMoment(show, rawElapsed);
    const particleCars: { position: THREE.Vector3; cue: (typeof frame.cars)[number]['activeCue']; paint: number }[] = [];

    for (const carFrame of frame.cars) {
      const car = this.cars.get(carFrame.playerId);
      const racer = this.plan.racers.find((entry) => entry.playerId === carFrame.playerId);
      if (!car || !racer) continue;
      const visualCue = samplePerformanceCue(racer, rawElapsed, reducedMotion);
      const point = sampleCourse(carFrame.progress);
      const reactionPose = visualCue
        ? sampleReactionPose({ ...visualCue.primary, intensity: visualCue.intensity }, visualCue.stimulus, visualCue.localProgress, reducedMotion)
        : null;
      const socialPose = socialMoment && (socialMoment.actor === carFrame.playerId || socialMoment.target === carFrame.playerId)
        ? sampleSocialPose(socialMoment, rawElapsed)
        : undefined;
      const launch = rawElapsed < 900 ? Math.sin(rawElapsed / 900 * Math.PI) : 0;
      const carX = point.x + (reactionPose?.forward ?? 0) + launch * 0.28;
      car.root.position.set(carX, point.y + 0.04, point.z + carFrame.lane * 1.18);
      car.root.rotation.set(0, point.yaw, point.pitch);
      car.update(timeSeconds, point.x, visualCue, reducedMotion, 0, visualCue?.performance, socialPose);
      const shadow = this.shadows.get(carFrame.playerId);
      if (shadow) {
        shadow.position.set(carX, point.y + 0.075, point.z + carFrame.lane * 1.18);
        const lift = reactionPose?.lift ?? 0;
        shadow.scale.set(1 + lift * 0.25, 0.62 + lift * 0.1, 1);
        const shadowMaterial = shadow.material as THREE.MeshBasicMaterial;
        shadowMaterial.opacity = Math.max(0.07, 0.22 - lift * 0.08);
      }
      particleCars.push({ position: car.root.position.clone(), cue: visualCue, paint: racer.paint });
    }

    const cameraPose = sampleRaceCamera(show, rawElapsed, frame, this.aspect, reducedMotion);
    this.updateProjection(cameraPose.halfWidth);
    this.camera.position.set(
      cameraPose.targetX + cameraPose.offsetX,
      cameraPose.targetY + cameraPose.offsetY,
      cameraPose.targetZ + cameraPose.offsetZ,
    );
    this.camera.lookAt(cameraPose.targetX, cameraPose.targetY, cameraPose.targetZ);
    this.sun.position.set(cameraPose.targetX - 9, cameraPose.targetY + 19, cameraPose.targetZ + 12);
    this.sun.intensity = 3.1;
    this.sunTarget.position.set(cameraPose.targetX, cameraPose.targetY, cameraPose.targetZ);
    this.course?.update(timeSeconds, reducedMotion);
    this.weather?.update(timeSeconds, cameraPose.targetX, reducedMotion);
    this.particles?.update(timeSeconds, cameraPose.targetX, particleCars, this.celebrating || elapsed > 28_500, reducedMotion);
  }

  private clearWorld() {
    if (this.garage) disposeGroup(this.garage);
    this.garageCar?.dispose();
    this.garage = null;
    this.garageCar = null;
    this.garageSignature = '';
    this.garagePresentationSignature = '';
    this.course?.dispose();
    this.course = null;
    for (const car of this.cars.values()) car.dispose();
    this.cars.clear();
    for (const shadow of this.shadows.values()) {
      shadow.geometry.dispose();
      if (Array.isArray(shadow.material)) shadow.material.forEach((item) => item.dispose());
      else shadow.material.dispose();
    }
    this.shadows.clear();
    this.particles?.dispose();
    this.particles = null;
    this.fireworks?.dispose();
    this.fireworks = null;
    this.weather?.dispose();
    this.weather = null;
    this.root.clear();
    this.plan = null;
    this.show = null;
    this.photoMode = false;
    this.viewerId = '';
    this.celebrating = false;
  }

  dispose() {
    this.clearWorld();
    this.scene.clear();
    this.sun.shadow.map?.dispose();
  }
}
