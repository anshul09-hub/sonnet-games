// Snake Arena simulation (pure, no DOM/three): runs on the host, bots included. Deterministic given the seed.
import { Rng, clamp, wrapAngle } from '../core/util.js';

export const CFG = {
  R0: 30, RMIN: 10, SHRINK_AFTER: 34, SHRINK_TIME: 48,
  SPEED: 7.2, BOOST_SPEED: 12.5, TURN: 3.6, BOOST_TURN: 2.5, SPACING: 0.56, START_LEN: 9, MIN_LEN: 5,
  HEAD_R: 0.5, SEG_R: 0.42, EAT_R: 1.0, BOOST_COST: 1.15, // segments per second while boosting
  ORBS: 46, COUNTDOWN: 3, ROUND_END: 2.6, WINS_NEEDED: 2,
};

export const COLORS = [0xff4d6d, 0x3ddc6a, 0xffd23f, 0x3aa0ff]; // fall-back player colours

export class SnakeSim {
  /** players: [{kind:'human'|'bot', level}] */
  constructor(players, seed = 1) {
    this.rng = new Rng(seed); this.n = players.length;
    this.snakes = players.map((p, i) => ({ id: i, bot: p.kind === 'bot', level: p.level || 'normal', alive: true, x: 0, z: 0, ang: 0, len: CFG.START_LEN, boost: false, steer: 0, tgt: null, want: false, trail: [], wins: 0, kills: 0, score: 0, botT: 0, botAng: 0, dieT: 0, peak: 0 }));
    this.orbs = []; this.nextOrb = 1; this.events = [];
    this.round = 0; this.phase = 'countdown'; this.phaseT = CFG.COUNTDOWN; this.time = 0; this.R = CFG.R0; this.matchWinner = null; this.roundWinner = null;
    this.startRound();
  }

  startRound() {
    this.round++; this.time = 0; this.R = CFG.R0; this.phase = 'countdown'; this.phaseT = CFG.COUNTDOWN; this.orbs.length = 0; this.roundWinner = null;
    const n = this.n;
    this.snakes.forEach((s, i) => {
      const a = (i / n) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : Math.PI / 4), r = CFG.R0 * 0.62;
      s.alive = true; s.x = Math.cos(a) * r; s.z = Math.sin(a) * r; s.ang = a + Math.PI; s.len = CFG.START_LEN; s.boost = false; s.steer = 0; s.tgt = null; s.dieT = 0;
      s.trail = []; for (let k = 0; k < 90; k++) s.trail.push({ x: s.x - Math.cos(s.ang) * k * 0.2, z: s.z - Math.sin(s.ang) * k * 0.2 });
      s.acc = 0; s.peak = s.len;
    });
    for (let i = 0; i < CFG.ORBS; i++) this.spawnOrb();
    this.events.push({ k: 'round', round: this.round });
  }

  spawnOrb(x = null, z = null, val = null, hidden = 0) {
    const big = val == null && this.rng.chance(0.08);
    let px = x, pz = z;
    if (px == null) { for (let t = 0; t < 12; t++) { const a = this.rng.next() * Math.PI * 2, r = Math.sqrt(this.rng.next()) * (this.R - 2.5); px = Math.cos(a) * r; pz = Math.sin(a) * r; if (!this.snakes.some((s) => s.alive && Math.hypot(s.x - px, s.z - pz) < 2.5)) break; } }
    const o = { id: this.nextOrb++, x: px, z: pz, v: val ?? (big ? 1.6 : 0.4), big: big && val == null, hue: this.rng.int(0, 5), t0: this.time + hidden };
    this.orbs.push(o); return o;
  }

  setInput(i, { steer = 0, tgt = null, boost = false }) { const s = this.snakes[i]; if (!s || s.bot) return; s.steer = clamp(steer, -1, 1); s.tgt = tgt; s.want = !!boost; }

  // ---------------------------------------------------------------- body geometry
  segments(s) {
    // body points spaced CFG.SPACING along the head trail (trail points are ~0.2 apart)
    const out = [{ x: s.x, z: s.z }], step = Math.max(1, Math.round(CFG.SPACING / 0.2)), n = Math.floor(s.len);
    for (let k = 1; k <= n; k++) { const p = s.trail[Math.min(s.trail.length - 1, k * step)]; if (p) out.push(p); }
    return out;
  }

  // ---------------------------------------------------------------- update
  step(dt) {
    this.time += dt;
    if (this.phase === 'countdown') { this.phaseT -= dt; if (this.phaseT <= 0) { this.phase = 'play'; this.events.push({ k: 'go' }); } this.botsThink(dt); return; }
    if (this.phase === 'roundend') { this.phaseT -= dt; if (this.phaseT <= 0) { if (this.matchWinner != null) { this.phase = 'over'; this.events.push({ k: 'over', winner: this.matchWinner }); } else this.startRound(); } return; }
    if (this.phase !== 'play') return;
    // arena shrink (sudden death)
    if (this.time > CFG.SHRINK_AFTER) this.R = Math.max(CFG.RMIN, CFG.R0 - (CFG.R0 - CFG.RMIN) * ((this.time - CFG.SHRINK_AFTER) / CFG.SHRINK_TIME));
    this.botsThink(dt);
    for (const s of this.snakes) if (s.alive) this.move(s, dt);
    for (const s of this.snakes) if (s.alive) this.collide(s);
    // orbs pickup
    for (const s of this.snakes) if (s.alive) for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]; if (o.t0 > this.time) continue;
      if (Math.hypot(o.x - s.x, o.z - s.z) < CFG.EAT_R + (o.big ? 0.3 : 0)) { s.len += o.v; s.peak = Math.max(s.peak, s.len); s.score += o.v; this.orbs.splice(i, 1); this.events.push({ k: 'eat', id: o.id, s: s.id, big: o.big }); }
    }
    while (this.orbs.length < CFG.ORBS - Math.floor((CFG.R0 - this.R) * 1.2)) this.spawnOrb();
    // magnetism toward the arena when shrinking removes orbs outside
    for (let i = this.orbs.length - 1; i >= 0; i--) if (Math.hypot(this.orbs[i].x, this.orbs[i].z) > this.R - 0.6) { this.events.push({ k: 'drop', id: this.orbs[i].id }); this.orbs.splice(i, 1); }
    // round end
    const alive = this.snakes.filter((s) => s.alive);
    if (alive.length <= 1 && this.n > 1) this.endRound(alive[0] || null);
  }

  move(s, dt) {
    // steering: absolute target angle (touch stick) or axis (keys)
    const turn = s.boost ? CFG.BOOST_TURN : CFG.TURN;
    if (s.tgt != null) { const d = wrapAngle(s.tgt - s.ang); s.ang += clamp(d, -turn * dt, turn * dt); }
    else s.ang += s.steer * turn * dt;
    s.boost = s.want && s.len > CFG.MIN_LEN + 0.5;
    const v = s.boost ? CFG.BOOST_SPEED : CFG.SPEED;
    if (s.boost) { s.len = Math.max(CFG.MIN_LEN, s.len - CFG.BOOST_COST * dt); s.acc += dt; if (s.acc > 0.45) { s.acc = 0; const seg = this.segments(s).pop(); this.spawnOrb(seg.x + (this.rng.next() - 0.5) * 0.6, seg.z + (this.rng.next() - 0.5) * 0.6, 0.35); } }
    // advance in sub-steps so the trail keeps ~0.2 spacing
    let dist = v * dt; s.x0 = s.x; s.z0 = s.z;
    while (dist > 0) {
      const d = Math.min(dist, 0.2); s.x += Math.cos(s.ang) * d; s.z += Math.sin(s.ang) * d; dist -= d;
      const last = s.trail[0]; if (!last || Math.hypot(last.x - s.x, last.z - s.z) >= 0.2) { s.trail.unshift({ x: s.x, z: s.z }); }
    }
    const maxTrail = Math.ceil((s.len + 2) * (CFG.SPACING / 0.2)) + 6; if (s.trail.length > maxTrail) s.trail.length = maxTrail;
  }

  collide(s) {
    if (Math.hypot(s.x, s.z) > this.R - 0.2) { this.kill(s, null, 'edge'); return; }
    for (const o of this.snakes) {
      if (o === s || !o.alive) continue;
      const hd = Math.hypot(o.x - s.x, o.z - s.z);
      if (hd < CFG.HEAD_R * 1.7) { // head to head: the shorter one dies (ties: both)
        if (s.len < o.len - 0.3) { this.kill(s, o, 'head'); return; }
        if (o.len < s.len - 0.3) { continue; }
        this.kill(s, o, 'head'); return;
      }
      const segs = this.segments(o);
      for (let k = 2; k < segs.length; k++) { if (Math.hypot(segs[k].x - s.x, segs[k].z - s.z) < CFG.HEAD_R * 0.75 + CFG.SEG_R) { this.kill(s, o, 'body'); return; } }
    }
  }

  kill(s, by, why) {
    if (!s.alive) return;
    s.alive = false; s.dieT = this.time;
    const segs = this.segments(s), n = Math.min(44, segs.length);
    // the body scatters into orbs that pop in after the debris has flown
    const per = Math.max(0.35, s.len / n);
    for (let i = 0; i < n; i++) { const p = segs[Math.floor((i / n) * segs.length)]; const a = this.rng.next() * Math.PI * 2, r = this.rng.range(0.5, 4.5); let ox = p.x + Math.cos(a) * r, oz = p.z + Math.sin(a) * r; const d = Math.hypot(ox, oz); if (d > this.R - 1) { ox *= (this.R - 1.2) / d; oz *= (this.R - 1.2) / d; } this.spawnOrb(ox, oz, per, 0.7 + this.rng.next() * 0.4); }
    if (by && by !== s) by.kills++;
    this.events.push({ k: 'die', s: s.id, by: by ? by.id : -1, why, segs: segs.slice(0, 60).map((p) => [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100]) });
  }

  endRound(winner) {
    this.phase = 'roundend'; this.phaseT = CFG.ROUND_END; this.roundWinner = winner ? winner.id : -1;
    if (winner) { winner.wins++; if (winner.wins >= CFG.WINS_NEEDED) this.matchWinner = winner.id; }
    if (this.matchWinner == null && this.round >= 5) this.matchWinner = this.snakes.reduce((a, b) => (b.wins > a.wins ? b : a)).id; // never let a match drag on
    this.events.push({ k: 'roundend', winner: this.roundWinner, wins: this.snakes.map((s) => s.wins) });
  }

  // ---------------------------------------------------------------- bots
  botsThink(dt) {
    for (const s of this.snakes) {
      if (!s.bot || !s.alive) continue;
      const L = { easy: { look: 4, react: 0.28, noise: 0.5, boost: 0.05 }, normal: { look: 6.5, react: 0.14, noise: 0.22, boost: 0.25 }, hard: { look: 9, react: 0.07, noise: 0.06, boost: 0.55 } }[s.level] || {};
      s.botT -= dt; if (s.botT > 0) { continue; }
      s.botT = L.react;
      // candidate headings
      let best = -1e9, bestAng = s.ang, wantBoost = false;
      const others = this.snakes.filter((o) => o !== s && o.alive);
      const bodies = []; for (const o of others) for (const p of this.segments(o)) bodies.push(p);
      // nearest orb (value weighted)
      let target = null, td = 1e9;
      for (const o of this.orbs) { if (o.t0 > this.time) continue; const d = Math.hypot(o.x - s.x, o.z - s.z) / (o.v > 1 ? 2 : 1); if (d < td) { td = d; target = o; } }
      for (const da of [-1.2, -0.8, -0.45, -0.2, 0, 0.2, 0.45, 0.8, 1.2]) {
        const a = s.ang + da; let score = 0;
        // danger along the ray
        for (const step of [1.2, 2.6, 4.2, L.look]) {
          const px = s.x + Math.cos(a) * step, pz = s.z + Math.sin(a) * step;
          if (Math.hypot(px, pz) > this.R - 1.5) score -= 40 / step;
          for (const b of bodies) { const d = Math.hypot(b.x - px, b.z - pz); if (d < 1.5) score -= 55 / step; }
          for (const o of others) { const d = Math.hypot(o.x - px, o.z - pz); if (d < 2.6) score -= (o.len > s.len ? 60 : 8) / step; }
        }
        if (target) { const tx = target.x - s.x, tz = target.z - s.z, d = Math.hypot(tx, tz) || 1; score += (Math.cos(a) * tx + Math.sin(a) * tz) / d * 6; }
        // hard bots try to cut off a shorter neighbour
        if (s.level === 'hard') for (const o of others) if (o.len < s.len * 0.9) { const px = o.x + Math.cos(o.ang) * 3.5, pz = o.z + Math.sin(o.ang) * 3.5; const tx = px - s.x, tz = pz - s.z, d = Math.hypot(tx, tz) || 1; if (d < 14) score += (Math.cos(a) * tx + Math.sin(a) * tz) / d * 3; }
        const dc = Math.hypot(s.x, s.z);
        if (dc > this.R - 8) { const toC = Math.atan2(-s.z, -s.x); score += Math.cos(a - toC) * (dc - (this.R - 8)) * 2.2; }
        score += (this.rng.next() - 0.5) * L.noise * 6 - Math.abs(da) * 0.4;
        if (score > best) { best = score; bestAng = a; }
      }
      s.tgt = bestAng;
      const danger = best < -30;
      const nearWall = Math.hypot(s.x, s.z) > this.R - 9;
      s.want = !nearWall && ((danger && s.len > 8 && this.rng.chance(0.5)) || (target && td > 9 && s.len > 14 && this.rng.chance(L.boost * 0.15)) || (s.boost && this.rng.chance(0.85) && s.len > 10));
    }
  }

  /** Compact state for the network (positions rounded). */
  snapshot() {
    const q = (v) => Math.round(v * 20);
    return {
      f: Math.round(this.time * 60), ph: this.phase, pt: Math.round(this.phaseT * 10) / 10, R: Math.round(this.R * 10) / 10, rd: this.round, tm: Math.round(this.time * 10) / 10,
      s: this.snakes.map((s) => [s.alive ? 1 : 0, q(s.x), q(s.z), Math.round(s.ang * 100), Math.round(s.len * 10), s.boost ? 1 : 0, s.wins, s.kills, this.segments(s).slice(1).map((p) => [q(p.x), q(p.z)]).flat()]),
      o: this.orbs.map((o) => [o.id, q(o.x), q(o.z), o.big ? 1 : 0, o.hue, Math.max(0, Math.round((o.t0 - this.time) * 10))]),
    };
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
}
