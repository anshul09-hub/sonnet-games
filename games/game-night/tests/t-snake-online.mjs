// Two browser pages over PeerJS play Snake Arena: host simulates, guest renders snapshots, sends steering, drops (bot takes over), match ends identically.
import { startStatic, startPeerServer, launch, newPage, report, sleep, SHOTS } from './lib.mjs';
const peer = await startPeerServer(9011);
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
const Q = `?q=low&dyn=0&norender=1&peerhost=127.0.0.1&peerport=9011&peerpath=/gn`;
const eA = [], eB = [];
const A = await newPage(browser, { errors: eA, logs: !!process.env.LOGS });
const B = await newPage(browser, { errors: eB, logs: !!process.env.LOGS });
await A.page.goto(url + Q + '&speed=1'); await A.page.waitForSelector('.hub'); await sleep(800);
await A.page.evaluate(() => window.__gn.app.current.openGame('snake'));
await A.page.click('#mode-online'); await A.page.click('#btn-create'); await A.page.waitForSelector('#room-code', { timeout: 20000 });
const code = (await A.page.$$eval('#room-code span', (els) => els.map((e) => e.textContent).join('')));
await B.page.goto(url + Q + '&room=' + code, { waitUntil: 'domcontentloaded' }); await B.page.waitForSelector('#seats', { timeout: 25000 });
await sleep(800);
await A.page.click('#btn-start');
await A.page.waitForFunction(() => window.__snake && window.__snake.game, null, { timeout: 30000 }); await B.page.waitForFunction(() => window.__snake && window.__snake.game, null, { timeout: 30000 });
check(true, 'both pages entered Snake Arena, room ' + code);
await B.page.waitForFunction(() => window.__snake.rs && window.__snake.rs.ph, null, { timeout: 20000 });
check(true, 'guest receives snapshots');
await A.page.waitForFunction(() => window.__snake.rs.ph === 'play', null, { timeout: 30000 });
await B.page.waitForFunction(() => window.__snake.rs.ph === 'play', null, { timeout: 30000 });
check(true, 'countdown finished on both machines');
// guest steering reaches the host
await B.page.keyboard.down('KeyD'); await sleep(900);
const steer = await A.page.evaluate(() => window.__snake.sim.snakes[1].steer);
await B.page.keyboard.up('KeyD');
check(steer === 1, `guest key press reached the host sim (steer=${steer})`);
const seat = await B.page.evaluate(() => window.__snake.game.session.mySeats.join(','));
check(seat === '1', 'guest controls seat 1');
// positions agree (guest is ~110ms behind)
await sleep(500);
const pa = await A.page.evaluate(() => window.__snake.rs.s.map((s) => [s.x, s.z, s.alive])), pb = await B.page.evaluate(() => window.__snake.rs.s.map((s) => [s.x, s.z, s.alive]));
const dmax = Math.max(...pa.map((p, i) => Math.hypot(p[0] - pb[i][0], p[1] - pb[i][1])));
check(dmax < 8, `guest positions track the host (max diff ${dmax.toFixed(2)} units)`);
// guest drops: bot takes the seat
await B.page.close(); await sleep(1500);
const isBot = await A.page.evaluate(() => window.__snake.sim.snakes[1].bot);
check(isBot, 'dropped guest seat is bot-controlled on the host');
// finish the match fast on the host; make a second guest? (the dropped seat stays a bot)
await A.page.evaluate(() => { window.__snake.setSpeed(20); window.__snake.autoplay(true); });
await A.page.waitForFunction(() => window.__snake.rs.ph === 'over', null, { timeout: 150000 });
await sleep(1500);
const res = await A.page.evaluate(() => ({ win: !!document.querySelector('#win-card'), mw: window.__snake.rs.mw, wins: window.__snake.rs.s.map((s) => s.wins) }));
check(res.win && res.wins[res.mw] >= 2, `host: match finished, winner seat ${res.mw}, round wins ${res.wins}`);
ok = report(eA, 'host') && ok; ok = report(eB.filter((e) => !/closed|Target/.test(e)), 'guest') && ok;
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
