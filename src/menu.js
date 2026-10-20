// Pause menu, drawn as a preflight card on a pilot's kneeboard.
import { ACTIONS, PRESETS, keyLabel } from './controls.js';

const IS_MAC = /Mac/.test(navigator.platform);
const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Pencil tick for checked boxes.
const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 12.8c2.1 1.5 3.7 3.3 5.1 5.5 2.7-5.3 6.5-10.2 11.9-14.6" /></svg>';

const NOTES = { mouseYaw: 'Recommended' };

export function createMenu(root, controls, { onFly }) {
  let waiting = null; // { action, slot } while rebinding
  let message = '';
  let leaveTimer = 0;

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
  }

  const line = (what, set, forId = '') =>
    `<div class="line">${forId ? `<label class="what" for="${forId}">${what}</label>` : `<span class="what">${what}</span>`}<span class="dots"></span><span class="set">${set}</span></div>`;

  function slider(key, label) {
    const v = controls.config[key];
    return line(label, `<input type="range" id="${key}" data-sens="${key}" min="0.2" max="3" step="0.05" value="${v}"><span class="num" data-val="${key}">${v.toFixed(2)}</span>`, key);
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
    const usesCtrl = Object.values(c.keys).some((k) => k.some((code) => code && code.startsWith('Control')));

    root.innerHTML = `
      <div class="board">
        <div class="clip" aria-hidden="true"></div>
        <div class="card">
          <header>
            <h1>Jet trainer</h1>
          </header>
          <ol class="steps">
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
              ${checkbox('sound', 'Sound', c.sound)}
            </li>
            <li>
              <h2>Check your keys</h2>
              ${ACTIONS.map(([action, label]) => line(label, keyButton(action, 0) + keyButton(action, 1))).join('')}
              <p class="hint">Click a key, then press the new key or mouse button. Backspace clears it, Esc cancels.${usesCtrl && !IS_MAC ? ' On Windows, Ctrl can trigger browser shortcuts like Ctrl+W.' : ''}</p>
              <button class="reset" data-reset>Reset keys to ${PRESETS[c.preset].name}</button>
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
    for (const id of ['invertY', 'sound']) {
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
    root.querySelector('[data-reset]').addEventListener('click', () => {
      stopWaiting();
      controls.applyPreset(c.preset);
      render();
    });
    root.querySelector('[data-fly]').addEventListener('click', fly);
  }

  return {
    show(visible) {
      clearTimeout(leaveTimer);
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
    setMessage(m) {
      message = m;
      render();
    },
  };
}
