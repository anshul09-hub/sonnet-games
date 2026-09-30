// Two browser pages: create a room in A, join from B, start, drop B, bot fills the seat, B rejoins with the same code.
import { startStatic, startPeerServer, launch, newPage, report, sleep, SHOTS } from './harness.mjs';
import fs from 'node:fs';
fs.mkdirSync(SHOTS, { recursive: true });
const peer = await startPeerServer(9000);
const { srv, url } = await startStatic();
const browser = await launch();
const Q = `?q=low&dyn=0&norender=1&peerhost=127.0.0.1&peerport=9000&peerpath=/gn`;
const eA = [], eB = [];
const A = await newPage(browser, { errors: eA, logs: !!process.env.LOGS });
const B = await newPage(browser, { errors: eB, logs: !!process.env.LOGS, touch: true, width: 420, height: 860, dpr: 2 });
let ok = true; const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
await A.page.goto(url + Q); await A.page.waitForSelector('.hub');
await sleep(1500);
// A: open Ludo -> Online -> Create
await A.page.evaluate(() => window.__gn.app.current.openGame('ludo'));
await A.page.click('#mode-online'); await A.page.click('#btn-create');
await A.page.waitForSelector('#room-code', { timeout: 20000 });
const code = (await A.page.$$eval('#room-code span', (els) => els.map((e) => e.textContent).join('')));
check(/^[A-Z]{4}$/.test(code), 'host got a 4-letter code: ' + code);
const link = await A.page.textContent('#room-link');
check(link.includes('?room=' + code), 'share link contains the code: ' + link);
// B joins through the link (deep link) on a phone-sized viewport
await B.page.goto(url + Q + '&room=' + code, { waitUntil: 'domcontentloaded' });
await B.page.waitForSelector('#seats', { timeout: 25000 });
await sleep(800);
const seatsA = await A.page.$$eval('#seats .seat', (els) => els.map((e) => e.className + '|' + e.textContent));
const seatsB = await B.page.$$eval('#seats .seat', (els) => els.map((e) => e.textContent));
check(seatsA[1] && !seatsA[1].includes('open'), 'host lobby shows guest in seat 2');
check(seatsB.length === 4, 'guest lobby shows 4 seats');
await B.page.screenshot({ path: SHOTS + '/lobby-mobile.png' });
await A.page.screenshot({ path: SHOTS + '/lobby-host.png' });
// host adds a bot and starts
const startDis = await A.page.$eval('#btn-start', (b) => b.disabled);
check(!startDis, 'start enabled with 2 humans');
await A.page.click('#btn-start');
await A.page.waitForSelector('#stub', { timeout: 20000 }); await B.page.waitForSelector('#stub', { timeout: 20000 });
await sleep(1500);
const tA = await A.page.evaluate(() => window.__stub.tick), tB = await B.page.evaluate(() => window.__stub.tick);
check(tB > 0 && Math.abs(tA - tB) < 12, `guest receives host ticks (host ${tA}, guest ${tB})`);
const inputs = await A.page.evaluate(() => window.__stub.inputs);
check(inputs > 0, 'host receives guest inputs: ' + inputs);
// drop B: close its page connection by killing the page (simulates network loss)
const clientId = await B.page.evaluate(() => JSON.parse(localStorage.getItem('gn.clientId')));
await B.page.close();
const tDrop = Date.now();
let away = [];
for (let i = 0; i < 60; i++) { away = await A.page.evaluate(() => [0, 1].map((k) => window.__stub.session.botControlled(k))); if (away[1]) break; await sleep(500); }
console.log('  (drop detected after ' + ((Date.now() - tDrop) / 1000).toFixed(1) + 's)');
check(away[1] === true && away[0] === false, 'bot takes the dropped guest seat: ' + JSON.stringify(away));
// rejoin in a new page of the same context (same localStorage => same clientId) -> use context of B
const B2 = await B.ctx.newPage();
B2.on('pageerror', (e) => eB.push('pageerror ' + e.message)); B2.on('console', (m) => { if (m.type() === 'error') eB.push('console.error ' + m.text()); });
await B2.goto(url + Q); await B2.waitForSelector('.rejoin-banner', { timeout: 20000 });
check(true, 'rejoin banner is offered');
await B2.click('.rejoin-banner .btn.g');
await B2.waitForSelector('#stub', { timeout: 25000 });
await sleep(1500);
const back = await A.page.evaluate(() => [0, 1].map((k) => window.__stub.session.botControlled(k)));
check(back[1] === false, 'seat handed back to the human after rejoin');
const tick2 = await B2.evaluate(() => window.__stub.tick);
check(tick2 > tA, 'rejoined guest is receiving state again (tick ' + tick2 + ')');
await B2.screenshot({ path: SHOTS + '/rejoin.png' });
ok = report(eA, 'host page') && ok; ok = report(eB, 'guest page') && ok;
await browser.close(); srv.close(); peer.close?.();
console.log(ok ? 'NET TEST PASSED' : 'NET TEST FAILED');
process.exit(ok ? 0 : 1);
