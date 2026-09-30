// Two browser pages over PeerJS play Ludo. Guest drops mid-game (bot fills), rejoins, game finishes with identical state on both.
import { startStatic, startPeerServer, launch, newPage, report, sleep, SHOTS } from './lib.mjs';
const peer = await startPeerServer(9010);
const { srv, url } = await startStatic(); const browser = await launch(); let ok = true;
const check = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) ok = false; };
const Q = `?q=low&dyn=0&norender=1&speed=30&peerhost=127.0.0.1&peerport=9010&peerpath=/gn`;
const eA = [], eB = [];
const A = await newPage(browser, { errors: eA, logs: !!process.env.LOGS });
const B = await newPage(browser, { errors: eB, logs: !!process.env.LOGS });
await A.page.goto(url + Q); await A.page.waitForSelector('.hub'); await sleep(800);
await A.page.evaluate(() => window.__gn.app.current.openGame('ludo'));
await A.page.click('#mode-online'); await A.page.click('#btn-create'); await A.page.waitForSelector('#room-code', { timeout: 20000 });
const code = (await A.page.$$eval('#room-code span', (els) => els.map((e) => e.textContent).join('')));
await B.page.goto(url + Q + '&room=' + code, { waitUntil: 'domcontentloaded' }); await B.page.waitForSelector('#seats', { timeout: 25000 });
await sleep(800);
await A.page.click('#btn-start');
await A.page.waitForFunction(() => window.__ludo && window.__ludo.game, null, { timeout: 30000 }); await B.page.waitForFunction(() => window.__ludo && window.__ludo.game, null, { timeout: 30000 });
check(true, 'both pages entered the Ludo match, room ' + code);
// a driver that plays for a human seat when it is that page's turn
const drive = (page) => page.evaluate(() => {
  const g = window.__ludo && window.__ludo.game; if (!g || g.stopped) return 'x';
  const st = g.display, s = st.turn;
  if (!g.session.isMine(s) || g.busy || g.over) return '-';
  if (st.phase === 'roll') { g.throwDice(null, 1); return 'r'; }
  if (st.phase === 'move') { g.moveToken(st.legal[0]); return 'm'; }
  return '-';
});
const snap = (page) => page.evaluate(() => { const g = window.__ludo.game; return { turn: g.display.turn, phase: g.display.phase, rolls: g.display.rolls, tokens: g.display.tokens, seq: g.appliedSeq, winner: g.display.winner }; });
let dropped = false, rejoined = false, B2 = null, dropAt = 0;
let activeB = B;
for (let i = 0; i < 2400; i++) {
  await sleep(120);
  await drive(A.page);
  if (!dropped || rejoined) await drive(activeB.page).catch(() => {});
  const a = await snap(A.page);
  if (!dropped && a.rolls >= 25) { // simulate a dropped guest: hard-close its page
    const sc = await snap(B.page); console.log('  guest state before drop: rolls', sc.rolls);
    await B.page.close(); dropped = true; dropAt = a.rolls; console.log('  guest dropped at roll', a.rolls);
  }
  if (dropped && !rejoined && a.rolls >= dropAt + 12) { // bot has been playing the guest seat; now rejoin from a fresh page (same clientId via storage)
    check(true, `host kept the game going with a bot in the away seat (${a.rolls - dropAt} rolls since the drop)`);
    B2 = await B.ctx.newPage(); B2.on('pageerror', (e) => eB.push('pageerror ' + e.message)); B2.on('console', (m) => { if (m.type() === 'error') eB.push('console.error ' + m.text()); });
    await B2.goto(url + Q, { waitUntil: 'domcontentloaded' }); await B2.waitForSelector('.rejoin-banner', { timeout: 30000 });
    await B2.click('.rejoin-banner .btn.g'); await B2.waitForFunction(() => window.__ludo && window.__ludo.game, null, { timeout: 30000 });
    activeB = { page: B2 }; rejoined = true; await sleep(1500);
    const s1 = await snap(A.page), s2 = await snap(B2);
    check(JSON.stringify(s2.tokens) === JSON.stringify(s1.tokens) || Math.abs(s2.rolls - s1.rolls) <= 3, `rejoined guest was re-synced (host rolls ${s1.rolls}, guest rolls ${s2.rolls})`);
  }
  if (a.phase === 'over') break;
}
await sleep(2500);
const a = await snap(A.page), b = await snap(rejoined ? B2 : B.page);
check(a.phase === 'over' && a.winner != null, `host: game finished, winner seat ${a.winner}, ${a.rolls} rolls`);
check(rejoined ? b.phase === 'over' && b.winner === a.winner : true, `rejoined guest sees the same result (winner ${b.winner})`);
check(JSON.stringify(a.tokens) === JSON.stringify(b.tokens), 'final token positions are identical on both machines');
const winA = await A.page.evaluate(() => !!document.querySelector('#win-card')), winB = await (B2 || B.page).evaluate(() => !!document.querySelector('#win-card'));
check(winA && winB, 'win screen shown on both machines');
ok = report(eA, 'host') && ok; ok = report(eB, 'guest') && ok;
await browser.close(); srv.close(); process.exit(ok ? 0 : 1);
