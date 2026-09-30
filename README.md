# sonnet-games
4 games built by Claude Sonnet 5.5, one prompt each

Open `index.html` (or the GitHub Pages site) to pick a game. Every game is plain HTML, CSS and JavaScript with no build step.

## Games

### Blockworld — `games/blockworld/`

A Minecraft-style voxel sandbox that runs entirely in the browser: an endless seeded world of blended biomes (plains, forest, snowy mountains, desert dunes), caves, lakes, trees and flowers; block breaking and placing; sand and gravel that fall; TNT with chain reactions and real physics debris (Rapier); sheep; a day/night cycle; synthesised sound and music; and a world that saves itself to `localStorage`.

Run it from any static web server (for example `python3 -m http.server` in the repo root, then open `http://localhost:8000/games/blockworld/`) or via GitHub Pages. Three.js and Rapier are loaded from pinned CDN versions through an import map, so you need to be online the first time.

**Controls**

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| `Space` | Jump (swim up in water, fly up when flying) |
| `Shift` | Sprint (hold with `W`) |
| Mouse | Look (click the game to capture the pointer) |
| Left click (hold) | Break a block — crack animation and block particles. **Left-click a TNT block to light its fuse** |
| Right click | Place the selected block |
| `1`–`9` / mouse wheel | Select a hotbar slot |
| Middle click | Pick the block you are looking at |
| `E` | Open the block palette (click a block to put it in the selected slot) |
| `Space` twice (double-tap) or `F` | Take off / land. While flying: `Space` up, `C` down, `Shift` much faster (speed blur, wider view) |
| `T` | Skip ahead in time of day |
| `M` | Mute / unmute |
| `F3` | Debug overlay (fps, chunks, physics counts) |
| `Esc` | Pause menu (volume, graphics quality, save & quit) |

Graphics: **Medium** and **High** add real sun and moon shadows (including your own body), a planar water reflection, bump-mapped pixel textures, bloom, and a filmic, moody colour grade. **Low** keeps the lighting but skips shadows, reflections and post-processing.

Title screen: type a seed (leave it empty for a random world), pick **Graphics** Low / Medium / High, and press Play. Any world you change is saved automatically per seed and offered as **Continue World** next time.

Things to try: build a line of TNT blocks and light the first one; dig under a stack of sand; stand near a blast and get thrown; walk into the desert at sunset.
