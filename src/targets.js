// Targets: drones that fly circles and weaves, tanks and AA guns on the ground.
// Everything respawns a few seconds after being destroyed.
import * as THREE from 'three';
import { Explosion } from './jet.js';
import { WORLD, coloredMerge } from './world.js';
import { pointInSite } from './places.js';

const DRONES = 20;
const TANKS = 6;
const AA_GUNS = 3;
const SOLDIERS = 24;
// center: hitbox height above the ground. drive: patrol length in m, taken by driveChance of them.
const KINDS = {
  air: { radius: 5.5, health: 100, respawn: 5 },
  tank: { radius: 8, health: 150, respawn: 8, center: 3.2, speed: 7, drive: 220, driveChance: 0.5 },
  aa: { radius: 7, health: 90, respawn: 8, center: 3.6, speed: 0, drive: 0, driveChance: 0 },
  soldier: { radius: 1.8, health: 9, respawn: 10, center: 1.35, speed: 1.6, drive: 30, driveChance: 0.5 },
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _m = new THREE.Matrix4();

// One mesh per drone (body, nose, wings, tips, fin, tail), so many drones stay cheap to draw.
let droneGeo = null;
const droneMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.2, roughness: 0.5 });
function droneModel() {
  if (!droneGeo) {
    const orange = '#e8562a';
    const white = '#f2f0ea';
    droneGeo = coloredMerge([
      [new THREE.CylinderGeometry(0.5, 0.35, 7, 14).rotateX(Math.PI / 2), orange],
      [new THREE.ConeGeometry(0.35, 1.6, 14).rotateX(-Math.PI / 2).translate(0, 0, -4.3), white],
      [new THREE.BoxGeometry(7.2, 0.1, 1.6).translate(0, 0, 0.4), orange],
      [new THREE.BoxGeometry(0.6, 0.12, 1.6).translate(-3.9, 0, 0.4), white],
      [new THREE.BoxGeometry(0.6, 0.12, 1.6).translate(3.9, 0, 0.4), white],
      [new THREE.BoxGeometry(0.08, 1.3, 1.2).translate(0, 0.65, 3.0), orange],
      [new THREE.BoxGeometry(2.6, 0.08, 0.8).translate(0, 0, 3.2), white],
    ]);
  }
  const m = new THREE.Mesh(droneGeo, droneMat);
  m.castShadow = true;
  return m;
}

function tankModel() {
  const olive = new THREE.MeshStandardMaterial({ color: '#5b6339', roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2d2f28', roughness: 0.9 });
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.0, 6.6), olive);
  hull.position.y = 1.0;
  g.add(hull);
  for (const side of [-1, 1]) {
    const track = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, 7), dark);
    track.position.set(side * 1.65, 0.5, 0);
    g.add(track);
  }
  const turret = new THREE.Group();
  turret.position.y = 1.5;
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.75, 3), olive);
  top.position.y = 0.38;
  turret.add(top);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.4).rotateX(Math.PI / 2), dark);
  barrel.position.set(0, 0.4, -3.6);
  turret.add(barrel);
  g.add(turret);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.turret = turret;
  g.scale.setScalar(2); // about 13 m long: bigger than real so it reads from the air
  return g;
}

function aaModel() {
  const paint = new THREE.MeshStandardMaterial({ color: '#6b6a52', roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b2c27', roughness: 0.7, metalness: 0.4 });
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.6, 3.2), paint);
  base.position.y = 0.3;
  g.add(base);
  const mount = new THREE.Group();
  mount.position.y = 0.6;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), paint);
  body.position.y = 0.65;
  mount.add(body);
  const pivot = new THREE.Group();
  pivot.position.y = 1.1;
  for (const side of [-1, 1]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.4).rotateX(Math.PI / 2), dark);
    barrel.position.set(side * 0.45, 0, -1.9);
    pivot.add(barrel);
  }
  mount.add(pivot);
  g.add(mount);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.mount = mount;
  g.userData.pivot = pivot;
  g.scale.setScalar(2);
  return g;
}

// A soldier in one mesh: legs, body, arms, head, helmet and a rifle. Drawn 1.5 times real size
// in tan, so they stand out against the grass from a jet.
let soldierGeo = null;
const soldierMat = new THREE.MeshLambertMaterial({ vertexColors: true });
function soldierModel() {
  if (!soldierGeo) {
    const tan = '#c2a878';
    soldierGeo = coloredMerge([
      [new THREE.BoxGeometry(0.16, 0.85, 0.22).translate(-0.11, 0.42, 0), '#9c8660'],
      [new THREE.BoxGeometry(0.16, 0.85, 0.22).translate(0.11, 0.42, 0), '#9c8660'],
      [new THREE.BoxGeometry(0.5, 0.62, 0.3).translate(0, 1.17, 0), tan],
      [new THREE.BoxGeometry(0.12, 0.55, 0.14).translate(-0.31, 1.15, -0.08), tan],
      [new THREE.BoxGeometry(0.12, 0.55, 0.14).translate(0.31, 1.15, -0.08), tan],
      [new THREE.SphereGeometry(0.12, 10, 8).translate(0, 1.6, 0), '#c49a76'],
      [new THREE.SphereGeometry(0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.64, 0), '#5a4f3c'],
      [new THREE.BoxGeometry(0.06, 0.08, 0.85).translate(0.18, 1.12, -0.35), '#232421'],
    ]).scale(1.5, 1.5, 1.5);
  }
  const m = new THREE.Mesh(soldierGeo, soldierMat);
  m.castShadow = true;
  return m;
}

export class Targets {
  constructor(scene, world) {
    this.world = world;
    this.groundHeight = world.groundHeight;
    this.list = [];
    this.explosions = [0, 1, 2, 3].map(() => new Explosion(scene));
    this.nextExplosion = 0;
    const add = (kind, count, makeModel) => {
      for (let i = 0; i < count; i++) {
        const mesh = makeModel();
        scene.add(mesh);
        const t = { kind, mesh, pos: new THREE.Vector3(), vel: new THREE.Vector3(), alive: false, timer: 0, ...KINDS[kind] };
        this.spawn(t);
        this.list.push(t);
      }
    };
    add('air', DRONES, droneModel);
    add('tank', TANKS, tankModel);
    add('aa', AA_GUNS, aaModel);
    add('soldier', SOLDIERS, soldierModel);
  }

  spawn(t) {
    t.health = KINDS[t.kind].health;
    t.alive = true;
    t.mesh.visible = true;
    if (t.kind === 'air') this.spawnAir(t);
    else this.spawnGround(t);
  }

  // Vehicles stand at the places: mostly the military base, airfield and town, some at the
  // industrial area and villages. A few stand in open country.
  groundSpot(out) {
    const r = Math.random;
    const sites = (this.world.sites || []).filter((x) => x.kind !== 'radar');
    const weight = { base: 3, airfield: 2.5, town: 2, industrial: 1.5, village: 0.6 };
    const total = sites.reduce((a, x) => a + (weight[x.kind] || 0), 0);
    for (let i = 0; i < 300; i++) {
      let site = null;
      if (total && r() < 0.9) {
        let pick = r() * total;
        site = sites.find((x) => (pick -= weight[x.kind] || 0) <= 0) || sites[0];
      }
      if (site) pointInSite(site, r, out);
      else out.set((r() * 2 - 1) * (WORLD.bound - 400), 0, (r() * 2 - 1) * (WORLD.bound - 400));
      const x = out.x;
      const z = out.z;
      const h = this.groundHeight(x, z);
      if (h > 6 && h < 300 && this.world.slopeAt(x, z) < 0.15 && !this.world.insideBuilding(out.set(x, h + 3, z), 12)) return out.set(x, h, z);
    }
    return out.set(0, Math.max(this.groundHeight(0, 0), 0), 0);
  }

  // About a third of the soldiers stand on flat rooftops in the town, the rest in small groups
  // near a tank or AA gun.
  soldierSpot(out, t) {
    t.roofY = null;
    const roofs = this.world.rooftops || [];
    if (roofs.length && Math.random() < 0.35) {
      const b = roofs[Math.floor(Math.random() * roofs.length)];
      const u = 0.25 + Math.random() * 0.5;
      const v = 0.25 + Math.random() * 0.5;
      t.roofY = b.max[1];
      return out.set(b.min[0] + (b.max[0] - b.min[0]) * u, t.roofY, b.min[2] + (b.max[2] - b.min[2]) * v);
    }
    const anchors = this.list.filter((o) => o.alive && (o.kind === 'tank' || o.kind === 'aa'));
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
    return this.groundSpot(out);
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
      t.start = this.groundSpot(t.start || new THREE.Vector3());
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
      } else if (t.kind !== 'aa') {
        if (t.patrol) {
          t.s += t.speed * t.sDir * dt;
          if (t.s > t.patrol || t.s < 0) {
            t.s = Math.min(t.patrol, Math.max(0, t.s));
            t.sDir *= -1;
          }
          this.placeGround(t);
        }
      } else {
        // AA guns track the player.
        const dx = player.x - t.pos.x;
        const dz = player.z - t.pos.z;
        t.mesh.userData.mount.rotation.y = Math.atan2(-dx, -dz) - t.mesh.rotation.y;
        t.mesh.userData.pivot.rotation.x = Math.min(1.4, Math.max(0, Math.atan2(player.y - t.pos.y, Math.hypot(dx, dz))));
      }
    }
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
    return true;
  }

  collides(p, radius) {
    return this.list.some((t) => t.alive && t.pos.distanceToSquared(p) < (radius + t.radius) ** 2);
  }
}
