// 2D HUD drawn on its own canvas over the 3D scene.
import * as THREE from 'three';
import { TUNING } from './flight.js';
import { BOMBS } from './bombs.js';

const INK = '#e2fbef';
const BEST = '#8effc7';
const GLASS_INK = '#c9f26a'; // HUD symbology on the cockpit glass
const GLASS_BEST = '#f4ffb8';
const WARN = '#ffb547';
const BOMB_AIM = '#f5d33c'; // the game's bomb aim aid, not jet symbology
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
    this.ink = INK;
    this.best = BEST;
    this.k = 1; // text scale
    this.alpha = 1; // opacity of the flight symbols
    this.L = null;
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

  text(str, x, y, { size = 14, weight = 500, align = 'left', color = this.ink, base = 'middle' } = {}) {
    const ctx = this.ctx;
    ctx.font = `${weight} ${Math.round(size * this.k)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // Where the flight symbology goes: the whole screen in chase view, or inside the projected
  // HUD glass in cockpit view (returns the glass outline on screen for clipping).
  layout(s) {
    let poly = null;
    if (s.cameraMode === 'cockpit' && s.glass && !s.crashed) {
      poly = s.glass.map((p) => this.project(s.camera, p));
      if (poly.some((q) => !q)) poly = null;
    }
    if (!poly) {
      this.L = { cx: this.w / 2, cy: this.h / 2, tapeOff: Math.min(this.w * 0.27, 380), tapeH: 320, headY: 54, headHalf: 50, headPpd: 4, glass: false, k: 1 };
      this.ink = INK;
      this.best = BEST;
      return null;
    }
    const xs = poly.map((q) => q[0]);
    const ys = poly.map((q) => q[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const gw = maxX - minX;
    const gh = maxY - minY;
    this.L = {
      cx: (minX + maxX) / 2,
      cy: minY + gh * 0.5,
      tapeOff: gw * 0.3,
      tapeH: Math.min(320, gh * 0.55),
      // Heading strip near the bottom of the glass, like a real HUD.
      headY: maxY - gh * 0.24,
      headHalf: 30,
      headPpd: (gw * 0.2) / 30,
      glass: true,
      k: Math.min(0.85, Math.max(0.68, gh / 420)),
      minX, maxX, minY, maxY,
    };
    this.ink = GLASS_INK;
    this.best = GLASS_BEST;
    return poly;
  }

  draw(s) {
    const ctx = this.ctx;
    this.time += s.dt;
    ctx.clearRect(0, 0, this.w, this.h);
    const poly = this.layout(s);
    ctx.save();
    ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.strokeStyle = this.ink;
    this.targets(s);
    this.bombCircle(s);

    ctx.save();
    if (poly) {
      // On the glass the symbols glow a little and stop at the glass edge.
      ctx.beginPath();
      poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.clip();
      // Thinner, smaller and see-through on the glass so the view stays clear.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
      ctx.shadowBlur = 2;
      ctx.lineWidth = 1.1;
      this.k = this.L.k;
      this.alpha = 0.72;
      ctx.globalAlpha = this.alpha;
    }
    // Looking away from the glass in cockpit view (free look): no flight symbols at all.
    const offGlass = s.cameraMode === 'cockpit' && s.glass && !s.crashed && !poly;
    if (!s.crashed && !offGlass) {
      this.ladder(s);
      this.markers(s);
      this.gunHud(s);
    }
    if (!offGlass) {
      this.speedTape(s);
      this.altTape(s);
      this.headingTape(s);
    }
    if (poly) this.glassStatus(s);
    this.k = 1;
    this.alpha = 1;
    ctx.restore();

    ctx.strokeStyle = this.ink;
    this.score(s);
    if (s.stats) this.statsPanel(s.stats);
    if (s.toast) this.text(s.toast, this.w / 2, 104, { size: 15, weight: 700, align: 'center', color: WARN });
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
      ctx.globalAlpha = (p === 0 ? 0.9 : 0.7) * this.alpha;
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
    ctx.globalAlpha = this.alpha;
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
        ctx.globalAlpha = (0.85) * this.alpha;
        ctx.beginPath();
        ctx.arc(aim[0], aim[1], 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(aim[0], aim[1], 1.8, 0, Math.PI * 2);
        ctx.fillStyle = this.ink;
        ctx.fill();
        ctx.globalAlpha = this.alpha;
      }
    }
  }

  // Gun reticle where the bullets go, hit markers and heat.
  // Bomb aim: a thin yellow ring lying on the ground where a bomb dropped now would land,
  // seen in perspective (round from above, a flat oval from a shallow dive) and draped over
  // the terrain. It is the game helping you, not jet symbology, so it is never clipped to the
  // HUD glass. It is at least the blast size, and grows with distance so it never gets tiny.
  bombCircle(s) {
    const b = s.bombs;
    if (!b || !b.selected || !b.impact || s.crashed) return;
    const cam = s.camera;
    const dist = _v.copy(b.impact).sub(cam.position).length();
    const pxPerM = (this.h / 2) / Math.tan((cam.fov * DEG) / 2) / Math.max(dist, 1);
    const R = Math.max(BOMBS.radius, (this.h * 0.04) / pxPerM);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = BOMB_AIM;
    ctx.lineWidth = 1.8;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    let open = false;
    const n = 64;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = b.impact.x + Math.cos(a) * R;
      const z = b.impact.z + Math.sin(a) * R;
      const y = Math.max(s.groundHeight(x, z), 0) + 0.5;
      const p = this.project(cam, _c.set(x, y, z));
      if (!p) {
        open = false; // part of the ring is behind the camera: break the line there
        continue;
      }
      if (open) ctx.lineTo(p[0], p[1]);
      else ctx.moveTo(p[0], p[1]);
      open = true;
    }
    ctx.stroke();
    ctx.restore();
  }

  gunHud(s) {
    const { ctx } = this;
    const g = this.project(s.camera, s.gunPoint);
    if (!g) return;
    const [x, y] = g;
    if (s.bombs && s.bombs.selected) {
      // No gun reticle with bombs selected; the bomb circle is drawn over the world instead.
      if (s.killAge < 1.6) this.text('Target destroyed', x, y + 46, { size: 16, weight: 700, align: 'center', color: DANGER });
      return;
    }
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      ctx.moveTo(x + dx * 13, y + dy * 13);
      ctx.lineTo(x + dx * 19, y + dy * 19);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fillStyle = this.ink;
    ctx.fill();

    const kill = s.killAge < 0.35;
    if (s.hitAge < 0.15 || kill) {
      ctx.save();
      ctx.strokeStyle = kill ? DANGER : this.ink;
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
      ctx.globalAlpha = (0.5) * this.alpha;
      ctx.strokeRect(x - bw / 2, y + 26, bw, 5);
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle = over ? DANGER : s.gun.heat > 0.75 ? WARN : this.ink;
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
      const soldier = t.kind === 'soldier';
      // Only nearby soldiers and drones get markers, so the screen stays readable.
      if ((soldier || t.kind === 'air') && dist > 2000) continue;
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
          const r = soldier ? 2.5 : 4.5; // ground targets get a square, soldiers a small one
          ctx.rect(x - r, yy - r, r * 2, r * 2);
        }
        ctx.closePath();
        ctx.fill();
        if (!soldier) this.text(`${Math.round(dist)} m`, x, yy - 16, { size: 12, align: 'center', color: DANGER });
      } else if (!soldier) {
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
        ctx.globalAlpha = (0.85) * this.alpha;
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
    const k = this.k;
    w *= k;
    ctx.fillStyle = this.L.glass ? 'rgba(6, 18, 14, 0.3)' : 'rgba(6, 18, 14, 0.55)';
    ctx.fillRect(x, y - 15 * k, w, 30 * k);
    ctx.strokeStyle = color;
    ctx.strokeRect(x, y - 15 * k, w, 30 * k);
    ctx.strokeStyle = this.ink;
    this.text(str, align === 'right' ? x + w - 8 * k : x + 8 * k, y + 1, { size: 19, weight: 700, align, color });
  }

  speedTape(s) {
    const { ctx } = this;
    const T = TUNING;
    const kmh = s.fm.kmh;
    const { cx, cy, tapeOff, tapeH: H } = this.L;
    const x = cx - tapeOff;
    const ppu = 1.4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 70, cy - H / 2, 90, H);
    ctx.clip();
    const yOf = (v) => cy + (kmh - v) * ppu;
    ctx.fillStyle = this.best;
    ctx.globalAlpha = (0.85) * this.alpha;
    ctx.fillRect(x + 3, yOf(T.sweetHighKmh), 4, yOf(T.sweetLowKmh) - yOf(T.sweetHighKmh));
    ctx.globalAlpha = this.alpha;
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
    this.valueBox(x - 88 * this.k, cy, 70, String(Math.round(kmh)), best ? this.best : this.ink, 'right');
    this.text('km/h', x - 26 * this.k, cy + 28 * this.k, { size: 12, align: 'right' });
    if (!this.L.glass) this.text('Best turn', x + 12, yOf(T.sweetLowKmh) - 4, { size: 12, color: this.best, base: 'bottom' });
  }

  altTape(s) {
    const { ctx } = this;
    const alt = s.fm.position.y;
    const { cx, cy, tapeOff, tapeH: H } = this.L;
    const x = cx + tapeOff;
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
    this.valueBox(x + 18 * this.k, cy, 70, String(Math.round(alt)), alt > TUNING.ceiling ? WARN : this.ink, 'left');
    this.text('m', x + 26 * this.k, cy + 28 * this.k, { size: 12 });
    if (!this.L.glass) this.text(`Above ground ${Math.max(0, Math.round(s.agl))}`, x + 18, cy + H / 2 + 14, { size: 13, color: low ? WARN : this.ink });
  }

  headingTape(s) {
    const fwd = s.fm.fwd;
    let hdg = Math.atan2(fwd.x, -fwd.z) / DEG;
    if (hdg < 0) hdg += 360;
    const cx = this.L.cx;
    const y = this.L.headY;
    const ppd = this.L.headPpd;
    const half = this.L.headHalf;
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

  // Short status lines on the HUD glass, like a real HUD: Mach, G and throttle on the left,
  // gun state and height above ground on the right.
  glassStatus(s) {
    const { cx, minY, maxY, tapeOff } = this.L;
    const fm = s.fm;
    const y = minY + (maxY - minY) * 0.64;
    const thr = fm.boost ? 'AB' : fm.throttle > 0 ? 'MIL' : fm.throttle < 0 ? 'BRK' : 'CRZ';
    const wpn = s.bombs && s.bombs.selected ? `BOMB ${s.bombs.ammo}` : 'GUN';
    const left = [`M ${(fm.kmh / 1225).toFixed(2)}`, `G ${fm.g.toFixed(1)}`, thr, wpn];
    const gun = s.gun.overheated ? 'GUN OVHT' : s.gun.heat > 0.75 ? 'GUN HOT' : '';
    const right = [`AL ${Math.max(0, Math.round(s.agl))}`, `TURN ${Math.round(fm.turnEff * 100)}`, gun].filter(Boolean);
    const font = { size: 12, weight: 700 };
    left.forEach((t, i) => this.text(t, cx - tapeOff + 14, y + i * 15, { ...font, color: i === 2 && fm.boost ? WARN : this.ink }));
    right.forEach((t, i) => this.text(t, cx + tapeOff - 8, y + i * 15, { ...font, align: 'right', color: t.startsWith('GUN ') ? WARN : this.ink }));
  }

  info(s) {
    const fm = s.fm;
    const x = 28;
    let y = this.h - 132;
    if (this.L.glass) {
      // Flight numbers are on the glass in cockpit view; keep only the top-left lines.
      this.text(s.presetName, 28, 30, { size: 17, weight: 700, color: INK });
      this.text(`${s.keyNames.fire} fire     Esc settings     ${s.keyNames.camera} camera     ${s.keyNames.respawn} respawn`, 28, 52, { size: 13, color: INK });
      return;
    }
    const thr = fm.boost ? 'Afterburner' : fm.throttle > 0 ? 'Throttle up' : fm.throttle < 0 ? 'Air brake' : 'Cruise';
    this.text(thr, x, y, { size: 22, weight: 700, color: fm.boost ? WARN : this.ink });
    y += 28;
    this.text(`G ${fm.g.toFixed(1)}`, x, y, { size: 16 });
    y += 22;
    const eff = Math.round(fm.turnEff * 100);
    this.text(`Turn rate ${eff}%`, x, y, { size: 16, color: eff >= 98 ? this.best : this.ink });
    y += 22;
    this.text(`Camera: ${s.cameraMode === 'chase' ? 'chase' : 'cockpit'}`, x, y, { size: 14 });
    const wpn = s.bombs && s.bombs.selected ? `Bombs ${s.bombs.ammo}/${s.bombs.capacity}` : 'Machine gun';
    this.text(`Weapon: ${wpn}${s.bombs ? '   (1 gun, 2 bombs)' : ''}`, x, y - 96, { size: 14, weight: 700 });

    this.text(s.presetName, 28, 30, { size: 17, weight: 700 });
    this.text(`${s.keyNames.fire} fire     ${s.keyNames.menu} settings     ${s.keyNames.camera} camera     ${s.keyNames.respawn} respawn`, 28, 52, { size: 13 });
  }

  inputs(s) {
    const { ctx } = this;
    const cmd = s.cmd;
    const cx = this.w / 2;
    const by = this.h - 74;
    // Stick box: roll left/right, pitch up/down.
    const bx = cx - 70;
    const r = 30;
    ctx.globalAlpha = (0.5) * this.alpha;
    ctx.strokeRect(bx - r, by - r, r * 2, r * 2);
    this.line([bx - r, by], [bx + r, by]);
    this.line([bx, by - r], [bx, by + r]);
    ctx.globalAlpha = this.alpha;
    ctx.beginPath();
    ctx.arc(bx + cmd.roll * r, by - cmd.pitch * r, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = this.ink;
    ctx.fill();
    this.text('Pitch and roll', bx, by + r + 14, { size: 12, align: 'center' });

    // Yaw bar.
    const yx = cx + 30;
    const yw = 46;
    ctx.globalAlpha = (0.5) * this.alpha;
    ctx.strokeRect(yx - yw, by - 5, yw * 2, 10);
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.ink;
    ctx.fillRect(Math.min(yx, yx + cmd.yaw * yw), by - 5, Math.abs(cmd.yaw * yw), 10);
    this.line([yx, by - 9], [yx, by + 9]);
    this.text('Yaw', yx, by + r + 14, { size: 12, align: 'center' });

    // Throttle state.
    const tx = cx + 110;
    ctx.globalAlpha = (0.5) * this.alpha;
    ctx.strokeRect(tx - 5, by - r, 10, r * 2);
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = cmd.boost ? WARN : this.ink;
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
      this.ctx.globalAlpha = (blink ? 0.35 : 1) * this.alpha;
      this.text(msg, cx, y, { size: 26, weight: 700, align: 'center', color: level === 'danger' ? DANGER : WARN });
      y += 32;
    }
    this.ctx.globalAlpha = this.alpha;
  }
}
