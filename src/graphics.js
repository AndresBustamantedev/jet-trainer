// Rendering and the two graphics modes.
// High: bloom on the sun, flames and explosions, sharper and wider soft shadows, every tree and cloud.
// Performance: no post effects, smaller shadows, about half the trees and clouds, lower resolution cap.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// A page can start in a 0-sized window (a hidden tab or a pane still opening). Zero-sized
// render targets are invalid, so sizes never go below 1 pixel.
const viewW = () => Math.max(1, innerWidth);
const viewH = () => Math.max(1, innerHeight);

export function createGraphics({ renderer, scene, camera, world }) {
  let high = true;
  let composer = null;
  let bloom = null;
  const deviceRatio = Math.min(devicePixelRatio || 1, 2);

  function buildComposer() {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, target);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(viewW(), viewH()), world.look.bloom, 0.5, 0.92);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    resize();
  }

  function resize() {
    renderer.setSize(viewW(), viewH(), false);
    camera.aspect = viewW() / viewH();
    camera.updateProjectionMatrix();
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(viewW(), viewH());
    }
  }

  const api = {
    get high() {
      return high;
    },
    // Highest render resolution this mode allows. The frame-time check may go lower.
    get maxPixelRatio() {
      return high ? deviceRatio : Math.min(deviceRatio, 1.5);
    },

    setQuality(mode) {
      high = mode !== 'performance';
      const sun = world.sun;
      renderer.shadowMap.type = high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      const size = high ? 4096 : 2048;
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
      const box = high ? 45 : 22;
      Object.assign(sun.shadow.camera, { left: -box, right: box, top: box, bottom: -box });
      sun.shadow.camera.updateProjectionMatrix();
      world.setDetail(high);
      if (high && !composer) buildComposer();
      // Shadow filtering is compiled into the shaders, so they have to be rebuilt.
      scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
      api.setPixelRatio(api.maxPixelRatio);
    },

    setPixelRatio(ratio) {
      renderer.setPixelRatio(ratio);
      resize();
    },

    setBloom(strength) {
      if (bloom) bloom.strength = strength;
    },

    resize,

    render() {
      if (high && composer) composer.render();
      else renderer.render(scene, camera);
    },
  };
  return api;
}
