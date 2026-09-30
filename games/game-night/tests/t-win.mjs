// Win podium screenshot: SCENE, DANCE
import { startStatic, launch, newPage, report, sleep, SHOTS, startLudo } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const errors = [];
const { page } = await newPage(browser, { errors, width: 1280, height: 720 });
await page.goto(url + `?q=${process.env.Q || 'medium'}&dyn=0&scene=${process.env.SCENE || 'meadow'}&norender=1`); await page.waitForSelector('.hub');
await startLudo(page, { players: 4, level: 'hard', look: { dance: process.env.DANCE || 'herospin' } });
await page.evaluate(() => { window.__ludo.setSpeed(20); window.__ludo.autoplay(true); window.__ludo.setup({ tokens: [[56, 56, 56, 52], [30, 20, 10, -1], [50, 40, 30, 5], [56, 30, 20, 10]], turn: 0 }); window.__ludo.forceNext(4); });
for (let i = 0; i < 200; i++) { await sleep(200); if (await page.evaluate(() => !!document.querySelector('#win-card'))) break; }
await page.evaluate(() => window.__ludo.setSpeed(1)); await sleep(2500);
await page.evaluate(() => { window.__ludo.game.freeze = true; }); await sleep(1500);
for (let k = 0; k < 3; k++) { await page.evaluate(() => window.__gn.renderNow()); await sleep(200); }
await page.screenshot({ path: SHOTS + `/win-${process.env.SCENE || 'meadow'}.png` });
ok = report(errors, 'win') && ok; await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
