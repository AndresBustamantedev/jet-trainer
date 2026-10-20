import * as THREE from 'three';
import { createWorld, WORLD } from './world.js';
import { Jet, Explosion } from './jet.js';
import { FlightModel, aimInputs, TUNING } from './flight.js';
import { Controls, keyLabel } from './controls.js';
import { Hud } from './hud.js';
import { createMenu } from './menu.js';
import { Targets } from './targets.js';
import { Gun } from './weapons.js';
import { Sfx } from './audio.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const MAX_PIXEL_RATIO = Math.min(devicePixelRatio, 2);
let pixelRatio = MAX_PIXEL_RATIO;
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.5, 40000);
const world = createWorld(scene, renderer);
const jet = new Jet(scene);
const explosion = new Explosion(scene);
const fm = new FlightModel();
const controls = new Controls();
const hud = new Hud(document.getElementById('hud'));
const targets = new Targets(scene, world);
const gun = new Gun(scene, world.groundHeight);
const sfx = new Sfx();
const score = { shots: 0, hits: 0, kills: 0 };
const fx = { hitAge: 9, killAge: 9 };
const gunPoint = new THREE.Vector3();

const SPAWN = new THREE.Vector3(0, 800, 3900);
const OUT_OF_BOUNDS_TIME = 10;

const state = { paused: true, cameraMode: 'chase', crashed: false, oob: 0, agl: 0, warnings: [] };
const aim = { yaw: 0, pitch: 0, dir: new THREE.Vector3(0, 0, -1) };
const auto = { pitch: 0, roll: 0, yaw: 0 };
const cmd = { pitch: 0, roll: 0, yaw: 0, throttle: 0, boost: false };
const look = { yaw: 0, pitch: 0, zoom: false };
const lookQuat = new THREE.Quaternion();
const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

const camQuat = new THREE.Quaternion();
const targetQuat = new THREE.Quaternion();
const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.07);
const euler = new THREE.Euler(0, 0, 0, 'YXZ');
const CHASE_OFFSET = new THREE.Vector3(0, 4.2, 19);
const COCKPIT_OFFSET = new THREE.Vector3(0, 0.95, -3.4);
const _v = new THREE.Vector3();

function updateAimDir() {
  const cp = Math.cos(aim.pitch);
  aim.dir.set(-Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cp);
}

function syncAimToJet() {
  aim.yaw = Math.atan2(-fm.fwd.x, -fm.fwd.z);
  aim.pitch = Math.asin(clamp(fm.fwd.y, -1, 1));
  updateAimDir();
}

function respawn() {
  fm.reset(SPAWN, 0);
  jet.reset(fm);
  explosion.stop();
  gun.clear();
  state.crashed = false;
  state.oob = 0;
  cmd.pitch = cmd.roll = cmd.yaw = cmd.throttle = 0;
  cmd.boost = false;
  look.yaw = look.pitch = 0;
  syncAimToJet();
  camQuat.copy(fm.quaternion);
  placeCamera(1);
}

function crash() {
  state.crashed = true;
  explosion.start(fm.position);
  jet.hide();
  gun.firing = false;
  sfx.boom();
}


function pullUpWarning() {
  for (let t = 1; t <= 4; t++) {
    _v.copy(fm.position).addScaledVector(fm.velDir, fm.speed * t);
    if (_v.y < Math.max(world.groundHeight(_v.x, _v.z), 0) + 15) return true;
  }
  return false;
}

function step(dt) {
  const inp = controls.sample(dt);
  if (controls.tapped('camera')) state.cameraMode = state.cameraMode === 'chase' ? 'cockpit' : 'chase';
  if (controls.tapped('respawn')) {
    respawn();
    return;
  }
  explosion.update(dt);
  targets.update(dt, fm.position);
  fx.hitAge += dt;
  fx.killAge += dt;
  const shot = gun.update(dt, fm, !state.crashed && controls.held('fire'), targets);
  score.shots += shot.shots;
  score.hits += shot.hits;
  score.kills += shot.kills;
  if (shot.hits) fx.hitAge = 0;
  if (shot.kills) fx.killAge = 0;
  sfx.gun(shot.shots);
  if (shot.hits) sfx.hit(shot.kills > 0);
  sfx.engine(fm.throttle, fm.boost, fm.kmh, !state.crashed);

  // Free look (hold): the mouse orbits the camera, releasing it swings back behind the jet.
  look.zoom = inp.zoom;
  if (inp.freeLook) {
    look.yaw = clamp(look.yaw - inp.mouseDX * 0.003, -Math.PI, Math.PI);
    look.pitch = clamp(look.pitch - inp.mouseDY * 0.003, -1.2, 1.2);
  } else {
    const k = Math.exp(-dt * 6);
    look.yaw *= k;
    look.pitch *= k;
  }
  if (state.crashed) return;

  const c = controls.config;
  if (c.mouse === 'aim') {
    if (!inp.freeLook) {
      const k = 0.0021 * c.sensAim;
      aim.yaw -= inp.mouseDX * k;
      aim.pitch = clamp(aim.pitch - inp.mouseDY * k * (c.invertY ? -1 : 1), -1.5, 1.5);
      updateAimDir();
    }
    aimInputs(fm, aim.dir, auto);
    cmd.pitch = Math.abs(inp.keyPitch) > 0.05 ? inp.keyPitch : auto.pitch;
    cmd.roll = Math.abs(inp.keyRoll) > 0.05 ? inp.keyRoll : auto.roll;
    cmd.yaw = Math.abs(inp.keyYaw) > 0.05 ? inp.keyYaw : auto.yaw;
  } else {
    cmd.pitch = inp.pitch;
    cmd.roll = inp.roll;
    cmd.yaw = inp.yaw;
  }
  cmd.throttle = inp.throttle;
  cmd.boost = inp.boost;

  fm.update(dt, cmd);
  jet.sync(fm, cmd);

  const ground = Math.max(world.groundHeight(fm.position.x, fm.position.z), 0);
  state.agl = fm.position.y - ground;
  if (state.agl < 1.3 || targets.collides(fm.position, 6)) {
    crash();
    return;
  }

  const outside = Math.max(Math.abs(fm.position.x), Math.abs(fm.position.z)) > WORLD.bound;
  state.oob = outside ? state.oob + dt : 0;
  if (state.oob > OUT_OF_BOUNDS_TIME) {
    crash();
    return;
  }

  const w = state.warnings;
  w.length = 0;
  if (pullUpWarning()) w.push(['Pull up', 'danger']);
  if (fm.lift < 0.9) w.push(['Stall', 'danger']);
  if (fm.position.y > TUNING.ceiling) w.push(['Altitude ceiling', 'warn']);
  if (state.oob > 0) w.push([`Return to the combat area  ${Math.ceil(OUT_OF_BOUNDS_TIME - state.oob)}`, 'warn']);
}

function placeCamera(dt) {
  const aimMode = controls.config.mouse === 'aim';
  if (state.crashed) {
    camera.lookAt(explosion.group.position);
    return;
  }
  if (aimMode) targetQuat.setFromEuler(euler.set(aim.pitch, aim.yaw, 0));
  else targetQuat.copy(fm.quaternion);
  lookQuat.setFromEuler(lookEuler.set(look.pitch, look.yaw, 0));

  if (state.cameraMode === 'cockpit') {
    camQuat.slerp(targetQuat, aimMode ? 1 - Math.exp(-dt * 12) : 1);
    camera.position.copy(COCKPIT_OFFSET).applyQuaternion(fm.quaternion).add(fm.position);
    camera.quaternion.copy(camQuat).multiply(lookQuat);
  } else {
    camQuat.slerp(targetQuat, 1 - Math.exp(-dt * 5.5));
    camera.quaternion.copy(camQuat).multiply(lookQuat);
    camera.position.copy(CHASE_OFFSET).applyQuaternion(camera.quaternion).add(fm.position);
    camera.quaternion.multiply(tilt);
  }

  // A larger near plane gives far surfaces more depth precision (water over shallow ground flickered).
  camera.near = state.cameraMode === 'cockpit' ? 0.25 : 1.5;
  const base = state.cameraMode === 'cockpit' ? 78 : 70;
  let fov = base + clamp((fm.kmh - TUNING.cruiseKmh) / 330, -0.5, 1) * 7;
  if (look.zoom) fov /= 1.8;
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * (look.zoom ? 12 : 4)));
  camera.updateProjectionMatrix();
}

// Pointer lock decides between flying and the menu.
const menu = createMenu(document.getElementById('menu'), controls, { onFly: requestFly });

function requestFly() {
  sfx.start();
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => menu.setMessage('The browser did not lock the mouse. Click Fly again in a second.'));
  } catch {
    menu.setMessage('The browser did not lock the mouse. Click Fly again in a second.');
  }
}

document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  controls.locked = locked;
  controls.reset();
  state.paused = !locked;
  menu.show(!locked);
  sfx.setEnabled(controls.config.sound);
  if (locked) sfx.start();
  else sfx.pause();
  if (locked && controls.config.mouse === 'aim') syncAimToJet();
});
document.addEventListener('pointerlockerror', () => {
  menu.setMessage('The browser did not lock the mouse. Click Fly again in a second.');
});

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// Lower the render resolution a step when frames are slow, raise it again when there is room.
const perf = { time: 0, frames: 0 };
function adaptResolution(rawDt) {
  perf.time += rawDt;
  perf.frames++;
  if (perf.time < 2) return;
  const ms = (perf.time / perf.frames) * 1000;
  perf.time = perf.frames = 0;
  let next = pixelRatio;
  if (ms > 19) next = Math.max(1, pixelRatio - 0.25);
  else if (ms < 13) next = Math.min(MAX_PIXEL_RATIO, pixelRatio + 0.25);
  if (next !== pixelRatio) {
    pixelRatio = next;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(innerWidth, innerHeight, false);
  }
}

const clock = new THREE.Clock();
function frame() {
  const rawDt = clock.getDelta();
  const dt = Math.min(rawDt, 0.05);
  if (!state.paused && rawDt < 0.25) adaptResolution(rawDt);
  if (!state.paused) step(dt);
  placeCamera(dt);
  world.update(camera, fm.position);
  renderer.render(scene, camera);
  gun.muzzle(fm, gunPoint).addScaledVector(fm.fwd, 500);
  hud.draw({
    dt,
    gunPoint,
    targetList: targets.list,
    gun,
    score,
    hitAge: fx.hitAge,
    killAge: fx.killAge,
    fm,
    camera,
    cmd,
    crashed: state.crashed,
    agl: state.agl,
    warnings: state.warnings,
    cameraMode: state.cameraMode,
    aimDir: controls.config.mouse === 'aim' ? aim.dir : null,
    presetName: controls.presetName(),
    keyNames: { fire: keyLabel(controls.config.keys.fire[0]), camera: keyLabel(controls.config.keys.camera[0]), respawn: keyLabel(controls.config.keys.respawn[0]) },
  });
  controls.endFrame();
  requestAnimationFrame(frame);
}

respawn();
state.agl = fm.position.y - Math.max(world.groundHeight(fm.position.x, fm.position.z), 0);
menu.show(true);
frame();
