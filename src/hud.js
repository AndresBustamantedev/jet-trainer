// 2D HUD drawn on its own canvas over the 3D scene.
import * as THREE from 'three';
import { TUNING } from './flight.js';

const INK = '#e2fbef';
const BEST = '#8effc7';
const WARN = '#ffb547';
const DANGER = '#ff5d4d';
const FONT = "'B612', system-ui, sans-serif"; // Airbus's cockpit display typeface
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);

const _v = new THREE.Vector3();
const _h = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _t = new THREE.Vector3();

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = innerWidth;
    this.h = innerHeight;
    this.canvas.width = Math.round(this.w * dpr);
    this.canvas.height = Math.round(this.h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  project(camera, point) {
    _v.copy(point).project(camera);
    if (_v.z > 1 || _v.z < -1) return null;
    return [(_v.x + 1) * 0.5 * this.w, (1 - _v.y) * 0.5 * this.h];
  }

  dirPoint(camera, dir) {
    return this.project(camera, _t.copy(camera.position).addScaledVector(dir, 2000));
  }

  line(a, b) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  text(str, x, y, { size = 14, weight = 500, align = 'left', color = INK, base = 'middle' } = {}) {
    const ctx = this.ctx;
    ctx.font = `${weight} ${size}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  draw(s) {
    const ctx = this.ctx;
    this.time += s.dt;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    this.targets(s);
    if (!s.crashed) {
      this.ladder(s);
      this.markers(s);
      this.gunHud(s);
    }
    this.score(s);
    if (s.stats) this.statsPanel(s.stats);
    this.speedTape(s);
    this.altTape(s);
    this.headingTape(s);
    this.info(s);
    this.inputs(s);
    this.warnings(s);
    ctx.restore();
  }

  ladder(s) {
    const { ctx } = this;
    const cam = s.camera;
    const fwd = s.fm.fwd;
    _h.set(fwd.x, 0, fwd.z);
    if (_h.lengthSq() < 1e-4) _h.set(-s.fm.up.x, 0, -s.fm.up.z).multiplyScalar(Math.sign(fwd.y));
    if (_h.lengthSq() < 1e-6) return;
    _h.normalize();
    _r.crossVectors(_h, UP).normalize();
    const R = 2000;
    for (let p = -80; p <= 80; p += 10) {
      const pr = p * DEG;
      _d.copy(_h).multiplyScalar(Math.cos(pr)).addScaledVector(UP, Math.sin(pr));
      _c.copy(cam.position).addScaledVector(_d, R);
      const gap = R * Math.tan((p === 0 ? 4 : 3) * DEG);
      const len = R * Math.tan((p === 0 ? 24 : 8) * DEG);
      const pts = [gap, len, -gap, -len].map((o) => this.project(cam, _v.copy(_c).addScaledVector(_r, o)));
      if (pts.some((q) => !q)) continue;
      ctx.globalAlpha = p === 0 ? 0.9 : 0.7;
      ctx.setLineDash(p < 0 ? [7, 5] : []);
      this.line(pts[0], pts[1]);
      this.line(pts[2], pts[3]);
      if (p !== 0) {
        for (const [inner, outer] of [[pts[0], pts[1]], [pts[2], pts[3]]]) {
          const dx = outer[0] - inner[0];
          const dy = outer[1] - inner[1];
          const l = Math.hypot(dx, dy) || 1;
          this.text(String(Math.abs(p)), outer[0] + (dx / l) * 16, outer[1] + (dy / l) * 16, { size: 13, align: 'center' });
        }
      }
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  markers(s) {
    const { ctx } = this;
    const path = this.dirPoint(s.camera, s.fm.velDir);
    if (path) {
      const [x, y] = path;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.moveTo(x - 6, y); ctx.lineTo(x - 17, y);
      ctx.moveTo(x + 6, y); ctx.lineTo(x + 17, y);
      ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 13);
      ctx.stroke();
    }
    if (s.aimDir) {
      const aim = this.dirPoint(s.camera, s.aimDir);
      if (aim) {
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.arc(aim[0], aim[1], 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(aim[0], aim[1], 1.8, 0, Math.PI * 2);
        ctx.fillStyle = INK;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  // Gun reticle where the bullets go, hit markers and heat.
  gunHud(s) {
    const { ctx } = this;
    const g = this.project(s.camera, s.gunPoint);
    if (!g) return;
    const [x, y] = g;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * 13, y + dy * 13);
      ctx.lineTo(x + dx * 19, y + dy * 19);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();

    const kill = s.killAge < 0.35;
    if (s.hitAge < 0.15 || kill) {
      ctx.save();
      ctx.strokeStyle = kill ? DANGER : INK;
      ctx.lineWidth = kill ? 2.6 : 2;
      const r0 = kill ? 14 : 11;
      const r1 = kill ? 26 : 19;
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        this.line([x + dx * r0 * 0.7, y + dy * r0 * 0.7], [x + dx * r1 * 0.7, y + dy * r1 * 0.7]);
      }
      ctx.restore();
    }
    if (s.killAge < 1.6) this.text('Target destroyed', x, y + 46, { size: 16, weight: 700, align: 'center', color: DANGER });

    if (s.gun.heat > 0.01) {
      const bw = 80;
      const over = s.gun.overheated;
      ctx.globalAlpha = 0.5;
      ctx.strokeRect(x - bw / 2, y + 26, bw, 5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = over ? DANGER : s.gun.heat > 0.75 ? WARN : INK;
      ctx.fillRect(x - bw / 2, y + 26, bw * s.gun.heat, 5);
      if (over && s.killAge >= 1.6) this.text('Overheated', x, y + 46, { size: 14, weight: 600, align: 'center', color: DANGER });
    }
  }

  // Spotted target markers, with arrows at the edge for targets off screen.
  targets(s) {
    const { ctx } = this;
    const cam = s.camera;
    for (const t of s.targetList) {
      if (!t.alive) continue;
      const dist = t.pos.distanceTo(s.fm.position);
      const p = this.project(cam, t.pos);
      const onScreen = p && p[0] > 20 && p[0] < this.w - 20 && p[1] > 20 && p[1] < this.h - 20;
      ctx.save();
      ctx.fillStyle = DANGER;
      ctx.strokeStyle = DANGER;
      if (onScreen) {
        const [x, y] = p;
        const yy = y - 16;
        ctx.beginPath();
        if (t.kind === 'air') {
          ctx.moveTo(x, yy - 6); ctx.lineTo(x + 6, yy); ctx.lineTo(x, yy + 6); ctx.lineTo(x - 6, yy);
        } else {
          ctx.rect(x - 4.5, yy - 4.5, 9, 9); // ground targets get a square
        }
        ctx.closePath();
        ctx.fill();
        this.text(`${Math.round(dist)} m`, x, yy - 16, { size: 12, align: 'center', color: DANGER });
      } else {
        _v.copy(t.pos).applyMatrix4(cam.matrixWorldInverse);
        const ang = Math.atan2(-_v.y, _v.x);
        const rx = this.w / 2 - 40;
        const ry = this.h / 2 - 40;
        const x = this.w / 2 + Math.cos(ang) * rx;
        const y = this.h / 2 + Math.sin(ang) * ry;
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
        ctx.closePath();
        ctx.globalAlpha = 0.85;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  statsPanel(st) {
    const { ctx } = this;
    const mb = (v) => (v == null ? 'n/a' : `${Math.round(v)} MB`);
    const lines = [
      [`${Math.round(st.fps)} fps`, `frame ${st.frameMs.toFixed(1)} ms, worst ${st.worstMs.toFixed(1)} ms`],
      ['CPU (page)', `${st.cpuMs.toFixed(1)} ms per frame`],
      ['GPU', st.gpuMs == null ? 'timing not available here' : `${st.gpuMs.toFixed(1)} ms per frame`],
      ['JS memory', st.heapMb == null ? 'n/a in this browser' : `${mb(st.heapMb)} of ${mb(st.heapLimitMb)}`],
      ['Draw calls', `${st.calls ?? 0}, ${((st.triangles ?? 0) / 1e6).toFixed(2)} M triangles`],
      ['GPU objects', `${st.geometries ?? 0} meshes, ${st.textures ?? 0} textures, ${st.programs ?? 0} shaders`],
      ['Resolution', `${(st.pixelRatio ?? 1).toFixed(2)}x`],
    ];
    const x = this.w - 28;
    const top = 74;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(6, 14, 12, 0.6)';
    ctx.fillRect(x - 372, top, 372 + 10, lines.length * 19 + 12);
    lines.forEach(([label, value], i) => {
      const y = top + 16 + i * 19;
      this.text(label, x - 364, y, { size: 13, weight: 700 });
      this.text(value, x, y, { size: 13, align: 'right' });
    });
    ctx.restore();
  }

  score(s) {
    const sc = s.score;
    const acc = sc.shots ? Math.round((100 * sc.hits) / sc.shots) : 0;
    this.text(`Kills ${sc.kills}`, this.w - 28, 30, { size: 17, weight: 700, align: 'right' });
    this.text(`Hits ${sc.hits}     Accuracy ${acc}%`, this.w - 28, 52, { size: 13, align: 'right' });
  }

  valueBox(x, y, w, str, color, align) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(6, 18, 14, 0.55)';
    ctx.fillRect(x, y - 15, w, 30);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y - 15, w, 30);
    ctx.strokeStyle = INK;
    this.text(str, align === 'right' ? x + w - 8 : x + 8, y + 1, { size: 19, weight: 700, align, color });
  }

  speedTape(s) {
    const { ctx } = this;
    const T = TUNING;
    const kmh = s.fm.kmh;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const x = cx - Math.min(this.w * 0.27, 380);
    const H = 320;
    const ppu = 1.4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 70, cy - H / 2, 90, H);
    ctx.clip();
    const yOf = (v) => cy + (kmh - v) * ppu;
    ctx.fillStyle = BEST;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x + 3, yOf(T.sweetHighKmh), 4, yOf(T.sweetLowKmh) - yOf(T.sweetHighKmh));
    ctx.globalAlpha = 1;
    this.line([x, cy - H / 2], [x, cy + H / 2]);
    const span = H / 2 / ppu;
    for (let v = Math.floor((kmh - span) / 10) * 10; v <= kmh + span; v += 10) {
      if (v < 0) continue;
      const major = v % 50 === 0;
      this.line([x - (major ? 12 : 6), yOf(v)], [x, yOf(v)]);
      if (major) this.text(String(v), x - 17, yOf(v), { size: 13, align: 'right' });
    }
    ctx.restore();
    const best = kmh >= T.sweetLowKmh && kmh <= T.sweetHighKmh;
    this.valueBox(x - 88, cy, 70, String(Math.round(kmh)), best ? BEST : INK, 'right');
    this.text('km/h', x - 26, cy + 28, { size: 12, align: 'right' });
    this.text('Best turn', x + 12, yOf(T.sweetLowKmh) - 4, { size: 12, color: BEST, base: 'bottom' });
  }

  altTape(s) {
    const { ctx } = this;
    const alt = s.fm.position.y;
    const cx = this.w / 2;
    const cy = this.h / 2;
    const x = cx + Math.min(this.w * 0.27, 380);
    const H = 320;
    const ppu = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 10, cy - H / 2, 80, H);
    ctx.clip();
    const yOf = (v) => cy + (alt - v) * ppu;
    this.line([x, cy - H / 2], [x, cy + H / 2]);
    const span = H / 2 / ppu;
    for (let v = Math.floor((alt - span) / 10) * 10; v <= alt + span; v += 10) {
      const major = v % 50 === 0;
      this.line([x, yOf(v)], [x + (major ? 12 : 6), yOf(v)]);
      if (major) this.text(String(v), x + 17, yOf(v), { size: 13 });
    }
    ctx.restore();
    const low = s.agl < 60;
    this.valueBox(x + 18, cy, 70, String(Math.round(alt)), alt > TUNING.ceiling ? WARN : INK, 'left');
    this.text('m', x + 26, cy + 28, { size: 12 });
    this.text(`Above ground ${Math.max(0, Math.round(s.agl))}`, x + 18, cy + H / 2 + 14, { size: 13, color: low ? WARN : INK });
  }

  headingTape(s) {
    const fwd = s.fm.fwd;
    let hdg = Math.atan2(fwd.x, -fwd.z) / DEG;
    if (hdg < 0) hdg += 360;
    const cx = this.w / 2;
    const y = 54;
    const ppd = 4;
    const half = 50;
    for (let d = Math.floor((hdg - half) / 5) * 5; d <= hdg + half; d += 5) {
      const x = cx + (d - hdg) * ppd;
      const dd = ((d % 360) + 360) % 360;
      const major = dd % 10 === 0;
      this.line([x, y], [x, y + (major ? 10 : 5)]);
      if (major) {
        const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
        const label = names[dd] ?? String(dd / 10).padStart(2, '0');
        this.text(label, x, y - 10, { size: 13, align: 'center' });
      }
    }
    this.line([cx, y + 14], [cx - 6, y + 22]);
    this.line([cx, y + 14], [cx + 6, y + 22]);
    this.text(String(Math.round(hdg) % 360).padStart(3, '0'), cx, y + 34, { size: 16, weight: 700, align: 'center' });
  }

  info(s) {
    const fm = s.fm;
    const x = 28;
    let y = this.h - 132;
    const thr = fm.boost ? 'Afterburner' : fm.throttle > 0 ? 'Throttle up' : fm.throttle < 0 ? 'Air brake' : 'Cruise';
    this.text(thr, x, y, { size: 22, weight: 700, color: fm.boost ? WARN : INK });
    y += 28;
    this.text(`G ${fm.g.toFixed(1)}`, x, y, { size: 16 });
    y += 22;
    const eff = Math.round(fm.turnEff * 100);
    this.text(`Turn rate ${eff}%`, x, y, { size: 16, color: eff >= 98 ? BEST : INK });
    y += 22;
    this.text(`Camera: ${s.cameraMode === 'chase' ? 'chase' : 'cockpit'}`, x, y, { size: 14 });

    this.text(s.presetName, 28, 30, { size: 17, weight: 700 });
    this.text(`${s.keyNames.fire} fire     Esc settings     ${s.keyNames.camera} camera     ${s.keyNames.respawn} respawn`, 28, 52, { size: 13 });
  }

  inputs(s) {
    const { ctx } = this;
    const cmd = s.cmd;
    const cx = this.w / 2;
    const by = this.h - 74;
    // Stick box: roll left/right, pitch up/down.
    const bx = cx - 70;
    const r = 30;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(bx - r, by - r, r * 2, r * 2);
    this.line([bx - r, by], [bx + r, by]);
    this.line([bx, by - r], [bx, by + r]);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(bx + cmd.roll * r, by - cmd.pitch * r, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
    this.text('Pitch and roll', bx, by + r + 14, { size: 12, align: 'center' });

    // Yaw bar.
    const yx = cx + 30;
    const yw = 46;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(yx - yw, by - 5, yw * 2, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = INK;
    ctx.fillRect(Math.min(yx, yx + cmd.yaw * yw), by - 5, Math.abs(cmd.yaw * yw), 10);
    this.line([yx, by - 9], [yx, by + 9]);
    this.text('Yaw', yx, by + r + 14, { size: 12, align: 'center' });

    // Throttle state.
    const tx = cx + 110;
    ctx.globalAlpha = 0.5;
    ctx.strokeRect(tx - 5, by - r, 10, r * 2);
    ctx.globalAlpha = 1;
    ctx.fillStyle = cmd.boost ? WARN : INK;
    if (cmd.boost) ctx.fillRect(tx - 5, by - r, 10, r);
    else if (cmd.throttle !== 0) ctx.fillRect(tx - 5, cmd.throttle > 0 ? by - r * 0.6 : by, 10, r * 0.6);
    this.line([tx - 9, by], [tx + 9, by]);
    this.text('Throttle', tx, by + r + 14, { size: 12, align: 'center' });
  }

  warnings(s) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    if (s.crashed) {
      this.text('Crashed', cx, cy - 20, { size: 44, weight: 700, align: 'center' });
      this.text(`Press ${s.keyNames.respawn} to fly again`, cx, cy + 22, { size: 18, align: 'center' });
      return;
    }
    let y = cy + 120;
    for (const [msg, level] of s.warnings) {
      const blink = level === 'danger' && Math.sin(this.time * 16) < 0;
      this.ctx.globalAlpha = blink ? 0.35 : 1;
      this.text(msg, cx, y, { size: 26, weight: 700, align: 'center', color: level === 'danger' ? DANGER : WARN });
      y += 32;
    }
    this.ctx.globalAlpha = 1;
  }
}
