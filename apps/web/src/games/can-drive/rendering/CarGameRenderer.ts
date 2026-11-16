import * as THREE from 'three';
import { CLAY_ENVIRONMENT_FACTORIES } from './environments';
import { CarAssembly } from './CarAssembly';
import { ClayGeometryKit } from './geometry';
import { CLAY_PRESET } from './clayPreset';
import { poseForShow } from './showPose';
import type { ClayCarBuild, ClayEnvironmentId, ClayEnvironmentVisual, CarVisualPose } from './types';
import type { PublicCarShowPlan } from '@party/games';

type Mode = 'garage' | 'show' | 'award' | 'group';

export class CarGameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly resizeObserver: ResizeObserver;
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly geometries = new Set<THREE.BufferGeometry>();
  private readonly materials = new Set<THREE.Material>();
  private readonly textures = new Set<THREE.Texture>();
  private mode: Mode = 'garage';
  private garageKey = '';
  private groupKey = '';
  private assembly: CarAssembly | null = null;
  private groupAssemblies: CarAssembly[] = [];
  private environment: ClayEnvironmentVisual | null = null;
  private environmentKit: ClayGeometryKit | null = null;
  private environmentId: ClayEnvironmentId | null = null;
  private plan: PublicCarShowPlan | null = null;
  private showStartedAt = 0;
  private showKey = '';
  private animationFrame = 0;
  private lastFrameAt = 0;
  private disposed = false;
  private contextLost = false;
  private forcedTime: number | null = null;

  constructor(private readonly container: HTMLElement, private readonly onError: (message: string | null) => void) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('role', 'img');
    this.renderer.domElement.setAttribute('aria-label', '黏土怪车三维舞台');
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.contextDidLose);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.contextDidRestore);

    this.scene.background = new THREE.Color(CLAY_PRESET.background);
    this.scene.fog = new THREE.Fog(CLAY_PRESET.background, 15, 28);
    this.buildLights();
    this.buildBaseStage();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    this.resize();
    if (!this.reduceMotion) this.animationFrame = requestAnimationFrame(this.animate);
  }

  setGarage(build: ClayCarBuild) {
    const key = JSON.stringify(build);
    if (this.mode === 'garage' && this.garageKey === key) return;
    this.garageKey = key;
    this.mode = 'garage';
    this.plan = null;
    this.showKey = '';
    this.clearEnvironment();
    this.clearGroup();
    this.ensureAssembly().setBuild(build);
    this.setCamera([7.2, 5.3, 8.2], [0, 1.05, 0]);
    this.renderStill();
  }

  setShow(plan: PublicCarShowPlan, startedAt: number, celebration: boolean) {
    const key = `${plan.seed}:${startedAt}:${celebration}`;
    this.mode = celebration ? 'award' : 'show';
    if (this.showKey !== key) {
      this.showKey = key;
      this.plan = plan;
      this.showStartedAt = startedAt;
      this.clearGroup();
      this.ensureAssembly().setBuild(plan.build);
      this.environmentId = null;
    }
    this.renderStill();
  }

  setGroup(cars: Array<{ playerId: string; build: ClayCarBuild }>) {
    const key = JSON.stringify(cars.map((car) => [car.playerId, car.build]));
    if (this.mode === 'group' && this.groupKey === key) return;
    this.groupKey = key;
    this.mode = 'group';
    this.plan = null;
    this.showKey = '';
    this.clearEnvironment();
    if (this.assembly) {
      this.scene.remove(this.assembly.root);
      this.assembly.dispose();
      this.assembly = null;
    }
    this.clearGroup();
    const columns = cars.length <= 2 ? Math.max(1, cars.length) : 3;
    const rows = Math.ceil(cars.length / Math.max(1, columns));
    cars.forEach((car, index) => {
      const assembly = new CarAssembly();
      assembly.setBuild(car.build);
      const column = index % columns;
      const row = Math.floor(index / columns);
      assembly.root.position.set((column - (columns - 1) / 2) * 2.8, 0, (row - (rows - 1) / 2) * 2.5);
      assembly.root.rotation.y = row === 0 ? -0.12 : 0.12;
      this.scene.add(assembly.root);
      this.groupAssemblies.push(assembly);
    });
    this.setCamera([8.5, 6.6, 10], [0, 1, 0]);
    this.renderStill();
  }

  renderAt(atMs: number) {
    this.forcedTime = atMs;
    this.renderStill();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.contextDidLose);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.contextDidRestore);
    this.clearEnvironment();
    if (this.assembly) this.assembly.dispose();
    this.clearGroup();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly animate = (time: number) => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.animate);
    if (this.contextLost || document.hidden || time - this.lastFrameAt < 33) return;
    this.lastFrameAt = time;
    this.renderFrame(time);
  };

  private renderFrame(time: number) {
    if (this.mode === 'garage') {
      this.assembly?.update({
        position: [0, Math.sin(time * 0.002) * 0.025, 0],
        rotation: [0, 0, 0],
        speed: 0,
        wheelSpin: time * 0.0005,
        activation: { driver: 0.2, motion: 0.25, front: 0.15, rear: 0.35, roof: 0.2 },
        driverReaction: 'drive',
        timeMs: time,
      });
    } else if ((this.mode === 'show' || this.mode === 'award') && this.plan) {
      const elapsed = this.elapsedFor(this.plan, time);
      const environment = this.environmentAt(this.plan, elapsed);
      if (environment && environment.id !== this.environmentId) this.setEnvironment(environment.id);
      const visualPose = poseForShow(this.plan, elapsed, this.mode === 'award');
      this.assembly?.update(visualPose);
      if (this.environment) {
        const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
        const follow = aspect < 1 ? 0.86 : 0.55;
        const followZ = visualPose.position[2] * follow;
        const camera = this.environment.camera;
        this.setCamera(
          [camera.position[0], camera.position[1], camera.position[2] + followZ],
          [camera.target[0], camera.target[1] + visualPose.position[1] * 0.2, camera.target[2] + followZ],
        );
      }
      this.environment?.update?.(elapsed);
    } else if (this.mode === 'group') {
      for (const [index, assembly] of this.groupAssemblies.entries()) {
        assembly.update({
          position: [assembly.root.position.x, Math.sin(time * 0.002 + index) * 0.035, assembly.root.position.z],
          rotation: [0, assembly.root.rotation.y, 0],
          speed: 0,
          wheelSpin: 0,
          activation: { driver: 1, motion: 0, front: 0.2, rear: 0.25, roof: 0.2 },
          driverReaction: index % 2 === 0 ? 'cheer' : 'wave',
          timeMs: time,
        });
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  private renderStill() {
    if (this.disposed || this.contextLost) return;
    const time = this.forcedTime ?? (this.mode === 'show' || this.mode === 'award' ? Date.now() : performance.now());
    this.renderFrame(time);
  }

  private elapsedFor(plan: PublicCarShowPlan, time: number) {
    if (this.forcedTime !== null) return this.forcedTime;
    const elapsed = Math.max(0, time - this.showStartedAt);
    if (this.mode === 'award') {
      const duration = Math.max(400, plan.highlight.endMs - plan.highlight.startMs);
      return plan.highlight.startMs + (elapsed % duration);
    }
    return Math.min(plan.durationMs, elapsed);
  }

  private environmentAt(plan: PublicCarShowPlan, atMs: number) {
    return plan.environments.find((environment, index) => atMs < environment.endMs || index === plan.environments.length - 1);
  }

  private ensureAssembly() {
    if (!this.assembly) {
      this.assembly = new CarAssembly();
      this.scene.add(this.assembly.root);
    }
    return this.assembly;
  }

  private setEnvironment(id: ClayEnvironmentId) {
    this.clearEnvironment();
    const factory = CLAY_ENVIRONMENT_FACTORIES[id];
    this.environmentKit = new ClayGeometryKit();
    this.environment = factory(this.environmentKit);
    this.environmentId = id;
    this.scene.add(this.environment.root);
    this.setCamera(this.environment.camera.position, this.environment.camera.target);
  }

  private clearEnvironment() {
    if (this.environment) this.scene.remove(this.environment.root);
    this.environment = null;
    this.environmentId = null;
    this.environmentKit?.dispose();
    this.environmentKit = null;
  }

  private clearGroup() {
    for (const assembly of this.groupAssemblies) {
      this.scene.remove(assembly.root);
      assembly.dispose();
    }
    this.groupAssemblies = [];
  }

  private buildLights() {
    const hemisphere = new THREE.HemisphereLight('#fff4df', CLAY_PRESET.ground, 1.8);
    this.scene.add(hemisphere);
    const key = new THREE.DirectionalLight('#ffe4bd', 3.2);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 25;
    key.shadow.bias = -0.0004;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(CLAY_PRESET.background, 1.1);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);
  }

  private buildBaseStage() {
    const groundMaterial = new THREE.MeshStandardMaterial({ color: CLAY_PRESET.ground, roughness: 0.93 });
    const groundGeometry = new THREE.PlaneGeometry(80, 80);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.43;
    ground.receiveShadow = true;
    this.scene.add(ground);
    this.geometries.add(groundGeometry);
    this.materials.add(groundMaterial);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const context = shadowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(20, 24, 30, 0.3)');
      gradient.addColorStop(1, 'rgba(20, 24, 30, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(shadowCanvas);
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const geometry = new THREE.PlaneGeometry(3.8, 3.8);
    const shadow = new THREE.Mesh(geometry, material);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.06;
    this.scene.add(shadow);
    this.geometries.add(geometry);
    this.materials.add(material);
    this.textures.add(texture);
  }

  private setCamera(position: readonly [number, number, number], target: readonly [number, number, number]) {
    this.camera.position.set(...position);
    this.camera.lookAt(...target);
  }

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const viewHeight = this.mode === 'group' ? 7.2 : aspect < 1 ? 6.2 : 5.7;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.near = 0.1;
    this.camera.far = 60;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderStill();
  }

  private readonly visibilityChanged = () => {
    this.lastFrameAt = 0;
    if (!document.hidden) this.renderStill();
  };

  private readonly contextDidLose = (event: Event) => {
    event.preventDefault();
    this.contextLost = true;
    this.onError('三维舞台暂时失去了图形连接，正在等待恢复。');
  };

  private readonly contextDidRestore = () => {
    this.contextLost = false;
    this.onError(null);
    this.renderStill();
  };
}
