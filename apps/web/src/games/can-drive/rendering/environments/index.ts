import * as THREE from 'three';
import { CLAY_PRESET as C } from '../clayPreset';
import type { ClayGeometryKit } from '../geometry';
import type {
  ClayCameraHint,
  ClayEnvironmentFactory,
  ClayEnvironmentId,
  ClayEnvironmentVisual,
  ClayVector3,
} from '../types';

const DEFAULT_CAMERA: ClayCameraHint = {
  position: [7.2, 5.3, 8.2],
  target: [0, 1.0, 0],
};

function camera(position: ClayVector3, target: ClayVector3 = [0, 1, 0]): ClayCameraHint {
  return { position, target };
}

function stage(kit: ClayGeometryKit, id: string, road: string = C.road, platform: string = C.platform) {
  const root = kit.group(undefined, [0, 0, 0], `environment-${id}`);
  kit.box([7.2, 0.38, 5.3], platform, root, [0, -0.2, 0], 0.16);
  kit.box([4.6, 0.08, 4.65], road, root, [0, 0.035, 0], 0.08);
  return root;
}

function marker(kit: ClayGeometryKit, parent: THREE.Object3D, x: number, z: number): void {
  kit.box([0.58, 0.1, 0.58], C.ink, parent, [x, 0.11, z], 0.05);
  kit.cone(0.23, 0.68, C.orange, parent, [x, 0.48, z], 16);
  kit.box([0.39, 0.09, 0.07], C.white, parent, [x, 0.45, z + 0.18], 0.02);
}

const washboard: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'washboard');
  for (let index = 0; index < 9; index += 1) {
    kit.box([4.35, 0.1, 0.14], index % 2 === 0 ? C.cream : C.ground, root, [0, 0.12, -1.8 + index * 0.45], 0.045);
  }
  marker(kit, root, -2.75, 1.65);
  marker(kit, root, 2.75, -1.55);
  return { root, camera: DEFAULT_CAMERA };
};

const mud: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'mud', C.mud, '#e6d4bc');
  for (const [x, z, sx, sz] of [
    [-0.9, -1.1, 0.9, 0.62],
    [0.8, 0.2, 1.05, 0.7],
    [-0.45, 1.35, 0.72, 0.48],
  ] as const) {
    kit.ellipsoid([sx, 0.045, sz], C.brown, root, [x, 0.1, z]);
  }
  const bubbles = kit.group(root);
  const bubbleNodes: THREE.Object3D[] = [];
  for (const [x, z] of [[-1.1, -1], [-0.55, -1.25], [0.65, 0.15], [1.15, 0.35], [-0.35, 1.3]] as const) {
    bubbleNodes.push(kit.sphere(0.1, C.ground, bubbles, [x, 0.16, z]));
  }
  for (const [x, z] of [[-1.8, 0.4], [1.75, -1.4], [1.7, 1.5]] as const) {
    kit.ellipsoid([0.28, 0.18, 0.24], C.mud, root, [x, 0.19, z]);
  }
  return {
    root,
    animated: { bubbles },
    camera: DEFAULT_CAMERA,
    update(atMs) {
      const time = atMs / 1000;
      bubbleNodes.forEach((bubble, index) => {
        const pulse = 0.82 + Math.sin(time * 2.4 + index * 1.3) * 0.18;
        bubble.scale.setScalar(pulse);
        bubble.position.y = 0.15 + Math.sin(time * 2.4 + index) * 0.025;
      });
    },
  };
};

const water: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'water', C.blue, '#e5ddc9');
  const waterMaterial = kit.material(C.water, {
    opacity: 0.76,
    transparent: true,
    roughness: 0.4,
    depthWrite: false,
  });
  kit.box([4.54, 0.14, 4.58], waterMaterial, root, [0, 0.13, 0], 0.07);
  const waves = kit.group(root);
  const waveNodes: THREE.Object3D[] = [];
  for (let index = 0; index < 8; index += 1) {
    const x = index % 2 === 0 ? -0.85 : 0.85;
    const wave = kit.box([1.35, 0.025, 0.075], C.ice, waves, [x, 0.23, -1.85 + index * 0.53], 0.012);
    waveNodes.push(wave);
  }
  for (const side of [-1, 1]) {
    kit.sphere(0.2, C.coral, root, [side * 2.05, 0.34, -1.55]);
    kit.rod([side * 2.05, 0.2, -1.55], [side * 2.05, 0.7, -1.55], 0.025, C.cream, root);
  }
  return {
    root,
    animated: { waves },
    camera: camera([6.6, 5.5, 8.4]),
    update(atMs) {
      const time = atMs / 1000;
      waveNodes.forEach((wave, index) => {
        wave.position.y = 0.22 + Math.sin(time * 2.2 + index * 0.8) * 0.035;
        wave.position.x = (index % 2 === 0 ? -0.85 : 0.85) + Math.sin(time * 1.3 + index) * 0.14;
      });
    },
  };
};

const ice: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'ice', C.ice, '#e9e4d9');
  const glaze = kit.material(C.white, { opacity: 0.35, transparent: true, roughness: 0.3, depthWrite: false });
  kit.box([4.48, 0.045, 4.52], glaze, root, [0, 0.1, 0], 0.06);
  for (const [x, z, scale] of [[-2.25, -1.65, 0.65], [2.2, 1.5, 0.8], [-2.3, 1.55, 0.5]] as const) {
    kit.ellipsoid([scale, scale * 0.42, scale * 0.72], C.white, root, [x, 0.18, z]);
  }
  for (const [start, end] of [
    [[-1.5, 0.14, -0.8], [-0.3, 0.14, -0.15]],
    [[-0.3, 0.14, -0.15], [0.35, 0.14, -0.65]],
    [[-0.3, 0.14, -0.15], [0.8, 0.14, 0.75]],
    [[0.45, 0.14, 0.32], [1.35, 0.14, 0.5]],
  ] as const) {
    kit.rod(start, end, 0.014, C.blue, root);
  }
  const crystals = kit.group(root, [-2.35, 0.32, 0]);
  for (const [x, z, height] of [[0, 0, 0.55], [0.28, 0.1, 0.36], [-0.18, 0.22, 0.3]] as const) {
    kit.cone(0.13, height, C.water, crystals, [x, height / 2, z], 5);
  }
  return {
    root,
    animated: { crystals },
    camera: camera([7.4, 5.1, 7.8]),
    update(atMs) {
      crystals.rotation.y = Math.sin(atMs / 1800) * 0.12;
    },
  };
};

const crosswind: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'crosswind', C.road, '#eee2c9');
  const flags = kit.group(root);
  for (const side of [-1, 1]) {
    kit.rod([side * 2.75, 0.08, -0.8], [side * 2.75, 1.5, -0.8], 0.035, C.ink, root);
    const cloth = kit.group(flags, [side * 2.75, 1.3, -0.8]);
    const sock = kit.cylinder(0.12, 0.26, 0.9, side < 0 ? C.coral : C.yellow, cloth, [0.42, 0, 0], 14);
    sock.rotation.z = -Math.PI / 2;
  }
  const wind = kit.group(root);
  const streaks: { node: THREE.Group; baseX: number }[] = [];
  for (let index = 0; index < 6; index += 1) {
    const baseX = -2.5 + (index % 3) * 2.1;
    const node = kit.group(wind, [baseX, 0.75 + (index % 2) * 0.65, -1.6 + index * 0.62]);
    kit.rod([-0.38, 0, 0], [0.35, 0, 0], 0.026, C.cream, node);
    const arrow = kit.cone(0.09, 0.25, C.cream, node, [0.48, 0, 0], 10);
    arrow.rotation.z = -Math.PI / 2;
    streaks.push({ node, baseX });
  }
  return {
    root,
    animated: { wind, flags },
    camera: camera([7.8, 4.7, 7.6]),
    update(atMs) {
      const time = atMs / 1000;
      for (const { node, baseX } of streaks) {
        node.position.x = ((baseX + time * 1.7 + 3.2) % 6.4) - 3.2;
      }
      flags.rotation.z = Math.sin(time * 4) * 0.035;
    },
  };
};

const rain: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'rain', '#879da0', '#d7d4ca');
  for (const [x, z] of [[-1.1, 0.7], [0.9, -0.9], [0.5, 1.5]] as const) {
    kit.ellipsoid([0.65, 0.025, 0.42], C.water, root, [x, 0.1, z]);
  }
  const clouds = kit.group(root, [-1.8, 3.55, -1.3]);
  for (const [x, y, radius] of [[0, 0, 0.55], [0.48, 0.03, 0.43], [-0.45, -0.04, 0.4], [0.05, 0.28, 0.4]] as const) {
    kit.sphere(radius, C.cave, clouds, [x, y, 0]);
  }
  const raindrops = kit.group(root);
  const rainMaterial = kit.material(C.ice, { opacity: 0.72, transparent: true, depthWrite: false });
  const drops: { node: THREE.Object3D; baseY: number }[] = [];
  for (let index = 0; index < 28; index += 1) {
    const x = Math.sin(index * 12.37) * 2.05;
    const z = Math.cos(index * 8.19) * 2.05;
    const baseY = 0.5 + (index % 9) * 0.38;
    const node = kit.cylinder(0.014, 0.014, 0.32, rainMaterial, raindrops, [x, baseY, z], 6);
    node.rotation.z = -0.18;
    drops.push({ node, baseY });
  }
  return {
    root,
    animated: { clouds, raindrops },
    camera: camera([7.1, 5.7, 8.5]),
    update(atMs) {
      const time = atMs / 1000;
      for (const { node, baseY } of drops) {
        node.position.y = 0.24 + (((baseY - time * 3.5) % 3.5) + 3.5) % 3.5;
      }
      clouds.position.y = 3.55 + Math.sin(time * 0.9) * 0.08;
    },
  };
};

const lowTunnel: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'low-tunnel', '#9b9282', '#e2d5bf');
  for (const side of [-1, 1]) {
    kit.box([0.5, 2.35, 1.6], C.ground, root, [side * 2.18, 1.22, 0.45], 0.1);
  }
  kit.box([4.85, 0.48, 1.65], C.ground, root, [0, 2.38, 0.45], 0.1);
  kit.box([4.3, 0.12, 1.5], C.ink, root, [0, 2.11, 0.45], 0.035);
  for (let index = 0; index < 8; index += 1) {
    const stripe = kit.box([0.42, 0.18, 0.055], index % 2 === 0 ? C.yellow : C.ink, root, [-1.55 + index * 0.44, 2.38, 1.3], 0.025);
    stripe.rotation.z = -0.35;
  }
  const lights = kit.group(root);
  const lightMaterial = kit.material(C.orange, { emissive: C.yellow, emissiveIntensity: 0.65 });
  for (const side of [-1, 1]) {
    kit.sphere(0.12, lightMaterial, lights, [side * 1.78, 1.88, 1.3]);
  }
  return {
    root,
    animated: { lights },
    camera: camera([7.3, 4.5, 8.8], [0, 1.25, 0.2]),
    update(atMs) {
      lights.scale.setScalar(0.96 + Math.sin(atMs / 130) * 0.06);
    },
  };
};

const darkCave: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'dark-cave', C.cave, '#c7bdba');
  for (const [x, z, radius, height] of [
    [-2.4, -1.5, 0.65, 1.8],
    [2.45, -1.2, 0.7, 2.1],
    [-2.5, 1.35, 0.6, 1.55],
    [2.4, 1.55, 0.58, 1.7],
  ] as const) {
    const rock = kit.cone(radius, height, '#6d6473', root, [x, height / 2 + 0.08, z], 6);
    rock.rotation.y = x + z;
  }
  for (const [x, z, height] of [[-1.85, -0.4, 0.75], [1.8, 0.1, 0.9], [-1.5, 1.1, 0.55]] as const) {
    const stalactite = kit.cone(0.25, height, '#6d6473', root, [x, 2.85, z], 7);
    stalactite.rotation.z = Math.PI;
  }
  const crystals = kit.group(root, [-1.85, 0.1, 1.4]);
  const crystalMaterial = kit.material(C.water, { emissive: C.blue, emissiveIntensity: 0.45 });
  for (const [x, z, height] of [[0, 0, 0.65], [0.3, 0.1, 0.42], [-0.2, -0.12, 0.35]] as const) {
    kit.cone(0.14, height, crystalMaterial, crystals, [x, height / 2, z], 5);
  }
  const lantern = kit.group(root, [1.85, 0.85, 1.25]);
  const glow = kit.material(C.yellow, { emissive: C.orange, emissiveIntensity: 0.85 });
  kit.sphere(0.18, glow, lantern);
  kit.box([0.38, 0.08, 0.38], C.ink, lantern, [0, -0.22, 0], 0.035);
  const light = new THREE.PointLight(C.orange, 1.2, 5, 2);
  lantern.add(light);
  return {
    root,
    animated: { crystals, lantern },
    camera: camera([6.8, 4.6, 8.1], [0, 1.05, 0]),
    update(atMs) {
      const time = atMs / 1000;
      crystals.rotation.y = Math.sin(time * 0.7) * 0.09;
      light.intensity = 1.15 + Math.sin(time * 5.2) * 0.12;
    },
  };
};

const softBlocks: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'soft-blocks', '#d6c5b4', '#f2dfcb');
  const blocks = kit.group(root);
  const nodes: { node: THREE.Object3D; baseY: number; phase: number }[] = [];
  const definitions = [
    { position: [-0.95, 0.48, 0.85] as const, size: [0.85, 0.78, 0.85] as const, color: C.pink },
    { position: [0.05, 0.37, 1.25] as const, size: [0.72, 0.55, 0.72] as const, color: C.yellow },
    { position: [0.95, 0.52, 0.45] as const, size: [0.82, 0.86, 0.82] as const, color: C.mint },
    { position: [1.45, 0.32, -0.75] as const, size: [0.6, 0.46, 0.6] as const, color: C.coral },
  ];
  definitions.forEach((definition, index) => {
    const node = kit.box(definition.size, definition.color, blocks, definition.position, 0.18);
    nodes.push({ node, baseY: definition.position[1], phase: index * 1.4 });
  });
  for (const side of [-1, 1]) {
    const marshmallow = kit.cylinder(0.32, 0.32, 0.65, C.cream, root, [side * 2.25, 0.4, -1.5]);
    marshmallow.rotation.z = side * 0.25;
  }
  return {
    root,
    animated: { blocks },
    camera: DEFAULT_CAMERA,
    update(atMs) {
      const time = atMs / 1000;
      for (const { node, baseY, phase } of nodes) {
        const squash = Math.sin(time * 2 + phase) * 0.035;
        node.scale.set(1 - squash * 0.5, 1 + squash, 1 - squash * 0.5);
        node.position.y = baseY + Math.sin(time * 2 + phase) * 0.015;
      }
    },
  };
};

function rampGeometry(width: number, depth: number, height: number): THREE.BufferGeometry {
  const x = width / 2;
  const z = depth / 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -x, 0, -z,
    x, 0, -z,
    -x, 0, z,
    x, 0, z,
    -x, height, z,
    x, height, z,
  ], 3));
  geometry.setIndex([
    0, 1, 2, 1, 3, 2,
    2, 3, 4, 3, 5, 4,
    0, 4, 1, 1, 4, 5,
    0, 2, 4,
    1, 5, 3,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

const jump: ClayEnvironmentFactory = (kit) => {
  const root = stage(kit, 'jump', C.road, '#efe0c5');
  const ramp = kit.group(root, [0, 0.08, 0.2]);
  kit.mesh(rampGeometry(3.25, 1.8, 0.78), C.coral, ramp);
  const slope = Math.atan2(0.78, 1.8);
  for (const localZ of [-0.48, 0, 0.48]) {
    const y = ((localZ + 0.9) / 1.8) * 0.78 + 0.035;
    const stripe = kit.box([2.55, 0.035, 0.16], C.yellow, ramp, [0, y, localZ], 0.012);
    stripe.rotation.x = -slope;
  }
  kit.box([2.5, 0.24, 0.62], C.cream, root, [0, 0.2, 1.75], 0.11);
  for (const side of [-1, 1]) {
    kit.rod([side * 2.25, 0.08, 1.25], [side * 2.25, 1.5, 1.25], 0.035, C.ink, root);
  }
  const flags = kit.group(root);
  for (const side of [-1, 1]) {
    kit.box([0.55, 0.35, 0.055], side < 0 ? C.yellow : C.mint, flags, [side * 2.25 + 0.27, 1.32, 1.25], 0.03);
  }
  return {
    root,
    animated: { flags },
    camera: camera([7.4, 4.9, 8.8], [0, 1.0, 0.35]),
    update(atMs) {
      flags.rotation.y = Math.sin(atMs / 260) * 0.08;
    },
  };
};

export const CLAY_ENVIRONMENT_FACTORIES: Record<ClayEnvironmentId, ClayEnvironmentFactory> = {
  washboard,
  mud,
  water,
  ice,
  crosswind,
  rain,
  'low-tunnel': lowTunnel,
  'dark-cave': darkCave,
  'soft-blocks': softBlocks,
  jump,
};

export function createClayEnvironment(kit: ClayGeometryKit, id: ClayEnvironmentId): ClayEnvironmentVisual {
  return CLAY_ENVIRONMENT_FACTORIES[id](kit);
}
