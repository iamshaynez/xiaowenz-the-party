import * as THREE from 'three';
import { groundGlowTexture } from './textures';

// ---------------------------------------------------------------------------
// 桌面游戏共享舞台：暖色俱乐部灯光、柔地面、机位阻尼相机与 WebGL 宿主。
// 所有棋牌场景都长在这套骨架上，保证四款游戏观感统一而精致。
// ---------------------------------------------------------------------------

export interface TabletopScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  resize(width: number, height: number): void;
  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean): void;
  dispose(): void;
}

/** 阻尼：current 向 target 按指数逼近，帧率无关。 */
export function damp(current: number, target: number, smoothing: number, deltaSeconds: number): number {
  return THREE.MathUtils.damp(current, target, smoothing, deltaSeconds);
}

export interface CameraPose {
  focus: THREE.Vector3;
  yaw: number;
  pitch: number;
  distance: number;
}

/** 机位相机：目标机位平滑过渡 + 微呼吸感。 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  private pose: CameraPose;
  private goal: CameraPose;

  constructor(fov = 42, near = 0.1, far = 120) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
    this.pose = { focus: new THREE.Vector3(), yaw: Math.PI / 4, pitch: 0.9, distance: 10 };
    this.goal = { focus: new THREE.Vector3(), yaw: Math.PI / 4, pitch: 0.9, distance: 10 };
    this.apply();
  }

  setGoal(pose: Partial<CameraPose>) {
    if (pose.focus) this.goal.focus.copy(pose.focus);
    if (pose.yaw !== undefined) this.goal.yaw = pose.yaw;
    if (pose.pitch !== undefined) this.goal.pitch = pose.pitch;
    if (pose.distance !== undefined) this.goal.distance = pose.distance;
  }

  snap(pose: Partial<CameraPose>) {
    this.setGoal(pose);
    if (pose.focus) this.pose.focus.copy(pose.focus);
    if (pose.yaw !== undefined) this.pose.yaw = pose.yaw;
    if (pose.pitch !== undefined) this.pose.pitch = pose.pitch;
    if (pose.distance !== undefined) this.pose.distance = pose.distance;
    this.apply();
  }

  update(deltaSeconds: number, reducedMotion: boolean, timeSeconds: number) {
    const smoothing = 4.2;
    this.pose.focus.x = damp(this.pose.focus.x, this.goal.focus.x, smoothing, deltaSeconds);
    this.pose.focus.y = damp(this.pose.focus.y, this.goal.focus.y, smoothing, deltaSeconds);
    this.pose.focus.z = damp(this.pose.focus.z, this.goal.focus.z, smoothing, deltaSeconds);
    this.pose.yaw = damp(this.pose.yaw, this.goal.yaw, smoothing, deltaSeconds);
    this.pose.pitch = damp(this.pose.pitch, this.goal.pitch, smoothing, deltaSeconds);
    this.pose.distance = damp(this.pose.distance, this.goal.distance, smoothing, deltaSeconds);
    this.apply();
    if (!reducedMotion) {
      // 极轻微的巡镜呼吸，让画面始终有生命感。
      const sway = Math.sin(timeSeconds * 0.32) * 0.006;
      this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), sway);
      this.camera.lookAt(this.pose.focus);
    }
  }

  private apply() {
    const { focus, yaw, pitch, distance } = this.pose;
    this.camera.position.set(
      focus.x + Math.cos(yaw) * Math.cos(pitch) * distance,
      focus.y + Math.sin(pitch) * distance,
      focus.z + Math.sin(yaw) * Math.cos(pitch) * distance,
    );
    this.camera.lookAt(focus);
  }
}

export interface StageOptions {
  /** 主题色：用于地面光晕与轮廓光的点缀。 */
  accent: string;
  /** 环境底色（背景雾）。 */
  ambience: string;
  /** 主光色温。 */
  keyLight?: string;
  /** 阴影开关（小屏关闭以省电）。 */
  shadows?: boolean;
}

export interface TabletopStageKit {
  scene: THREE.Scene;
  rig: CameraRig;
  keyLight: THREE.SpotLight;
  resize(width: number, height: number): void;
  update(timeSeconds: number, deltaSeconds: number, reducedMotion: boolean): void;
  dispose(): void;
}

/** 建立舞台：背景雾、三点灯光、柔光地面。 */
export function createStage(options: StageOptions): TabletopStageKit {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(options.ambience);
  scene.fog = new THREE.Fog(options.ambience, 16, 46);

  const rig = new CameraRig();
  scene.add(rig.camera);

  const ambient = new THREE.HemisphereLight('#f4e3c2', '#1a1622', 0.55);
  scene.add(ambient);

  const keyLight = new THREE.SpotLight(options.keyLight ?? '#ffe6b8', 260, 40, Math.PI / 5, 0.55, 1.7);
  keyLight.position.set(4, 12, 3);
  if (options.shadows !== false) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1_024, 1_024);
    keyLight.shadow.bias = -0.0004;
  }
  scene.add(keyLight);
  scene.add(keyLight.target);

  const fillLight = new THREE.DirectionalLight('#9fb6ff', 0.4);
  fillLight.position.set(-6, 6, -4);
  scene.add(fillLight);

  const rimLight = new THREE.PointLight(options.accent, 90, 30, 1.8);
  rimLight.position.set(-3, 5, 6);
  scene.add(rimLight);

  // 柔光地面：径向光晕圆盘 + 微反光板。
  const groundMaterial = new THREE.MeshStandardMaterial({
    map: groundGlowTexture(`${options.accent}22`, '#05060a'),
    transparent: true,
    roughness: 0.9,
    metalness: 0,
  });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(26, 48), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = options.shadows !== false;
  scene.add(ground);

  const table = new THREE.Mesh(
    new THREE.CircleGeometry(15, 64),
    new THREE.MeshStandardMaterial({ color: '#0b0d15', roughness: 0.82, metalness: 0.08 }),
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.05;
  table.receiveShadow = true;
  scene.add(table);

  let lastTime = 0;
  return {
    scene,
    rig,
    keyLight,
    resize(width, height) {
      rig.camera.aspect = width / height;
      rig.camera.updateProjectionMatrix();
    },
    update(timeSeconds, deltaSeconds, reducedMotion) {
      rig.update(deltaSeconds, reducedMotion, timeSeconds);
      // 主光随时间极缓摆动，模拟灯下微尘氛围。
      if (!reducedMotion) {
        keyLight.position.x = 4 + Math.sin(timeSeconds * 0.21) * 0.7;
        keyLight.position.z = 3 + Math.cos(timeSeconds * 0.17) * 0.5;
      }
      void lastTime;
      lastTime = timeSeconds;
    },
    dispose() {
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
    },
  };
}

/** WebGL 宿主：管理渲染循环、自适应分辨率、上下文丢失降级。 */
export class TabletopRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly observer: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  private animationFrame = 0;
  private disposed = false;
  private lastFrameAt = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly scene: TabletopScene,
    private readonly testId: string,
    private readonly onFailure: () => void,
    private readonly now: () => number = Date.now,
  ) {
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      this.scene.dispose();
      this.onFailure();
      throw new Error('WEBGL_UNAVAILABLE');
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    const detailed = !window.matchMedia('(max-width: 720px)').matches;
    this.renderer.shadowMap.enabled = detailed;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, detailed ? 1.75 : 1.5));
    // 软件渲染（SwiftShader/llvmpipe，常见于 CI 与无独显设备）下关闭阴影并降到 1x，保住可玩的帧率。
    const gl = this.renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererName = debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)) : '';
    if (/swiftshader|llvmpipe|software|basic render/i.test(rendererName)) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
    }
    this.renderer.domElement.className = 'bt-canvas';
    this.renderer.domElement.dataset.testid = testId;
    this.renderer.domElement.dataset.renderEngine = 'three.js';
    this.renderer.domElement.dataset.renderState = 'starting';
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);

    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      this.resize(entry.contentRect.width, entry.contentRect.height);
    });
    this.observer.observe(this.container);
    this.resize(this.container.clientWidth, this.container.clientHeight);
    this.animationFrame = requestAnimationFrame(this.frame);
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    this.renderer.domElement.dataset.renderState = 'lost';
    this.onFailure();
  };

  private resize(width: number, height: number) {
    const safeWidth = Math.max(1, Math.floor(width));
    const safeHeight = Math.max(1, Math.floor(height));
    this.renderer.setSize(safeWidth, safeHeight, false);
    this.scene.resize(safeWidth, safeHeight);
  }

  private readonly frame = (frameAt: number) => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.frame);
    const interval = 1_000 / 30;
    if (frameAt - this.lastFrameAt < interval) return;
    const deltaSeconds = Math.min(0.25, (frameAt - this.lastFrameAt) / 1_000);
    this.lastFrameAt = frameAt;
    if (document.hidden) return;
    const timeSeconds = this.now() / 1_000;
    this.scene.update(timeSeconds, deltaSeconds, this.reducedMotion.matches);
    this.renderer.render(this.scene.scene, this.scene.camera);
    this.renderer.domElement.dataset.renderState = 'running';
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.scene.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
