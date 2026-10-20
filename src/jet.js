// Jet model built in code (no downloaded assets), plus afterburner, wingtip trails and the crash effect.
// Nose is -Z, up is +Y, right is +X. About 18 m long, 13.6 m span.
import * as THREE from 'three';

export const COCKPIT_LAYER = 1; // pilot, seat, canopy: chase view only
export const COCKPIT_VIEW_LAYER = 2; // panel, HUD glass, frame: cockpit view only

// Where the cockpit camera sits, in jet space. The cockpit parts are placed around it.
export const EYE = new THREE.Vector3(0, 0.95, -3.4);

// Two-tone grey camo and panel lines, computed from object-space position so no UVs are needed.
function camoPaint() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0.25, roughness: 0.52, envMapIntensity: 0.7 });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;\nvObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
varying vec3 vObj;
varying vec3 vObjN;
float camoHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float camoNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(camoHash(i), camoHash(i + vec2(1.0, 0.0)), u.x),
             mix(camoHash(i + vec2(0.0, 1.0)), camoHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`)
      .replace('#include <color_fragment>', /* glsl */ `#include <color_fragment>
{
  vec2 cp = vObj.xz * vec2(0.42, 0.26);
  float cn = camoNoise(cp) * 0.65 + camoNoise(cp * 2.3 + 7.1) * 0.35;
  vec3 camo = cn < 0.43 ? vec3(0.25, 0.28, 0.31) : (cn < 0.6 ? vec3(0.38, 0.42, 0.46) : vec3(0.54, 0.58, 0.61));
  float under = smoothstep(0.15, -0.45, vObjN.y);
  camo = mix(camo, vec3(0.6, 0.63, 0.66), under);
  float lz = abs(fract(vObj.z * 0.42 + 0.25) - 0.5);
  float lx = abs(fract(vObj.x * 0.55 + 0.1) - 0.5);
  float panel = mix(0.86, 1.0, smoothstep(0.004, 0.012, min(lz, lx)));
  diffuseColor.rgb *= camo * panel;
}`);
  };
  return m;
}

const PAINT = camoPaint();
const DARK = new THREE.MeshStandardMaterial({ color: '#2f3439', metalness: 0.5, roughness: 0.5 });
const METAL = new THREE.MeshStandardMaterial({ color: '#6c6660', metalness: 0.85, roughness: 0.35, side: THREE.DoubleSide });
const GLASS = new THREE.MeshPhysicalMaterial({
  color: '#d4b067', metalness: 0.9, roughness: 0.04, transparent: true, opacity: 0.6, envMapIntensity: 2.2,
});
const STORE = new THREE.MeshStandardMaterial({ color: '#d9dcdc', metalness: 0.2, roughness: 0.45 });
const PILOT = new THREE.MeshStandardMaterial({ color: '#2a2e2a', roughness: 0.7 });

// Body of revolution with super-ellipse sections. Each station: [z, halfWidth, top, bottom, shape, yOffset].
// shape 2 is an ellipse, below 2 gives sharp chines, above 2 gives a boxy section.
function loft(stations, segs = 40, capEnd = false) {
  const pos = [];
  const idx = [];
  for (const [z, w, t, b, n, y0 = 0] of stations) {
    const e = 2 / n;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      pos.push(w * Math.sign(c) * Math.pow(Math.abs(c), e), y0 + (s >= 0 ? t : b) * Math.sign(s) * Math.pow(Math.abs(s), e), z);
    }
  }
  for (let j = 0; j < stations.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * segs + i;
      const a1 = j * segs + ((i + 1) % segs);
      idx.push(a, a1, a + segs, a1, a1 + segs, a + segs);
    }
  }
  if (capEnd) {
    const last = stations[stations.length - 1];
    const center = pos.length / 3;
    pos.push(0, last[5] || 0, last[0]);
    const base = (stations.length - 1) * segs;
    for (let i = 0; i < segs; i++) idx.push(center, base + i, base + ((i + 1) % segs));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Tapered surface with a NACA 00xx section. The span runs along +X from the root.
function wing({ rootChord, tipChord, span, rootLE, tipLE, thick = 0.05, tipThick = thick, rise = 0, n = 12 }) {
  const us = [];
  for (let i = 0; i <= n; i++) us.push((1 - Math.cos((Math.PI * i) / n)) / 2);
  const half = (u, t) => 5 * t * (0.2969 * Math.sqrt(u) - 0.126 * u - 0.3516 * u * u + 0.2843 * u ** 3 - 0.1036 * u ** 4);
  const sections = [
    { x: 0, le: rootLE, c: rootChord, y: 0, t: thick },
    { x: span, le: tipLE, c: tipChord, y: rise, t: tipThick },
  ];
  const pos = [];
  for (const s of sections) {
    for (let i = 0; i <= n; i++) pos.push(s.x, s.y + half(us[i], s.t) * s.c, s.le + us[i] * s.c);
    for (let i = n - 1; i >= 1; i--) pos.push(s.x, s.y - half(us[i], s.t) * s.c, s.le + us[i] * s.c);
  }
  const ring = 2 * n;
  const idx = [];
  for (let i = 0; i < ring; i++) {
    const a = i;
    const a1 = (i + 1) % ring;
    idx.push(a, a1, a + ring, a1, a1 + ring, a + ring);
  }
  const tip = sections[1];
  const center = pos.length / 3;
  pos.push(tip.x, tip.y, tip.le + tip.c * 0.4);
  for (let i = 0; i < ring; i++) idx.push(center, ring + i, ring + ((i + 1) % ring));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const FUSELAGE = loft([
  [-9.6, 0.02, 0.02, 0.02, 2, -0.12],
  [-9.1, 0.2, 0.15, 0.12, 1.6, -0.1],
  [-8.1, 0.42, 0.3, 0.22, 1.6, -0.06],
  [-6.6, 0.66, 0.47, 0.34, 1.7, -0.02],
  [-5.0, 0.84, 0.6, 0.42, 1.8, 0],
  [-3.5, 1.05, 0.64, 0.48, 1.9, 0],
  [-2.0, 1.55, 0.6, 0.54, 2.3, 0],
  [0.0, 1.85, 0.57, 0.58, 2.7, 0],
  [2.5, 1.9, 0.55, 0.57, 2.8, 0],
  [5.0, 1.72, 0.5, 0.54, 2.6, 0],
  [7.0, 1.45, 0.45, 0.5, 2.4, 0],
  [8.45, 1.28, 0.42, 0.46, 2.2, 0],
], 48, true);

const CANOPY = loft([
  [-6.9, 0.04, 0.02, 0.01, 2, 0.4],
  [-6.1, 0.33, 0.27, 0.01, 2.2, 0.44],
  [-5.1, 0.46, 0.43, 0.01, 2.2, 0.52],
  [-4.0, 0.48, 0.46, 0.01, 2.2, 0.57],
  [-3.0, 0.4, 0.36, 0.01, 2.2, 0.6],
  [-2.2, 0.06, 0.05, 0.01, 2, 0.6],
], 32);

const INTAKE = loft([
  [-3.3, 0.42, 0.34, 0.36, 5, -0.18],
  [-1.2, 0.46, 0.4, 0.4, 5, -0.2],
  [1.6, 0.28, 0.28, 0.3, 4, -0.12],
], 24);

const WING = wing({ rootChord: 8.0, tipChord: 1.5, span: 5.9, rootLE: -2.4, tipLE: 3.2, thick: 0.045, tipThick: 0.035, rise: -0.1 });
const LERX = wing({ rootChord: 4.6, tipChord: 1.0, span: 1.25, rootLE: -6.0, tipLE: -2.6, thick: 0.03 });
const STAB = wing({ rootChord: 2.8, tipChord: 1.0, span: 2.7, rootLE: -1.3, tipLE: 0.4, thick: 0.04 });
const FIN = wing({ rootChord: 3.4, tipChord: 1.2, span: 3.0, rootLE: 4.4, tipLE: 6.7, thick: 0.045 });

function missile() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 12).rotateX(Math.PI / 2), STORE));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.45, 12).rotateX(-Math.PI / 2), STORE);
  nose.position.z = -1.52;
  g.add(nose);
  for (let k = 0; k < 4; k++) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.32, 0.36), DARK);
    fin.position.z = 1.1;
    fin.rotation.z = (k * Math.PI) / 2 + Math.PI / 4;
    fin.translateY(0.15);
    g.add(fin);
  }
  return g;
}

// One side of the jet. The left side is the same group mirrored with scale.x = -1.
function buildSide(side) {
  const g = new THREE.Group();
  g.scale.x = side;

  const w = new THREE.Mesh(WING, PAINT);
  w.position.set(0.9, -0.08, 0);
  g.add(w);

  const lerx = new THREE.Mesh(LERX, PAINT);
  lerx.position.set(0.8, -0.04, 0);
  g.add(lerx);

  const intake = new THREE.Mesh(INTAKE, PAINT);
  intake.position.x = 1.55;
  g.add(intake);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.64).rotateY(Math.PI), DARK);
  mouth.position.set(1.55, -0.19, -3.28);
  g.add(mouth);

  const stab = new THREE.Group();
  stab.position.set(1.3, -0.02, 6.9);
  stab.add(new THREE.Mesh(STAB, PAINT));
  g.add(stab);

  const fin = new THREE.Mesh(FIN, PAINT);
  fin.position.set(1.05, 0.32, 0);
  fin.rotation.z = THREE.MathUtils.degToRad(64);
  g.add(fin);

  const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 1.2), DARK);
  pylon.position.set(3.7, -0.27, 1.3);
  g.add(pylon);
  const m = missile();
  m.position.set(3.7, -0.5, 1.2);
  g.add(m);
  // Inner pylon, used by the attack jet's bombs.
  const inner = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 1.0), DARK);
  inner.position.set(2.4, -0.27, 0.8);
  inner.visible = false;
  g.add(inner);

  const nav = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 8, 6),
    new THREE.MeshBasicMaterial({ color: side < 0 ? '#ff3b30' : '#34ff7a' }),
  );
  nav.position.set(6.8, -0.18, 4.0);
  g.add(nav);

  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.58, 1.3, 14, 1, true).rotateX(Math.PI / 2), METAL);
  nozzle.position.set(0.72, -0.02, 9.0);
  g.add(nozzle);

  return { group: g, stab, missile: m, inner };
}

// Colors above 1 are brighter than white, so High mode's bloom makes them glow.
function flameMat(color, opacity, boost = 2) {
  return new THREE.MeshBasicMaterial({
    color: new THREE.Color(color).multiplyScalar(boost), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
}

function buildModel() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(FUSELAGE, PAINT));
  const canopy = new THREE.Mesh(CANOPY, GLASS);
  g.add(canopy);

  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), PILOT);
  helmet.position.set(0, 0.86, -4.75);
  g.add(helmet);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.2), DARK);
  seat.position.set(0, 0.7, -4.45);
  g.add(seat);
  // Cockpit parts live on their own layer so the cockpit camera can skip them.
  for (const part of [canopy, helmet, seat]) part.layers.set(COCKPIT_LAYER);

  const sides = [buildSide(-1), buildSide(1)];
  for (const s of sides) g.add(s.group);

  const outerGeo = new THREE.ConeGeometry(0.42, 4.2, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, 2.1);
  const innerGeo = new THREE.ConeGeometry(0.26, 2.6, 14, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.3);
  const diamondGeo = new THREE.SphereGeometry(0.16, 10, 8);
  const glowGeo = new THREE.CircleGeometry(0.46, 20);
  const flames = [];
  const diamonds = [];
  const glows = [];
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color: '#ff7a2e', transparent: true, fog: false }));
    glow.position.set(side * 0.72, -0.02, 9.2);
    g.add(glow);
    glows.push(glow);

    const flame = new THREE.Group();
    flame.position.set(side * 0.72, -0.02, 9.65);
    flame.add(new THREE.Mesh(outerGeo, flameMat('#ff9a4d', 0.7)));
    flame.add(new THREE.Mesh(innerGeo, flameMat('#cfe6ff', 0.85)));
    for (let k = 0; k < 3; k++) {
      const d = new THREE.Mesh(diamondGeo, flameMat('#fff2d6', 0.9));
      d.position.z = 0.9 + k * 0.85;
      d.scale.set(1 - k * 0.2, 1 - k * 0.2, 2);
      flame.add(d);
      diamonds.push(d);
    }
    g.add(flame);
    flames.push(flame);
  }

  const strobe = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' }));
  strobe.position.set(0, -0.5, 4);
  g.add(strobe);

  g.traverse((o) => {
    if (o.isMesh && !(o.material.blending === THREE.AdditiveBlending) && !o.material.isMeshBasicMaterial) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { group: g, stabs: sides.map((s) => s.stab), sides, flames, diamonds, glows, strobe };
}

// Cockpit seen from the pilot's seat: a dark panel under the HUD with a button block and a
// small green screen, the HUD glass on two posts, and the canopy sills.
function buttonPanelTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 200;
  const g = c.getContext('2d');
  g.fillStyle = '#16181a';
  g.fillRect(0, 0, c.width, c.height);
  const labels = [['NAV', 'COM1', 'COM2', 'IFF', 'LIST'], ['A-A', 'A-G', 'RTN', 'SEQ', '+/-']];
  labels.forEach((row, r) => row.forEach((label, i) => {
    const x = 18 + i * 98;
    const y = 18 + r * 92;
    g.fillStyle = '#2a2e32';
    g.fillRect(x, y, 80, 70);
    g.strokeStyle = '#4a5055';
    g.lineWidth = 3;
    g.strokeRect(x + 1.5, y + 1.5, 77, 67);
    g.fillStyle = '#c9cfd2';
    g.font = 'bold 20px B612, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(label, x + 40, y + 35);
  }));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCockpit() {
  const g = new THREE.Group();
  if (typeof document === 'undefined') return { group: g, glass: [], display: null };
  const dark = new THREE.MeshStandardMaterial({ color: '#1b1e21', roughness: 0.85, metalness: 0.2 });
  const E = EYE;

  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.42), dark);
  shield.position.set(0, E.y - 0.47, E.z - 0.78);
  g.add(shield);

  const buttons = new THREE.Mesh(
    new THREE.PlaneGeometry(0.56, 0.22),
    new THREE.MeshStandardMaterial({ map: buttonPanelTexture(), roughness: 0.8 }),
  );
  buttons.position.set(-0.1, E.y - 0.47, E.z - 0.567);
  g.add(buttons);

  // The small green screen shows live flight data.
  const screen = document.createElement('canvas');
  screen.width = 320;
  screen.height = 200;
  const screenTex = new THREE.CanvasTexture(screen);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  display.position.set(0.31, E.y - 0.46, E.z - 0.566);
  g.add(display);

  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.38, 0.022), dark);
    post.position.set(side * 0.237, E.y - 0.13, E.z - 0.78);
    post.rotation.x = -0.1;
    g.add(post);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 1.5), dark);
    sill.position.set(side * 0.5, E.y - 0.36, E.z - 0.15);
    g.add(sill);
  }

  // HUD glass: a faint pane with a thin frame and a curved top. The HUD is drawn only inside it.
  const outline = new THREE.Shape();
  // Top stays put; the glass reaches further down.
  outline.moveTo(-0.23, -0.27);
  outline.lineTo(0.23, -0.27);
  outline.lineTo(0.23, 0.09);
  outline.quadraticCurveTo(0, 0.21, -0.23, 0.09);
  outline.lineTo(-0.23, -0.27);
  const pts = outline.getPoints(16);
  const glassGroup = new THREE.Group();
  // Centered a little above eye level, so the gun reticle sits mid-glass with room above.
  glassGroup.position.set(0, E.y + 0.04, E.z - 0.78);
  glassGroup.rotation.x = -0.1;
  glassGroup.add(new THREE.Mesh(
    new THREE.ShapeGeometry(outline, 16),
    new THREE.MeshBasicMaterial({ color: '#a8d8cc', transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }),
  ));
  glassGroup.add(new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: '#c9d1d0', transparent: true, opacity: 0.55 }),
  ));
  g.add(glassGroup);
  const glass = pts.map((p) => new THREE.Vector3(p.x, p.y, 0).applyMatrix4(
    new THREE.Matrix4().compose(glassGroup.position, new THREE.Quaternion().setFromEuler(glassGroup.rotation), new THREE.Vector3(1, 1, 1)),
  ));

  g.traverse((o) => o.layers.set(COCKPIT_VIEW_LAYER));
  return { group: g, glass, display: { canvas: screen, texture: screenTex } };
}

class Trail {
  constructor(scene, n = 90) {
    this.n = n;
    this.positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      colors.set([1, 1, 1, Math.pow(1 - i / n, 1.5)], i * 4);
    }
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.positions, 3);
    geo.setAttribute('position', this.attr);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    this.material = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false });
    this.line = new THREE.Line(geo, this.material);
    this.line.frustumCulled = false;
    scene.add(this.line);
  }

  reset(p) {
    for (let i = 0; i < this.n; i++) this.positions.set([p.x, p.y, p.z], i * 3);
    this.attr.needsUpdate = true;
    this.material.opacity = 0;
  }

  push(p, opacity) {
    this.positions.copyWithin(3, 0, (this.n - 1) * 3);
    this.positions[0] = p.x;
    this.positions[1] = p.y;
    this.positions[2] = p.z;
    this.attr.needsUpdate = true;
    this.material.opacity += (opacity - this.material.opacity) * 0.15;
  }
}

const _p = new THREE.Vector3();
const TIPS = [new THREE.Vector3(-6.8, -0.18, 4.4), new THREE.Vector3(6.8, -0.18, 4.4)];

export class Jet {
  constructor(scene) {
    const parts = buildModel();
    this.group = parts.group;
    this.stabs = parts.stabs;
    this.flames = parts.flames;
    this.diamonds = parts.diamonds;
    this.glows = parts.glows;
    this.strobe = parts.strobe;
    this.sides = parts.sides;
    this.bombsOnWings = [];
    this.flame = 0.4;
    this.trails = [new Trail(scene), new Trail(scene)];
    scene.add(this.group);
    const cockpit = buildCockpit();
    this.group.add(cockpit.group);
    this.glassLocal = cockpit.glass;
    this.glassWorld = cockpit.glass.map((p) => p.clone());
    this.display = cockpit.display;
  }

  // The attack jet carries up to four bombs under the wings, outer pylons first.
  mountBombs(geometry, material) {
    const spots = [[-3.7, -0.62, 1.1], [3.7, -0.62, 1.1], [-2.4, -0.62, 0.7], [2.4, -0.62, 0.7]];
    for (const [x, y, z] of spots) {
      const b = new THREE.Mesh(geometry, material);
      b.position.set(x, y, z);
      b.castShadow = true;
      b.visible = false;
      this.group.add(b);
      this.bombsOnWings.push(b);
    }
  }

  setType(type) {
    const attack = type === 'attack';
    this.type = type;
    // Greener camo for the attack jet.
    PAINT.color.set(attack ? '#c6d3b6' : '#ffffff');
    for (const s of this.sides) {
      s.missile.visible = !attack;
      s.inner.visible = attack;
    }
    this.setBombCount(attack ? this.bombsOnWings.length : 0);
  }

  // Show as many bombs on the wings as are left (they drop alternating sides).
  setBombCount(n) {
    const count = this.type === 'attack' ? n : 0;
    this.bombsOnWings.forEach((b, i) => (b.visible = i < count));
  }

  // HUD glass outline in world space, for clipping the HUD in cockpit view.
  glassPoints() {
    this.group.updateMatrixWorld();
    this.glassLocal.forEach((p, i) => this.glassWorld[i].copy(p).applyMatrix4(this.group.matrixWorld));
    return this.glassWorld;
  }

  // Draw lines of text on the small green cockpit screen.
  setDisplay(lines) {
    if (!this.display) return;
    const { canvas, texture } = this.display;
    const g = canvas.getContext('2d');
    g.fillStyle = '#020702';
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#7dff6a';
    g.font = 'bold 30px "B612 Mono", monospace';
    g.textBaseline = 'top';
    lines.slice(0, 5).forEach((l, i) => g.fillText(l, 14, 12 + i * 37));
    texture.needsUpdate = true;
  }

  sync(fm, cmd) {
    const g = this.group;
    g.position.copy(fm.position);
    g.quaternion.copy(fm.quaternion);
    g.updateMatrixWorld();

    this.stabs[0].rotation.x = -cmd.pitch * 0.3 + cmd.roll * 0.2;
    this.stabs[1].rotation.x = -cmd.pitch * 0.3 - cmd.roll * 0.2;

    const target = fm.boost ? 1 : fm.throttle > 0 ? 0.62 : fm.throttle < 0 ? 0.12 : 0.4;
    this.flame += (target - this.flame) * 0.12;
    for (const f of this.flames) {
      f.scale.set(1, 1, this.flame * (0.92 + Math.random() * 0.08));
      f.visible = this.flame > 0.05;
    }
    const ab = THREE.MathUtils.smoothstep(this.flame, 0.75, 0.98);
    for (const d of this.diamonds) d.material.opacity = 0.9 * ab;
    for (const glow of this.glows) glow.material.opacity = 0.35 + 0.65 * this.flame;
    this.strobe.visible = performance.now() % 1400 < 90;

    const vapor = THREE.MathUtils.smoothstep(fm.g, 4.5, 8);
    this.trails.forEach((t, i) => t.push(_p.copy(TIPS[i]).applyMatrix4(g.matrixWorld), vapor * 0.8));
  }

  reset(fm) {
    this.group.visible = true;
    this.sync(fm, { pitch: 0, roll: 0 });
    this.trails.forEach((t, i) => t.reset(_p.copy(TIPS[i]).applyMatrix4(this.group.matrixWorld)));
  }

  hide() {
    this.group.visible = false;
    this.trails.forEach((t) => (t.material.opacity = 0));
  }
}

export class Explosion {
  constructor(scene) {
    this.group = new THREE.Group();
    this.fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 14),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffb35c').multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.smoke = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshLambertMaterial({ color: '#4a4642', transparent: true, depthWrite: false }),
    );
    this.group.add(this.smoke, this.fire);
    this.group.visible = false;
    this.t = 0;
    scene.add(this.group);
  }

  start(pos, size = 1) {
    this.group.position.copy(pos);
    this.group.scale.setScalar(size);
    this.t = 0;
    this.group.visible = true;
    this.update(0);
  }

  stop() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.t += dt;
    const t = this.t;
    this.fire.scale.setScalar(4 + Math.min(t, 0.9) * 50);
    this.fire.material.opacity = Math.max(0, 1 - t / 0.9);
    this.smoke.scale.setScalar(3 + Math.min(t, 3) * 14);
    this.smoke.position.y = t * 6;
    this.smoke.material.opacity = 0.75 * Math.max(0, 1 - t / 5);
  }
}
