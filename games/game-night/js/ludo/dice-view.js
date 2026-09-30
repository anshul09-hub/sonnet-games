// The dice tray + die: builds the tray in the scene, replays a recorded physics throw, shows the resting/idle die.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildDie } from '../customize/dice-skins.js';
import { TRAY } from './dice-sim.js';
import { toon, std, mesh, outlineAll, canvasTex } from '../core/toon.js';
import { audio } from '../audio/audio.js';
import { ease, lerp, clamp } from '../core/util.js';

export const TRAY_SCALE = 1.15;
const REST = new THREE.Vector3(0, 0.5, TRAY.hz - 0.85);
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

export class DiceView {
  constructor(game, styleId, dieSkin) {
    this.g = game; this.styleId = styleId;
    this.root = new THREE.Group(); this.tray = new THREE.Group(); this.tray.scale.setScalar(TRAY_SCALE); this.root.add(this.tray);
    this._buildTray(styleId);
    this.setDie(dieSkin);
    this.state = 'rest'; this.play = null; this.active = false; this.result = null; this.t = 0;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide })); this.ring.rotation.x = -Math.PI / 2; this.ring.position.set(REST.x, 0.02, REST.z); this.tray.add(this.ring);
    // an invisible slab used for picking the flick zone
    this.hit = new THREE.Mesh(new THREE.BoxGeometry(TRAY.hx * 2 + 0.6, 2.4, TRAY.hz * 2 + 0.6), new THREE.MeshBasicMaterial({ visible: false })); this.hit.position.y = 1.2; this.tray.add(this.hit);
    this.rest();
  }

  _buildTray(id) {
    const T = this.tray, { hx, hz } = TRAY;
    const P = {
      anime: { floor: 0x2f8a5e, wall: 0xa4703f, trim: 0xffd23f, stand: 0x6b4a2a, toon: true },
      gamer: { floor: 0x1a1044, wall: 0x2a1a70, trim: 0xff2bd6, stand: 0x120a30, toon: false },
      tech: { floor: 0x0a2438, wall: 0x0d3a5c, trim: 0x39e6ff, stand: 0x061420, toon: false },
    }[id] || {};
    const M = (c, glow = false) => (P.toon ? toon(c) : glow ? new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: 1.6 }) : std(c, { rough: 0.5, metal: 0.4 }));
    const floorTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); if (id === 'anime') { const r = Math.random; for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.05})`; g.fillRect(r() * w, r() * h, 2, 2); } } else { g.strokeStyle = id === 'gamer' ? 'rgba(255,43,214,.5)' : 'rgba(57,230,255,.5)'; g.lineWidth = 2; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } } }, { repeat: false });
    const fm = M(P.floor); fm.map = floorTex; fm.needsUpdate = true;
    const floor = mesh(new THREE.BoxGeometry(hx * 2 + 0.6, 0.4, hz * 2 + 0.6), fm, { pos: [0, -0.2, 0], receive: true }); T.add(floor);
    const wallGeo = (w, d) => new RoundedBoxGeometry(w, 1.05, d, 3, 0.14);
    const ww = 0.5;
    T.add(mesh(wallGeo(hx * 2 + 1.6, ww), M(P.wall), { pos: [0, 0.5, -hz - 0.3 - ww / 2 + 0.05], receive: true }));
    T.add(mesh(wallGeo(hx * 2 + 1.6, ww), M(P.wall), { pos: [0, 0.5, hz + 0.3 + ww / 2 - 0.05], receive: true }));
    T.add(mesh(wallGeo(ww, hz * 2 + 0.6), M(P.wall), { pos: [-hx - 0.3 - ww / 2 + 0.05, 0.5, 0], receive: true }));
    T.add(mesh(wallGeo(ww, hz * 2 + 0.6), M(P.wall), { pos: [hx + 0.3 + ww / 2 - 0.05, 0.5, 0], receive: true }));
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) T.add(mesh(new THREE.SphereGeometry(0.26, 12, 10), M(P.trim, id !== 'anime'), { pos: [x * (hx + 0.55), 1.02, z * (hz + 0.55)] }));
    // stand down to the ground so the tray looks like it sits on a small table
    const stand = mesh(new THREE.BoxGeometry(hx * 2 + 0.2, 1.0, hz * 2 + 0.2), M(P.stand), { pos: [0, -0.9, 0] }); T.add(stand);
    if (id === 'anime') outlineAll(T, 0.03, 0x1c1226);
  }

  setDie(skin) {
    if (this.die) { this.tray.remove(this.die); this.die.geometry !== undefined && this.die.material.forEach?.((m) => m.map?.dispose?.()); }
    this.die = buildDie(skin); this.tray.add(this.die); this.dieSkin = skin;
    this.rest();
  }

  /** Place the tray in world space. layout: 'front' (below the board) or 'side' (right of the board). */
  place(layout, boardHalf = 8.3) {
    const depth = (hz) => boardHalf + 0.55 + (hz + 0.7) * TRAY_SCALE;
    this.layout = layout;
    if (layout === 'side') { this.root.position.set(boardHalf + 0.55 + (TRAY.hz + 0.7) * TRAY_SCALE, 0, 0); this.root.rotation.y = Math.PI / 2; }
    else { this.root.position.set(0, 0, depth(TRAY.hz)); this.root.rotation.y = 0; }
  }
  /** World-space corners of the tray (for camera fitting). */
  corners() {
    const out = [], hx = (TRAY.hx + 0.9) * TRAY_SCALE, hz = (TRAY.hz + 0.9) * TRAY_SCALE;
    for (const [sx, sz, y] of [[-1, -1, 0], [1, -1, 0], [-1, 1, 0], [1, 1, 0], [-1, -1, 1.6], [1, 1, 1.6]]) out.push(new THREE.Vector3(sx * hx, y, sz * hz).applyEuler(this.root.rotation).add(this.root.position));
    return out;
  }

  rest() {
    this.state = 'rest'; this.play = null;
    if (this.die) { this.die.position.copy(REST); this.die.quaternion.setFromEuler(new THREE.Euler(0.4, 0.7, 0.2)); }
  }
  setActive(on) { this.active = on; }

  /** Ray test against the flick zone. */
  hitTest(raycaster) { return raycaster.intersectObject(this.hit, false).length > 0; }
  /** Convert a world-space delta on the ground plane into tray-local throw direction. */
  worldDirToLocal(dx, dz) { const c = Math.cos(-this.root.rotation.y), s = Math.sin(-this.root.rotation.y); return { x: dx * c + dz * s, z: -dx * s + dz * c }; }

  /**
   * Replay a recorded throw. Resolves when the die has settled. `fast` skips the tumble (test mode).
   */
  async playThrow(res, { fast = false } = {}) {
    const die = this.die, clock = this.g.clock;
    this.result = null;
    audio.sfx('diceThrow');
    if (fast) { this._pose(res.frames, res.n - 1); this.state = 'settled'; this.result = res.value; return; }
    // lift from rest to the first frame
    const from = die.position.clone(), qf = die.quaternion.clone();
    const f0 = new THREE.Vector3(res.frames[0], res.frames[1], res.frames[2]), q0 = new THREE.Quaternion(res.frames[3], res.frames[4], res.frames[5], res.frames[6]);
    await clock.tween(0.14, (e) => { die.position.lerpVectors(from, f0, e); die.position.y += Math.sin(e * Math.PI) * 0.4; die.quaternion.slerpQuaternions(qf, q0, e); }, ease.outQuad);
    this.state = 'flying';
    await new Promise((resolve) => { this.play = { res, i: 0, hit: 0, resolve }; });
    this.state = 'settled'; this.result = res.value; this.play = null;
    audio.sfx('diceLand');
  }

  _pose(frames, i) {
    const o = i * 7;
    this.die.position.set(frames[o], frames[o + 1], frames[o + 2]);
    this.die.quaternion.set(frames[o + 3], frames[o + 4], frames[o + 5], frames[o + 6]);
  }

  /** Move the settled die back to its resting spot (called when the next roll is requested). */
  async returnToRest() {
    const die = this.die, clock = this.g.clock;
    const from = die.position.clone(), qf = die.quaternion.clone(), qt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0.7, 0.2));
    await clock.tween(0.35, (e) => { die.position.lerpVectors(from, REST, e); die.position.y += Math.sin(e * Math.PI) * 1.0; die.quaternion.slerpQuaternions(qf, qt, e); }, ease.inOutQuad);
    this.state = 'rest';
  }

  update(dt, time) {
    this.t += dt;
    const p = this.play;
    if (p) {
      const { res } = p; p.i += dt * 60;
      const i0 = Math.min(res.n - 1, Math.floor(p.i)), i1 = Math.min(res.n - 1, i0 + 1), f = p.i - Math.floor(p.i);
      const a = i0 * 7, b = i1 * 7, F = res.frames;
      this.die.position.set(lerp(F[a], F[b], f), lerp(F[a + 1], F[b + 1], f), lerp(F[a + 2], F[b + 2], f));
      _q1.set(F[a + 3], F[a + 4], F[a + 5], F[a + 6]); _q2.set(F[b + 3], F[b + 4], F[b + 5], F[b + 6]); this.die.quaternion.slerpQuaternions(_q1, _q2, f);
      while (p.hit < res.hits.length && res.hits[p.hit][0] <= p.i) { audio.sfx('dice', { v: res.hits[p.hit][1] }); if (res.hits[p.hit][1] > 0.4 && this.g.fx) this.g.fx.dust(this.die.getWorldPosition(new THREE.Vector3()).setY(this.root.position.y + 0.1), 3, 0xd8cdb4); p.hit++; }
      if (p.i >= res.n - 1) { const r = p.resolve; this.play = null; r(); }
    } else if (this.state === 'rest') {
      this.die.position.y = REST.y + Math.sin(time * 2.4) * 0.05 + (this.active ? Math.abs(Math.sin(time * 4)) * 0.18 : 0);
      this.die.rotation.y += dt * (this.active ? 1.4 : 0.25);
    }
    const on = this.active && this.state === 'rest';
    this.ring.material.opacity = on ? 0.5 + Math.sin(time * 5) * 0.3 : 0; this.ring.scale.setScalar(1 + Math.sin(time * 5) * 0.06);
    this.ring.material.color.setHex(this.g.activeColor || 0xffffff);
  }

  dispose() { this.root.parent?.remove(this.root); }
}
