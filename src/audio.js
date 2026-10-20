// Small procedural sounds: gun, hit tick, explosion and engine. No audio files.
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // Must be called from a click, browsers only allow audio after a user gesture.
  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.6 : 0;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const engine = ctx.createBufferSource();
    engine.buffer = this.noise;
    engine.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 400;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    engine.start();
  }

  pause() {
    if (this.ctx) this.ctx.suspend();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.6 : 0;
  }

  burst(dur, freq, gain, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5, dur + 0.05);
  }

  gun(shots) {
    for (let i = 0; i < shots; i++) {
      this.burst(0.07, 1600, 0.3, i * 0.05);
      this.burst(0.05, 180, 0.45, i * 0.05);
    }
  }

  hit(kill) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = kill ? 900 : 1900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (kill ? 0.25 : 0.05));
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.3);
    if (kill) this.burst(1.6, 320, 0.8);
  }

  drop() {
    this.burst(0.4, 420, 0.3);
  }

  boom() {
    this.burst(2.2, 240, 1);
  }

  engine(throttle, boost, kmh, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = on ? (boost ? 1 : throttle > 0 ? 0.7 : throttle < 0 ? 0.25 : 0.5) : 0;
    this.engineFilter.frequency.setTargetAtTime(250 + level * 900 + kmh * 0.4, t, 0.3);
    this.engineGain.gain.setTargetAtTime(on ? 0.05 + level * 0.09 : 0, t, 0.3);
  }
}
