// orbit screenshot of a scene inside the customize preview
import { startStatic, launch, newPage, report, sleep, SHOTS } from '/home/user/sonnet-games/games/game-night/tests/lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const errors = [];
const { page } = await newPage(browser, { errors, width: 1280, height: 720 });
for (const id of (process.env.IDS || 'neon').split(',')) {
  await page.goto(url + `?q=high&dyn=0&norender=1&screen=customize`); await page.waitForSelector('.cz-panel', { timeout: 30000 });
  await page.evaluate((id) => { window.__gn.profile.setLook('scene', id); }, id);
  await page.click('#tab-scene'); await page.click(`#cz-grid .tile[data-id="${id}"]`);
  await sleep(9000);
  for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__gn.renderNow()); await sleep(200); }
  await page.screenshot({ path: SHOTS + `/orbit-${id}.png` });
  console.log('shot', id);
}
ok = report(errors, 'orbit'); await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
