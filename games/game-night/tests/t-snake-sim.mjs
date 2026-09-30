import { SnakeSim, CFG } from '../js/snake/snake-sim.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
function playMatch(levels, seed) {
  const sim = new SnakeSim(levels.map((l) => ({ kind: 'bot', level: l })), seed);
  let t = 0; const stats = { rounds: 0, deaths: { edge: 0, body: 0, head: 0 }, eats: 0 };
  while (sim.phase !== 'over' && t < 900) {
    sim.step(1 / 60); t += 1 / 60;
    for (const e of sim.drainEvents()) { if (e.k === 'die') stats.deaths[e.why]++; if (e.k === 'eat') stats.eats++; if (e.k === 'roundend') stats.rounds++; }
    for (const s of sim.snakes) if (![s.x, s.z, s.ang, s.len].every(Number.isFinite)) throw new Error('NaN in snake');
  }
  return { sim, t, stats };
}
let done = 0, N = 30, totalT = 0, rounds = 0, eats = 0; const deaths = { edge: 0, body: 0, head: 0 };
for (let i = 0; i < N; i++) { const { sim, t, stats } = playMatch(['hard', 'normal', 'normal', 'easy'].slice(0, 2 + (i % 3)), 100 + i); if (sim.phase === 'over' && sim.matchWinner != null) done++; totalT += t; rounds += stats.rounds; eats += stats.eats; for (const k in deaths) deaths[k] += stats.deaths[k]; }
ok(done === N, `${N}/${N} bot matches end with a match winner (avg ${(totalT / N).toFixed(0)}s, ${(rounds / N).toFixed(1)} rounds, ${(eats / N).toFixed(0)} orbs eaten; deaths ${JSON.stringify(deaths)})`);
// best-of-3: winner needs exactly 2 round wins
{ const { sim } = playMatch(['hard', 'normal'], 7); ok(sim.snakes[sim.matchWinner].wins === CFG.WINS_NEEDED, 'match winner has 2 round wins (best of 3)'); }
// difficulty: hard should beat easy
{ let hw = 0, ew = 0; for (let i = 0; i < 40; i++) { const sw = i % 2; const lv = sw ? ['easy', 'hard'] : ['hard', 'easy']; const { sim } = playMatch(lv, 500 + i); const w = sim.matchWinner; if (w != null && lv[w] === 'hard') hw++; else ew++; } ok(hw > ew, `hard bots beat easy bots ${hw}-${ew}`); }
// snapshot is small
{ const sim = new SnakeSim([{ kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }, { kind: 'bot' }], 3); for (let i = 0; i < 1200; i++) sim.step(1 / 60); const js = JSON.stringify(sim.snapshot()); ok(js.length < 16000, `4-snake snapshot after 20s is ${(js.length / 1024).toFixed(1)} KB JSON`); }
console.log(fail ? 'SNAKE SIM FAILED' : 'SNAKE SIM PASSED'); process.exit(fail ? 1 : 0);
