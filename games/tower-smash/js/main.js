// Boot: create everything, load physics, show the title screen.
import { Gfx } from './gfx.js';
import { initPhysics } from './physics.js';
import { Fx } from './fx.js';
import { Arena } from './arena.js';
import { Catapult } from './catapult.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { Game } from './game.js';
import { Save } from './save.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);

async function boot() {
  Save.load();
  const params = new URLSearchParams(location.search);
  const gfx = new Gfx($('stage'));
  $('loader-text').textContent = 'Loading physics engine…';
  await initPhysics();
  $('loader-text').textContent = 'Building the valley…';
  const fx = new Fx(gfx.scene);
  const audio = new AudioEngine();
  audio.muted = !!Save.settings.muted;
  audio.sfxVol = Save.settings.sfx; audio.musicVol = Save.settings.music;
  const arena = new Arena(gfx, fx, audio);
  const catapult = new Catapult(gfx.scene);
  const ui = new UI();
  const game = new Game({ gfx, fx, arena, catapult, audio, ui });
  ui.attach({ game, audio, gfx, fx, arena });

  const q = ['low', 'medium', 'high'].includes(params.get('q')) ? params.get('q') : Save.settings.quality;
  if (params.get('q')) Save.settings.qualityManual = true;
  gfx.setQuality(q, (cfg) => { fx.setQuality(cfg); arena.setQuality(cfg); });
  ui.refreshSettings();
  ui.updateMuteIcon();

  game.enterTitle();
  ui.showTitle();
  $('loader').classList.remove('show');

  // audio needs a user gesture; start it (and the music) on the first one
  const unlockAudio = () => {
    audio.init(); audio.startMusic();
    window.removeEventListener('pointerdown', unlockAudio); window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('pointerdown', unlockAudio); window.addEventListener('keydown', unlockAudio);
  document.addEventListener('visibilitychange', () => { if (document.hidden) audio.suspend(); else if (audio.ctx) audio.resume(); });

  let errors = 0;
  const loop = (t) => {
    try { game.frame(t); } catch (e) { if (errors++ < 5) console.error(e); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  // developer / test hooks
  window.__ts = {
    game, arena, gfx, audio, ui, Save, LEVELS, fx, catapult,
    state() {
      return { mode: game.mode, phase: game.phase, shots: game.shots, flagsLeft: game.flagsLeft, flagsTotal: game.flagsTotal,
        alive: arena.aliveBlocks, total: arena.blocks.length, movers: arena.movers, maxSpeed: arena.maxSpeed, ammo: { ...game.ammo }, paused: game.paused,
        timeScale: game.timeScale, camMode: game.camMode };
    },
    freeze(v = true) { game.frozen = v; game.lastNow = 0; },
    snap(n = 40) { for (let i = 0; i < n; i++) game.updateCamera(0.05); game.updateAimVisuals(0.016); gfx.render(0.016, game.time); },
    quickStart(i) { game.startLevel(i); game.phase = 'aim'; game.camMode = 'aim'; arena.introT = 99; arena.syncVisuals(0, 0, true); },
    sim(seconds) { const n = Math.round(seconds * 60); for (let i = 0; i < n; i++) game.simStep(1 / 60); },
  };
}

boot().catch((e) => { throw e; });
