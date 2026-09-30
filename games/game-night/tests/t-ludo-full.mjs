// Full Ludo games against bots at high speed: proves the rules run to a winner through the real game pipeline.
import { startStatic, launch, newPage, report, sleep, SHOTS, startLudo } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch();
let ok = true;
for (const players of [2, 4]) {
  const errors = [];
  const { page } = await newPage(browser, { errors, width: 640, height: 360, logs: !!process.env.LOGS });
  await page.goto(url + `?q=low&dyn=0&speed=60&norender=1&scene=meadow`); await page.waitForSelector('.hub');
  await startLudo(page, { players, level: 'normal' });
  const t0 = Date.now(); let st = null;
  for (let i = 0; i < 600; i++) { await sleep(500); st = await page.evaluate(() => ({ phase: window.__ludo.state.phase, rolls: window.__ludo.state.rolls, winner: window.__ludo.state.winner, turnNo: window.__ludo.state.turnNo })); if (st.phase === 'over') break; }
  const done = st.phase === 'over' && st.winner != null;
  console.log(`${done ? '✓' : '✗'} ${players}-player game vs bots finished: winner seat ${st.winner}, ${st.rolls} rolls, ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
  if (!done) ok = false;
  await sleep(1500);
  const win = await page.evaluate(() => !!document.querySelector('#win-card'));
  console.log(`${win ? '✓' : '✗'} win screen with stats is shown`); if (!win) ok = false;
  const stats = await page.evaluate(() => JSON.stringify(window.__ludo.state.stats));
  console.log('   stats', stats.slice(0, 200));
  ok = report(errors, players + 'p') && ok;
  await page.context().close();
}
await browser.close(); srv.close(); console.log(ok ? 'FULL GAME PASSED' : 'FULL GAME FAILED'); process.exit(ok ? 0 : 1);
