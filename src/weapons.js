// Nose cannon: tracers, overheat, hits on drones and dust on the ground.
import * as THREE from 'three';

export const GUN = {
  rate: 20, // rounds per second
  muzzleSpeed: 1000, // m/s on top of the jet's own speed
  drop: 3, // bullet gravity, m/s², lighter than real for an arcade feel
  life: 1.6, // seconds, about 2 km of range
  damage: 9, // 12 hits per drone
  spread: 0.0035, // radians
  heatPerShot: 1 / 60, // 3 seconds of fire to overheat
  cool: 0.6, // heat lost per second when not firing
  overheatCool: 0.45,
};

const MAX_BULLETS = 400;
const TRACER_LENGTH = 12;
export const GUN_OFFSET = new THREE.Vector3(1.3, 0.35, -1.6); // right wing root, like an F-22
const Z = new THREE.Vector3(0, 0, 1);
const DIRT = new THREE.Color('#8c7b66');
const CONCRETE = new THREE.Color('#a8a49c');

const _p0 = new THREE.Vector3();
const _d = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _s = new THREE.Vector3(1, 1, TRACER_LENGTH);

export class Gun {
  constructor(scene, world) {
    this.groundHeight = world.groundHeight;
    this.buildingHit = world.buildingHit;
    this.wallHit = new THREE.Vector3();
    this.bullets = [];
    this.heat = 0;
    this.overheated = false;
    this.cooldown = 0;
    this.firing = false;

    this.tracers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.16, 0.16, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffcf6e').multiplyScalar(2.5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      MAX_BULLETS,
    );
    this.tracers.frustumCulled = false;
    this.tracers.count = 0;
    scene.add(this.tracers);

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 10, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd38a').multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.flash.visible = false;
    scene.add(this.flash);

    this.puffs = [];
    const puffMat = new THREE.MeshLambertMaterial({ color: '#8c7b66', transparent: true, depthWrite: false });
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), puffMat.clone());
      m.visible = false;
      scene.add(m);
      this.puffs.push({ mesh: m, t: 0 });
    }
    this.nextPuff = 0;
  }

  muzzle(fm, out) {
    return out.copy(GUN_OFFSET).applyQuaternion(fm.quaternion).add(fm.position);
  }

  fire(fm, age) {
    const b = this.bullets.length >= MAX_BULLETS ? this.bullets.shift() : { p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 };
    _d.copy(fm.fwd);
    _d.x += (Math.random() - 0.5) * GUN.spread * 2;
    _d.y += (Math.random() - 0.5) * GUN.spread * 2;
    _d.z += (Math.random() - 0.5) * GUN.spread * 2;
    _d.normalize();
    b.v.copy(fm.velDir).multiplyScalar(fm.speed).addScaledVector(_d, GUN.muzzleSpeed);
    this.muzzle(fm, b.p).addScaledVector(b.v, age);
    b.life = GUN.life - age;
    this.bullets.push(b);
  }

  puff(p, color = DIRT) {
    const puff = this.puffs[this.nextPuff++ % this.puffs.length];
    puff.mesh.material.color.copy(color);
    puff.mesh.position.copy(p);
    puff.mesh.visible = true;
    puff.t = 0;
  }

  // Returns what happened this frame so the HUD and sound can react.
  update(dt, fm, trigger, targets) {
    const out = { shots: 0, hits: 0, kills: 0 };
    this.cooldown -= dt;
    this.firing = trigger && !this.overheated;
    if (this.firing) {
      while (this.cooldown <= 0) {
        this.fire(fm, -this.cooldown);
        this.cooldown += 1 / GUN.rate;
        out.shots++;
        this.heat += GUN.heatPerShot;
        if (this.heat >= 1) {
          this.heat = 1;
          this.overheated = true;
          break;
        }
      }
    } else {
      this.cooldown = Math.max(this.cooldown, 0);
      this.heat = Math.max(0, this.heat - dt * (this.overheated ? GUN.overheatCool : GUN.cool));
      if (this.overheated && this.heat === 0) this.overheated = false;
    }

    this.flash.visible = this.firing;
    if (this.firing) {
      this.muzzle(fm, this.flash.position).addScaledVector(fm.fwd, 0.8);
      this.flash.scale.setScalar(0.6 + Math.random() * 0.8);
    }

    let alive = 0;
    for (const b of this.bullets) {
      _p0.copy(b.p);
      b.v.y -= GUN.drop * dt;
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      const hit = targets.hitTest(_p0, b.p);
      if (hit) {
        out.hits++;
        if (targets.damage(hit, GUN.damage)) out.kills++;
        continue;
      }
      if (this.buildingHit(_p0, b.p, this.wallHit)) {
        this.puff(this.wallHit, CONCRETE);
        continue;
      }
      const ground = Math.max(this.groundHeight(b.p.x, b.p.z), 0);
      if (b.p.y < ground) {
        b.p.y = ground;
        this.puff(b.p);
        continue;
      }
      if (b.life <= 0) continue;
      this.bullets[alive++] = b;
    }
    this.bullets.length = alive;

    for (let i = 0; i < alive; i++) {
      const b = this.bullets[i];
      _d.copy(b.v).normalize();
      _q.setFromUnitVectors(Z, _d);
      _p0.copy(b.p).addScaledVector(_d, -TRACER_LENGTH / 2);
      _m.compose(_p0, _q, _s);
      this.tracers.setMatrixAt(i, _m);
    }
    this.tracers.count = alive;
    this.tracers.instanceMatrix.needsUpdate = true;

    for (const puff of this.puffs) {
      if (!puff.mesh.visible) continue;
      puff.t += dt;
      puff.mesh.scale.setScalar(1.5 + puff.t * 9);
      puff.mesh.material.opacity = Math.max(0, 0.7 * (1 - puff.t / 1.2));
      if (puff.t > 1.2) puff.mesh.visible = false;
    }
    return out;
  }

  clear() {
    this.bullets.length = 0;
    this.tracers.count = 0;
    this.flash.visible = false;
    this.heat = 0;
    this.overheated = false;
  }
}
