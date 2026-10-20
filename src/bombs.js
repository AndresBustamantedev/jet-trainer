// Unguided bombs for the attack jet: they leave with the jet's velocity and fall in an arc.
// The HUD shows where a bomb dropped right now would land (predictImpact).
import * as THREE from 'three';
import { Explosion } from './jet.js';
import { coloredMerge } from './world.js';

export const BOMBS = {
  capacity: 4,
  reload: 5, // seconds per bomb
  interval: 0.35, // between drops while fire is held
  radius: 36, // blast radius, m
  damage: 200, // at the center: one direct hit kills a tank, soldiers die anywhere in the blast
  drag: 0.01, // heavy bombs barely slow down
  gravity: 1.6, // times real gravity: falls faster and steeper than real, for an arcade feel
  push: 6, // m/s downward kick on release
  blastSize: 3.3, // explosion size
};

const G = 9.81 * BOMBS.gravity;
const _p0 = new THREE.Vector3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _hit = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

let bombGeo = null;
export function bombGeometry() {
  if (!bombGeo) {
    const body = '#4b5340';
    const tail = '#3a3f33';
    bombGeo = coloredMerge([
      [new THREE.CylinderGeometry(0.2, 0.2, 1.6, 12).rotateX(Math.PI / 2), body],
      [new THREE.SphereGeometry(0.2, 12, 8).scale(1, 1, 1.6).translate(0, 0, -0.8), body],
      [new THREE.ConeGeometry(0.2, 0.5, 12).rotateX(Math.PI / 2).translate(0, 0, 1.05), tail],
      [new THREE.BoxGeometry(0.62, 0.03, 0.3).translate(0, 0, 1.15), tail],
      [new THREE.BoxGeometry(0.03, 0.62, 0.3).translate(0, 0, 1.15), tail],
      [new THREE.CylinderGeometry(0.205, 0.205, 0.08, 12).rotateX(Math.PI / 2).translate(0, 0, -0.5), '#c9a227'],
    ]);
  }
  return bombGeo;
}
export const bombMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });

export class Bombs {
  constructor(scene, world, targets) {
    this.world = world;
    this.targets = targets;
    this.meshes = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(bombGeometry(), bombMaterial);
      m.visible = false;
      m.castShadow = true;
      scene.add(m);
      this.meshes.push(m);
    }
    this.live = []; // { mesh, p, v }
    this.blasts = [0, 1, 2].map(() => new Explosion(scene));
    this.nextBlast = 0;
    this.reset();
  }

  reset() {
    this.ammo = BOMBS.capacity;
    this.reloadT = 0;
    this.cool = 0;
    this.side = 1;
    for (const b of this.live) b.mesh.visible = false;
    this.live.length = 0;
  }

  // Where a bomb leaves the jet: under the wing, alternating sides.
  release(fm, out, side = 0) {
    return out.copy(fm.position).addScaledVector(fm.right, side * 3.2).addScaledVector(fm.up, -0.7);
  }

  drop(fm) {
    const mesh = this.meshes.find((m) => !m.visible);
    if (!mesh) return;
    const b = { mesh, p: new THREE.Vector3(), v: new THREE.Vector3() };
    this.release(fm, b.p, this.side);
    b.v.copy(fm.velDir).multiplyScalar(fm.speed).addScaledVector(fm.up, -BOMBS.push);
    this.side = -this.side;
    mesh.visible = true;
    this.live.push(b);
    this.ammo--;
  }

  // One physics step shared by real bombs and the impact prediction.
  static step(p, v, dt) {
    v.y -= G * dt;
    v.multiplyScalar(1 - BOMBS.drag * dt);
    p.addScaledVector(v, dt);
  }

  ground(p) {
    return Math.max(this.world.groundHeight(p.x, p.z), 0);
  }

  // Returns what happened this frame for score and sound.
  update(dt, fm, trigger) {
    const out = { drops: 0, kills: 0, booms: 0, killed: [] };
    if (this.ammo < BOMBS.capacity) {
      this.reloadT += dt;
      if (this.reloadT >= BOMBS.reload) {
        this.ammo++;
        this.reloadT = 0;
      }
    } else {
      this.reloadT = 0;
    }
    this.cool -= dt;
    if (trigger && this.ammo > 0 && this.cool <= 0) {
      this.drop(fm);
      this.cool = BOMBS.interval;
      out.drops++;
    }

    for (const ex of this.blasts) ex.update(dt);
    let keep = 0;
    for (const b of this.live) {
      _p0.copy(b.p);
      Bombs.step(b.p, b.v, dt);
      let at = null;
      if (this.targets.hitTest(_p0, b.p)) at = b.p;
      else if (this.world.buildingHit(_p0, b.p, _hit)) at = _hit;
      else if (b.p.y <= this.ground(b.p)) {
        b.p.y = this.ground(b.p);
        at = b.p;
      }
      if (at) {
        out.kills += this.explode(at, out.killed);
        out.booms++;
        b.mesh.visible = false;
        continue;
      }
      b.mesh.position.copy(b.p);
      b.mesh.quaternion.copy(_q.setFromUnitVectors(Z, _dir.copy(b.v).normalize()));
      this.live[keep++] = b;
    }
    this.live.length = keep;
    return out;
  }

  // Adds the kind of each target it destroys to killed.
  explode(at, killed) {
    this.blasts[this.nextBlast++ % this.blasts.length].start(at, BOMBS.blastSize);
    let kills = 0;
    for (const t of this.targets.list) {
      if (!t.alive) continue;
      const d = t.pos.distanceTo(at);
      if (d >= BOMBS.radius) continue;
      if (this.targets.damage(t, BOMBS.damage * Math.pow(1 - d / BOMBS.radius, 0.6))) {
        kills++;
        killed.push(t.kind);
      }
    }
    return kills;
  }

  // Where a bomb released now would hit the ground, or null if it would not land within 40 s.
  predictImpact(fm, out) {
    this.release(fm, out, 0);
    _v.copy(fm.velDir).multiplyScalar(fm.speed).addScaledVector(fm.up, -BOMBS.push);
    const dt = 0.05;
    for (let t = 0; t < 40; t += dt) {
      Bombs.step(out, _v, dt);
      const g = this.ground(out);
      if (out.y <= g) {
        out.y = g;
        return out;
      }
    }
    return null;
  }
}
