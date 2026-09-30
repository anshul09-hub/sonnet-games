// Hub UI on desktop + phone-portrait, local & bot flows, settings, customize screen.
import { startStatic, launch, newPage, report, sleep, SHOTS } from './harness.mjs';
const { srv, url } = await startStatic();
const browser = await launch();
let ok = true; const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
// ---- phone portrait
{
  const errors = [];
  const { page } = await newPage(browser, { errors, width: 390, height: 844, dpr: 1, touch: true });
  await page.goto(url + '?q=low&dyn=0'); await page.waitForSelector('.hub'); await sleep(3000);
  await page.screenshot({ path: SHOTS + '/hub-mobile.png' });
  check(await page.$eval('#hub-nav', (e) => getComputedStyle(e).display !== 'none'), 'portrait shows PLAY/nav buttons');
  await page.click('#btn-play'); await page.waitForSelector('.gamesheet'); await sleep(500);
  await page.screenshot({ path: SHOTS + '/mode-mobile.png' });
  await page.click('#mode-bot'); await page.waitForSelector('#btn-start-bots');
  await page.click('#lvl-hard'); await page.screenshot({ path: SHOTS + '/bots-mobile.png' });
  await page.click('#btn-start-bots'); await page.waitForFunction(() => (window.__snake || window.__ludo || window.__brawl), null, { timeout: 150000 });
  const cfg = await page.evaluate(() => (window.__snake || window.__ludo || window.__brawl).game.session.cfg);
  check(cfg.seats.length === 4 && cfg.seats.filter((s) => s.kind === 'bot').length === 3 && cfg.seats[1].level === 'hard', 'vs-bots session: 1 human + 3 hard bots');
  ok = report(errors, 'phone') && ok;
  await page.context().close();
}
// ---- desktop
{
  const errors = [];
  const { page } = await newPage(browser, { errors, width: 1280, height: 720 });
  await page.goto(url + '?q=low&dyn=0&norender=1'); await page.waitForSelector('.hub'); await sleep(800);
  await page.evaluate(() => window.__gn.app.current.openGame('snake'));
  await page.click('#mode-local'); await page.waitForSelector('#btn-start-local');
  await page.screenshot({ path: SHOTS + '/local-setup.png' });
  await page.click('#btn-start-local'); await page.waitForFunction(() => window.__snake && window.__snake.game, null, { timeout: 150000 });
  const cfg = await page.evaluate(() => window.__snake.game.session.cfg);
  check(cfg.game === 'snake' && cfg.seats.length === 2 && cfg.seats.every((s) => s.kind === 'human'), 'local session: 2 humans');
  await page.evaluate(() => window.__gn.app.exitToHub(window.__snake.game.session)); await page.waitForSelector('.hub');
  // settings + quality
  await page.click('button[aria-label=Settings]'); await page.waitForSelector('.sheet');
  await page.click('text=Medium'); const lvl = await page.evaluate(() => window.__gn.engine.level);
  check(lvl === 'medium', 'graphics setting switches to medium'); await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('.sheet-back .x')?.click());
  // customize screen
  await page.click('#btn-customize'); await page.waitForSelector('.cz-panel'); await sleep(500);
  const tiles = await page.$$eval('#cz-grid .tile', (t) => t.length);
  check(tiles === 24, 'token grid lists 24 skins: ' + tiles);
  for (const cat of ['scene', 'dice', 'finisher', 'dance', 'trail', 'sound', 'frame']) { await page.click('#tab-' + cat); const n = await page.$$eval('#cz-grid .tile', (t) => t.length); console.log('   ', cat, n, 'items'); if (n < 8) ok = false; }
  await page.click('#tab-frame'); await page.screenshot({ path: SHOTS + '/customize-stage1.png' });
  await page.click('#cz-back'); await page.waitForSelector('.hub');
  ok = report(errors, 'desktop') && ok;
}
await browser.close(); srv.close();
console.log(ok ? 'UI TEST PASSED' : 'UI TEST FAILED'); process.exit(ok ? 0 : 1);
