# sonnet-games
4 games built by Claude Sonnet 5.5, one prompt each

## Game Night 3D (`games/game-night/`)

A mobile-style multiplayer 3D game hub in plain HTML, CSS and JavaScript. There is no build step: Three.js, Rapier physics and PeerJS load from pinned CDN versions, and every model, texture and sound is generated in code.

Serve the folder with any static server (ES modules and an import map need `http://`, not `file://`) and open it:

```sh
cd games/game-night && python3 -m http.server 8080   # then visit http://localhost:8080
```

**Games:** Ludo (2-4 players, real physics dice, cinematic captures, nine themed worlds, victory podium), Snake Arena (2-4 players, best of 3) and Blaster Brawl (2-4 players, first to 10 KOs). Every game has **Online** (create a room to get a 4-letter code and share link, or join by code), **Local** (pass-and-play) and **vs Bots** (easy, normal, hard). If an online player drops, a bot takes their seat and they can rejoin with the same code.

**Customize** (button on the hub) changes your token skin, board scene, dice, capture finisher, victory dance, move trail, sound pack and avatar frame, with a live 3D preview. Choices are saved in `localStorage` and apply in every game. Graphics Low / Medium / High is in Settings (resolution also adapts to hold 60 fps).

### Controls

| | Desktop | Phone |
|---|---|---|
| **Ludo** | Click or flick the die to throw it, click a glowing token to move | Flick the die, tap a token |
| **Snake Arena** | `A`/`D` or `←`/`→` steer, mouse aims, hold `Space`/`W` to boost (costs length) | Drag the left side to steer, hold **BOOST** |
| **Blaster Brawl** | `WASD` move, mouse aim, click fires, `Shift` (or right click) dashes | Left stick moves, right stick aims and fires, **DASH** button |
| **Gamepad** | Left stick moves/steers, right stick aims, triggers fire, `A` boosts/dashes | |
| **Shared keyboard** (Local mode) | Snake: `A/D+W`, `←/→+↑`, `J/L+I`, `V/N+B`. Brawl: `WASD+F/G`, `Arrows+Enter/RShift`, `IJKL+O/U`, `Numpad 8456+0/Enter` | |

### Tests

`games/game-night/tests/` holds Playwright and Node tests: rules, dice, Snake and Brawl simulations, full matches against bots at high speed for every game, two-page online rooms (create, join, drop, bot takes over, rejoin), UI flows and the screenshots in `games/game-night/screenshots/`. They need Playwright, `peer` and the pinned `three` and Rapier packages; point `GN_VENDOR` at a folder whose `node_modules` has them.
