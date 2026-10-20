// Island terrain, water, sky, clouds, trees and a small town.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WORLD = {
  size: 11000,
  segments: 384,
  seaFloor: -60,
  bound: 4800, // combat area half width
};

const N = WORLD.segments;
const S = WORLD.size;
const HALF = S / 2;
const CELL = S / N;

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function valueNoise(x, z, seed) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x, z, octaves, seed) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, z * freq, seed + i * 17);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function terrainHeightRaw(x, z) {
  const s = 1 / 1500;
  const base = fbm(x * s, z * s, 6, 11);
  const ridge = 1 - Math.abs(fbm(x * s * 1.6 + 40, z * s * 1.6 - 25, 5, 53) * 2 - 1);
  const mountains = smoothstep(0.48, 0.68, base);
  const h = (base - 0.36) * 480 + ridge * ridge * ridge * 420 * mountains;
  const mask = 1 - smoothstep(0.6, 0.97, Math.hypot(x, z) / HALF);
  const out = h * mask + WORLD.seaFloor * (1 - mask);
  // The seabed drops 20 m just past the shoreline, so it is never close enough to the water
  // surface for the two to fight over depth far away (that showed as flickering water).
  return out - 20 * smoothstep(0, -1.5, out);
}

// Where forests grow. Used for both tree placement and the darker forest floor.
const forestAt = (x, z) => fbm(x / 700, z / 700, 2, 99);

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GLSL_NOISE = /* glsl */ `
float wHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float wNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wFbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * wNoise(p);
    p = p * 2.03 + vec2(17.1, 9.7);
    a *= 0.5;
  }
  return s / 0.9375;
}`;

// Terrain colors are worked out per pixel from height, slope and noise, so the ground
// stays sharp up close instead of showing the 29 m triangle grid.
function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, envMapIntensity: 0.35 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aForest;
varying float vForest;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec2 vNoise;
${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vForest = aForest;
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWNormal = normalize(mat3(modelMatrix) * normal);
// Large patches change slowly, so they are worked out per vertex (29 m apart), not per pixel.
vNoise = vec2(wFbm(vWPos.xz * 0.0012), wFbm(vWPos.xz * 0.011));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vForest;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec2 vNoise;
${GLSL_NOISE}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  float h = vWPos.y;
  vec2 p = vWPos.xz;
  float slope = 1.0 - clamp(normalize(vWNormal).y, 0.0, 1.0);
  float macro = vNoise.x;
  float mid = vNoise.y;
  float fine = wNoise(p * 0.45) * 0.5 + wNoise(p * 1.7) * 0.5;

  vec3 grassA = vec3(0.105, 0.17, 0.05);
  vec3 grassB = vec3(0.17, 0.22, 0.07);
  vec3 dry = vec3(0.30, 0.27, 0.13);
  vec3 forest = vec3(0.045, 0.085, 0.035);
  vec3 sand = vec3(0.52, 0.45, 0.30);
  vec3 seabed = vec3(0.22, 0.27, 0.22);
  vec3 rockA = vec3(0.20, 0.19, 0.17);
  vec3 rockB = vec3(0.34, 0.32, 0.29);
  vec3 snow = vec3(0.86, 0.89, 0.93);

  vec3 col = mix(grassA, grassB, smoothstep(0.3, 0.7, mid));
  col = mix(col, dry, smoothstep(0.55, 0.78, macro) * 0.75);

  // Fields on low flat ground: a rotated grid of plots, each its own crop color.
  vec2 q = mat2(0.87, -0.5, 0.5, 0.87) * p;
  vec2 cellSize = vec2(150.0, 95.0);
  vec2 cell = floor(q / cellSize);
  vec2 inCell = fract(q / cellSize);
  float plot = wHash(cell);
  vec3 crop = plot < 0.33 ? vec3(0.32, 0.28, 0.12) : (plot < 0.66 ? vec3(0.14, 0.21, 0.06) : vec3(0.24, 0.22, 0.10));
  float edge = min(min(inCell.x, 1.0 - inCell.x) * cellSize.x, min(inCell.y, 1.0 - inCell.y) * cellSize.y);
  float farm = smoothstep(0.45, 0.35, macro) * (1.0 - smoothstep(0.03, 0.07, slope)) * smoothstep(6.0, 12.0, h) * (1.0 - smoothstep(90.0, 120.0, h));
  farm *= step(0.25, wHash(cell + 3.7));
  crop = mix(crop * 0.6, crop, smoothstep(1.5, 4.0, edge));
  crop *= 0.9 + 0.2 * wNoise(vec2(q.x * 0.02, q.y * 0.6) + plot * 40.0);
  col = mix(col, crop, farm);

  col = mix(col, forest, smoothstep(0.45, 0.56, vForest + (mid - 0.5) * 0.08) * (1.0 - farm));

  float rockMask = max(smoothstep(0.32, 0.46, slope + (fine - 0.5) * 0.12), smoothstep(250.0, 330.0, h + (mid - 0.5) * 80.0));
  vec3 rock = mix(rockA, rockB, 0.5 + 0.5 * sin(h * 0.12 + mid * 6.0));
  col = mix(col, rock, rockMask);

  float snowMask = smoothstep(380.0, 430.0, h + (mid - 0.5) * 70.0) * (1.0 - smoothstep(0.4, 0.6, slope));
  col = mix(col, snow, snowMask);

  float beach = 1.0 - smoothstep(2.5, 7.0, h + (fine - 0.5) * 3.0 + (mid - 0.5) * 4.0);
  col = mix(col, sand, beach);
  col = mix(col, seabed, smoothstep(0.0, -18.0, h));

  col *= 0.82 + 0.36 * fine * (1.0 - snowMask * 0.7);
  diffuseColor.rgb = col;
}`);
  };
  return m;
}

// Water with moving ripples. It is see-through, so shallow water near the shore shows the seabed.
function waterMaterial(time) {
  const m = new THREE.MeshStandardMaterial({
    color: '#1b5566', roughness: 0.07, metalness: 0, transparent: true, opacity: 0.84, envMapIntensity: 1.1,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uTime;
varying vec3 vWPos;
${GLSL_NOISE}
float waveH(vec2 p) {
  return wNoise(p * 0.05 + uTime * vec2(0.22, 0.15)) * 0.65
       + wNoise(p * 0.13 - uTime * vec2(0.18, 0.27)) * 0.35;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.32, smoothstep(150.0, 2500.0, length(vWPos - cameraPosition)));`)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
{
  vec2 wp = vWPos.xz;
  float e = 1.5;
  float h0 = waveH(wp);
  vec3 nW = normalize(vec3(-(waveH(wp + vec2(e, 0.0)) - h0) * 1.6 / e, 1.0, -(waveH(wp + vec2(0.0, e)) - h0) * 1.6 / e));
  float fade = 1.0 - smoothstep(60.0, 1200.0, length(vWPos - cameraPosition));
  nW = normalize(mix(vec3(0.0, 1.0, 0.0), nW, fade));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`);
  };
  return m;
}

// Merge parts that each have one flat color into a single geometry with vertex colors.
function coloredMerge(parts) {
  const geos = parts.map(([geo, hex]) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(hex);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    return g;
  });
  return mergeGeometries(geos);
}

export function createWorld(scene, renderer) {
  const sunDir = new THREE.Vector3(-0.45, 0.62, 0.35).normalize();
  const horizon = new THREE.Color('#cbdbe5');
  scene.fog = new THREE.Fog(horizon, 2200, 15000);
  const time = { value: 0 };

  scene.add(new THREE.HemisphereLight('#cfe3f5', '#5b5446', 1.3));
  const sun = new THREE.DirectionalLight('#fff1dc', 2.4);
  sun.position.copy(sunDir).multiplyScalar(1000);
  // The shadow box is small and follows the jet, so the jet shadows itself and the ground when low.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Sky dome that follows the camera.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(25000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color('#3f74ad') },
        horizon: { value: horizon.clone() },
        bottom: { value: new THREE.Color('#a3b8c5') },
        sunDir: { value: sunDir },
      },
      vertexShader: /* glsl */ `
        #include <common>
        #include <logdepthbuf_pars_vertex>
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          #include <logdepthbuf_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top;
        uniform vec3 horizon;
        uniform vec3 bottom;
        uniform vec3 sunDir;
        varying vec3 vDir;
        #include <logdepthbuf_pars_fragment>
        void main() {
          #include <logdepthbuf_fragment>
          vec3 d = normalize(vDir);
          vec3 col = d.y > 0.0 ? mix(horizon, top, pow(d.y, 0.55)) : mix(horizon, bottom, pow(-d.y, 0.4));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.92, 0.75) * pow(s, 700.0) * 3.0 + vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.22;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -1;
  scene.add(sky);

  // Reflections: bake the sky into an environment map once.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), sky.material));
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(envScene, 0, 0.1, 1000).texture;
  pmrem.dispose();

  // Terrain.
  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const heights = new Float32Array((N + 1) * (N + 1));
  const forest = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeightRaw(x, z);
    pos.setY(i, h);
    forest[i] = forestAt(x, z);
    const ix = Math.round((x + HALF) / CELL);
    const iz = Math.round((z + HALF) / CELL);
    heights[iz * (N + 1) + ix] = h;
  }
  geo.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, terrainMaterial());
  terrain.receiveShadow = true;
  scene.add(terrain);

  function groundHeight(x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return WORLD.seaFloor;
    const tx = fx - ix;
    const tz = fz - iz;
    const r0 = iz * (N + 1) + ix;
    const r1 = r0 + N + 1;
    const a = heights[r0] + (heights[r0 + 1] - heights[r0]) * tx;
    const b = heights[r1] + (heights[r1 + 1] - heights[r1]) * tx;
    return a + (b - a) * tz;
  }

  const water = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000).rotateX(-Math.PI / 2), waterMaterial(time));
  scene.add(water);

  const rand = mulberry32(1337);
  const slopeAt = (x, z) => Math.hypot(groundHeight(x + 15, z) - groundHeight(x - 15, z), groundHeight(x, z + 15) - groundHeight(x, z - 15)) / 30;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();

  // Trees: pines on higher ground, round broadleaf trees lower down.
  const pineGeo = coloredMerge([
    [new THREE.CylinderGeometry(0.06, 0.09, 0.25, 5).translate(0, 0.125, 0), '#4a3a2a'],
    [new THREE.ConeGeometry(0.5, 0.55, 7).translate(0, 0.45, 0), '#ffffff'],
    [new THREE.ConeGeometry(0.38, 0.45, 7).translate(0, 0.72, 0), '#ffffff'],
  ]);
  const leafGeo = coloredMerge([
    [new THREE.CylinderGeometry(0.06, 0.09, 0.35, 5).translate(0, 0.175, 0), '#4a3a2a'],
    [new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.85, 1).translate(0, 0.62, 0), '#ffffff'],
  ]);
  const treeMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const pines = new THREE.InstancedMesh(pineGeo, treeMat, 5000);
  const leafy = new THREE.InstancedMesh(leafGeo, treeMat, 4000);
  let np = 0;
  let nl = 0;
  for (let tries = 0; tries < 120000 && (np < pines.count || nl < leafy.count); tries++) {
    const x = (rand() * 2 - 1) * WORLD.bound;
    const z = (rand() * 2 - 1) * WORLD.bound;
    const h = groundHeight(x, z);
    if (h < 8 || h > 300 || slopeAt(x, z) > 0.5) continue;
    const dense = forestAt(x, z);
    if (dense < 0.5 && rand() > 0.03) continue; // a few lone trees outside forests
    const pine = h > 120 ? rand() < 0.85 : rand() < 0.35;
    const height = pine ? 14 + rand() * 12 : 10 + rand() * 8;
    sc.set(height * (0.75 + rand() * 0.2), height, height * (0.75 + rand() * 0.2));
    m.compose(p.set(x, h - 0.8, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * 6.28), sc);
    const g = 0.75 + rand() * 0.35;
    if (pine && np < pines.count) {
      tint.setRGB(0.09 * g, 0.17 * g, 0.08 * g);
      pines.setMatrixAt(np, m);
      pines.setColorAt(np++, tint);
    } else if (!pine && nl < leafy.count) {
      tint.setRGB(0.16 * g, 0.24 * g, 0.07 * g);
      leafy.setMatrixAt(nl, m);
      leafy.setColorAt(nl++, tint);
    }
  }
  pines.count = np;
  leafy.count = nl;
  scene.add(pines, leafy);

  // A town on the flattest low ground near the middle.
  let town = null;
  for (let i = 0; i < 400 && !town; i++) {
    const ang = i * 2.39996;
    const rad = 400 + i * 7;
    const x = Math.cos(ang) * rad;
    const z = Math.sin(ang) * rad;
    const h = groundHeight(x, z);
    if (h < 10 || h > 90) continue;
    const spread = [[300, 0], [-300, 0], [0, 300], [0, -300]].map(([dx, dz]) => Math.abs(groundHeight(x + dx, z + dz) - h));
    if (Math.max(...spread) < 22) town = new THREE.Vector2(x, z);
  }
  if (town) {
    const boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const roofGeo = new THREE.ConeGeometry(0.75, 0.35, 4, 1).rotateY(Math.PI / 4).translate(0, 1.17, 0);
    const blocks = new THREE.InstancedMesh(boxGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 400);
    const roofs = new THREE.InstancedMesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), 400);
    const walls = ['#b9b4aa', '#9a9690', '#c7c1b3', '#8b8f94', '#a59b8a', '#d1cbbd'].map((h) => new THREE.Color(h));
    const roofColors = ['#7a3b2e', '#5d4a3f', '#6b6f73'].map((h) => new THREE.Color(h));
    let b = 0;
    let r = 0;
    for (let gx = -12; gx <= 12; gx++) {
      for (let gz = -12; gz <= 12; gz++) {
        if (b >= blocks.count) break;
        const d = Math.hypot(gx, gz) / 12;
        if (d > 1 || rand() < d * 0.7 || gx % 4 === 0 || gz % 5 === 0) continue;
        const x = town.x + gx * 38 + (rand() - 0.5) * 8;
        const z = town.y + gz * 38 + (rand() - 0.5) * 8;
        const h = groundHeight(x, z);
        const tall = 8 + (1 - d) * (15 + rand() * 45);
        const house = d > 0.45 && rand() < 0.7;
        sc.set(14 + rand() * 12, house ? 7 + rand() * 4 : tall, 14 + rand() * 12);
        m.compose(p.set(x, h - 3, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, (rand() - 0.5) * 0.1), sc);
        blocks.setMatrixAt(b, m);
        blocks.setColorAt(b++, walls[Math.floor(rand() * walls.length)]);
        if (house) {
          roofs.setMatrixAt(r, m);
          roofs.setColorAt(r++, roofColors[Math.floor(rand() * roofColors.length)]);
        }
      }
    }
    blocks.count = b;
    roofs.count = r;
    scene.add(blocks, roofs);
  }

  // Clouds: clusters of flat-shaded puffs, mostly for a sense of speed up high.
  const puffs = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true, emissive: '#7d90a2', emissiveIntensity: 0.45 }),
    600,
  );
  let k = 0;
  for (let cl = 0; cl < 80; cl++) {
    const cx = (rand() * 2 - 1) * 8000;
    const cz = (rand() * 2 - 1) * 8000;
    const cy = 900 + rand() * 550;
    const n = 4 + Math.floor(rand() * 5);
    for (let j = 0; j < n && k < puffs.count; j++) {
      const rr = 60 + rand() * 110;
      sc.set(rr * (1 + rand() * 0.6), rr * 0.55, rr);
      m.compose(p.set(cx + (rand() - 0.5) * 320, cy + (rand() - 0.5) * 40, cz + (rand() - 0.5) * 220), q.identity(), sc);
      puffs.setMatrixAt(k++, m);
    }
  }
  puffs.count = k;
  scene.add(puffs);

  return {
    groundHeight,
    slopeAt,
    town,
    update(camera, focus) {
      time.value = performance.now() / 1000;
      sky.position.copy(camera.position);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(sunDir, 300);
    },
  };
}
