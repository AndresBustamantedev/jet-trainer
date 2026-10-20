// Performance numbers for the stats overlay. A web page cannot see the browser's real
// CPU, RAM or GPU use, so this shows what the page itself can measure.
export class Stats {
  constructor(renderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext();
    // GPU timing is only available in some browsers. Without it the overlay says so.
    this.ext = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.queries = [];
    this.active = null;
    this.reset();
    this.out = { fps: 0, frameMs: 0, worstMs: 0, cpuMs: 0, gpuMs: null, heapMb: null, heapLimitMb: null };
  }

  reset() {
    this.time = 0;
    this.frames = 0;
    this.worst = 0;
    this.cpu = 0;
    this.gpu = 0;
    this.gpuFrames = 0;
  }

  begin(enabled) {
    this.t0 = performance.now();
    this.renderer.info.reset();
    if (enabled && this.ext && !this.active && this.queries.length < 8) {
      this.active = this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.active);
    }
  }

  end(rawDt) {
    const gl = this.gl;
    if (this.active) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.queries.push(this.active);
      this.active = null;
    }
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      if (!gl.getParameter(this.ext.GPU_DISJOINT_EXT)) {
        this.gpu += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuFrames++;
      }
      gl.deleteQuery(q);
      this.queries.shift();
    }

    this.cpu += performance.now() - this.t0;
    this.time += rawDt;
    this.frames++;
    this.worst = Math.max(this.worst, rawDt * 1000);
    if (this.time < 0.5) return;

    const o = this.out;
    o.fps = this.frames / this.time;
    o.frameMs = (this.time / this.frames) * 1000;
    o.worstMs = this.worst;
    o.cpuMs = this.cpu / this.frames;
    o.gpuMs = this.gpuFrames ? this.gpu / this.gpuFrames : this.ext ? o.gpuMs : null;
    const mem = performance.memory; // Chrome-based browsers only
    o.heapMb = mem ? mem.usedJSHeapSize / 1048576 : null;
    o.heapLimitMb = mem ? mem.jsHeapSizeLimit / 1048576 : null;
    const info = this.renderer.info;
    o.calls = info.render.calls;
    o.triangles = info.render.triangles;
    o.geometries = info.memory.geometries;
    o.textures = info.memory.textures;
    o.programs = info.programs ? info.programs.length : 0;
    o.pixelRatio = this.renderer.getPixelRatio();
    this.reset();
  }
}
