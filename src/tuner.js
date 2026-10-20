// Look tuner, only shown with ?tune in the address. Drag the sliders while flying (Esc first to
// free the mouse), then "Copy values" and paste them to make them the defaults in DEFAULT_LOOK.
const KEY = 'jet-trainer.tune';

const SLIDERS = [
  ['exposure', 'Exposure', 0.3, 2.5, 0.01],
  ['sun', 'Sun', 0, 8, 0.05],
  ['ambient', 'Sky fill', 0, 2.5, 0.01],
  ['hazeDensity', 'Haze', 0, 0.0005, 0.000005],
  ['hazeFalloff', 'Haze height falloff', 0.0001, 0.004, 0.00005],
  ['cloudOpacity', 'Clouds', 0, 1, 0.01],
  ['bloom', 'Bloom (High)', 0, 2, 0.01],
];
const COLORS = [
  ['haze', 'Haze color'],
  ['zenith', 'Sky overhead'],
];

export function createTuner({ world, graphics }) {
  if (!new URLSearchParams(location.search).has('tune')) return;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) apply(saved);
  } catch { /* no saved tuning */ }

  function apply(values) {
    world.setLook(values);
    graphics.setBloom(world.look.bloom);
    clearTimeout(apply.timer);
    apply.timer = setTimeout(() => world.bakeEnvironment(), 150);
    try {
      localStorage.setItem(KEY, JSON.stringify(world.look));
    } catch { /* storage blocked */ }
  }

  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:10;width:300px;padding:12px;background:rgba(236,238,232,.96);color:#1c1f1d;font:12px B612,system-ui;border-radius:4px;box-shadow:0 6px 20px rgba(0,0,0,.3)';
  const row = (label, input) => `<label style="display:grid;grid-template-columns:1fr 130px 52px;gap:6px;align-items:center;margin:4px 0">${label}${input}</label>`;
  const look = world.look;
  panel.innerHTML = `
    <b style="font-size:13px">Look tuner</b>
    ${row('Tone mapping', `<select data-k="toneMapping">${['neutral', 'agx', 'aces'].map((t) => `<option ${look.toneMapping === t ? 'selected' : ''}>${t}</option>`).join('')}</select><span></span>`)}
    ${SLIDERS.map(([k, label, min, max, step]) => row(label, `<input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${look[k]}"><span data-v="${k}">${look[k]}</span>`)).join('')}
    ${COLORS.map(([k, label]) => row(label, `<input type="color" data-k="${k}" value="${look[k]}"><span></span>`)).join('')}
    <div style="display:flex;gap:8px;margin-top:8px">
      <button data-copy>Copy values</button><button data-reset>Reset</button>
    </div>`;
  document.body.appendChild(panel);

  panel.addEventListener('input', (e) => {
    const k = e.target.dataset.k;
    if (!k) return;
    const value = e.target.type === 'range' ? Number(e.target.value) : e.target.value;
    const label = panel.querySelector(`[data-v="${k}"]`);
    if (label) label.textContent = value;
    apply({ [k]: value });
  });
  panel.querySelector('[data-copy]').addEventListener('click', async (e) => {
    const text = JSON.stringify(world.look, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = 'Copied';
    } catch {
      prompt('Copy these values', text);
    }
  });
  panel.querySelector('[data-reset]').addEventListener('click', () => {
    try {
      localStorage.removeItem(KEY);
    } catch { /* storage blocked */ }
    location.reload();
  });
}
