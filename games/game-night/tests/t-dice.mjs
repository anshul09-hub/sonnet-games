// Node test for the physics dice: fairness, settling, forced results, wire format.
import RAPIER from '@dimforge/rapier3d-compat';
import { DiceSim, upFace, packThrow, unpackThrow, rotate } from '../js/ludo/dice-sim.js';
import { mulberry32 } from '../js/core/util.js';
let fail = 0; const ok = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (!c) fail++; };
await RAPIER.init();
const sim = new DiceSim(RAPIER);
const rnd = mulberry32(7);
// rotation helper sanity: 90deg about z maps +x to +y
const s2 = Math.SQRT1_2; const r = rotate({ x: 0, y: 0, z: s2, w: s2 }, [1, 0, 0]);
ok(Math.abs(r[0]) < 1e-9 && Math.abs(r[1] - 1) < 1e-9, 'quaternion rotation helper is correct');
ok(upFace({ x: 0, y: 0, z: 0, w: 1 }).value === 1, 'identity orientation shows face 1');
const counts = [0, 0, 0, 0, 0, 0, 0]; let frames = 0, maxF = 0, bad = 0, minNy = 1, t0 = performance.now(), N = 600, hitsTotal = 0;
for (let i = 0; i < N; i++) {
  const res = sim.throwDie(sim.randomThrow(rnd));
  counts[res.value]++; frames += res.n; maxF = Math.max(maxF, res.n); hitsTotal += res.hits.length;
  const l = res.frames.length - 7; const fin = upFace({ x: res.frames[l + 3], y: res.frames[l + 4], z: res.frames[l + 5], w: res.frames[l + 6] });
  minNy = Math.min(minNy, fin.ny); if (fin.ny < 0.98 || res.frames.some((v) => !Number.isFinite(v)) || Math.abs(res.frames[l + 1] - 0.5) > 0.08) bad++;
}
const ms = (performance.now() - t0) / N;
ok(bad === 0, `all ${N} throws end flat on the tray floor with finite numbers (min top-face alignment ${minNy.toFixed(4)})`);
const exp = N / 6, chi = counts.slice(1).reduce((a, c) => a + (c - exp) ** 2 / exp, 0);
ok(chi < 20.5, `result distribution is fair: ${counts.slice(1).join('/')} (chi2=${chi.toFixed(1)}, 99.9% limit 20.5)`);
ok(maxF < 421 && frames / N > 60, `settles in ${(frames / N / 60).toFixed(1)}s on average (max ${(maxF / 60).toFixed(1)}s); ${(hitsTotal / N).toFixed(1)} impacts/throw`);
console.log(`   simulation cost ${ms.toFixed(2)} ms per throw`);
for (const target of [1, 2, 3, 4, 5, 6]) { const res = sim.throwForcing(target, rnd); ok(res.value === target, `forced physical throw lands on ${target}`); }
const res = sim.throwDie(sim.randomThrow(rnd)); const pk = packThrow(res); const json = JSON.stringify(pk); const un = unpackThrow(JSON.parse(json));
ok(un.value === res.value && un.n === res.n, `wire format round-trips (${(json.length / 1024).toFixed(1)} KB JSON for ${res.n} frames)`);
const lu = un.frames.length - 7; ok(upFace({ x: un.frames[lu + 3], y: un.frames[lu + 4], z: un.frames[lu + 5], w: un.frames[lu + 6] }).value === res.value, 'unpacked replay ends on the same face');
console.log(fail ? 'DICE FAILED' : 'DICE PASSED'); process.exit(fail ? 1 : 0);
