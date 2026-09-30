// Snake Arena renderer: glowing instanced snakes (the chosen token skin rides on the head), orbs, physics debris,
// particles, real point lights, cinematic camera. It only draws render-state objects, so host and guests share it.
import * as THREE from 'three';
import { initPhysics, Physics, G as PG, grp } from '../core/physics.js';
import { Particles, CameraRig, SPRITE } from '../core/fx.js';
import { buildToken } from '../customize/tokens.js';
import { emitTrail } from '../customize/trails.js';
import { DANCES } from '../customize/dances.js';
import { itemOf, DEFAULT_LOOK } from '../customize/catalog.js';
import { canvasTex } from '../core/toon.js';
import { fitCamera } from '../ludo/cam.js';
import { glowTexture } from '../core/decor.js';
import { Arena } from './snake-arena.js';
import { CFG } from './snake-sim.js';
import { audio } from '../audio/audio.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, TAU, ease, hex } from '../core/util.js';

export const SNAKE_COLORS = [0xff4d6d, 0x3ddc6a, 0xffd23f, 0x3aa0ff];
const ORB_COLORS = [0xff4d6d, 0xffd23f, 0x4dff88, 0x3aa0ff, 0xc77dff, 0xff9a3c];
const CAP = 140, ORB_CAP = 360;

/** Standard material whose emissive follows the per-instance colour, so beads glow in their own hue. */
function beadMaterial(glow, rough = 0.28) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: rough, metalness: 0.12, emissive: 0xffffff, emissiveIntensity: glow, envMapIntensity: 1.3 });
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif'); };
  m.customProgramCacheKey = () => 'bead-emis';
  return m;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

function nameSprite(text, color) {
  const tex = canvasTex(256, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 34px "Arial Rounded MT Bold",Arial,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(10,6,30,.85)'; g.lineJoin = 'round'; g.strokeText(text, w / 2, h / 2 + 2); g.fillStyle = hex(color); g.fillText(text, w / 2, h / 2 + 2); });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
  sp.scale.set(4.4, 1.1, 1); sp.renderOrder = 30; return sp;
}

export class SnakeView {
  constructor({ app, cfg, theme, fast = false }) {
    this.app = app; this.engine = app.engine; this.cfg = cfg; this.theme = theme; this.fast = fast;
    this.n = cfg.seats.length; this.time = 0; this.sn = []; this.orbBorn = new Map(); this.orbPos = new Map(); this.debris = []; this.local = new Set();
    this.state = null; this.celebrate = null; this.camDirty = true; this.lastR = -1; this.fitT = 0; this.shotActive = true; this.introT = 0;
  }

  async init() {
    const { engine } = this;
    await initPhysics();
    this.phys = new Physics({ gravity: 32 });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, engine.aspect, 0.5, 1600);
    this.rig = new CameraRig(this.camera);
    this.fx = new Particles(this.scene, engine);
    this.arena = new Arena({ engine, scene: this.scene, fx: this.fx, theme: this.theme, R0: CFG.R0, rmin: CFG.RMIN, camera: this.camera });
    this.phys.add(null, { type: 'fixed', shape: 'cyl', size: [0.75, CFG.R0 + 1.4], pos: { x: 0, y: -0.75, z: 0 }, restitution: 0.3, friction: 0.6, groups: (PG.STATIC << 16) | 0xffff });
    const day = this.theme === 'anime';
    this.beadGeo = new THREE.SphereGeometry(1, 16, 11);
    this.bodyMat = beadMaterial(day ? 0.32 : 0.75);
    this.orbMat = beadMaterial(day ? 1.2 : 1.7, 0.18);
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: day ? 0.5 : 0.75, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const flat = new THREE.PlaneGeometry(1, 1); flat.rotateX(-Math.PI / 2);
    this.flatGeo = flat;
    // orbs
    this.orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 12), this.orbMat, ORB_CAP); this.orbs.frustumCulled = false; this.orbs.count = 0; this.orbs.castShadow = false; this.scene.add(this.orbs);
    this.orbGlow = new THREE.InstancedMesh(flat, this.glowMat, ORB_CAP); this.orbGlow.frustumCulled = false; this.orbGlow.count = 0; this.orbGlow.renderOrder = 4; this.scene.add(this.orbGlow);
    // debris of burst snakes (real rigid bodies)
    this.debrisMesh = new THREE.InstancedMesh(this.beadGeo, this.bodyMat, 320); this.debrisMesh.frustumCulled = false; this.debrisMesh.count = 0; this.debrisMesh.castShadow = true; this.scene.add(this.debrisMesh);
    // snakes
    this.cfg.seats.forEach((seat, i) => this.sn.push(this.makeSnake(i, seat)));
    this.groundGlow = new THREE.InstancedMesh(flat, this.glowMat, this.n * CAP); this.groundGlow.frustumCulled = false; this.groundGlow.count = 0; this.groundGlow.renderOrder = 4; this.scene.add(this.groundGlow);
    this.frameCamera(true);
    this.introStart();
  }

  makeSnake(i, seat) {
    const look = { ...DEFAULT_LOOK, ...(seat.look || {}) };
    const color = SNAKE_COLORS[i % 4], skinC = itemOf('skin', look.skin).c;
    const accent = new THREE.Color(skinC[1]).lerp(new THREE.Color(color), 0.25);
    const tok = buildToken(look.skin, color);
    const root = new THREE.Group(), lean = new THREE.Group(); root.add(lean); lean.add(tok.group); lean.scale.setScalar(1.8);
    tok.group.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    this.scene.add(root);
    const body = new THREE.InstancedMesh(this.beadGeo, this.bodyMat, CAP); body.frustumCulled = false; body.count = 0; body.castShadow = true; body.receiveShadow = false; this.scene.add(body);
    body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3); body.instanceColor.setUsage(THREE.DynamicDrawUsage);
    const name = nameSprite((seat.kind === 'bot' ? (seat.name || 'Bot') : seat.name) || 'Player', color); this.scene.add(name);
    let light = null;
    if (this.engine.cfg.detail > 0.5) { light = new THREE.PointLight(color, 16, 13, 2); light.position.set(0, 1.8, 0); this.scene.add(light); }
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(5, 5, 1); this.scene.add(halo);
    return { i, seat, look, color, accent, tok, root, lean, body, name, light, halo, trailState: {}, alive: true, pulse: 0, pos: new THREE.Vector3(), ang: 0, flying: null, boostAmt: 0, boostLoop: null, len: CFG.START_LEN, peak: CFG.START_LEN, spawnT: 0 };
  }

  // ---------------------------------------------------------------------------------------------- state
  setLocal(seats) { this.local = new Set(seats); }
  setState(rs) { this.state = rs; }

  applyEvents(evs) {
    for (const ev of evs) {
      if (ev.k === 'round') this.onRound();
      else if (ev.k === 'eat') this.onEat(ev);
      else if (ev.k === 'die') this.onDie(ev);
      else if (ev.k === 'go') { this.shotActive = false; this.frameCamera(false); }
      else if (ev.k === 'roundend') this.onRoundEnd(ev);
    }
  }

  onRound() {
    for (const s of this.sn) { s.alive = true; s.flying = null; s.root.visible = true; s.root.rotation.set(0, 0, 0); s.lean.rotation.set(0, 0, 0); s.lean.scale.setScalar(1.8); s.len = CFG.START_LEN; s.spawnT = 0; s.trailState = {}; s.name.visible = true; }
    this.clearDebris(); this.orbBorn.clear(); this.orbPos.clear(); this.celebrate = null; this.lastR = -1; this.shotActive = true;
    this.arena.setR(CFG.R0); this.frameCamera(false);
  }

  onEat(ev) {
    const s = this.sn[ev.s], o = this.orbPos.get(ev.id); if (!s) return;
    s.pulse = 1;
    const col = o ? ORB_COLORS[o.hue % ORB_COLORS.length] : s.color;
    if (o && !this.fast) { this.fx.emit({ p: [o.x, 0.6, o.z], n: ev.big ? 14 : 6, v: [(s.pos.x - o.x) * 2, 2, (s.pos.z - o.z) * 2], vr: [1.6, 1.4, 1.6], life: 0.4, lifeVar: 0.1, size: ev.big ? 0.3 : 0.2, size1: 0.02, color: col, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, drag: 2 }); }
    if (!this.fast) this.fx.ring(_p.set(s.pos.x, 0.15, s.pos.z), ev.big ? 3.4 : 2.0, s.color, 0.35);
    if (this.local.has(ev.s)) { s.combo = (s.combo || 0) + 1; s.comboT = 0.9; audio.sfx('eat', { v: 0.5, n: Math.min(8, s.combo) }); }
    else if (!this.fast && (this.time - (this._eatSfx || 0)) > 0.12 && this.local.size) { this._eatSfx = this.time; audio.sfx('eat', { v: 0.18, n: 0 }); }
  }

  onDie(ev) {
    const s = this.sn[ev.s]; if (!s) return;
    s.alive = false; s.name.visible = false;
    const head = s.pos.clone(); head.y = 0.6;
    const killer = ev.by >= 0 ? this.sn[ev.by] : null;
    const isLocal = this.local.has(ev.s);
    this.rig.shake(isLocal ? 0.75 : 0.4); this.engine.punch(isLocal ? 1.1 : 0.6);
    if (isLocal) this.app.screenFx.flash(hex(s.color), 0.35, 0.4);
    audio.sfx('burst', { v: 0.8 });
    if (this.fast) { s.root.visible = false; return; }
    this.fx.flash(head, 9, s.color); this.fx.ring(head.clone().setY(0.2), 11, s.color, 0.7); this.fx.ring(head.clone().setY(0.3), 6, 0xffffff, 0.45);
    this.fx.sparks(head, 46, s.color, 11); this.fx.sparks(head, 24, 0xffffff, 7); this.fx.smoke(head, 8, 0x555566, 1.0);
    // the head token is launched away from the crash
    const dir = new THREE.Vector3(Math.cos(s.ang) * -0.4 + (Math.random() - 0.5), 0, Math.sin(s.ang) * -0.4 + (Math.random() - 0.5)).normalize();
    if (killer) dir.set(s.pos.x - killer.pos.x, 0, s.pos.z - killer.pos.z).normalize();
    s.flying = { v: new THREE.Vector3(dir.x * 7, 13, dir.z * 7), spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 12 - 6, Math.random() * 8 - 4), t: 0 };
    this.spawnDebris(ev.segs || [], s);
  }

  onRoundEnd(ev) {
    audio.sfx('roundWin', {});
    const w = this.sn[ev.winner];
    if (w && !this.fast) { this.fx.confetti(_p.set(w.pos.x, 3, w.pos.z), 50, [w.color, 0xffffff, 0xffd23f]); this.fx.ring(_p.set(w.pos.x, 0.2, w.pos.z), 9, w.color, 0.8); }
  }

  // ---------------------------------------------------------------------------------------------- debris
  spawnDebris(segs, s) {
    const r0 = 0.34;
    segs.forEach(([x, z], k) => {
      if (this.debris.length >= 300) return;
      const ang = Math.atan2(z - s.pos.z, x - s.pos.x) + (Math.random() - 0.5) * 1.4, sp = 3.5 + Math.random() * 7;
      const item = this.phys.add(null, { pos: { x, y: 0.5 + Math.random() * 0.4, z }, shape: 'ball', size: [r0], restitution: 0.55, friction: 0.4, density: 1, linDamp: 0.05, groups: grp(PG.DEBRIS, PG.STATIC), vel: { x: Math.cos(ang) * sp, y: 5 + Math.random() * 8, z: Math.sin(ang) * sp }, angVel: { x: Math.random() * 20 - 10, y: Math.random() * 20 - 10, z: 0 } });
      const c = new THREE.Color(k % 3 === 2 ? s.accent : s.color).multiplyScalar(1.15);
      this.debris.push({ item, life: 1.1 + Math.random() * 0.25, max: 1.3, color: c, r: r0 * (1.2 - (k / segs.length) * 0.5) * 1.15 });
    });
  }
  clearDebris() { for (const d of this.debris) this.phys.remove(d.item); this.debris.length = 0; this.debrisMesh.count = 0; }
  updateDebris(dt) {
    this.phys.update(dt);
    let k = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.life -= dt; const t = d.item.body.translation();
      if (d.life <= 0 || t.y < -25) { this.phys.remove(d.item); this.debris.splice(i, 1); }
    }
    for (const d of this.debris) {
      const t = d.item.body.translation(), r = d.item.body.rotation(), sc = d.r * clamp(d.life / 0.3, 0.02, 1);
      _q.set(r.x, r.y, r.z, r.w); _s.set(sc, sc, sc); _m.compose(_p.set(t.x, t.y, t.z), _q, _s);
      this.debrisMesh.setMatrixAt(k, _m); this.debrisMesh.setColorAt(k, d.color); k++;
    }
    this.debrisMesh.count = k; this.debrisMesh.instanceMatrix.needsUpdate = true; if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- camera
  frameCamera(snap) {
    const aspect = this.engine.aspect, portrait = aspect < 1;
    const R = clamp((this.state ? this.state.R : CFG.R0) + 2.6, 12, CFG.R0 + 3);
    const pts = [];
    for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), new THREE.Vector3(Math.cos(a) * R, 1.6, Math.sin(a) * R)); }
    const fit = fitCamera(pts, { fov: 38, aspect, pitch: portrait ? 62 : 52, yaw: 0, margins: { l: 0.02, r: 0.02, t: portrait ? 0.14 : 0.11, b: portrait ? 0.16 : 0.02 } });
    this.homeCam = fit;
    if (this.celebrate || (this.shotActive && !snap)) return;
    if (snap) this.rig.set(fit.pos, fit.look, 38); else this.rig.goTo(fit.pos, fit.look, 38, 2.2);
  }

  introStart() {
    const h = this.homeCam; if (!h) return;
    const from = h.pos.clone().multiplyScalar(1.35).add(new THREE.Vector3(30, 26, 8));
    this.rig.set(from, h.look, 46); this.introT = 0; this.shotActive = true;
  }

  // ---------------------------------------------------------------------------------------------- victory
  startCelebrate(seat) {
    const s = this.sn[seat]; if (!s || this.celebrate) return;
    this.celebrate = { s, t: 0, dance: DANCES[s.look.dance] || DANCES.herospin };
    this.arena.setR(CFG.R0); this.lastR = CFG.R0;
    this.fastOff = true;
    for (const o of this.sn) if (o !== s) { o.root.visible = false; o.halo.visible = false; if (o.light) o.light.intensity = 0; o.name.visible = false; o.body.count = 0; }
    s.body.count = 0; s.alive = true; s.flying = null; s.root.visible = true; s.halo.visible = true; s.name.visible = true;
    const pod = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.25, metalness: 0.8, emissive: 0xffa500, emissiveIntensity: 0.35 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 1.2, 40), mat); cyl.position.y = 0.6; cyl.castShadow = true; cyl.receiveShadow = true; pod.add(cyl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.3, 0.14, 8, 48), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: s.color, emissiveIntensity: 3 })); rim.rotation.x = Math.PI / 2; rim.position.y = 1.2; pod.add(rim);
    pod.scale.y = 0.001; this.scene.add(pod); this.celebrate.pod = pod;
    audio.stopMusic();
    this.fx.confetti(new THREE.Vector3(0, 5, 0), 120, [s.color, 0xffd23f, 0xffffff, 0x4dd6ff]);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.time += dt;
    const rs = this.state, t = this.time;
    if (!rs) { this.rig.update(dt); return; }
    if (rs.ph !== 'countdown') this.shotActive = false;
    // arena / danger
    if (!this.celebrate && Math.abs(rs.R - this.lastR) > 0.05) { this.lastR = rs.R; this.arena.setR(rs.R); this.fitT = 0; this.camDirty = true; }
    this.fitT -= dt;
    if (this.camDirty && this.fitT <= 0 && !this.shotActive) { this.camDirty = false; this.fitT = 0.35; this.frameCamera(false); }
    // snakes
    let gi = 0; const heads = [], alive = [];
    rs.s.forEach((st, i) => { gi = this.drawSnake(this.sn[i], st, dt, t, gi, heads, alive); });
    this.groundGlow.count = gi; this.groundGlow.instanceMatrix.needsUpdate = true; if (this.groundGlow.instanceColor) this.groundGlow.instanceColor.needsUpdate = true;
    this.arena.setHeads(heads);
    this.drawOrbs(rs, t);
    this.updateDebris(dt);
    this.arena.update(t, dt);
    this.updateFliers(dt);
    this.updateCelebrate(dt);
    this.fx.update(dt);
    // camera: intro dive, then a gentle parallax toward the action
    if (this.shotActive && rs.ph === 'countdown' && this.homeCam) {
      this.introT += dt; const h = this.homeCam, k = ease.outCubic(clamp(this.introT / 2.6, 0, 1));
      const from = h.pos.clone().multiplyScalar(1.3).add(new THREE.Vector3(Math.sin(t * 0.4) * 10, 20, 6));
      this.rig.goTo(from.lerp(h.pos, k), h.look, lerp(46, 38, k), 6); this.rig.direct = false;
    } else if (!this.celebrate && this.homeCam && alive.length) {
      let cx = 0, cz = 0; for (const a of alive) { cx += a.x; cz += a.z; } cx /= alive.length; cz /= alive.length;
      const h = this.homeCam; this.rig.goTo(h.pos.clone().add(_p.set(cx * 0.06, 0, cz * 0.05)), h.look.clone().add(new THREE.Vector3(cx * 0.1, 0, cz * 0.08)), 38, 2.2);
    }
    this.rig.update(dt);
    // sudden death: arena shrinking tension
    if (rs.ph === 'play' && rs.R < CFG.R0 - 0.3 && Math.random() < dt * 3) this.rig.shake(0.03);
  }

  drawSnake(s, st, dt, t, gi, heads, alive) {
    const [al, x, z, ang, len, boost] = [st.alive, st.x, st.z, st.ang, st.len, st.boost];
    s.pos.set(x, 0, z); s.ang = ang; s.len = len; s.peak = Math.max(s.peak, len);
    s.pulse = Math.max(0, s.pulse - dt * 5); if (s.comboT > 0) { s.comboT -= dt; if (s.comboT <= 0) s.combo = 0; }
    const isAlive = al && !s.flying && !(this.celebrate && this.celebrate.s !== s);
    s.body.visible = true;
    if (!al) { s.body.count = 0; s.halo.visible = false; if (s.light) s.light.intensity = 0; if (!s.flying) s.root.visible = false; if (s.boostLoop) { s.boostLoop.stop(); s.boostLoop = null; } return gi; }
    if (this.celebrate) { s.body.count = 0; return gi; }
    s.root.visible = true; s.halo.visible = true; s.name.visible = true;
    alive.push(s.pos);
    // head: token facing the direction of travel, bobbing while it runs, leaning into boosts
    s.boostAmt = damp(s.boostAmt, boost ? 1 : 0, 10, dt);
    const bob = Math.abs(Math.sin(t * (boost ? 16 : 10) + s.i)) * (boost ? 0.13 : 0.08), sq = 1 + s.pulse * 0.22;
    s.root.position.set(x, 0.04 + bob, z);
    s.root.rotation.y = Math.PI / 2 - ang;
    s.lean.rotation.x = s.boostAmt * 0.32; s.lean.scale.set(1.8 / Math.sqrt(sq), 1.8 * sq, 1.8 / Math.sqrt(sq));
    s.tok.tick(t + s.i, dt);
    s.name.position.set(x, 3.3, z); s.halo.position.set(x, 0.9, z); s.halo.material.opacity = 0.35 + 0.2 * s.boostAmt + s.pulse * 0.3; s.halo.scale.setScalar(4.2 + s.boostAmt * 2 + s.pulse * 2);
    if (s.light) { s.light.position.set(x, 1.9, z); s.light.intensity = 14 + 16 * s.boostAmt + 18 * s.pulse; }
    // trail from the player's Customize choice; boosting adds streaks
    if (!this.fast) {
      emitTrail(this.fx, s.look.trail, _p.set(x, 0.05, z), dt * (boost ? 1.8 : 0.9), s.trailState);
      if (boost) this.fx.emit({ p: [x - Math.cos(ang) * 0.6, 0.35, z - Math.sin(ang) * 0.6], n: 1, spread: 0.1, v: [-Math.cos(ang) * 4, 0.6, -Math.sin(ang) * 4], vr: 1, life: 0.35, size: 0.32, size1: 0.02, color: s.color, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT });
    }
    if (boost && !s.boostLoop && this.local.has(s.i) && !this.fast) s.boostLoop = audio.loopStart('boost');
    if ((!boost || !this.local.has(s.i)) && s.boostLoop) { s.boostLoop.stop(); s.boostLoop = null; }
    // body beads along the snake's path (tapered), glowing with a travelling pulse
    const pts = st.pts, n = Math.min(CAP, pts.length >> 1);
    const wave = boost ? 14 : 5, glow = boost ? 1.9 : 1.0, day = this.theme === 'anime';
    for (let k = 0; k < n; k++) {
      const u = k / Math.max(1, n - 1), r = lerp(0.46, 0.2, Math.pow(u, 0.8)) * (1 + 0.07 * Math.sin(t * wave - k * 0.8)) * (k < 2 ? 0.92 : 1);
      _m.compose(_p.set(pts[k * 2], r * 0.92 + 0.02, pts[k * 2 + 1]), _q.identity(), _s.set(r, r, r)); s.body.setMatrixAt(k, _m);
      _c.set(k % 3 === 2 ? s.accent : s.color).multiplyScalar((0.75 + 0.3 * Math.sin(t * wave - k * 0.7)) * glow * (1 - 0.3 * u) * (day ? 0.85 : 1));
      s.body.setColorAt(k, _c);
      if (gi < this.n * CAP) { const gs = r * (day ? 4.2 : 5.4); _m.compose(_p.set(pts[k * 2], 0.04 + (gi % 7) * 0.0006, pts[k * 2 + 1]), _q.identity(), _s.set(gs, 1, gs)); this.groundGlow.setMatrixAt(gi, _m); _c.set(s.color).multiplyScalar(day ? 0.45 : 0.6 * glow); this.groundGlow.setColorAt(gi, _c); gi++; }
    }
    s.body.count = n; s.body.instanceMatrix.needsUpdate = true; s.body.instanceColor.needsUpdate = true;
    heads.push(_p.clone().set(x, 0.5, z));
    return gi;
  }

  drawOrbs(rs, t) {
    let k = 0, kg = 0; const seen = new Set();
    for (const o of rs.o) {
      if (o.hid > 0 || k >= ORB_CAP) continue;
      seen.add(o.id);
      let b = this.orbBorn.get(o.id); if (b == null) { b = t; this.orbBorn.set(o.id, b); if (!this.fast && b > 0.5 && o.pop) this.fx.emit({ p: [o.x, 0.6, o.z], n: 1, life: 0.3, size: 0.2, size1: 1.4, color: ORB_COLORS[o.hue % 6], alpha: 0.8, alpha1: 0, add: true, frame: SPRITE.SOFT }); }
      this.orbPos.set(o.id, o);
      const pop = clamp((t - b) / 0.4, 0, 1), sc = (o.big ? 0.5 : 0.27) * (1 + Math.sin(pop * Math.PI) * 0.4) * pop * (1 + 0.08 * Math.sin(t * 5 + o.id));
      const y = 0.55 + Math.sin(t * 2.6 + o.id * 1.7) * 0.13;
      _m.compose(_p.set(o.x, y, o.z), _q.identity(), _s.set(sc, sc, sc)); this.orbs.setMatrixAt(k, _m); _c.set(ORB_COLORS[o.hue % 6]).multiplyScalar(o.big ? 1.5 : 1.1); this.orbs.setColorAt(k, _c);
      const gs = (o.big ? 3.3 : 2.0) * pop * (1 + 0.12 * Math.sin(t * 4 + o.id)); _m.compose(_p.set(o.x, 0.05, o.z), _q, _s.set(gs, 1, gs)); this.orbGlow.setMatrixAt(k, _m); _c.set(ORB_COLORS[o.hue % 6]).multiplyScalar(0.7); this.orbGlow.setColorAt(k, _c);
      k++;
    }
    for (const id of this.orbBorn.keys()) if (!seen.has(id)) { this.orbBorn.delete(id); }
    for (const id of this.orbPos.keys()) if (!seen.has(id) && !this.orbBorn.has(id)) this.orbPos.delete(id);
    this.orbs.count = this.orbGlow.count = k;
    this.orbs.instanceMatrix.needsUpdate = this.orbGlow.instanceMatrix.needsUpdate = true; if (this.orbs.instanceColor) this.orbs.instanceColor.needsUpdate = this.orbGlow.instanceColor.needsUpdate = true;
  }

  updateFliers(dt) {
    for (const s of this.sn) {
      const f = s.flying; if (!f) continue;
      f.t += dt; f.v.y -= 34 * dt; s.root.position.addScaledVector(f.v, dt); s.root.rotation.x += f.spin.x * dt; s.root.rotation.y += f.spin.y * dt; s.root.rotation.z += f.spin.z * dt;
      const inside = Math.hypot(s.root.position.x, s.root.position.z) < CFG.R0 + 1;
      if (inside && s.root.position.y < 0.3 && f.v.y < 0) { this.fx.dust(_p.copy(s.root.position).setY(0.1), 8, 0xffffff); this.fx.ring(_p.setY(0.1), 3, s.color, 0.4); audio.sfx('land', {}); s.root.visible = false; s.flying = null; }
      else if (s.root.position.y < -30) { s.root.visible = false; s.flying = null; }
    }
  }

  updateCelebrate(dt) {
    const c = this.celebrate; if (!c) return;
    c.t += dt; const s = c.s, k = ease.outBack(clamp(c.t / 0.9, 0, 1));
    c.pod.scale.y = Math.max(0.001, k);
    const o = { pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, fx: (kind) => this.danceFx(kind, s) };
    c.dance(c.t, o);
    s.root.position.set(o.pos.x, 1.2 + o.pos.y * 1.6, o.pos.z); s.root.rotation.set(o.rot.x, o.rot.y, o.rot.z); s.lean.rotation.x = 0;
    s.lean.scale.set(2.3 * o.scale.x, 2.3 * o.scale.y, 2.3 * o.scale.z); s.tok.tick(c.t, dt);
    s.name.position.set(0, 7.4, 0); s.halo.position.set(0, 3, 0); s.halo.scale.setScalar(10);
    if (s.light) { s.light.position.set(0, 5, 0); s.light.intensity = 60; }
    const a = c.t * 0.3, R = this.engine.aspect < 1 ? 26 : 20;
    this.rig.goTo(new THREE.Vector3(Math.sin(a) * R, 7.5 + Math.sin(c.t * 0.6), Math.cos(a) * R), new THREE.Vector3(0, 0.4, 0), 40, 2.5);
    if (Math.random() < dt * 4) this.fx.confetti(_p.set((Math.random() - 0.5) * 10, 9, (Math.random() - 0.5) * 10), 10, [s.color, 0xffd23f, 0xffffff, 0x4dd6ff]);
  }
  danceFx(kind, s) {
    const p = _p.set(s.root.position.x, 1.3, s.root.position.z);
    if (kind === 'burst') { this.fx.confetti(p.clone().setY(3), 26, [s.color, 0xffd23f, 0xffffff]); this.fx.ring(p.clone().setY(1.3), 8, s.color, 0.6); }
    else if (kind === 'stomp') { this.fx.dust(p.clone().setY(1.3), 12); this.fx.ring(p.clone().setY(1.3), 6, 0xffffff, 0.4); this.rig.shake(0.2); }
    else if (kind === 'levelup') { this.fx.ring(p, 9, 0xffd23f, 0.8); this.fx.flash(p, 6, 0xffd23f); }
    else if (kind === 'petal' || kind === 'sparkle') this.fx.emit({ p: [p.x, p.y + 1, p.z], n: 1, v: [0, 1, 0], vr: [2, 1, 2], life: 1.4, size: 0.3, color: kind === 'petal' ? 0xffb7d5 : 0xfff3a3, alpha: 1, alpha1: 0, add: kind === 'sparkle', frame: kind === 'petal' ? SPRITE.PETAL : SPRITE.STAR, spin: 4 });
  }

  /** Test helper: turn the sun's shadow and points off/on is not needed; just report GPU info. */
  dispose() {
    for (const s of this.sn) s.boostLoop?.stop();
    this.arena.dispose(); this.fx.dispose(); this.phys.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    this.engine.renderer.toneMappingExposure = 1;
  }
}
