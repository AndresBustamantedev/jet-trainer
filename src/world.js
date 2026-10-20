// Island terrain, water, sky, clouds, trees and a small town.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { planSites, shapeGround, nearSite, buildPlaces } from './places.js';

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
  return out - 2.5 * smoothstep(0, -2, out); // keep the seabed a little clear of the water surface
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

// Low evening-ish sun: long shadows give the land depth.
export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, 0.45).normalize();
const SUN_GLOW = new THREE.Color('#ffd9a8');
const v3 = (v) => `vec3(${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)})`;
const c3 = (c) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;

// The look, dialed in with the ?tune panel. scene.fog carries haze color, density (near) and falloff (far).
export const DEFAULT_LOOK = {
  toneMapping: 'neutral',
  exposure: 1.0,
  sun: 3.0,
  ambient: 0.6,
  haze: '#c4d4e0',
  zenith: '#2c5f9e',
  hazeDensity: 0.00011,
  hazeFalloff: 0.0011,
  cloudOpacity: 0.9,
  bloom: 0.45,
};

// Height haze: thick low down, thinner with altitude, warmer toward the sun.
const hazeGlsl = (color, density, falloff) => /* glsl */ `
vec3 hazeMix(vec3 col, vec3 wp) {
  vec3 ray = wp - cameraPosition;
  float dist = length(ray);
  vec3 dir = ray / max(dist, 0.001);
  float bdh = ${falloff} * ray.y;
  float k = abs(bdh) > 0.0001 ? (1.0 - exp(-bdh)) / bdh : 1.0;
  float amount = ${density} * exp(-${falloff} * max(cameraPosition.y, 0.0)) * dist * k;
  float f = 1.0 - exp(-amount);
  float glow = pow(max(dot(dir, ${v3(SUN_DIR)}), 0.0), 8.0) * 0.55;
  return mix(col, mix(${color}, ${c3(SUN_GLOW)}, glow), f);
}`;

// Replace three's flat fog with the haze for every built-in material.
THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
varying float vFogDepth;
varying vec3 vFogWorld;
#endif`;
THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
vFogDepth = - mvPosition.z;
vec4 fogWorld = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
fogWorld = instanceMatrix * fogWorld;
#endif
vFogWorld = (modelMatrix * fogWorld).xyz;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = `#ifdef USE_FOG
uniform vec3 fogColor;
varying float vFogDepth;
varying vec3 vFogWorld;
uniform float fogNear;
uniform float fogFar;
${hazeGlsl('fogColor', 'fogNear', 'fogFar')}
#endif`;
THREE.ShaderChunk.fog_fragment = `#ifdef USE_FOG
gl_FragColor.rgb = hazeMix(gl_FragColor.rgb, vFogWorld);
#endif`;

// Terrain colors are worked out per pixel from height, slope and noise, so the ground
// stays sharp up close instead of showing the 29 m triangle grid.
function terrainMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, envMapIntensity: 0.3 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float aForest;
attribute float aPlace;
attribute vec2 aBake;
varying float vForest;
varying float vPlace;
varying vec2 vBake;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec2 vNoise;
${GLSL_NOISE}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vForest = aForest;
vPlace = aPlace;
vBake = aBake;
vWPos = (modelMatrix * vec4(position, 1.0)).xyz;
vWNormal = normalize(mat3(modelMatrix) * normal);
// Large patches change slowly, so they are worked out per vertex (29 m apart), not per pixel.
vNoise = vec2(wFbm(vWPos.xz * 0.0012), wFbm(vWPos.xz * 0.011));`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vForest;
varying float vPlace;
varying vec2 vBake;
varying vec3 vWPos;
varying vec3 vWNormal;
varying vec2 vNoise;
${GLSL_NOISE}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
// Baked at load: x is how much sun reaches here (mountain shadows), y is open sky (valleys darker).
reflectedLight.directDiffuse *= vBake.x;
reflectedLight.directSpecular *= vBake.x;
reflectedLight.indirectDiffuse *= vBake.y;`)
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

  // Places (town, base, airfield...) sit on packed dirt.
  vec3 dirt = mix(vec3(0.19, 0.17, 0.13), vec3(0.25, 0.23, 0.19), mid);
  col = mix(col, dirt, vPlace * (1.0 - beach));

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

// Bilinear sample of a value stored per terrain grid point.
function sampleGrid(grid, x, z, outside) {
  const fx = (x + HALF) / CELL;
  const fz = (z + HALF) / CELL;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  if (ix < 0 || iz < 0 || ix >= N || iz >= N) return outside;
  const tx = fx - ix;
  const tz = fz - iz;
  const r0 = iz * (N + 1) + ix;
  const r1 = r0 + N + 1;
  const a = grid[r0] + (grid[r0 + 1] - grid[r0]) * tx;
  const b = grid[r1] + (grid[r1 + 1] - grid[r1]) * tx;
  return a + (b - a) * tz;
}

// The sun never moves, so mountain shadows and valley darkening are worked out once at load
// and cost nothing while flying. sunVis: 1 in sun, 0 in a mountain's shadow, soft at the edge.
// openSky: how much sky a point sees, lower in valleys and gullies.
function bakeLight(heights) {
  const sunVis = new Float32Array(heights.length);
  const openSky = new Float32Array(heights.length);
  let maxH = -Infinity;
  for (const h of heights) maxH = Math.max(maxH, h);
  const step = 24;
  const dirs = [];
  for (let k = 0; k < 8; k++) dirs.push([Math.cos((k / 8) * Math.PI * 2), Math.sin((k / 8) * Math.PI * 2)]);
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const g = iz * (N + 1) + ix;
      const x = -HALF + ix * CELL;
      const z = -HALF + iz * CELL;
      const h0 = heights[g];
      if (h0 < -3) {
        sunVis[g] = 1;
        openSky[g] = 1;
        continue;
      }
      let minRatio = 1;
      for (let t = step; t < 4000; t += step) {
        const py = h0 + 1 + SUN_DIR.y * t;
        if (py > maxH) break;
        const r = (py - sampleGrid(heights, x + SUN_DIR.x * t, z + SUN_DIR.z * t, WORLD.seaFloor)) / t;
        if (r < minRatio) minRatio = r;
        if (minRatio < -0.02) break;
      }
      sunVis[g] = smoothstep(-0.01, 0.05, minRatio);
      let occ = 0;
      for (const [dx, dz] of dirs) {
        let m = 0;
        for (const d of [40, 110, 260]) m = Math.max(m, (sampleGrid(heights, x + dx * d, z + dz * d, WORLD.seaFloor) - h0) / d);
        occ += m / (1 + m);
      }
      openSky[g] = 1 - 0.8 * (occ / dirs.length);
    }
  }
  return { sunVis, openSky };
}

// A soft cumulus puff drawn on a canvas: many faint round blobs, flatter at the bottom.
function cloudTexture(rand) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * 55;
    const x = 128 + Math.cos(ang) * rr * 1.25;
    const y = 140 + Math.sin(ang) * rr * 0.7 - rand() * 20;
    const r = 24 + rand() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255, 255, 255, 0.5)');
    grd.addColorStop(1, 'rgba(255, 255, 255, 0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.generateMipmaps = true;
  return tex;
}

function cloudLayer(scene, rand, look, haze) {
  if (typeof document === 'undefined') return null; // headless tests
  const max = 1200;
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      map: { value: cloudTexture(rand) },
      opacity: { value: look.cloudOpacity },
      lit: { value: new THREE.Color('#ffffff') },
      shade: { value: new THREE.Color('#8fa3ba') },
      ...haze,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aRot;
      attribute float aShade;
      varying vec2 vUv;
      varying float vY;
      varying float vFade;
      varying float vShade;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 center = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 size = vec2(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz));
        float c = cos(aRot);
        float s = sin(aRot);
        vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * size;
        vec4 mv = viewMatrix * center;
        mv.xy += p;
        vY = position.y;
        vShade = aShade;
        vWorld = center.xyz;
        vFade = smoothstep(60.0, 380.0, length(mv.xyz)); // thin out when flying through
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform float opacity;
      uniform vec3 lit;
      uniform vec3 shade;
      uniform vec3 hazeColor;
      uniform float hazeDensity;
      uniform float hazeFalloff;
      varying vec2 vUv;
      varying float vY;
      varying float vFade;
      varying float vShade;
      varying vec3 vWorld;
      #include <logdepthbuf_pars_fragment>
      ${hazeGlsl('hazeColor', 'hazeDensity', 'hazeFalloff')}
      void main() {
        #include <logdepthbuf_fragment>
        float a = texture2D(map, vUv).a * opacity * vFade;
        if (a < 0.004) discard;
        float t = clamp(vY + 0.5, 0.0, 1.0);
        vec3 col = mix(shade, lit, smoothstep(0.05, 0.85, t) * 0.75 + vShade * 0.25);
        float toward = pow(max(dot(normalize(vWorld - cameraPosition), ${v3(SUN_DIR)}), 0.0), 6.0);
        col += ${c3(SUN_GLOW)} * toward * 0.35;
        col = hazeMix(col, vWorld);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const geo = new THREE.PlaneGeometry(1, 1);
  const rot = new Float32Array(max);
  const shadeA = new Float32Array(max);
  const mesh = new THREE.InstancedMesh(geo, material, max);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  let k = 0;
  for (let cl = 0; cl < 95 && k < max; cl++) {
    const cx = (rand() * 2 - 1) * 8000;
    const cz = (rand() * 2 - 1) * 8000;
    const cy = 850 + rand() * 550;
    const n = 8 + Math.floor(rand() * 7);
    for (let j = 0; j < n && k < max; j++) {
      const size = 140 + rand() * 180;
      sc.set(size, size * 0.75, 1);
      m.compose(p.set(cx + (rand() - 0.5) * 600, cy + rand() * 70, cz + (rand() - 0.5) * 400), q, sc);
      mesh.setMatrixAt(k, m);
      rot[k] = (rand() - 0.5) * 0.5;
      shadeA[k] = rand();
      k++;
    }
  }
  mesh.count = k;
  geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(rot, 1));
  geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(shadeA, 1));
  mesh.frustumCulled = false;
  scene.add(mesh);
  return mesh;
}

// Merge parts that each have one flat color into a single geometry with vertex colors.
export function coloredMerge(parts) {
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
  const look = { ...DEFAULT_LOOK };
  scene.fog = new THREE.Fog(look.haze, look.hazeDensity, look.hazeFalloff);
  const time = { value: 0 };
  const haze = {
    hazeColor: { value: new THREE.Color(look.haze) },
    hazeDensity: { value: look.hazeDensity },
    hazeFalloff: { value: look.hazeFalloff },
  };

  const hemi = new THREE.HemisphereLight('#bcd3ea', '#4a4234', look.ambient);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff0d9', look.sun);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  // The shadow box is small and follows the jet. Mountain shadows are baked into the terrain instead.
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 700 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  // Sky: haze color at the horizon (the same color distant ground fades to), deep blue overhead,
  // a warm glow and a bright disc at the sun.
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { zenith: { value: new THREE.Color(look.zenith) }, hazeColor: haze.hazeColor },
    vertexShader: /* glsl */ `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith;
      uniform vec3 hazeColor;
      varying vec3 vDir;
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 d = normalize(vDir);
        float up = max(d.y, 0.0);
        vec3 col = mix(hazeColor, zenith, pow(up, 0.5));
        if (d.y < 0.0) col = hazeColor * mix(1.0, 0.85, min(-d.y * 4.0, 1.0));
        float sd = max(dot(d, ${v3(SUN_DIR)}), 0.0);
        col = mix(col, ${c3(SUN_GLOW)}, pow(sd, 8.0) * 0.55 * (1.0 - 0.6 * up));
        col += ${c3(SUN_GLOW)} * pow(sd, 90.0) * 0.5;
        col += vec3(1.0, 0.96, 0.88) * smoothstep(0.99965, 0.9998, sd) * 14.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(25000, 32, 16), skyMaterial);
  sky.renderOrder = -1;
  scene.add(sky);

  // Reflections and sky light: bake the sky into an environment map.
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMaterial));
  let envTarget = null;
  function bakeEnvironment() {
    if (!renderer.isWebGLRenderer) return;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const next = pmrem.fromScene(envScene, 0, 0.1, 1000);
    pmrem.dispose();
    if (envTarget) envTarget.dispose();
    envTarget = next;
    scene.environment = next.texture;
  }
  bakeEnvironment();

  // Terrain heights, then the places: pick their spots and level the ground under them.
  const heights = new Float32Array((N + 1) * (N + 1));
  const pave = new Float32Array((N + 1) * (N + 1));
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) heights[iz * (N + 1) + ix] = terrainHeightRaw(-HALF + ix * CELL, -HALF + iz * CELL);
  }
  const sites = planSites(groundHeight, mulberry32(4242), WORLD.bound);
  shapeGround(heights, pave, sites, N, CELL, HALF);

  const geo = new THREE.PlaneGeometry(S, S, N, N);
  geo.rotateX(-Math.PI / 2);
  geo.deleteAttribute('uv');
  const pos = geo.attributes.position;
  const forest = new Float32Array(pos.count);
  const place = new Float32Array(pos.count);
  const gridIndex = new Int32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const g = Math.round((z + HALF) / CELL) * (N + 1) + Math.round((x + HALF) / CELL);
    pos.setY(i, heights[g]);
    forest[i] = forestAt(x, z);
    place[i] = pave[g];
    gridIndex[i] = g;
  }
  geo.setAttribute('aForest', new THREE.BufferAttribute(forest, 1));
  geo.setAttribute('aPlace', new THREE.BufferAttribute(place, 1));
  geo.computeVertexNormals();
  const { sunVis, openSky } = bakeLight(heights);
  const bake = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const g = gridIndex[i];
    bake[i * 2] = sunVis[g];
    bake[i * 2 + 1] = openSky[g];
  }
  geo.setAttribute('aBake', new THREE.BufferAttribute(bake, 2));
  const terrain = new THREE.Mesh(geo, terrainMaterial());
  terrain.receiveShadow = true;
  scene.add(terrain);

  // Height on the drawn triangles themselves (not a smooth blend), so things stand exactly on
  // the ground you see. Each grid cell is split along the same diagonal as the terrain mesh.
  function groundHeight(x, z) {
    const fx = (x + HALF) / CELL;
    const fz = (z + HALF) / CELL;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    if (ix < 0 || iz < 0 || ix >= N || iz >= N) return WORLD.seaFloor;
    const tx = fx - ix;
    const tz = fz - iz;
    const a = heights[iz * (N + 1) + ix];
    const d = heights[iz * (N + 1) + ix + 1];
    const b = heights[(iz + 1) * (N + 1) + ix];
    const c = heights[(iz + 1) * (N + 1) + ix + 1];
    if (tx + tz <= 1) return a + (d - a) * tx + (b - a) * tz;
    return c + (b - c) * (1 - tx) + (d - c) * (1 - tz);
  }
  function lightAt(x, z) {
    // Combined baked light for objects standing on the ground (trees, buildings).
    return (0.55 + 0.45 * sampleGrid(sunVis, x, z, 1)) * (0.6 + 0.4 * sampleGrid(openSky, x, z, 1));
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
    if (h < 8 || h > 300 || slopeAt(x, z) > 0.5 || nearSite(sites, x, z, 25)) continue;
    const dense = forestAt(x, z);
    if (dense < 0.5 && rand() > 0.03) continue; // a few lone trees outside forests
    const pine = h > 120 ? rand() < 0.85 : rand() < 0.35;
    const height = pine ? 14 + rand() * 12 : 10 + rand() * 8;
    sc.set(height * (0.75 + rand() * 0.2), height, height * (0.75 + rand() * 0.2));
    m.compose(p.set(x, h - 0.8, z), q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * 6.28), sc);
    const g = (0.75 + rand() * 0.35) * lightAt(x, z);
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

  // Town, airfield, base, industrial area, villages and radar station.
  const { sets, rooftops } = buildPlaces(scene, sites, { groundHeight, lightAt, rand });
  const townSite = sites.find((x) => x.kind === 'town');
  const town = townSite ? new THREE.Vector2(townSite.x, townSite.z) : null;

  // Clouds: soft billboards, lit from above and hazed like everything else.
  const clouds = cloudLayer(scene, rand, look, haze);
  const fullCounts = { pines: pines.count, leafy: leafy.count, clouds: clouds ? clouds.count : 0 };

  const TONE = {
    neutral: THREE.NeutralToneMapping,
    agx: THREE.AgXToneMapping,
    aces: THREE.ACESFilmicToneMapping,
  };

  function setLook(next) {
    const toneBefore = renderer.toneMapping;
    Object.assign(look, next);
    renderer.toneMapping = TONE[look.toneMapping] ?? THREE.NeutralToneMapping;
    renderer.toneMappingExposure = look.exposure;
    sun.intensity = look.sun;
    hemi.intensity = look.ambient;
    scene.fog.color.set(look.haze);
    scene.fog.near = look.hazeDensity;
    scene.fog.far = look.hazeFalloff;
    haze.hazeColor.value.set(look.haze);
    haze.hazeDensity.value = look.hazeDensity;
    haze.hazeFalloff.value = look.hazeFalloff;
    skyMaterial.uniforms.zenith.value.set(look.zenith);
    if (clouds) clouds.material.uniforms.opacity.value = look.cloudOpacity;
    if (renderer.toneMapping !== toneBefore) scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }
  setLook(look);

  // Where the segment p0 to p1 first enters a building, as a 0..1 fraction, or -1.
  function segmentBox(p0, p1, b) {
    let tmin = 0;
    let tmax = 1;
    for (let a = 0; a < 3; a++) {
      const o = a === 0 ? p0.x : a === 1 ? p0.y : p0.z;
      const d = (a === 0 ? p1.x : a === 1 ? p1.y : p1.z) - o;
      if (Math.abs(d) < 1e-9) {
        if (o < b.min[a] || o > b.max[a]) return -1;
        continue;
      }
      let t1 = (b.min[a] - o) / d;
      let t2 = (b.max[a] - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return -1;
    }
    return tmin;
  }

  // Bullets: point where p0 to p1 hits a building, or null. Most bullets skip out at the town check.
  function buildingHit(p0, p1, out) {
    let best = 2;
    for (const set of sets) {
      const lo = set.min;
      const hi = set.max;
      if (Math.max(p0.x, p1.x) < lo[0] || Math.min(p0.x, p1.x) > hi[0] || Math.min(p0.y, p1.y) > hi[1]
        || Math.max(p0.z, p1.z) < lo[2] || Math.min(p0.z, p1.z) > hi[2]) continue;
      for (const b of set.boxes) {
        const t = segmentBox(p0, p1, b);
        if (t >= 0 && t < best) best = t;
      }
    }
    return best <= 1 ? out.copy(p0).lerp(p1, best) : null;
  }

  // The jet (or a spawn spot): is a sphere of this radius touching a building?
  function insideBuilding(p, radius) {
    for (const set of sets) {
      if (p.x < set.min[0] - radius || p.x > set.max[0] + radius || p.y > set.max[1] + radius
        || p.z < set.min[2] - radius || p.z > set.max[2] + radius) continue;
      for (const b of set.boxes) {
        const dx = Math.max(b.min[0] - p.x, 0, p.x - b.max[0]);
        const dy = Math.max(b.min[1] - p.y, 0, p.y - b.max[1]);
        const dz = Math.max(b.min[2] - p.z, 0, p.z - b.max[2]);
        if (dx * dx + dy * dy + dz * dz < radius * radius) return true;
      }
    }
    return false;
  }

  return {
    groundHeight,
    slopeAt,
    town,
    buildingHit,
    insideBuilding,
    rooftops, // flat roofs soldiers can stand on
    sites,
    sun,
    look,
    setLook,
    bakeEnvironment,
    // Performance mode draws about half the trees and clouds.
    setDetail(high) {
      const f = high ? 1 : 0.55;
      pines.count = Math.round(fullCounts.pines * f);
      leafy.count = Math.round(fullCounts.leafy * f);
      if (clouds) clouds.count = Math.round(fullCounts.clouds * (high ? 1 : 0.6));
    },
    update(camera, focus) {
      time.value = performance.now() / 1000;
      sky.position.copy(camera.position);
      sun.target.position.copy(focus);
      sun.position.copy(focus).addScaledVector(SUN_DIR, 300);
    },
  };
}
