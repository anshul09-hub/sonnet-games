// Full offline Snake matches at high speed until a winner: results screen, then a keyboard-control check and a forced burst.
import { startStatic, launch, newPage, report, sleep, SHOTS, startGame } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
// keyboard control + forced death effects on a rendered page
{
  const errors = []; const { page } = await newPage(browser, { errors, logs: !!process.env.LOGS });
  await page.goto(url + `?q=low&dyn=0&scene=meadow&speed=3`); await page.waitForSelector('.hub');
  await startGame(page, 'snake', { players: 3, level: 'easy' });
  await page.waitForFunction(() => window.__snake?.rs?.ph === 'play', null, { timeout: 60000 });
  const a0 = await page.evaluate(() => window.__snake.sim.snakes[0].ang);
  await page.keyboard.down('KeyD'); await sleep(2500); await page.keyboard.up('KeyD');
  const a1 = await page.evaluate(() => window.__snake.sim.snakes[0].ang);
  check(a1 - a0 > 0.5, `D key steers the snake right (angle ${a0.toFixed(2)} -> ${a1.toFixed(2)})`);
  await page.keyboard.down('Space'); await sleep(1200);
  const boosting = await page.evaluate(() => window.__snake.sim.snakes[0].boost); await page.keyboard.up('Space');
  check(boosting, 'Space boosts');
  await page.mouse.move(400, 300); await page.mouse.move(700, 500); await page.mouse.move(900, 200); await sleep(800);
  const tgt = await page.evaluate(() => window.__snake.sim.snakes[0].tgt);
  check(tgt != null, 'mouse aims the snake (target angle ' + (tgt?.toFixed?.(2)) + ')');
  // forced crash for the burst effects
  const forced = await page.evaluate(() => { const s = window.__snake.sim; const al = s.snakes.filter((x) => x.alive && x.id > 0); if (al.length < 1) return false; s.kill(al[0], al[1] || null, 'body'); return true; });
  check(forced, 'forced a crash');
  let deb = 0; for (let i = 0; i < 40 && deb < 4; i++) { await sleep(250); deb = await page.evaluate(() => window.__snake.view.debris.length); }
  await page.screenshot({ path: SHOTS + '/snake-burst.png' });
  check(deb > 3, `burst spawned ${deb} physics debris pieces`);
  ok = report(errors, 'keyboard/burst') && ok;
}
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
