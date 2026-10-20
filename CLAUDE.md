# Jet trainer

Static Three.js game, live at https://adarkeser.com/jet/. See README.md for the file map and CONTRIBUTING.md for the rules (no build step, relative paths only, no copyrighted assets).

- Pushing to `main` publishes the live site within a few minutes (GitHub Pages serves the repo root).
- Check changes with `node --check src/*.js`. For logic, copy `src/` to the scratchpad next to a `node_modules/three` link and run headless tests: world, flight, targets and weapons all run in Node, menu, HUD and controls need a browser.
- Feel numbers: `TUNING` in `src/flight.js`, `GUN` in `src/weapons.js`, `KINDS` in `src/targets.js`.
- Saved settings key is `jet-trainer.controls.v2`. Bump it when a binding change would clash with old saves.
