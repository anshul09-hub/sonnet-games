// The capture cinematic: slow motion, close-up camera, weapon, real mesh slicing, physics pieces flying into the grass.
// CaptureDirector picks the attacker's chosen finisher; Stage gives finishers the building blocks.
import * as THREE from 'three';
import { sliceObject, shatter, voxelize } from '../core/slicer.js';
import { outlineAll, T } from '../core/toon.js';
import { audio } from '../audio/audio.js';
import { COLOR_HEX } from './rules.js';
import { FINISHERS } from './finishers.js';
import { ease, hex, lerp, clamp, params } from '../core/util.js';
import { G as PG } from '../core/physics.js';
import { SPRITE } from '../core/fx.js';

export class CaptureDirector {
  constructor(game) { this.g = game; this.live = []; }

  async play(e) {
    const g = this.g;
    for (const v of e.victims) {
      const A = g.pieces.tokens[e.seat][e.tok], V = g.pieces.tokens[v.seat][v.tok];
      if (g.fast && !params.get('cinematic')) { g.fx.dust(g.pieces.worldOf(V), 6); await g.pieces.respawn(v.seat, v.tok); continue; }
      const id = g.seatLook(e.seat).finisher;
      const fin = FINISHERS[id] || FINISHERS.katana;
      const stage = new Stage(this, A, V, e, id);
      g.captureLive = stage;
      try { await stage.begin(); await fin(stage); } catch (err) { console.error('finisher failed', (err && err.stack) || err); }
      await stage.end();
      g.captureLive = null;
    }
  }

  update(dt) { for (const s of this.live) s.update(dt); }
  onContact(a, b) {
    const s = this.live[0]; if (!s) return;
    const hit = (it) => it && it.userData && it.userData.piece;
    const p = hit(a) ? a : hit(b) ? b : null; if (!p) return;
    const v = p.body.linvel(); const sp = Math.hypot(v.x, v.y, v.z);
    if (sp > 1.5 && performance.now() - (this._lastHit || 0) > 90) { this._lastHit = performance.now(); audio.sfx('crack'); if (sp > 6) audio.sfx('land'); }
  }
  dispose() { for (const s of this.live.slice()) s.abort(); }
}

export class Stage {
  constructor(dir, A, V, e, finisherId) {
    this.dir = dir; this.g = dir.g; this.A = A; this.V = V; this.e = e; this.id = finisherId;
    this.scene = this.g.scene; this.phys = this.g.phys; this.fx = this.g.fx; this.rig = this.g.rig; this.clock = this.g.clock; this.screen = this.g.app.screenFx;
    this.pieces = []; this.temp = []; this.attColor = COLOR_HEX[A.colorIdx]; this.vicColor = COLOR_HEX[V.colorIdx];
    this.ups = new THREE.Vector3(0, 1, 0);
    this.updaters = [];
    this.aborted = false;
  }

  // ------------------------------------------------------------ setup / teardown
  async begin() {
    const g = this.g, { A, V } = this;
    this.dir.live.push(this);
    g.shotActive = true; g.boost = 1;
    audio.duck(0.25, 6);
    g.world.focusVillagers?.();
    // stage geometry from the current camera
    const cam = g.camera; const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    this.fwdH = fwd; this.right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    this.C = g.pieces.worldOf(A); this.C.y = 0.08;
    const bc = new THREE.Vector3(0, 0, 0);
    this.dirOut = new THREE.Vector3(this.C.x - bc.x, 0, this.C.z - bc.z); if (this.dirOut.length() < 1.5) this.dirOut.copy(this.right).multiplyScalar(-1); this.dirOut.normalize();
    // pick the kick side: away from the board centre but not toward the camera-blocked HUD
    this.scene.attach(A.group); this.scene.attach(V.group);
    this.aPos = this.C.clone().addScaledVector(this.right, -0.62); this.vPos = this.C.clone().addScaledVector(this.right, 0.62);
    A.group.position.copy(this.aPos); V.group.position.copy(this.vPos);
    A.hopT = V.hopT = true; // stop board-driven positioning
    A.face = Math.atan2(this.right.x, this.right.z); V.face = Math.atan2(-this.right.x, -this.right.z);
    A.group.rotation.y = A.face; V.group.rotation.y = V.face;
    A.stack = V.stack = null; A.scale = V.scale = 1;
    // hide beacons
    A.beacon.visible = V.beacon.visible = false;
    this.screen.letterbox(true); this.screen.vignette(true, '#000');
    audio.sfx('whoosh');
    this.mid = this.C.clone();
    this.closeUp(5.2, 2.0, 0.6, 30, 3.2);
    await this.wait(0.55);
  }

  /** Camera close-up on the stage centre (given offsets are relative to the camera-facing frame). */
  closeUp(dist = 4.6, height = 2.0, lateral = 0.6, fov = 30, stiff = 4, target = null) {
    const t = target || this.C.clone().setY(0.7);
    const pos = t.clone().addScaledVector(this.fwdH, -dist).addScaledVector(this.right, lateral).setY(height);
    this.rig.goTo(pos, t, fov, stiff);
  }
  camShot(pos, look, fov = 30, stiff = 4) { this.rig.goTo(pos, look, fov, stiff); }

  async end() {
    const g = this.g, { A, V } = this;
    this.screen.letterbox(false); this.screen.vignette(false); this.screen.clear?.();
    this.slow(1);
    g.boost = 1;
    // put the attacker back on its square
    A.group.rotation.set(0, A.group.rotation.y, 0);
    g.board.group.attach(A.group);
    A.hopT = null; V.hopT = null;
    g.pieces.layoutAll(g.display, true);
    A.group.position.copy(g.board.tokenPos(A.colorIdx, this.e.at, A.idx, null));
    A.tok.group.scale.set(1, 1, 1); A.squash = 0; A.scale = 1;
    g.board.group.attach(V.group); V.group.visible = false;
    g.homeShot(2.4);
    g.world.cheer?.(1);
    audio.sfx('cheer', { v: 1 }); g.world.release?.();
    await this.fadePieces();
    V.group.visible = true; V.group.rotation.set(0, 0, 0); V.tok.group.scale.set(1, 1, 1); V.tok.group.rotation.set(0, 0, 0); V.tok.group.position.set(0, 0, 0);
    await g.pieces.respawn(V.seat, V.idx);
    this.dir.live = this.dir.live.filter((s) => s !== this);
    g.shotActive = false; g.frameCamera(false);
  }
  abort() { this.aborted = true; this.dir.live = this.dir.live.filter((s) => s !== this); }

  // ------------------------------------------------------------ timing helpers
  /** Named moment in the choreography (tests can freeze the game a moment after it to take screenshots). */
  phase(name) { const g = this.g; g.onPhase?.(name, this.id); if (g.freezeAt && g.freezeAt.name === name) g.clock.after(g.freezeAt.after ?? 0.1, () => { g.freeze = true; window.__frozen = name; }); }
  wait(s) { return this.clock.wait(s); }
  tween(s, fn, e = ease.inOutQuad) { return this.clock.tween(s, fn, e); }
  slow(v) { this.g.slowmo = v; }
  /** ramp time scale smoothly */
  update(dt) { for (const u of this.updaters) u(dt); }
  addUpdater(fn) { this.updaters.push(fn); return () => { this.updaters = this.updaters.filter((f) => f !== fn); }; }

  // ------------------------------------------------------------ effects
  shake(a) { this.rig.shake(a); }
  flash(c = '#fff', d = 0.25, a = 0.9) { this.screen.flash(c, d, a); }
  speedLines(d = 1.2, c = '#fff') { this.screen.speedLines(d, c); }
  impact(p, { size = 3, color = 0xffffff, sparks = 30, ring = 4 } = {}) {
    this.fx.flash(p, size, color); this.fx.ring(p, ring, color, 0.5); this.fx.sparks(p, sparks, 0xffe08a, 6);
    this.fx.emit({ p, n: 10, v: [0, 1, 0], vr: [3, 2, 3], life: 0.6, size: 0.3, size1: 0.9, color: 0xffffff, alpha: 0.6, alpha1: 0, drag: 3, frame: SPRITE.SMOKE });
  }
  banner(text, sub, color) { this.screen.banner(text, sub, color, 1300); }

  // ------------------------------------------------------------ objects
  add(o) { this.scene.add(o); this.temp.push(o); return o; }
  remove(o) { this.scene.remove(o); this.temp = this.temp.filter((x) => x !== o); }

  /** Give a group (already positioned in world space) a rigid body. Returns the piece. */
  makePiece(group, { vel = null, ang = null, density = 1.4, restitution = 0.3, friction = 0.8, outline = true } = {}) {
    if (!group.parent) this.scene.add(group);
    if (T.outlines && outline) outlineAll(group, 0.02, 0x1c1226);
    group.updateMatrixWorld(true);
    const item = this.phys.add(group, { shape: 'compound', density, restitution, friction, linDamp: 0.05, angDamp: 0.2, ccd: true, vel: vel && { x: vel.x, y: vel.y, z: vel.z }, angVel: ang && { x: ang.x, y: ang.y, z: ang.z }, groups: (PG.PIECE << 16) | (PG.STATIC | PG.PIECE) });
    item.userData.piece = true;
    const piece = { group, item }; this.pieces.push(piece); return piece;
  }
  pieceFrom(obj, opts) { return this.makePiece(obj, opts); }
  impulse(piece, v, at = null) { piece.item.body.applyImpulse({ x: v.x, y: v.y, z: v.z }, true); }
  spin(piece, w) { piece.item.body.setAngvel({ x: w.x, y: w.y, z: w.z }, true); }
  velocity(piece, v) { piece.item.body.setLinvel({ x: v.x, y: v.y, z: v.z }, true); }
  massOf(piece) { return piece.item.body.mass(); }

  /** Slice the victim along `plane`, hide the original and return the two half pieces. */
  sliceVictim(plane) {
    const V = this.V; V.group.updateMatrixWorld(true);
    const { a, b } = sliceObject(V.tok.group, plane, { capColor: null });
    V.group.visible = false;
    const out = [];
    for (const half of [a, b]) if (half) { out.push(this.makePiece(half)); }
    return out;
  }
  /** Slice an existing piece again (for multi-cut finishers). */
  slicePiece(piece, plane) {
    piece.group.updateMatrixWorld(true);
    const { a, b } = sliceObject(piece.group, plane);
    const v = piece.item.body.linvel(); const vel = { x: v.x, y: v.y, z: v.z };
    this.dropPiece(piece);
    return [a, b].filter(Boolean).map((h) => this.makePiece(h, { vel }));
  }
  dropPiece(piece) { this.phys.remove(piece.item); this.scene.remove(piece.group); this.pieces = this.pieces.filter((p) => p !== piece); }

  /** Launch every piece off the board towards dirOut with some randomness. */
  kickOff(pieces, power = 1, up = 0.6) {
    for (const p of pieces) {
      const d = this.dirOut.clone().add(this.right.clone().multiplyScalar((Math.random() - 0.5) * 0.7)).normalize();
      const m = this.massOf(p), sp = (7 + Math.random() * 4) * power;
      this.impulse(p, new THREE.Vector3(d.x * sp, (4 + Math.random() * 3 + up * 4) * 1, d.z * sp).multiplyScalar(m));
      this.spin(p, new THREE.Vector3(Math.random() * 14 - 7, Math.random() * 14 - 7, Math.random() * 14 - 7));
    }
    audio.sfx('kick'); audio.sfx('whoosh');
  }

  /** Attacker jump-stomp on a point (squash on landing, dust, shake). */
  async attackerJump(to, { h = 1.2, dur = 0.42, land = true } = {}) {
    const A = this.A, from = A.group.position.clone();
    A.face = Math.atan2(to.x - from.x, to.z - from.z);
    audio.sfx('hop', { n: 4 });
    await this.tween(dur, (e, p) => { A.group.position.lerpVectors(from, to, e); A.group.position.y = lerp(from.y, to.y, e) + Math.sin(p * Math.PI) * h; A.squash = Math.sin(p * Math.PI) * 0.25; A.group.rotation.y += (A.face - A.group.rotation.y) * 0.3; }, ease.linear);
    if (land) { A.squash = -0.35; this.fx.dust(to.clone().setY(0.1), 12, 0xd8cdb4); audio.sfx('land'); this.shake(0.25); }
  }
  async attackerSettle() { const A = this.A; await this.tween(0.25, (e) => { A.squash = -0.35 * (1 - ease.outElastic(e)); }, ease.linear); A.squash = 0; }

  /** Tracking shot following a piece for `sec` game-seconds. */
  async follow(piece, sec = 1.6, dist = 5.5, fov = 32) {
    const t0 = this.clock.t;
    while (this.clock.t - t0 < sec && !this.aborted) {
      const p = piece.group.position; const look = p.clone().setY(Math.max(0.5, p.y));
      const pos = look.clone().addScaledVector(this.fwdH, -dist * 0.8).addScaledVector(this.right, 1.5).setY(Math.max(look.y + 3.2, 4.2));
      this.rig.goTo(pos, look, fov, 3.5);
      await this.wait(0.05);
    }
  }
  /** Wait until every piece has slowed or `max` seconds passed. */
  async settle(max = 3) {
    const t0 = this.clock.t;
    while (this.clock.t - t0 < max && !this.aborted) {
      const moving = this.pieces.some((p) => { const v = p.item.body.linvel(); return Math.hypot(v.x, v.y, v.z) > 0.6 || p.group.position.y > 0.2; });
      if (!moving) break; await this.wait(0.1);
    }
  }
  async fadePieces() {
    const list = this.pieces.slice(); if (!list.length) { this.cleanTemp(); return; }
    await this.tween(0.6, (e) => { for (const p of list) p.group.scale.setScalar(Math.max(0.001, 1 - e)); }, ease.inQuad);
    for (const p of list) { this.fx.dust(p.group.position, 6, 0xd8cdb4); this.dropPiece(p); }
    this.cleanTemp();
  }
  cleanTemp() { for (const o of this.temp.slice()) this.remove(o); }
}
