# sonnet-games

4 games built by Claude Sonnet 5.5, one prompt each

Open [`index.html`](index.html) for the game menu (it links to every game in [`games/`](games/)). Everything is plain HTML, CSS and JavaScript with no build step, so the whole repo runs straight from GitHub Pages.

To run locally, serve the folder with any static server and open it in a browser:

```
python3 -m http.server 8000
# then visit http://localhost:8000/
```

Games that use third-party libraries load them as ES modules from pinned CDN versions, so they need an internet connection the first time.

---

## Tower Smash

`games/tower-smash/` &middot; a 3D castle-smashing physics game.

A catapult sits on a hill. Across a river valley stand castles and towers made of hundreds of real rigid bodies: wood, stone, glass and red TNT barrels. Pull back, aim, fire, and knock down every enemy flag in as few shots as possible.

### Controls

| Action | Mouse / touch | Keyboard |
| --- | --- | --- |
| Aim and set power | Press anywhere, drag **back** (away from where you want to shoot), the dotted arc previews the shot | `Up` / `Down` angle, `Left` / `Right` power (hold `Shift` for fine steps) |
| Fire | Release | `Space` or `Enter` |
| Split a **Cluster** shot / detonate a **Bomb** in flight | Tap or click | `Space` or `Enter` |
| Choose ammo | Click an ammo button | `1` to `5` |
| Restart level | Restart button | `R` |
| Pause | Pause button | `Esc` |
| Mute | Speaker button | `M` |

Tips: a faint ghost arc shows your previous shot so you can adjust from it. The catapult always launches at the same speed for a given pull, so heavier ammo simply hits harder.

### Scoring

* 3 stars for winning in 1 or 2 shots, 2 stars for 3 or 4 shots, 1 star for anything more.
* You lose if you run out of ammo while flags are still standing.
* Progress (stars, best shots, settings) is saved in `localStorage`. Beat a level to unlock the next.

### Ammo

| Ammo | Unlocked | What it does |
| --- | --- | --- |
| Stone | Level 1 | The reliable all-rounder. |
| Boulder | Level 3 | About five times heavier. Crushes stone. |
| Cluster | Level 5 | Tap in flight to split into five. |
| Bouncy | Level 7 | Ricochets through structures. |
| Bomb | Level 9 | Explodes on impact, or tap to detonate early. |

### Levels

1. Warm-Up
2. Timber Yard
3. Stone Keep
4. Twin Towers
5. Glass Palace
6. Powder Keep
7. Wrecking Yard (swinging wrecking ball)
8. The Elevator (moving platform)
9. The Great Wall
10. Sky Bridge
11. Drifting Fortress (the castle rides a platform)
12. Dragon's Keep

### Tech notes

* **Three.js r170** for rendering (soft PCF shadows, bloom on explosions, instanced meshes) and **Rapier 0.14** (`@dimforge/rapier3d-compat`) for physics, both loaded through an import map from pinned jsDelivr URLs.
* Every block is its own rigid body with its own mass (density times volume), friction and restitution. Structures start asleep so they stand perfectly still, and pieces go back to sleep once they settle.
* Damage comes from real contact forces. Each block's threshold is raised by the weight resting on it, so a tower does not damage itself but an impact does. Glass shatters into physical shards, wood splinters, stone chips, and TNT applies a radial blast impulse and chains to neighbouring barrels.
* Big collapses trigger a one-second slow motion with a swinging camera.
* No image, model or sound files: textures are painted on canvases at start-up, geometry is built in code, and all audio (impacts, explosions, catapult creak, jingles and the music loop) is synthesised with the Web Audio API.
* Graphics setting (Low / Medium / High) in Settings. It also auto-lowers itself once if the first seconds of play run slowly, unless you have chosen a setting yourself.
* Developer hooks: open the game with `?q=low|medium|high` to force a graphics preset.
