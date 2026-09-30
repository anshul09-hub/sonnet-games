// Blaster Brawl simulation (pure: no DOM / three.js, so it runs in Node tests). Authoritative on the host.
// A real Rapier world holds the arena: walls, pushable crates, explosive barrels and capsule players (so crates get
// shoved around and explosions launch everything). Bullets are ray-cast projectiles. Bots use ray-cast line of sight.
import { Rng, clamp, wrapAngle, TAU } from '../core/util.js';

export const CFG = {
  HX: 17, HZ: 10.5, HP: 100, SPEED: 8.4, ACCEL: 70, DASH_SPEED: 24, DASH_TIME: 0.17, DASH_CD: 1.4,
  KO_TARGET: 10, RESPAWN: 2.4, INVULN: 1.8, COUNTDOWN: 3, TIME_LIMIT: 240, PLAYER_R: 0.42,
  CRATE_HP: 30, BARREL_HP: 24, WALL_HP: 70,
  W: {
    blaster: { id: 0, dmg: 12, rate: 0.17, speed: 42, life: 0.85, spread: 0.02, ammo: Infinity, kb: 2 },
    shotgun: { id: 1, dmg: 9, pellets: 8, rate: 0.72, speed: 36, life: 0.32, spread: 0.24, ammo: 10, kb: 3 },
    rocket: { id: 2, dmg: 34, rate: 0.95, speed: 21, life: 2.4, spread: 0.015, ammo: 4, blast: 4.4, blastDmg: 62, kb: 9 },
  },
  BARREL_BLAST: 5.2, BARREL_DMG: 70, POWER_EVERY: [10, 15], SHIELD_T: 6, SPEED_T: 8,
};
export const WEAPONS = ['blaster', 'shotgun', 'rocket'];

// ------------------------------------------------------------------------------------------------ map
/** Deterministic arena layout from a seed; guests rebuild the same static map locally. */
export function generateMap(seed) {
  const rng = new Rng((seed ^ 0x9e3779b9) >>> 0);
  const M = { walls: [], crates: [], barrels: [], spawns: [[-14.6, -8.6], [14.6, 8.6], [14.6, -8.6], [-14.6, 8.6], [0, 9.0], [0, -9.0]], pads: [[0, 3.1], [0, -3.1], [-13, 0], [13, 0]] };
  let id = 1; const boxes = [];
  const wall = (x, z, w, d, hard) => { M.walls.push({ id: id++, x, z, w, d, h: hard ? 2.6 : 2.2, hard, hp: hard ? 1e9 : CFG.WALL_HP }); boxes.push({ x, z, hx: w / 2, hz: d / 2 }); };
  // indestructible bars
  for (const s of [-1, 1]) { wall(0, s * 5.6, 5.0, 0.8, true); wall(s * 9.6, 0, 0.8, 4.2, true); }
  // breakable L-shaped covers in each quadrant
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { wall(sx * 11.2, sz * 5.6, 4.2, 0.8, false); wall(sx * 7.4, sz * 3.2, 0.8, 3.2, false); }
  const near = (x, z, r) => boxes.some((a) => Math.abs(a.x - x) < a.hx + r && Math.abs(a.z - z) < a.hz + r) || M.spawns.some(([sx, sz]) => Math.hypot(sx - x, sz - z) < 2.6) || M.pads.some(([px, pz]) => Math.hypot(px - x, pz - z) < 1.7);
  const crate = (x, z, y = 0.5) => { M.crates.push({ id: id++, x, z, y, rot: rng.range(-0.15, 0.15) }); if (y < 1) boxes.push({ x, z, hx: 0.5, hz: 0.5 }); };
  const barrel = (x, z) => { M.barrels.push({ id: id++, x, z }); boxes.push({ x, z, hx: 0.45, hz: 0.45 }); };
  // centre 2x2 crate block with two stacked crates
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { crate(sx * 0.56, sz * 0.56); if (sx * sz > 0) crate(sx * 0.56, sz * 0.56, 1.55); }
  barrel(-2.4, 0); barrel(2.4, 0);
  // scattered cover, mirrored into all four quadrants so the map is fair
  const quads = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  const scatter = (n, fn, r) => { for (let i = 0; i < n; i++) { for (let t = 0; t < 40; t++) { const x = rng.range(1.6, 15.6), z = rng.range(1.4, 9.6); if (quads.every(([sx, sz]) => !near(x * sx, z * sz, r))) { for (const [sx, sz] of quads) fn(x * sx, z * sz); break; } } } };
  scatter(3, (x, z) => crate(x, z), 0.95);
  scatter(2, (x, z) => barrel(x, z), 0.95);
  return M;
}

// ------------------------------------------------------------------------------------------------ sim
export class BrawlSim {
  /** RAPIER must already be initialised. players: [{kind:'human'|'bot', level}] */
  constructor(RAPIER, players, seed = 1, opts = {}) {
    this.R = RAPIER; this.rng = new Rng(seed); this.n = players.length; this.seed = seed; this.opts = opts;
    this.map = generateMap(seed);
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 }); this.world.timestep = 1 / 60;
    this.byHandle = new Map(); this.events = []; this.time = 0; this.phase = 'countdown'; this.phaseT = CFG.COUNTDOWN; this.winner = null; this.overT = 0;
    this.bullets = []; this.nextBullet = 1; this.booms = []; this.pickups = []; this.nextPick = 1; this.padT = this.map.pads.map(() => 3 + this.rng.next() * 6); this.padItem = this.map.pads.map(() => null);
    this.props = new Map(); this.walls = new Map(); this.frame = 0;
    this.buildWorld();
    this.players = players.map((p, i) => this.makePlayer(i, p));
    this.players.forEach((p) => this.respawn(p, true));
  }

  // ---------------------------------------------------------------------------------------------- world
  fixed(x, y, z, hx, hy, hz, ent, fr = 0.6) {
    const R = this.R, b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
    const c = this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setFriction(fr).setRestitution(0.1), b);
    if (ent) this.byHandle.set(c.handle, ent); return { body: b, col: c };
  }
  buildWorld() {
    const R = this.R, { HX, HZ } = CFG, M = this.map;
    this.fixed(0, -0.5, 0, HX + 3, 0.5, HZ + 3, { t: 'floor' }, 0.9);
    this.fixed(0, 1.5, -HZ - 0.5, HX + 1, 1.5, 0.5, { t: 'hard' }); this.fixed(0, 1.5, HZ + 0.5, HX + 1, 1.5, 0.5, { t: 'hard' });
    this.fixed(-HX - 0.5, 1.5, 0, 0.5, 1.5, HZ + 1, { t: 'hard' }); this.fixed(HX + 0.5, 1.5, 0, 0.5, 1.5, HZ + 1, { t: 'hard' });
    for (const w of M.walls) { const ent = { t: w.hard ? 'hard' : 'wall', id: w.id }; const f = this.fixed(w.x, w.h / 2, w.z, w.w / 2, w.h / 2, w.d / 2, ent); if (!w.hard) this.walls.set(w.id, { ...w, ...f, alive: true, maxHp: w.hp }); }
    for (const c of M.crates) this.addCrate(c);
    for (const b of M.barrels) this.addBarrel(b);
  }
  addCrate(c) {
    const R = this.R, q = { x: 0, y: Math.sin(c.rot / 2), z: 0, w: Math.cos(c.rot / 2) };
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setRotation(q).setLinearDamping(1.6).setAngularDamping(2.5).setCanSleep(true));
    const col = this.world.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setDensity(0.55).setFriction(0.7).setRestitution(0.1), body);
    const ent = { t: 'crate', id: c.id, kind: 'crate', body, col, hp: CFG.CRATE_HP, maxHp: CFG.CRATE_HP, alive: true, lastBy: -1 };
    this.byHandle.set(col.handle, ent); this.props.set(c.id, ent);
  }
  addBarrel(b) {
    const R = this.R;
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(b.x, 0.6, b.z).setLinearDamping(1.4).setAngularDamping(2.5).setCanSleep(true));
    const col = this.world.createCollider(R.ColliderDesc.cylinder(0.55, 0.45).setDensity(0.5).setFriction(0.6).setRestitution(0.15), body);
    const ent = { t: 'barrel', id: b.id, kind: 'barrel', body, col, hp: CFG.BARREL_HP, maxHp: CFG.BARREL_HP, alive: true, lastBy: -1 };
    this.byHandle.set(col.handle, ent); this.props.set(b.id, ent);
  }

  makePlayer(i, p) {
    const R = this.R, body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, 0.9, 0).lockRotations().setLinearDamping(0).setCcdEnabled(true));
    const col = this.world.createCollider(R.ColliderDesc.capsule(0.32, CFG.PLAYER_R).setFriction(0).setRestitution(0).setDensity(2), body);
    const pl = { id: i, bot: p.kind === 'bot', level: p.level || 'normal', body, col, alive: false, hp: CFG.HP, x: 0, z: 0, yaw: 0, vx: 0, vz: 0, weapon: 'blaster', ammo: Infinity, cd: 0, shield: 0, speedT: 0, invuln: 0, respawnT: 0, dashT: 0, dashCd: 0, dashDir: [1, 0], kbT: 0,
      kos: 0, deaths: 0, dmgDone: 0, lastHit: null, input: { mx: 0, mz: 0, aim: null, fire: false, dash: false }, ai: { t: 0, strafe: this.rng.sign(), tgt: -1, wander: 0, dir: [0, 0], aim: 0 }, streak: 0 };
    this.byHandle.set(col.handle, { t: 'player', i });
    return pl;
  }

  setInput(i, { mx = 0, mz = 0, aim = null, fire = false, dash = false }) { const p = this.players[i]; if (!p || p.bot) return; const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; } p.input = { mx, mz, aim, fire: !!fire, dash: !!dash }; if (dash) p.dashReq = 0.3; }

  // ---------------------------------------------------------------------------------------------- helpers
  cast(ox, oy, oz, dx, dy, dz, maxToi, exclBody) {
    const hit = this.world.castRay(new this.R.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz }), maxToi, true, undefined, undefined, undefined, exclBody || undefined);
    return hit ? { toi: hit.timeOfImpact ?? hit.toi, ent: this.byHandle.get(hit.collider.handle) } : null;
  }
  /** Is there a clear shot from a to b at chest height (ignoring a's own body)? */
  los(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d < 0.01) return true;
    const h = this.cast(a.x, 0.85, a.z, dx / d, 0, dz / d, d, a.body);
    return !h || (h.ent && h.ent.t === 'player' && h.ent.i === b.id);
  }
  emit(e) { this.events.push(e); }
  alivePlayers() { return this.players.filter((p) => p.alive); }
  round2(v) { return Math.round(v * 100) / 100; }

  // ---------------------------------------------------------------------------------------------- lifecycle
  respawn(p, first = false) {
    const enemies = this.players.filter((o) => o !== p && o.alive);
    let best = null, bd = -1;
    const spots = this.map.spawns.map((s) => s.slice());
    if (first) { const s = spots[p.id % spots.length]; best = s; }
    else for (const s of spots) { const d = enemies.length ? Math.min(...enemies.map((o) => Math.hypot(o.x - s[0], o.z - s[1]))) : 5 + this.rng.next(); if (d > bd) { bd = d; best = s; } }
    p.alive = true; p.hp = CFG.HP; p.weapon = 'blaster'; p.ammo = Infinity; p.shield = 0; p.speedT = 0; p.invuln = first ? 0.5 : CFG.INVULN; p.cd = 0.3; p.dashT = 0; p.dashCd = 0; p.kbT = 0; p.lastHit = null; p.vx = p.vz = 0;
    p.body.setEnabled(true); p.body.setTranslation({ x: best[0], y: 0.9, z: best[1] }, true); p.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    p.x = best[0]; p.z = best[1]; p.yaw = Math.atan2(-best[1], -best[0]);
    if (!first) this.emit({ k: 'spawn', p: p.id, x: this.round2(best[0]), z: this.round2(best[1]) });
  }

  step(dt) {
    this.frame++;
    if (this.phase === 'countdown') { this.phaseT -= dt; this.syncPlayers(); this.thinkBots(dt, true); this.world.step(); if (this.phaseT <= 0) { this.phase = 'play'; this.emit({ k: 'go' }); } return; }
    if (this.phase === 'over') { this.overT += dt; this.world.step(); this.syncPlayers(); return; }
    this.time += dt;
    this.thinkBots(dt);
    for (const p of this.players) this.updatePlayer(p, dt);
    this.world.step();
    this.syncPlayers();
    this.updateBullets(dt);
    this.updateBooms();
    this.updatePickups(dt);
    this.updateProps();
    // ends: first to KO_TARGET, or the leader at the time limit (a tie plays on as sudden death)
    const top = this.players.reduce((a, b) => (b.kos > a.kos ? b : a));
    if (top.kos >= CFG.KO_TARGET) this.finish(top.id);
    else if (this.time >= CFG.TIME_LIMIT && this.players.filter((p) => p.kos === top.kos).length === 1) this.finish(top.id);
  }
  finish(w) { this.winner = w; this.phase = 'over'; this.emit({ k: 'over', winner: w }); }

  syncPlayers() { for (const p of this.players) { if (!p.alive) continue; const t = p.body.translation(); p.x = t.x; p.z = t.z; const v = p.body.linvel(); p.vx = v.x; p.vz = v.z; if (t.y < -6) { p.body.setTranslation({ x: 0, y: 2, z: 0 }, true); } } }

  updatePlayer(p, dt) {
    p.cd = Math.max(0, p.cd - dt); p.dashCd = Math.max(0, p.dashCd - dt); p.invuln = Math.max(0, p.invuln - dt); p.kbT = Math.max(0, p.kbT - dt);
    if (p.shield > 0) { p.shield -= dt; if (p.shield <= 0) this.emit({ k: 'shieldoff', p: p.id }); }
    p.speedT = Math.max(0, p.speedT - dt);
    if (!p.alive) { p.respawnT -= dt; if (p.respawnT <= 0) this.respawn(p); return; }
    const inp = p.input, boost = p.speedT > 0 ? 1.5 : 1;
    if (inp.aim != null) p.yaw = inp.aim; else if (inp.mx || inp.mz) p.yaw += wrapAngle(Math.atan2(inp.mz, inp.mx) - p.yaw) * Math.min(1, dt * 12);
    const v = p.body.linvel();
    if (p.bot && inp.dash) { p.dashReq = 0.25; inp.dash = false; } p.dashReq = Math.max(0, (p.dashReq || 0) - dt);
    if (p.dashReq > 0 && p.dashCd <= 0 && p.dashT <= 0) {
      p.dashReq = 0;
      const l = Math.hypot(inp.mx, inp.mz); p.dashDir = l > 0.2 ? [inp.mx / l, inp.mz / l] : [Math.cos(p.yaw), Math.sin(p.yaw)];
      p.dashT = CFG.DASH_TIME; p.dashCd = CFG.DASH_CD; p.invuln = Math.max(p.invuln, CFG.DASH_TIME); this.emit({ k: 'dash', p: p.id, x: this.round2(p.x), z: this.round2(p.z), a: this.round2(Math.atan2(p.dashDir[1], p.dashDir[0])) });
    }
    if (p.dashT > 0) { p.dashT -= dt; p.body.setLinvel({ x: p.dashDir[0] * CFG.DASH_SPEED, y: v.y, z: p.dashDir[1] * CFG.DASH_SPEED }, true); }
    else {
      const ac = (p.kbT > 0 ? 8 : CFG.ACCEL) * dt, tx = inp.mx * CFG.SPEED * boost, tz = inp.mz * CFG.SPEED * boost;
      p.body.setLinvel({ x: v.x + clamp(tx - v.x, -ac, ac), y: v.y, z: v.z + clamp(tz - v.z, -ac, ac) }, true);
    }
    if (inp.fire && p.cd <= 0 && this.phase === 'play') this.fire(p);
  }

  // ---------------------------------------------------------------------------------------------- shooting
  fire(p) {
    const w = CFG.W[p.weapon], rate = w.rate / (p.speedT > 0 ? 1.25 : 1);
    p.cd = rate;
    const n = w.pellets || 1;
    for (let i = 0; i < n; i++) {
      const sp = (this.rng.next() - 0.5) * 2 * w.spread + (n > 1 ? ((i - (n - 1) / 2) / n) * w.spread * 1.3 : 0);
      const a = p.yaw + sp, ox = p.x + Math.cos(p.yaw) * 0.85, oz = p.z + Math.sin(p.yaw) * 0.85;
      this.bullets.push({ id: this.nextBullet++, x: ox, z: oz, a, v: w.speed * (n > 1 ? 0.85 + this.rng.next() * 0.3 : 1), life: w.life, w: p.weapon, owner: p.id, dmg: w.dmg });
    }
    this.emit({ k: 'shot', p: p.id, w: w.id, x: this.round2(p.x + Math.cos(p.yaw) * 0.85), z: this.round2(p.z + Math.sin(p.yaw) * 0.85), a: this.round2(p.yaw) });
    if (p.weapon !== 'blaster') { p.ammo--; if (p.ammo <= 0) { p.weapon = 'blaster'; p.ammo = Infinity; this.emit({ k: 'empty', p: p.id }); } }
    // recoil
    const kick = p.weapon === 'shotgun' ? 3.2 : p.weapon === 'rocket' ? 4 : 0.5; const v = p.body.linvel(); p.body.setLinvel({ x: v.x - Math.cos(p.yaw) * kick, y: v.y, z: v.z - Math.sin(p.yaw) * kick }, true);
  }

  updateBullets(dt) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i], owner = this.players[b.owner], d = b.v * dt, dx = Math.cos(b.a), dz = Math.sin(b.a);
      const h = this.cast(b.x, 0.85, b.z, dx, 0, dz, d + 0.05, owner.body);
      b.life -= dt;
      if (h) {
        const hx = b.x + dx * h.toi, hz = b.z + dz * h.toi;
        this.bulletHit(b, h.ent, hx, hz, dx, dz);
        this.bullets.splice(i, 1); continue;
      }
      b.x += dx * d; b.z += dz * d;
      if (b.life <= 0) { if (b.w === 'rocket') this.explode(b.x, b.z, CFG.W.rocket.blast, CFG.W.rocket.blastDmg, b.owner, 'rocket'); this.bullets.splice(i, 1); }
    }
  }

  bulletHit(b, ent, x, z, dx, dz) {
    const W = CFG.W[b.w], owner = this.players[b.owner];
    if (b.w === 'rocket') { this.explode(x - dx * 0.1, z - dz * 0.1, W.blast, W.blastDmg, b.owner, 'rocket', ent); return; }
    if (!ent || ent.t === 'floor' || ent.t === 'hard') { this.emit({ k: 'spark', x: this.round2(x), z: this.round2(z), a: this.round2(Math.atan2(-dz, -dx)) }); return; }
    if (ent.t === 'player') { this.damage(this.players[ent.i], b.dmg, b.owner, x, z, dx * W.kb, dz * W.kb); return; }
    if (ent.t === 'wall') { const w = this.walls.get(ent.id); if (w && w.alive) { w.hp -= b.dmg; this.emit({ k: 'hitwall', id: w.id, hp: Math.max(0, Math.round(w.hp)), x: this.round2(x), z: this.round2(z), a: this.round2(Math.atan2(-dz, -dx)) }); if (w.hp <= 0) this.breakWall(w); } return; }
    if (ent.t === 'crate' || ent.t === 'barrel') {
      if (!ent.alive) return; ent.hp -= b.dmg; ent.lastBy = b.owner;
      const m = ent.body.mass(); ent.body.applyImpulse({ x: dx * W.kb * m * 0.6, y: 0.4 * m, z: dz * W.kb * m * 0.6 }, true);
      this.emit({ k: 'hitprop', id: ent.id, hp: Math.max(0, Math.round(ent.hp)), x: this.round2(x), z: this.round2(z), a: this.round2(Math.atan2(-dz, -dx)) });
      if (ent.hp <= 0) this.killProp(ent, b.owner);
    }
  }

  damage(p, dmg, by, x, z, kx, kz, src = 'bullet') {
    if (!p.alive || this.phase !== 'play') return;
    if (p.invuln > 0) { this.emit({ k: 'hit', p: p.id, by, x: this.round2(x), z: this.round2(z), dmg: 0, s: 2 }); return; }
    if (p.shield > 0) { this.emit({ k: 'hit', p: p.id, by, x: this.round2(x), z: this.round2(z), dmg: 0, s: 1 }); return; }
    p.hp -= dmg; p.lastHit = { by, t: this.time };
    if (by >= 0 && by !== p.id) this.players[by].dmgDone += dmg;
    const v = p.body.linvel(); p.body.setLinvel({ x: v.x + kx, y: v.y + (Math.abs(kx) + Math.abs(kz) > 6 ? 3 : 0), z: v.z + kz }, true); p.kbT = 0.22;
    this.emit({ k: 'hit', p: p.id, by, x: this.round2(x), z: this.round2(z), dmg: Math.round(dmg), s: 0 });
    if (p.hp <= 0) this.ko(p, by, kx, kz, src);
  }

  ko(p, by, kx, kz, why) {
    p.alive = false; p.respawnT = CFG.RESPAWN; p.deaths++; p.streak = 0;
    let credit = by;
    if ((credit < 0 || credit === p.id) && p.lastHit && this.time - p.lastHit.t < 5 && p.lastHit.by !== p.id) credit = p.lastHit.by;
    if (credit >= 0 && credit !== p.id) { this.players[credit].kos++; this.players[credit].streak++; }
    const l = Math.hypot(kx, kz) || 1, sp = 10 + Math.min(14, l * 1.5);
    this.emit({ k: 'ko', p: p.id, by: credit >= 0 && credit !== p.id ? credit : -1, x: this.round2(p.x), z: this.round2(p.z), vx: this.round2((kx / l) * sp), vz: this.round2((kz / l) * sp), why });
    p.body.setEnabled(false);
  }

  breakWall(w) {
    w.alive = false; this.world.removeRigidBody(w.body); this.byHandle.delete(w.col.handle); this.nav = null;
    this.emit({ k: 'break', kind: 'wall', id: w.id, x: w.x, y: w.h / 2, z: w.z, w: w.w, h: w.h, d: w.d });
  }
  killProp(e, by) {
    if (!e.alive) return; e.alive = false; this.props.delete(e.id);
    const t = e.body.translation(); this.world.removeRigidBody(e.body); this.byHandle.delete(e.col.handle);
    if (e.kind === 'crate') {
      this.emit({ k: 'break', kind: 'crate', id: e.id, x: this.round2(t.x), y: this.round2(t.y), z: this.round2(t.z) });
      if (this.rng.chance(0.14)) this.spawnPickup(t.x, t.z);
    } else { this.emit({ k: 'break', kind: 'barrel', id: e.id, x: this.round2(t.x), y: this.round2(t.y), z: this.round2(t.z) }); this.booms.push({ at: this.time + 0.09, x: t.x, z: t.z, by, r: CFG.BARREL_BLAST, dmg: CFG.BARREL_DMG, kind: 'barrel' }); }
  }

  // ---------------------------------------------------------------------------------------------- explosions
  explode(x, z, r, dmg, by, kind, direct = null) {
    this.emit({ k: 'boom', x: this.round2(x), z: this.round2(z), r, kind });
    for (const p of this.players) {
      if (!p.alive) continue; const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz); if (d > r + CFG.PLAYER_R) continue;
      const f = 1 - Math.min(1, d / (r + 0.4)), k = (10 + 16 * f) / (d || 1);
      this.damage(p, dmg * f * (direct && direct.t === 'player' && direct.i === p.id ? 1.6 : 1), by, p.x, p.z, dx * k, dz * k, kind);
    }
    for (const e of this.props.values()) {
      if (!e.alive) continue; const t = e.body.translation(), dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz); if (d > r + 0.6) continue;
      const f = 1 - Math.min(1, d / (r + 0.6)), m = e.body.mass(), k = (14 + 22 * f) * m / (d || 1);
      e.body.applyImpulse({ x: dx * k, y: (6 + 10 * f) * m, z: dz * k }, true); e.body.applyTorqueImpulse({ x: (this.rng.next() - 0.5) * m * 4, y: (this.rng.next() - 0.5) * m * 3, z: (this.rng.next() - 0.5) * m * 4 }, true);
      e.hp -= (e.kind === 'barrel' ? 30 : 40) * f + 6; e.lastBy = by;
      if (e.hp <= 0) this.killProp(e, by); else this.emit({ k: 'hitprop', id: e.id, hp: Math.max(0, Math.round(e.hp)), x: this.round2(t.x), z: this.round2(t.z), a: 0 });
    }
    for (const w of this.walls.values()) {
      if (!w.alive) continue; const dx = Math.max(Math.abs(x - w.x) - w.w / 2, 0), dz = Math.max(Math.abs(z - w.z) - w.d / 2, 0), d = Math.hypot(dx, dz); if (d > r) continue;
      w.hp -= (kind === 'barrel' ? 42 : 55) * (1 - d / r); this.emit({ k: 'hitwall', id: w.id, hp: Math.max(0, Math.round(w.hp)), x: w.x, z: w.z, a: 0 });
      if (w.hp <= 0) this.breakWall(w);
    }
  }
  updateBooms() { for (let i = this.booms.length - 1; i >= 0; i--) { const b = this.booms[i]; if (b.at <= this.time) { this.booms.splice(i, 1); this.explode(b.x, b.z, b.r, b.dmg, b.by, b.kind); } } }
  updateProps() { for (const e of this.props.values()) { if (!e.alive) continue; const t = e.body.translation(); if (t.y < -4 || Math.abs(t.x) > CFG.HX + 2 || Math.abs(t.z) > CFG.HZ + 2) this.killProp(e, -1); } }

  // ---------------------------------------------------------------------------------------------- power-ups
  spawnPickup(x, z, kind = null) {
    const kinds = ['shotgun', 'shotgun', 'shotgun', 'rocket', 'rocket', 'shield', 'shield', 'speed', 'speed', 'health', 'health'];
    const it = { id: this.nextPick++, kind: kind || kinds[this.rng.int(0, kinds.length - 1)], x, z, t: 0 };
    this.pickups.push(it); this.emit({ k: 'powerup', id: it.id, kind: it.kind, x: this.round2(x), z: this.round2(z) }); return it;
  }
  updatePickups(dt) {
    this.map.pads.forEach(([x, z], i) => {
      const cur = this.padItem[i];
      if (cur && !this.pickups.includes(cur)) { this.padItem[i] = null; this.padT[i] = CFG.POWER_EVERY[0] + this.rng.next() * (CFG.POWER_EVERY[1] - CFG.POWER_EVERY[0]); }
      else if (!cur) { this.padT[i] -= dt; if (this.padT[i] <= 0) this.padItem[i] = this.spawnPickup(x, z); }
    });
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const it = this.pickups[i]; it.t += dt;
      if (it.t > 25) { this.pickups.splice(i, 1); this.emit({ k: 'poof', id: it.id, x: it.x, z: it.z }); continue; }
      for (const p of this.players) {
        if (!p.alive || Math.hypot(p.x - it.x, p.z - it.z) > 1.05) continue;
        if (it.kind === 'health' && p.hp >= CFG.HP) continue;
        this.applyPickup(p, it); this.pickups.splice(i, 1); break;
      }
    }
  }
  applyPickup(p, it) {
    if (it.kind === 'shotgun' || it.kind === 'rocket') { p.weapon = it.kind; p.ammo = CFG.W[it.kind].ammo; }
    else if (it.kind === 'shield') p.shield = CFG.SHIELD_T; else if (it.kind === 'speed') p.speedT = CFG.SPEED_T; else if (it.kind === 'health') p.hp = Math.min(CFG.HP, p.hp + 45);
    this.emit({ k: 'pickup', p: p.id, id: it.id, kind: it.kind, x: this.round2(it.x), z: this.round2(it.z) });
  }

  // ---------------------------------------------------------------------------------------------- navigation
  /** Cells blocked by standing walls (inflated by the player radius); rebuilt when a wall breaks. */
  buildNav() {
    const cols = Math.ceil(2 * CFG.HX), rows = Math.ceil(2 * CFG.HZ); this.nav = { cols, rows, blocked: new Uint8Array(cols * rows) };
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = -CFG.HX + c + 0.5, z = -CFG.HZ + r + 0.5; let b = Math.abs(x) > CFG.HX - 0.6 || Math.abs(z) > CFG.HZ - 0.6;
      if (!b) for (const w of this.map.walls) { const a = this.walls.get(w.id); if (a && !a.alive) continue; if (Math.abs(x - w.x) < w.w / 2 + 0.7 && Math.abs(z - w.z) < w.d / 2 + 0.7) { b = true; break; } }
      this.nav.blocked[r * cols + c] = b ? 1 : 0;
    }
  }
  cell(x, z) { const { cols, rows } = this.nav; return { c: clamp(Math.floor(x + CFG.HX), 0, cols - 1), r: clamp(Math.floor(z + CFG.HZ), 0, rows - 1) }; }
  /** Direction (unit vector) along the shortest walkable path from `from` to `to`, or null. */
  navDir(from, to) {
    if (!this.nav) this.buildNav();
    const { cols, rows, blocked } = this.nav, dist = new Int16Array(cols * rows).fill(-1), q = [];
    let t = this.cell(to.x, to.z); let ti = t.r * cols + t.c;
    if (blocked[ti]) { let best = -1, bd = 1e9; for (let i = 0; i < blocked.length; i++) if (!blocked[i]) { const cx = -CFG.HX + (i % cols) + 0.5, cz = -CFG.HZ + Math.floor(i / cols) + 0.5, d = Math.hypot(cx - to.x, cz - to.z); if (d < bd) { bd = d; best = i; } } ti = best; }
    dist[ti] = 0; q.push(ti);
    for (let h = 0; h < q.length; h++) {
      const i = q[h], c = i % cols, r = (i / cols) | 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue; const nc = c + dc, nr = r + dr; if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue; const ni = nr * cols + nc;
        if (blocked[ni] || dist[ni] >= 0) continue; if (dr && dc && (blocked[r * cols + nc] || blocked[nr * cols + c])) continue;
        dist[ni] = dist[i] + 1; q.push(ni);
      }
    }
    let f = this.cell(from.x, from.z), fi = f.r * cols + f.c, steps = 0, cx = f.c, cr = f.r;
    if (dist[fi] < 0) return null;
    while (steps < 3 && dist[cr * cols + cx] > 0) {
      let bd = dist[cr * cols + cx], bc = cx, br = cr;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const nc = cx + dc, nr = cr + dr; if ((!dr && !dc) || nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue; const d = dist[nr * cols + nc]; if (d >= 0 && d < bd && !(dr && dc && (blocked[cr * cols + nc] || blocked[nr * cols + cx]))) { bd = d; bc = nc; br = nr; } }
      if (bc === cx && br === cr) break; cx = bc; cr = br; steps++;
    }
    const tx = -CFG.HX + cx + 0.5 - from.x, tz = -CFG.HZ + cr + 0.5 - from.z, l = Math.hypot(tx, tz); return l < 0.05 ? null : [tx / l, tz / l];
  }

  // ---------------------------------------------------------------------------------------------- bots
  thinkBots(dt, frozen = false) {
    for (const p of this.players) {
      if (!p.bot) continue;
      const a = p.ai; a.t -= dt; a.aim = a.aim || 0;
      if (!p.alive || frozen) { p.input = { mx: 0, mz: 0, aim: null, fire: false, dash: false }; continue; }
      if (a.t > 0) { this.botAim(p, dt); continue; }
      const L = { easy: { react: 0.28, err: 0.32, lead: 0, dodge: 0.02, range: 9 }, normal: { react: 0.14, err: 0.12, lead: 0.55, dodge: 0.1, range: 12 }, hard: { react: 0.07, err: 0.035, lead: 1, dodge: 0.3, range: 15 } }[p.level] || {};
      a.t = L.react * (0.8 + this.rng.next() * 0.4); a.t0 = a.t; a.L = L;
      // target: nearest visible enemy, else nearest enemy
      let tgt = null, td = 1e9, vis = false;
      for (const o of this.players) { if (o === p || !o.alive) continue; const d = Math.hypot(o.x - p.x, o.z - p.z); const seen = d < L.range * 1.6 && this.los(p, o); if ((seen && !vis) || (seen === vis && d < td)) { tgt = o; td = d; vis = seen; } }
      a.tgt = tgt ? tgt.id : -1; a.vis = vis;
      // desired movement
      let want = [0, 0];
      const weaponPref = p.weapon === 'shotgun' ? 3.4 : p.weapon === 'rocket' ? 9 : 7.5;
      // pickups worth a detour: only when not in a fight, or when it is very close / life-saving
      let pick = null, pd = 1e9;
      for (const it of this.pickups) { const d = Math.hypot(it.x - p.x, it.z - p.z); const need = it.kind === 'health' ? p.hp < 65 : (it.kind === 'shotgun' || it.kind === 'rocket') ? p.weapon === 'blaster' : true; if (need && d < pd) { pd = d; pick = it; } }
      const threatened = tgt && vis && td < 9;
      const grab = pick && ((!vis && pd < 10) || pd < 3.2 || (pick.kind === 'health' && p.hp < 40 && pd < 14) || (p.weapon === 'blaster' && (pick.kind === 'rocket' || pick.kind === 'shotgun') && pd < 6.5 && !threatened));
      if (p.hp < 32 && tgt && !(pick && pick.kind === 'health' && pd < 14)) want = [p.x - tgt.x, p.z - tgt.z];
      else if (grab) want = (pd > 2.5 && this.navDir(p, pick)) || [pick.x - p.x, pick.z - p.z];
      else if (tgt) {
        const dx = tgt.x - p.x, dz = tgt.z - p.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
        const rad = d > weaponPref + 1.5 ? 1 : d < weaponPref - 1.5 ? -1 : 0;
        if (this.rng.chance(0.25)) a.strafe *= -1;
        want = vis ? [ux * rad + -uz * a.strafe * 0.9, uz * rad + ux * a.strafe * 0.9] : (this.navDir(p, tgt) || [ux, uz]);
      } else { a.wander -= 1; if (a.wander <= 0) { a.wander = 12; a.dir = [this.rng.range(-1, 1), this.rng.range(-1, 1)]; } want = a.dir; }
      // stuck detection: if we barely moved while trying to, wander off in a random direction for a moment
      a.lx ??= p.x; a.lz ??= p.z; a.sT = (a.sT || 0) + a.t0;
      if (a.sT > 1.2) { const moved = Math.hypot(p.x - a.lx, p.z - a.lz); a.lx = p.x; a.lz = p.z; a.sT = 0; if (moved < 0.8 && Math.hypot(want[0], want[1]) > 0.1) { a.unstick = 0.7; a.udir = [this.rng.range(-1, 1), this.rng.range(-1, 1)]; } }
      if (a.unstick > 0) { a.unstick -= a.t0; want = a.udir; }
      // obstacle-aware heading: probe 16 directions and pick the freest one that still makes progress
      const wl = Math.hypot(want[0], want[1]);
      let mx = 0, mz = 0;
      if (wl > 0.05) {
        const wa = Math.atan2(want[1], want[0]); let best = -1e9, ba = wa;
        for (let k = 0; k < 16; k++) {
          const ang = wa + ((k % 2 ? 1 : -1) * Math.ceil(k / 2) * TAU) / 16, dxp = Math.cos(ang), dzp = Math.sin(ang);
          const h = this.cast(p.x, 0.6, p.z, dxp, 0, dzp, 2.4, p.body); const free = h ? (h.ent && h.ent.t === 'player' ? 2.4 : h.toi) : 2.4;
          const score = Math.cos(ang - wa) * 2 + free * 0.9 - (Math.abs(p.x + dxp * 2) > CFG.HX - 1 || Math.abs(p.z + dzp * 2) > CFG.HZ - 1 ? 2 : 0);
          if (score > best) { best = score; ba = ang; }
        }
        mx = Math.cos(ba); mz = Math.sin(ba);
      }
      // aim + fire
      let aim = null, fire = false;
      if (tgt) {
        const t = td / CFG.W[p.weapon === 'blaster' ? 'blaster' : p.weapon].speed, lx = tgt.x + tgt.vx * t * L.lead, lz = tgt.z + tgt.vz * t * L.lead;
        aim = Math.atan2(lz - p.z, lx - p.x) + (this.rng.next() - 0.5) * 2 * L.err;
        fire = vis && td < (p.weapon === 'shotgun' ? 6 : L.range) && (p.level !== 'easy' || this.rng.chance(0.55));
      }
      // explosive barrels near an enemy are worth a shot
      if (!fire && p.level !== 'easy') for (const e of this.props.values()) { if (e.kind !== 'barrel' || !e.alive) continue; const t = e.body.translation(); const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < 3.2 || d > 12) continue; if (!this.players.some((o) => o !== p && o.alive && Math.hypot(o.x - t.x, o.z - t.z) < 3.4)) continue; if (this.los(p, { x: t.x, z: t.z, id: -2 })) { aim = Math.atan2(t.z - p.z, t.x - p.x); fire = true; break; } }
      const dash = p.hp < 45 && threatened && p.dashCd <= 0 && this.rng.chance(L.dodge * 3) || (threatened && p.dashCd <= 0 && this.rng.chance(L.dodge));
      p.input = { mx, mz, aim: null, fire, dash };
      a.aimT = aim; if (aim != null && a.aimCur == null) a.aimCur = aim; if (aim == null) a.aimCur = null;
      this.botAim(p, dt, true);
    }
  }
  botAim(p, dt, snap = false) {
    const a = p.ai; if (a.aimT == null) { p.input.aim = null; return; }
    const cur = a.aimCur ?? a.aimT, rate = p.level === 'easy' ? 5 : p.level === 'normal' ? 9 : 16;
    a.aimCur = cur + wrapAngle(a.aimT - cur) * Math.min(1, dt * rate); p.input.aim = a.aimCur;
    if (Math.abs(wrapAngle(a.aimT - a.aimCur)) > (p.level === 'hard' ? 0.18 : 0.3)) p.input.fire = false;
  }

  // ---------------------------------------------------------------------------------------------- network snapshot
  snapshot() {
    const q = (v) => Math.round(v * 100), qq = (v) => Math.round(v * 1000);
    const props = []; for (const e of this.props.values()) { if (!e.alive) continue; const t = e.body.translation(), r = e.body.rotation(); props.push([e.id, q(t.x), q(t.y), q(t.z), qq(r.x), qq(r.y), qq(r.z), qq(r.w), Math.round(e.hp)]); }
    const walls = []; for (const w of this.walls.values()) if (w.alive && w.hp < w.maxHp) walls.push([w.id, Math.round(w.hp)]);
    return {
      f: this.frame, ph: this.phase, pt: Math.round(this.phaseT * 10) / 10, tm: Math.round(this.time), w: this.winner ?? -1,
      p: this.players.map((p) => [p.alive ? 1 : 0, q(p.x), q(p.z), Math.round(p.yaw * 100), Math.round(p.hp), CFG.W[p.weapon].id, p.ammo === Infinity ? -1 : p.ammo, p.shield > 0 ? 1 : 0, p.speedT > 0 ? 1 : 0, p.invuln > 0 ? 1 : 0, p.kos, p.deaths, Math.round(p.dashCd * 10), Math.round(p.respawnT * 10), q(p.vx), q(p.vz)]),
      b: this.bullets.map((b) => [b.id, q(b.x), q(b.z), Math.round(b.a * 100), CFG.W[b.w].id, b.owner]),
      o: props, wl: walls, u: this.pickups.map((u) => [u.id, u.kind, q(u.x), q(u.z)]),
    };
  }
  drainEvents() { const e = this.events; this.events = []; return e; }
  dispose() { try { this.world.free(); } catch { /* */ } }
}
