// Pure-logic proof of the Ludo rules: thousands of bot games, invariants, rule-specific unit checks.
import { newGame, applyRoll, applyMove, legalMoves, checkInvariants, SAFE_ABS, absOf, HOME, TRACK, cellOf, ranking } from '../js/ludo/rules.js';
import { chooseMove } from '../js/ludo/bots.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };

// ---- geometry sanity
ok(TRACK.length === 52 && new Set(TRACK.map((t) => t.join(','))).size === 52, '52 distinct track squares');
let adj = true, diag = 0; for (let i = 0; i < 52; i++) { const a = TRACK[i], b = TRACK[(i + 1) % 52]; const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]); if (d === 2 && Math.abs(a[0] - b[0]) === 1) diag++; else if (d !== 1) adj = false; }
ok(adj && diag === 4, 'track is contiguous all the way round (4 diagonal steps at the inner corners, like a real board)');
ok(TRACK[0].join() === '1,6' && TRACK[13].join() === '8,1' && TRACK[26].join() === '13,8' && TRACK[39].join() === '6,13', 'start squares sit at the four arm entries');

// ---- unit rules
{
  const s = newGame(2); // seats: red, yellow
  ok(legalMoves(s, 0, 5).length === 0, 'no leaving base without a 6');
  ok(legalMoves(s, 0, 6).length === 4, 'a 6 lets any base token leave');
  s.tokens[0] = [50, -1, -1, -1];
  ok(legalMoves(s, 0, 6).includes(0) && legalMoves(s, 0, 6).length === 4, 'token on 50 can move 6 into the lane (56)');
  s.tokens[0] = [52, -1, -1, -1];
  ok(!legalMoves(s, 0, 5).includes(0) && legalMoves(s, 0, 4).includes(0), 'exact roll needed to finish (52+5 overshoots, 52+4 lands home)');
}
{
  const s = newGame(2); s.tokens[0] = [10, -1, -1, -1];
  // three 6s in a row forfeit the turn
  applyRoll(s, 6); applyMove(s, 0);
  ok(s.turn === 0 && s.phase === 'roll', 'a 6 grants an extra turn');
  applyRoll(s, 6); applyMove(s, 0);
  const ev = applyRoll(s, 6);
  ok(ev.some((e) => e.t === 'triple6') && s.turn === 1, 'three 6s in a row lose the turn');
  ok(s.tokens[0][0] === 22, 'the third 6 does not move anything');
}
{
  // capture + extra turn; safe squares protect
  const s = newGame(2); // red seat0, yellow seat1 (color 2)
  s.tokens[0] = [3, -1, -1, -1]; s.tokens[1] = [(1 + 52 - 26) % 52, -1, -1, -1]; // yellow rel p at abs = 26+p
  // put yellow token on abs 6: rel = (6-26+52)%52 = 32
  s.tokens[1] = [32, -1, -1, -1];
  s.turn = 0; applyRoll(s, 3);
  const ev = applyMove(s, 0);
  ok(ev.some((e) => e.t === 'capture' && e.victims.length === 1) && s.tokens[1][0] === -1, 'landing on an enemy token captures it (abs 6)');
  ok(s.turn === 0 && s.phase === 'roll', 'a capture grants an extra turn');
  // star square: abs 8 safe
  const s2 = newGame(2); s2.tokens[0] = [5, -1, -1, -1]; s2.tokens[1] = [(8 - 26 + 52) % 52, -1, -1, -1];
  applyRoll(s2, 3); const ev2 = applyMove(s2, 0);
  ok(!ev2.some((e) => e.t === 'capture') && s2.tokens[1][0] !== -1, 'star squares are safe (no capture on abs 8)');
  // start square safe
  const s3 = newGame(2); s3.tokens[0] = [10, -1, -1, -1]; s3.tokens[1] = [0, -1, -1, -1];
  // yellow start abs 26 = red rel 26
  s3.tokens[0] = [22, -1, -1, -1]; applyRoll(s3, 4); const ev3 = applyMove(s3, 0);
  ok(!ev3.some((e) => e.t === 'capture'), 'start squares are safe');
  // reaching home gives an extra turn and ends the game when all 4 are home
  const s4 = newGame(2); s4.tokens[0] = [56, 56, 56, 52]; applyRoll(s4, 4); const ev4 = applyMove(s4, 3);
  ok(ev4.some((e) => e.t === 'home') && ev4.some((e) => e.t === 'win') && s4.winner === 0 && s4.phase === 'over', 'last token home wins the game');
  const s5 = newGame(2); s5.tokens[0] = [56, 52, -1, -1]; applyRoll(s5, 4); applyMove(s5, 1);
  ok(s5.turn === 0 && s5.phase === 'roll', 'reaching home grants an extra turn');
}

// ---- mass simulation
function playGame(n, levels, rnd, maxTurns = 4000) {
  const s = newGame(n); let steps = 0; const counts = { capture: 0, home: 0, triple6: 0, nomove: 0, six: 0 };
  while (s.phase !== 'over' && steps++ < maxTurns * 3) {
    const v = 1 + Math.floor(rnd() * 6);
    let ev = applyRoll(s, v);
    for (const e of ev) { if (e.t === 'triple6') counts.triple6++; if (e.t === 'nomove') counts.nomove++; }
    if (v === 6) counts.six++;
    if (s.phase === 'move') {
      const tok = chooseMove(s, s.turn, levels[s.turn], rnd);
      ev = applyMove(s, tok);
      for (const e of ev) { if (e.t === 'capture') counts.capture++; if (e.t === 'home') counts.home++; }
    }
    checkInvariants(s);
  }
  return { s, steps, counts };
}
let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
for (const n of [2, 3, 4]) {
  let done = 0, total = 0, maxRolls = 0; const agg = { capture: 0, home: 0, triple6: 0, nomove: 0, six: 0 }; const N = 400;
  for (let g = 0; g < N; g++) { const { s, counts } = playGame(n, Array(n).fill('normal'), rnd); if (s.phase === 'over' && s.winner != null) done++; total += s.rolls; maxRolls = Math.max(maxRolls, s.rolls); for (const k in agg) agg[k] += counts[k]; }
  ok(done === N, `${n}-player: ${N}/${N} bot games end in a winner (avg ${Math.round(total / N)} rolls, max ${maxRolls}; captures/game ${(agg.capture / N).toFixed(1)}, triple-6/game ${(agg.triple6 / N).toFixed(2)})`);
}
// difficulty ordering: hard should beat easy clearly
{
  let hardWins = 0, easyWins = 0; const N = 600;
  for (let g = 0; g < N; g++) { const swap = g % 2; const { s } = playGame(2, swap ? ['easy', 'hard'] : ['hard', 'easy'], rnd); const w = s.winner; if ((w === 0) !== !!swap) hardWins++; else easyWins++; }
  ok(hardWins > easyWins * 1.6, `hard bot beats easy bot ${hardWins}-${easyWins}`);
  let normWins = 0, easy2 = 0;
  for (let g = 0; g < N; g++) { const swap = g % 2; const { s } = playGame(2, swap ? ['easy', 'normal'] : ['normal', 'easy'], rnd); if ((s.winner === 0) !== !!swap) normWins++; else easy2++; }
  ok(normWins > easy2, `normal bot beats easy bot ${normWins}-${easy2}`);
}
console.log(fail ? 'RULES FAILED' : 'RULES PASSED'); process.exit(fail ? 1 : 0);
