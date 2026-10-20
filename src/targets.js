// Targets: drones that fly circles and weaves, and garrisons of tanks, AA guns, field guns and
// soldiers at every place on the island. Everything respawns a few seconds after being destroyed.
import * as THREE from 'three';
import { Explosion } from './jet.js';
import { WORLD, coloredMerge } from './world.js';
import { pointInSite, siteDistance } from './places.js';

const DRONES = 20;
// Ground units per site, for the two settings in the menu. "open" is open country, away from
// every place.
const GARRISON = {
  many: {
    base: { tank: 8, aa: 4, cannon: 4, soldier: 24 },
    airfield: { tank: 4, aa: 4, cannon: 2, soldier: 14 },
    town: { tank: 8, aa: 2, cannon: 2, soldier: 30 },
    industrial: { tank: 4, aa: 2, cannon: 2, soldier: 12 },
    village: { tank: 1, aa: 0, cannon: 1, soldier: 5 },
    radar: { tank: 0, aa: 2, cannon: 0, soldier: 4 },
    open: { tank: 2, aa: 0, cannon: 0, soldier: 0 },
  },
  few: {
    base: { tank: 2, aa: 1, cannon: 1, soldier: 6 },
    airfield: { tank: 1, aa: 1, cannon: 1, soldier: 4 },
    town: { tank: 2, aa: 1, cannon: 1, soldier: 8 },
    industrial: { tank: 1, aa: 0, cannon: 1, soldier: 3 },
    village: { tank: 0, aa: 0, cannon: 0, soldier: 0 },
    radar: { tank: 0, aa: 1, cannon: 0, soldier: 2 },
    open: { tank: 1, aa: 0, cannon: 0, soldier: 0 },
  },
};
// Ground units farther than this from the jet are not drawn.
export const SEE = 1500;
// center: hitbox height above the ground. drive: patrol length in m, taken by driveChance of them.
const KINDS = {
  air: { radius: 5.5, health: 100, respawn: 5 },
  tank: { radius: 8, health: 150, respawn: 8, center: 3.2, speed: 7, drive: 220, driveChance: 0.5 },
  aa: { radius: 7, health: 90, respawn: 8, center: 3.6, speed: 0, drive: 0, driveChance: 0 },
  cannon: { radius: 6.5, health: 110, respawn: 8, center: 2.4, speed: 0, drive: 0, driveChance: 0 },
  soldier: { radius: 1.8, health: 9, respawn: 10, center: 1.35, speed: 1.6, drive: 30, driveChance: 0.5 },
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Every target is drawn through shared batches: one InstancedMesh per part, so all soldiers draw
// in one call, all tank hulls in one, and so on. Each target keeps an invisible Object3D (t.mesh)
// that holds its position, rotation and turning parts; sync() copies those into the batches.
const droneMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.5 });
const soldierMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const paintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.4 });

// Part name: its material and whether it takes shadows. KIND_PARTS lists each kind's parts.
const PARTS = {
  drone: { mat: droneMat, receive: false },
  soldier: { mat: soldierMat, receive: false },
  tankHull: { mat: paintMat, receive: true },
  tankTurret: { mat: paintMat, receive: true },
  aaBase: { mat: paintMat, receive: true },
  aaBody: { mat: paintMat, receive: true },
  aaBarrels: { mat: steelMat, receive: true },
  cannon: { mat: paintMat, receive: true },
};
const KIND_PARTS = {
  air: ['drone'],
  soldier: ['soldier'],
  tank: ['tankHull', 'tankTurret'],
  aa: ['aaBase', 'aaBody', 'aaBarrels'],
  cannon: ['cannon'],
};

function partGeometries() {
  const olive = '#5b6339';
  const dark = '#2d2f28';
  const aaPaint = '#6b6a52';
  const gunPaint = '#646648';
  const gunDark = '#262724';
  const lift = 0.3; // field gun barrel elevation in radians
  const orange = '#e8562a';
  const white = '#f2f0ea';
  const tan = '#c2a878';
  return {
    // Drone: body, nose, wings, tips, fin, tail.
    drone: coloredMerge([
      [new THREE.CylinderGeometry(0.5, 0.35, 7, 14).rotateX(Math.PI / 2), orange],
      [new THREE.ConeGeometry(0.35, 1.6, 14).rotateX(-Math.PI / 2).translate(0, 0, -4.3), white],
      [new THREE.BoxGeometry(7.2, 0.1, 1.6).translate(0, 0, 0.4), orange],
      [new THREE.BoxGeometry(0.6, 0.12, 1.6).translate(-3.9, 0, 0.4), white],
      [new THREE.BoxGeometry(0.6, 0.12, 1.6).translate(3.9, 0, 0.4), white],
      [new THREE.BoxGeometry(0.08, 1.3, 1.2).translate(0, 0.65, 3.0), orange],
      [new THREE.BoxGeometry(2.6, 0.08, 0.8).translate(0, 0, 3.2), white],
    ]),
    // Soldier: legs, body, arms, head, helmet and a rifle. Drawn 1.5 times real size in tan, so
    // they stand out against the grass from a jet.
    soldier: coloredMerge([
      [new THREE.BoxGeometry(0.16, 0.85, 0.22).translate(-0.11, 0.42, 0), '#9c8660'],
      [new THREE.BoxGeometry(0.16, 0.85, 0.22).translate(0.11, 0.42, 0), '#9c8660'],
      [new THREE.BoxGeometry(0.5, 0.62, 0.3).translate(0, 1.17, 0), tan],
      [new THREE.BoxGeometry(0.12, 0.55, 0.14).translate(-0.31, 1.15, -0.08), tan],
      [new THREE.BoxGeometry(0.12, 0.55, 0.14).translate(0.31, 1.15, -0.08), tan],
      [new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.6, 0), '#c49a76'],
      [new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.64, 0), '#5a4f3c'],
      [new THREE.BoxGeometry(0.06, 0.08, 0.85).translate(0.18, 1.12, -0.35), '#232421'],
    ]).scale(1.5, 1.5, 1.5),
    tankHull: coloredMerge([
      [new THREE.BoxGeometry(3.4, 1.0, 6.6).translate(0, 1.0, 0), olive],
      [new THREE.BoxGeometry(0.8, 0.95, 7).translate(-1.65, 0.5, 0), dark],
      [new THREE.BoxGeometry(0.8, 0.95, 7).translate(1.65, 0.5, 0), dark],
    ]),
    tankTurret: coloredMerge([
      [new THREE.BoxGeometry(2.3, 0.75, 3).translate(0, 0.38, 0), olive],
      [new THREE.CylinderGeometry(0.1, 0.12, 4.4).rotateX(Math.PI / 2).translate(0, 0.4, -3.6), dark],
    ]),
    aaBase: coloredMerge([[new THREE.BoxGeometry(3.2, 0.6, 3.2).translate(0, 0.3, 0), aaPaint]]),
    aaBody: coloredMerge([[new THREE.BoxGeometry(1.7, 1.3, 1.7).translate(0, 0.65, 0), aaPaint]]),
    aaBarrels: coloredMerge([-1, 1].map((side) =>
      [new THREE.CylinderGeometry(0.07, 0.07, 3.4).rotateX(Math.PI / 2).translate(side * 0.45, 0, -1.9), '#2b2c27'])),
    // Towed field gun: two wheels, a shield, split trail legs and a long barrel raised for a far shot.
    cannon: coloredMerge([
      [new THREE.CylinderGeometry(0.55, 0.55, 0.28, 14).rotateZ(Math.PI / 2).translate(-0.95, 0.55, 0), gunDark],
      [new THREE.CylinderGeometry(0.55, 0.55, 0.28, 14).rotateZ(Math.PI / 2).translate(0.95, 0.55, 0), gunDark],
      [new THREE.BoxGeometry(1.9, 0.18, 0.22).translate(0, 0.55, 0), gunDark],
      [new THREE.BoxGeometry(2.1, 1.0, 0.08).translate(0, 1.2, -0.35), gunPaint],
      [new THREE.BoxGeometry(0.7, 0.55, 1.3).translate(0, 0.95, 0.05), gunPaint],
      [new THREE.BoxGeometry(0.16, 0.14, 2.8).rotateY(0.3).translate(-0.45, 0.3, 1.4), gunPaint],
      [new THREE.BoxGeometry(0.16, 0.14, 2.8).rotateY(-0.3).translate(0.45, 0.3, 1.4), gunPaint],
      [new THREE.CylinderGeometry(0.11, 0.15, 4.2, 10).rotateX(Math.PI / 2 - lift).translate(0, 1.1 + Math.sin(lift) * 1.6, -1.6), gunDark],
    ]),
  };
}

// The invisible frame of a target: the root node plus one node per turning part. userData.parts
// pairs each batch with the node it follows.
function frame(kind) {
  const g = new THREE.Object3D();
  const parts = KIND_PARTS[kind];
  if (kind === 'tank') {
    const turret = new THREE.Object3D();
    turret.position.y = 1.5;
    g.add(turret);
    g.userData.turret = turret;
    g.userData.parts = [[parts[0], g], [parts[1], turret]];
  } else if (kind === 'aa') {
    const mount = new THREE.Object3D();
    mount.position.y = 0.6;
    const pivot = new THREE.Object3D();
    pivot.position.y = 1.1;
    mount.add(pivot);
    g.add(mount);
    g.userData.mount = mount;
    g.userData.pivot = pivot;
    g.userData.parts = [[parts[0], g], [parts[1], mount], [parts[2], pivot]];
  } else {
    g.userData.parts = [[parts[0], g]];
  }
  // Vehicles are about twice real size (a tank is about 13 m long) so they read from the air.
  if (kind === 'tank' || kind === 'aa' || kind === 'cannon') g.scale.setScalar(2);
  return g;
}

export class Targets {
  constructor(scene, world, units = 'many') {
    this.scene = scene;
    this.world = world;
    this.groundHeight = world.groundHeight;
    this.list = [];
    this.explosions = [0, 1, 2, 3].map(() => new Explosion(scene));
    this.nextExplosion = 0;
    // One batch per part, sized for the larger garrison setting.
    const sites = world.sites || [];
    const most = (kind) => (kind === 'air' ? DRONES : Math.max(...Object.values(GARRISON).map((g) =>
      sites.reduce((n, x) => n + (g[x.kind]?.[kind] || 0), g.open[kind] || 0))));
    const geos = partGeometries();
    this.batches = {};
    for (const [kind, parts] of Object.entries(KIND_PARTS)) {
      for (const name of parts) {
        const b = new THREE.InstancedMesh(geos[name], PARTS[name].mat, Math.max(1, most(kind)));
        b.castShadow = true;
        b.receiveShadow = PARTS[name].receive;
        b.frustumCulled = false; // the instances spread over the island
        b.count = 0;
        scene.add(b);
        this.batches[name] = b;
      }
    }
    this.add('air', DRONES);
    this.setUnits(units);
  }

  // Copy every drawn target's parts into the batches.
  sync() {
    const batches = Object.values(this.batches);
    for (const b of batches) b.count = 0;
    for (const t of this.list) {
      if (!t.mesh.visible) continue;
      t.mesh.updateMatrixWorld(true);
      for (const [name, node] of t.mesh.userData.parts) {
        const b = this.batches[name];
        b.setMatrixAt(b.count++, node.matrixWorld);
      }
    }
    for (const b of batches) b.instanceMatrix.needsUpdate = true;
  }

  add(kind, count, site = null) {
    for (let i = 0; i < count; i++) {
      const mesh = frame(kind);
      const t = { kind, site, mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, timer: 0, ...KINDS[kind] };
      this.spawn(t);
      this.list.push(t);
    }
  }

  // Replace every ground unit with the garrisons for 'many' or 'few'. Drones stay as they are.
  setUnits(level) {
    const garrison = GARRISON[level] || GARRISON.many;
    this.list = this.list.filter((t) => t.kind === 'air');
    // Vehicles first, so the soldiers can group around them.
    const sites = (this.world.sites || []).map((x) => [x, garrison[x.kind] || {}]).concat([[null, garrison.open]]);
    for (const kind of ['tank', 'aa', 'cannon', 'soldier']) {
      for (const [site, g] of sites) this.add(kind, g[kind] || 0, site);
    }
    this.sync();
  }

  spawn(t) {
    t.health = KINDS[t.kind].health;
    t.alive = true;
    t.mesh.visible = true;
    if (t.kind === 'air') this.spawnAir(t);
    else this.spawnGround(t);
  }

  // A spot for a vehicle inside its site (or in open country), on flat ground, clear of
  // buildings and of the other vehicles.
  groundSpot(out, t) {
    const r = Math.random;
    const site = t.site;
    for (let i = 0; i < 300; i++) {
      if (site) pointInSite(site, r, out);
      else out.set((r() * 2 - 1) * (WORLD.bound - 400), 0, (r() * 2 - 1) * (WORLD.bound - 400));
      const x = out.x;
      const z = out.z;
      if (!site && (this.world.sites || []).some((s) => siteDistance(s, x, z) < 300)) continue;
      const h = this.groundHeight(x, z);
      if (h < 6 || h > (site ? 600 : 300) || this.world.slopeAt(x, z) > 0.15 || this.world.insideBuilding(out.set(x, h + 3, z), 12)) continue;
      // Late tries drop the spacing so a crowded site still finds room.
      if (i < 200 && this.list.some((o) => o !== t && o.kind !== 'air' && o.kind !== 'soldier' && o.start && (o.start.x - x) ** 2 + (o.start.z - z) ** 2 < 22 * 22)) continue;
      return out.set(x, h, z);
    }
    return out.set(0, Math.max(this.groundHeight(0, 0), 0), 0);
  }

  // About a third of the soldiers stand on flat rooftops in their site, the rest in small groups
  // near one of its vehicles.
  soldierSpot(out, t) {
    t.roofY = null;
    const site = t.site;
    const roofs = (this.world.rooftops || []).filter((b) => site && siteDistance(site, (b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2) < 5);
    if (roofs.length && Math.random() < 0.35) {
      const b = roofs[Math.floor(Math.random() * roofs.length)];
      const u = 0.25 + Math.random() * 0.5;
      const v = 0.25 + Math.random() * 0.5;
      t.roofY = b.max[1];
      return out.set(b.min[0] + (b.max[0] - b.min[0]) * u, t.roofY, b.min[2] + (b.max[2] - b.min[2]) * v);
    }
    const anchors = this.list.filter((o) => o.alive && o.site === site && o.kind !== 'air' && o.kind !== 'soldier');
    for (let i = 0; i < 40 && anchors.length; i++) {
      const a = anchors[Math.floor(Math.random() * anchors.length)];
      const ang = Math.random() * Math.PI * 2;
      const d = 18 + Math.random() * 35;
      const x = a.start.x + Math.cos(ang) * d;
      const z = a.start.z + Math.sin(ang) * d;
      const h = this.groundHeight(x, z);
      // Flat-ish ground only: on a steep slope the uphill ground hides the legs.
      if (h > 4 && this.world.slopeAt(x, z) < 0.3 && !this.world.insideBuilding(out.set(x, h + 1.5, z), 3)) return out.set(x, h, z);
    }
    return this.groundSpot(out, t);
  }

  spawnGround(t) {
    // Soldiers come back where they stood, so a group you strafed is there again on the next pass.
    if (t.kind === 'soldier' && t.home) {
      t.start.copy(t.home);
      t.roofY = t.homeRoof;
    } else if (t.kind === 'soldier') {
      t.start = this.soldierSpot(new THREE.Vector3(), t);
      t.home = t.start.clone();
      t.homeRoof = t.roofY;
    } else {
      t.start = this.groundSpot(t.start || new THREE.Vector3(), t);
    }
    t.heading = Math.random() * Math.PI * 2;
    t.dirX = -Math.sin(t.heading);
    t.dirZ = -Math.cos(t.heading);
    // Some tanks and soldiers patrol back and forth, the rest and the AA guns stand still.
    const end = this.groundHeight(t.start.x + t.dirX * t.drive, t.start.z + t.dirZ * t.drive);
    t.patrol = t.drive && !t.roofY && Math.random() < t.driveChance && end > 4 ? t.drive : 0;
    t.s = 0;
    t.sDir = 1;
    if (t.kind === 'tank') t.mesh.userData.turret.rotation.y = (Math.random() - 0.5) * 2;
    this.placeGround(t);
  }

  placeGround(t) {
    const x = t.start.x + t.dirX * t.s;
    const z = t.start.z + t.dirZ * t.s;
    const h = t.roofY ?? this.groundHeight(x, z);
    t.mesh.position.set(x, h - (t.roofY ? 0 : 0.1), z);
    t.mesh.rotation.y = t.heading + (t.sDir < 0 ? Math.PI : 0);
    t.pos.set(x, h + t.center, z);
    const v = t.patrol ? t.speed * t.sDir : 0;
    t.vel.set(t.dirX * v, 0, t.dirZ * v);
  }

  spawnAir(t) {
    const r = Math.random;
    t.R = 500 + r() * 900;
    // Circle near the town so the fight is close to the spawn.
    const town = this.world.town || { x: 0, y: 0 };
    const lim = WORLD.bound - t.R - 300;
    t.cx = Math.max(-lim, Math.min(lim, town.x + (r() * 2 - 1) * 3000));
    t.cz = Math.max(-lim, Math.min(lim, town.y + (r() * 2 - 1) * 3000));
    t.weave = r() < 0.5 ? 0 : 40 + r() * 90;
    t.k = 1 + Math.floor(r() * 3);
    let ground = 0;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ground = Math.max(ground, this.groundHeight(t.cx + Math.cos(a) * t.R, t.cz + Math.sin(a) * t.R));
    }
    t.alt = Math.max(250 + r() * 850, ground + 150 + t.weave);
    t.speed = 90 + r() * 50; // m/s, about 320 to 500 km/h
    t.dir = r() < 0.5 ? -1 : 1;
    t.theta = r() * Math.PI * 2;
    this.place(t);
  }

  place(t) {
    const w = t.speed / t.R;
    const s = Math.sin(t.theta);
    const c = Math.cos(t.theta);
    t.pos.set(t.cx + t.R * c, t.alt + t.weave * Math.sin(t.theta * t.k), t.cz + t.R * s);
    t.vel.set(-t.R * s, t.weave * t.k * Math.cos(t.theta * t.k), t.R * c).multiplyScalar(w * t.dir);

    // Bank into the turn: "up" points along gravity plus the turn's pull toward the center.
    _up.set(t.cx - t.pos.x, 0, t.cz - t.pos.z).multiplyScalar(w * w);
    _up.y += 9.81;
    _back.copy(t.vel).normalize().negate();
    _right.crossVectors(_up, _back).normalize();
    _up.crossVectors(_back, _right).normalize();
    _m.makeBasis(_right, _up, _back);
    t.mesh.position.copy(t.pos);
    t.mesh.quaternion.setFromRotationMatrix(_m);
  }

  update(dt, player) {
    for (const ex of this.explosions) ex.update(dt);
    for (const t of this.list) {
      if (!t.alive) {
        t.timer -= dt;
        if (t.timer <= 0) this.spawn(t);
        continue;
      }
      if (t.kind === 'air') {
        t.theta += (t.dir * t.speed / t.R) * dt;
        this.place(t);
        continue;
      }
      t.mesh.visible = (t.pos.x - player.x) ** 2 + (t.pos.z - player.z) ** 2 < SEE * SEE;
      if (t.kind === 'cannon') continue;
      if (t.kind !== 'aa') {
        if (t.patrol) {
          t.s += t.speed * t.sDir * dt;
          if (t.s > t.patrol || t.s < 0) {
            t.s = Math.min(t.patrol, Math.max(0, t.s));
            t.sDir *= -1;
          }
          this.placeGround(t);
        }
      } else if (t.mesh.visible) {
        // AA guns track the player.
        const dx = player.x - t.pos.x;
        const dz = player.z - t.pos.z;
        t.mesh.userData.mount.rotation.y = Math.atan2(-dx, -dz) - t.mesh.rotation.y;
        t.mesh.userData.pivot.rotation.x = Math.min(1.4, Math.max(0, Math.atan2(player.y - t.pos.y, Math.hypot(dx, dz))));
      }
    }
    this.sync();
  }

  // First live target the segment p0 to p1 passes through, or null.
  hitTest(p0, p1) {
    _a.subVectors(p1, p0);
    const len2 = _a.lengthSq() || 1;
    for (const t of this.list) {
      if (!t.alive) continue;
      const u = Math.min(1, Math.max(0, _b.subVectors(t.pos, p0).dot(_a) / len2));
      _b.copy(p0).addScaledVector(_a, u);
      if (_b.distanceToSquared(t.pos) < t.radius * t.radius) return t;
    }
    return null;
  }

  // Returns true when this hit destroys the target.
  damage(t, amount) {
    t.health -= amount;
    if (t.health > 0) return false;
    t.alive = false;
    t.mesh.visible = false;
    t.timer = t.respawn;
    this.explosions[this.nextExplosion++ % this.explosions.length].start(t.pos, t.kind === 'soldier' ? 0.12 : 1);
    this.sync(); // gone from this frame's picture, not the next one
    return true;
  }

  collides(p, radius) {
    return this.list.some((t) => t.alive && t.pos.distanceToSquared(p) < (radius + t.radius) ** 2);
  }
}
