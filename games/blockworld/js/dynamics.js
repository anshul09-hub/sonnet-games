// Falling sand/gravel, primed TNT, chain-reaction explosions and tumbling debris (Rapier physics).
import * as THREE from 'three';
import { B, DEFS, SOLID, FALLS, PLANT, WATERB, SEA, TILES } from './blocks.js';
import { makeInstMaterial, makeCubeGeometry } from './shaders.js';
import { moveBox } from './collide.js';

const MAX_INST = 2600, MAX_DEBRIS = 720;
const FIRE = [[2.6, 1.5, 0.5], [2.3, 0.95, 0.3], [1.7, 0.55, 0.15], [3.0, 2.3, 1.0]];
const SMOKE = [[0.16, 0.16, 0.17], [0.24, 0.23, 0.22], [0.1, 0.1, 0.11]];
const DUST = [[0.5, 0.42, 0.34], [0.38, 0.33, 0.28]];

class BlockInstances {
  constructor(scene) {
    this.geo = makeCubeGeometry();
    this.mat = makeInstMaterial();
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, MAX_INST);
    this.tiles = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST * 3), 3);
    this.flash = new THREE.InstancedBufferAttribute(new Float32Array(MAX_INST), 1);
    this.tiles.setUsage(THREE.DynamicDrawUsage); this.flash.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aTiles', this.tiles); this.geo.setAttribute('aFlash', this.flash);
    this.mesh.frustumCulled = false; this.mesh.count = 0;
    this.free = []; this.high = 0;
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.p = new THREE.Vector3(); this.s = new THREE.Vector3();
    scene.add(this.mesh);
  }
  alloc(id) {
    const i = this.free.length ? this.free.pop() : this.high++;
    if (i >= MAX_INST) { this.high = MAX_INST; return -1; }
    const d = DEFS[id];
    this.tiles.array[i * 3] = d.top; this.tiles.array[i * 3 + 1] = d.bottom; this.tiles.array[i * 3 + 2] = d.side;
    this.flash.array[i] = 0;
    this.tiles.needsUpdate = true;
    this.mesh.count = this.high;
    return i;
  }
  set(i, x, y, z, q, s = 1) {
    this.p.set(x, y, z); this.s.set(s, s, s);
    if (q) this.q.set(q.x, q.y, q.z, q.w); else this.q.identity();
    this.m.compose(this.p, this.q, this.s); this.m.toArray(this.mesh.instanceMatrix.array, i * 16);
    this.dirty = true;
  }
  setFlash(i, f) { this.flash.array[i] = f; this.flashDirty = true; }
  release(i) {
    this.mesh.instanceMatrix.array.fill(0, i * 16, i * 16 + 16);
    this.free.push(i); this.dirty = true;
  }
  flush() {
    if (this.dirty) { this.mesh.instanceMatrix.needsUpdate = true; this.dirty = false; }
    if (this.flashDirty) { this.flash.needsUpdate = true; this.flashDirty = false; }
  }
}

const ckey = (x, y, z) => ((x + 32768) * 65536 + (z + 32768)) * 128 + y;

export class Dynamics {
  constructor(G, RAPIER) {
    this.G = G; this.world = G.world; this.R = RAPIER;
    this.inst = new BlockInstances(G.scene);
    this.falling = []; this.primed = []; this.debris = [];
    this.fallQ = []; this.fallSet = new Set();
    this.noFill = false;
    this.acc = 0; this.frame = 0;
    this.colliders = new Map(); this.neg = new Map();
    // explosion flash ball
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.25, 0.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.ball.visible = false; this.ball.renderOrder = 6; G.scene.add(this.ball);
    this.balls = [];
    if (RAPIER) {
      this.pw = new RAPIER.World({ x: 0, y: -26, z: 0 });
      this.pw.timestep = 1 / 60;
    }
    this.world.onChange((x, y, z, old, id) => this.onBlock(x, y, z, old, id));
    this.tmpQ = { x: 0, y: 0, z: 0, w: 1 };
  }

  get engine() { return this.pw ? 'Rapier' : 'built-in'; }
  get counts() { return { falling: this.falling.length, primed: this.primed.length, debris: this.debris.length, colliders: this.colliders.size }; }

  reset() {
    for (const f of this.falling) this.inst.release(f.i);
    for (const p of this.primed) { this.inst.release(p.i); this.G.audio.fuseStop(); }
    for (const d of this.debris) { this.inst.release(d.i); if (d.body) this.pw.removeRigidBody(d.body); }
    this.falling.length = 0; this.primed.length = 0; this.debris.length = 0; this.fallQ.length = 0; this.fallSet.clear();
    if (this.pw) { for (const c of this.colliders.values()) this.pw.removeCollider(c.c, false); }
    this.colliders.clear(); this.neg.clear(); this.inst.flush();
  }

  // ---------- world change hooks ----------
  onBlock(x, y, z, old, id) {
    if (FALLS[id]) this.queueFall(x, y, z);
    if (SOLID[old] && !SOLID[id]) {
      this.queueFall(x, y + 1, z);
      const above = this.world.getBlock(x, y + 1, z);
      if (PLANT[above]) { this.world.setBlock(x, y + 1, z, B.AIR); this.G.bits.blockBits(x, y + 1, z, DEFS[above].top, 6, 0.6); }
      if (!this.noFill && id === B.AIR && y <= SEA) {
        const w = this.world;
        if (WATERB[w.getBlock(x, y + 1, z)] || WATERB[w.getBlock(x + 1, y, z)] || WATERB[w.getBlock(x - 1, y, z)] || WATERB[w.getBlock(x, y, z + 1)] || WATERB[w.getBlock(x, y, z - 1)]) w.setBlock(x, y, z, B.WATER);
      }
    }
    if (this.pw && !SOLID[id]) {
      const k = ckey(x, y, z), c = this.colliders.get(k);
      if (c) { this.pw.removeCollider(c.c, true); this.colliders.delete(k); }
    }
  }
  queueFall(x, y, z) {
    const k = ckey(x, y, z);
    if (this.fallSet.has(k)) return;
    this.fallSet.add(k); this.fallQ.push(x, y, z);
  }

  // ---------- TNT ----------
  ignite(x, y, z, fuse = 2.6, hop = true) {
    const w = this.world;
    if (w.getBlock(x, y, z) !== B.TNT) return false;
    const noFill = this.noFill; this.noFill = true;
    w.setBlock(x, y, z, B.AIR);
    this.noFill = noFill;
    const i = this.inst.alloc(B.TNT); if (i < 0) return false;
    this.primed.push({ i, e: { x: x + 0.5, y, z: z + 0.5, hw: 0.48, h: 0.96 }, vy: hop ? 3.2 : 0, t: fuse, fuse, sm: 0, id: B.TNT });
    this.G.audio.fuseStart();
    return true;
  }

  explode(cx, cy, cz, R = 4.3) {
    const G = this.G, w = this.world, inst = this.inst;
    const r2 = (R + 1) * (R + 1);
    const removed = [];
    this.noFill = true;
    let debrisMade = 0;
    const bitsBudget = { n: 0 };
    for (let dy = -Math.ceil(R) - 1; dy <= Math.ceil(R) + 1; dy++) for (let dz = -Math.ceil(R) - 1; dz <= Math.ceil(R) + 1; dz++) for (let dx = -Math.ceil(R) - 1; dx <= Math.ceil(R) + 1; dx++) {
      const bx = Math.floor(cx) + dx, by = Math.floor(cy) + dy, bz = Math.floor(cz) + dz;
      const px = bx + 0.5 - cx, py = by + 0.5 - cy, pz = bz + 0.5 - cz;
      const d2 = px * px + py * py + pz * pz;
      if (d2 > r2) continue;
      const b = w.getBlock(bx, by, bz);
      if (b === B.AIR || b === B.BEDROCK) continue;
      const d = Math.sqrt(d2);
      const hh = Math.sin(bx * 12.9898 + by * 78.233 + bz * 37.719) * 43758.5453;
      const jitter = 0.78 + 0.34 * (hh - Math.floor(hh));
      if (d > R * jitter) continue;
      if (b === B.WATER) continue;
      if (b === B.TNT) {
        // chain reaction: ripple outwards, nearest blocks first
        this.ignite(bx, by, bz, 0.12 + d * 0.1 + Math.random() * 0.2, false);
        const p = this.primed[this.primed.length - 1];
        if (p && d > 0.01) { p.vy = 2 + Math.random() * 2; p.kx = px / d * (3 - d * 0.5); p.kz = pz / d * (3 - d * 0.5); }
        continue;
      }
      w.setBlock(bx, by, bz, B.AIR);
      removed.push(bx, by, bz);
      if (b !== B.LEAVES && !PLANT[b] && debrisMade < 260 && this.debris.length < MAX_DEBRIS && Math.random() < 0.55) {
        this.spawnDebris(b, bx + 0.5, by + 0.5, bz + 0.5, cx, cy, cz, d, R);
        debrisMade++;
      } else if (bitsBudget.n < 50 && Math.random() < 0.35) { G.bits.blockBits(bx, by, bz, DEFS[b].top, 3, 1.4, cx, cy, cz); bitsBudget.n++; }
    }
    this.noFill = false;
    // fill the crater with water where it opened into a lake
    this.floodWater(removed);
    // gentle pop of nearby primed TNT
    for (const p of this.primed) {
      const dx = p.e.x - cx, dy = p.e.y - cy, dz = p.e.z - cz, d = Math.hypot(dx, dy, dz);
      if (d < R * 2 && d > 0.01) { p.kx = (p.kx || 0) + dx / d * 6 * (1 - d / (R * 2)); p.kz = (p.kz || 0) + dz / d * 6 * (1 - d / (R * 2)); p.vy += 3 * (1 - d / (R * 2)); }
    }
    // pushes
    G.player.explosionPush && G.player.explosionPush(cx, cy, cz, R);
    G.sheep && G.sheep.explosionPush(cx, cy, cz, R);
    // visuals & audio
    this.visuals(cx, cy, cz, R);
    G.audio.boom(cx, cy, cz);
  }

  floodWater(cells) {
    const w = this.world;
    for (let pass = 0; pass < 5; pass++) {
      let changed = false;
      for (let i = 0; i < cells.length; i += 3) {
        const x = cells[i], y = cells[i + 1], z = cells[i + 2];
        if (y > SEA || w.getBlock(x, y, z) !== B.AIR) continue;
        if (WATERB[w.getBlock(x, y + 1, z)] || WATERB[w.getBlock(x + 1, y, z)] || WATERB[w.getBlock(x - 1, y, z)] || WATERB[w.getBlock(x, y, z + 1)] || WATERB[w.getBlock(x, y, z - 1)]) {
          w.setBlock(x, y, z, B.WATER); changed = true;
        }
      }
      if (!changed) break;
    }
  }

  visuals(cx, cy, cz, R) {
    const G = this.G, fx = G.fx;
    fx.burst(cx, cy, cz, 70, { colors: FIRE, speed: R * 2.4, up: 0.8, lift: 1.5, life: 0.75, size: 2.6, alpha: 1, grav: -1, drag: 2.2, grow: 1.6, spread: 1.2 });
    fx.burst(cx, cy + 0.5, cz, 55, { colors: SMOKE, speed: R * 1.3, up: 0.6, lift: 2.2, life: 2.4, size: 3.4, alpha: 0.7, grav: -1.4, drag: 1.1, grow: 1.8, spread: 2.2 });
    fx.burst(cx, cy, cz, 35, { colors: DUST, speed: R * 1.6, up: 0.5, lift: 0.5, life: 1.6, size: 2.6, alpha: 0.55, grav: 0.2, drag: 1.4, grow: 1.2, spread: 3 });
    // white-hot sparks
    fx.burst(cx, cy, cz, 40, { colors: [[3, 2.6, 1.6]], speed: R * 3.4, up: 1, life: 0.7, size: 0.5, alpha: 1, grav: 12, drag: 0.5, spread: 0.6 });
    this.balls.push({ x: cx, y: cy, z: cz, t: 0, R });
    const dist = Math.hypot(G.player.e.x - cx, G.player.e.y + 1 - cy, G.player.e.z - cz);
    G.shake = Math.max(G.shake, Math.min(1.2, 9 / (3 + dist * 0.8)));
    G.flash = Math.max(G.flash, Math.min(0.8, 6 / (3 + dist * dist * 0.15)));
    G.bloomKick = Math.max(G.bloomKick, Math.min(1, 8 / (3 + dist * 0.6)));
  }

  // ---------- debris (Rapier rigid bodies) ----------
  spawnDebris(id, x, y, z, cx, cy, cz, d, R) {
    const inst = this.inst, i = inst.alloc(id); if (i < 0) return;
    let dx = x - cx + (Math.random() - 0.5) * 0.6, dy = y - cy + 0.6 + Math.random() * 0.4, dz = z - cz + (Math.random() - 0.5) * 0.6;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    const sp = 5 + (1 - d / R) * 13 + Math.random() * 6;
    const rec = { i, id, age: 0, body: null };
    if (this.pw) {
      const RA = this.R;
      const rb = this.pw.createRigidBody(RA.RigidBodyDesc.dynamic().setTranslation(x, y, z)
        .setLinvel(dx * sp, dy * sp, dz * sp).setAngvel({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 14, z: (Math.random() - 0.5) * 14 })
        .setLinearDamping(0.12).setAngularDamping(0.7));
      this.pw.createCollider(RA.ColliderDesc.cuboid(0.49, 0.49, 0.49).setRestitution(0.38).setFriction(0.7).setDensity(1), rb);
      rec.body = rb;
    } else {
      rec.e = { x, y: y - 0.45, z, hw: 0.45, h: 0.9 };
      rec.v = { x: dx * sp, y: dy * sp, z: dz * sp };
      rec.q = new THREE.Quaternion();
      rec.ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      rec.spin = (Math.random() - 0.5) * 14;
    }
    this.debris.push(rec);
    inst.set(i, x, y, z, null);
  }

  ensureColliders(px, py, pz) {
    const w = this.world, RA = this.R, fr = this.frame, neg = this.neg;
    const x0 = Math.floor(px), y0 = Math.floor(py), z0 = Math.floor(pz);
    for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = x0 + dx, y = y0 + dy, z = z0 + dz;
      if (y < 0) continue;
      const k = ckey(x, y, z);
      const c = this.colliders.get(k);
      if (c) { c.used = fr; continue; }
      const nf = neg.get(k);
      if (nf !== undefined && fr - nf < 20) continue;
      if (!SOLID[w.getBlock(x, y, z)]) continue;
      // interior blocks can never be touched: only build colliders for exposed cells
      if (SOLID[w.getBlock(x + 1, y, z)] && SOLID[w.getBlock(x - 1, y, z)] && SOLID[w.getBlock(x, y + 1, z)] && SOLID[w.getBlock(x, y - 1, z)] && SOLID[w.getBlock(x, y, z + 1)] && SOLID[w.getBlock(x, y, z - 1)]) { neg.set(k, fr); continue; }
      const col = this.pw.createCollider(RA.ColliderDesc.cuboid(0.5, 0.5, 0.5).setTranslation(x + 0.5, y + 0.5, z + 0.5).setFriction(0.8).setRestitution(0.2));
      this.colliders.set(k, { c: col, used: fr });
    }
  }

  stepDebris(dt) {
    const pw = this.pw;
    if (pw) {
      this.acc = Math.min(this.acc + dt, 0.1);
      let steps = 0;
      if (this.acc >= 1 / 60) {
        for (const d of this.debris) {
          if (d.body.isSleeping()) continue;
          const t = d.body.translation(), v = d.body.linvel();
          this.ensureColliders(t.x + v.x / 40, t.y + v.y / 40, t.z + v.z / 40);
        }
      }
      while (this.acc >= 1 / 60 && steps < 3) { pw.step(); this.acc -= 1 / 60; steps++; }
      if ((this.frame & 31) === 0) {
        for (const [k, f] of this.neg) if (this.frame - f > 40) this.neg.delete(k);
        for (const [k, c] of this.colliders) if (this.frame - c.used > 90) { pw.removeCollider(c.c, false); this.colliders.delete(k); }
      }
    }
    const inst = this.inst;
    for (let n = this.debris.length - 1; n >= 0; n--) {
      const d = this.debris[n];
      d.age += dt;
      let x, y, z, q, speed, resting;
      if (d.body) {
        const t = d.body.translation(); q = d.body.rotation();
        x = t.x; y = t.y; z = t.z;
        const v = d.body.linvel(), a = d.body.angvel();
        speed = Math.hypot(v.x, v.y, v.z); resting = d.body.isSleeping() || (speed < 0.3 && Math.hypot(a.x, a.y, a.z) < 0.8);
      } else {
        this.fallbackStep(d, dt); x = d.e.x; y = d.e.y + 0.45; z = d.e.z; q = d.q;
        speed = Math.hypot(d.v.x, d.v.y, d.v.z); resting = speed < 0.4 && d.ground;
      }
      inst.set(d.i, x, y, z, q);
      d.rest = resting ? (d.rest || 0) + dt : 0;
      if (y < -4 || d.age > 12 || (d.age > 1.0 && d.rest > 0.4)) this.settle(d, n, x, y, z);
    }
  }

  fallbackStep(d, dt) {
    const e = d.e, v = d.v;
    v.y -= 26 * dt;
    const r = moveBox(this.world, e, v.x * dt, v.y * dt, v.z * dt);
    d.ground = r.ground;
    if (r.y) { v.y *= -0.38; v.x *= 0.72; v.z *= 0.72; d.spin *= 0.6; }
    if (r.x) v.x *= -0.4; if (r.z) v.z *= -0.4;
    d.q.multiply(new THREE.Quaternion().setFromAxisAngle(d.ax, d.spin * dt));
    d.spin *= Math.exp(-0.8 * dt);
  }

  settle(d, n, x, y, z) {
    const w = this.world, G = this.G;
    let cx = Math.floor(x), cy = Math.floor(y), cz = Math.floor(z);
    if (y > -4) {
      for (let k = 0; k < 5; k++) {
        const b = w.getBlock(cx, cy + k, cz);
        if ((b === B.AIR || PLANT[b] || WATERB[b])) {
          if (G.player.intersectsCell(cx, cy + k, cz)) continue;
          w.setBlock(cx, cy + k, cz, d.id); break;
        }
      }
    }
    if (d.body) this.pw.removeRigidBody(d.body);
    this.inst.release(d.i);
    this.debris.splice(n, 1);
  }

  // ---------- falling blocks ----------
  processFalls() {
    const w = this.world;
    let budget = 60;
    while (this.fallQ.length && budget-- > 0) {
      const z = this.fallQ.pop(), y = this.fallQ.pop(), x = this.fallQ.pop();
      this.fallSet.delete(ckey(x, y, z));
      const b = w.getBlock(x, y, z);
      if (!FALLS[b] || y <= 0) continue;
      const below = w.getBlock(x, y - 1, z);
      if (SOLID[below]) continue;
      if (!w.hasData(x, z)) continue;
      const i = this.inst.alloc(b); if (i < 0) continue;
      const nf = this.noFill; this.noFill = true;
      w.setBlock(x, y, z, B.AIR);
      this.noFill = nf;
      this.falling.push({ i, id: b, e: { x: x + 0.5, y, z: z + 0.5, hw: 0.49, h: 0.98 }, vy: 0 });
      this.inst.set(i, x + 0.5, y + 0.5, z + 0.5, null);
    }
  }

  updateFalling(dt) {
    const w = this.world, G = this.G;
    for (let n = this.falling.length - 1; n >= 0; n--) {
      const f = this.falling[n], e = f.e;
      f.vy -= 28 * dt; if (f.vy < -40) f.vy = -40;
      const r = moveBox(w, e, 0, f.vy * dt, 0);
      this.inst.set(f.i, e.x, e.y + 0.5, e.z, null);
      if (r.y || e.y < -2) {
        const cx = Math.floor(e.x), cz = Math.floor(e.z);
        let cy = Math.floor(e.y + 0.5);
        for (let k = 0; k < 4; k++) {
          const b = w.getBlock(cx, cy + k, cz);
          if (b === B.AIR || PLANT[b] || WATERB[b]) {
            if (G.player.intersectsCell(cx, cy + k, cz)) { G.player.e.y = cy + k + 1.02; }
            w.setBlock(cx, cy + k, cz, f.id);
            G.audio.thud(cx + 0.5, cy + k, cz + 0.5);
            G.bits.blockBits(cx, cy + k, cz, DEFS[f.id].top, 5, 0.6);
            break;
          }
        }
        this.inst.release(f.i); this.falling.splice(n, 1);
      }
    }
  }

  // ---------- primed TNT ----------
  updatePrimed(dt) {
    const G = this.G, w = this.world;
    let nearest = 1e9;
    for (let n = this.primed.length - 1; n >= 0; n--) {
      const p = this.primed[n], e = p.e;
      p.t -= dt;
      p.vy -= 24 * dt;
      const kx = (p.kx || 0), kz = (p.kz || 0);
      const r = moveBox(w, e, kx * dt, p.vy * dt, kz * dt);
      if (r.y) { p.vy = 0; p.kx = kx * Math.exp(-6 * dt); p.kz = kz * Math.exp(-6 * dt); }
      else { p.kx = kx * Math.exp(-0.8 * dt); p.kz = kz * Math.exp(-0.8 * dt); }
      if (r.x) p.kx = 0; if (r.z) p.kz = 0;
      const blink = Math.floor(p.t * 5.5) % 2 === 0 ? 1 : 0;
      this.inst.setFlash(p.i, p.t < 0.05 ? 1 : blink);
      const s = 1 + Math.max(0, 0.7 - p.t) * 0.28 + (p.t < 0.2 ? 0.1 : 0);
      this.inst.set(p.i, e.x, e.y + 0.48, e.z, null, s);
      // fuse smoke + sparks
      p.sm -= dt;
      if (p.sm <= 0) {
        p.sm = 0.05;
        G.fx.add(e.x + (Math.random() - 0.5) * 0.1, e.y + 1.0, e.z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.6, 1.2, (Math.random() - 0.5) * 0.6, 0.6, 0.35, -2, 0, 0, 0.3, 0.3, 0.3, 0.55, -0.5, 1, 1.5);
        G.fx.add(e.x, e.y + 1.0, e.z, (Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2.2, 0.35, 0.18, -2, 0, 0, 3, 1.9, 0.5, 1, 9, 0.5, 0);
      }
      const dist = Math.hypot(e.x - G.player.e.x, e.y - G.player.e.y, e.z - G.player.e.z);
      if (dist < nearest) nearest = dist;
      if (p.t <= 0) {
        this.primed.splice(n, 1);
        this.inst.release(p.i);
        G.audio.fuseStop();
        this.explode(e.x, e.y + 0.5, e.z, 4.3);
      }
    }
    if (this.primed.length) G.audio.fuseLevel(1 / (1 + nearest / 9));
  }

  updateBalls(dt) {
    const b = this.ball;
    if (!this.balls.length) { b.visible = false; return; }
    // draw the newest flash (older ones are nearly gone); scale/opacity ease
    let best = null;
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const f = this.balls[i]; f.t += dt;
      if (f.t > 0.42) this.balls.splice(i, 1); else if (!best || f.t < best.t) best = f;
    }
    if (!best) { b.visible = false; return; }
    const k = best.t / 0.42;
    b.visible = true; b.position.set(best.x, best.y, best.z);
    b.scale.setScalar(best.R * (0.3 + 0.75 * Math.sqrt(k)));
    b.material.opacity = Math.pow(1 - k, 1.8) * 0.85;
  }

  update(dt) {
    this.frame++;
    this.processFalls();
    this.updateFalling(dt);
    this.updatePrimed(dt);
    this.stepDebris(dt);
    this.updateBalls(dt);
    this.inst.flush();
  }
}
