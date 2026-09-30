// Full-quality screenshots of the Ludo board in each world at rest (camera settled): SCENES=meadow,neon,circuit
import { startStatic, launch, newPage, report, sleep, SHOTS, startLudo } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
for (const scene of (process.env.SCENES || 'meadow').split(',')) {
  const errors = [];
  const { page } = await newPage(browser, { errors, width: +process.env.W || 1280, height: +process.env.H || 720, dpr: +process.env.DPR || 1, touch: !!process.env.TOUCH });
  await page.goto(url + `?q=${process.env.Q || 'high'}&dyn=0&scene=${scene}&norender=1`); await page.waitForSelector('.hub');
  await startLudo(page, { players: +process.env.PLAYERS || 4, level: 'normal' });
  // play a few turns quickly so tokens are out, then freeze the clock
  await page.evaluate(() => { window.__ludo.setSpeed(20); window.__ludo.autoplay(true); });
  const turns = +process.env.TURNS || 40;
  for (let i = 0; i < 200; i++) { await sleep(150); const r = await page.evaluate(() => window.__ludo.state.rolls); if (r >= turns) break; }
  await page.evaluate(() => { window.__ludo.autoplay(false); window.__ludo.setSpeed(1); });
  await sleep(7000); // let the current animations finish, camera settle
  await page.evaluate(() => { window.__ludo.game.freeze = true; });
  await sleep(1500);
  for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__gn.renderNow()); await sleep(200); }
  await page.screenshot({ path: SHOTS + `/world-${scene}${process.env.SUFFIX || ''}.png` });
  ok = report(errors, scene) && ok; await page.context().close();
}
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
