// Input: key bindings, mouse handling and the control presets.

// v2: BF6 layout (Shift afterburner, C camera). Older saves are ignored so nobody keeps clashing keys.
const STORAGE_KEY = 'jet-trainer.controls.v2';

export const ACTIONS = [
  ['fire', 'Fire gun'],
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
];

// Same in every preset. Fire, zoom, free look and camera follow EA's BF6 defaults.
// Respawn is Enter because R is reload in BF6.
const SHARED_KEYS = {
  fire: ['Mouse0', null],
  afterburner: ['ShiftLeft', null],
  throttleUp: ['KeyW', null],
  throttleDown: ['KeyS', null],
  zoom: ['Mouse2', null],
  freeLook: ['KeyV', null],
  camera: ['KeyC', null],
  respawn: ['Enter', null],
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

export function keyLabel(code) {
  if (!code) return 'None';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  return code;
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function presetConfig(id, base = {}) {
  const p = PRESETS[id] || PRESETS.bf6;
  const keys = {};
  for (const [action] of ACTIONS) {
    keys[action] = [...(p.keys[action] || SHARED_KEYS[action] || [null, null])];
  }
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
    keys,
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
      return cfg;
    }
  } catch { /* storage blocked or bad data: use defaults */ }
  return presetConfig('bf6');
}

const IS_MAC = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

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
  }

  held(action) {
    const k = this.config.keys[action];
    return !!k && k.some((c) => c && this.down.has(c));
  }

  tapped(action) {
    const k = this.config.keys[action];
    return !!k && k.some((c) => c && this.pressed.has(c));
  }

  endFrame() {
    this.pressed.clear();
  }

  // Returns stick commands in [-1, 1]. Mouse in "stick" mode works like BF:
  // mouse speed sets rotation speed, a still mouse means no rotation.
  sample(dt) {
    const c = this.config;
    const axis = (pos, neg) => (this.held(pos) ? 1 : 0) - (this.held(neg) ? 1 : 0);
    const kr = 1 - Math.exp(-dt * 9);
    const ka = this.keyAxes;
    ka.pitch += (axis('pitchUp', 'pitchDown') - ka.pitch) * kr;
    ka.roll += (axis('rollRight', 'rollLeft') - ka.roll) * kr;
    ka.yaw += (axis('yawRight', 'yawLeft') - ka.yaw) * kr;

    const dx = this.mdx;
    const dy = this.mdy;
    this.mdx = this.mdy = 0;
    // While free look is held the mouse moves the camera, not the jet.
    const freeLook = this.held('freeLook');

    const out = {
      throttle: axis('throttleUp', 'throttleDown'),
      boost: this.held('afterburner'),
      zoom: this.held('zoom'),
      freeLook,
      pitch: ka.pitch,
      roll: ka.roll,
      yaw: ka.yaw,
      keyPitch: ka.pitch,
      keyRoll: ka.roll,
      keyYaw: ka.yaw,
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
