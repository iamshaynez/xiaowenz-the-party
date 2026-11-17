import * as THREE from 'three';

export interface MonsterCarRenderScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  resize(width: number, height: number): void;
  update(timeSeconds: number, reducedMotion: boolean): void;
  preferredFrameIntervalMs?(): number;
  dispose(): void;
}

export class RenderSurface {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly observer: ResizeObserver;
  private readonly reducedMotion: MediaQueryList;
  private readonly frameIntervalMs: number;
  private animationFrame = 0;
  private disposed = false;
  private lastFrameAt = 0;

  constructor(
    private readonly container: HTMLElement,
    private readonly renderScene: MonsterCarRenderScene,
    private readonly onFailure: () => void,
    private readonly now: () => number = Date.now,
  ) {
    const detailed = !window.matchMedia('(max-width: 720px)').matches;
    this.frameIntervalMs = detailed ? 0 : 1_000 / 30;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    } catch {
      this.renderScene.dispose();
      this.onFailure();
      throw new Error('WEBGL_UNAVAILABLE');
    }
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = detailed;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, detailed ? 1.75 : 1.4));
    this.renderer.domElement.className = 'mc-canvas';
    this.renderer.domElement.dataset.testid = 'monster-car-canvas';
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
    this.renderScene.resize(safeWidth, safeHeight);
  }

  private readonly frame = (frameAt: number) => {
    if (this.disposed) return;
    this.animationFrame = requestAnimationFrame(this.frame);
    const sceneInterval = this.renderScene.preferredFrameIntervalMs?.() ?? 0;
    const interval = Math.max(this.frameIntervalMs, sceneInterval, sceneInterval && this.reducedMotion.matches ? 200 : 0);
    if (interval && frameAt - this.lastFrameAt < interval) return;
    this.lastFrameAt = frameAt;
    if (document.hidden) return;
    this.renderScene.update(this.now() / 1_000, this.reducedMotion.matches);
    this.renderer.render(this.renderScene.scene, this.renderScene.camera);
    this.renderer.domElement.dataset.renderState = 'running';
  };

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.observer.disconnect();
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderScene.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
