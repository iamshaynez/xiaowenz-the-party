import * as THREE from 'three';
import { COURSE_LENGTH, sampleCourse } from './courseMath';

const SEED = 0x51F15EED;
const VOLLEY_SPACING_SECONDS = 1.05;
const REDUCED_MOTION_TIME = 0.72;
const PALETTE = [
  [1, 0.48, 0.38],
  [1, 0.82, 0.35],
  [0.42, 0.9, 0.75],
  [0.67, 0.58, 1],
  [0.65, 0.84, 1],
] as const;

const VERTEX_SHADER = /* glsl */ `
  uniform float time;
  uniform float reducedMotion;
  uniform float period;
  uniform float gravity;

  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aStart;
  attribute float aLifetime;
  attribute float aSize;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float age = mod(time - aStart + period, period);
    float normalizedAge = clamp(age / aLifetime, 0.0, 1.0);
    float alive = 1.0 - step(aLifetime, age);
    float fadeIn = smoothstep(0.0, 0.09, age);
    float fadeOut = 1.0 - smoothstep(0.52, 1.0, normalizedAge);

    vec3 sparkPosition = position + aVelocity * age;
    sparkPosition.y -= 0.5 * gravity * age * age;

    vColor = aColor;
    vAlpha = alive * fadeIn * fadeOut * mix(0.9, 0.42, reducedMotion);

    vec4 viewPosition = modelViewMatrix * vec4(sparkPosition, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = alive * aSize * (1.0 - normalizedAge * 0.35);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float radius = length(gl_PointCoord - vec2(0.5));
    if (radius > 0.5 || vAlpha <= 0.0) discard;

    float halo = 1.0 - smoothstep(0.08, 0.5, radius);
    float core = 1.0 - smoothstep(0.0, 0.18, radius);
    float alpha = (halo * 0.68 + core * 0.32) * vAlpha;
    gl_FragColor = vec4(vColor * (0.82 + core * 0.55), alpha);
  }
`;

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A GPU-driven, fixed-size collection of repeating fireworks volleys. */
export class FireworksField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly period: number;
  private disposed = false;

  constructor(detailed: boolean) {
    const volleyCount = detailed ? 8 : 6;
    const sparksPerVolley = detailed ? 72 : 48;
    const capacity = volleyCount * sparksPerVolley;
    this.period = Math.max(8.4, volleyCount * VOLLEY_SPACING_SECONDS + 1.8);

    const origins = new Float32Array(capacity * 3);
    const velocities = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const starts = new Float32Array(capacity);
    const lifetimes = new Float32Array(capacity);
    const sizes = new Float32Array(capacity);
    const random = randomFrom(SEED);
    const finish = sampleCourse(1);
    const centerX = COURSE_LENGTH + 5;

    let cursor = 0;
    for (let volley = 0; volley < volleyCount; volley += 1) {
      const originX = centerX + (random() - 0.5) * 6.5;
      const originY = finish.y + 5.8 + random() * 3.2;
      const originZ = finish.z + (random() - 0.5) * 5;
      const start = volley * VOLLEY_SPACING_SECONDS;
      const paletteOffset = Math.floor(random() * PALETTE.length);

      for (let spark = 0; spark < sparksPerVolley; spark += 1) {
        const offset = cursor * 3;
        const angle = spark / sparksPerVolley * Math.PI * 2 + (random() - 0.5) * 0.16;
        const vertical = random() * 1.5 - 0.45;
        const horizontal = Math.sqrt(Math.max(0, 1 - Math.min(1, vertical * vertical)));
        const speed = 2.1 + random() * 2.5;
        const color = PALETTE[(paletteOffset + Math.floor(random() * 2)) % PALETTE.length]!;

        origins[offset] = originX;
        origins[offset + 1] = originY;
        origins[offset + 2] = originZ;
        velocities[offset] = Math.cos(angle) * horizontal * speed;
        velocities[offset + 1] = vertical * speed + 1.25;
        velocities[offset + 2] = Math.sin(angle) * horizontal * speed;
        colors[offset] = color[0];
        colors[offset + 1] = color[1];
        colors[offset + 2] = color[2];
        starts[cursor] = start;
        lifetimes[cursor] = 1.65 + random() * 0.75;
        sizes[cursor] = spark === 0 ? 36 : (detailed ? 13 : 14) + random() * 8;
        if (spark === 0) {
          velocities[offset] = 0;
          velocities[offset + 1] = 0.35;
          velocities[offset + 2] = 0;
          lifetimes[cursor] = 0.9;
        }
        cursor += 1;
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(origins, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 1));
    geometry.setAttribute('aLifetime', new THREE.BufferAttribute(lifetimes, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setDrawRange(0, capacity);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        reducedMotion: { value: 0 },
        period: { value: this.period },
        gravity: { value: 2.65 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    this.points = new THREE.Points(geometry, material);
    this.points.name = 'monster-car-fireworks';
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  update(celebrationSeconds: number, reducedMotion = false) {
    if (this.disposed) return;
    const time = Number.isFinite(celebrationSeconds) ? Math.max(0, celebrationSeconds) : 0;
    const uniforms = this.points.material.uniforms;
    // Reduced motion is a static, dimmed initial burst: no animation or flashing.
    uniforms.time!.value = reducedMotion ? REDUCED_MOTION_TIME : time % this.period;
    uniforms.reducedMotion!.value = reducedMotion ? 1 : 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}
