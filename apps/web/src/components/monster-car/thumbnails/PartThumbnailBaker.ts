import * as THREE from 'three';
import type { MonsterCarSlot } from '@party/protocol';
import { createPartModel } from '../rendering/models';
import { disposeModel } from '../rendering/models/types';
import type { PartRig } from '../rendering/models/types';

interface ThumbnailJob {
  key: string;
  slot: MonsterCarSlot;
  partId: string;
  resolve: (url: string) => void;
  reject: (error: Error) => void;
}

export class PartThumbnailBaker {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly cache = new Map<string, string>();
  private readonly pending = new Map<string, Promise<string>>();
  private readonly pendingJobs = new Map<string, ThumbnailJob>();
  private readonly subscribers = new Map<string, number>();
  private readonly jobs: ThumbnailJob[] = [];
  private running = false;
  private activeJob: ThumbnailJob | null = null;
  private idleTimer: number | null = null;

  cached(slot: MonsterCarSlot, partId: string) {
    return this.cache.get(`${slot}:${partId}`) ?? null;
  }

  request(slot: MonsterCarSlot, partId: string) {
    const key = `${slot}:${partId}`;
    this.subscribers.set(key, (this.subscribers.get(key) ?? 0) + 1);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pending.get(key);
    if (pending) return pending;
    let job!: ThumbnailJob;
    const promise = new Promise<string>((resolve, reject) => {
      job = { key, slot, partId, resolve, reject };
      this.jobs.push(job);
    });
    this.pending.set(key, promise);
    this.pendingJobs.set(key, job);
    void this.run();
    return promise;
  }

  release(slot: MonsterCarSlot, partId: string) {
    const key = `${slot}:${partId}`;
    const remaining = (this.subscribers.get(key) ?? 0) - 1;
    if (remaining > 0) {
      this.subscribers.set(key, remaining);
      return;
    }
    this.subscribers.delete(key);
    const pending = this.pending.get(key);
    const pendingJob = this.pendingJobs.get(key);
    if (!pending || !pendingJob) return;
    const previousLength = this.jobs.length;
    for (let index = this.jobs.length - 1; index >= 0; index -= 1) {
      if (this.jobs[index]?.key === key) this.jobs.splice(index, 1);
    }
    if (this.jobs.length !== previousLength || this.activeJob?.key === key) {
      this.pending.delete(key);
      this.pendingJobs.delete(key);
      pendingJob.reject(new Error('THUMBNAIL_CANCELLED'));
    }
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    if (this.idleTimer !== null) window.clearTimeout(this.idleTimer);
    while (this.jobs.length > 0) {
      const job = this.jobs.shift()!;
      this.activeJob = job;
      try {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if ((this.subscribers.get(job.key) ?? 0) === 0) throw new Error('THUMBNAIL_CANCELLED');
        const url = this.bake(job.slot, job.partId);
        this.cache.set(job.key, url);
        job.resolve(url);
      } catch (cause) {
        job.reject(cause instanceof Error ? cause : new Error('THUMBNAIL_FAILED'));
      } finally {
        this.pending.delete(job.key);
        this.pendingJobs.delete(job.key);
        this.activeJob = null;
      }
    }
    this.running = false;
    this.idleTimer = window.setTimeout(() => this.disposeRenderer(), 2_000);
  }

  private bake(slot: MonsterCarSlot, partId: string) {
    const renderer = this.renderer ?? this.createRenderer();
    this.renderer = renderer;
    const scene = new THREE.Scene();
    let model: PartRig | null = null;
    let ground: THREE.Mesh | null = null;
    let key: THREE.DirectionalLight | null = null;
    try {
      model = createPartModel(slot, partId);
      scene.add(model.root);
      const bounds = new THREE.Box3().setFromObject(model.root);
      const center = bounds.getCenter(new THREE.Vector3());
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(0.55, sphere.radius);

      const hemisphere = new THREE.HemisphereLight('#d9eee6', '#71634f', 2.4);
      key = new THREE.DirectionalLight('#ffe0ad', 3.2);
      key.position.copy(center).add(new THREE.Vector3(-4, 7, 6));
      const fill = new THREE.DirectionalLight('#c3d4f2', 1.1);
      fill.position.copy(center).add(new THREE.Vector3(5, 3, -4));
      scene.add(hemisphere, key, fill);

      ground = new THREE.Mesh(
        new THREE.CircleGeometry(radius * 1.15, 32),
        new THREE.MeshBasicMaterial({ color: '#355344', transparent: true, opacity: 0.12, depthWrite: false }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(center.x, bounds.min.y - 0.03, center.z);
      scene.add(ground);

      const camera = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.05, 100);
      const direction = slot === 'wheels' ? new THREE.Vector3(3, 2.2, 5) : new THREE.Vector3(4, 2.7, 6);
      camera.position.copy(center).add(direction.normalize().multiplyScalar(radius * 5));
      camera.lookAt(center);
      const halfHeight = radius * 1.08;
      const halfWidth = halfHeight * (240 / 180);
      camera.left = -halfWidth;
      camera.right = halfWidth;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();

      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/webp', 0.9);
    } finally {
      if (model) disposeModel(model.root);
      if (ground) disposeModel(ground);
      key?.shadow.map?.dispose();
      scene.clear();
      renderer.renderLists.dispose();
    }
  }

  private createRenderer() {
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setSize(240, 180, false);
    renderer.setPixelRatio(1);
    renderer.setClearColor('#ffffff', 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    return renderer;
  }

  private disposeRenderer() {
    this.renderer?.dispose();
    this.renderer = null;
  }
}

export const partThumbnailBaker = new PartThumbnailBaker();
