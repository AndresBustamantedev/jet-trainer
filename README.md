# Jet trainer

A browser practice range for Battlefield 6 style jet flying: a fighter and an attack jet with bombs, BF6 control presets you can rebind, and drones, tanks, AA guns and soldiers to shoot. Three.js from a CDN, no build step, no installs.

Play it at **https://adarkeser.com/jet/**.

Not affiliated with, endorsed by or connected to Electronic Arts or DICE. Battlefield is a trademark of Electronic Arts Inc.

## Run locally

```bash
python3 -m http.server 8137
```

Open http://127.0.0.1:8137. ES modules do not load from `file://`, so a server is needed.

## Files

- `src/flight.js`: arcade flight model. Every feel number is in `TUNING` at the top (speeds, best turn band, turn rates, ceiling); `JET_TYPES` holds the attack jet's slower, heavier overrides. They are guesses, not measured from BF6.
- `src/controls.js`: key bindings, mouse handling, the three presets. Settings save to localStorage.
- `src/menu.js`: pause menu (Esc). Rebinding, sensitivity, preset choice.
- `src/hud.js`: canvas HUD, including the live input monitor at the bottom.
- `src/world.js`: island terrain with a per-pixel ground shader (fields, forest floor, rock, snow, beaches), mountain shadows and valley darkening baked at load, height haze that replaces three's fog, sky, soft billboard clouds, rippled water, trees, town. The look's defaults are `DEFAULT_LOOK`.
- `src/jet.js`: jet model built in code (lofted fuselage, airfoil wings, camo shader), afterburner, wingtip vapor, crash effect.
- `src/weapons.js`: nose cannon. Rate, damage, bullet speed and overheat are in `GUN` at the top.
- `src/bombs.js`: the attack jet's unguided bombs, blast damage and the impact prediction the HUD shows. Numbers are in `BOMBS` at the top.
- `src/targets.js`: orange drones flying circles and weaves, tanks (some driving) and AA guns that track the jet. All respawn after a kill.
- `src/audio.js`: procedural gun, hit, explosion and engine sounds (no audio files).
- `src/graphics.js`: rendering and the Performance and High modes (bloom, shadow quality, tree and cloud counts, resolution cap).
- `src/tuner.js`: look tuner, shown only with `?tune` in the address. Sliders for exposure, sun, sky fill, haze and bloom, with a copy button for the values.
- `src/stats.js`: performance overlay (P): fps, frame, page CPU and GPU time, JS memory, draw calls and GPU object counts.

## Control presets

All presets share EA's BF6 defaults: W/S throttle, Left Shift afterburner, left mouse fire, right mouse zoom, hold V free look, C camera. Respawn is Enter (R is reload in BF6). Saved settings use `jet-trainer.controls.v2` in localStorage.

- **BF6 default**: mouse pitch and roll, A/D yaw, arrow keys pitch and roll.
- **Mouse yaw**: mouse pitch and yaw, A/D roll, Space pitch up, Left Ctrl pitch down. On macOS Ctrl+click is a right click, so `controls.js` keeps it as fire while flying.
- **Look and turn**: BF6's simplified jet controls (added in Season 4). The mouse aims and the jet flies to the aim point.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). MIT licensed, see [LICENSE](LICENSE).
