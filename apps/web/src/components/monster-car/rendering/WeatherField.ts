import * as THREE from 'three';
import { randomFromPurpose } from './presentation/deterministic';
import type { MonsterCarStory, MonsterCarWeather } from './presentation/ShowPlan';

const TIME_PERIOD = 4_096;
const FIELD_SPAN = 44;
const FIELD_HEIGHT = 12;
const WEATHER_INDEX: Record<MonsterCarWeather, number> = {
  fireflies: 0,
  rain: 1,
  petals: 2,
  flowers: 3,
  acorns: 4,
  lanterns: 5,
};
const WEATHER_COLORS: Record<MonsterCarWeather, readonly string[]> = {
  fireflies: ['#f8ee9a', '#cdeca4', '#fff5c6'],
  rain: ['#c9e7eb', '#8ebecb', '#eef8f3'],
  petals: ['#f5b7c3', '#f8d4ce', '#e7c3e4'],
  flowers: ['#f6cf7b', '#ef9eac', '#c4b0e2', '#f5edc8'],
  acorns: ['#b88455', '#d1a568', '#8e704f'],
  lanterns: ['#ffc879', '#f39a68', '#ffe1a0'],
};

const VERTEX_SHADER = /* glsl */ `
  uniform float time;
  uniform float focusX;
  uniform float reducedMotion;
  uniform float weather;

  attribute vec3 aVelocity;
  attribute vec3 aColor;
  attribute float aPhase;
  attribute float aSize;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vWeather;

  float wrapX(float value) {
    return mod(value + 22.0, 44.0) - 22.0;
  }

  void main() {
    float t = time;
    vec3 p = position;
    float phase = aPhase;

    if (weather < 0.5) {
      // Fireflies hover locally instead of falling through the whole field.
      p.x = focusX + position.x + sin(t * aVelocity.x + phase) * 0.85;
      p.y = 0.8 + mod(position.y, 6.5) + sin(t * 0.7 + phase) * 0.5;
      p.z += cos(t * 0.43 + phase) * 0.55;
      vAlpha = 0.48 + 0.52 * sin(t * 1.3 + phase) * sin(t * 1.3 + phase);
    } else if (weather < 1.5) {
      p.x = focusX + wrapX(position.x - t * 0.22);
      p.y = mod(position.y - t * aVelocity.y + 12.0, 12.0);
      p.z += sin(phase) * 0.3;
      vAlpha = 0.5;
    } else if (weather < 2.5) {
      p.x = focusX + wrapX(position.x - t * aVelocity.x + sin(t + phase) * 0.7);
      p.y = mod(position.y - t * aVelocity.y + 12.0, 12.0);
      p.z += sin(t * 0.65 + phase) * 0.8;
      vAlpha = 0.72;
    } else if (weather < 3.5) {
      p.x = focusX + wrapX(position.x + t * aVelocity.x * 0.45);
      p.y = mod(position.y + t * aVelocity.y * 0.22, 9.0);
      p.z += cos(t * 0.4 + phase) * 0.5;
      vAlpha = 0.64;
    } else if (weather < 4.5) {
      p.x = focusX + wrapX(position.x - t * 0.3 + sin(t * 1.4 + phase) * 0.24);
      p.y = mod(position.y - t * aVelocity.y + 12.0, 12.0);
      p.z += aVelocity.z * t;
      p.z = mod(p.z + 8.0, 16.0) - 8.0;
      vAlpha = 0.74;
    } else {
      p.x = focusX + wrapX(position.x + sin(t * 0.45 + phase) * 0.65);
      p.y = mod(position.y + t * aVelocity.y * 0.45, 11.0);
      p.z += cos(t * 0.33 + phase) * 0.35;
      vAlpha = 0.7 + sin(t * 0.6 + phase) * 0.12;
    }

    vColor = aColor;
    vWeather = weather;
    vAlpha *= mix(1.0, 0.62, reducedMotion);
    vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * viewPosition;
    gl_PointSize = aSize;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vWeather;

  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float shape;
    float glow = 0.0;

    if (vWeather < 0.5) {
      float radius = length(uv);
      shape = 1.0 - smoothstep(0.12, 0.5, radius);
      glow = 1.0 - smoothstep(0.0, 0.16, radius);
    } else if (vWeather < 1.5) {
      shape = 1.0 - smoothstep(0.35, 0.52, length(vec2(uv.x * 4.5, uv.y * 0.8)));
    } else if (vWeather < 2.5) {
      shape = 1.0 - smoothstep(0.3, 0.5, length(vec2(uv.x * 0.75, uv.y * 1.65)));
    } else if (vWeather < 3.5) {
      float petals = 0.32 + 0.12 * cos(atan(uv.y, uv.x) * 5.0);
      shape = 1.0 - smoothstep(petals - 0.08, petals, length(uv));
    } else if (vWeather < 4.5) {
      shape = 1.0 - smoothstep(0.32, 0.5, length(vec2(uv.x * 1.25, uv.y * 0.8)));
    } else {
      float radius = length(vec2(uv.x * 1.15, uv.y * 0.85));
      shape = 1.0 - smoothstep(0.28, 0.5, radius);
      glow = 1.0 - smoothstep(0.0, 0.24, radius);
    }

    float alpha = shape * vAlpha;
    if (alpha <= 0.005) discard;
    gl_FragColor = vec4(vColor * (0.9 + glow * 0.45), alpha);
  }
`;

function particleSize(weather: MonsterCarWeather, random: number) {
  switch (weather) {
    case 'rain': return 12 + random * 9;
    case 'lanterns': return 17 + random * 11;
    case 'fireflies': return 8 + random * 8;
    case 'acorns': return 9 + random * 7;
    case 'petals': return 11 + random * 8;
    case 'flowers': return 10 + random * 8;
  }
}

/** A fixed-capacity, GPU-animated weather field for one curated story. */
export class WeatherField {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private disposed = false;

  constructor(story: MonsterCarStory, detailed: boolean) {
    const capacity = detailed ? 360 : 180;
    const positions = new Float32Array(capacity * 3);
    const velocities = new Float32Array(capacity * 3);
    const colors = new Float32Array(capacity * 3);
    const phases = new Float32Array(capacity);
    const sizes = new Float32Array(capacity);
    const random = randomFromPurpose('monster-car.weather.field', story.id);
    const palette = WEATHER_COLORS[story.weather];
    const color = new THREE.Color();
    const storyTint = new THREE.Color();

    for (let index = 0; index < capacity; index += 1) {
      const offset = index * 3;
      positions[offset] = (random() - 0.5) * FIELD_SPAN;
      positions[offset + 1] = 0.35 + random() * (FIELD_HEIGHT - 1);
      positions[offset + 2] = -7 + random() * 15;
      velocities[offset] = 0.18 + random() * 0.52;
      velocities[offset + 1] = story.weather === 'rain'
        ? 5.5 + random() * 3.5
        : story.weather === 'acorns'
          ? 1.3 + random() * 1.1
          : 0.35 + random() * 0.65;
      velocities[offset + 2] = (random() - 0.5) * 0.3;
      phases[index] = random() * Math.PI * 2;
      sizes[index] = particleSize(story.weather, random());

      color.set(palette[index % palette.length]!);
      storyTint.set(story.dayColors[index % story.dayColors.length]!);
      color.lerp(storyTint, 0.18);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setDrawRange(0, capacity);

    const glowing = story.weather === 'fireflies' || story.weather === 'lanterns';
    const material = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        focusX: { value: 0 },
        reducedMotion: { value: 0 },
        weather: { value: WEATHER_INDEX[story.weather] },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      blending: glowing ? THREE.AdditiveBlending : THREE.NormalBlending,
      toneMapped: false,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.name = `monster-car-weather-${story.weather}`;
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
  }

  update(timeSeconds: number, focusX: number, reducedMotion: boolean) {
    if (this.disposed) return;
    const time = Number.isFinite(timeSeconds) ? Math.max(0, timeSeconds) : 0;
    const focus = Number.isFinite(focusX) ? focusX : 0;
    const uniforms = this.points.material.uniforms;
    uniforms.time!.value = reducedMotion ? 0 : time % TIME_PERIOD;
    uniforms.focusX!.value = focus;
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
