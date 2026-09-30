// Blaster Brawl renderer. Players are the chosen token skins holding blasters; crates and barrels are instanced meshes
// driven by the host's Rapier bodies; walls break into brick debris; KO'd players tumble away as physics ragdolls.
import * as THREE from 'three';
import { initPhysics, Physics, G as PG, grp } from '../core/physics.js';
import { Particles, CameraRig, SPRITE } from '../core/fx.js';
import { buildToken } from '../customize/tokens.js';
import { emitTrail } from '../customize/trails.js';
import { DEFAULT_LOOK } from '../customize/catalog.js';
import { canvasTex } from '../core/toon.js';
import { fitCamera } from '../ludo/cam.js';
import { glowTexture, lightBeam, glowSprite } from '../core/decor.js';
import { BrawlArena } from './brawl-arena.js';
import { CFG } from './brawl-sim.js';
import { audio } from '../audio/audio.js';
import { clamp, lerp, damp, TAU, ease, hex } from '../core/util.js';

export const PLAYER_COLORS = [0xff4d6d, 0x3ddc6a, 0xffd23f, 0x3aa0ff];
const PICK_COLORS = { shotgun: 0xffa62b, rocket: 0xff4d4d, shield: 0x4dd6ff, speed: 0xfff04d, health: 0x5dff8a };
const { HX, HZ } = CFG;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

const tagTex = new Map();
function textSprite(text, color, w = 4.2, h = 1.05, font = 34) {
  const key = text + color; let t = tagTex.get(key);
  if (!t) { t = canvasTex(256, 64, (g, W, H) => { g.clearRect(0, 0, W, H); g.font = `900 ${font}px "Arial Rounded MT Bold",Arial,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(10,6,30,.9)'; g.lineJoin = 'round'; g.strokeText(text, W / 2, H / 2 + 2); g.fillStyle = color; g.fillText(text, W / 2, H / 2 + 2); }); tagTex.set(key, t); }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false })); sp.scale.set(w, h, 1); sp.renderOrder = 30; return sp;
}

export class BrawlView {
  constructor({ app, cfg, theme, map, fast = false }) {
    this.app = app; this.engine = app.engine; this.cfg = cfg; this.theme = theme; this.map = map; this.fast = fast;
    this.n = cfg.seats.length; this.time = 0; this.local = new Set(); this.state = null; this.pl = [];
    this.debris = []; this.corpses = []; this.floaters = []; this.pickMeshes = new Map(); this.flash = new Map(); this.decals = []; this.lights = [];
    this.shotT = new Array(this.n).fill(0); this.shootFX = 0; this.introT = 0; this.shotActive = true; this.celebrate = null; this.propKind = new Map();
    map.crates.forEach((c) => this.propKind.set(c.id, 'crate')); map.barrels.forEach((b) => this.propKind.set(b.id, 'barrel'));
  }

  async init() {
    const { engine, map } = this;
    await initPhysics();
    this.phys = new Physics({ gravity: 30 });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, engine.aspect, 0.5, 1600);
    this.rig = new CameraRig(this.camera); this.fx = new Particles(this.scene, engine);
    this.arena = new BrawlArena({ engine, scene: this.scene, fx: this.fx, theme: this.theme, map, camera: this.camera });
    // static colliders for debris + ragdolls
    const SG = (PG.STATIC << 16) | 0xffff;
    this.phys.fixedBox(0, -0.5, 0, HX + 8, 0.5, HZ + 8, { restitution: 0.3, friction: 0.7, groups: SG });
    for (const [x, z, hx, hz] of [[0, -HZ - 0.5, HX + 1, 0.5], [0, HZ + 0.5, HX + 1, 0.5], [-HX - 0.5, 0, 0.5, HZ], [HX + 0.5, 0, 0.5, HZ]]) this.phys.fixedBox(x, 1.3, z, hx, 1.3, hz, { restitution: 0.4, friction: 0.5, groups: SG });
    this.wallBody = new Map();
    for (const w of map.walls) this.wallBody.set(w.id, this.phys.fixedBox(w.x, w.h / 2, w.z, w.w / 2, w.h / 2, w.d / 2, { restitution: 0.3, friction: 0.5, groups: SG }));
    // instanced props
    const { mats } = this.arena;
    this.crates = new THREE.InstancedMesh(this.arena.crateGeo, [mats.crate, mats.frame], 64); this.barrels = new THREE.InstancedMesh(this.arena.barrelGeo, [mats.barrel, mats.band], 40);
    for (const im of [this.crates, this.barrels]) { im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.count = 0; im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(im.instanceMatrix.count * 3), 3); this.scene.add(im); }
    // debris pieces (real rigid bodies) and bullets
    this.debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.1 }), 420); this.debrisMesh.frustumCulled = false; this.debrisMesh.castShadow = true; this.debrisMesh.count = 0; this.scene.add(this.debrisMesh);
    const bg = new THREE.CylinderGeometry(0.07, 0.07, 1, 6); bg.rotateX(Math.PI / 2);
    this.bullets = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), 260); this.bullets.frustumCulled = false; this.bullets.count = 0; this.bullets.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(260 * 3), 3); this.scene.add(this.bullets);
    this.rockets = []; for (let i = 0; i < 4; i++) { const g = this.makeRocket(); g.visible = false; this.scene.add(g); this.rockets.push(g); }
    // pooled lights for muzzle flashes and blasts
    if (engine.cfg.detail > 0.5) for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc070, 0, 14, 2); l.userData = { t: 0, max: 1, i: 0 }; this.scene.add(l); this.lights.push(l); }
    // scorch decals
    const dt = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.5, 'rgba(10,6,4,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }, { srgb: false });
    for (let i = 0; i < 14; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: dt, transparent: true, depthWrite: false, opacity: 0, fog: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.025; m.renderOrder = 2; m.visible = false; this.scene.add(m); this.decals.push({ m, life: 0 }); }
    // power-up pads
    this.pads = map.pads.map(([x, z]) => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.05, 8, 40), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: this.arena.T.accent, emissiveIntensity: 1.6 })); r.rotation.x = Math.PI / 2; r.position.set(x, 0.05, z); this.scene.add(r); return r; });
    this.cfg.seats.forEach((s, i) => this.pl.push(this.makePlayer(i, s)));
    this.frameCamera(true); this.introStart();
  }

  makeRocket() {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10), new THREE.MeshStandardMaterial({ color: 0xd0d4dc, metalness: 0.7, roughness: 0.3 })); body.rotation.x = Math.PI / 2;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0xff4d4d, roughness: 0.4 })); nose.rotation.x = Math.PI / 2; nose.position.z = 0.5;
    const flame = glowSprite(0xffa040, 1.4, 0.95); flame.position.z = -0.5; g.add(body, nose, flame); g.userData.flame = flame; return g;
  }

  makePlayer(i, seat) {
    const look = { ...DEFAULT_LOOK, ...(seat.look || {}) }, color = PLAYER_COLORS[i % 4];
    const tok = buildToken(look.skin, color), root = new THREE.Group(), lean = new THREE.Group(); root.add(lean); lean.add(tok.group); lean.scale.setScalar(1.65);
    tok.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const gun = this.makeGun(color); root.add(gun);
    const name = textSprite((seat.name || 'Bot').slice(0, 12), hex(color)); name.position.y = 3.3; root.add(name); name.userData.keep = true;
    const back = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x0b0620, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false, fog: false })); back.center.set(0, 0.5); back.scale.set(2.1, 0.26, 1); back.renderOrder = 28;
    const fill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x5dff8a, transparent: true, depthTest: false, depthWrite: false, fog: false })); fill.center.set(0, 0.5); fill.scale.set(2.0, 0.18, 1); fill.renderOrder = 29;
    const bar = new THREE.Group(); bar.add(back, fill); back.position.set(-1.05, 0, 0); fill.position.set(-1.0, 0, 0); this.scene.add(bar);
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { time: { value: 0 }, col: { value: new THREE.Color(0x4dd6ff) }, hit: { value: 0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform vec3 col; uniform float time, hit; void main(){ float f = pow(1. - abs(dot(normalize(vN), vV)), 2.2); float hex = smoothstep(.06, .0, abs(fract(vP.y * 3. + time * .6) - .5) - .42) * .5 + smoothstep(.07, .0, abs(fract(atan(vP.z, vP.x) * 4. / 3.14159) - .5) - .43) * .5; float I = f * (0.9 + hex * .9) + hit * .7; gl_FragColor = vec4(col * I * 1.6, I * .8); }' }));
    shield.position.y = 0.95; shield.visible = false; root.add(shield);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.045, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; ring.visible = false; root.add(ring);
    const marker = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.42, 4), new THREE.MeshBasicMaterial({ color: color, toneMapped: false })); marker.rotation.x = Math.PI; marker.position.y = 2.7; marker.visible = false; root.add(marker);
    const aim = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 9), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); aim.rotation.set(-Math.PI / 2, 0, Math.PI); aim.position.set(0, 0.06, 4.9); aim.visible = false; root.add(aim);
    root.userData.aimLine = aim;
    const halo = glowSprite(color, 4, 0.4); halo.position.y = 0.3; root.add(halo);
    this.scene.add(root);
    return { i, seat, look, color, tok, root, lean, gun, name, bar, back, fill, shield, ring, marker, aim, halo, trail: {}, hitFlash: 0, alive: true, pos: new THREE.Vector3(), yaw: 0, wid: -1, dashFx: 0, lastAlive: true, boostFx: 0 };
  }

  makeGun(color) {
    const g = new THREE.Group(), dark = new THREE.MeshStandardMaterial({ color: 0x23262f, roughness: 0.35, metalness: 0.8 }), glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 2.4 });
    const set = {};
    const mk = (name, build) => { const gr = new THREE.Group(); build(gr); gr.visible = false; gr.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(gr); set[name] = gr; };
    mk('blaster', (gr) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.55), dark); b.position.set(0, 0, 0.1); const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.5, 8), dark); bar.rotation.x = Math.PI / 2; bar.position.set(0, 0.04, 0.55); const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), glow); s.position.set(0, 0.13, 0.15); gr.add(b, bar, s); });
    mk('shotgun', (gr) => { for (const x of [-0.06, 0.06]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.85, 8), dark); bar.rotation.x = Math.PI / 2; bar.position.set(x, 0.05, 0.5); gr.add(bar); } const st = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.5), new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.7 })); st.position.set(0, 0, -0.1); const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.05), glow); s.position.set(0, 0.16, 0.2); gr.add(st, s); });
    mk('rocket', (gr) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.5, metalness: 0.5 })); t.rotation.x = Math.PI / 2; t.position.set(0, 0.15, 0.4); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 12), glow); c.rotation.x = Math.PI / 2; c.position.set(0, 0.15, 0.96); const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.1), dark); h.position.set(0, -0.08, 0.1); gr.add(t, c, h); });
    g.position.set(0.32, 0.72, 0.28); g.userData.set = set; set.blaster.visible = true; return g;
  }

  // ---------------------------------------------------------------------------------------------- state
  setLocal(seats) { this.local = new Set(seats); }
  setState(rs) { this.state = rs; }

  applyEvents(evs) { for (const ev of evs) { const f = this['on_' + ev.k]; if (f) f.call(this, ev); } }

  light(x, y, z, color, intensity, dur) {
    const l = this.lights.find((k) => k.userData.t <= 0) || this.lights[0]; if (!l) return;
    l.position.set(x, y, z); l.color.set(color); l.userData.max = intensity; l.userData.t = dur; l.userData.d = dur;
  }

  on_go() { this.shotActive = false; this.frameCamera(false); }
  on_shot(ev) {
    const p = this.pl[ev.p]; if (!p) return; const col = p.color, a = ev.a, dx = Math.cos(a), dz = Math.sin(a), w = ev.w;
    p.kick = 1;
    const mine = this.local.has(ev.p);
    if (!this.fast) {
      this.fx.flash(_p.set(ev.x, 0.85, ev.z), w === 2 ? 2.4 : w === 1 ? 2.0 : 1.2, w === 2 ? 0xffb060 : 0xfff2c0);
      this.fx.sparks(_p.set(ev.x, 0.85, ev.z), w === 1 ? 8 : 4, w === 2 ? 0xffa040 : col, 5);
      this.light(ev.x, 1.2, ev.z, w === 2 ? 0xff9a40 : col, w === 2 ? 260 : 120, 0.09);
      if (w === 2) this.fx.smoke(_p.set(ev.x - dx * 0.4, 0.8, ev.z - dz * 0.4), 5, 0xaaaaaa, 0.6);
    }
    if (mine) this.rig.shake(w === 2 ? 0.18 : w === 1 ? 0.12 : 0.03);
    if (!this.fast && (this.time - this.shotT[ev.p]) > 0.055) { this.shotT[ev.p] = this.time; audio.sfx(w === 2 ? 'rocket' : w === 1 ? 'shotgun' : 'shoot', { v: mine ? 0.55 : 0.22 }); }
  }
  on_hit(ev) {
    const p = this.pl[ev.p]; if (!p) return;
    if (ev.s === 1) { p.shield.material.uniforms.hit.value = 1; if (!this.fast) { this.fx.ring(_p.set(ev.x, 0.9, ev.z), 3, 0x4dd6ff, 0.3); audio.sfx('clang', { v: 0.3 }); } return; }
    if (ev.s === 2) return;
    p.hitFlash = 1;
    if (!this.fast) {
      this.fx.sparks(_p.set(ev.x, 0.9, ev.z), 8, p.color, 5); this.fx.flash(_p.set(ev.x, 0.9, ev.z), 1.4, 0xffffff);
      this.floater(String(ev.dmg), ev.x, ev.z, ev.dmg >= 30 ? '#ffd23f' : '#ffffff');
      audio.sfx('hit', { v: this.local.has(ev.p) ? 0.6 : 0.3 });
    }
    if (this.local.has(ev.p)) { this.rig.shake(0.2 + Math.min(0.3, ev.dmg / 120)); this.engine.punch(0.35); this.app.screenFx.flash('#ff2a44', 0.2, 0.25); }
  }
  on_spark(ev) { if (this.fast) return; this.fx.sparks(_p.set(ev.x, 0.85, ev.z), 7, 0xffe0a0, 4); this.fx.emit({ p: [ev.x, 0.85, ev.z], n: 1, life: 0.15, size: 0.5, size1: 0.9, color: 0xffffff, alpha: 0.8, alpha1: 0, add: true, frame: SPRITE.SOFT }); if (Math.random() < 0.3) audio.sfx('clang', { v: 0.18 }); }
  on_hitprop(ev) { this.flash.set(ev.id, 1); if (!this.fast) this.fx.sparks(_p.set(ev.x, 0.7, ev.z), 5, 0xffd8a0, 3.5); }
  on_hitwall(ev) { const m = this.arena.wallMesh.get(ev.id); if (m) { m.userData.flash = 1; m.userData.hp = ev.hp; } if (!this.fast) { this.fx.dust(_p.set(ev.x, 1.0, ev.z), 4, 0xd8cdb4); this.fx.sparks(_p.set(ev.x, 1.0, ev.z), 5, 0xffd8a0, 3); } audio.sfx('crack', { v: 0.25 }); }

  removeWall(id) {
    const m = this.arena.wallMesh.get(id); if (m) { this.scene.remove(m); if (m.userData.cap) this.scene.remove(m.userData.cap); if (m.userData.band) this.scene.remove(m.userData.band); this.arena.wallMesh.delete(id); }
    const bd = this.wallBody.get(id); if (bd) { this.phys.remove(bd); this.wallBody.delete(id); }
  }

  on_break(ev) {
    const M = this.arena.mats;
    if (ev.kind === 'wall') {
      this.removeWall(ev.id);
      if (!this.fast) { this.debrisBurst(ev.x, ev.y, ev.z, 22, [0.28, 0.5], M.wallDebris, 6, 5, ev.w, ev.d); this.fx.dust(_p.set(ev.x, 1, ev.z), 18, 0xcbbfa4); this.fx.smoke(_p.set(ev.x, 1, ev.z), 4, 0x998877, 1.2); }
      this.rig.shake(0.3); audio.sfx('crack', { v: 0.7 }); audio.sfx('smash', { v: 0.35 });
    } else if (ev.kind === 'crate') {
      if (!this.fast) { this.debrisBurst(ev.x, ev.y, ev.z, 9, [0.16, 0.34], M.debris, 5, 5, 1, 1); this.fx.dust(_p.set(ev.x, 0.6, ev.z), 8, 0xd8c8a8); }
      audio.sfx('crack', { v: 0.5 });
    } else if (!this.fast) this.debrisBurst(ev.x, ev.y, ev.z, 8, [0.14, 0.3], [0xc42222, 0x5a1010, 0x999999], 7, 7, 0.8, 0.8);
  }

  on_boom(ev) {
    const big = ev.kind === 'barrel', r = ev.r, p = _p.set(ev.x, 0.5, ev.z);
    this.rig.shake(big ? 0.55 : 0.45); this.engine.punch(big ? 1.1 : 0.8); audio.sfx('boom', { v: 0.9 });
    if (this.local.size && Math.hypot(ev.x, ev.z) < 40) this.app.screenFx.flash('#ffd9a0', 0.16, 0.22);
    if (this.fast) return;
    this.fx.flash(p, r * 2.4, 0xffe6b0); this.fx.ring(_p.set(ev.x, 0.15, ev.z), r * 2.6, 0xffc070, 0.55); this.fx.ring(_p.set(ev.x, 0.35, ev.z), r * 1.6, 0xffffff, 0.35);
    for (let i = 0; i < 16; i++) { const a = Math.random() * TAU, d = Math.random() * r * 0.6; this.fx.emit({ p: [ev.x + Math.cos(a) * d, 0.5 + Math.random() * 1.2, ev.z + Math.sin(a) * d], n: 1, v: [Math.cos(a) * 2, 2 + Math.random() * 3, Math.sin(a) * 2], life: 0.55, lifeVar: 0.2, size: 1.6, size1: 3.6, color: 0xffb040, color1: 0xff3a10, alpha: 0.95, alpha1: 0, add: true, frame: SPRITE.SOFT, drag: 1.5 }); }
    this.fx.smoke(_p.set(ev.x, 0.8, ev.z), 14, 0x222222, 1.6); this.fx.sparks(_p.set(ev.x, 0.6, ev.z), 46, 0xffc060, 14); this.fx.emit({ p: [ev.x, 0.3, ev.z], n: 24, v: [0, 3, 0], vr: [r * 1.4, 2.5, r * 1.4], life: 0.9, lifeVar: 0.3, size: 0.4, size1: 0.9, color: 0x555555, alpha: 0.7, alpha1: 0, frame: SPRITE.SMOKE, drag: 2 });
    this.light(ev.x, 2.2, ev.z, 0xff9a40, 900, 0.45);
    const d = this.decals.reduce((a, b) => (b.life < a.life ? b : a)); d.life = 10; d.m.visible = true; d.m.position.set(ev.x, 0.025 + Math.random() * 0.004, ev.z); d.m.scale.setScalar(r * 1.7); d.m.rotation.z = Math.random() * TAU;
  }

  on_ko(ev) {
    const p = this.pl[ev.p]; if (!p) return;
    const mine = this.local.has(ev.p);
    this.rig.shake(mine ? 0.7 : 0.4); this.engine.punch(mine ? 1.2 : 0.7); audio.sfx('burst', { v: 0.7 }); audio.sfx('oh', { v: 0.4 });
    if (mine) this.app.screenFx.flash('#ff2a44', 0.35, 0.5);
    if (this.fast) return;
    this.fx.flash(_p.set(ev.x, 0.9, ev.z), 7, p.color); this.fx.ring(_p.set(ev.x, 0.2, ev.z), 8, p.color, 0.6); this.fx.sparks(_p.set(ev.x, 0.9, ev.z), 40, p.color, 10); this.fx.sparks(_p.set(ev.x, 0.9, ev.z), 20, 0xffffff, 7);
    this.corpse(p, ev);
  }
  corpse(p, ev) {
    const tok = buildToken(p.look.skin, p.color), g = new THREE.Group(); tok.group.scale.setScalar(1.65); g.add(tok.group);
    tok.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(ev.x, 1.0, ev.z); this.scene.add(g);
    const item = this.phys.add(g, { shape: 'capsule', size: [0.32, 0.42], pos: { x: ev.x, y: 1.0, z: ev.z }, vel: { x: ev.vx, y: 9 + Math.random() * 3, z: ev.vz }, angVel: { x: (Math.random() - 0.5) * 22, y: (Math.random() - 0.5) * 18, z: (Math.random() - 0.5) * 22 }, restitution: 0.45, friction: 0.6, density: 1, linDamp: 0.12, angDamp: 0.25, groups: grp(PG.PLAYER, PG.STATIC) });
    this.corpses.push({ g, item, life: CFG.RESPAWN + 0.4, max: CFG.RESPAWN + 0.4, tok });
  }
  on_spawn(ev) {
    const p = this.pl[ev.p]; if (!p) return; p.spawnFx = 1;
    if (this.fast) return;
    this.fx.ring(_p.set(ev.x, 0.1, ev.z), 6, p.color, 0.6); this.fx.flash(_p.set(ev.x, 1, ev.z), 4, p.color); this.fx.sparks(_p.set(ev.x, 0.3, ev.z), 24, p.color, 6);
    const b = lightBeam({ color: p.color, len: 14, r: 1.1, opacity: 0.35 }); b.position.set(ev.x, 0, ev.z); this.scene.add(b); this.floaters.push({ mesh: b, life: 0.7, max: 0.7, beam: true });
    audio.sfx('spawnBrawl', { v: this.local.has(ev.p) ? 0.6 : 0.25 });
  }
  on_dash(ev) { if (this.fast) return; const p = this.pl[ev.p]; if (!p) return; p.dashFx = 0.3; this.fx.ring(_p.set(ev.x, 0.15, ev.z), 3.4, 0xffffff, 0.3); audio.sfx('whoosh', { v: this.local.has(ev.p) ? 0.35 : 0.15 }); for (let i = 0; i < 10; i++) this.fx.emit({ p: [ev.x, 0.6, ev.z], n: 1, spread: 0.2, v: [-Math.cos(ev.a) * 5, 0.5, -Math.sin(ev.a) * 5], vr: 1.5, life: 0.35, size: 0.5, size1: 0.05, color: p.color, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT }); }
  on_pickup(ev) {
    const c = PICK_COLORS[ev.kind] || 0xffffff; audio.sfx('pickup', { v: this.local.has(ev.p) ? 0.7 : 0.25 }); if (ev.kind === 'shield') audio.sfx('shield', { v: 0.4 });
    if (this.fast) return; this.fx.ring(_p.set(ev.x, 0.2, ev.z), 4.5, c, 0.5); this.fx.flash(_p.set(ev.x, 1, ev.z), 3.2, c); this.fx.sparks(_p.set(ev.x, 0.8, ev.z), 20, c, 6);
    const t = { shotgun: 'SHOTGUN!', rocket: 'ROCKETS!', shield: 'SHIELD!', speed: 'SPEED!', health: '+HEALTH' }[ev.kind]; this.floater(t, ev.x, ev.z, hex(c), 1.6);
  }
  on_powerup(ev) { if (this.fast) return; this.fx.ring(_p.set(ev.x, 0.2, ev.z), 3.6, PICK_COLORS[ev.kind] || 0xffffff, 0.5); }
  on_shieldoff(ev) { const p = this.pl[ev.p]; if (p && !this.fast) this.fx.sparks(_p.set(p.pos.x, 1, p.pos.z), 18, 0x4dd6ff, 5); }
  on_empty(ev) { if (this.local.has(ev.p)) audio.sfx('error', { v: 0.3 }); }

  floater(text, x, z, color, scale = 1) { const sp = textSprite(text, color, 2.6 * scale, 0.65 * scale, 40); sp.position.set(x + (Math.random() - 0.5) * 0.6, 2.2, z); this.scene.add(sp); this.floaters.push({ mesh: sp, life: 0.9, max: 0.9, vy: 2.6 }); }

  // ---------------------------------------------------------------------------------------------- debris
  debrisBurst(x, y, z, n, size, colors, speed, up, w = 1, d = 1) {
    for (let i = 0; i < n && this.debris.length < 400; i++) {
      const sx = size[0] + Math.random() * (size[1] - size[0]), sy = size[0] + Math.random() * (size[1] - size[0]), sz = size[0] + Math.random() * (size[1] - size[0]);
      const px = x + (Math.random() - 0.5) * w * 0.8, py = y + (Math.random() - 0.3) * 0.9, pz = z + (Math.random() - 0.5) * d * 0.8, a = Math.atan2(pz - z, px - x) + (Math.random() - 0.5), sp = speed * (0.4 + Math.random());
      const item = this.phys.add(null, { pos: { x: px, y: Math.max(0.2, py), z: pz }, shape: 'box', size: [sx / 2, sy / 2, sz / 2], vel: { x: Math.cos(a) * sp, y: 2 + Math.random() * up, z: Math.sin(a) * sp }, angVel: { x: (Math.random() - 0.5) * 16, y: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16 }, restitution: 0.3, friction: 0.6, density: 1, linDamp: 0.1, angDamp: 0.3, groups: grp(PG.DEBRIS, PG.STATIC) });
      this.debris.push({ item, life: 3.2 + Math.random() * 1.6, size: [sx, sy, sz], color: new THREE.Color(colors[i % colors.length]).multiplyScalar(0.9 + Math.random() * 0.3) });
    }
  }
  updateDebris(dt) {
    this.phys.update(dt); let k = 0;
    for (let i = this.debris.length - 1; i >= 0; i--) { const d = this.debris[i]; d.life -= dt; if (d.life <= 0 || d.item.body.translation().y < -20) { this.phys.remove(d.item); this.debris.splice(i, 1); } }
    for (const d of this.debris) { const t = d.item.body.translation(), r = d.item.body.rotation(), s = clamp(d.life / 0.5, 0.02, 1); _q.set(r.x, r.y, r.z, r.w); _s.set(d.size[0] * s, d.size[1] * s, d.size[2] * s); _m.compose(_p.set(t.x, t.y, t.z), _q, _s); this.debrisMesh.setMatrixAt(k, _m); this.debrisMesh.setColorAt(k, d.color); k++; }
    this.debrisMesh.count = k; this.debrisMesh.instanceMatrix.needsUpdate = true; if (this.debrisMesh.instanceColor) this.debrisMesh.instanceColor.needsUpdate = true;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      const c = this.corpses[i]; c.life -= dt; c.tok.tick(this.time, dt);
      const s = clamp(c.life / 0.5, 0.01, 1); c.g.children[0].scale.setScalar(1.65 * s);
      if (c.life <= 0) { this.phys.remove(c.item); this.scene.remove(c.g); this.corpses.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------- camera
  frameCamera(snap) {
    const aspect = this.engine.aspect, portrait = aspect < 1, pts = [];
    for (const x of [-HX - 1, HX + 1]) for (const z of [-HZ - 1, HZ + 1]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, z < 0 ? 2.8 : 1.2, z)); }
    const fit = fitCamera(pts, { fov: 36, aspect, pitch: portrait ? 64 : 56, yaw: 0, margins: { l: 0.01, r: 0.01, t: portrait ? 0.14 : 0.11, b: portrait ? 0.24 : 0.02 } });
    this.homeCam = fit;
    if (this.celebrate || (this.shotActive && !snap)) return;
    if (snap) this.rig.set(fit.pos, fit.look, 36); else this.rig.goTo(fit.pos, fit.look, 36, 2.4);
  }
  introStart() { const h = this.homeCam; if (!h) return; this.rig.set(h.pos.clone().multiplyScalar(1.3).add(new THREE.Vector3(14, 24, 10)), h.look, 44); this.introT = 0; this.shotActive = true; }

  startCelebrate(seat) {
    const p = this.pl[seat]; if (!p || this.celebrate) return;
    this.celebrate = { p, t: 0 }; audio.stopMusic();
    p.root.visible = true; p.bar.visible = false; p.aim.visible = false;
    for (const o of this.pl) if (o !== p) { o.root.visible = false; o.bar.visible = false; }
    this.fx.confetti(new THREE.Vector3(0, 6, 0), 120, [p.color, 0xffd23f, 0xffffff, 0x4dd6ff]);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.time += dt; const rs = this.state, t = this.time;
    if (!rs) { this.rig.update(dt); return; }
    if (rs.ph !== 'countdown') this.shotActive = false;
    rs.p.forEach((st, i) => this.drawPlayer(this.pl[i], st, dt, t));
    this.drawProps(rs, dt, t); this.drawBullets(rs, dt, t); this.drawPickups(rs, dt, t); this.drawWalls(rs, dt);
    this.updateDebris(dt); this.updateExtras(dt);
    this.arena.update(t, dt); this.fx.update(dt);
    // camera: intro dive, tiny sway during play, celebration orbit
    if (this.celebrate) this.updateCelebrate(dt);
    else if (this.shotActive && this.homeCam) { this.introT += dt; const h = this.homeCam, k = ease.outCubic(clamp(this.introT / 2.6, 0, 1)); this.rig.goTo(h.pos.clone().multiplyScalar(1.3).add(new THREE.Vector3(14 * (1 - k), 24 * (1 - k), 10 * (1 - k))).lerp(h.pos, k), h.look, lerp(44, 36, k), 6); }
    else if (this.homeCam) { const h = this.homeCam; this.rig.goTo(h.pos.clone().add(new THREE.Vector3(Math.sin(t * 0.21) * 0.5, Math.sin(t * 0.17) * 0.25, 0)), h.look, 36, 3); }
    this.rig.update(dt);
  }

  drawPlayer(p, st, dt, t) {
    p.pos.set(st.x, 0, st.z); p.wid = st.wid;
    const show = st.alive && !(this.celebrate && this.celebrate.p !== p);
    if (this.celebrate && this.celebrate.p === p) return;
    p.root.visible = show; p.bar.visible = show; p.halo.visible = show;
    if (!show) return;
    const speed = Math.hypot(st.vx, st.vz), sf = clamp(speed / 8, 0, 1.4);
    // blink while invulnerable
    const blink = st.inv && !st.shield ? (Math.floor(t * 14) % 2 ? 0.35 : 1) : 1; p.lean.visible = blink > 0.5;
    p.yaw = st.yaw;
    const bob = Math.abs(Math.sin(t * 15 + p.i * 2)) * 0.09 * sf, kick = (p.kick = Math.max(0, (p.kick || 0) - dt * 9));
    p.root.position.set(st.x, 0.02 + bob, st.z); p.root.rotation.y = Math.PI / 2 - st.yaw;
    const fx = Math.cos(st.yaw), fz = Math.sin(st.yaw), fwd = st.vx * fx + st.vz * fz, lat = st.vx * -fz + st.vz * fx;
    p.hitFlash = Math.max(0, p.hitFlash - dt * 7); p.dashFx = Math.max(0, p.dashFx - dt);
    const sq = 1 + p.hitFlash * 0.25 + (p.dashFx > 0 ? 0.15 : 0) - kick * 0.06;
    p.lean.rotation.set(clamp(fwd * 0.028, -0.3, 0.3) + kick * 0.1, 0, clamp(-lat * 0.028, -0.3, 0.3));
    p.lean.scale.set(1.65 / Math.sqrt(sq), 1.65 * sq, 1.65 / Math.sqrt(sq)); p.tok.tick(t + p.i, dt);
    // weapon model follows the current weapon; recoil kick
    const set = p.gun.userData.set; ['blaster', 'shotgun', 'rocket'].forEach((k, id) => { set[k].visible = st.wid === id; }); p.gun.position.z = 0.28 - kick * 0.14;
    p.tok.group.visible = true;
    // hp bar (world-aligned billboard), shield bubble, boost glow, local marker + aim line
    p.bar.position.set(st.x, 2.75, st.z); const f = clamp(st.hp / CFG.HP, 0, 1); p.fill.scale.x = 2.0 * f; p.fill.material.color.setHex(f > 0.6 ? 0x5dff8a : f > 0.3 ? 0xffd23f : 0xff4d4d);
    p.shield.visible = !!st.shield; if (st.shield) { p.shield.material.uniforms.time.value = t; p.shield.material.uniforms.hit.value = Math.max(0, p.shield.material.uniforms.hit.value - dt * 4); p.shield.scale.setScalar(1 + Math.sin(t * 6) * 0.02); }
    const mine = this.local.has(p.i); p.marker.visible = mine; p.ring.visible = mine; if (mine) { p.marker.position.y = 2.15 + Math.sin(t * 4) * 0.12; p.marker.rotation.y = t * 2; p.ring.material.opacity = 1; }
    p.aim.visible = mine && this.aimLine !== false; p.halo.material.opacity = 0.3 + (st.speed ? 0.3 : 0) + p.hitFlash * 0.5;
    if (!this.fast) {
      if (sf > 0.2) emitTrail(this.fx, p.look.trail, _p.set(st.x, 0.05, st.z), dt * (st.speed ? 1.8 : 0.7) * sf, p.trail);
      if (st.speed && Math.random() < dt * 30) this.fx.emit({ p: [st.x, 0.5, st.z], n: 1, spread: 0.3, v: [-st.vx * 0.3, 0.5, -st.vz * 0.3], life: 0.3, size: 0.4, size1: 0.02, color: 0xfff04d, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT });
      if (p.spawnFx > 0) p.spawnFx = Math.max(0, p.spawnFx - dt * 2);
    }
  }

  drawProps(rs, dt, t) {
    let nc = 0, nb = 0;
    for (const o of rs.o) {
      const kind = this.propKind.get(o.id); if (!kind) continue;
      _q.set(o.qx, o.qy, o.qz, o.qw); _m.compose(_p.set(o.x, o.y, o.z), _q, _s.set(1, 1, 1));
      const fl = this.flash.get(o.id) || 0; if (fl > 0) this.flash.set(o.id, Math.max(0, fl - dt * 6));
      const hp = kind === 'crate' ? o.hp / CFG.CRATE_HP : o.hp / CFG.BARREL_HP, dark = 0.55 + 0.45 * clamp(hp, 0, 1);
      _c.setScalar(dark + fl * 1.6); if (kind === 'barrel') _c.setRGB(dark + fl * 1.6, dark * (1 - fl * 0.2) + fl * 1.2, dark * (1 - fl * 0.2) + fl * 1.2);
      const im = kind === 'crate' ? this.crates : this.barrels, k = kind === 'crate' ? nc++ : nb++;
      if (k >= im.instanceMatrix.count) continue; im.setMatrixAt(k, _m); im.setColorAt(k, _c);
    }
    this.crates.count = nc; this.barrels.count = nb;
    for (const im of [this.crates, this.barrels]) { im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; }
  }

  drawWalls(rs, dt) {
    for (const id of rs.wd || []) if (this.arena.wallMesh.has(id)) this.removeWall(id);
    for (const [id, hp] of rs.wl || []) { const m = this.arena.wallMesh.get(id); if (m) m.userData.hp = hp; }
    for (const m of this.arena.wallMesh.values()) {
      if (m.userData.hard) continue; const f = clamp((m.userData.hp ?? m.userData.max) / m.userData.max, 0, 1), fl = m.userData.flash = Math.max(0, (m.userData.flash || 0) - dt * 6);
      m.material.color.setScalar(0.5 + 0.5 * f + fl * 0.8); m.material.emissive.setScalar(fl * 0.5);
    }
  }

  drawBullets(rs, dt, t) {
    let n = 0, r = 0;
    for (const b of rs.b) {
      const col = _c.set(PLAYER_COLORS[b.o % 4]);
      if (b.w === 2) { const g = this.rockets[r++]; if (!g) continue; g.visible = true; g.position.set(b.x, 0.85, b.z); g.rotation.set(0, Math.PI / 2 - b.a, 0); g.userData.flame.scale.setScalar(1.1 + Math.random() * 0.5); if (!this.fast) { this.fx.emit({ p: [b.x - Math.cos(b.a) * 0.5, 0.85, b.z - Math.sin(b.a) * 0.5], n: 2, spread: 0.06, v: [-Math.cos(b.a) * 2, 0.3, -Math.sin(b.a) * 2], vr: 0.4, life: 0.7, lifeVar: 0.2, size: 0.3, size1: 1.1, color: 0xbbbbbb, alpha: 0.55, alpha1: 0, frame: SPRITE.SMOKE, drag: 1 }); this.fx.emit({ p: [b.x, 0.85, b.z], n: 1, life: 0.16, size: 0.7, size1: 0.1, color: 0xffa040, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT }); } if (r === 1) this.light(b.x, 1.3, b.z, 0xff9a40, 60, 0.05); continue; }
      const len = b.w === 1 ? 0.35 : 1.0, th = b.w === 1 ? 1.4 : 1;
      _q.setFromAxisAngle(_up, Math.PI / 2 - b.a); _m.compose(_p.set(b.x, 0.85, b.z), _q, _s.set(th, th, len)); this.bullets.setMatrixAt(n, _m); col.multiplyScalar(b.w === 1 ? 3.2 : 2.6); this.bullets.setColorAt(n, col); n++;
      if (!this.fast && b.w === 0 && Math.random() < 0.6) this.fx.emit({ p: [b.x - Math.cos(b.a) * 0.4, 0.85, b.z - Math.sin(b.a) * 0.4], n: 1, life: 0.13, size: 0.36, size1: 0.06, color: PLAYER_COLORS[b.o % 4], alpha: 0.85, alpha1: 0, add: true, frame: SPRITE.SOFT });
    }
    for (let i = r; i < this.rockets.length; i++) this.rockets[i].visible = false;
    this.bullets.count = n; this.bullets.instanceMatrix.needsUpdate = true; this.bullets.instanceColor.needsUpdate = true;
  }

  drawPickups(rs, dt, t) {
    const seen = new Set();
    for (const [id, kind, x, z] of rs.u) {
      seen.add(id); let m = this.pickMeshes.get(id);
      if (!m) { m = this.makePickup(kind); m.position.set(x, 0, z); this.scene.add(m); this.pickMeshes.set(id, m); m.userData.born = t; }
      const k = ease.outBack(clamp((t - m.userData.born) / 0.5, 0, 1));
      m.userData.icon.position.y = 1.1 + Math.sin(t * 2.4 + id) * 0.16; m.userData.icon.rotation.y = t * 1.6; m.scale.setScalar(k);
    }
    for (const [id, m] of this.pickMeshes) if (!seen.has(id)) { this.scene.remove(m); this.pickMeshes.delete(id); }
  }
  makePickup(kind) {
    const col = PICK_COLORS[kind] || 0xffffff, g = new THREE.Group(), icon = new THREE.Group(), em = new THREE.MeshStandardMaterial({ color: 0x1a1a24, emissive: col, emissiveIntensity: 1.8, roughness: 0.4, metalness: 0.4 }), dk = new THREE.MeshStandardMaterial({ color: 0x2a2d38, roughness: 0.35, metalness: 0.8 });
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.12, 24), dk); disc.position.y = 0.06; disc.receiveShadow = true; g.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 32), em); rim.rotation.x = Math.PI / 2; rim.position.y = 0.13; g.add(rim);
    if (kind === 'shotgun') { for (const x of [-0.09, 0.09]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8), em); b.rotation.z = Math.PI / 2; b.position.set(0, x, 0); icon.add(b); } const st = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.2), dk); st.position.x = -0.55; icon.add(st); }
    else if (kind === 'rocket') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 10), dk); b.rotation.z = Math.PI / 2; const n = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.32, 10), em); n.rotation.z = -Math.PI / 2; n.position.x = 0.55; for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.28), em); f.position.x = -0.35; f.rotation.x = (i / 3) * TAU; icon.add(f); } icon.add(b, n); }
    else if (kind === 'shield') { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0x113344, emissive: col, emissiveIntensity: 1.2, transparent: true, opacity: 0.7, roughness: 0.2, metalness: 0.3, wireframe: false })); const w = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), new THREE.MeshBasicMaterial({ color: col, wireframe: true, toneMapped: false })); icon.add(s, w); }
    else if (kind === 'speed') { const sh = new THREE.Shape(); sh.moveTo(0.18, 0.5); sh.lineTo(-0.28, -0.02); sh.lineTo(-0.02, -0.02); sh.lineTo(-0.18, -0.5); sh.lineTo(0.28, 0.06); sh.lineTo(0.02, 0.06); sh.closePath(); const bolt = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false }), em); bolt.position.z = -0.08; icon.add(bolt); }
    else { const a = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.26, 0.26), em), b = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.8, 0.26), em); icon.add(a, b); }
    icon.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.add(icon); g.userData.icon = icon;
    const beam = lightBeam({ color: col, len: 3.2, r: 0.7, opacity: 0.16 }); g.add(beam); const glow = glowSprite(col, 3.2, 0.5); glow.position.y = 1.1; g.add(glow);
    return g;
  }

  updateExtras(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) { const f = this.floaters[i]; f.life -= dt; if (f.beam) f.mesh.material.opacity = 0.35 * (f.life / f.max); else { f.mesh.position.y += f.vy * dt; f.vy *= 0.94; f.mesh.material.opacity = clamp(f.life / 0.4, 0, 1); } if (f.life <= 0) { this.scene.remove(f.mesh); this.floaters.splice(i, 1); } }
    for (const l of this.lights) { const u = l.userData; if (u.t > 0) { u.t -= dt; l.intensity = u.max * Math.max(0, u.t / u.d) ** 1.4; } else l.intensity = 0; }
    for (const d of this.decals) { if (d.life > 0) { d.life -= dt; d.m.material.opacity = Math.min(0.75, d.life / 3); if (d.life <= 0) d.m.visible = false; } }
    for (let i = 0; i < this.pads.length; i++) this.pads[i].material.emissiveIntensity = 1.1 + Math.sin(this.time * 2 + i) * 0.5;
  }

  updateCelebrate(dt) {
    const c = this.celebrate; c.t += dt; const p = c.p, k = ease.outBack(clamp(c.t / 0.8, 0, 1));
    p.root.position.set(0, 0.6 * k, 0); p.root.rotation.y = c.t * 1.2; p.lean.scale.setScalar(2.3); p.lean.rotation.set(0, 0, 0); p.tok.tick(c.t, dt); p.gun.visible = false; p.marker.visible = false; p.ring.visible = false; p.aim.visible = false; p.name.position.y = 3.6; p.halo.scale.setScalar(6);
    const a = c.t * 0.3, R = this.engine.aspect < 1 ? 20 : 12;
    this.rig.goTo(new THREE.Vector3(Math.sin(a) * R, 5 + Math.sin(c.t * 0.6) * 0.6, Math.cos(a) * R), new THREE.Vector3(0, 1.3, 0), 40, 2.4);
    if (Math.random() < dt * 4) this.fx.confetti(_p.set((Math.random() - 0.5) * 12, 9, (Math.random() - 0.5) * 8), 10, [p.color, 0xffd23f, 0xffffff, 0x4dd6ff]);
  }

  dispose() {
    this.arena.dispose(); this.fx.dispose(); this.phys.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
  }
}
const _up = new THREE.Vector3(0, 1, 0);
