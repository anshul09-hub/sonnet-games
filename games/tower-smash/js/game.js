// Game flow: state machine, aiming, camera rig, slow motion, scoring, title demo.
import * as THREE from 'three';
import { AMMO, AMMO_ORDER, FIXED_DT, LAUNCH, CATAPULT_X, starsForShots } from './config.js';
import { LEVELS, buildLevel, buildDemo, AMMO_UNLOCK_LEVEL } from './levels.js';
import { groundY } from './terrain.js';
import { ARM } from './catapult.js';
import { speedFor, powerFor, arcPoint, solveSpeed } from './ballistics.js';
import { Save } from './save.js';

const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);

// dotted trajectory preview drawn as screen-size-corrected round points
class ArcPreview {
  constructor(scene, n = 38) {
    this.n = n;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    this.uScale = { value: 800 };
    this.color = { value: new THREE.Color(0xffffff) };
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, fog: false,
      uniforms: { uScale: this.uScale, uColor: this.color },
      vertexShader: `attribute float aAlpha; attribute float aSize; uniform float uScale; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = aSize * uScale / -mv.z; vA = aAlpha; }`,
      fragmentShader: `uniform vec3 uColor; varying float vA;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float rim = smoothstep(0.62, 0.9, d);
          vec3 c = mix(uColor, vec3(0.05,0.08,0.12), rim * 0.65);
          gl_FragColor = vec4(c, vA * (1.0 - smoothstep(0.92, 1.0, d)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 20; this.points.visible = false;
    scene.add(this.points);
  }

  update(origin, alpha, power, alphaMul = 1, color = 0xffffff) {
    const pos = this.points.geometry.attributes.position, al = this.points.geometry.attributes.aAlpha, sz = this.points.geometry.attributes.aSize;
    const speed = speedFor(power), tmp = {};
    let last = 0;
    for (let i = 0; i < this.n; i++) {
      const t = 0.09 + i * 0.085;
      arcPoint(origin, alpha, speed, t, tmp);
      const dead = tmp.y < groundY(tmp.x) + 0.1;
      pos.setXYZ(i, tmp.x, dead ? -100 : tmp.y, 0);
      const f = 1 - i / this.n;
      al.setX(i, dead ? 0 : (0.25 + 0.75 * f) * alphaMul);
      sz.setX(i, 0.34 * (0.6 + 0.6 * f));
    }
    pos.needsUpdate = al.needsUpdate = sz.needsUpdate = true;
    this.color.value.set(color);
    this.points.visible = true;
  }
  hide() { this.points.visible = false; }
}

export class Game {
  constructor({ gfx, fx, arena, catapult, audio, ui }) {
    Object.assign(this, { gfx, fx, arena, catapult, audio, ui });
    this.scene = gfx.scene;
    this.camera = gfx.camera;
    this.mode = 'boot';           // boot | title | play
    this.phase = 'none';          // intro | aim | flying | settle | won | lost
    this.paused = false;
    this.levelIndex = 0;
    this.timeScale = 1;
    this.slow = { t: 0, dur: 0, cool: 0, count: 0, elapsed: 0 };
    this.trauma = 0;
    this.time = 0; this.acc = 0;
    this.camPos = new THREE.Vector3(0, 20, 70);
    this.camLook = new THREE.Vector3(0, 6, 0);
    this.camMode = 'aim';
    this.aim = { alpha: 46 * D2R, power: 0, dragging: false, x0: 0, y0: 0, maxDrag: 250 };
    this.last = null;             // last shot {alpha, power}
    this.arc = new ArcPreview(this.scene);
    this.ghost = new ArcPreview(this.scene);
    this.ammo = {}; this.sel = 'rock';
    this.shots = 0;
    this.flagsLeft = 0; this.flagsTotal = 0;
    this.winTimer = -1;
    this.settleT = 0; this.quietT = 0; this.flightT = 0;
    this.demo = { t: 0, state: 'wait', quietT: 0 };
    this.bounds = { minX: 10, maxX: 50, maxY: 20 };
    this.keys = new Set();
    this.moverFrames = 0;
    this.perf = { t: 0, n: 0, sum: 0, checks: 0 };
    this.frameNo = 0;

    arena.on.shake = (a) => { this.trauma = Math.min(1, this.trauma + a); };
    arena.on.flagDown = (f, left, total) => this.onFlagDown(left, total);
    arena.on.blast = (pos, sc) => { if (this.mode === 'play' && sc >= 1.2) this.maybeSlow(true); };

    this.bindInput();
  }

  // ================================================================= input
  bindInput() {
    const el = this.gfx.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    window.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e, true));
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { if (this.mode === 'play' && !this.paused && this.phase !== 'won') this.pause(); });
  }

  maxDrag() { return clamp(Math.min(this.gfx.width, this.gfx.height * 1.5) * 0.28, 120, 330); }

  onDown(e) {
    this.audio.init();
    if (this.mode !== 'play' || this.paused) return;
    if (this.phase === 'flying') { this.arena.tap(); return; }
    if (this.phase !== 'aim') return;
    if (e.button !== undefined && e.button > 0) return;
    this.aim.dragging = true; this.aim.x0 = e.clientX; this.aim.y0 = e.clientY; this.aim.maxDrag = this.maxDrag();
    this.aim.power = 0;
    this.ui.hideHint();
  }

  onMove(e) {
    if (!this.aim.dragging) return;
    const dx = this.aim.x0 - e.clientX, dy = e.clientY - this.aim.y0;
    const len = Math.hypot(dx, dy);
    this.aim.power = clamp(len / this.aim.maxDrag, 0, 1);
    if (len > 6) this.aim.alpha = clamp(Math.atan2(dy, dx), LAUNCH.minAngle * D2R, LAUNCH.maxAngle * D2R);
    this.aim.px = e.clientX; this.aim.py = e.clientY;
  }

  onUp(e, cancel = false) {
    if (!this.aim.dragging) return;
    this.aim.dragging = false;
    if (!cancel && this.aim.power > 0.09 && this.phase === 'aim') this.fire(this.aim.alpha, this.aim.power);
    else this.aim.power = 0;
    this.audio.creakStop();
  }

  onKey(e, down) {
    if (down && !e.repeat) this.audio.init();
    if (down && (e.key === 'm' || e.key === 'M')) { this.ui.toggleMute(); return; }
    if (down && e.key === 'Escape') { e.preventDefault(); this.ui.onEscape(); return; }
    if (this.mode !== 'play') return;
    if (down) {
      this.keys.add(e.key);
      if (this.phase === 'flying' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); this.arena.tap(); return; }
      if (this.phase === 'aim' && !this.paused) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (this.aim.power > 0.09) this.fire(this.aim.alpha, this.aim.power); }
        if (/^[1-5]$/.test(e.key)) this.selectAmmo(AMMO_ORDER[+e.key - 1]);
        if (e.key === 'r' || e.key === 'R') this.restart();
      }
    } else this.keys.delete(e.key);
  }

  keyAim(dt) {
    if (this.phase !== 'aim' || this.paused || this.aim.dragging) return;
    const k = this.keys, fine = k.has('Shift') ? 0.25 : 1;
    let da = 0, dp = 0;
    if (k.has('ArrowUp')) da += 1; if (k.has('ArrowDown')) da -= 1;
    if (k.has('ArrowRight')) dp += 1; if (k.has('ArrowLeft')) dp -= 1;
    if (da || dp) {
      this.aim.alpha = clamp(this.aim.alpha + da * dt * 0.7 * fine, LAUNCH.minAngle * D2R, LAUNCH.maxAngle * D2R);
      this.aim.power = clamp(this.aim.power + dp * dt * 0.5 * fine, 0, 1);
      this.ui.hideHint();
    }
  }

  // ================================================================= levels
  startLevel(index) {
    this.mode = 'play';
    this.levelIndex = index;
    this.ui.hideAll();
    this.audio.startMusic();
    const spec = buildLevel(index);
    this.spec = spec;
    this.level = spec.level;
    this.fx.clear();
    this.catapult.reset();
    this.arena.load(spec, { intro: true });
    this.computeBounds(spec);
    this.ammo = { ...spec.level.ammo };
    this.sel = AMMO_ORDER.find((t) => this.ammo[t] > 0);
    this.shots = 0;
    this.flagsTotal = this.arena.flagsTotal; this.flagsLeft = this.flagsTotal;
    this.winTimer = -1; this.slow.count = 0; this.slow.cool = 2;
    this.timeScale = 1; this.slow.t = 0;
    this.last = null;
    this.aim.power = 0; this.aim.alpha = 46 * D2R; this.aim.dragging = false;
    this.phase = 'intro'; this.introT = 0;
    this.catapult.setLoaded(this.sel);
    this.catapult.setAim(this.aim.alpha, 0, true);
    this.camMode = 'intro';
    const sv = this.structView();
    this.camPos.copy(sv.pos).add(new THREE.Vector3(-14, 4, -6)); this.camLook.copy(sv.look);
    this.paused = false;
    this.ui.showHud(spec.level, index);
    this.refreshHud();
    this.ui.banner(`Level ${spec.level.id}`, spec.level.name, spec.level.tip, spec.level.newAmmo);
    this.perf = { t: -1.5, n: 0, sum: 0, checks: this.perf.checks };
  }

  restart() { this.startLevel(this.levelIndex); }

  computeBounds(spec) {
    let minX = 1e9, maxX = -1e9, maxY = 0;
    for (const s of spec.blocks) { minX = Math.min(minX, s.x - s.sx / 2); maxX = Math.max(maxX, s.x + s.sx / 2); maxY = Math.max(maxY, s.y + s.sy / 2); }
    for (const f of spec.flags) { maxY = Math.max(maxY, f.y + 3); maxX = Math.max(maxX, f.x + 2); minX = Math.min(minX, f.x - 1); }
    for (const p of spec.platforms) {
      if (p.axis === 'x') { minX = Math.min(minX, p.x - p.w / 2 - p.range); maxX = Math.max(maxX, p.x + p.w / 2 + p.range); }
      else { minX = Math.min(minX, p.x - p.w / 2); maxX = Math.max(maxX, p.x + p.w / 2); }
      if (p.axis === 'y') maxY += p.range;
    }
    for (const p of spec.pendulums) { minX = Math.min(minX, p.x - p.len - p.r); maxX = Math.max(maxX, p.x + p.len + p.r); }
    this.bounds = { minX, maxX, maxY };
  }

  refreshHud() {
    this.ui.updateHud({ flagsLeft: this.flagsLeft, flagsTotal: this.flagsTotal, shots: this.shots, ammo: this.ammo, sel: this.sel });
  }

  selectAmmo(type) {
    if (this.phase !== 'aim' || !type || !(this.ammo[type] > 0)) return;
    this.sel = type;
    this.catapult.setLoaded(type);
    this.audio.click();
    this.refreshHud();
  }

  // ================================================================= shooting
  fire(alpha, power, typeOverride = null) {
    const type = typeOverride || this.sel;
    if (!type || !(this.ammo[type] > 0) && !typeOverride) return false;
    if (!typeOverride) this.ammo[type]--;
    this.shots++;
    this.last = { alpha, power };
    this.phase = 'flying'; this.flightT = 0; this.settleT = 0; this.quietT = 0;
    this.aim.power = 0;
    this.ui.hideHint();
    this.catapult.setLoaded(type);
    const speed = speedFor(power), origin = this.catapult.originFor(alpha);
    this.audio.release(power);
    this.audio.creakStop();
    this.camMode = 'follow';
    const phys = this.arena.phys;
    this.catapult.fire(alpha, () => {
      if (this.arena.phys !== phys) return;          // level was restarted mid-swing
      this.arena.clearProjectiles(true);
      this.arena.launch(type, origin, { x: Math.cos(alpha) * speed, y: Math.sin(alpha) * speed, z: 0 });
      this.trauma = Math.min(1, this.trauma + 0.12);
      this.fx.puff({ x: origin.x, y: origin.y - 0.5, z: 0 }, { n: 5, size: 0.9, life: 0.8, color: 0xffffff });
    });
    this.refreshHud();
    return true;
  }

  onFlagDown(left, total) {
    this.flagsLeft = left;
    if (this.mode === 'title') return;
    this.refreshHud();
    if (left > 0) this.ui.toast(`Flag down! ${left} to go`, 'flag');
    else if (this.phase !== 'won') {
      this.phase = 'won';
      this.winTimer = 2.1;
      this.ui.toast('All flags down!', 'flag');
      this.startSlow(1.1, true);
      this.camMode = 'result';
    }
  }

  finishLevel() {
    const id = this.level.id, stars = starsForShots(this.shots);
    const { newBest, prevStars } = Save.record(id, stars, this.shots);
    const next = LEVELS[this.levelIndex + 1];
    const unlock = next && next.newAmmo && prevStars === 0 ? next.newAmmo : null;
    this.audio.fanfare();
    this.ui.showComplete({ level: this.level, stars, shots: this.shots, best: Save.shotsFor(id), newBest, unlock, hasNext: !!next });
  }

  failLevel() {
    this.phase = 'lost';
    this.audio.fail();
    this.ui.showFail(this.level);
  }

  // ================================================================= slow motion
  startSlow(dur, force = false) {
    if (this.slow.t > 0 && !force) return;
    this.slow.t = dur; this.slow.dur = dur; this.slow.elapsed = 0; this.slow.cool = 5; this.slow.count++;
    this.audio.muffle(true);
    this.ui.slowmo(true);
    this.camMode = 'slowmo';
  }

  advanceSlow(dt) {
    if (this.slow.t > 0) {
      this.slow.t -= dt; this.slow.elapsed += dt;
      if (this.slow.t <= 0) {
        this.audio.muffle(this.paused);
        this.ui.slowmo(false);
        if (this.mode === 'play' && this.camMode === 'slowmo') this.camMode = this.phase === 'aim' ? 'aim' : 'result';
      }
    }
    if (this.slow.cool > 0) this.slow.cool -= dt;
  }

  maybeSlow(force = false) {
    if (this.mode !== 'play' || this.slow.t > 0 || this.slow.cool > 0 || this.slow.count >= 3) return;
    if (this.phase === 'lost') return;
    const need = Math.max(16, this.arena.blocks.length * 0.11);
    if (force ? this.arena.movers >= 4 : this.arena.movers >= need) this.startSlow(1.0);
  }

  // ================================================================= camera
  fit(minX, maxX, yBot, yTop, padX = 0) {
    const a = this.camera.aspect, tv = Math.tan(this.camera.fov * D2R / 2), th = tv * a;
    const halfW = (maxX - minX) / 2 + padX, halfH = (yTop - yBot) / 2;
    const dist = Math.max(halfW / th, halfH / tv);
    return { cx: (minX + maxX) / 2, cy: (yBot + yTop) / 2, dist };
  }

  aimView() {
    const b = this.bounds;
    const f = this.fit(CATAPULT_X - 5, b.maxX + 4, -1, Math.max(b.maxY + 3, 16), 0);
    const dist = f.dist * 1.0 + 2;
    return { pos: new THREE.Vector3(f.cx + dist * 0.03, f.cy + dist * 0.15, dist), look: new THREE.Vector3(f.cx, f.cy - 1.5, 0) };
  }

  structView() {
    const b = this.bounds;
    const f = this.fit(b.minX - 5, b.maxX + 5, 0, b.maxY + 4, 0);
    const dist = Math.max(30, f.dist * 1.02);
    return { pos: new THREE.Vector3(f.cx - 4, f.cy + 3.5 + dist * 0.08, dist), look: new THREE.Vector3(f.cx, f.cy - 0.5, 0) };
  }

  titleView(t) {
    const b = this.bounds;
    const cx = (b.minX + b.maxX) / 2, cy = 9;
    const R = Math.max(50, this.fit(b.minX - 6, b.maxX + 6, 0, b.maxY + 4, 0).dist * 1.05);
    const th = 0.42 * Math.sin(t * 0.11) - 0.18;
    const pos = new THREE.Vector3(cx + Math.sin(th) * R, cy + 8 + Math.sin(t * 0.17) * 2.5, Math.cos(th) * R);
    const look = new THREE.Vector3(cx - 8, cy - 1, 0);
    return { pos, look };
  }

  updateCamera(dt) {
    let dPos, dLook, rate = 3;
    const cam = this.camera;
    switch (this.camMode) {
      case 'title': { const v = this.titleView(this.time); dPos = v.pos; dLook = v.look; rate = 2.5; break; }
      case 'intro': { const v = this.structView(); dPos = v.pos; dLook = v.look; rate = 2.0; break; }
      case 'aim': { const v = this.aimView(); dPos = v.pos; dLook = v.look; rate = 2.6; break; }
      case 'result': { const v = this.structView(); dPos = v.pos; dLook = v.look; rate = 2.2; break; }
      case 'slowmo': {
        const c = this.arena.movers ? this.arena.moverCenter : this.camLook;
        const s = clamp(this.slow.elapsed / Math.max(0.1, this.slow.dur), 0, 1);
        const a = 0.15 + s * 0.65, d = 36;
        dLook = c.clone(); dLook.z = 0;
        dPos = new THREE.Vector3(c.x + Math.sin(a) * d - 6, Math.max(8, c.y + 5 + s * 3), Math.cos(a) * d);
        rate = 5.5;
        break;
      }
      case 'follow': default: {
        const p = this.arena.projectiles.find((q) => q.alive);
        if (p) {
          const t = p.body.translation(), v = p.body.linvel();
          dLook = new THREE.Vector3(t.x + v.x * 0.14, Math.max(t.y + v.y * 0.08, groundY(t.x) + 4), 0);
          dPos = new THREE.Vector3(dLook.x - 4, Math.max(dLook.y + 5, groundY(t.x) + 8), 40);
          rate = 5.5;
        } else { const v = this.structView(); dPos = v.pos; dLook = v.look; rate = 2.2; }
      }
    }
    const k = damp(rate, dt);
    this.camPos.lerp(dPos, k);
    this.camLook.lerp(dLook, k);
    cam.position.copy(this.camPos);
    // shake
    if (this.trauma > 0.001) {
      const s = this.trauma * this.trauma;
      cam.position.x += (Math.random() - 0.5) * 1.6 * s;
      cam.position.y += (Math.random() - 0.5) * 1.6 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.7);
    }
    cam.lookAt(this.camLook);
    cam.rotation.z += (Math.random() - 0.5) * 0.02 * this.trauma * this.trauma;
  }

  // ================================================================= pause / flow
  pause() {
    if (this.mode !== 'play' || this.paused || this.phase === 'won' || this.phase === 'lost') return;
    this.paused = true; this.aim.dragging = false; this.audio.creakStop(); this.audio.muffle(true);
    this.ui.showPause();
  }
  resume() { this.paused = false; this.audio.muffle(this.slow.t > 0); this.ui.hidePause(); }

  enterTitle() {
    this.mode = 'title';
    this.phase = 'none';
    this.paused = false;
    this.ui.hideHud();
    this.loadDemo();
    this.camMode = 'title';
    const v = this.titleView(this.time);
    this.camPos.copy(v.pos); this.camLook.copy(v.look);
    this.audio.startMusic();
  }

  loadDemo() {
    const spec = buildDemo();
    this.spec = spec;
    this.fx.clear();
    this.catapult.reset();
    this.arena.load(spec, { intro: true });
    this.computeBounds(spec);
    this.catapult.setLoaded('boulder');
    this.catapult.setAim(46 * D2R, 0, true);
    this.demo = { t: 0, state: 'wait', quietT: 0 };
    this.timeScale = 1; this.slow.t = 0;
  }

  updateDemo(dt) {
    const d = this.demo;
    d.t += dt;
    if (d.state === 'wait' && d.t > 3.2) {
      // aim a boulder at the base of the tower
      const alpha = 42 * D2R, o = this.catapult.originFor(alpha);
      const T = { x: 16 + 10, y: 3 + 6.5 };
      const v = solveSpeed(o, alpha, T) || 30;
      this.catapult.setLoaded('boulder');
      this.catapult.setAim(alpha, powerFor(v) * 0.9, false);
      d.state = 'aiming'; d.t = 0; d.alpha = alpha; d.v = v; d.o = o;
    } else if (d.state === 'aiming' && d.t > 1.1) {
      const phys = this.arena.phys;
      this.catapult.fire(d.alpha, () => {
        if (this.arena.phys !== phys) return;
        this.arena.clearProjectiles(true);
        this.arena.launch('boulder', d.o, { x: Math.cos(d.alpha) * d.v, y: Math.sin(d.alpha) * d.v, z: 0 });
        this.audio.release(1);
      });
      d.state = 'flying'; d.t = 0;
    } else if (d.state === 'flying') {
      if (d.t > 2 && this.arena.movers === 0 && this.arena.maxSpeed < 0.8) d.quietT += dt; else d.quietT = 0;
      if (d.t > 14 || d.quietT > 2.5) { d.state = 'reset'; d.t = 0; }
      if (this.arena.movers >= 12 && this.slow.t <= 0 && this.slow.cool <= 0) { this.slow.t = 0.9; this.slow.dur = 0.9; this.slow.cool = 30; }
    } else if (d.state === 'reset' && d.t > 0.4) {
      this.loadDemo();
    }
  }

  // ================================================================= main loop
  frame(nowMs) {
    if (this.frozen) return;
    const now = nowMs / 1000;
    const raw = this.lastNow ? now - this.lastNow : 1 / 60;
    this.lastNow = now;
    let dt = clamp(raw, 0, 0.05);
    if (Math.abs(dt - FIXED_DT) < 0.0009) dt = FIXED_DT;
    this.frameNo++;
    if (!this.paused && this.mode !== 'boot') this.tick(dt, raw);
    else this.renderOnly(dt);
  }

  renderOnly(dt) {
    this.time += dt;
    this.updateCamera(dt);
    this.gfx.render(dt, this.time);
  }

  tick(dt, raw) {
    this.time += dt;
    // slow-motion time scale
    this.advanceSlow(dt);
    const targetScale = this.slow.t > 0 ? 0.2 : 1;
    this.timeScale += (targetScale - this.timeScale) * damp(this.slow.t > 0 ? 12 : 6, dt);
    if (Math.abs(this.timeScale - targetScale) < 0.01) this.timeScale = targetScale;

    // physics
    this.acc += dt;
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < 3) {
      this.arena.step(FIXED_DT * this.timeScale);
      this.acc -= FIXED_DT; steps++;
    }
    if (steps === 3) this.acc = 0;
    const gdt = dt * this.timeScale;

    this.arena.syncVisuals(gdt, this.time);
    this.fx.camQuat = this.camera.quaternion;
    this.fx.update(gdt);

    if (this.mode === 'play') this.updatePlay(dt, gdt);
    else if (this.mode === 'title') this.updateDemo(gdt);

    this.catapult.update(dt, this.time);
    this.updateCamera(dt);
    this.updateAimVisuals(dt);
    this.gfx.render(dt, this.time);
    this.autoQuality(raw);
  }

  // headless step used by tests: no camera, no rendering
  simStep(dt) {
    this.time += dt;
    this.arena.step(dt);
    this.arena.syncVisuals(dt, this.time);
    this.fx.update(dt);
    if (this.mode === 'play') this.updatePlay(dt, dt); else if (this.mode === 'title') this.updateDemo(dt);
    this.catapult.update(dt, this.time);
    this.advanceSlow(dt);
  }

  updatePlay(dt, gdt) {
    this.keyAim(dt);
    const a = this.arena;
    switch (this.phase) {
      case 'intro':
        this.introT += dt;
        if (this.introT > 1.2 && this.camMode === 'intro') this.camMode = 'aim';
        if (this.introT > 2.4) { this.phase = 'aim'; this.camMode = 'aim'; this.ui.showHint(this.levelIndex === 0 ? 'Drag back anywhere, then release to fire' : null); }
        break;
      case 'flying': {
        this.flightT += gdt;
        this.maybeSlow();
        if (this.flightT > 0.4 && !a.projectilesActive()) { this.phase = 'settle'; this.settleT = 0; this.quietT = 0; this.camMode = 'result'; }
        break;
      }
      case 'settle': {
        this.settleT += gdt;
        this.maybeSlow();
        if (a.isQuiet()) this.quietT += gdt; else this.quietT = 0;
        if (this.settleT > 1.6 && (this.quietT > 0.5 || this.settleT > 7)) this.afterShot();
        break;
      }
      case 'aim': this.maybeSlow(); break;
      case 'won':
        this.winTimer -= dt;
        if (this.winTimer <= 0 && !this.completed) { this.completed = true; this.finishLevel(); }
        break;
      default: break;
    }
    if (this.phase !== 'won') this.completed = false;
    if (this.phase === 'aim' && this.camMode !== 'aim' && this.camMode !== 'slowmo') this.camMode = 'aim';
  }

  afterShot() {
    const left = Object.values(this.ammo).reduce((s, n) => s + n, 0);
    if (this.flagsLeft <= 0) return;                    // win is handled by the flag callback
    if (left <= 0) { this.failLevel(); return; }
    // next shot
    if (!(this.ammo[this.sel] > 0)) this.sel = AMMO_ORDER.find((t) => this.ammo[t] > 0);
    this.arena.clearProjectiles(true);
    this.catapult.setLoaded(this.sel);
    this.phase = 'aim'; this.camMode = 'aim';
    this.refreshHud();
  }

  updateAimVisuals(dt) {
    const aiming = this.mode === 'play' && this.phase === 'aim' && !this.paused;
    this.gfx.renderer.getDrawingBufferSize(this._sz || (this._sz = new THREE.Vector2()));
    const scale = this._sz.y / (2 * Math.tan(this.camera.fov * D2R / 2));
    this.arc.uScale.value = scale; this.ghost.uScale.value = scale;
    if (!aiming) {
      this.arc.hide(); this.ghost.hide();
      this.ui.aimOverlay(null);
      if (this.mode === 'play') this.catapult.setAim(this.aim.alpha, 0);
      return;
    }
    const showLive = this.aim.power > 0.03;
    this.catapult.setAim(this.aim.alpha, this.aim.power);
    if (showLive) {
      const o = this.catapult.originFor(this.aim.alpha);
      const p = this.aim.power;
      const col = new THREE.Color().setHSL(0.33 - 0.33 * p, 0.95, 0.55);
      this.arc.update(o, this.aim.alpha, p, 1, col);
      this.audio.creakUpdate(p, dt);
    } else { this.arc.hide(); this.audio.creakUpdate(0, dt); }
    if (this.last && (showLive || this.aim.dragging)) {
      this.ghost.update(this.catapult.originFor(this.last.alpha), this.last.alpha, this.last.power, 0.32, 0xcfe8ff);
    } else this.ghost.hide();
    this.ui.aimOverlay(this.aim.dragging ? this.aim : (showLive ? { ...this.aim, key: true } : null));
  }

  autoQuality(raw) {
    if (this.mode !== 'play' || this.paused || Save.settings.qualityManual || this.perf.checks >= 2) return;
    if (this.phase === 'intro') { return; }
    this.perf.t += raw;
    if (this.perf.t < 0) return;
    this.perf.n++; this.perf.sum += Math.min(raw, 0.2);
    if (this.perf.t > 3.5) {
      const avg = this.perf.sum / this.perf.n;
      this.perf = { t: -0.5, n: 0, sum: 0, checks: this.perf.checks };
      if (avg > 1 / 40) {
        const q = this.gfx.quality;
        const next = q === 'high' ? 'medium' : q === 'medium' ? 'low' : null;
        this.perf.checks++;
        if (next) { this.ui.setQuality(next, true); this.ui.toast(`Graphics lowered to ${next} for smoother play`, 'info'); }
      } else this.perf.checks++;
    }
  }
}
