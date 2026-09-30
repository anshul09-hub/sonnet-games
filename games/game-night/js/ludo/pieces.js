// Token meshes on the board: creation, stacking layout, hop animation (squash & stretch, dust), highlights.
import * as THREE from 'three';
import { buildToken } from '../customize/tokens.js';
import { emitTrail, trailBurst } from '../customize/trails.js';
import { COLOR_HEX, HOME, absOf, isSafeRel } from './rules.js';
import { audio } from '../audio/audio.js';
import { ease, damp, lerp, wrapAngle } from '../core/util.js';

const KEY = (color, rel, tok) => (rel < 0 ? 'b' + color + tok : rel <= 50 ? 'a' + absOf(color, rel) : rel <= 55 ? 'l' + color + rel : 'h' + color);

export class Pieces {
  /** @param game object exposing board, clock, fx, seatsLook(seat) -> look, seatColor(seat) */
  constructor(game) {
    this.g = game; this.tokens = []; this.pickables = []; this.legal = new Set(); this.hopping = 0;
    this.trailState = {};
  }

  build(seatCount) {
    const { board } = this.g;
    for (let s = 0; s < seatCount; s++) {
      this.tokens[s] = [];
      const colorIdx = this.g.seatColor(s), look = this.g.seatLook(s);
      for (let k = 0; k < 4; k++) {
        const tok = buildToken(look.skin, COLOR_HEX[colorIdx]);
        const group = new THREE.Group(); group.add(tok.group);
        const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 10), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 0.7; hit.userData.piece = { seat: s, tok: k }; group.add(hit);
        const beacon = this.makeBeacon(COLOR_HEX[colorIdx]); beacon.visible = false; group.add(beacon);
        const t = { seat: s, idx: k, colorIdx, tok, group, hit, beacon, rel: -1, scale: 1, face: 0, squash: 0, hopT: null };
        board.group.add(group); this.tokens[s].push(t); this.pickables.push(hit);
      }
    }
  }

  makeBeacon(color) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.36, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); arrow.rotation.x = Math.PI; g.add(arrow);
    g.userData = { ring, arrow };
    return g;
  }

  /** Set every token to the position implied by `state` (no animation). */
  layoutAll(state, immediate = true) {
    const groups = new Map();
    state.tokens.forEach((arr, s) => arr.forEach((rel, k) => { const key = KEY(this.g.seatColor(s), rel, k); (groups.get(key) || groups.set(key, []).get(key)).push([s, k]); }));
    for (const list of groups.values()) list.forEach(([s, k], i) => {
      const t = this.tokens[s][k]; t.rel = state.tokens[s][k];
      t.stack = { index: i, count: list.length };
      if (t.hopT) return;
      const p = this.g.board.tokenPos(t.colorIdx, t.rel, k, t.stack);
      if (immediate) t.group.position.copy(p); else t.target = p;
      t.scale = list.length > 1 ? 0.82 : 1;
    });
  }

  worldPos(s, k, target = new THREE.Vector3()) { const t = this.tokens[s][k]; return t.group.getWorldPosition(target); }

  /** Smoothly re-spread tokens that share a cell (after a move). */
  settleStacks(state) {
    const before = this.tokens.map((a) => a.map((t) => t.hopT));
    this.layoutAll(state, false);
  }

  /** Animate a token along `path` (relative positions). Resolves when it has landed on the last square. */
  async hop(seat, tok, path, { leave = false } = {}) {
    const t = this.tokens[seat][tok], clock = this.g.clock, board = this.g.board;
    t.hopT = true; this.hopping++;
    let from = t.group.position.clone();
    const look = this.g.seatLook(seat);
    const stepDur = leave ? 0.55 : 0.24;
    for (let i = 0; i < path.length; i++) {
      const rel = path[i];
      const to = board.tokenPos(t.colorIdx, rel, tok, null);
      const dir = new THREE.Vector3().subVectors(to, from);
      if (dir.lengthSq() > 1e-4) t.face = Math.atan2(dir.x, dir.z);
      const h = leave ? 1.2 : 0.42 + (i === path.length - 1 ? 0.06 : 0);
      audio.sfx('hop', { n: i + (leave ? 0 : 0) });
      await clock.tween(stepDur, (e, p) => {
        t.group.position.lerpVectors(from, to, e); t.group.position.y = lerp(from.y, to.y, e) + Math.sin(p * Math.PI) * h;
        const st = Math.sin(p * Math.PI); t.squash = st * 0.22; // stretch while airborne
        if (this.g.fx) emitTrail(this.g.fx, look.trail, this.worldOf(t), 1 / 60 * this.g.clock.scale, (this.trailState[seat + ':' + tok] ||= {}));
      }, ease.linear);
      t.group.position.copy(to);
      // landing squash + dust
      t.squash = -0.3; audio.sfx('land');
      if (this.g.fx) this.g.fx.dust(this.worldOf(t), leave ? 10 : 5, this.g.dustColor);
      this.g.onHopLand?.(seat, tok, rel, i, path.length);
      from = to;
      if (i < path.length - 1) await clock.wait(0.02);
    }
    t.hopT = null; this.hopping--;
    await clock.tween(0.22, (e) => { t.squash = -0.3 * (1 - ease.outElastic(e)); }, ease.linear);
    t.squash = 0;
  }

  worldOf(t) { return t.group.getWorldPosition(new THREE.Vector3()); }

  /** Send a captured token back to its base slot with a pop-in. */
  async respawn(seat, tok) {
    const t = this.tokens[seat][tok], clock = this.g.clock;
    const p = this.g.board.tokenPos(t.colorIdx, -1, tok, null);
    t.group.position.copy(p); t.group.visible = true; t.rel = -1; t.hopT = null; t.stack = null; t.squash = 0;
    audio.sfx('spawn');
    if (this.g.fx) { const w = this.worldOf(t); this.g.fx.emit({ p: [w.x, w.y + 0.5, w.z], n: 18, v: [0, 2, 0], vr: [1.6, 1.4, 1.6], life: 0.7, size: 0.16, size1: 0.02, color: COLOR_HEX[t.colorIdx], alpha: 1, alpha1: 0, add: true, frame: 2, g: -3 }); this.g.fx.ring(w, 2.2, COLOR_HEX[t.colorIdx]); }
    await clock.tween(0.55, (e) => { t.scale = Math.max(0.001, e); }, ease.outBack);
    t.scale = 1;
  }

  setHighlight(list) {
    this.legal = new Set(list.map(([s, k]) => s + ':' + k));
    for (const arr of this.tokens) for (const t of arr) t.beacon.visible = this.legal.has(t.seat + ':' + t.idx);
  }

  /** Per-frame: idle animations, facing, squash/stretch, beacons. */
  update(dt, time) {
    const yaw = this.g.board.group.rotation.y;
    for (const arr of this.tokens) for (const t of arr) {
      t.tok.tick(time + t.idx, dt);
      if (!t.hopT && t.target) { t.group.position.lerp(t.target, 1 - Math.exp(-10 * dt)); if (t.group.position.distanceToSquared(t.target) < 1e-5) t.target = null; }
      const want = t.hopT ? t.face : -yaw + (t.colorIdx - 1.5) * 0.06;
      t.group.rotation.y += wrapAngle(want - t.group.rotation.y) * Math.min(1, dt * (t.hopT ? 14 : 5));
      const q = t.squash, sc = t.scale;
      t.tok.group.scale.set(sc * (1 - q * 0.45), sc * (1 + q), sc * (1 - q * 0.45));
      if (t.beacon.visible) { const b = t.beacon.userData; b.arrow.position.y = t.tok.height + 0.42 + Math.abs(Math.sin(time * 5 + t.idx)) * 0.22; b.arrow.rotation.y = time * 3; b.ring.scale.setScalar(1 + Math.sin(time * 6) * 0.08); b.ring.material.opacity = 0.6 + Math.sin(time * 6) * 0.35; }
    }
  }

  dispose() { for (const arr of this.tokens) for (const t of arr) t.group.parent?.remove(t.group); this.tokens = []; this.pickables = []; }
}
