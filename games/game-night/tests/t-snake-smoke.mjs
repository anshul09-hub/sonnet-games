import { startStatic, launch, newPage, report, sleep, SHOTS, startGame } from './lib.mjs';
const { srv, url } = await startStatic(); const browser = await launch();
const errors = [];
const { page } = await newPage(browser, { errors, width: +process.env.W || 1280, height: +process.env.H || 720, logs: !!process.env.LOGS, touch: !!process.env.TOUCH });
await page.goto(url + `?q=${process.env.Q || 'low'}&dyn=0&scene=${process.env.SCENE || 'meadow'}&speed=${process.env.SPEED || 1}${process.env.NORENDER ? '&norender=1' : ''}`); await page.waitForSelector('.hub');
await startGame(page, 'snake', { players: +process.env.PLAYERS || 4, level: 'hard' });
if (process.env.AUTO) await page.evaluate(() => window.__snake.autoplay(true));
const shots = (process.env.SHOTS || '5000').split(',').map(Number);
let last = 0;
for (const [i, t] of shots.entries()) { await sleep(t - last); last = t; await page.screenshot({ path: SHOTS + `/snake-${process.env.SCENE || 'meadow'}-${i}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => { if (!window.__snake) return 'NO GAME'; const r = window.__snake.rs; return { ph: r.ph, rd: r.rd, R: r.R, lens: r.s.map((s) => Math.round(s.len)), alive: r.s.map((s) => s.alive), orbs: r.o.length }; })));
report(errors, 'snake smoke'); await browser.close(); srv.close();
