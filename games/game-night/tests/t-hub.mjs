import { startStatic, launch, newPage, report, sleep, SHOTS } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(SHOTS, { recursive: true });
const { srv, url } = await startStatic();
const browser = await launch();
const errors = [];
const { page } = await newPage(browser, { errors, logs: !!process.env.LOGS });
await page.goto(url + '?q=' + (process.env.Q || 'medium') + '&dyn=0', { waitUntil: 'load' });
await page.waitForSelector('.hub', { timeout: 30000 });
await sleep(2500);
await page.screenshot({ path: SHOTS + '/hub.png' });
// hover the middle card
await page.mouse.move(640, 380); await sleep(1200);
await page.screenshot({ path: SHOTS + '/hub-hover.png' });
report(errors, 'hub');
await browser.close(); srv.close();
