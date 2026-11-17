import * as THREE from 'three';
import type { MonsterCarRacePlan } from '@party/games';
import { COURSE_LENGTH, sampleCourse } from './courseMath';
import type { MonsterCarStory } from './presentation/ShowPlan';

const SKY_DAY = ['#72b9c6', '#f7cfad', '#8ca87c'].map((color) => new THREE.Color(color));
const SKY_TWILIGHT = ['#4c557c', '#a77f91', '#65776a'].map((color) => new THREE.Color(color));

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value / 4_294_967_296;
  };
}

function standard(color: string, roughness = 0.86) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const result = new THREE.Mesh(geometry, material);
  result.receiveShadow = true;
  result.castShadow = true;
  return result;
}

function ribbon(width: number, color: string, yOffset: number, segments = 240) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const point = sampleCourse(progress);
    for (const side of [-1, 1]) {
      positions.push(point.x, point.y + yOffset, point.z + side * width / 2);
      uvs.push(progress * 24, side < 0 ? 0 : 1);
    }
    if (index < segments) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return mesh(geometry, standard(color));
}

export class CourseVisual {
  readonly group = new THREE.Group();
  private readonly waterMaterials: THREE.ShaderMaterial[] = [];
  private skyMaterial: THREE.ShaderMaterial | null = null;
  private dayColors = SKY_DAY;
  private twilightColors = SKY_TWILIGHT;
  private storyPropVariant = 0;
  private readonly clouds: THREE.Group[] = [];
  private readonly cloudOrigins: number[] = [];
  private readonly winds: THREE.Group[] = [];
  private readonly ferrisWheel = new THREE.Group();

  constructor(plan: MonsterCarRacePlan, detailed = true, story?: MonsterCarStory) {
    if (story) {
      this.dayColors = story.dayColors.map((color) => new THREE.Color(color));
      this.twilightColors = story.twilightColors.map((color) => new THREE.Color(color));
      this.storyPropVariant = story.propVariant;
    }
    this.createSky();
    this.createMountains();
    this.createTerrain();
    this.createForest(detailed ? 150 : 90);
    this.createFlowers(detailed ? 240 : 120);
    this.createStoryProps();
    this.createRiver();
    this.createClouds();
    this.createLightShafts();
    for (const event of plan.events) this.createEvent(event.kind, event.progress, event.variant);
    this.createPlayground();
  }

  private createSky() {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(this.dayColors[0]!) },
        middleColor: { value: new THREE.Color(this.dayColors[1]!) },
        bottomColor: { value: new THREE.Color(this.dayColors[2]!) },
      },
      vertexShader: 'varying vec3 vWorld; void main(){ vec4 world = modelMatrix * vec4(position,1.0); vWorld = world.xyz; gl_Position = projectionMatrix * viewMatrix * world; }',
      fragmentShader: 'varying vec3 vWorld; uniform vec3 topColor; uniform vec3 middleColor; uniform vec3 bottomColor; void main(){ float h=normalize(vWorld).y; vec3 c=mix(bottomColor,middleColor,smoothstep(-0.12,0.12,h)); c=mix(c,topColor,smoothstep(0.05,0.65,h)); gl_FragColor=vec4(c,1.0); }',
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(240, 32, 18), material);
    this.skyMaterial = material;
    sky.position.set(COURSE_LENGTH / 2, 0, 0);
    sky.castShadow = false;
    sky.receiveShadow = false;
    this.group.add(sky);

    const sun = mesh(new THREE.SphereGeometry(4.5, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff0ba' }));
    sun.position.set(40, 25, -70);
    sun.castShadow = false;
    this.group.add(sun);
  }

  private createMountains() {
    const rng = randomFrom(7419);
    const colors = ['#719b98', '#72958e', '#87aaa0', '#5f8588'];
    for (let index = 0; index < 24; index += 1) {
      const height = 11 + rng() * 17;
      const radius = 8 + rng() * 9;
      const mountain = mesh(new THREE.ConeGeometry(radius, height, 5), standard(colors[index % colors.length]!));
      mountain.position.set(-30 + index * 8.2, height / 2 - 1, -42 - rng() * 25);
      mountain.rotation.y = rng() * Math.PI;
      mountain.castShadow = false;
      this.group.add(mountain);
      if (index % 3 === 0) {
        const snow = mesh(new THREE.ConeGeometry(radius * 0.37, height * 0.28, 5), standard('#e8eee1'));
        snow.position.set(mountain.position.x, height * 0.85 - 1, mountain.position.z);
        snow.rotation.y = mountain.rotation.y;
        snow.castShadow = false;
        this.group.add(snow);
      }
    }
  }

  private createTerrain() {
    const foundation = mesh(new THREE.PlaneGeometry(260, 180), standard('#8ca87c'));
    foundation.rotation.x = -Math.PI / 2;
    foundation.position.set(COURSE_LENGTH / 2, -0.7, 0);
    foundation.castShadow = false;
    this.group.add(foundation);
    const meadow = ribbon(54, '#769d70', -0.22);
    meadow.receiveShadow = true;
    meadow.castShadow = false;
    this.group.add(meadow);
    const shoulder = ribbon(7.1, '#a2b77d', -0.04);
    shoulder.castShadow = false;
    this.group.add(shoulder);
    const road = ribbon(5.8, '#d6b88b', 0.025);
    road.castShadow = false;
    this.group.add(road);

    const rng = randomFrom(9377);
    const stoneGeometry = new THREE.DodecahedronGeometry(0.16, 0);
    const stones = new THREE.InstancedMesh(stoneGeometry, standard('#eee0ba'), 150);
    const transform = new THREE.Object3D();
    for (let index = 0; index < 150; index += 1) {
      const progress = index / 149;
      const point = sampleCourse(progress);
      const side = index % 2 ? -1 : 1;
      transform.position.set(point.x + (rng() - 0.5) * 0.3, point.y + 0.12, point.z + side * (3.05 + rng() * 0.25));
      transform.scale.set(0.7 + rng(), 0.55 + rng() * 0.5, 0.8 + rng());
      transform.rotation.set(rng(), rng(), rng());
      transform.updateMatrix();
      stones.setMatrixAt(index, transform.matrix);
    }
    stones.castShadow = true;
    stones.receiveShadow = true;
    this.group.add(stones);

    const dashGeometry = new THREE.BoxGeometry(1.2, 0.025, 0.075);
    const dashes = new THREE.InstancedMesh(dashGeometry, standard('#f7e7bd'), 40);
    for (let index = 0; index < 40; index += 1) {
      const progress = (index + 0.5) / 40;
      const point = sampleCourse(progress);
      transform.position.set(point.x, point.y + 0.055, point.z);
      transform.rotation.set(0, point.yaw, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      dashes.setMatrixAt(index, transform.matrix);
    }
    dashes.receiveShadow = true;
    this.group.add(dashes);
  }

  private createForest(count: number) {
    const rng = randomFrom(20260317);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 7), standard('#795c49'), count);
    const lowerCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.35, 0), standard('#ffffff'), count);
    const upperCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.05, 0), standard('#ffffff'), count);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      const progress = (index + rng() * 0.8) / count;
      const point = sampleCourse(progress);
      const side = -1;
      const distance = 7 + rng() * 22;
      const scale = 0.75 + rng() * 1.65;
      const x = point.x + (rng() - 0.5) * 2;
      const z = point.z + side * distance;
      const ground = Math.max(-0.2, point.y - 0.4);
      transform.position.set(x, ground + 1.2 * scale, z);
      transform.scale.set(scale, scale, scale);
      transform.rotation.set(0, rng() * Math.PI, 0);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      transform.position.y = ground + 3.0 * scale;
      transform.updateMatrix();
      lowerCrowns.setMatrixAt(index, transform.matrix);
      lowerCrowns.setColorAt(index, color.setHSL(0.36 + rng() * 0.055, 0.31 + rng() * 0.16, 0.48 + rng() * 0.1));
      transform.position.y = ground + 4.1 * scale;
      transform.scale.multiplyScalar(0.82);
      transform.updateMatrix();
      upperCrowns.setMatrixAt(index, transform.matrix);
      upperCrowns.setColorAt(index, color.setHSL(0.35 + rng() * 0.06, 0.36, 0.55 + rng() * 0.08));
    }
    for (const item of [trunks, lowerCrowns, upperCrowns]) {
      item.castShadow = true;
      item.receiveShadow = true;
      this.group.add(item);
    }
  }

  private createFlowers(count: number) {
    const rng = randomFrom(55812);
    const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.015, 0.02, 0.35, 5), standard('#4e805c'), count);
    const blossoms = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 7, 5), standard('#f6b6a8'), count);
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = ['#ffc6ae', '#f7df87', '#d8c3ed', '#f5eee0', '#efa4b6'];
    for (let index = 0; index < count; index += 1) {
      const progress = rng();
      const point = sampleCourse(progress);
      const side = rng() > 0.5 ? 1 : -1;
      const z = point.z + side * (3.7 + rng() * 4.5);
      const scale = 0.7 + rng() * 0.9;
      transform.position.set(point.x + (rng() - 0.5) * 2.5, point.y + 0.15, z);
      transform.scale.setScalar(scale);
      transform.rotation.set(0, rng() * Math.PI, 0);
      transform.updateMatrix();
      stems.setMatrixAt(index, transform.matrix);
      transform.position.y += 0.26 * scale;
      transform.updateMatrix();
      blossoms.setMatrixAt(index, transform.matrix);
      blossoms.setColorAt(index, color.set(palette[index % palette.length]!));
    }
    this.group.add(stems, blossoms);
  }

  private createStoryProps() {
    const count = 24;
    const geometry = this.storyPropVariant === 0
      ? new THREE.IcosahedronGeometry(0.16, 0)
      : this.storyPropVariant === 1
        ? new THREE.DodecahedronGeometry(0.17, 0)
        : new THREE.OctahedronGeometry(0.18, 0);
    const props = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.65 }),
      count,
    );
    const transform = new THREE.Object3D();
    const color = new THREE.Color();
    const palette = this.storyPropVariant === 0 ? ['#ffe99a', '#d7eaa0', '#f4c7a1']
      : this.storyPropVariant === 1 ? ['#c78d55', '#e2b76d', '#8e7654']
        : ['#f2a9b5', '#e8c2ed', '#f5df8b'];
    for (let index = 0; index < count; index += 1) {
      const progress = (index + 0.5) / count;
      const point = sampleCourse(progress);
      const side = index % 2 === 0 ? -1 : 1;
      const scale = 0.75 + (index % 4) * 0.16;
      transform.position.set(point.x, point.y + 0.25, point.z + side * (4.2 + (index % 3) * 0.35));
      transform.rotation.set(index * 0.3, index * 0.5, index * 0.2);
      transform.scale.set(scale, scale * (1 + this.storyPropVariant * 0.12), scale);
      transform.updateMatrix();
      props.setMatrixAt(index, transform.matrix);
      props.setColorAt(index, color.set(palette[index % palette.length]!));
    }
    props.castShadow = false;
    this.group.add(props);
  }

  private createRiver() {
    const material = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: { time: { value: 0 }, deep: { value: new THREE.Color('#4d9eaa') }, light: { value: new THREE.Color('#bce4d4') } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; uniform float time; uniform vec3 deep; uniform vec3 light; void main(){ float w=sin(vUv.x*95.0-time*2.4+sin(vUv.y*13.0))*0.5+0.5; float foam=smoothstep(0.88,1.0,w); vec3 c=mix(deep,light,0.35+foam*0.55); gl_FragColor=vec4(c,0.82); }',
    });
    this.waterMaterials.push(material);
    const river = mesh(new THREE.PlaneGeometry(COURSE_LENGTH + 35, 5, 80, 1), material);
    river.rotation.x = -Math.PI / 2;
    river.position.set(COURSE_LENGTH / 2, 0.05, -8.5);
    river.castShadow = false;
    this.group.add(river);
  }

  private createClouds() {
    const rng = randomFrom(8412);
    const material = new THREE.MeshStandardMaterial({ color: '#fff7e7', transparent: true, opacity: 0.76, roughness: 1, depthWrite: false });
    for (let index = 0; index < 13; index += 1) {
      const cloud = new THREE.Group();
      for (let puff = 0; puff < 5; puff += 1) {
        const item = mesh(new THREE.SphereGeometry(1.2 + rng() * 0.8, 12, 8), material);
        item.position.set(puff * 1.35, Math.sin(puff) * 0.45, rng() * 0.5);
        item.scale.y = 0.65;
        item.castShadow = false;
        cloud.add(item);
      }
      cloud.position.set(-20 + index * 13, 13 + rng() * 9, -26 - rng() * 20);
      cloud.scale.setScalar(0.65 + rng() * 0.8);
      this.clouds.push(cloud);
      this.cloudOrigins.push(cloud.position.x);
      this.group.add(cloud);
    }
  }

  private createLightShafts() {
    const material = new THREE.MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0.055, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    for (let index = 0; index < 9; index += 1) {
      const shaft = mesh(new THREE.ConeGeometry(2.5, 18, 12, 1, true), material);
      shaft.position.set(6 + index * 13, 10, -2 - (index % 3) * 4);
      shaft.rotation.z = -0.32;
      shaft.castShadow = false;
      this.group.add(shaft);
    }
  }

  private createEvent(kind: string, progress: number, variant: number) {
    const point = sampleCourse(progress);
    const group = new THREE.Group();
    group.position.set(point.x, point.y + 0.05, point.z);
    group.rotation.y = point.yaw;
    group.scale.set(1 + variant * 0.04, 1, 1 + variant * 0.06);
    if (kind === 'puddle') {
      const material = new THREE.MeshPhysicalMaterial({ color: '#72bfd0', roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.82 });
      const water = mesh(new THREE.CircleGeometry(2.25, 40), material);
      water.rotation.x = -Math.PI / 2;
      water.scale.set(1, 0.58, 1);
      water.castShadow = false;
      group.add(water);
      for (let index = 0; index < 3; index += 1) {
        const ring = mesh(new THREE.TorusGeometry(0.45 + index * 0.38, 0.025, 6, 28), new THREE.MeshBasicMaterial({ color: '#d6f2e7', transparent: true, opacity: 0.55 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.set((variant - 1) * 0.3, 0.035, 0);
        group.add(ring);
      }
    } else if (kind === 'log') {
      const log = mesh(new THREE.CylinderGeometry(0.32, 0.38, 5.2, 12), standard('#855c42'));
      log.rotation.x = Math.PI / 2;
      log.position.y = 0.28;
      group.add(log);
      for (const z of [-2.62, 2.62]) {
        const cut = mesh(new THREE.CircleGeometry(0.31, 12), standard('#d8a66c'));
        cut.position.set(0, 0.28, z);
        cut.rotation.y = z > 0 ? 0 : Math.PI;
        group.add(cut);
      }
      for (let index = 0; index < 3; index += 1) {
        const mushroom = mesh(new THREE.SphereGeometry(0.18, 10, 6), standard('#f29b80'));
        mushroom.scale.y = 0.45;
        mushroom.position.set(0.1, 0.62, -1.5 + index * 1.3);
        group.add(mushroom);
      }
    } else if (kind === 'gust') {
      const material = new THREE.MeshBasicMaterial({ color: '#e7f5cf', transparent: true, opacity: 0.48, depthWrite: false });
      for (let index = 0; index < 4; index += 1) {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(-2.4, 0.5 + index * 0.38, -1.8 + index),
          new THREE.Vector3(-0.6, 1.1 + index * 0.4, -1.4 + index),
          new THREE.Vector3(1.2, 0.7 + index * 0.35, -1.7 + index),
          new THREE.Vector3(2.1, 1.4 + index * 0.3, -1.3 + index),
        ]);
        const line = mesh(new THREE.TubeGeometry(curve, 20, 0.025, 5, false), material);
        line.castShadow = false;
        group.add(line);
      }
      this.winds.push(group);
    } else {
      const bump = mesh(new THREE.SphereGeometry(1.55, 20, 10), standard('#c6a479'));
      bump.scale.set(1.15, 0.23, 1.8);
      bump.position.y = -0.2;
      group.add(bump);
      for (const side of [-1, 1]) {
        const flag = mesh(new THREE.ConeGeometry(0.18, 0.42, 5), standard('#f6cf72'));
        flag.position.set(0, 0.58, side * 2.5);
        group.add(flag);
      }
    }
    this.group.add(group);
  }

  private createPlayground() {
    const point = sampleCourse(1);
    const plaza = mesh(new THREE.CylinderGeometry(9, 9.4, 0.35, 48), standard('#91b879'));
    plaza.position.set(COURSE_LENGTH + 5, point.y - 0.1, point.z);
    this.group.add(plaza);

    const loopTrack = mesh(new THREE.RingGeometry(4.9, 6.9, 72), standard('#e4c895'));
    loopTrack.rotation.x = -Math.PI / 2;
    loopTrack.position.set(COURSE_LENGTH + 5, point.y + 0.1, point.z);
    loopTrack.castShadow = false;
    this.group.add(loopTrack);
    for (const radius of [5.35, 6.45]) {
      const lane = mesh(new THREE.TorusGeometry(radius, 0.025, 5, 72), new THREE.MeshBasicMaterial({ color: '#fff0c4' }));
      lane.rotation.x = Math.PI / 2;
      lane.position.set(COURSE_LENGTH + 5, point.y + 0.125, point.z);
      lane.castShadow = false;
      this.group.add(lane);
    }
    const padColors = ['#f28b78', '#8dc9b2', '#b4a0dc', '#f1cc69'];
    for (let index = 0; index < 4; index += 1) {
      const angle = index * Math.PI / 2 + Math.PI / 4;
      const pad = mesh(new THREE.BoxGeometry(1.05, 0.1, 1.35), standard(padColors[index]!));
      pad.position.set(COURSE_LENGTH + 5 + Math.cos(angle) * 5.9, point.y + 0.16, point.z + Math.sin(angle) * 5.9);
      pad.rotation.y = -angle;
      this.group.add(pad);
    }
    for (const side of [-1, 1]) {
      const balloons = new THREE.Group();
      balloons.position.set(COURSE_LENGTH + 5 + side * 7.1, point.y, point.z + 2.8);
      for (let index = 0; index < 5; index += 1) {
        const color = padColors[index % padColors.length]!;
        const balloon = mesh(new THREE.SphereGeometry(0.38, 14, 10), standard(color));
        balloon.scale.y = 1.25;
        balloon.position.set((index - 2) * 0.32, 3.5 + (index % 2) * 0.55, (index % 3 - 1) * 0.28);
        balloons.add(balloon);
        const string = mesh(new THREE.CylinderGeometry(0.012, 0.012, balloon.position.y - 0.25, 5), standard('#eee2c3'));
        string.position.set(balloon.position.x, (balloon.position.y - 0.25) / 2, balloon.position.z);
        balloons.add(string);
      }
      this.group.add(balloons);
    }

    this.ferrisWheel.position.set(COURSE_LENGTH + 7, point.y + 5.2, point.z - 10);
    const wheel = mesh(new THREE.TorusGeometry(4, 0.12, 10, 48), standard('#f7dfb0'));
    this.ferrisWheel.add(wheel);
    for (let index = 0; index < 8; index += 1) {
      const angle = index * Math.PI / 4;
      const spoke = mesh(new THREE.CylinderGeometry(0.045, 0.045, 8, 6), standard('#f7dfb0'));
      spoke.rotation.z = angle;
      this.ferrisWheel.add(spoke);
      const cabin = mesh(new THREE.SphereGeometry(0.42, 12, 8), standard(['#ef8e7e', '#f3ca6c', '#83bdae', '#a99bd5'][index % 4]!));
      cabin.position.set(Math.cos(angle) * 4, Math.sin(angle) * 4, 0);
      this.ferrisWheel.add(cabin);
    }
    this.group.add(this.ferrisWheel);
    for (const x of [COURSE_LENGTH + 5.6, COURSE_LENGTH + 8.4]) {
      const support = mesh(new THREE.CylinderGeometry(0.13, 0.22, 5.2, 8), standard('#795d54'));
      support.position.set(x, point.y + 2.4, point.z - 10);
      support.rotation.z = x < COURSE_LENGTH + 7 ? -0.27 : 0.27;
      this.group.add(support);
    }

    const poleMaterial = standard('#765b4d');
    for (const z of [-4.5, 4.5]) {
      const pole = mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.8, 8), poleMaterial);
      pole.position.set(COURSE_LENGTH + 1, point.y + 2.8, point.z + z);
      this.group.add(pole);
    }
    const flagColors = ['#f38f7d', '#f6d271', '#88c6af', '#b4a2dc'];
    for (let index = 0; index < 13; index += 1) {
      const flag = mesh(new THREE.ConeGeometry(0.25, 0.58, 3), standard(flagColors[index % 4]!));
      flag.rotation.z = Math.PI;
      flag.position.set(COURSE_LENGTH + 1, point.y + 5.2 - Math.sin(index / 12 * Math.PI) * 0.65, point.z - 4.5 + index * 0.75);
      this.group.add(flag);
    }
  }

  update(timeSeconds: number, reducedMotion = false, celebrationSeconds = 0) {
    const time = reducedMotion ? 0 : timeSeconds;
    const twilight = Math.max(0, Math.min(1, celebrationSeconds / 2));
    const easedTwilight = twilight * twilight * (3 - 2 * twilight);
    if (this.skyMaterial) {
      const colors = ['topColor', 'middleColor', 'bottomColor'] as const;
      colors.forEach((name, index) => {
        this.skyMaterial?.uniforms[name]?.value.lerpColors(this.dayColors[index]!, this.twilightColors[index]!, easedTwilight);
      });
    }
    for (const material of this.waterMaterials) material.uniforms.time!.value = reducedMotion ? 0 : timeSeconds % 3_600;
    this.clouds.forEach((cloud, index) => {
      cloud.position.x = (this.cloudOrigins[index] ?? cloud.position.x) + Math.sin(time * 0.08 + index) * 0.35;
    });
    this.winds.forEach((wind, index) => {
      wind.rotation.x = Math.sin(time * 2 + index) * 0.08;
      wind.scale.setScalar(0.95 + Math.sin(time * 3 + index) * 0.08);
    });
    this.ferrisWheel.rotation.z = time * 0.055;
  }

  dispose() {
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.group.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
  }
}
