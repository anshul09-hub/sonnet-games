// Full offline Brawl matches at high speed until a winner + keyboard/mouse control checks + forced explosion visuals.
import { startStatic, launch, newPage, report, sleep, SHOTS, startGame } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
for (const players of [2, 4]) {
  const errors = [];
  const { page } = await newPage(browser, { errors, logs: !!process.env.LOGS });
  await page.goto(url + `?q=low&dyn=0&norender=1&speed=14&scene=${process.env.SCENE || 'neon'}`); await page.waitForSelector('.hub');
  await startGame(page, 'brawl', { players, level: 'hard' });
  await page.evaluate(() => window.__brawl.autoplay(true));
  const t0 = Date.now(); let phase = '';
  while (Date.now() - t0 < 200000) { await sleep(500); phase = await page.evaluate(() => window.__brawl?.rs?.ph); if (phase === 'over') break; }
  check(phase === 'over', `${players}-player match reached the end (${((Date.now() - t0) / 1000).toFixed(1)}s wall)`);
  await sleep(1500);
  const info = await page.evaluate(() => { const r = window.__brawl.rs; return { w: r.w, kos: r.p.map((p) => p.kos), win: !!document.querySelector('#win-card'), rows: document.querySelectorAll('#win-card tbody tr').length, title: document.querySelector('.win-title')?.textContent }; });
  check(info.win && info.rows === players, `results card with ${info.rows} rows: ${info.title}; KOs ${info.kos}`);
  check(info.kos[info.w] >= 10 || info.kos[info.w] === Math.max(...info.kos), 'winner has the most KOs');
  ok = report(errors, players + 'p') && ok;
  await page.close();
}
{
  const errors = []; const { page } = await newPage(browser, { errors, logs: !!process.env.LOGS });
  await page.goto(url + `?q=low&dyn=0&scene=${process.env.SCENE || 'meadow'}&speed=3`); await page.waitForSelector('.hub');
  await startGame(page, 'brawl', { players: 3, level: 'easy' });
  await page.waitForFunction(() => window.__brawl?.rs?.ph === 'play', null, { timeout: 90000 });
  const p0 = await page.evaluate(() => { const p = window.__brawl.sim.players[0]; return [p.x, p.z]; });
  await page.keyboard.down('KeyD'); await sleep(1500); await page.keyboard.up('KeyD');
  const p1 = await page.evaluate(() => { const p = window.__brawl.sim.players[0]; return [p.x, p.z]; });
  check(Math.abs(p1[0] - p0[0]) > 1.0, `D key moves the player right (${p0[0].toFixed(1)} -> ${p1[0].toFixed(1)})`);
  await page.mouse.move(500, 300); await page.mouse.move(800, 420); await sleep(600);
  const aim = await page.evaluate(() => window.__brawl.sim.players[0].input.aim);
  check(aim != null, 'mouse sets the aim angle');
  await page.mouse.down(); await sleep(700); const shots = await page.evaluate(() => window.__brawl.sim.bullets.length + (window.__brawl.sim.players[0].cd > 0 ? 1 : 0)); await page.mouse.up();
  check(shots > 0, 'left mouse fires the blaster');
  await page.keyboard.down('ShiftLeft'); await sleep(500); await page.keyboard.up('ShiftLeft');
  let dashCd = 0; for (let i = 0; i < 20 && dashCd < 0.5; i++) { await sleep(150); dashCd = await page.evaluate(() => window.__brawl.sim.players[0].dashCd); }
  check(dashCd > 0.5, 'Shift dash triggered (cooldown ' + dashCd.toFixed(2) + ')');
  // forced explosion + crate break for visuals
  await page.evaluate(() => { const s = window.__brawl.sim; const b = [...s.props.values()].find((e) => e.kind === 'barrel' && e.alive); s.killProp(b, 0); });
  await sleep(500); await page.screenshot({ path: SHOTS + '/brawl-boom.png' });
  const deb = await page.evaluate(() => window.__brawl.view.debris.length);
  check(deb > 3, `explosion spawned ${deb} debris pieces`);
  ok = report(errors, 'keyboard/explosion') && ok;
}
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
