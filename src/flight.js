// Arcade flight model in the Battlefield style: throttle has three states
// (afterburner, cruise, air brake) and turn rate peaks in a speed band.
import * as THREE from 'three';

const DEG = Math.PI / 180;
const KMH = 1 / 3.6;

// All feel numbers live here. They are guesses, not measured from BF6 yet.
export const TUNING = {
  stallKmh: 170,
  minKmh: 230, // air brake target
  cruiseKmh: 430, // no throttle input
  fastKmh: 600, // throttle up target
  maxKmh: 760, // afterburner target
  vneKmh: 980,
  sweetLowKmh: 380, // best turn band
  sweetHighKmh: 490,
  boostAccel: 20, // m/s², afterburner
  throttleAccel: 8, // throttle up, weaker than gravity in a climb
  brakeDecel: 42,
  settleAccel: 5, // drift back to cruise when slower, weaker than gravity in a climb
  overspeedDrag: 6, // drift back to cruise when faster, weaker than gravity in a dive
  pitchRate: 64, // deg/s at best speed
  rollRate: 190,
  yawRate: 30,
  pitchResponse: 7,
  rollResponse: 11,
  yawResponse: 5,
  climbLoss: 0.85, // how much gravity trades speed for height
  turnBleed: 9, // m/s² lost at full pitch
  ceiling: 1700,
};

// The two jets. The fighter uses TUNING as written; the attack jet is slower, heavier and turns
// wider, and carries bombs.
const BASE_TUNING = { ...TUNING };
export const JET_TYPES = {
  fighter: { name: 'Fighter', summary: 'Fast and agile. Machine gun only.', tuning: {} },
  attack: {
    name: 'Attack jet',
    summary: 'Slower and heavier, turns wider. Machine gun on 1, bombs on 2.',
    tuning: {
      cruiseKmh: 380, fastKmh: 520, maxKmh: 640, sweetLowKmh: 330, sweetHighKmh: 430,
      pitchRate: 52, rollRate: 150, yawRate: 26, boostAccel: 15, throttleAccel: 7,
    },
  },
};
export function applyJetType(type) {
  Object.assign(TUNING, BASE_TUNING, (JET_TYPES[type] || JET_TYPES.fighter).tuning);
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _inv = new THREE.Quaternion();

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const smoothstep = (a, b, x) => smooth((x - a) / (b - a));

export function turnEfficiency(kmh) {
  const T = TUNING;
  if (kmh < T.sweetLowKmh) return 0.3 + 0.7 * smoothstep(T.stallKmh, T.sweetLowKmh, kmh);
  if (kmh > T.sweetHighKmh) return 1 - 0.45 * smoothstep(T.sweetHighKmh, T.maxKmh, kmh);
  return 1;
}

export class FlightModel {
  constructor() {
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.velDir = new THREE.Vector3(0, 0, -1);
    this.speed = TUNING.cruiseKmh * KMH; // m/s
    this.angVel = new THREE.Vector3(); // x pitch, y yaw, z roll (rad/s)
    this.throttle = 0;
    this.boost = false;
    this.lift = 1;
    this.turnEff = 1;
    this.g = 1;
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.right = new THREE.Vector3(1, 0, 0);
  }

  reset(position, heading) {
    this.position.copy(position);
    this.quaternion.setFromAxisAngle(Y, heading);
    this.updateAxes();
    this.velDir.copy(this.fwd);
    this.speed = TUNING.cruiseKmh * KMH;
    this.angVel.set(0, 0, 0);
    this.throttle = 0;
    this.boost = false;
    this.g = 1;
  }

  updateAxes() {
    this.fwd.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
  }

  get kmh() {
    return this.speed * 3.6;
  }

  update(dt, input) {
    const T = TUNING;
    const kmh = this.kmh;
    this.turnEff = turnEfficiency(kmh);
    this.lift = smoothstep(T.stallKmh * 0.75, T.stallKmh * 1.15, kmh);
    const eff = this.turnEff;

    // Rotation: commands become target rates, actual rates chase them.
    const av = this.angVel;
    av.x += (input.pitch * T.pitchRate * DEG * eff - av.x) * (1 - Math.exp(-dt * T.pitchResponse));
    av.y += (input.yaw * T.yawRate * DEG * eff - av.y) * (1 - Math.exp(-dt * T.yawResponse));
    av.z += (input.roll * T.rollRate * DEG * (0.5 + 0.5 * eff) - av.z) * (1 - Math.exp(-dt * T.rollResponse));
    this.quaternion.multiply(_q.setFromAxisAngle(X, av.x * dt));
    this.quaternion.multiply(_q.setFromAxisAngle(Y, -av.y * dt));
    this.quaternion.multiply(_q.setFromAxisAngle(Z, -av.z * dt));
    this.quaternion.normalize();
    this.updateAxes();

    // Throttle: W heads to fast, S to min, Shift (afterburner) to max, nothing settles at cruise.
    this.throttle = Math.sign(input.throttle);
    this.boost = !!input.boost;
    let target = T.cruiseKmh * KMH;
    if (this.boost) target = T.maxKmh * KMH;
    else if (this.throttle > 0) target = T.fastKmh * KMH;
    else if (this.throttle < 0) target = T.minKmh * KMH;
    const diff = target - this.speed;
    const push = this.boost ? T.boostAccel : this.throttle > 0 ? T.throttleAccel : T.settleAccel;
    const rate = diff > 0 ? push : (this.throttle < 0 && !this.boost ? T.brakeDecel : T.overspeedDrag);
    this.speed += clamp(diff, -rate * dt, rate * dt);

    // Energy: climbing costs speed, diving adds it, hard pulls bleed it.
    this.speed -= 9.81 * T.climbLoss * this.velDir.y * dt;
    this.speed -= (Math.abs(av.x) / (T.pitchRate * DEG)) * T.turnBleed * dt;

    // Above the ceiling the engine loses air and the nose falls.
    const over = clamp((this.position.y - T.ceiling) / 150, 0, 1);
    this.speed -= over * 60 * dt;

    // Flight path follows the nose while there is lift.
    this.velDir.lerp(this.fwd, 1 - Math.exp(-dt * (0.6 + 5 * this.lift))).normalize();
    _v.copy(this.velDir).multiplyScalar(this.speed);
    _v.y -= ((1 - this.lift) * 9.81 + over * 40) * dt;
    this.speed = clamp(_v.length(), 15, T.vneKmh * KMH);
    this.velDir.copy(_v).normalize();

    // Stall: the nose drops toward the flight path.
    const sink = Math.max(1 - this.lift, over);
    if (sink > 0) {
      _q.setFromUnitVectors(this.fwd, this.velDir);
      _qi.identity().slerp(_q, Math.min(1, sink * dt * 2.5));
      this.quaternion.premultiply(_qi).normalize();
      this.updateAxes();
    }

    this.position.addScaledVector(this.velDir, this.speed * dt);

    const gNow = this.up.y + (av.x * this.speed / 9.81) * 0.55;
    this.g += (gNow - this.g) * (1 - Math.exp(-dt * 6));
  }
}

// "Look and turn": turns an aim direction into stick commands.
export function aimInputs(fm, aimDir, out) {
  _inv.copy(fm.quaternion).invert();
  _v.copy(aimDir).applyQuaternion(_inv); // aim in jet space, nose is -Z
  const fz = -_v.z;
  const off = Math.acos(clamp(fz, -1, 1));
  const pitchErr = Math.atan2(_v.y, fz);
  const yawErr = Math.atan2(_v.x, fz);
  const rollToward = Math.atan2(_v.x, _v.y); // bank that puts the aim point overhead
  const bank = Math.atan2(-fm.right.y, fm.up.y);
  // Far off target: roll toward it and pull. Close: level the wings and fine tune.
  const w = smoothstep(3 * DEG, 12 * DEG, off);
  out.roll = clamp((rollToward * w - bank * (1 - w)) * 2.2, -1, 1);
  let pitch = pitchErr * 3.5;
  if (pitch < 0 && off > 15 * DEG) pitch *= 0.3;
  out.pitch = clamp(pitch, -1, 1);
  out.yaw = clamp(yawErr * 2.5, -1, 1) * (1 - 0.7 * w);
  return out;
}
