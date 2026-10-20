// Pause menu: control setup, mouse settings and key bindings.
import { ACTIONS, PRESETS, keyLabel } from './controls.js';

const IS_MAC = /Mac/.test(navigator.platform);

export function createMenu(root, controls, { onFly }) {
  let waiting = null; // { action, slot } while rebinding
  let message = '';

  root.addEventListener('click', (e) => {
    if (e.target === root) fly();
  });

  function fly() {
    stopWaiting();
    onFly();
  }

  function stopWaiting() {
    waiting = null;
    controls.capture = null;
  }

  function slider(key, label) {
    const v = controls.config[key];
    return `<div class="row"><label for="${key}">${label}</label>
      <span class="slider"><input type="range" id="${key}" data-sens="${key}" min="0.2" max="3" step="0.05" value="${v}">
      <span class="val" data-val="${key}">${v.toFixed(2)}</span></span></div>`;
  }

  function render() {
    const c = controls.config;
    const keyCell = (action, slot) => {
      const code = c.keys[action][slot];
      const isWaiting = waiting && waiting.action === action && waiting.slot === slot;
      const cls = isWaiting ? 'key waiting' : code ? 'key' : 'key empty';
      const label = isWaiting ? 'Press a key' : keyLabel(code);
      return `<td class="k"><button class="${cls}" data-action="${action}" data-slot="${slot}">${label}</button></td>`;
    };
    const usesCtrl = Object.values(c.keys).some((k) => k.some((code) => code && code.startsWith('Control')));

    root.innerHTML = `
      <div class="panel">
        <h1>Jet trainer</h1>
        <p class="lede">Practice Battlefield 6 style jet flying with the controls you want. Press Esc any time to come back here.</p>
        <p class="fine">Fan made, not affiliated with EA or DICE. <a href="https://github.com/adarkeser/jet-trainer" target="_blank" rel="noopener">Source on GitHub</a></p>
        <section>
          <h2>Control setup</h2>
          <div class="schemes" role="radiogroup">
            ${Object.entries(PRESETS).map(([id, p]) => `
              <button class="scheme" role="radio" aria-checked="${id === c.preset}" data-preset="${id}">
                <span class="scheme-name">${p.name}${id === c.preset && c.custom ? ' (edited)' : ''}</span>
                <span class="scheme-sum">${p.summary}</span>
              </button>`).join('')}
          </div>
        </section>
        <section>
          <h2>Mouse</h2>
          ${c.mouse === 'stick' ? `
            <div class="row"><span>Mouse left and right</span>
              <span class="seg">${['roll', 'yaw'].map((v) => `<button data-mousex="${v}" aria-pressed="${c.mouseX === v}">${v === 'roll' ? 'Roll' : 'Yaw'}</button>`).join('')}</span>
            </div>
            ${slider('sensPitch', 'Pitch sensitivity')}
            ${slider('sensX', c.mouseX === 'roll' ? 'Roll sensitivity' : 'Yaw sensitivity')}`
            : slider('sensAim', 'Aim sensitivity')}
          <div class="row"><label for="invertY">Invert pitch (mouse up points the nose down)</label>
            <input type="checkbox" id="invertY" ${c.invertY ? 'checked' : ''}></div>
        </section>
        <section>
          <h2>Keys</h2>
          <table class="keys"><tbody>
            ${ACTIONS.map(([action, label]) => `<tr><td>${label}</td>${keyCell(action, 0)}${keyCell(action, 1)}</tr>`).join('')}
          </tbody></table>
          <p class="hint">Click a key to change it, then press a key or a mouse button. Backspace clears it, Esc cancels.${usesCtrl && !IS_MAC ? ' Ctrl is risky on Windows: the browser can read Ctrl+W as close tab.' : ''}</p>
          <button class="link" data-reset>Reset to ${PRESETS[c.preset].name}</button>
        </section>
        <section>
          <h2>Options</h2>
          <div class="row"><label for="sound">Sound</label>
            <input type="checkbox" id="sound" ${c.sound ? 'checked' : ''}></div>
        </section>
        <div class="fly-bar">
          <button class="fly" data-fly>Fly</button>
          ${message ? `<p class="msg">${message}</p>` : ''}
        </div>
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
    root.querySelector('#invertY').addEventListener('change', (e) => {
      c.invertY = e.target.checked;
      controls.save();
    });
    root.querySelector('#sound').addEventListener('change', (e) => {
      c.sound = e.target.checked;
      controls.save();
    });
    root.querySelectorAll('[data-action]').forEach((b) => b.addEventListener('click', () => {
      waiting = { action: b.dataset.action, slot: Number(b.dataset.slot) };
      controls.capture = (code) => {
        const w = waiting;
        stopWaiting();
        if (code !== 'Escape') controls.bind(w.action, w.slot, code === 'Backspace' ? null : code);
        render();
      };
      render();
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
      root.classList.toggle('hidden', !visible);
      if (visible) {
        message = '';
        render();
      }
    },
    setMessage(m) {
      message = m;
      render();
    },
  };
}
