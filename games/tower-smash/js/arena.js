// The simulation: physics world + castle blocks, damage, explosions, flags, projectiles.
import * as THREE from 'three';
import { R, PhysWorld, GROUPS } from './physics.js';
import { MATS, AMMO, GRAVITY, FIXED_DT } from './config.js';
import { BlockVisuals } from './blocks.js';
import { makeFlag, makeFlagMarker, waveFlag, makePendulum, makePlatform, makeProjectileMesh, makeMiniRock, debrisMesh, FLAG } from './parts.js';
import { groundY, WATER_Y } from './terrain.js';

const DMG_K = 0.09;
const MARGIN = 0.0008;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => { const c = 1.70158; t = clamp(t, 0, 1) - 1; return 1 + (c + 1) * t * t * t + c * t * t; };

export class Arena {
  constructor(gfx, fx, audio) {
    this.gfx = gfx; this.fx = fx; this.audio = audio;
    this.root = new THREE.Group();
    gfx.scene.add(this.root);
    this.on = {};                    // callbacks: flagDown(flag,left,total), shake(a), bigBlast(pos)
    this.phys = null;
    this.blocks = []; this.statics = []; this.flags = []; this.pendulums = []; this.platforms = [];
    this.projectiles = [];
    this.byCol = new Map();
    this.pools = {};
    this.vis = null;
    this.time = 0;
    this.movers = 0; this.moverCenter = new THREE.Vector3(); this.maxSpeed = 0;
    this.debrisCount = 80;
    this._v = new THREE.Vector3();
  }

  setQuality(q) { this.debrisCount = q.debris; if (this.phys) this.buildPools(); }

  // ------------------------------------------------------------------ build
  load(spec, { intro = true } = {}) {
    this.dispose();
    this.spec = spec;
    this.phys = new PhysWorld();
    const w = this.phys.world;
    this.time = 0;
    this.introT = intro ? 0 : 99;
    this.vis = new BlockVisuals(this.gfx.scene);
    this.vis.prepare(spec.blocks);

    // static load above each block (mass sitting on top of it), for damage thresholds
    const dyn = spec.blocks.filter((s) => !s.static);
    const mass = (s) => MATS[s.mat].density * (s.mat === 'tnt' ? Math.PI * 0.45 * 0.45 * 1 : s.sx * s.sy * s.sz);
    for (const s of dyn) s.m = mass(s);
    let minY = Infinity, maxY = -Infinity;
    for (const s of dyn) { minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
    this.maxDelay = 0;
    for (const s of dyn) {
      let above = 0;
      for (const o of dyn) {
        if (o === s || o.y <= s.y + 0.01) continue;
        if (Math.abs(o.x - s.x) < (o.sx + s.sx) / 2 - 0.05 && Math.abs(o.z - s.z) < (o.sz + s.sz) / 2 - 0.05) above += o.m;
      }
      s.load = above * -GRAVITY;
    }

    for (const s of spec.blocks) {
      if (s.static) this.addStatic(s);
      else this.addBlock(s, (s.y - minY) / Math.max(1, maxY - minY));
    }
    for (const f of spec.flags) this.addFlag(f);
    for (const p of spec.platforms) this.addPlatform(p);
    spec.platforms.forEach((p, i) => { p.index = i; });
    for (const p of spec.pendulums) this.addPendulum(p);
    // anything riding a moving platform must never fall asleep while it is carried
    this.carriedTick = 0;
    for (const b of this.blocks) {
      for (const pl of this.platforms) {
        const p = pl.p;
        if (Math.abs(b.s.x - p.x) < p.w / 2 + 0.2 && Math.abs(b.s.z - p.z) < p.d / 2 + 0.2 && b.s.y > p.y) { b.carried = pl; b.body.wakeUp(); break; }
      }
    }
    for (const f of this.flags) if (f.ref != null) { f.body.wakeUp(); f.carried = this.platforms[f.ref]; }
    this.flagsTotal = this.flags.length;
    this.flagsDown = 0;
    this.aliveBlocks = this.blocks.length;
    this.buildPools();
    this.syncVisuals(0, 0, true);
  }

  addStatic(s) {
    const w = this.phys.world;
    const body = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(s.x, s.y, s.z));
    w.createCollider(R.ColliderDesc.cuboid(s.sx / 2, s.sy / 2, s.sz / 2).setFriction(0.8).setRestitution(0.1)
      .setCollisionGroups(GROUPS.static), body);
    const h = this.vis.alloc({ ...s, mat: s.mat === 'stone' ? 'sstone' : s.mat === 'wood' ? 'swood' : s.mat });
    this.vis.set(h, s, { x: 0, y: 0, z: 0, w: 1 });
    this.statics.push({ s, h });
  }

  addBlock(s, yFrac) {
    const w = this.phys.world, M = MATS[s.mat];
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(s.x, s.y, s.z)
      .setSleeping(true).setLinearDamping(0.04).setAngularDamping(0.25));
    const thrD = s.load * 1.6 + M.thr, thrS = s.load * 1.6 + M.snd;
    const shape = s.mat === 'tnt'
      ? R.ColliderDesc.cylinder(0.5 - MARGIN, 0.45 - MARGIN)
      : R.ColliderDesc.cuboid(s.sx / 2 - MARGIN, s.sy / 2 - MARGIN, s.sz / 2 - MARGIN);
    const col = w.createCollider(shape.setDensity(M.density).setFriction(M.friction).setRestitution(M.restitution)
      .setCollisionGroups(GROUPS.block).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(thrS), body);
    const b = {
      s, mat: s.mat, body, col, h: this.vis.alloc(s), hp: M.hp, maxHp: M.hp, dead: false, thrD, acc: 0, cool: 0,
      fuse: -1, stage: 0, wasAwake: true, tnt: s.mat === 'tnt', delay: yFrac * 0.75 + Math.random() * 0.12,
    };
    this.maxDelay = Math.max(this.maxDelay, b.delay);
    this.byCol.set(col.handle, { type: 'block', b });
    this.blocks.push(b);
    return b;
  }

  addFlag(f) {
    const w = this.phys.world;
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(f.x, f.y, f.z).setSleeping(true)
      .setLinearDamping(0.05).setAngularDamping(0.3));
    const common = (d) => d.setFriction(0.6).setRestitution(0.1).setCollisionGroups(GROUPS.block);
    w.createCollider(common(R.ColliderDesc.cuboid(0.4, FLAG.baseH / 2, 0.4).setTranslation(0, FLAG.baseH / 2, 0).setDensity(0.9)), body);
    w.createCollider(common(R.ColliderDesc.cuboid(0.07, FLAG.poleH / 2, 0.07).setTranslation(0, FLAG.baseH + FLAG.poleH / 2, 0).setDensity(0.4)), body);
    const g = makeFlag();
    const marker = makeFlagMarker();
    this.root.add(g, marker);
    this.flags.push({ f, body, g, marker, fallen: false, phase: Math.random() * 6, ref: f.ref, rel0: null, x0: f.x, y0: f.y });
  }

  addPlatform(p) {
    const w = this.phys.world;
    const body = w.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y, p.z));
    w.createCollider(R.ColliderDesc.cuboid(p.w / 2, p.th / 2, p.d / 2).setFriction(1.0).setRestitution(0)
      .setCollisionGroups(GROUPS.static), body);
    const g = makePlatform(p);
    g.position.set(p.x, p.y, p.z);
    this.root.add(g);
    this.platforms.push({ p, body, g, base: new THREE.Vector3(p.x, p.y, p.z) });
  }

  addPendulum(p) {
    const w = this.phys.world;
    const anchor = w.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(p.x, p.y, p.z));
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z)
      .setRotation({ x: 0, y: 0, z: Math.sin(p.ang / 2), w: Math.cos(p.ang / 2) })
      .setCanSleep(false).setAngularDamping(0.03).setCcdEnabled(true));
    w.createCollider(R.ColliderDesc.cuboid(0.1, p.len / 2, 0.1).setTranslation(0, -p.len / 2, 0).setDensity(0.5)
      .setCollisionGroups(GROUPS.block), body);
    const bc = w.createCollider(R.ColliderDesc.ball(p.r).setTranslation(0, -p.len, 0).setDensity(p.density)
      .setFriction(0.4).setRestitution(0.3).setCollisionGroups(GROUPS.block)
      .setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(2500), body);
    w.createImpulseJoint(R.JointData.revolute({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }), anchor, body, true);
    const g = makePendulum(p.len, p.r);
    g.position.set(p.x, p.y, p.z);
    this.root.add(g);
    this.byCol.set(bc.handle, { type: 'ball' });
    this.pendulums.push({ p, body, g });
  }

  buildPools() {
    // physical debris pools (small bodies that only collide with the ground)
    for (const k of Object.keys(this.pools)) this.freePool(this.pools[k]);
    this.pools = {};
    const total = this.debrisCount;
    const share = { glass: 0.4, wood: 0.25, stone: 0.35 };
    const dims = { glass: [0.13, 0.045, 0.11], wood: [0.27, 0.035, 0.05], stone: [0.13, 0.1, 0.12] };
    const w = this.phys.world;
    for (const kind of Object.keys(share)) {
      const n = Math.max(6, Math.round(total * share[kind]));
      const mesh = debrisMesh(kind, n);
      this.root.add(mesh);
      const bodies = [];
      for (let i = 0; i < n; i++) {
        const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(0, -100, 0).setEnabled(false)
          .setLinearDamping(0.15).setAngularDamping(0.5));
        const d = dims[kind];
        w.createCollider(R.ColliderDesc.cuboid(d[0], d[1], d[2]).setDensity(kind === 'stone' ? 2 : 1).setFriction(0.7).setRestitution(0.25)
          .setCollisionGroups(GROUPS.debris), body);
        bodies.push({ body, t: -1, life: 0, s: 1 });
      }
      this.pools[kind] = { kind, mesh, bodies, next: 0 };
    }
  }

  freePool(p) { this.root.remove(p.mesh); p.mesh.geometry.dispose(); p.mesh.material.dispose?.(); p.mesh.dispose(); }

  spawnDebris(kind, pos, vel, n, spread = 4) {
    const pool = this.pools[kind];
    if (!pool) return;
    n = Math.max(1, Math.round(n * (this.fx.q * 0.6 + 0.4)));
    for (let k = 0; k < n; k++) {
      const d = pool.bodies[pool.next]; pool.next = (pool.next + 1) % pool.bodies.length;
      const b = d.body;
      b.setEnabled(true);
      b.setTranslation({ x: pos.x + (Math.random() - 0.5) * 0.7, y: pos.y + (Math.random() - 0.5) * 0.7, z: pos.z + (Math.random() - 0.5) * 0.7 }, true);
      b.setRotation({ x: Math.random(), y: Math.random(), z: Math.random(), w: Math.random() + 0.2 }, true);
      b.setLinvel({ x: vel.x * 0.6 + (Math.random() - 0.5) * spread, y: vel.y * 0.4 + Math.random() * spread * 0.8 + 1, z: vel.z * 0.6 + (Math.random() - 0.5) * spread }, true);
      b.setAngvel({ x: (Math.random() - 0.5) * 20, y: (Math.random() - 0.5) * 20, z: (Math.random() - 0.5) * 20 }, true);
      d.t = 0; d.life = 3.2 + Math.random() * 2.2; d.s = 0.8 + Math.random() * 0.6;
    }
  }

  dispose() {
    for (const p of Object.values(this.pools)) this.freePool(p);
    this.pools = {};
    for (const f of this.flags) { this.root.remove(f.g); this.root.remove(f.marker); }
    for (const p of this.platforms) this.root.remove(p.g);
    for (const p of this.pendulums) this.root.remove(p.g);
    for (const p of this.projectiles) if (p.mesh) this.root.remove(p.mesh);
    if (this.vis) this.vis.dispose();
    if (this.phys) { try { this.phys.world.free(); this.phys.queue.free(); } catch (e) { /* ignore */ } }
    this.blocks = []; this.statics = []; this.flags = []; this.pendulums = []; this.platforms = []; this.projectiles = [];
    this.byCol.clear();
    this.phys = null; this.vis = null;
  }

  // ------------------------------------------------------------------ projectiles
  launch(type, pos, vel) {
    if (!this.phys) return null;
    const A = AMMO[type];
    const p = this.makeProjectile(type, A.r, A.density, A.restitution, A.friction, pos, vel, makeProjectileMesh(type));
    p.launchT = this.time;
    return p;
  }

  makeProjectile(type, r, density, rest, fric, pos, vel, mesh) {
    const w = this.phys.world;
    const body = w.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
      .setLinvel(vel.x, vel.y, vel.z).setAngvel({ x: (Math.random() - 0.5) * 6, y: (Math.random() - 0.5) * 6, z: -vel.x * 0.08 })
      .setCcdEnabled(true).setLinearDamping(0).setAngularDamping(0.25));
    const col = w.createCollider(R.ColliderDesc.ball(r).setDensity(density).setFriction(fric).setRestitution(rest)
      .setCollisionGroups(GROUPS.proj).setActiveEvents(R.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(60), body);
    this.root.add(mesh);
    const p = { type, r, body, col, mesh, alive: true, impacted: false, age: 0, trailT: 0, inWater: false, det: false, bit: type === 'bit' };
    this.byCol.set(col.handle, { type: 'proj', p });
    this.projectiles.push(p);
    return p;
  }

  removeProjectile(p, puff = false) {
    if (!p.alive) return;
    p.alive = false;
    const t = p.body.translation();
    if (puff) this.fx.puff(t, { n: 4, size: 0.8, color: 0xdddddd, life: 0.7 });
    this.byCol.delete(p.col.handle);
    this.phys.world.removeRigidBody(p.body);
    this.root.remove(p.mesh);
  }

  clearProjectiles(puff = true) {
    if (!this.phys) return;
    for (const p of this.projectiles) this.removeProjectile(p, puff);
    this.projectiles = [];
  }

  // split a cluster shot into five bits
  split(p) {
    if (!p.alive || p.type !== 'cluster' || p.split) return;
    p.split = true;
    const t = p.body.translation(), v = p.body.linvel();
    this.removeProjectile(p);
    const fan = [[0, 0], [4.5, 0], [-4.5, 0], [0, 5], [0, -5]];
    for (const [dy, dz] of fan) {
      const bit = this.makeProjectile('bit', 0.34, 8, 0.15, 0.5,
        { x: t.x + (Math.random() - 0.5) * 0.3, y: t.y + dy * 0.05, z: t.z + dz * 0.06 },
        { x: v.x, y: v.y + dy, z: v.z + dz }, makeMiniRock(0.34));
      bit.launchT = p.launchT;
    }
    this.fx.puff(t, { n: 6, size: 1, color: 0xffe9b0, life: 0.6 });
    this.fx.sparks(t, 14, 6, 0xffd070);
    this.audio?.pop();
    this.projectiles = this.projectiles.filter((q) => q.alive);
  }

  detonateBomb(p) {
    if (!p.alive || p.det) return;
    p.det = true;
    const t = p.body.translation();
    this.removeProjectile(p);
    this.projectiles = this.projectiles.filter((q) => q.alive);
    this.explode(t, { radius: 9, power: 19, dmg: 850, scale: 1.2 });
  }

  // tap: split cluster / detonate bomb in flight
  tap() {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      if (p.type === 'cluster') this.split(p);
      else if (p.type === 'bomb') this.detonateBomb(p);
    }
  }

  // ------------------------------------------------------------------ explosions
  explode(pos, o = {}) {
    const R_ = o.radius ?? 7.5, power = o.power ?? 16, dmgMax = o.dmg ?? 550, sc = o.scale ?? 1;
    this.fx.explosion(pos, sc);
    this.audio?.explosion(sc, this.pan(pos));
    this.gfx.flash(0.55 * sc);
    this.on.shake?.(0.9 * sc);
    this.on.blast?.(pos, sc);
    const v = this._v;
    const push = (body, mass, d) => {
      const f = 1 - d / R_;
      if (f <= 0) return;
      const t = body.translation();
      v.set(t.x - pos.x, t.y - pos.y, t.z - pos.z);
      const len = Math.max(0.3, v.length());
      v.multiplyScalar(1 / len); v.y += 0.5; v.normalize();
      const imp = mass * power * Math.pow(f, 0.7);
      body.applyImpulse({ x: v.x * imp, y: v.y * imp, z: v.z * imp }, true);
      body.applyTorqueImpulse({ x: (Math.random() - 0.5) * imp * 0.5, y: (Math.random() - 0.5) * imp * 0.5, z: (Math.random() - 0.5) * imp * 0.5 }, true);
    };
    for (const b of this.blocks) {
      if (b.dead) continue;
      const t = b.body.translation();
      const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z) - Math.max(b.s.sx, b.s.sy, b.s.sz) * 0.35;
      if (d >= R_) continue;
      const f = 1 - Math.max(0, d) / R_;
      push(b.body, b.body.mass(), Math.max(0, d));
      b.acc += dmgMax * Math.pow(f, 1.3);
      if (b.tnt && b.fuse < 0) b.fuse = 0.07 + Math.max(0, d) * 0.018 + Math.random() * 0.05;
    }
    for (const f of this.flags) {
      const t = f.body.translation();
      const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
      if (d < R_) push(f.body, f.body.mass(), d);
    }
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const t = p.body.translation();
      const d = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
      if (d < R_) push(p.body, p.body.mass(), d);
    }
    // physical debris pools get kicked too
    for (const pool of Object.values(this.pools)) {
      for (const d of pool.bodies) {
        if (d.t < 0) continue;
        const t = d.body.translation();
        const dd = Math.hypot(t.x - pos.x, t.y - pos.y, t.z - pos.z);
        if (dd < R_) push(d.body, d.body.mass(), dd);
      }
    }
    this.spawnDebris('stone', pos, { x: 0, y: 2, z: 0 }, 6, 12);
    this.fx.chips(pos, 0x6b5b4b, 26, 13, null, 0.2);
    this.fx.chips(pos, 0xd8262b, 10, 10, null, 0.14);
  }

  pan(pos) { return clamp((pos.x - this.gfx.camera.position.x) / 45, -1, 1); }

  // ------------------------------------------------------------------ breaking
  breakBlock(b) {
    if (b.dead) return;
    b.dead = true;
    this.aliveBlocks--;
    const t = b.body.translation(), lv = b.body.linvel();
    this.byCol.delete(b.col.handle);
    // wake whatever was leaning on it
    const wake = new R.Ball(Math.max(b.s.sx, b.s.sy, b.s.sz) * 0.5 + 0.7);
    this.phys.world.intersectionsWithShape(t, { x: 0, y: 0, z: 0, w: 1 }, wake, (c) => {
      const rb = c.parent(); if (rb && rb.isDynamic() && rb.isSleeping()) rb.wakeUp(); return true;
    });
    this.phys.world.removeRigidBody(b.body);
    this.vis.hide(b.h);
    const pan = this.pan(t);
    const M = MATS[b.mat];
    const vel = { x: lv.x, y: lv.y, z: lv.z };
    const size = Math.max(b.s.sx, b.s.sy, b.s.sz);
    if (b.mat === 'glass') {
      this.spawnDebris('glass', t, vel, 9 + size * 2, 6);
      this.fx.chips(t, 0xcdefff, 14, 6, vel, 0.1);
      this.fx.sparks(t, 5, 5, 0xffffff);
      this.audio?.shatter(clamp(size / 2, 0.4, 1), pan);
    } else if (b.mat === 'wood') {
      this.spawnDebris('wood', t, vel, 5 + size * 1.2, 5);
      this.fx.chips(t, 0xc48a4f, 12, 6, vel, 0.13);
      this.fx.puff(t, { n: 3, color: 0xc9a273, size: 1, life: 0.9 });
      this.audio?.splinter(clamp(size / 2, 0.4, 1), pan);
    } else if (b.mat === 'stone') {
      this.spawnDebris('stone', t, vel, 5, 5);
      this.fx.chips(t, 0x9ea3a8, 14, 6, vel, 0.16);
      this.fx.puff(t, { n: 7, color: 0xb9b4a8, size: 1.6, grow: 3, life: 1.7 });
      this.audio?.crumble(clamp(size / 2, 0.4, 1), pan);
    } else if (b.tnt) {
      this.explode(t, { radius: 7.5, power: 16, dmg: 550, scale: 1 });
    }
  }

  // ------------------------------------------------------------------ per-step logic
  step(dt) {
    this.time += dt;
    // moving platforms
    for (const pl of this.platforms) {
      const ramp = Math.min(1, this.time / 2.5), k = ramp * ramp * (3 - 2 * ramp);   // ease in from rest
      const s = Math.sin(this.time / pl.p.period * Math.PI * 2 + pl.p.phase) * pl.p.range * k;
      const ax = pl.p.axis;
      pl.body.setNextKinematicTranslation({ x: pl.base.x + (ax === 'x' ? s : 0), y: pl.base.y + (ax === 'y' ? s : 0), z: pl.base.z + (ax === 'z' ? s : 0) });
    }
    // TNT fuses
    for (const b of this.blocks) {
      if (b.cool > 0) b.cool -= dt;
      if (b.fuse >= 0 && !b.dead) { b.fuse -= dt; if (b.fuse <= 0) { b.acc += 1e9; } }
    }
    if (this.platforms.length && ++this.carriedTick % 20 === 0) this.releaseCarried();
    this.phys.step(dt);
    this.phys.drainForces((ev) => this.onForce(ev.collider1(), ev.collider2(), ev.totalForceMagnitude()));
    this.applyDamage();
    this.updateProjectiles(dt);
    this.checkFlags();
  }

  // blocks that have slid or fallen off a platform may sleep again
  releaseCarried() {
    for (const b of this.blocks) {
      if (!b.carried || b.dead) continue;
      const pt = b.carried.body.translation(), p = b.carried.p;
      const t = b.body.translation();
      if (Math.abs(t.x - pt.x) > p.w / 2 + 2 || Math.abs(t.z - pt.z) > p.d / 2 + 2 || t.y < pt.y - 0.5) b.carried = null;
      else b.body.wakeUp();
    }
    for (const f of this.flags) if (f.carried && !f.fallen) f.body.wakeUp();
  }

  onForce(h1, h2, f) {
    const a = this.byCol.get(h1), b = this.byCol.get(h2);
    this.contact(a, b, f);
    this.contact(b, a, f);
  }

  contact(e, other, f) {
    if (!e) return;
    if (e.type === 'block') {
      const B = e.b;
      if (B.dead) return;
      if (f > B.thrD && this.time > 1.2) B.acc += (f - B.thrD) * DMG_K;   // ignore the first settling shocks
      if (B.cool <= 0) {
        B.cool = 0.16;
        const t = B.body.translation();
        const M = MATS[B.mat];
        const inten = clamp(0.25 + 0.75 * Math.log2(Math.max(1, f / (B.thrD * 0.5 + 1))) / 4, 0.15, 1);
        this.audio?.impact(B.mat, inten, this.pan(t));
        if (inten > 0.35) {
          this.fx.puff(t, { n: Math.round(1 + inten * 3), color: M.dust, size: 0.9, life: 0.9, speed: 1.4 });
          if (inten > 0.5) this.fx.chips(t, M.chip, Math.round(inten * 5), 4, null, 0.1);
        }
        if (other && other.type === 'proj') this.on.shake?.(clamp(f / 30000, 0.04, 0.55));
        else if (f > 9000) this.on.shake?.(0.04);
      }
    } else if (e.type === 'proj') {
      const p = e.p;
      if (!p.impacted) { p.impacted = true; p.impactT = this.time; p.body.setLinearDamping(0.6); p.body.setAngularDamping(1.0); }
      if (other == null || other.type !== 'block') {
        if (!p.thudT || this.time - p.thudT > 0.25) { p.thudT = this.time; this.audio?.thud(clamp(f / 6000, 0.2, 1), this.pan(p.body.translation())); }
      }
    } else if (e.type === 'ball') {
      this.audio?.impact('stone', 0.7, 0);
    }
  }

  applyDamage() {
    for (const b of this.blocks) {
      if (b.dead || b.acc <= 0) continue;
      b.hp -= b.acc; b.acc = 0;
      if (b.hp <= 0) { this.breakBlock(b); continue; }
      const d = 1 - b.hp / b.maxHp;
      this.vis.damage(b.h, d);
      const stage = d > 0.7 ? 2 : d > 0.35 ? 1 : 0;
      if (stage > b.stage) {
        b.stage = stage;
        const t = b.body.translation();
        this.audio?.crack(b.mat, this.pan(t));
        this.fx.chips(t, MATS[b.mat].chip, 5 + stage * 3, 4, null, 0.1);
        this.fx.puff(t, { n: 3, color: MATS[b.mat].dust, size: 0.8, life: 0.8 });
      }
    }
  }

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.age += dt;
      const t = p.body.translation();
      if (t.y < -14 || t.x > 150 || t.x < -110) { this.removeProjectile(p); continue; }
      if (p.type === 'bomb' && p.impacted && p.age > 0.08) { this.detonateBomb(p); continue; }
    }
    this.projectiles = this.projectiles.filter((p) => p.alive);
  }

  checkFlags() {
    for (const f of this.flags) {
      if (f.fallen) continue;
      const t = f.body.translation(), q = f.body.rotation();
      let rx = 0, ry = 0;
      if (f.ref != null) { const pt = this.platforms[f.ref].body.translation(); rx = pt.x - this.platforms[f.ref].base.x; ry = pt.y - this.platforms[f.ref].base.y; }
      const up = 1 - 2 * (q.x * q.x + q.z * q.z);
      const drop = (f.y0 + ry) - t.y;
      const off = Math.hypot(t.x - rx - f.x0, t.z - (f.f.z));
      if (drop > 1.8 || up < 0.45 || off > 6 || t.y < groundY(t.x) + 0.7) {
        f.fallen = true;
        this.root.remove(f.marker);
        this.flagsDown++;
        const left = this.flagsTotal - this.flagsDown;
        this.fx.sparks({ x: t.x, y: t.y + 2, z: t.z }, 26, 9, 0xffe070);
        this.fx.puff({ x: t.x, y: t.y + 1, z: t.z }, { n: 4, color: 0xffffff, size: 1, life: 0.8 });
        this.audio?.flagDown(this.flagsDown, this.pan(t));
        this.on.flagDown?.(f, left, this.flagsTotal, t);
      }
    }
  }

  // ------------------------------------------------------------------ visuals
  syncVisuals(dt, time, first = false) {
    const vis = this.vis;
    if (!vis) return;
    const wasIntro = this.introT < this.maxDelay + 0.6;
    if (wasIntro) this.introT += dt;
    const intro = this.introT < this.maxDelay + 0.6;
    if (wasIntro && !intro) first = true;
    let movers = 0, cx = 0, cy = 0, cz = 0, maxS = 0;
    for (const b of this.blocks) {
      if (b.dead) continue;
      if (intro) {
        const t = b.body.translation(), q = b.body.rotation();
        const k = easeOutBack((this.introT - b.delay) / 0.45);
        if (k <= 0) vis.hide(b.h); else vis.setScale(b.h, t, q, Math.max(0.001, k));
        continue;
      }
      const awake = !b.body.isSleeping();
      if (!awake && !b.wasAwake && !first) continue;
      const t = b.body.translation(), q = b.body.rotation();
      vis.set(b.h, t, q);
      b.wasAwake = awake;
      if (awake) {
        const v = b.body.linvel();
        const sp2 = v.x * v.x + v.y * v.y + v.z * v.z;
        if (sp2 > maxS) maxS = sp2;
        if (sp2 > 12) { movers++; cx += t.x; cy += t.y; cz += t.z; }
        if (t.y < -25) { b.acc += 1e9; }
      }
    }
    this.movers = movers; this.maxSpeed = Math.sqrt(maxS);
    if (movers) this.moverCenter.set(cx / movers, cy / movers, cz / movers);

    for (const f of this.flags) {
      const t = f.body.translation(), q = f.body.rotation();
      f.g.position.set(t.x, t.y, t.z); f.g.quaternion.set(q.x, q.y, q.z, q.w);
      if (intro) f.g.scale.setScalar(Math.max(0.001, easeOutBack((this.introT - 0.5) / 0.5)));
      else if (f.g.scale.x !== 1) f.g.scale.setScalar(1);
      waveFlag(f.g, time, f.phase, f.fallen);
      if (!f.fallen) {
        const bob = Math.sin(time * 3 + f.phase) * 0.25;
        f.marker.position.set(t.x, t.y + FLAG.baseH + FLAG.poleH + 2.1 + bob, t.z);
        f.marker.visible = !intro || this.introT > 1.0;
      }
    }
    for (const p of this.pendulums) {
      const t = p.body.translation(), q = p.body.rotation();
      p.g.quaternion.set(q.x, q.y, q.z, q.w);
    }
    for (const pl of this.platforms) {
      const t = pl.body.translation();
      pl.g.position.set(t.x, t.y, t.z);
    }
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      const t = p.body.translation(), q = p.body.rotation();
      p.mesh.position.set(t.x, t.y, t.z); p.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      const v = p.body.linvel();
      const sp = Math.hypot(v.x, v.y, v.z);
      p.speed = sp;
      p.trailT -= dt;
      if (!p.impacted && sp > 10 && p.trailT <= 0) {
        p.trailT = 0.03;
        this.fx.trail(t, p.type === 'bomb' ? 0x777777 : 0xffffff, p.type === 'boulder' ? 0.7 : 0.45);
      }
      if (p.type === 'bomb') {
        const tip = p.mesh.userData.tip;
        const wp = tip.getWorldPosition(this._v);
        if (Math.random() < 0.6) this.fx.sparks(wp, 1, 3, 0xffa030);
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 14);
        p.mesh.userData.ring.material.emissive?.setRGB(pulse * 0.9, 0, 0);
      }
      // water
      const under = t.y - p.r < WATER_Y && groundY(t.x) < WATER_Y - 0.05;
      if (under && !p.inWater) {
        p.inWater = true;
        if (sp > 3) { this.fx.splash({ x: t.x, y: WATER_Y, z: t.z }, clamp(p.r * 1.6, 0.8, 1.6)); this.audio?.splash(this.pan(t)); }
      } else if (!under) p.inWater = false;
    }
    // debris pools
    for (const pool of Object.values(this.pools)) {
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
      let dirty = false;
      pool.bodies.forEach((d, i) => {
        if (d.t < 0) return;
        d.t += dt;
        if (d.t > d.life) { d.t = -1; d.body.setEnabled(false); m.makeScale(0, 0, 0); pool.mesh.setMatrixAt(i, m); dirty = true; return; }
        const t = d.body.translation(), r = d.body.rotation();
        const k = clamp((d.life - d.t) / 0.6, 0, 1) * d.s;
        m.compose(v.set(t.x, t.y, t.z), q.set(r.x, r.y, r.z, r.w), s.set(k, k, k));
        pool.mesh.setMatrixAt(i, m); dirty = true;
      });
      if (dirty) pool.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ queries
  isQuiet() {
    return this.maxSpeed < 0.7 && this.movers === 0;
  }
  projectilesActive() {
    return this.projectiles.some((p) => p.alive && (!p.impacted || (p.speed || 0) > 1.5) && p.age < 12);
  }
}
