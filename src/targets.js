// Targets: drones that fly circles and weaves, tanks and AA guns on the ground.
// Everything respawns a few seconds after being destroyed.
import * as THREE from 'three';
import { Explosion } from './jet.js';
import { WORLD } from './world.js';

const DRONES = 6;
const TANKS = 6;
const AA_GUNS = 3;
const KINDS = {
  air: { radius: 5.5, health: 100, respawn: 5 },
  tank: { radius: 4, health: 150, respawn: 8 },
  aa: { radius: 3.5, health: 90, respawn: 8 },
};

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _up = new THREE.Vector3();
const _right = new THREE.Vector3();
const _back = new THREE.Vector3();
const _m = new THREE.Matrix4();

function droneModel() {
  const paint = new THREE.MeshStandardMaterial({ color: '#e8562a', metalness: 0.2, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f0ea', metalness: 0.1, roughness: 0.5 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 7, 14).rotateX(Math.PI / 2), paint));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.6, 14).rotateX(-Math.PI / 2), white);
  nose.position.z = -4.3;
  g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 1.6), paint);
  wing.position.z = 0.4;
  g.add(wing);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 1.6), white);
    tip.position.set(side * 3.9, 0, 0.4);
    g.add(tip);
  }
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.3, 1.2), paint);
  fin.position.set(0, 0.65, 3.0);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.8), white);
  stab.position.z = 3.2;
  g.add(stab);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
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
  return g;
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
  }

  spawn(t) {
    t.health = KINDS[t.kind].health;
    t.alive = true;
    t.mesh.visible = true;
    if (t.kind === 'air') this.spawnAir(t);
    else this.spawnGround(t);
  }

  // Flat open land, near the town most of the time.
  groundSpot(out) {
    const r = Math.random;
    const town = this.world.town;
    for (let i = 0; i < 300; i++) {
      const nearTown = town && r() < 0.6;
      const x = nearTown ? town.x + (r() * 2 - 1) * 700 : (r() * 2 - 1) * (WORLD.bound - 400);
      const z = nearTown ? town.y + (r() * 2 - 1) * 700 : (r() * 2 - 1) * (WORLD.bound - 400);
      const h = this.groundHeight(x, z);
      if (h > 8 && h < 250 && this.world.slopeAt(x, z) < 0.15) return out.set(x, h, z);
    }
    return out.set(0, Math.max(this.groundHeight(0, 0), 0), 0);
  }

  spawnGround(t) {
    t.start = this.groundSpot(t.start || new THREE.Vector3());
    t.heading = Math.random() * Math.PI * 2;
    t.dirX = -Math.sin(t.heading);
    t.dirZ = -Math.cos(t.heading);
    // Half the tanks drive back and forth over 220 m, the rest and the AA guns stand still.
    t.drive = t.kind === 'tank' && Math.random() < 0.5 && this.groundHeight(t.start.x + t.dirX * 220, t.start.z + t.dirZ * 220) > 6 ? 220 : 0;
    t.s = 0;
    t.sDir = 1;
    if (t.kind === 'tank') t.mesh.userData.turret.rotation.y = (Math.random() - 0.5) * 2;
    this.placeGround(t);
  }

  placeGround(t) {
    const x = t.start.x + t.dirX * t.s;
    const z = t.start.z + t.dirZ * t.s;
    const h = this.groundHeight(x, z);
    t.mesh.position.set(x, h - 0.1, z);
    t.mesh.rotation.y = t.heading + (t.sDir < 0 ? Math.PI : 0);
    t.pos.set(x, h + (t.kind === 'tank' ? 1.6 : 1.8), z);
    const v = t.drive ? 7 * t.sDir : 0;
    t.vel.set(t.dirX * v, 0, t.dirZ * v);
  }

  spawnAir(t) {
    const r = Math.random;
    t.R = 500 + r() * 900;
    t.cx = (r() * 2 - 1) * (WORLD.bound - t.R - 300);
    t.cz = (r() * 2 - 1) * (WORLD.bound - t.R - 300);
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
      } else if (t.kind === 'tank') {
        if (t.drive) {
          t.s += 7 * t.sDir * dt;
          if (t.s > t.drive || t.s < 0) {
            t.s = Math.min(t.drive, Math.max(0, t.s));
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
    this.explosions[this.nextExplosion++ % this.explosions.length].start(t.pos);
    return true;
  }

  collides(p, radius) {
    return this.list.some((t) => t.alive && t.pos.distanceToSquared(p) < (radius + t.radius) ** 2);
  }
}
