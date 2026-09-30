// Every SFX, jingle, pack and music theme runs without throwing (Web Audio graph builds and schedules).
import { startStatic, launch, newPage, report, sleep } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); const errors = [];
const { page } = await newPage(browser, { errors });
await page.goto(url + '?q=low&dyn=0&norender=1'); await page.waitForSelector('.hub');
await page.mouse.click(300, 300); // user gesture unlocks audio
const res = await page.evaluate(async () => {
  const { audio, SOUND_PACKS } = await import('/js/audio/audio.js');
  audio.unlock(); await new Promise((r) => setTimeout(r, 300));
  const names = ['click', 'hover', 'back', 'ok', 'error', 'tick', 'warn', 'turn', 'diceThrow', 'dice', 'diceLand', 'six', 'hop', 'land', 'spawn', 'home', 'draw', 'slash', 'smash', 'kick', 'crack', 'laser', 'voxel', 'whoosh', 'boom', 'cheer', 'oh', 'win', 'lose', 'start', 'eat', 'boostOn', 'burst', 'roundWin', 'shoot', 'shotgun', 'rocket', 'hit', 'pickup', 'shield', 'clang', 'spawnBrawl'];
  let n = 0, bad = [];
  for (const p of SOUND_PACKS) { audio.setPack(p.id); for (const nm of names) { try { audio.sfx(nm, { v: 0.7, n: 3 }); n++; } catch (e) { bad.push(p.id + ':' + nm + ':' + e.message); } await new Promise((r) => setTimeout(r, 1)); } }
  for (const th of ['anime', 'gamer', 'tech']) for (const game of ['hub', 'ludo', 'snake', 'brawl', 'win']) { try { audio.playMusic(th, { game, energy: 0.8 }); await new Promise((r) => setTimeout(r, 120)); } catch (e) { bad.push('music ' + th + game + e.message); } }
  const loop = audio.loopStart('boost'); loop && loop.stop(); audio.stopMusic(); audio.setMuted(true); audio.sfx('click'); audio.setMuted(false);
  return { n, bad, state: audio.ctx && audio.ctx.state };
});
console.log(res.bad.length ? '✗ audio errors: ' + res.bad.slice(0, 5) : `✓ ${res.n} sfx x ${9} packs + 15 music loops ran without exceptions (context ${res.state})`);
const ok = report(errors, 'audio') && res.bad.length === 0; await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
