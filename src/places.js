// Places on the island besides the open land: the town, an airfield, a military base, an
// industrial area, villages and a radar station. Each site gets leveled ground, packed-dirt
// color, buildings drawn in shared batches, and collision boxes grouped per site.
import * as THREE from 'three';
import { coloredMerge } from './world.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// r: footprint radius. fall: how far the leveled ground blends back into the hills.
// pave: how strongly the ground turns to packed dirt.
const KINDS = {
  town: { r: 480, fall: 140, pave: 0.45 },
  airfield: { hl: 900, hw: 170, fall: 160, pave: 0.7 },
  base: { r: 230, fall: 110, pave: 0.85 },
  industrial: { r: 260, fall: 110, pave: 0.85 },
  village: { r: 150, fall: 80, pave: 0.4 },
  radar: { r: 45, fall: 50, pave: 0.7 },
};

const reach = (s) => (s.kind === 'airfield' ? s.hl : s.r);

// Distance from a point to a site's footprint, 0 inside it. The airfield is a rectangle along
// its heading, everything else a circle.
export function siteDistance(s, x, z) {
  if (s.kind === 'airfield') {
    const dx = x - s.x;
    const dz = z - s.z;
    const u = dx * s.ax + dz * s.az;
    const v = -dx * s.az + dz * s.ax;
    return Math.hypot(Math.max(Math.abs(u) - s.hl, 0), Math.max(Math.abs(v) - s.hw, 0));
  }
  return Math.max(0, Math.hypot(x - s.x, z - s.z) - s.r);
}

function makeSite(kind, x, z, heading) {
  return { kind, x, z, heading, ax: Math.sin(heading), az: Math.cos(heading), ...KINDS[kind] };
}

function samplePoints(s) {
  const pts = [];
  if (s.kind === 'airfield') {
    for (let i = -4; i <= 4; i++) {
      for (let j = -1; j <= 1; j++) {
        const u = (i / 4) * s.hl;
        const v = j * s.hw;
        pts.push([s.x + s.ax * u - s.az * v, s.z + s.az * u + s.ax * v]);
      }
    }
  } else {
    pts.push([s.x, s.z]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const rr = k % 2 ? s.r : s.r * 0.6;
      pts.push([s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr]);
    }
  }
  return pts;
}

// Pick a spot for every site: dry, flat enough, apart from the others, inside the combat area.
export function planSites(groundHeight, rand, bound) {
  const sites = [];
  const clear = (s, gap) => sites.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > gap + reach(o) + reach(s));
  const evaluate = (s) => {
    const hs = samplePoints(s).map(([x, z]) => groundHeight(x, z));
    const mean = hs.reduce((a, b) => a + b, 0) / hs.length;
    return { min: Math.min(...hs), mean, dev: Math.max(...hs.map((h) => Math.abs(h - mean))) };
  };
  const place = (kind, tries, accept) => {
    let best = null;
    for (let t = 0; t < tries; t++) {
      const margin = (kind === 'airfield' ? KINDS.airfield.hl : KINDS[kind].r) + 300;
      const s = makeSite(kind, (rand() * 2 - 1) * (bound - margin), (rand() * 2 - 1) * (bound - margin), rand() * Math.PI);
      if (!clear(s, 350)) continue;
      const e = evaluate(s);
      if (!accept(e)) continue;
      if (!best || e.dev < best.cost) best = Object.assign(s, { h: e.mean, cost: e.dev });
    }
    if (best) sites.push(best);
  };

  // The town: flattest low ground near the middle, as before, so the spawn stays the same.
  for (let i = 0; i < 400; i++) {
    const ang = i * 2.39996;
    const rad = 400 + i * 7;
    const s = makeSite('town', Math.cos(ang) * rad, Math.sin(ang) * rad, 0);
    const e = evaluate(s);
    if (e.min > 8 && e.mean < 90 && e.dev < 30) {
      sites.push(Object.assign(s, { h: e.mean }));
      break;
    }
  }
  // A long strip rarely misses every lake, so it may cross shallow water: leveling fills it in.
  place('airfield', 900, (e) => e.min > -25 && e.mean > 14 && e.mean < 160 && e.dev < 55);
  place('base', 300, (e) => e.min > 6 && e.mean < 220 && e.dev < 35);
  place('industrial', 300, (e) => e.min > 6 && e.mean < 200 && e.dev < 35);
  for (let v = 0; v < 4; v++) place('village', 200, (e) => e.min > 6 && e.mean < 240 && e.dev < 25);

  // Radar on the highest open hilltop.
  let top = null;
  for (let t = 0; t < 2000; t++) {
    const x = (rand() * 2 - 1) * (bound - 400);
    const z = (rand() * 2 - 1) * (bound - 400);
    const h = groundHeight(x, z);
    const s = makeSite('radar', x, z, rand() * Math.PI);
    if (h > 180 && h < 520 && clear(s, 200) && (!top || h > top.h)) top = Object.assign(s, { h: h - 1 });
  }
  if (top) sites.push(top);
  return sites;
}

// Level the ground under each site and record how much of it is packed dirt.
export function shapeGround(heights, pave, sites, N, CELL, HALF) {
  for (let iz = 0; iz <= N; iz++) {
    for (let ix = 0; ix <= N; ix++) {
      const g = iz * (N + 1) + ix;
      const x = -HALF + ix * CELL;
      const z = -HALF + iz * CELL;
      for (const s of sites) {
        const d = siteDistance(s, x, z);
        if (d >= s.fall) continue;
        heights[g] += (s.h - heights[g]) * (1 - smooth(0, s.fall, d));
        pave[g] = Math.max(pave[g], s.pave * (1 - smooth(0, s.fall * 0.35, d)));
      }
    }
  }
}

export const nearSite = (sites, x, z, margin) => sites.some((s) => siteDistance(s, x, z) < margin);

// A random point inside a site's footprint (used for spawning targets).
export function pointInSite(s, rand, out) {
  if (s.kind === 'airfield') {
    const u = (rand() * 2 - 1) * s.hl * 0.8;
    const v = (rand() * 2 - 1) * s.hw * 0.8;
    out.x = s.x + s.ax * u - s.az * v;
    out.z = s.z + s.az * u + s.ax * v;
  } else {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * s.r * 0.85;
    out.x = s.x + Math.cos(a) * r;
    out.z = s.z + Math.sin(a) * r;
  }
  return out;
}

const UP = new THREE.Vector3(0, 1, 0);

// Build every site's buildings. Returns collision sets (one bounding box per site around its
// building boxes) and the flat rooftops soldiers can stand on.
export function buildPlaces(scene, sites, { groundHeight, lightAt, rand }) {
  const lambert = () => new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const batch = (geo, max) => {
    const mesh = new THREE.InstancedMesh(geo, lambert(), max);
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const boxes = batch(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), 1600);
  const roofs = batch(new THREE.ConeGeometry(0.75, 0.35, 4, 1).rotateY(Math.PI / 4).translate(0, 1.17, 0), 700);
  const cylinders = batch(new THREE.CylinderGeometry(0.5, 0.5, 1, 18).translate(0, 0.5, 0), 120);
  const halfCyl = batch(new THREE.CylinderGeometry(1, 1, 1, 20, 1, false, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2), 40);
  const tents = batch(new THREE.ConeGeometry(0.71, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0), 60);
  const domes = batch(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 10);
  const jetGeo = coloredMerge([
    [new THREE.BoxGeometry(1.6, 1.4, 15), '#7b858c'],
    [new THREE.BoxGeometry(10, 0.25, 4).translate(0, -0.1, 1.5), '#6f787f'],
    [new THREE.BoxGeometry(4.5, 0.2, 1.8).translate(0, 0.1, 6.3), '#6f787f'],
    [new THREE.BoxGeometry(0.2, 2.6, 2.2).translate(0, 1.5, 6.2), '#6f787f'],
    [new THREE.BoxGeometry(1.0, 0.6, 3).translate(0, 0.9, -3.5), '#26343c'],
  ]).translate(0, 1.4, 0);
  const jets = new THREE.InstancedMesh(jetGeo, new THREE.MeshLambertMaterial({ vertexColors: true }), 12);
  jets.count = 0;
  jets.castShadow = true;
  scene.add(jets);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  const col = (hex) => new THREE.Color(hex);
  const sets = [];
  const rooftops = [];

  for (const s of sites) {
    const set = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity], boxes: [] };
    sets.push(set);
    const c = Math.cos(s.heading);
    const sn = Math.sin(s.heading);
    const world = (lx, lz) => [s.x + lx * c + lz * sn, s.z - lx * sn + lz * c];
    const collide = (box) => {
      set.boxes.push(box);
      for (let a = 0; a < 3; a++) {
        set.min[a] = Math.min(set.min[a], box.min[a]);
        set.max[a] = Math.max(set.max[a], box.max[a]);
      }
      if (box.flat) rooftops.push(box);
    };
    const put = (mesh, x, y, z, rot, sx, sy, sz, color) => {
      m.compose(p.set(x, y, z), q.setFromAxisAngle(UP, rot), sc.set(sx, sy, sz));
      const i = mesh.count++;
      mesh.setMatrixAt(i, m);
      if (color) mesh.setColorAt(i, tint.copy(color).multiplyScalar(lightAt(x, z)));
    };
    const aabb = (x, y, z, rot, sx, sy, sz, flat) => {
      const ex = (Math.abs(Math.cos(rot)) * sx + Math.abs(Math.sin(rot)) * sz) / 2;
      const ez = (Math.abs(Math.sin(rot)) * sx + Math.abs(Math.cos(rot)) * sz) / 2;
      collide({ min: [x - ex, y, z - ez], max: [x + ex, y + sy, z + ez], flat });
    };
    // A box building at local (lx, lz), turned with the site plus rot. Optional pyramid roof.
    const building = (lx, lz, sx, sy, sz, color, { rot = 0, roof = null, flat = !roof, base = null } = {}) => {
      const [x, z] = world(lx, lz);
      const y = base ?? groundHeight(x, z) - 0.6;
      put(boxes, x, y, z, s.heading + rot, sx, sy, sz, color);
      if (roof) put(roofs, x, y, z, s.heading + rot, sx, sy, sz, roof);
      aabb(x, y, z, s.heading + rot, sx, sy * (roof ? 1.35 : 1), sz, flat);
      return y + sy;
    };
    const cylinder = (lx, lz, r, hgt, color, base = null) => {
      const [x, z] = world(lx, lz);
      const y = base ?? groundHeight(x, z) - 0.6;
      put(cylinders, x, y, z, 0, r * 2, hgt, r * 2, color);
      aabb(x, y, z, 0, r * 2, hgt, r * 2, false);
    };

    if (s.kind === 'town') {
      const walls = ['#b9b4aa', '#9a9690', '#c7c1b3', '#8b8f94', '#a59b8a', '#d1cbbd'].map(col);
      const roofColors = ['#7a3b2e', '#5d4a3f', '#6b6f73'].map(col);
      for (let gx = -12; gx <= 12; gx++) {
        for (let gz = -12; gz <= 12; gz++) {
          const d = Math.hypot(gx, gz) / 12;
          if (d > 1 || rand() < d * 0.7 || gx % 4 === 0 || gz % 5 === 0) continue;
          const house = d > 0.45 && rand() < 0.7;
          const sx = 14 + rand() * 12;
          const sz = 14 + rand() * 12;
          const sy = house ? 7 + rand() * 4 : 8 + (1 - d) * (15 + rand() * 45);
          building(gx * 38 + (rand() - 0.5) * 8, gz * 38 + (rand() - 0.5) * 8, sx, sy, sz, walls[Math.floor(rand() * walls.length)], {
            rot: (rand() - 0.5) * 0.1,
            roof: house ? roofColors[Math.floor(rand() * roofColors.length)] : null,
          });
        }
      }
    }

    if (s.kind === 'village') {
      const walls = ['#d6cdb8', '#c9bda4', '#bfb8a8', '#e0d8c6'].map(col);
      const roofColors = ['#8a3d2c', '#6e4334', '#7d4a33'].map(col);
      const spots = [];
      for (let t = 0; t < 200 && spots.length < 12; t++) {
        const a = rand() * Math.PI * 2;
        const r = 15 + Math.sqrt(rand()) * (s.r - 30);
        const lx = Math.cos(a) * r;
        const lz = Math.sin(a) * r;
        if (spots.some(([x, z]) => Math.hypot(x - lx, z - lz) < 24)) continue;
        spots.push([lx, lz]);
        building(lx, lz, 9 + rand() * 6, 5 + rand() * 3, 9 + rand() * 6, walls[Math.floor(rand() * walls.length)], {
          rot: rand() * Math.PI, roof: roofColors[Math.floor(rand() * roofColors.length)],
        });
      }
      building(0, 0, 9, 20, 9, col('#d8d2c4'), { roof: col('#5b5f63') }); // church tower
    }

    if (s.kind === 'base') {
      const olive = col('#6b6f4e');
      const concrete = col('#8f8d86');
      for (let i = 0; i < 4; i++) building(-90 + i * 45, -70, 14, 6, 34, olive);
      for (let i = 0; i < 3; i++) building(-60 + i * 60, 60, 12, 4.5, 12, concrete);
      for (let i = 0; i < 6; i++) {
        const [x, z] = world(40 + (i % 3) * 22, -10 + Math.floor(i / 3) * 22);
        const y = groundHeight(x, z) - 0.3;
        put(tents, x, y, z, s.heading, 9, 5, 9, col('#5f6440'));
        aabb(x, y, z, s.heading, 9, 5, 9, false);
      }
      for (const [lx, lz] of [[-170, -170], [170, -170], [-170, 170], [170, 170]]) {
        const top = building(lx, lz, 3, 13, 3, col('#5a5a4a'));
        building(lx, lz, 6, 1.6, 6, col('#6a6656'), { base: top });
      }
      for (let k = 0; k < 20; k++) {
        if (k % 5 === 2) continue; // gaps in the wall
        const a = (k / 20) * Math.PI * 2;
        building(Math.cos(a) * 200, Math.sin(a) * 200, 30, 1.8, 2.4, col('#a39572'), { rot: -a + Math.PI / 2 });
      }
    }

    if (s.kind === 'industrial') {
      const halls = ['#8c949a', '#7d8a94', '#9a9890'].map(col);
      building(-90, -60, 70, 18, 38, halls[0]);
      building(-10, -70, 60, 16, 34, halls[1]);
      building(70, -50, 46, 22, 30, halls[2]);
      building(-60, 40, 40, 11, 24, halls[1]);
      building(0, 50, 40, 11, 24, halls[0]);
      for (const [lx, lz] of [[-130, -10], [-118, -10], [118, -100]]) cylinder(lx, lz, 3.5, 58, col('#8a5a48'));
      for (let i = 0; i < 6; i++) cylinder(60 + (i % 3) * 26, 50 + Math.floor(i / 3) * 26, 10, 14, col('#c9cbc6'));
    }

    if (s.kind === 'radar') {
      const top = building(0, 0, 16, 6, 16, col('#9c9c94'));
      put(domes, s.x, top, s.z, 0, 9, 9, 9, col('#eef0ee'));
      collide({ min: [s.x - 9, top, s.z - 9], max: [s.x + 9, top + 9, s.z + 9], flat: false });
      cylinder(26, 0, 1.3, 34, col('#7c7f82'));
      building(-24, 10, 10, 4, 7, col('#8a8a80'));
    }

    if (s.kind === 'airfield') {
      // Runway, taxiway and two links between them, all on the leveled ground.
      const asphalt = new THREE.MeshStandardMaterial({ color: '#3b3d3f', roughness: 0.95 });
      const strip = (lx, lz, w, len, rot, mat) => {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, len).rotateX(-Math.PI / 2), mat);
        const [x, z] = world(lx, lz);
        mesh.position.set(x, s.h + 0.25, z);
        mesh.rotation.y = s.heading + rot;
        mesh.receiveShadow = true;
        scene.add(mesh);
      };
      strip(0, 0, 46, 1650, 0, asphalt);
      strip(150, 0, 18, 1150, 0, asphalt);
      strip(75, -480, 18, 150, Math.PI / 2, asphalt);
      strip(75, 480, 18, 150, Math.PI / 2, asphalt);
      const paint = new THREE.MeshBasicMaterial({ color: '#d9d9d2' });
      const marks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), paint, 60);
      marks.count = 0;
      const mark = (lx, lz, w, len) => {
        const [x, z] = world(lx, lz);
        m.compose(p.set(x, s.h + 0.3, z), q.setFromAxisAngle(UP, s.heading), sc.set(w, 1, len));
        marks.setMatrixAt(marks.count++, m);
      };
      for (let i = -12; i <= 12; i++) mark(0, i * 60, 1.2, 30); // center line
      for (const end of [-1, 1]) for (let k = -3; k <= 3; k++) if (k) mark(k * 5.5, end * 790, 2.2, 28); // threshold bars
      scene.add(marks);

      for (let i = 0; i < 5; i++) {
        const lz = -300 + i * 150;
        const [x, z] = world(235, lz);
        const y = groundHeight(x, z) - 0.4;
        put(halfCyl, x, y, z, s.heading + Math.PI / 2, 16, 13, 44, col('#8d9396'));
        aabb(x, y, z, s.heading + Math.PI / 2, 32, 13, 44, false);
        if (i % 2 === 0) {
          const [jx, jz] = world(182, lz + 10);
          m.compose(p.set(jx, s.h, jz), q.setFromAxisAngle(UP, s.heading + Math.PI / 2), sc.set(1, 1, 1));
          jets.setMatrixAt(jets.count++, m);
          aabb(jx, s.h, jz, s.heading + Math.PI / 2, 10, 4, 15, false);
        }
      }
      const towerTop = building(215, 470, 9, 24, 9, col('#c4c1b8'));
      const glassTop = building(215, 470, 12, 5, 12, col('#2c3e4a'), { base: towerTop });
      building(215, 470, 13, 1, 13, col('#7c7a74'), { base: glassTop });
      building(260, 470, 30, 7, 18, col('#b0aca2'));
    }
  }

  for (const mesh of [boxes, roofs, cylinders, halfCyl, tents, domes, jets]) {
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
  return { sets, rooftops };
}
