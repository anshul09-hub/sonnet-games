// Boot + screen router. Screens implement {mount(), unmount(), update(dt)}.
import { Engine } from './core/engine.js';
import { T } from './core/toon.js';
import { ScreenFX } from './core/fx.js';
import { installGlobalUi, toast, h } from './core/ui.js';
import { audio } from './audio/audio.js';
import { profile } from './customize/catalog.js';
import { params } from './core/util.js';

const $loading = document.getElementById('loading');
const setLoading = (msg) => { const m = document.getElementById('loading-msg'); if (m) m.textContent = msg; $loading.classList.remove('done'); $loading.style.display = ''; };
const doneLoading = () => { $loading.classList.add('done'); setTimeout(() => { if ($loading.classList.contains('done')) $loading.style.display = 'none'; }, 600); };

const engine = new Engine(document.getElementById('gl'));
T.outlines = engine.cfg.outlines;
engine.onQuality((l, cfg) => { T.outlines = cfg.outlines; });
const screenFx = new ScreenFX(document.getElementById('app'));
installGlobalUi();
audio.setPack(profile.look.sound);
profile.onChange((cat) => { if (cat === 'sound') audio.setPack(profile.look.sound); });

const app = {
  engine, screenFx, current: null, name: '',
  async go(name, opts = {}) {
    setLoading('LOADING…');
    try {
      if (this.current) { this.current.unmount(); this.current = null; }
      screenFx.clear();
      let screen;
      if (name === 'hub') { const { Hub } = await import('./hub/hub.js'); screen = new Hub(this, opts); }
      else if (name === 'customize') { const { Customize } = await import('./customize/customize.js'); screen = new Customize(this, opts); }
      else throw new Error('unknown screen ' + name);
      this.name = name;
      await screen.mount();
      this.current = screen;
    } catch (e) { console.error(e); toast('Something went wrong: ' + e.message, 'error', 6000); if (name !== 'hub') return this.go('hub'); }
    doneLoading();
  },
  /** Start a game from a ready Session (host or guest). */
  async launch(session, opts = {}) {
    const game = session.cfg.game;
    setLoading('LOADING ' + game.toUpperCase() + '…');
    try {
      if (this.current) { this.current.unmount(); this.current = null; }
      screenFx.clear();
      const mod = await import(`./${game}/${game}.js`);
      const g = await mod.createGame({ app: this, session, ...opts });
      this.name = game;
      await g.mount();
      this.current = g;
    } catch (e) {
      console.error(e); toast('Could not start the game: ' + e.message, 'error', 7000);
      try { session.close(); } catch { /* */ }
      return this.go('hub');
    }
    doneLoading();
  },
  /** Leave a match: hosts of online rooms return to the lobby via the hub. */
  exitToHub(session) { if (session && session.mode === 'online') session.close(); return this.go('hub'); },
};
window.__gn = { app, engine, profile, audio, renderNow: () => engine.render(0.016) };

const NORENDER = params.get('norender') === '1'; // logic-only test runs
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  try {
    if (app.current) app.current.update(dt);
    screenFx.update(dt);
    if (!NORENDER) engine.render(dt);
  } catch (e) { console.error(e); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

app.go(params.get('screen') === 'customize' ? 'customize' : 'hub');
