// Win screen scene: a podium rises out of the board, the winner's token does its chosen victory dance, confetti, orbiting camera.
import * as THREE from 'three';
import { buildToken } from '../customize/tokens.js';
import { DANCES } from '../customize/dances.js';
import { canvasTex } from '../core/toon.js';
import { audio } from '../audio/audio.js';
import { COLOR_HEX } from './rules.js';
import { ease, lerp, damp } from '../core/util.js';
import { SPRITE } from '../core/fx.js';

const STEP = [
  { h: 1.5, x: 0, col: 0xffd23f, label: '1' },
  { h: 1.0, x: -2.0, col: 0xdfe6f2, label: '2' },
  { h: 0.65, x: 2.0, col: 0xd9925a, label: '3' },
  { h: 0.38, x: 3.9, col: 0x8a90a8, label: '4' },
];

export class PodiumScene {
  constructor(game, rank, state) {
    this.g = game; this.rank = rank; this.state = state; this.t = 0; this.group = new THREE.Group(); this.entries = [];
    this.spot = null; this.done = false;
  }

  async play() {
    const g = this.g, { rank } = this;
    g.shotActive = true; g.dice.root.visible = false; g.pieces.tokens.flat().forEach((t) => (t.group.visible = false));
    g.board.group.add(this.group); // the podium stands on the board, so it rotates with it
    this.group.rotation.y = -g.board.group.rotation.y;
    const n = rank.length;
    const offset = n === 4 ? -0.95 : n === 3 ? 0 : 1.0;
    rank.forEach((seat, place) => {
      const st = STEP[place]; const look = g.seatLook(seat);
      const step = new THREE.Group(); step.position.set(st.x + (n === 2 && place === 1 ? 0.2 : 0) + (n === 4 ? offset : 0), 0, 0);
      const block = new THREE.Mesh(new THREE.BoxGeometry(1.7, st.h, 1.7), new THREE.MeshStandardMaterial({ color: st.col, roughness: 0.35, metalness: 0.5 })); block.position.y = st.h / 2; block.castShadow = true; block.receiveShadow = true; step.add(block);
      const num = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshBasicMaterial({ map: canvasTex(128, 128, (c, w, h) => { c.clearRect(0, 0, w, h); c.font = '900 100px "Arial Rounded MT Bold",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 12; c.strokeStyle = '#1a0d4a'; c.strokeText(st.label, 64, 70); c.fillStyle = '#fff'; c.fillText(st.label, 64, 70); }), transparent: true })); num.position.set(0, st.h / 2, 0.86); step.add(num);
      const tok = buildToken(look.skin, COLOR_HEX[g.seatColor(seat)]);
      tok.group.position.y = st.h; tok.group.scale.setScalar(1.15); step.add(tok.group);
      const tag = new THREE.Group(); step.add(tag);
      step.scale.y = 0.001; this.group.add(step);
      this.entries.push({ seat, place, step, tok, st, look, block, dance: DANCES[look.dance] || DANCES.herospin, th: st.h });
    });
    // spotlight beam on the winner
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.geometry.translate(0, -7, 0);
    beam.position.set(this.entries[0].step.position.x, 12, 0); this.group.add(beam); this.beam = beam;
    audio.stopMusic(); audio.playMusic(g.theme, { game: 'win', energy: 0.9 });
    audio.sfx('win'); g.app.screenFx.banner('VICTORY!', g.seatName(rank[0]), '#ffd23f', 2600); g.app.screenFx.flash('#fff', 0.5, 0.7);
    g.world.cheer?.(2); g.world.focusVillagers?.();
    // rise
    await g.clock.tween(g.fast ? 0.05 : 1.1, (e) => { for (const en of this.entries) { const k = Math.min(1, e * 1.3 - en.place * 0.1); en.step.scale.y = Math.max(0.001, ease.outBack(Math.max(0, k))); en.tok.group.scale.y = 1.15 / Math.max(0.001, en.step.scale.y) * 1; } }, ease.linear);
    for (const en of this.entries) { en.step.scale.y = 1; en.tok.group.scale.setScalar(1.15); }
    this.active = true;
    g.fx.confetti(new THREE.Vector3(0, 4, 0), g.fast ? 5 : 90, [0xffd23f, 0xff4d6d, 0x4dd6ff, 0x7dff6b, 0xc77dff]);
    await g.clock.wait(g.fast ? 0.05 : 1.5);
  }

  update(dt) {
    if (!this.active) return; const g = this.g;
    this.t += dt; const t = this.t;
    // orbiting camera: a slow swing in front of the podium
    const c = g.board.group.localToWorld(new THREE.Vector3(0, 1.3, 0));
    const ang = Math.sin(t * 0.35) * 0.55, R = g.engine.portrait ? 12.5 : 9.5;
    const low = g.preview ? 0.3 : (g.engine.portrait ? -0.4 : -1.5);
    g.rig.goTo(new THREE.Vector3(c.x + Math.sin(ang) * R, 3.6 + Math.sin(t * 0.5) * 0.4, c.z + Math.cos(ang) * R), c.clone().add(new THREE.Vector3(0, low, 0)), 40, 1.8);
    for (const en of this.entries) {
      const tok = en.tok, base = en.th;
      tok.tick(t + en.place, dt);
      const o = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, fx: (k) => this.dancefx(k, en) };
      if (en.place === 0) en.dance(t, o);
      else if (en.place === 3) { o.rot.x = 0.25; o.scale.y = 0.94; o.pos.y = -0.02; o.rot.z = Math.sin(t * 1.5) * 0.06; }
      else { o.pos.y = Math.max(0, Math.sin(t * 5 + en.place * 2)) * 0.12; o.rot.y = Math.sin(t * 2 + en.place) * 0.3; }
      tok.group.position.set(o.pos.x, base + o.pos.y, o.pos.z); tok.group.rotation.set(o.rot.x, o.rot.y, o.rot.z);
      tok.group.scale.set(1.15 * o.scale.x, 1.15 * o.scale.y, 1.15 * o.scale.z);
      // face the camera-ish
    }
    this.beam.material.opacity = 0.13 + Math.sin(t * 3) * 0.03;
    if (Math.random() < dt * 3) g.fx.confetti(new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 2, (Math.random() - 0.5) * 3), 8, [0xffd23f, 0xff4d6d, 0x4dd6ff, 0x7dff6b]);
  }

  dancefx(kind, en) {
    const g = this.g, wp = en.step.localToWorld(new THREE.Vector3(0, en.th, 0)); const col = COLOR_HEX[g.seatColor(en.seat)];
    if (kind === 'burst') { g.fx.confetti(wp.clone().setY(wp.y + 1), 24, [col, 0xffd23f, 0xffffff]); g.fx.ring(wp, 4, col, 0.6); }
    else if (kind === 'petal') g.fx.emit({ p: wp.clone().setY(wp.y + 0.8), n: 1, v: [1, 1, 0], vr: [2, 1, 2], life: 1.6, size: 0.18, color: 0xffb7d5, alpha: 1, alpha1: 0, g: -1, frame: SPRITE.PETAL, spin: 4 });
    else if (kind === 'sparkle') g.fx.emit({ p: wp.clone().setY(wp.y + 1), n: 1, vr: [1.5, 1, 1.5], life: 0.8, size: 0.22, color: 0xfff3a3, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, spin: 5 });
    else if (kind === 'stomp') { g.fx.dust(wp, 10); g.fx.ring(wp, 3, 0xffffff, 0.4); g.rig.shake(0.25); audio.sfx('land'); }
    else if (kind === 'levelup') { g.fx.ring(wp, 5, 0xffd23f, 0.8); g.fx.flash(wp.clone().setY(wp.y + 1), 4, 0xffd23f); audio.sfx('pickup'); }
  }

  dispose() { this.group.parent?.remove(this.group); }
}
