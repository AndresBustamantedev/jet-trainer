// Input: key bindings, mouse handling and the control presets.

// v2: BF6 layout (Shift afterburner, C camera). Older saves are ignored so nobody keeps clashing keys.
const STORAGE_KEY = 'jet-trainer.controls.v2';

export const ACTIONS = [
  ['fire', 'Fire'],
  ['weapon1', 'Machine gun'],
  ['weapon2', 'Bombs (attack jet)'],
  ['nextWeapon', 'Switch weapon'],
  ['afterburner', 'Afterburner'],
  ['throttleUp', 'Throttle up'],
  ['throttleDown', 'Throttle down (air brake)'],
  ['pitchUp', 'Pitch up'],
  ['pitchDown', 'Pitch down'],
  ['rollLeft', 'Roll left'],
  ['rollRight', 'Roll right'],
  ['yawLeft', 'Yaw left'],
  ['yawRight', 'Yaw right'],
  ['zoom', 'Zoom (hold)'],
  ['freeLook', 'Free look (hold)'],
  ['camera', 'Switch camera'],
  ['respawn', 'Respawn'],
  ['stats', 'Show performance stats'],
];

// Same in every preset. Fire, zoom, free look and camera follow EA's BF6 defaults.
// Respawn is Enter because R is reload in BF6.
const SHARED_KEYS = {
  fire: ['Mouse0', null],
  weapon1: ['Digit1', null],
  weapon2: ['Digit2', null],
  nextWeapon: ['KeyF', null],
  afterburner: ['ShiftLeft', null],
  throttleUp: ['KeyW', null],
  throttleDown: ['KeyS', null],
  zoom: ['Mouse2', null],
  freeLook: ['KeyV', null],
  camera: ['KeyC', null],
  respawn: ['Enter', null],
  stats: ['KeyP', null],
};

const COMMUNITY_KEYS = {
  pitchUp: ['Space', null],
  pitchDown: ['ControlLeft', null],
  rollLeft: ['KeyA', null],
  rollRight: ['KeyD', null],
  yawLeft: ['KeyQ', null],
  yawRight: ['KeyE', null],
};

export const PRESETS = {
  bf6: {
    name: 'BF6 default',
    summary: 'Mouse pitches and rolls. A and D yaw. W and S throttle, Shift afterburner. Arrow keys pitch and roll too.',
    mouse: 'stick',
    mouseX: 'roll',
    keys: {
      pitchUp: ['ArrowUp', null],
      pitchDown: ['ArrowDown', null],
      rollLeft: ['ArrowLeft', null],
      rollRight: ['ArrowRight', null],
      yawLeft: ['KeyA', null],
      yawRight: ['KeyD', null],
    },
  },
  mouseYaw: {
    name: 'Mouse yaw',
    summary: 'Mouse yaws and pitches for fine aim. A and D roll. Space pulls up, Ctrl pushes down.',
    mouse: 'stick',
    mouseX: 'yaw',
    keys: COMMUNITY_KEYS,
  },
  lookTurn: {
    name: 'Look and turn',
    summary: "BF6's simplified jet controls: point the mouse where you want to go and the jet flies there. Keys override it.",
    mouse: 'aim',
    mouseX: 'yaw',
    keys: COMMUNITY_KEYS,
  },
};

const KEY_NAMES = {
  Space: 'Space',
  ShiftLeft: 'Left Shift',
  ShiftRight: 'Right Shift',
  ControlLeft: 'Left Ctrl',
  ControlRight: 'Right Ctrl',
  AltLeft: 'Left Alt',
  AltRight: 'Right Alt',
  MetaLeft: 'Left Cmd',
  MetaRight: 'Right Cmd',
  ArrowUp: 'Up arrow',
  ArrowDown: 'Down arrow',
  ArrowLeft: 'Left arrow',
  ArrowRight: 'Right arrow',
  CapsLock: 'Caps Lock',
  Tab: 'Tab',
  Enter: 'Enter',
  Mouse0: 'Left mouse',
  Mouse1: 'Middle mouse',
  Mouse2: 'Right mouse',
  Mouse3: 'Mouse 4',
  Mouse4: 'Mouse 5',
};

// Gamepad: Chrome and Edge report the DualSense (and Xbox pads) in the W3C "standard" layout.
// Codes are 'Pad<n>' for buttons and 'Axis<n>+' / 'Axis<n>-' for a stick direction.
// Defaults follow EA's BF6 controller layout for jets.
export const PAD_DEFAULTS = {
  fire: 'Pad7', // R2
  nextWeapon: 'Pad3', // Triangle switches weapon (attack jet)
  weapon1: 'Pad14', // D-pad left: machine gun
  weapon2: 'Pad15', // D-pad right: bombs
  afterburner: 'Pad10', // L3
  throttleUp: 'Axis1-', // left stick up
  throttleDown: 'Axis1+', // left stick down
  pitchUp: 'Axis3+', // right stick down pulls the nose up, like BF6
  pitchDown: 'Axis3-',
  rollLeft: 'Axis2-',
  rollRight: 'Axis2+',
  yawLeft: 'Axis0-',
  yawRight: 'Axis0+',
  zoom: 'Pad6', // L2
  freeLook: 'Pad13', // D-pad down
  camera: 'Pad11', // R3
  respawn: 'Pad0', // Cross
  stats: 'Pad17', // touchpad click
};
// Options (Pad9) always opens and closes the menu, like Esc.
export const PAD_MENU = 'Pad9';

const PAD_BUTTONS = {
  ps: ['Cross', 'Circle', 'Square', 'Triangle', 'L1', 'R1', 'L2', 'R2', 'Create', 'Options', 'L3', 'R3', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'PS', 'Touchpad'],
  xbox: ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'View', 'Menu', 'LS', 'RS', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right', 'Xbox', 'Share'],
};
const PAD_AXES = ['L stick \u2190', 'L stick \u2192', 'L stick \u2191', 'L stick \u2193', 'R stick \u2190', 'R stick \u2192', 'R stick \u2191', 'R stick \u2193'];

export function padLabel(code, style = 'ps') {
  if (!code) return 'None';
  let m = /^Pad(\d+)$/.exec(code);
  if (m) return PAD_BUTTONS[style][Number(m[1])] || `Button ${m[1]}`;
  m = /^Axis(\d+)([+-])$/.exec(code);
  if (m) {
    const i = Number(m[1]);
    const label = PAD_AXES[i * 2 + (m[2] === '+' ? 1 : 0)];
    return label || `Axis ${i}${m[2]}`;
  }
  return code;
}

export function keyLabel(code) {
  if (!code) return 'None';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Space fires too, as a second fire key, wherever no other action uses it
// (in Mouse yaw and Look and turn it is pitch up).
function addSpaceFire(keys) {
  const used = Object.values(keys).some((k) => k.includes('Space'));
  if (!used && !keys.fire[1]) keys.fire[1] = 'Space';
}

function padBindings(saved) {
  const pad = {};
  for (const [action] of ACTIONS) {
    const v = saved && typeof saved === 'object' ? saved[action] : undefined;
    pad[action] = v === undefined ? PAD_DEFAULTS[action] || null : (typeof v === 'string' ? v : null);
  }
  return pad;
}

function presetConfig(id, base = {}) {
  const p = PRESETS[id] || PRESETS.bf6;
  const keys = {};
  for (const [action] of ACTIONS) {
    keys[action] = [...(p.keys[action] || SHARED_KEYS[action] || [null, null])];
  }
  addSpaceFire(keys);
  return {
    preset: PRESETS[id] ? id : 'bf6',
    custom: false,
    mouse: p.mouse,
    mouseX: p.mouseX,
    invertY: base.invertY ?? false,
    sensPitch: base.sensPitch ?? 1,
    sensX: base.sensX ?? 1,
    sensAim: base.sensAim ?? 1,
    sound: base.sound ?? true,
    showStats: base.showStats ?? false,
    jetType: base.jetType === 'attack' ? 'attack' : 'fighter',
    spaceFire: true, // saved settings from before Space could fire get it once on load
    quality: base.quality === 'performance' || base.quality === 'high' ? base.quality : DEFAULT_QUALITY,
    qualityChosen: base.qualityChosen ?? false, // true once the player picks a mode themselves
    keys,
    pad: padBindings(base.pad),
    padSensPitch: base.padSensPitch ?? 1,
    padSensRoll: base.padSensRoll ?? 1,
    padSensYaw: base.padSensYaw ?? 1,
    padDeadzone: base.padDeadzone ?? 0.1,
    padInvertY: base.padInvertY ?? false,
    padToggle: base.padToggle ?? true,
    rumble: base.rumble ?? true,
  };
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && PRESETS[saved.preset] && saved.keys) {
      const cfg = presetConfig(saved.preset, saved);
      cfg.custom = !!saved.custom;
      if (saved.mouseX === 'roll' || saved.mouseX === 'yaw') cfg.mouseX = saved.mouseX;
      for (const [action] of ACTIONS) {
        if (Array.isArray(saved.keys[action])) cfg.keys[action] = [saved.keys[action][0] ?? null, saved.keys[action][1] ?? null];
      }
      if (!saved.spaceFire) addSpaceFire(cfg.keys);
      return cfg;
    }
  } catch { /* storage blocked or bad data: use defaults */ }
  return presetConfig('bf6');
}

// High graphics unless the machine looks small (few cores or a phone).
const DEFAULT_QUALITY = typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency || 8) <= 4 || /Mobi|Android/i.test(navigator.userAgent))
  ? 'performance'
  : 'high';

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

// Rescale past the deadzone so the stick still reaches 1.
function deadzone(v, dz) {
  const a = Math.abs(v);
  if (a <= dz) return 0;
  return Math.sign(v) * Math.min(1, (a - dz) / (1 - dz));
}

// Softer near the centre for fine aim, full rate at full deflection.
const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.6;

const BLOCK_DEFAULT = new Set(['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'AltLeft', 'AltRight']);

export class Controls {
  constructor() {
    this.config = loadConfig();
    this.down = new Set();
    this.pressed = new Set();
    this.locked = false;
    this.capture = null; // set by the menu while rebinding a key
    this.mdx = 0;
    this.mdy = 0;
    this.keyAxes = { pitch: 0, roll: 0, yaw: 0 };
    this.mouseAxes = { x: 0, y: 0 };
    // Gamepad state, refreshed by poll() once per frame.
    this.gamepad = null;
    this.padStyle = 'ps';
    this.padVal = new Map();
    this.padDown = new Set();
    this.padPressed = new Set();
    this.padCapture = null; // set by the menu while rebinding a controller input
    this.padLatch = { afterburner: false, freeLook: false };
    this.menuButton = false;
    this.lastDevice = 'kbm';
    this.rumbleState = { s: 0, w: 0, ms: 0, sentAt: 0, until: 0, level: 0 };

    addEventListener('keydown', (e) => this.onKey(e, true));
    addEventListener('keyup', (e) => this.onKey(e, false));
    addEventListener('blur', () => this.reset());
    const onButton = (e, isDown) => {
      let code = `Mouse${e.button}`;
      // macOS turns Ctrl+click into a right click. Ctrl is pitch down in some presets,
      // so keep it a left click while flying.
      if (IS_MAC && this.locked && e.button === 2 && (isDown ? e.ctrlKey : this.ctrlClick)) {
        code = 'Mouse0';
        this.ctrlClick = isDown;
      }
      if (this.capture) {
        if (isDown) {
          e.preventDefault();
          this.capture(code);
        }
        return;
      }
      if (!this.locked) return;
      if (isDown) {
        if (!this.down.has(code)) this.pressed.add(code);
        this.down.add(code);
      } else {
        this.down.delete(code);
      }
    };
    // Capture phase, so a rebinding click is caught before the menu sees it.
    document.addEventListener('mousedown', (e) => onButton(e, true), true);
    document.addEventListener('mouseup', (e) => onButton(e, false), true);
    document.addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) this.lastDevice = 'kbm';
      this.mdx += clamp(e.movementX, -300, 300);
      this.mdy += clamp(e.movementY, -300, 300);
    });
  }

  onKey(e, isDown) {
    if (this.capture && isDown) {
      e.preventDefault();
      this.capture(e.code);
      return;
    }
    if (this.locked && BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (isDown) {
      this.lastDevice = 'kbm';
      if (!e.repeat && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    } else {
      this.down.delete(e.code);
    }
  }

  reset() {
    this.down.clear();
    this.pressed.clear();
    this.mdx = this.mdy = 0;
    this.keyAxes.pitch = this.keyAxes.roll = this.keyAxes.yaw = 0;
    this.mouseAxes.x = this.mouseAxes.y = 0;
    this.padPressed.clear();
    this.padLatch.afterburner = this.padLatch.freeLook = false;
    this.menuButton = false;
    this.stopRumble();
  }

  keyHeld(action) {
    const k = this.config.keys[action];
    return !!k && k.some((c) => c && this.down.has(c));
  }

  padHeld(action) {
    if (this.config.padToggle && action in this.padLatch) return this.padLatch[action];
    const code = this.config.pad[action];
    return !!code && this.padDown.has(code);
  }

  held(action) {
    return this.keyHeld(action) || this.padHeld(action);
  }

  tapped(action) {
    const k = this.config.keys[action];
    const code = this.config.pad[action];
    return (!!k && k.some((c) => c && this.pressed.has(c))) || (!!code && this.padPressed.has(code));
  }

  endFrame() {
    this.pressed.clear();
    this.padPressed.clear();
  }

  // Analog 0..1 for an action bound to a stick direction or trigger.
  padValue(action) {
    const code = this.config.pad[action];
    return code ? this.padVal.get(code) || 0 : 0;
  }

  // Read the gamepad. Call once per frame, flying or not (the menu uses it too).
  poll(now = performance.now()) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) {
      if (!p || !p.connected) continue;
      // Prefer a DualSense (Sony vendor id 054c) when several pads are connected.
      if (!gp || /dualsense|054c/i.test(p.id)) gp = p;
    }
    this.gamepad = gp;
    this.padVal.clear();
    const nowDown = new Set();
    if (gp) {
      this.padStyle = /xbox|xinput|045e/i.test(gp.id) ? 'xbox' : 'ps';
      const dz = this.config.padDeadzone;
      gp.buttons.forEach((b, i) => {
        const v = typeof b === 'object' ? b.value : b;
        const code = `Pad${i}`;
        this.padVal.set(code, v);
        if (v > 0.5 || (b.pressed && v === 0)) nowDown.add(code);
      });
      gp.axes.forEach((a, i) => {
        const v = deadzone(a, dz);
        this.padVal.set(`Axis${i}+`, Math.max(0, v));
        this.padVal.set(`Axis${i}-`, Math.max(0, -v));
        if (v > 0.5) nowDown.add(`Axis${i}+`);
        if (v < -0.5) nowDown.add(`Axis${i}-`);
        if (Math.abs(v) > 0.3 && i < 4) this.lastDevice = 'pad';
      });
    }
    for (const code of nowDown) {
      if (this.padDown.has(code)) continue;
      this.lastDevice = 'pad';
      if (this.padCapture) {
        // Sticks need a firm push to bind, so a resting stick does not grab the slot.
        if (code.startsWith('Axis') && (this.padVal.get(code) || 0) < 0.75) continue;
        this.padCapture(code);
        continue;
      }
      if (code === PAD_MENU) this.menuButton = true;
      else this.padPressed.add(code);
    }
    this.padDown = nowDown;

    // BF6 style: afterburner and free look latch on a tap. Pulling back on the throttle cancels the burner.
    const pad = this.config.pad;
    for (const action of Object.keys(this.padLatch)) {
      if (pad[action] && this.padPressed.has(pad[action])) this.padLatch[action] = !this.padLatch[action];
    }
    if (pad.throttleDown && this.padDown.has(pad.throttleDown)) this.padLatch.afterburner = false;

    this.flushRumble(now);
  }

  // Queue a rumble for this frame. The strongest request wins, sent at most every 50 ms.
  buzz(strong, weak, ms) {
    if (!this.config.rumble) return;
    const r = this.rumbleState;
    r.s = Math.max(r.s, strong);
    r.w = Math.max(r.w, weak);
    r.ms = Math.max(r.ms, ms);
  }

  flushRumble(now) {
    const r = this.rumbleState;
    const act = this.gamepad && this.gamepad.vibrationActuator;
    if (!r.s && !r.w) return;
    const level = Math.max(r.s, r.w);
    // A new effect replaces the running one, so a weak pulse must not cut a strong one short.
    const blocked = now < r.until && level < r.level;
    if (act && !blocked && now - r.sentAt >= 50) {
      const duration = Math.max(r.ms, 70);
      try {
        const p = act.playEffect('dual-rumble', { startDelay: 0, duration, strongMagnitude: Math.min(1, r.s), weakMagnitude: Math.min(1, r.w) });
        if (p && p.catch) p.catch(() => {});
      } catch { /* no rumble support */ }
      r.sentAt = now;
      r.until = now + duration;
      r.level = level;
    }
    r.s = r.w = r.ms = 0;
  }

  stopRumble() {
    const act = this.gamepad && this.gamepad.vibrationActuator;
    this.rumbleState.until = 0;
    try {
      if (act && act.reset) {
        const p = act.reset();
        if (p && p.catch) p.catch(() => {});
      }
    } catch { /* ignore */ }
  }

  // Label for the first binding of an action, on whichever device was used last.
  actionLabel(action) {
    if (this.lastDevice === 'pad' && this.gamepad && this.config.pad[action]) return padLabel(this.config.pad[action], this.padStyle);
    return keyLabel(this.config.keys[action][0]);
  }

  menuLabel() {
    if (this.lastDevice === 'pad' && this.gamepad) return this.padStyle === 'xbox' ? 'Menu' : 'Options';
    return 'Esc';
  }

  // Returns stick commands in [-1, 1]. Mouse in "stick" mode works like BF:
  // mouse speed sets rotation speed, a still mouse means no rotation.
  sample(dt) {
    const c = this.config;
    const axis = (pos, neg) => (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
    const keyAxis = (pos, neg) => (this.keyHeld(pos) ? 1 : 0) - (this.keyHeld(neg) ? 1 : 0);
    const kr = 1 - Math.exp(-dt * 9);
    const ka = this.keyAxes;
    ka.pitch += (keyAxis('pitchUp', 'pitchDown') - ka.pitch) * kr;
    ka.roll += (keyAxis('rollRight', 'rollLeft') - ka.roll) * kr;
    ka.yaw += (keyAxis('yawRight', 'yawLeft') - ka.yaw) * kr;

    const dx = this.mdx;
    const dy = this.mdy;
    this.mdx = this.mdy = 0;
    // While free look is held the mouse moves the camera, not the jet.
    const freeLook = this.held('freeLook');

    // Gamepad sticks: analog, already past the deadzone.
    const pv = (a) => this.padValue(a);
    let padPitch = curve(pv('pitchUp') - pv('pitchDown')) * c.padSensPitch * (c.padInvertY ? -1 : 1);
    let padRoll = curve(pv('rollRight') - pv('rollLeft')) * c.padSensRoll;
    const padYaw = curve(pv('yawRight') - pv('yawLeft')) * c.padSensYaw;
    // In free look the pitch and roll stick moves the camera instead of the jet.
    let padLookX = 0;
    let padLookY = 0;
    if (freeLook) {
      padLookX = padRoll;
      padLookY = padPitch;
      padPitch = padRoll = 0;
    }

    const out = {
      throttle: axis('throttleUp', 'throttleDown'),
      boost: this.held('afterburner'),
      zoom: this.held('zoom'),
      freeLook,
      pitch: clamp(ka.pitch + padPitch, -1, 1),
      roll: clamp(ka.roll + padRoll, -1, 1),
      yaw: clamp(ka.yaw + padYaw, -1, 1),
      keyPitch: ka.pitch,
      keyRoll: ka.roll,
      keyYaw: Math.abs(ka.yaw) > 0.05 ? ka.yaw : clamp(padYaw, -1, 1),
      padPitch,
      padRoll,
      padYaw,
      padLookX,
      padLookY,
      mouseDX: dx,
      mouseDY: dy,
    };

    if (c.mouse === 'stick' && !freeLook) {
      const step = Math.max(dt, 1 / 500);
      const tx = clamp((dx / step) * 0.0011 * c.sensX, -1.5, 1.5);
      const ty = clamp((-dy / step) * 0.0011 * c.sensPitch * (c.invertY ? -1 : 1), -1.5, 1.5);
      const mr = 1 - Math.exp(-dt * 30);
      this.mouseAxes.x += (tx - this.mouseAxes.x) * mr;
      this.mouseAxes.y += (ty - this.mouseAxes.y) * mr;
      out.pitch = clamp(out.pitch + this.mouseAxes.y, -1, 1);
      if (c.mouseX === 'roll') out.roll = clamp(out.roll + this.mouseAxes.x, -1, 1);
      else out.yaw = clamp(out.yaw + this.mouseAxes.x, -1, 1);
    } else {
      this.mouseAxes.x = this.mouseAxes.y = 0;
    }
    return out;
  }

  applyPreset(id) {
    this.config = presetConfig(id, this.config);
    this.save();
  }

  bind(action, slot, code) {
    if (code) {
      // One key does one thing: remove it from every other slot first.
      for (const [a] of ACTIONS) {
        this.config.keys[a] = this.config.keys[a].map((c) => (c === code ? null : c));
      }
    }
    this.config.keys[action][slot] = code;
    this.config.custom = true;
    this.save();
  }

  bindPad(action, code) {
    if (code) {
      for (const [a] of ACTIONS) if (this.config.pad[a] === code) this.config.pad[a] = null;
    }
    this.config.pad[action] = code;
    this.save();
  }

  resetPad() {
    this.config.pad = padBindings();
    this.save();
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.config));
    } catch { /* storage blocked: settings last for this visit only */ }
  }

  presetName() {
    const p = PRESETS[this.config.preset];
    return p.name + (this.config.custom ? ' (edited)' : '');
  }
}
