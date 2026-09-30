// Live 3D preview for the Customize screen. Token / sound / frame previews use a themed pedestal; scene, dice, finisher,
// trail and dance previews run the *real* Ludo scene (same worlds, tray, capture cinematics and podium as in the game).
import * as THREE from 'three';
import { buildToken } from './tokens.js';
import { DANCES } from './dances.js';
import { itemOf, profile, THEMES } from './catalog.js';
import { COLOR_HEX } from '../ludo/rules.js';
import { Particles, SPRITE } from '../core/fx.js';
import { toon, outlineAll, canvasTex, T } from '../core/toon.js';
import { audio } from '../audio/audio.js';
import { damp, TAU, rnd, ease } from '../core/util.js';
import { toast } from '../core/ui.js';
import { DiceSim, packThrow } from '../ludo/dice-sim.js';
import { RAPIER, initPhysics } from '../core/physics.js';

const PED = ['skin', 'sound', 'frame'];

export class Preview {
  constructor(engine, app) {
    this.engine = engine; this.app = app; this.t = 0; this.colorIdx = 0; this.cat = 'skin';
    this.mode = 'pedestal'; this.game = null; this.gameKey = ''; this.busyGame = false; this.token = null; this.danceT = 0;
  }

  async init() {
    // ---- pedestal scene
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, this.engine.aspect, 0.1, 200);
    this.scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x2a1a5a, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.6); key.position.set(4, 8, 6); key.castShadow = true; key.shadow.camera.left = -5; key.shadow.camera.right = 5; key.shadow.camera.top = 5; key.shadow.camera.bottom = -5; this.engine.tuneLight(key); this.scene.add(key); this.key = key;
    this.rimL = new THREE.PointLight(0xff4fd8, 40, 20, 1.6); this.rimL.position.set(-4, 3, -3); this.scene.add(this.rimL);
    this.rimR = new THREE.PointLight(0x37e3ff, 40, 20, 1.6); this.rimR.position.set(4, 3, -3); this.scene.add(this.rimR);
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0x120a35, roughness: 0.4, metalness: 0.6 })); this.floor.rotation.x = -Math.PI / 2; this.floor.receiveShadow = true; this.scene.add(this.floor);
    this.rings = [];
    for (const r of [2.4, 3.3, 4.4]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 96), new THREE.MeshBasicMaterial({ color: 0xffffff })); m.rotation.x = Math.PI / 2; m.position.y = 0.02; this.scene.add(m); this.rings.push(m); }
    this.ped = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.4, 40), new THREE.MeshStandardMaterial({ color: 0x241a5a, roughness: 0.3, metalness: 0.7 })); this.ped.position.y = 0.2; this.ped.castShadow = true; this.ped.receiveShadow = true; this.scene.add(this.ped);
    this.pedRing = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff })); this.pedRing.rotation.x = Math.PI / 2; this.pedRing.position.y = 0.4; this.scene.add(this.pedRing);
    this.bars = []; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1, 0.16), new THREE.MeshBasicMaterial({ color: 0xffffff })); b.position.set(Math.cos(a) * 3.1, 0.1, Math.sin(a) * 3.1); this.scene.add(b); this.bars.push(b); }
    this.fx = new Particles(this.scene, this.engine);
    this.engine.setView(this.scene, this.camera); this.engine.setBloom(0.32, 0.5, 0.9);
    this.camAngle = 0.3;
  }

  themeColors() { const th = THEMES.find((t) => t.id === itemOf('skin', profile.look.skin).theme) || THEMES[0]; return [new THREE.Color(th.color), new THREE.Color(th.color2)]; }
  setColor(i) { this.colorIdx = i; if (this.mode === 'pedestal') this.buildToken(); else if (this.mode === 'game') this.gameKey = ''; this.show(this.cat); }

  buildToken() {
    if (this.token) { this.scene.remove(this.token.group); }
    this.token = buildToken(profile.look.skin, COLOR_HEX[this.colorIdx]);
    this.token.group.position.y = 0.4; this.token.group.scale.setScalar(1.8); this.scene.add(this.token.group);
    this.token.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const [a, b] = this.themeColors();
    this.rings.forEach((r, i) => r.material.color.copy(i % 2 ? b : a).multiplyScalar(0.85)); this.pedRing.material.color.copy(a).multiplyScalar(0.9);
    this.rimL.color.copy(a); this.rimR.color.copy(b); this.bars.forEach((m, i) => m.material.color.copy(i % 2 ? a : b).multiplyScalar(0.9));
    this.fx.emit({ p: [0, 1.2, 0], n: 26, v: [0, 2.2, 0], vr: [2.4, 1.6, 2.4], life: 1, size: 0.2, size1: 0.02, color: a, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, spin: 5, g: -2, essential: true });
  }

  /** Called when the tab or the selected item changes. */
  async show(cat, changed = false) {
    this.cat = cat;
    if (PED.includes(cat)) { await this.toPedestal(); if (!this.token || changed || this._skinShown !== profile.look.skin) { this.buildToken(); this._skinShown = profile.look.skin; } this.danceT = 0; return; }
    await this.toGame(cat, changed);
  }

  async toPedestal() {
    if (this.mode === 'game' && this.game) { /* keep the game alive for quick switching */ }
    this.mode = 'pedestal'; this.engine.setView(this.scene, this.camera); this.engine.setBloom(0.32, 0.5, 0.9);
  }

  async ensureGame() {
    const key = profile.look.scene + '|' + profile.look.skin + '|' + this.colorIdx + '|' + T.outlines;
    if (this.game && this.gameKey === key) return this.game;
    if (this.busyGame) return this.game;
    this.busyGame = true;
    const note = toast('Loading preview…', 'info', 1200);
    try {
      if (this.game) { this.game.unmount(); this.game = null; }
      await initPhysics();
      const { createPreviewGame } = await import('../ludo/ludo.js');
      this.game = await createPreviewGame(this.app, { look: { ...profile.look }, sceneId: profile.look.scene });
      this.gameKey = key;
      this.game.mountPreview();
      this.setupBoard();
    } finally { this.busyGame = false; }
    return this.game;
  }

  setupBoard() {
    const g = this.game;
    g.state.tokens = [[-1, -1, -1, -1], [-1, -1, -1, -1]];
    g.display = JSON.parse(JSON.stringify(g.state)); g.pieces.layoutAll(g.display);
  }

  async toGame(cat, changed) {
    const g = await this.ensureGame(); if (!g) return;
    this.mode = 'game'; this.engine.setView(g.scene, g.camera); g.shotActive = true;
    g.cfg.seats[0].look = { ...profile.look };
    if (g.podium) { g.podium.dispose(); g.podium = null; g.dice.root.visible = true; g.pieces.tokens.flat().forEach((t) => (t.group.visible = true)); }
    this.loopId = (this.loopId || 0) + 1; const my = this.loopId; g.slowmo = 1; g.boost = 1;
    g.pieces.tokens.flat().forEach((t) => { t.group.visible = true; });
    if (cat === 'dice') { g.dice.setDie(profile.look.dice); g.dice.rest(); g.dice.setActive(true); this.gameCam('dice'); if (changed) this.action('dice'); }
    else if (cat === 'scene') { this.setupBoard(); this.gameCam('scene'); }
    else if (cat === 'finisher') { this.setupBoard(); this.stageCapture(); this.gameCam('finisher'); if (changed) this.action('finisher'); }
    else if (cat === 'trail') { this.setupBoard(); this.gameCam('trail'); this.trailLoop(my); }
    else if (cat === 'dance') { this.gameCam('dance'); this.startDance(); }
  }

  gameCam(kind) {
    const g = this.game; this.camKind = kind;
    if (kind === 'scene') g.rig.direct = false;
  }

  stageCapture() {
    const g = this.game;
    g.state.tokens = [[12, -1, -1, -1], [38, -1, -1, -1]]; g.display = JSON.parse(JSON.stringify(g.state)); g.pieces.layoutAll(g.display);
    // put the second token on the same square, offset for the camera
  }

  async trailLoop(my) {
    const g = this.game; const t = g.pieces.tokens[0][0];
    while (this.loopId === my && this.mode === 'game' && this.cat === 'trail') {
      g.state.tokens = [[-1, -1, -1, -1], [-1, -1, -1, -1]]; g.display = JSON.parse(JSON.stringify(g.state)); g.pieces.layoutAll(g.display);
      t.group.position.copy(g.board.tokenPos(0, 0, 0)); t.rel = 0;
      await g.pieces.hop(0, 0, [1, 2, 3, 4, 5, 6, 7, 8]);
      await g.clock.wait(0.5); if (this.loopId !== my) break;
      await g.pieces.hop(0, 0, [9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
      await g.clock.wait(0.8);
    }
  }

  startDance() {
    const g = this.game; import('../ludo/podium.js').then(async ({ PodiumScene }) => {
      if (this.mode !== 'game' || this.cat !== 'dance') return;
      if (g.podium) g.podium.dispose();
      g.podium = new PodiumScene(g, [0, 1], { stats: [] }); g.freeze = false; await g.podium.play();
    });
  }

  /** Play button: throw dice, run the finisher, restart the dance, hop for the trail, audition the sound pack. */
  async action(cat) {
    const g = this.game;
    if (cat === 'sound') { audio.jingle('win'); audio.sfx('hop', { n: 3 }); audio.sfx('cheer', { v: 0.6 }); setTimeout(() => audio.sfx('slash'), 700); setTimeout(() => audio.sfx('dice', { v: 0.8 }), 1000); return; }
    if (!g || this.mode !== 'game') { if (cat === 'skin') return; return; }
    if (cat === 'dice') {
      if (this.throwing) return; this.throwing = true;
      try { await initPhysics(); this.sim ||= new DiceSim(RAPIER); const res = this.sim.throwDie(this.sim.randomThrow(Math.random)); if (g.dice.state === 'settled') await g.dice.returnToRest(); await g.dice.playThrow(res, {}); await g.clock.wait(1.4); await g.dice.returnToRest(); g.dice.setActive(true); } finally { this.throwing = false; }
    } else if (cat === 'finisher') {
      if (g.captureLive) return;
      this.stageCapture(); g.shotActive = true;
      await g.clock.wait(0.2);
      await g.capture.play({ t: 'capture', seat: 0, tok: 0, at: 12, abs: 12, victims: [{ seat: 1, tok: 0, from: 38 }] });
      g.shotActive = true; this.stageCapture(); g.pieces.layoutAll(g.display);
    } else if (cat === 'dance') this.startDance();
  }

  update(dt) {
    this.t += dt;
    this.offsetView(this.mode === 'pedestal' ? this.camera : this.game?.camera);
    if (this.mode === 'pedestal') {
      this.camAngle += dt * 0.25;
      const d = this.engine.portrait ? 12 : 9.4;
      this.camera.position.set(Math.sin(this.camAngle) * d, this.engine.portrait ? 4.2 : 3.6, Math.cos(this.camAngle) * d);
      this.camera.lookAt(0, this.engine.portrait ? 1.3 : 1.35, 0);
      if (this.engine.portrait) { /* keep the token above the panel */ this.camera.lookAt(0, 0.6, 0); }
      if (this.token) {
        this.token.tick(this.t, dt);
        if (this.cat === 'sound') { const beat = Math.pow(Math.max(0, Math.sin(this.t * 4)), 4); this.token.group.position.y = 0.4 + beat * 0.25; this.token.group.rotation.y += dt * 1.2; this.bars.forEach((b, i) => { const h = 0.2 + (Math.sin(this.t * 6 + i * 0.7) * 0.5 + 0.5) * 1.6 * (0.4 + beat); b.scale.y = h; b.position.y = h / 2 + 0.05; }); }
        else { this.token.group.rotation.y += dt * 0.7; this.bars.forEach((b, i) => { const h = 0.12 + (Math.sin(this.t * 1.3 + i * 0.5) * 0.5 + 0.5) * 0.3; b.scale.y = h; b.position.y = h / 2 + 0.05; }); }
        if (Math.random() < dt * 8) this.fx.emit({ p: [(Math.random() - 0.5) * 3, 0.3, (Math.random() - 0.5) * 3], n: 1, v: [0, 1.4, 0], life: 2, size: 0.1, size1: 0.02, color: this.rimL.color, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT });
      }
      this.fx.update(dt);
    } else if (this.game) {
      const g = this.game; g.update(dt);
      const t = this.t;
      if (this.camKind === 'scene') { const a = t * 0.12, R = 27, h = 16; g.rig.goTo(new THREE.Vector3(Math.sin(a) * R, h, Math.cos(a) * R), new THREE.Vector3(0, 0.5, 0), 40, 2); }
      else if (this.camKind === 'dice') { const p = g.dice.root.position; g.rig.goTo(new THREE.Vector3(p.x + (g.dice.layout === 'side' ? 6.5 : 0), 8.5, p.z + (g.dice.layout === 'side' ? 0 : 6.5)), p.clone().setY(0.3), 40, 3); }
      else if (this.camKind === 'trail') { const wp = g.pieces.worldOf(g.pieces.tokens[0][0]); g.rig.goTo(new THREE.Vector3(wp.x - 3, 8, wp.z + 8), wp.clone(), 36, 6); }
      else if (this.camKind === 'finisher' && !g.captureLive) { const wp = g.pieces.worldOf(g.pieces.tokens[0][0]); g.rig.goTo(new THREE.Vector3(wp.x, 7.5, wp.z + 9), wp.clone().setY(0.4), 34, 3); }
    }
  }

  /** Shift the 3D view so the subject sits in the free part of the screen (the panel covers the rest). */
  offsetView(cam) {
    if (!cam) return; const w = innerWidth, h = innerHeight;
    if (w / h < 1) cam.setViewOffset(w, h, 0, h * 0.2, w, h); else cam.setViewOffset(w, h, w * 0.19, 0, w, h);
  }

  dispose() {
    this.camera.clearViewOffset(); this.game?.camera.clearViewOffset();
    this.loopId = (this.loopId || 0) + 1;
    if (this.game) { this.game.unmount(); this.game = null; }
    this.fx?.dispose(); this.engine.untuneLight(this.key);
    this.scene.traverse((o) => o.geometry?.dispose?.());
  }
}
