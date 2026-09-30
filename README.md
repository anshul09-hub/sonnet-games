# sonnet-games
4 games built by Claude Sonnet 5.5, one prompt each

Open `index.html` (or serve the repo root, e.g. GitHub Pages) and pick a game. Every game is plain HTML, CSS and JavaScript with no build step.

## Drift King &mdash; `games/drift-king/`

A low-poly, golden-hour **3D arcade drift racer**: 3 laps against 3 AI rivals on a closed hill track with a long straight, a sweeper, a hairpin, an S-bend and a big jump over a gap.

- **Tech:** [Three.js](https://threejs.org/) `0.170.0` for rendering and [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat` `0.14.0`) for physics, both loaded as ES modules from the jsDelivr CDN through an import map (so you need to be online). No models, images or sound files: every mesh, texture and sound is generated in code. Audio is synthesised with the Web Audio API.
- **Run it:** open `games/drift-king/index.html` through any static web server (ES modules do not load from `file://`), for example `npx http-server .` from the repo root and visit `/games/drift-king/`. It also runs as-is on GitHub Pages.
- **Graphics:** Low / Medium / High from the title or pause menu (saved in `localStorage`). The renderer also lowers its resolution automatically if the frame rate drops.

### Controls

| Action | Keys |
| --- | --- |
| Throttle | `W` / `Up` |
| Brake / reverse | `S` / `Down` |
| Steer | `A` `D` / `Left` `Right` |
| Handbrake (drift) | `Shift` / `Space` |
| Boost | `B` |
| Reset car to the road | `R` |
| Pause / resume | `Esc` |
| Mute / unmute | `M` |
| Start race / race again | `Enter` |

A gamepad also works: left stick steers, `RT` throttle, `LT` brake, `A` / `RB` handbrake, `X` / `B` boost, `Y` reset.

### How to play

- Turn hard at speed, or tap the handbrake while steering, to slide the car. Drifting fills the **boost bar** (bottom right); press `B` for a burst of speed with a wider field of view and speed lines.
- Cones, barrels and fence panels are physics objects. Scraping a wall throws sparks; big hits and landings shake the camera. Flip over or get stuck? Press `R`.
- The rivals follow racing lines, make the odd mistake, bump you, and fight back if you pass them.
- Your best lap is saved in the browser (`localStorage`).
