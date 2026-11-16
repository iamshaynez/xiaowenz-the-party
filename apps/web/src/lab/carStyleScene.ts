import * as THREE from 'three';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAR_STYLE_PRESETS } from './carStylePresets';
import type { CarStyleId, CarStylePreset } from './carStylePresets';

type MaterialKind = 'plain' | 'metal' | 'glow';

export class CarStyleScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly outline: OutlineEffect;
  private readonly controls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly camera = new THREE.OrthographicCamera();
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private scene = new THREE.Scene();
  private preset: CarStylePreset = CAR_STYLE_PRESETS[0]!;
  private car = new THREE.Group();
  private canopy = new THREE.Group();
  private catHead = new THREE.Group();
  private flame = new THREE.Mesh();
  private contactShadow: THREE.Mesh | null = null;
  private wheels: THREE.Group[] = [];
  private materials = new Map<string, THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private gradientMap: THREE.DataTexture | null = null;
  private motionStart: number | null = null;
  private animationFrame = 0;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label', '方轮、枕头、火箭、雨伞和小猫司机组成的标定车');
    this.renderer.domElement.setAttribute('role', 'img');
    container.appendChild(this.renderer.domElement);

    this.outline = new OutlineEffect(this.renderer, {
      defaultThickness: 0.0025,
      defaultColor: [0.12, 0.14, 0.2],
      defaultAlpha: 1,
      defaultKeepAlive: true,
    });
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enableZoom = false;
    this.controls.minPolarAngle = Math.PI / 5;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.target.set(0, 1.05, 0);

    this.setStyle(this.preset.id);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.motionStart = this.reduceMotion ? null : performance.now();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  setStyle(id: CarStyleId) {
    const preset = CAR_STYLE_PRESETS.find((item) => item.id === id);
    if (!preset) return;
    this.preset = preset;
    this.disposeScene();
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(preset.background);
    this.scene.fog = preset.id === 'toon' ? null : new THREE.Fog(preset.background, 15, 28);
    this.materials.clear();
    this.textures.clear();
    this.gradientMap = null;
    this.wheels = [];
    this.contactShadow = null;

    this.renderer.toneMapping = id === 'toon' ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = id === 'clay' ? 1.05 : 1.1;
    this.buildLights();
    this.buildStage();
    this.buildCar();
  }

  replay() {
    this.motionStart = performance.now();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    this.controls.dispose();
    this.disposeScene();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private readonly animate = (time: number) => {
    if (this.disposed) return;
    this.updateMotion(time);
    this.controls.update();
    if (this.preset.id === 'toon') {
      this.outline.render(this.scene, this.camera);
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private resize() {
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const viewHeight = aspect < 1 ? 6.2 : 5.7;
    this.camera.left = (-viewHeight * aspect) / 2;
    this.camera.right = (viewHeight * aspect) / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.near = 0.1;
    this.camera.far = 60;
    this.camera.position.set(7.2, 5.3, 8.2);
    this.camera.lookAt(this.controls.target);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private buildLights() {
    const hemisphere = new THREE.HemisphereLight(
      this.preset.id === 'clay' ? '#fff4df' : '#f4fbff',
      this.preset.ground,
      this.preset.id === 'toon' ? 1.35 : 1.8,
    );
    this.scene.add(hemisphere);

    const key = new THREE.DirectionalLight(this.preset.id === 'clay' ? '#ffe4bd' : '#ffffff', this.preset.id === 'toon' ? 2.15 : 3.2);
    key.position.set(4, 9, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -6;
    key.shadow.camera.right = 6;
    key.shadow.camera.top = 6;
    key.shadow.camera.bottom = -6;
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far = 25;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(this.preset.background, this.preset.id === 'toon' ? 0.7 : 1.1);
    fill.position.set(-6, 4, -4);
    this.scene.add(fill);
  }

  private buildStage() {
    const groundMaterial = this.preset.id === 'toon'
      ? new THREE.MeshBasicMaterial({ color: this.preset.ground, toneMapped: false })
      : this.material(this.preset.ground);
    const ground = this.mesh(
      new THREE.PlaneGeometry(80, 80),
      groundMaterial,
      this.scene,
      [0, -0.43, 0],
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    ground.castShadow = false;

    this.box([7.2, 0.38, 5.3], this.preset.platform, this.scene, [0, -0.2, 0], 0.16);
    this.box([4.6, 0.08, 4.65], this.preset.road, this.scene, [0, 0.035, 0], 0.08);

    for (const z of [-1.65, -0.55, 0.55, 1.65]) {
      this.box([0.09, 0.025, 0.48], this.preset.white, this.scene, [0, 0.09, z], 0.01);
    }

    for (const [x, z] of [[-2.75, 1.65], [2.75, -1.55]] as const) {
      this.box([0.62, 0.12, 0.62], this.preset.dark, this.scene, [x, 0.08, z], 0.05);
      this.mesh(
        new THREE.ConeGeometry(0.25, 0.72, this.preset.id === 'lowpoly' ? 5 : 16),
        this.material(this.preset.body),
        this.scene,
        [x, 0.48, z],
      );
      this.box([0.44, 0.1, 0.08], this.preset.white, this.scene, [x, 0.45, z + 0.18], 0.02);
    }

    this.box([0.7, 0.7, 0.7], this.preset.accent, this.scene, [2.85, 0.34, 1.55], 0.09);
    this.box([0.55, 0.55, 0.55], this.preset.foliage, this.scene, [-2.9, 0.27, -1.45], 0.08);

    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const context = shadowCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
      gradient.addColorStop(0, 'rgba(20, 24, 30, 0.36)');
      gradient.addColorStop(0.55, 'rgba(20, 24, 30, 0.16)');
      gradient.addColorStop(1, 'rgba(20, 24, 30, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const texture = new THREE.CanvasTexture(shadowCanvas);
    this.textures.add(texture);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.contactShadow = this.mesh(new THREE.PlaneGeometry(3.7, 3.7), shadowMaterial, this.scene, [0, 0.095, 0]);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.castShadow = false;
  }

  private buildCar() {
    this.car = new THREE.Group();
    this.scene.add(this.car);

    this.box([1.78, 0.56, 2.58], this.preset.body, this.car, [0, 0.82, 0], 0.18);
    this.box([1.62, 0.28, 1.04], this.preset.bodySecondary, this.car, [0, 1.17, 0.66], 0.11);
    this.box([1.12, 0.76, 0.2], this.preset.dark, this.car, [0, 1.34, -0.68], 0.08);
    this.box([1.18, 0.12, 0.76], this.preset.dark, this.car, [0, 1.11, -0.25], 0.04);

    for (const x of [-0.58, 0.58]) {
      this.sphere(0.14, this.preset.accent, this.car, [x, 0.91, 1.31]);
    }

    this.buildWheels();
    this.buildPillow();
    this.buildDriver();
    this.buildRocket();
    this.buildUmbrella();
  }

  private buildWheels() {
    for (const x of [-1.01, 1.01]) {
      for (const z of [-0.84, 0.84]) {
        const wheel = new THREE.Group();
        wheel.position.set(x, 0.51, z);
        this.car.add(wheel);
        this.box([0.36, 0.84, 0.84], this.preset.dark, wheel, [0, 0, 0], 0.1);
        const hub = this.mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.39, this.preset.id === 'lowpoly' ? 8 : 20),
          this.material(this.preset.accent),
          wheel,
          [0, 0, 0],
        );
        hub.rotation.z = Math.PI / 2;
        this.wheels.push(wheel);
      }
    }
  }

  private buildPillow() {
    this.box([1.55, 0.6, 0.42], this.preset.canopy, this.car, [0, 0.82, 1.5], 0.2);
    for (const x of [-0.38, 0.38]) {
      this.sphere(0.05, this.preset.bodySecondary, this.car, [x, 0.82, 1.72]);
    }
  }

  private buildDriver() {
    this.sphere(0.32, this.preset.accent, this.car, [0, 1.42, -0.15]);
    this.catHead = new THREE.Group();
    this.catHead.position.set(0, 1.82, -0.06);
    this.car.add(this.catHead);
    this.sphere(0.4, this.preset.accent, this.catHead, [0, 0, 0]);

    for (const x of [-0.23, 0.23]) {
      const ear = this.mesh(
        new THREE.ConeGeometry(0.18, 0.38, this.preset.id === 'lowpoly' ? 4 : 12),
        this.material(this.preset.accent),
        this.catHead,
        [x, 0.34, -0.02],
      );
      ear.rotation.z = x < 0 ? 0.12 : -0.12;
      this.sphere(0.047, this.preset.dark, this.catHead, [x * 0.58, 0.055, 0.37]);
    }
    this.sphere(0.055, this.preset.body, this.catHead, [0, -0.06, 0.4]);

    for (const x of [-0.25, 0.25]) {
      const whisker = this.mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 0.34, 5),
        this.material(this.preset.dark),
        this.catHead,
        [x, -0.1, 0.34],
      );
      whisker.rotation.z = Math.PI / 2 + (x < 0 ? -0.12 : 0.12);
    }

    const steering = this.mesh(
      new THREE.TorusGeometry(0.25, 0.035, 6, this.preset.id === 'lowpoly' ? 12 : 24),
      this.material(this.preset.dark),
      this.car,
      [0, 1.37, 0.4],
    );
    steering.rotation.x = -0.25;
    for (const x of [-0.2, 0.2]) {
      this.sphere(0.095, this.preset.accent, this.car, [x, 1.43, 0.34]);
    }
  }

  private buildRocket() {
    const rocket = new THREE.Group();
    rocket.position.set(0, 0.87, -1.52);
    this.car.add(rocket);
    const barrel = this.mesh(
      new THREE.CylinderGeometry(0.31, 0.36, 0.92, this.preset.id === 'lowpoly' ? 8 : 20),
      this.material(this.preset.rocket, 'metal'),
      rocket,
      [0, 0, 0],
    );
    barrel.rotation.x = Math.PI / 2;
    const nozzle = this.mesh(
      new THREE.CylinderGeometry(0.23, 0.3, 0.24, this.preset.id === 'lowpoly' ? 8 : 20),
      this.material(this.preset.dark, 'metal'),
      rocket,
      [0, 0, -0.55],
    );
    nozzle.rotation.x = Math.PI / 2;
    for (const x of [-0.36, 0.36]) {
      this.box([0.16, 0.44, 0.52], this.preset.bodySecondary, rocket, [x, -0.03, -0.12], 0.04);
    }
    this.flame = this.mesh(
      new THREE.ConeGeometry(0.24, 0.7, this.preset.id === 'lowpoly' ? 6 : 16),
      this.material(this.preset.accent, 'glow'),
      rocket,
      [0, 0, -0.95],
    );
    this.flame.rotation.x = -Math.PI / 2;
  }

  private buildUmbrella() {
    const pole = this.mesh(
      new THREE.CylinderGeometry(0.032, 0.032, 1.6, 8),
      this.material(this.preset.dark, 'metal'),
      this.car,
      [0.58, 1.69, -0.2],
    );
    pole.castShadow = false;

    this.canopy = new THREE.Group();
    this.canopy.position.set(0.58, 2.47, -0.2);
    this.car.add(this.canopy);
    const panelCount = 8;
    for (let index = 0; index < panelCount; index += 1) {
      const geometry = new THREE.SphereGeometry(
        1.06,
        this.preset.id === 'lowpoly' ? 3 : 8,
        this.preset.id === 'clay' ? 6 : 4,
        (index / panelCount) * Math.PI * 2,
        (Math.PI * 2) / panelCount,
        0,
        Math.PI / 2,
      );
      this.mesh(
        geometry,
        this.material(index % 2 === 0 ? this.preset.body : this.preset.canopy),
        this.canopy,
        [0, 0, 0],
      );
    }
    this.sphere(0.07, this.preset.accent, this.canopy, [0, 1.05, 0]);
    const rim = this.mesh(
      new THREE.TorusGeometry(1.055, 0.025, 5, this.preset.id === 'lowpoly' ? 16 : 40),
      this.material(this.preset.dark),
      this.canopy,
      [0, 0, 0],
    );
    rim.rotation.x = Math.PI / 2;
  }

  private updateMotion(time: number) {
    const elapsed = this.motionStart === null ? 0 : (time - this.motionStart) / 1000;
    const t = this.reduceMotion ? Math.min(elapsed, 6.99) : elapsed % 7;
    const bump = t < 2.1 ? Math.abs(Math.sin(t * 8)) * 0.075 : 0;
    const jumpProgress = THREE.MathUtils.clamp((t - 2.15) / 1.75, 0, 1);
    const jumping = t >= 2.15 && t <= 3.9;
    const jump = jumping ? Math.sin(jumpProgress * Math.PI) * 1.18 : 0;
    const landing = t > 3.9 && t < 4.8 ? Math.sin(((t - 3.9) / 0.9) * Math.PI * 3) * (4.8 - t) * 0.11 : 0;

    this.car.position.y = bump + jump + landing;
    this.car.rotation.z = jumping ? Math.sin(jumpProgress * Math.PI) * -0.17 : Math.sin(t * 5) * bump * 0.25;
    this.car.rotation.x = jumping ? Math.sin(jumpProgress * Math.PI * 2) * 0.075 : 0;
    this.catHead.rotation.z = Math.sin(time * 0.006) * 0.055 + this.car.rotation.z * -0.8;

    for (const wheel of this.wheels) {
      wheel.rotation.x = -time * 0.0025;
    }

    const opening = THREE.MathUtils.smoothstep(t, 2.55, 3.15);
    const closing = 1 - THREE.MathUtils.smoothstep(t, 5.4, 6.25);
    const open = Math.max(0.12, opening * closing);
    this.canopy.scale.x = open;
    this.canopy.scale.z = open;
    this.canopy.rotation.y = Math.sin(time * 0.0018) * 0.08;
    this.flame.scale.y = 0.72 + Math.sin(time * 0.025) * 0.2 + (t > 1.8 && t < 3.4 ? 0.55 : 0);

    if (this.contactShadow) {
      const shadowScale = 1 - jump * 0.22;
      this.contactShadow.scale.setScalar(shadowScale);
      const material = this.contactShadow.material as THREE.MeshBasicMaterial;
      material.opacity = 1 - jump * 0.45;
    }
  }

  private material(color: string, kind: MaterialKind = 'plain'): THREE.Material {
    const key = `${color}:${kind}`;
    const cached = this.materials.get(key);
    if (cached) return cached;

    let material: THREE.Material;
    if (this.preset.id === 'toon') {
      if (!this.gradientMap) {
        this.gradientMap = new THREE.DataTexture(new Uint8Array([70, 135, 205, 255]), 4, 1, THREE.RedFormat);
        this.gradientMap.minFilter = THREE.NearestFilter;
        this.gradientMap.magFilter = THREE.NearestFilter;
        this.gradientMap.generateMipmaps = false;
        this.gradientMap.needsUpdate = true;
        this.textures.add(this.gradientMap);
      }
      material = new THREE.MeshToonMaterial({
        color,
        gradientMap: this.gradientMap,
        emissive: kind === 'glow' ? color : '#000000',
        emissiveIntensity: kind === 'glow' ? 0.35 : 0,
      });
    } else {
      material = new THREE.MeshStandardMaterial({
        color,
        roughness: this.preset.id === 'clay' ? 0.93 : kind === 'metal' ? 0.42 : 0.68,
        metalness: kind === 'metal' ? 0.32 : 0,
        flatShading: this.preset.id === 'lowpoly',
        emissive: kind === 'glow' ? color : '#000000',
        emissiveIntensity: kind === 'glow' ? 0.32 : 0,
      });
    }
    this.materials.set(key, material);
    return material;
  }

  private box(
    size: [number, number, number],
    color: string,
    parent: THREE.Object3D,
    position: [number, number, number],
    radius: number,
  ) {
    const [width, height, depth] = size;
    const geometry = this.preset.id === 'lowpoly'
      ? new THREE.BoxGeometry(width, height, depth)
      : new RoundedBoxGeometry(width, height, depth, this.preset.id === 'clay' ? 4 : 2, radius);
    return this.mesh(geometry, this.material(color), parent, position);
  }

  private sphere(radius: number, color: string, parent: THREE.Object3D, position: [number, number, number]) {
    const widthSegments = this.preset.id === 'lowpoly' ? 8 : this.preset.id === 'clay' ? 24 : 16;
    const heightSegments = this.preset.id === 'lowpoly' ? 5 : this.preset.id === 'clay' ? 14 : 10;
    return this.mesh(
      new THREE.SphereGeometry(radius, widthSegments, heightSegments),
      this.material(color),
      parent,
      position,
    );
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    parent: THREE.Object3D,
    position: [number, number, number],
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private disposeScene() {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.materials.clear();
    this.textures.clear();
    this.gradientMap = null;
    this.scene.clear();
  }
}
