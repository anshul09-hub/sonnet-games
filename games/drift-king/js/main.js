// Bootstrap: create the game, show progress, surface errors on the loading screen.
import { Game } from './game.js';

const msg = document.getElementById('loadMsg');
const err = document.getElementById('loadErr');
function fail(e) {
  console.error(e);
  msg.textContent = 'Something went wrong';
  err.classList.remove('hidden');
  err.textContent = (e && e.message ? e.message : String(e)) + ' — this game needs WebGL2 and an internet connection to load Three.js and Rapier from a CDN.';
  const bar = document.getElementById('loadBar'); if (bar) bar.style.display = 'none';
}
addEventListener('unhandledrejection', (e) => { if (document.getElementById('loading') && !document.getElementById('loading').classList.contains('hidden')) fail(e.reason); });

(async () => {
  try {
    const game = new Game(document.getElementById('gl'));
    window.__dk = game; // handy for debugging / automated tests
    await game.init((m) => { msg.textContent = m; });
    document.getElementById('loading').classList.add('hidden');
    game.start();
  } catch (e) { fail(e); }
})();
