# Contributing

Thanks for helping. Pull requests are welcome: flight feel, controls, targets, visuals, bug fixes.

## Run it

No build step and nothing to install. Serve the folder and open it:

```bash
python3 -m http.server 8137
```

Then open http://127.0.0.1:8137. Opening `index.html` straight from disk does not work, because browsers block ES modules on `file://`.

## Rules

- Keep it static: plain ES modules, Three.js from the CDN in the import map, no bundler, no `npm install`.
- Keep paths relative. The game is served from a subfolder (`adarkeser.com/jet/`), so a path starting with `/` breaks it.
- No copyrighted assets: no Battlefield logos, art, models, sounds or music. Only add assets you made or that have a license allowing it, and say which license in the pull request.
- Feel numbers live in one place each: `TUNING` in `src/flight.js`, `GUN` in `src/weapons.js`, `KINDS` in `src/targets.js`. Change those rather than scattering constants.
- One change per pull request, with a short note on what it does and how you checked it.

Merged changes go live on the site within a few minutes.
