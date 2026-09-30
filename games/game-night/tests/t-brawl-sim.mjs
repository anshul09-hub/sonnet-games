// Node test for the Brawl simulation: real Rapier world, bots fight to the KO target, props break, barrels explode.
import RAPIER from '@dimforge/rapier3d-compat';
import { BrawlSim, CFG, generateMap } from '../js/brawl/brawl-sim.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
await RAPIER.init();
const M = generateMap(5), M2 = generateMap(5), M3 = generateMap(6);
ok(JSON.stringify(M) === JSON.stringify(M2) && JSON.stringify(M) !== JSON.stringify(M3), `map is deterministic per seed (${M.walls.length} walls, ${M.crates.length} crates, ${M.barrels.length} barrels)`);
const finite = (v) => Number.isFinite(v);
function play(levels, seed, maxT = 400) {
  const sim = new BrawlSim(RAPIER, levels.map((l) => ({ kind: 'bot', level: l })), seed);
  const st = { shots: 0, hits: 0, ko: 0, boom: 0, breaks: { crate: 0, barrel: 0, wall: 0 }, pick: 0, dash: 0, spawn: 0, bad: 0 }; const t0 = performance.now();
  let steps = 0;
  while (sim.phase !== 'over' && sim.time < maxT) {
    sim.step(1 / 60); steps++;
    for (const e of sim.drainEvents()) { if (e.k === 'shot') st.shots++; else if (e.k === 'hit') st.hits++; else if (e.k === 'ko') st.ko++; else if (e.k === 'boom') st.boom++; else if (e.k === 'break') st.breaks[e.kind]++; else if (e.k === 'pickup') st.pick++; else if (e.k === 'dash') st.dash++; else if (e.k === 'spawn') st.spawn++; }
    if (steps % 60 === 0) for (const p of sim.players) if (!finite(p.x) || !finite(p.z) || Math.abs(p.x) > CFG.HX + 1 || Math.abs(p.z) > CFG.HZ + 1) { st.bad++; if (st.bad < 4) console.log('   bad player', p.id, p.x, p.z, p.alive, sim.time.toFixed(1)); }
  }
  return { sim, st, ms: performance.now() - t0, steps };
}
{
  const { sim, st, ms, steps } = play(['hard', 'hard', 'hard', 'hard'], 3);
  ok(sim.phase === 'over' && sim.winner != null, `4 hard bots finished: winner ${sim.winner}, KOs ${sim.players.map((p) => p.kos)}, ${sim.time.toFixed(0)}s of game time`);
  ok(Math.max(...sim.players.map((p) => p.kos)) >= CFG.KO_TARGET || sim.time >= CFG.TIME_LIMIT, 'winner reached the KO target (or time limit)');
  ok(st.bad === 0, 'no player ever left the arena or went NaN');
  ok(st.shots > 100 && st.hits > 30, `combat happened: ${st.shots} shots, ${st.hits} hits, ${st.ko} KOs, ${st.dash} dashes`);
  console.log(`   props: crates broken ${st.breaks.crate}, barrels ${st.breaks.barrel}, walls ${st.breaks.wall}, explosions ${st.boom}, pickups ${st.pick}, respawns ${st.spawn}`);
  ok(st.breaks.crate + st.breaks.barrel + st.breaks.wall > 0, 'destructible props were destroyed');
  ok(steps / (ms / 1000) > 300, `simulation speed ${(steps / (ms / 1000) / 60).toFixed(0)}x realtime`);
  const s = JSON.stringify(sim.snapshot()); ok(s.length < 12000, `snapshot is ${(s.length / 1024).toFixed(1)} KB`);
}
{
  let hard = 0, easy = 0; for (let g = 0; g < 8; g++) { const { sim } = play(['hard', 'easy'], 20 + g, 200); const w = sim.players.reduce((a, b) => (b.kos > a.kos ? b : a)).id; if (w === 0) hard++; else easy++; }
  ok(hard > easy, `hard bots beat easy bots ${hard}-${easy}`);
}
// scripted checks: explosive barrel chain + knockback, crate physics, shield, power-up
{
  const sim = new BrawlSim(RAPIER, [{ kind: 'human' }, { kind: 'human' }], 9);
  for (let i = 0; i < 200; i++) sim.step(1 / 60);
  ok(sim.phase === 'play', 'countdown ends and play starts');
  const barrel = [...sim.props.values()].find((e) => e.kind === 'barrel' && e.alive); const bt = barrel.body.translation();
  const p1 = sim.players[1]; p1.body.setTranslation({ x: bt.x + 1.6, y: 0.9, z: bt.z }, true); p1.invuln = 0; sim.step(1 / 60);
  sim.explode(bt.x, bt.z, CFG.BARREL_BLAST, CFG.BARREL_DMG, 0, 'barrel'); sim.killProp(barrel, 0);
  for (let i = 0; i < 20; i++) sim.step(1 / 60);
  ok(p1.hp < CFG.HP || !p1.alive, `barrel blast hurt a nearby player (hp ${p1.hp})`);
  const moved = Math.hypot(p1.x - (bt.x + 1.6), p1.z - bt.z); ok(moved > 0.4, `explosion knocked the player back ${moved.toFixed(2)} m`);
  const crate = [...sim.props.values()].find((e) => e.kind === 'crate' && e.alive); const c0 = crate.body.translation(); crate.body.applyImpulse({ x: 6 * crate.body.mass(), y: 0, z: 0 }, true);
  for (let i = 0; i < 30; i++) sim.step(1 / 60); const c1 = crate.body.translation();
  ok(Math.hypot(c1.x - c0.x, c1.z - c0.z) > 0.5, 'crates are real physics bodies (pushed by impulse)');
  const p0 = sim.players[0]; p0.shield = 5; const hp0 = p0.hp; sim.damage(p0, 50, 1, p0.x, p0.z, 0, 0); ok(p0.hp === hp0, 'shield absorbs damage');
  p0.shield = 0; p0.invuln = 0; sim.applyPickup(p0, { kind: 'rocket', x: 0, z: 0, id: 99 }); ok(p0.weapon === 'rocket' && p0.ammo === 4, 'rocket pickup arms 4 rockets');
  p0.input = { mx: 0, mz: 0, aim: 0, fire: true, dash: false }; p0.cd = 0; sim.step(1 / 60); ok(sim.bullets.some((b) => b.w === 'rocket'), 'firing launches a rocket');
  const hpBefore = p1.hp; sim.damage(p1, 999, 0, p1.x, p1.z, 3, 0); ok(!p1.alive && p0.kos >= 1, 'a lethal hit KOs the player and credits the killer');
  for (let i = 0; i < 200; i++) sim.step(1 / 60); ok(p1.alive, 'KO\'d player respawns after a moment');
}
console.log(fail ? `BRAWL SIM FAILED (${fail})` : 'BRAWL SIM PASSED'); process.exit(fail ? 1 : 0);
