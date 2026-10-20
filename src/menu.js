// Pause menu, drawn as a preflight card on a pilot's kneeboard.
import { ACTIONS, PRESETS, keyLabel, padLabel } from './controls.js';
import { JET_TYPES } from './flight.js';

const IS_MAC = /Mac/.test(navigator.platform);
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pencil tick for checked boxes.
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.8c2.1 1.5 3.7 3.3 5.1 5.5 2.7-5.3 6.5-10.2 11.9-14.6" /></svg>';

const NOTES = { mouseYaw: 'Recommended' };

const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
const canFullscreen = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function setFullscreen(on) {
  const el = document.documentElement;
  if (on) (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el)?.catch?.(() => {});
  else (document.exitFullscreen || document.webkitExitFullscreen)?.call(document)?.catch?.(() => {});
}

export function createMenu(root, controls, { onFly, onQuality, onJetType }) {
  let waiting = null; // { action, slot } while rebinding
  let message = '';
  let leaveTimer = 0;
  let visible = false;

  // Keep the checkbox right when full screen ends another way (Esc, the browser's own button).
  const syncFullscreen = () => {
    const box = root.querySelector('#fullscreen');
    if (box) box.checked = isFullscreen();
  };
  document.addEventListener('fullscreenchange', syncFullscreen);
  document.addEventListener('webkitfullscreenchange', syncFullscreen);

  root.addEventListener('click', (e) => {
    if (e.target === root) fly();
  });

  function fly() {
    stopWaiting();
    const tag = root.querySelector('.tag');
    if (tag && !REDUCED_MOTION) tag.classList.add('pulled');
    onFly();
  }

  function stopWaiting() {
    waiting = null;
    controls.capture = null;
    controls.padCapture = null;
  }

  const line = (what, set, forId = '') =>
    `<div class="line">${forId ? `<label class="what" for="${forId}">${what}</label>` : `<span class="what">${what}</span>`}<span class="dots"></span><span class="set">${set}</span></div>`;

  function slider(key, label, min = 0.2, max = 3, step = 0.05) {
    const v = controls.config[key];
    return line(label, `<input type="range" id="${key}" data-sens="${key}" min="${min}" max="${max}" step="${step}" value="${v}"><span class="num" data-val="${key}">${v.toFixed(2)}</span>`, key);
  }

  function checkbox(id, label, checked) {
    return line(label, `<input type="checkbox" class="sr" id="${id}" ${checked ? 'checked' : ''}><label class="box" for="${id}">${TICK}</label>`, id);
  }

  function render() {
    const c = controls.config;
    const keyButton = (action, slot) => {
      const code = c.keys[action][slot];
      const isWaiting = waiting && waiting.action === action && waiting.slot === slot;
      if (!code && slot === 1 && !isWaiting) {
        return `<button class="key add" data-action="${action}" data-slot="1" aria-label="Add a second key">+</button>`;
      }
      const cls = isWaiting ? 'key waiting' : code ? 'key' : 'key empty';
      return `<button class="${cls}" data-action="${action}" data-slot="${slot}">${isWaiting ? 'press a key' : keyLabel(code)}</button>`;
    };
    // Controller column: one binding per action, a button, trigger or stick direction.
    const padButton = (action) => {
      const code = c.pad[action];
      const isWaiting = waiting && waiting.action === action && waiting.slot === 'pad';
      const cls = isWaiting ? 'key pad waiting' : code ? 'key pad' : 'key pad empty';
      return `<button class="${cls}" data-pad="${action}" aria-label="Controller input for this action">${isWaiting ? 'press input' : padLabel(code, controls.padStyle)}</button>`;
    };
    const gp = controls.gamepad;
    const padName = gp ? gp.id.replace(/\s*\(.*\)\s*$/, '') || 'Controller' : '';
    const menuBtn = controls.padStyle === 'xbox' ? 'Menu' : 'Options';
    const padStatus = gp
      ? `<p class="pad-status on"><b>${padName}</b> connected. Press ${menuBtn} to fly, and again to come back here.</p>
        ${gp.mapping !== 'standard' ? '<p class="hint">This browser does not report a standard layout for this controller, so the defaults may be wrong. Chrome and Edge read the DualSense correctly, or rebind the inputs below.</p>' : ''}`
      : '<p class="pad-status">No controller found. Connect a DualSense (or any gamepad) by USB or Bluetooth and press a button on it.</p>';
    const usesCtrl = Object.values(c.keys).some((k) => k.some((code) => code && code.startsWith('Control')));

    // Rebinding redraws the card, so keep its scroll position.
    const oldCard = root.querySelector('.card');
    const scroll = oldCard ? oldCard.scrollTop : 0;
    root.innerHTML = `
      <div class="board">
        <div class="clip" aria-hidden="true"></div>
        <div class="card">
          <header>
            <h1>Jet trainer</h1>
          </header>
          <ol class="steps">
            <li>
              <h2>Pick your jet</h2>
              <div class="choices" role="radiogroup" aria-label="Jet">
                ${Object.entries(JET_TYPES).map(([id, j]) => `
                  <button class="choice" role="radio" aria-checked="${id === c.jetType}" data-jet="${id}">
                    <span class="box">${id === c.jetType ? TICK : ''}</span>
                    <span class="choice-text">
                      <span class="choice-name">${j.name}</span>
                      <span class="choice-sum">${j.summary}</span>
                    </span>
                  </button>`).join('')}
              </div>
            </li>
            <li>
              <h2>Pick your controls</h2>
              <div class="choices" role="radiogroup" aria-label="Control setup">
                ${Object.entries(PRESETS).map(([id, p]) => `
                  <button class="choice" role="radio" aria-checked="${id === c.preset}" data-preset="${id}">
                    <span class="box">${id === c.preset ? TICK : ''}</span>
                    <span class="choice-text">
                      <span class="choice-name">${p.name}${id === c.preset && c.custom ? ' (edited)' : ''}${NOTES[id] ? `<span class="pencil">${NOTES[id]}</span>` : ''}</span>
                      <span class="choice-sum">${p.summary}</span>
                    </span>
                  </button>`).join('')}
              </div>
            </li>
            <li>
              <h2>Set the mouse</h2>
              ${c.mouse === 'stick' ? `
                ${line('Mouse left and right', ['roll', 'yaw'].map((v) => `<button class="pick" data-mousex="${v}" aria-pressed="${c.mouseX === v}">${v === 'roll' ? 'Roll' : 'Yaw'}</button>`).join(''))}
                ${slider('sensPitch', 'Pitch sensitivity')}
                ${slider('sensX', c.mouseX === 'roll' ? 'Roll sensitivity' : 'Yaw sensitivity')}`
                : slider('sensAim', 'Aim sensitivity')}
              ${checkbox('invertY', 'Invert pitch', c.invertY)}
            </li>
            <li>
              <h2>Set the controller</h2>
              ${padStatus}
              ${slider('padSensPitch', 'Pitch sensitivity')}
              ${slider('padSensRoll', c.mouse === 'aim' ? 'Turn sensitivity' : 'Roll sensitivity')}
              ${slider('padSensYaw', 'Yaw sensitivity')}
              ${slider('padDeadzone', 'Stick deadzone', 0, 0.4, 0.01)}
              ${checkbox('padInvertY', 'Invert pitch', c.padInvertY)}
              ${checkbox('padToggle', 'Tap for afterburner and free look', c.padToggle)}
              ${line('Vibration', `<button class="reset inline" data-rumble-test ${gp ? '' : 'disabled'}>Test</button><input type="checkbox" class="sr" id="rumble" ${c.rumble ? 'checked' : ''}><label class="box" for="rumble">${TICK}</label>`, 'rumble')}
              <p class="hint">BF6 layout: left stick throttle and yaw, L3 afterburner, right stick pitch and roll (pull back to climb), R2 fire, L2 zoom, R3 camera, D-pad down free look, Cross respawn, touchpad stats.</p>
            </li>
            <li>
              <h2>Check your keys</h2>
              ${ACTIONS.map(([action, label]) => line(label, keyButton(action, 0) + keyButton(action, 1) + padButton(action))).join('')}
              <p class="hint">Click a key, then press the new key or mouse button. Backspace clears it, Esc cancels. The last column is the controller: click it, then press a button or trigger or push a stick; ${menuBtn} cancels.${usesCtrl && !IS_MAC ? ' On Windows, Ctrl can trigger browser shortcuts like Ctrl+W.' : ''}</p>
              <button class="reset" data-reset>Reset keys to ${PRESETS[c.preset].name}</button>
              <button class="reset" data-pad-reset>Reset controller</button>
            </li>
            <li>
              <h2>Graphics and sound</h2>
              ${line('Graphics', [['performance', 'Performance'], ['high', 'High']].map(([v, label]) => `<button class="pick" data-quality="${v}" aria-pressed="${c.quality === v}">${label}</button>`).join(''))}
              ${checkbox('sound', 'Sound', c.sound)}
              ${canFullscreen ? checkbox('fullscreen', 'Full screen', isFullscreen()) : ''}
            </li>
          </ol>
          <footer>Fan made, not affiliated with EA or DICE. <a href="https://github.com/adarkeser/jet-trainer" target="_blank" rel="noopener">Source on GitHub</a></footer>
        </div>
        <button class="tag" data-fly>
          <span class="grommet" aria-hidden="true"></span>
          <span class="tag-main">Start flying</span>
        </button>
        ${message ? `<p class="msg" role="alert">${message}</p>` : ''}
      </div>`;

    root.querySelector('.card').scrollTop = scroll;

    root.querySelectorAll('[data-jet]').forEach((b) => b.addEventListener('click', () => {
      if (c.jetType === b.dataset.jet) return;
      c.jetType = b.dataset.jet;
      controls.save();
      onJetType(c.jetType);
      render();
    }));
    root.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
      stopWaiting();
      controls.applyPreset(b.dataset.preset);
      render();
    }));
    root.querySelectorAll('[data-mousex]').forEach((b) => b.addEventListener('click', () => {
      c.mouseX = b.dataset.mousex;
      c.custom = true;
      controls.save();
      render();
    }));
    root.querySelectorAll('[data-sens]').forEach((input) => input.addEventListener('input', () => {
      const key = input.dataset.sens;
      c[key] = Number(input.value);
      root.querySelector(`[data-val="${key}"]`).textContent = c[key].toFixed(2);
      controls.save();
    }));
    root.querySelectorAll('[data-quality]').forEach((b) => b.addEventListener('click', () => {
      c.quality = b.dataset.quality;
      c.qualityChosen = true;
      controls.save();
      onQuality(c.quality);
      render();
    }));
    root.querySelector('#fullscreen')?.addEventListener('change', (e) => setFullscreen(e.target.checked));
    for (const id of ['invertY', 'sound', 'padInvertY', 'padToggle', 'rumble']) {
      root.querySelector(`#${id}`).addEventListener('change', (e) => {
        c[id] = e.target.checked;
        controls.save();
      });
    }
    root.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      waiting = { action: b.dataset.action, slot: Number(b.dataset.slot) };
      controls.capture = (code) => {
        const w = waiting;
        stopWaiting();
        if (code !== 'Escape') controls.bind(w.action, w.slot, code === 'Backspace' ? null : code);
        render();
      };
      render();
      root.querySelector('.key.waiting')?.focus();
    }));
    root.querySelector('[data-rumble-test]').addEventListener('click', () => {
      const was = c.rumble;
      c.rumble = true;
      controls.buzz(0.8, 0.8, 400);
      controls.flushRumble(performance.now());
      c.rumble = was;
    });
    root.querySelectorAll('[data-pad]').forEach((b) => b.addEventListener('click', () => {
      const w = { action: b.dataset.pad, slot: 'pad' };
      waiting = w;
      // Keyboard or mouse while waiting: Backspace clears the slot, anything else cancels.
      controls.capture = (code) => {
        stopWaiting();
        if (code === 'Backspace') controls.bindPad(w.action, null);
        render();
      };
      controls.padCapture = (code) => {
        stopWaiting();
        if (code !== 'Pad9') controls.bindPad(w.action, code);
        render();
      };
      render();
      root.querySelector('.key.waiting')?.focus();
    }));
    root.querySelector('[data-pad-reset]').addEventListener('click', () => {
      stopWaiting();
      controls.resetPad();
      render();
    });
    root.querySelector('[data-reset]').addEventListener('click', () => {
      stopWaiting();
      controls.applyPreset(c.preset);
      render();
    });
    root.querySelector('[data-fly]').addEventListener('click', fly);
  }

  return {
    show(v) {
      visible = v;
      clearTimeout(leaveTimer);
      if (!visible) stopWaiting();
      if (visible) {
        root.classList.remove('hidden', 'leaving');
        message = '';
        render();
        return;
      }
      // The kneeboard drops out of view as you take off.
      if (REDUCED_MOTION || root.classList.contains('hidden')) {
        root.classList.add('hidden');
        return;
      }
      root.classList.add('leaving');
      leaveTimer = setTimeout(() => {
        root.classList.add('hidden');
        root.classList.remove('leaving');
      }, 320);
    },
    refresh() {
      if (visible) render();
    },
    setMessage(m) {
      message = m;
      render();
    },
  };
}
