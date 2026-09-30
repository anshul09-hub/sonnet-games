// The game: owns renderer, physics world, cars, race state machine and the frame loop.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GradeShader } from './post.js';

import { buildTrack, buildTerrain, EDGE, ROAD_HW } from './track.js';
import { buildStaticPhysics } from './trackphysics.js';
import { World } from './world.js';
import { Props } from './props.js';
import { Vehicle, G, grp } from './vehicle.js';
import { buildCar } from './carmodel.js';
import { Race, Racer, TOTAL_LAPS } from './race.js';
import { AIDriver, buildRacingLine } from './ai.js';
import { Effects } from './effects.js';
import { CameraRig } from './camera.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD, setSeg, fillResults } from './hud.js';
import { QUALITY, loadSettings, saveSettings, loadBest, saveBest, loadBestRace, saveBestRace } from './settings.js';
import { clamp, lerp, damp, fmtTime, ordinal } from './util.js';

export const STEP = 1 / 120;

const DRIVERS = [
  { name: 'YOU', color: '#ff3b30', hex: 0xff3b30, accent: 0xffffff, number: 7, isPlayer: true },
  { name: 'NOVA', color: '#2f80ff', hex: 0x2f80ff, accent: 0xffd23a, number: 3, skill: 0.985, aggression: 0.5, seed: 11 },
  { name: 'VEX', color: '#a56bff', hex: 0xa56bff, accent: 0x6dffb0, number: 11, skill: 0.965, aggression: 0.85, seed: 23 },
  { name: 'BLAZE', color: '#ffd21f', hex: 0xffd21f, accent: 0x222222, number: 5, skill: 0.945, aggression: 0.65, seed: 37 },
];
// (YOU starts on the second row, right-hand side)
const GRID_FOR = [
  { row: 1, side: 1 }, // YOU
  { row: 0, side: -1 }, // NOVA
  { row: 1, side: -1 }, // VEX
  { row: 0, side: 1 }, // BLAZE
];

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.settings = loadSettings();
    this.quality = QUALITY[this.settings.quality];
    this.state = 'loading';
    this.acc = 0;
    this.time = 0;
    this.resScale = 1;
    this.frameAvg = 1 / 60;
    this.slowFrames = 0; this.fastFrames = 0;
    this.playerAuto = false;
    this.override = null;
    this.bestLap = loadBest();
    this.sessionBest = this.bestLap;
    this.lastLap = null;
    this.raceClock = 0;
    this.finishTimer = 0;
    this.countdown = { t: 0, shown: -1 };
    this.wrongTimer = 0;
    this.driftStartBoost = 0;
    this.wasBoosting = false;
    this.hitCooldowns = new Map();
    this.scrapePlayer = 0;
    this.lastScrapeSpark = 0;
    this.playerInput = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false, reset: false };
    this.stats = { frames: 0 };
  }

  async init(progress = () => {}) {
    progress('Starting renderer…');
    this.setupRenderer();
    progress('Loading physics…');
    await RAPIER.init();
    this.R = RAPIER;
    progress('Shaping the terrain…');
    await tick();
    this.track = buildTrack();
    this.terrain = buildTerrain(this.track);
    this.line = buildRacingLine(this.track);
    progress('Building the world…');
    await tick();
    this.world = new World(this.scene, this.renderer, this.track, this.terrain, this.quality);
    progress('Assembling physics…');
    await tick();
    this.setupPhysics();
    progress('Building cars…');
    await tick();
    this.setupCars();
    this.effects = new Effects(this.scene, this.quality);
    this.camRig = new CameraRig(this.camera, this.terrain);
    this.input = new Input();
    this.audio = new AudioEngine();
    this.audio.muted = this.settings.muted;
    this.audio.volume = this.settings.volume ?? 0.8;
    this.hud = new HUD(this.track, DRIVERS.map((d) => d.color));
    this.hud.mute(this.settings.muted);
    this.buildComposer();
    this.bindUI();
    this.resize();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden && (this.state === 'racing' || this.state === 'countdown')) this.pause(); });
    this.resetRace(true);
    this.toTitle();
    // first frame so shaders compile before the loading screen goes away
    this.render(0, 0.016);
  }

  // ------------------------------------------------------------------ setup
  setupRenderer() {
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.id === 'low', powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.3;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.15, 4000);
    this.scene.add(this.camera);
  }

  buildComposer() {
    const q = this.quality;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!q.bloom) return;
    const c = new EffectComposer(this.renderer);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.85, 0.78);
    c.addPass(this.bloom);
    c.addPass(new OutputPass());
    this.gradePass = null;
    if (q.grade) { this.gradePass = new ShaderPass(GradeShader); c.addPass(this.gradePass); }
    if (q.smaa) c.addPass(new SMAAPass(innerWidth, innerHeight)); // anti-aliasing on the tone-mapped image
    this.composer = c;
    this.applySize();
  }

  setupPhysics() {
    const R = this.R;
    this.phys = new R.World({ x: 0, y: -9.81, z: 0 });
    this.phys.timestep = STEP;
    this.phys.numSolverIterations = 3;
    this.statics = buildStaticPhysics(R, this.phys, this.track, this.terrain);
    this.wallHandles = this.statics.wall;
    // gantry pylons
    const gp = this.world.gantryPos;
    const body = this.phys.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(gp.x, gp.y, gp.z).setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), gp.yaw)));
    for (const s of [-1, 1]) {
      const c = this.phys.createCollider(R.ColliderDesc.cuboid(0.55, 4.75, 0.8).setTranslation(s * gp.span, 4.75, 0).setFriction(0.05).setCollisionGroups(grp(G.WALL)), body);
      this.wallHandles.add(c.handle);
    }
    this.props = new Props(this.scene, R, this.phys, this.track, this.terrain);
  }

  setupCars() {
    const { track } = this;
    this.race = new Race(track);
    this.racers = [];
    this.vehicles = [];
    this.visuals = [];
    this.drivers = [];
    this.carByHandle = new Map();
    DRIVERS.forEach((d, i) => {
      const slot = GRID_FOR[i];
      const dist = -8 - slot.row * 9;
      const p = track.idx(Math.round(dist / 2));
      const lat = slot.side * 2.6;
      const car = new Vehicle(this.R, this.phys, {
        name: d.name, isPlayer: !!d.isPlayer,
        x: p.x + p.rx * lat, y: p.y + 1.0, z: p.z + p.rz * lat, yaw: Math.atan2(p.fx, p.fz),
      });
      car.frozen = true;
      const racer = new Racer(car, d.name, d.color, !!d.isPlayer);
      racer.spec = d; racer.slot = { dist, lat };
      this.race.add(racer, dist);
      this.racers.push(racer);
      this.vehicles.push(car);
      this.carByHandle.set(car.col.handle, car);
      const vis = buildCar({ color: d.hex, accent: d.accent, number: d.number, shadowsOn: this.quality.shadows });
      this.scene.add(vis.root); this.scene.add(vis.blob);
      this.visuals.push(vis);
      this.drivers.push(d.isPlayer ? null : new AIDriver(track, this.line, { skill: d.skill, name: d.name, lane: slot.side * 0.8, seed: d.seed, aggression: d.aggression }));
    });
    this.player = this.racers[0];
    // real headlights (spot lights, no shadows): two on the player, one per rival
    this.spots = [];
    this.racers.forEach((r, i) => {
      const n = r.isPlayer ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const sp = new THREE.SpotLight(0xfff0d2, r.isPlayer ? 22 : 14, 80, 0.5, 0.8, 1.6);
        sp.castShadow = false;
        this.scene.add(sp, sp.target);
        this.spots.push({ sp, i, side: n === 1 ? 0 : k === 0 ? -1 : 1 });
      }
    });
    // autopilot for the player after the finish
    this.autopilot = new AIDriver(track, this.line, { skill: 0.9, name: 'auto', seed: 5, aggression: 0 });
  }

  // ------------------------------------------------------------------ sizing / quality
  resize() {
    this.applySize();
  }
  applySize() {
    const q = this.quality;
    const w = innerWidth, h = innerHeight;
    const pr = clamp(Math.min(devicePixelRatio || 1, q.dpr) * this.resScale, 0.5, 3);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
    this.camera.aspect = w / h;
    // keep the vertical field of view sensible on ultra-wide / portrait windows
    this.camera.updateProjectionMatrix();
    this.pixelRatio = pr;
  }
  setQuality(id) {
    if (!QUALITY[id]) return;
    this.settings.quality = id; saveSettings(this.settings);
    this.quality = QUALITY[id];
    this.world.applyQuality(this.quality);
    this.effects.setQuality(this.quality);
    for (const v of this.visuals) v.setShadows(this.quality.shadows);
    this.resScale = 1;
    this.buildComposer();
    this.applySize();
    this.syncSegs();
  }

  // ------------------------------------------------------------------ UI
  bindUI() {
    const $ = (id) => document.getElementById(id);
    const start = () => { this.audio.init(); this.audio.click(); this.startRace(); };
    $('btnStart').onclick = start;
    $('btnResume').onclick = () => this.resume();
    $('btnRestart').onclick = () => { this.audio.click(); this.startRace(); };
    $('btnQuit').onclick = () => { this.audio.click(); this.toTitle(); };
    $('btnAgain').onclick = () => { this.audio.click(); this.startRace(); };
    $('btnTitle').onclick = () => { this.audio.click(); this.toTitle(); };
    for (const id of ['segQuality', 'segQuality2']) $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.init(); this.audio.click(); this.setQuality(b.dataset.q); } });
    for (const id of ['segSound', 'segSound2']) $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { this.audio.init(); this.setMuted(b.dataset.s === 'off'); this.audio.click(); } });
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.code === 'KeyM') { this.audio.init(); this.setMuted(!this.audio.muted); }
      else if (e.code === 'Escape') {
        if (this.state === 'racing' || this.state === 'countdown') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (e.code === 'Enter') {
        if (this.state === 'title') start();
        else if (this.state === 'results') { this.audio.click(); this.startRace(); }
        else if (this.state === 'paused') this.resume();
      } else if (e.code === 'KeyP' && (this.state === 'racing' || this.state === 'countdown')) this.pause();
    });
    // first user gesture unlocks audio
    const unlock = () => { this.audio.init(); if (this.state === 'title') this.audio.setMusic('menu'); };
    addEventListener('pointerdown', unlock, { once: false });
    addEventListener('keydown', unlock, { once: false });
    this.syncSegs();
  }
  syncSegs() {
    const $ = (id) => document.getElementById(id);
    for (const id of ['segQuality', 'segQuality2']) setSeg($(id), 'q', this.settings.quality);
    for (const id of ['segSound', 'segSound2']) setSeg($(id), 's', this.audio && this.audio.muted ? 'off' : 'on');
  }
  setMuted(m) {
    this.audio.setMuted(m);
    this.settings.muted = m; saveSettings(this.settings);
    this.hud.mute(m);
    this.syncSegs();
  }
  show(id, v) { document.getElementById(id).classList.toggle('hidden', !v); }

  // ------------------------------------------------------------------ state changes
  toTitle() {
    this.state = 'title';
    this.resetRace(true);
    this.show('title', true); this.show('pause', false); this.show('results', false); this.hud.show(false);
    this.camRig.mode = 'orbit'; this.camRig.blend = 0;
    this.camRig.orbitRadius = 9.6; this.camRig.orbitHeight = 2.5;
    document.getElementById('titleBestVal').textContent = fmtTime(this.bestLap);
    this.playerAuto = false;
    this.input.enabled = false;
    this.audio.setMusic('menu');
    this.syncSegs();
  }

  startRace() {
    this.resetRace(true);
    this.state = 'countdown';
    this.show('title', false); this.show('pause', false); this.show('results', false); this.hud.show(true);
    this.hud.showHint();
    this.countdown = { t: 0, shown: -1 };
    this.camRig.mode = 'chase';
    this.camRig.snapBehind(this.player.car);
    this.camRig.dist = 9; this.camRig.height = 3.4;
    this.input.enabled = true;
    this.audio.init();
    this.audio.setMusic('race');
    this.world.setStartLights(0, false);
    this.hud.setPosition(4, 4); this.hud.setLap(1, TOTAL_LAPS); this.hud.setTimes(0, null, this.sessionBest);
  }

  pause() {
    if (this.state !== 'racing' && this.state !== 'countdown') return;
    this.prevState = this.state;
    this.state = 'paused';
    this.show('pause', true);
    this.audio.suspend();
  }
  resume() {
    if (this.state !== 'paused') return;
    this.state = this.prevState || 'racing';
    this.show('pause', false);
    this.audio.resume();
    this.acc = 0;
    this.lastT = performance.now();
  }

  // Put everything back on the grid.
  resetRace(settle = false) {
    const race = this.race;
    race.time = 0; race.started = false; race.playerFinished = false;
    for (const r of this.racers) {
      const c = r.car;
      c.frozen = true;
      const p = this.track.idx(Math.round(r.slot.dist / 2));
      c.place(p.x + p.rx * r.slot.lat, p.y + 0.95, p.z + p.rz * r.slot.lat, Math.atan2(p.fx, p.fz));
      c.boostEnergy = r.isPlayer ? 0.12 : 0;
      c.input.throttle = c.input.brake = c.input.steer = 0; c.input.handbrake = c.input.boost = false;
      c.boostBlend = 0;
      r.dist = r.slot.dist; r.idx = Math.round(r.slot.dist / 2 + this.track.N) % this.track.N;
      r.lap = 0; r.lapStart = 0; r.lapTimes = []; r.bestLap = Infinity; r.finished = false; r.finishTime = 0;
      r.offTrack = 0; r.stuck = 0; r.safe = { idx: r.idx }; r.lapJustDone = null; r.newBest = false;
    }
    for (const d of this.drivers) if (d) { d.steer = 0; d.mistake = 0; d.revenge = 0; d.offCur = 0; d.mistakeCooldown = 10 + Math.random() * 10; }
    this.autopilot.steer = 0; this.autopilot.offCur = 0;
    this.playerAuto = false;
    this.lastLap = null;
    this.finishTimer = 0; this.resultsTimer = 0; this.newBestRace = false; this.newBestLapThisRace = false;
    this.effects.clear();
    this.props.resetAll && this.props.resetAll();
    this.props.updateActivation(this.vehicles.map((v) => v.pos), true);
    this.hitCooldowns.clear();
    // let the suspension settle without showing the drop
    for (let i = 0; i < 90; i++) { for (const v of this.vehicles) { v.savePrev(); v.step(STEP); } this.phys.step(); for (const v of this.vehicles) v.post(); }
    for (const v of this.vehicles) { v.savePrev(); v.readState(0); v.prevPos.copy(v.pos); v.prevQuat.copy(v.quat); }
    race.update(0);
    this.world.setStartLights(0, false);
    this.hud && this.hud.setDrift(false, 0, 0);
  }

  // ------------------------------------------------------------------ frame loop
  start() {
    this.lastT = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      let dt = (now - this.lastT) / 1000;
      this.lastT = now;
      dt = Math.min(Math.max(dt, 0), 0.25); // rAF timestamps can precede performance.now() on the first frame
      this.frame(dt);
    };
    requestAnimationFrame(loop);
  }

  frame(dt) {
    if (this.manual) return; // automated tests drive the game explicitly
    this.adaptResolution(dt);
    this.time += dt;
    const paused = this.state === 'paused';
    if (!paused) {
      // read input once per frame
      this.playerInput = this.resolveOverride() || this.input.read(dt, this.player.car.speedFlat);
      if (this.input.enabled && this.playerInput.reset && (this.state === 'racing') && !this.playerAuto) this.respawn(this.player, true);
      this.acc += Math.min(dt, 0.1);
      let n = 0;
      while (this.acc >= STEP && n < 16) { this.stepOnce(); this.acc -= STEP; n++; }
      if (n === 16) this.acc = 0;
    }
    this.input.endFrame();
    const alpha = paused ? 1 : clamp(this.acc / STEP, 0, 1);
    this.render(alpha, paused ? 0 : dt);
  }

  // one fixed physics step
  stepOnce() {
    const st = this.state;
    const race = this.race;
    // --- countdown logic
    if (st === 'countdown') {
      this.countdown.t += STEP;
      const t = this.countdown.t;
      const seq = [0.9, 1.9, 2.9];
      const shown = t >= 3.9 ? 3 : t >= seq[2] ? 2 : t >= seq[1] ? 1 : t >= seq[0] ? 0 : -1;
      if (shown !== this.countdown.shown) {
        this.countdown.shown = shown;
        if (shown >= 0 && shown < 3) {
          this.world.setStartLights(shown + 1, false);
          this.hud.countdown(String(3 - shown));
          this.audio.countdown(1);
        } else if (shown === 3) this.goRace();
      }
    }
    // --- inputs
    const racing = st === 'racing' || st === 'finished' || st === 'results';
    const pInput = this.playerInput;
    for (let i = 0; i < this.racers.length; i++) {
      const r = this.racers[i], car = r.car;
      if (r.isPlayer) {
        if (this.playerAuto) {
          this.autopilot.update(STEP, { racer: r, others: this.racers, player: null, racing: true, time: this.time });
          car.input.throttle = Math.min(car.input.throttle, 0.6);
          car.input.brake = car.input.brake; car.input.boost = false;
        } else {
          const inp = car.input;
          inp.steer = pInput.steer; inp.throttle = pInput.throttle; inp.brake = pInput.brake; inp.handbrake = pInput.handbrake; inp.boost = pInput.boost;
        }
      } else {
        this.drivers[i].update(STEP, { racer: r, others: this.racers, player: this.player, racing, time: this.time, revThrottle: 0 });
      }
    }
    // --- physics
    for (const v of this.vehicles) { v.savePrev(); v.step(STEP); }
    this.phys.step();
    for (const v of this.vehicles) v.post();
    race.update(STEP);
    if ((this.actTick = (this.actTick || 0) + 1) % 24 === 0) this.props.updateActivation(this.vehicles.map((v) => v.pos));
    for (const r of this.racers) this.processContacts(r.car, r.isPlayer);
    this.postStep();
    if (st === 'finished') {
      this.finishTimer += STEP;
      if (this.finishTimer > 3.2) this.showResults();
    } else if (st === 'results') {
      this.resultsTimer += STEP;
      if (this.resultsTimer > 0.5) { this.resultsTimer = 0; this.refreshResults(); }
    }
  }

  goRace() {
    this.state = 'racing';
    this.race.begin();
    for (const r of this.racers) { r.car.frozen = false; }
    this.world.setStartLights(3, true);
    this.hud.countdown('GO!', true);
    this.audio.countdown(0);
    this.hud.flash(0.25);
    this.camRig.addTrauma(0.12);
  }

  postStep() {
    const p = this.player, car = p.car;
    // lap events
    for (const r of this.racers) {
      if (!r.lapJustDone) continue;
      const lj = r.lapJustDone; r.lapJustDone = null;
      if (r.isPlayer) {
        this.lastLap = lj.time;
        const prevBest = this.sessionBest;
        if (prevBest == null || lj.time < prevBest) {
          this.sessionBest = lj.time;
          if (this.bestLap == null || lj.time < this.bestLap) { this.bestLap = lj.time; saveBest(lj.time); this.newBestLapThisRace = true; }
          if (lj.lap < TOTAL_LAPS || true) this.hud.toast(prevBest == null ? `LAP ${lj.lap}  ${fmtTime(lj.time)}` : 'NEW BEST LAP!', 'good');
          this.audio.lapChime();
        } else this.hud.toast(`LAP ${lj.lap}  ${fmtTime(lj.time)}`, '');
      }
    }
    // finish
    if (this.race.playerFinished && this.state === 'racing') this.playerFinish();
    // auto-respawn when lost
    for (const r of this.racers) {
      if (this.state !== 'racing' && this.state !== 'finished' && this.state !== 'results') break;
      if (r.offTrack > 2.5 || r.stuck > 3.2 || (r.isPlayer && r.car.upDot < -0.4 && r.car.speedFlat < 2 && r.stuck > 1.6)) {
        this.respawn(r, r.isPlayer);
      }
    }
    // camera + audio events from the player's car
    if (car.landed > 3.5) { this.camRig.addTrauma(clamp(car.landed / 14, 0.15, 0.85)); this.audio.landing(car.landed); this.landingDust(car, car.landed); }
    else if (car.impact > 3.5) { this.camRig.addTrauma(clamp(car.impact / 16, 0.15, 0.9)); this.audio.impact(car.impact); }
    for (const r of this.racers) {
      if (r.isPlayer) continue;
      const d = r.car.pos.distanceTo(car.pos);
      if (r.car.impact > 4 && d < 40) this.audio.impact(r.car.impact * (1 - d / 40) * 0.8);
    }
    if (car.boosting && !this.wasBoosting) { this.audio.boostStart(); this.camRig.addTrauma(0.22); this.hud.flash(0.18); }
    this.wasBoosting = car.boosting;
    if (this.gearPrev !== undefined && car.gear > this.gearPrev && car.speed > 5) this.audio.shift();
    this.gearPrev = car.gear;
    // wrong way
    const pt = this.track.pts[p.idx];
    const along = car.vel.x * pt.fx + car.vel.z * pt.fz;
    if (along < -6 && this.state === 'racing') this.wrongTimer += STEP; else this.wrongTimer = Math.max(0, this.wrongTimer - STEP * 2);
    // drift bonus tracking
    if (car.drifting && car.driftTime < STEP * 2) this.driftStartBoost = car.boostEnergy;
  }

  playerFinish() {
    this.state = 'finished';
    this.playerAuto = true;
    this.input.enabled = false;
    this.finishTimer = 0;
    const pos = this.player.position;
    this.hud.toast(pos === 1 ? 'VICTORY!' : 'FINISH!', 'good');
    this.hud.flash(0.35);
    this.audio.fanfare();
    this.camRig.mode = 'orbit';
    this.camRig.orbitRadius = 10; this.camRig.orbitHeight = 2.8;
    // save best race
    const t = this.player.finishTime;
    const br = loadBestRace();
    if (br == null || t < br) { saveBestRace(t); this.newBestRace = true; } else this.newBestRace = false;
  }

  showResults() {
    this.state = 'results';
    this.resultsTimer = 0;
    this.hud.show(false);
    this.show('results', true);
    this.audio.setMusic('menu');
    this.refreshResults();
  }

  refreshResults() {
    const p = this.player;
    const order = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    const rows = order.map((r) => ({
      me: r.isPlayer, name: r.name, color: r.color,
      time: r.finished ? fmtTime(r.finishTime) : 'racing…',
      best: isFinite(r.bestLap) ? fmtTime(r.bestLap) : '--:--.---',
    }));
    fillResults(rows);
    const place = order.indexOf(p) + 1;
    document.getElementById('resPlace').textContent = ordinal(place).toUpperCase();
    const notes = [];
    if (place === 1) notes.push('You win! 🏆');
    else if (place === this.racers.length) notes.push('Last place — the rivals will not go easy next time.');
    if (this.newBestLapThisRace) notes.push('New best lap: ' + fmtTime(this.bestLap));
    if (this.newBestRace) notes.push('New best race time!');
    document.getElementById('resNote').textContent = notes.join('  ·  ');
  }

  respawn(r, announce) {
    const pose = this.race.respawnPose(r);
    r.car.place(pose.x, pose.y, pose.z, pose.yaw);
    r.car.frozen = false;
    // keep them moving so a reset isn't a dead stop
    r.offTrack = 0; r.stuck = 0;
    const p = this.track.idx(r.safe.idx);
    r.car.rb.setLinvel({ x: p.fx * 8, y: 0, z: p.fz * 8 }, true);
    if (r.isPlayer) {
      this.camRig.snapBehind(r.car);
      if (announce) this.hud.toast('RESET', 'blue');
      this.audio.click();
    }
  }

  landingDust(car, mag) {
    for (const w of car.wheels) if (w.contact) {
      for (let i = 0; i < 4; i++) this.effects.dust.emit(w.point.x, w.point.y + 0.1, w.point.z, (Math.random() - 0.5) * 5, 0.5 + Math.random() * 2, (Math.random() - 0.5) * 5, 0.8 + Math.random() * 0.6, 0.8, 3.4, 0.82, 0.72, 0.55, 0.4, -0.2, 1.1, 1);
    }
  }

  // sparks, prop hits and scrape sound from contacts
  processContacts(car, isPlayer) {
    const player = this.player.car;
    const near = isPlayer || car.pos.distanceToSquared(player.pos) < 90 * 90;
    car.scrape = 0;
    if (!near) return;
    const now = this.time;
    this.phys.contactPairsWith(car.col, (other) => {
      const h = other.handle;
      const isWall = this.wallHandles.has(h);
      const other_car = !isWall && this.carByHandle.get(h);
      if (isWall || other_car) {
        this.phys.contactPair(car.col, other, (m) => {
          if (m.numSolverContacts() === 0) return;
          const sp = car.speedFlat;
          if (sp < 5) return;
          const pt = m.solverContactPoint(0);
          const nx = car.pos.x - pt.x, nz = car.pos.z - pt.z, nl = Math.hypot(nx, nz) || 1;
          car.scrape = Math.max(car.scrape, clamp(sp / 30, 0.15, 1));
          if (Math.random() < 0.9) this.effects.spark(pt.x, pt.y, pt.z, nx / nl, nz / nl, sp, isPlayer ? 3 : 1);
        });
      } else if (isPlayer) {
        const info = this.props.handleMap.get(h);
        if (info) {
          const last = this.hitCooldowns.get(h) || 0;
          const sp = car.speedFlat;
          if (now - last > 0.35 && sp > 3) {
            this.hitCooldowns.set(h, now);
            this.audio.propHit(info.kind, sp);
            this.camRig.addTrauma(info.kind === 'barrel' ? 0.12 : 0.05);
            const pt = other.translation();
            const c = info.kind === 'cone' ? [1, 0.45, 0.1] : info.kind === 'fence' ? [0.9, 0.85, 0.75] : [0.85, 0.3, 0.2];
            for (let i = 0; i < (info.kind === 'cone' ? 2 : 4); i++) this.effects.chunk(pt.x, pt.y, pt.z, car.vel.x * 0.5 + (Math.random() - 0.5) * 6, 2 + Math.random() * 5, car.vel.z * 0.5 + (Math.random() - 0.5) * 6, c[0], c[1], c[2]);
          }
        }
      }
    });
  }

  // ------------------------------------------------------------------ test / debug helpers
  resolveOverride() { return typeof this.override === 'function' ? this.override(this) : this.override; }
  // Step the simulation without rendering (used by automated checks).
  advance(seconds, input = null) {
    if (input) this.override = input;
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) {
      if (this.override) this.playerInput = this.resolveOverride();
      this.stepOnce();
    }
    this.acc = 0;
  }
  // Alternate simulation and rendering like the real loop (for screenshots that need particles / skids).
  runFrames(seconds, input, frameDt = 0.05) {
    if (input) this.override = input;
    const n = Math.round(seconds / frameDt);
    for (let i = 0; i < n; i++) { this.advance(frameDt); this.render(1, frameDt); }
  }
  // Render a few frames so smoothing (camera, particles) settles, then leave the scene drawn.
  settle(frames = 4, dt = 0.05) {
    this.camRig.snapBehind(this.player.car);
    if (this.camRig.mode === 'chase') this.camRig.blend = 1;
    for (let i = 0; i < frames; i++) this.render(1, dt);
  }
  // Put the player at a track fraction (0..1), facing forward, optionally moving.
  teleport(frac, speed = 0, lat = 0) {
    const N = this.track.N;
    const i = Math.floor(frac * N) % N;
    const p = this.track.idx(i);
    const c = this.player.car;
    c.place(p.x + p.rx * lat, p.y + 0.9, p.z + p.rz * lat, Math.atan2(p.fx, p.fz));
    c.rb.setLinvel({ x: p.fx * speed, y: 0, z: p.fz * speed }, true);
    this.player.idx = i; this.player.dist = this.player.dist - (this.player.dist % this.track.L) + p.s;
    this.camRig.snapBehind(c);
  }

  // ------------------------------------------------------------------ rendering
  adaptResolution(dt) {
    if (this.state === 'loading' || this.state === 'paused' || this.lockRes) return;
    this.frameAvg = lerp(this.frameAvg, dt, 0.05);
    if (this.frameAvg > 1 / 44) { this.slowFrames++; this.fastFrames = 0; } else if (this.frameAvg < 1 / 75) { this.fastFrames++; this.slowFrames = 0; } else { this.slowFrames = 0; this.fastFrames = 0; }
    if (this.slowFrames > 50 && this.resScale > 0.55) { this.resScale = Math.max(0.55, this.resScale * 0.88); this.slowFrames = 0; this.applySize(); }
    else if (this.fastFrames > 240 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale * 1.1); this.fastFrames = 0; this.applySize(); }
  }

  render(alpha, dt) {
    const player = this.player, car = player.car;
    // visuals
    for (let i = 0; i < this.visuals.length; i++) this.visuals[i].update(this.vehicles[i], alpha, dt);
    this.props.syncVisuals();
    this.updateHeadlights();
    // camera
    const st = this.state;
    this.camRig.update(dt, car, alpha, { orbitSpeed: st === 'title' ? 0.2 : 0.3, blendRate: st === 'countdown' ? 1.6 : 2.4 });
    this.camera.updateMatrixWorld();
    // world (sky/shadows follow)
    this.tmpTarget = this.tmpTarget || new THREE.Vector3();
    this.tmpTarget.lerpVectors(car.prevPos, car.pos, alpha);
    this.world.update(dt, { target: this.tmpTarget, cameraPos: this.camera.position, viewH: this.renderer.domElement.height }, this.time);
    if (this.gradePass) this.gradePass.uniforms.uTime.value = (this.time * 7) % 100;
    // effects
    if (dt > 0) {
      for (const r of this.racers) this.effects.updateCar(r.car, dt, Math.abs(r.lateral), r.isPlayer);
      this.effects.update(dt, this.camera, this.renderer.domElement.height);
    }
    // HUD + audio
    if (st !== 'title' && st !== 'loading') this.updateHUD(dt);
    if (this.audio.ready) this.updateAudio(dt);
    // draw
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    this.stats.frames++;
  }

  updateHeadlights() {
    const on = this.quality.headlights;
    this._hp = this._hp || new THREE.Vector3(); this._ht = this._ht || new THREE.Vector3();
    for (const { sp, i, side } of this.spots) {
      sp.visible = on;
      if (!on) continue;
      const root = this.visuals[i].root;
      this._hp.set(side * 0.62, 0.0, 2.3); root.localToWorld(this._hp); sp.position.copy(this._hp);
      this._ht.set(side * 0.5, -1.4, 26); root.localToWorld(this._ht); sp.target.position.copy(this._ht);
      sp.target.updateMatrixWorld();
    }
    for (const v of this.visuals) for (const b of v.beams) b.visible = on;
  }

  updateHUD(dt) {
    const p = this.player, car = p.car, hud = this.hud;
    const kmh = car.speedKmh;
    hud.setPosition(p.position, this.racers.length);
    hud.setLap(Math.min(p.lap + 1, TOTAL_LAPS), TOTAL_LAPS);
    const cur = p.finished ? p.finishTime - (p.lapStart) : (this.race.started ? this.race.time - p.lapStart : 0);
    hud.setTimes(Math.max(0, cur), this.lastLap, this.sessionBest);
    hud.setSpeed(kmh, car.speed < -0.5 ? 'R' : kmh < 3 && !car.input.throttle ? 'N' : car.gear + 1, car.boostEnergy, car.boosting);
    hud.drawMinimap(this.racers, p);
    const sl = clamp((kmh - 110) / 170, 0, 1);
    hud.drawSpeedLines(sl * 0.8, car.boostBlend, dt, this.time);
    hud.setBoostFx(car.boostBlend * 0.9);
    hud.wrongWay(this.wrongTimer > 1.2);
    const drifting = car.drifting && car.driftTime > 0.35;
    hud.setDrift(drifting, car.driftTime, Math.max(0, car.boostEnergy - this.driftStartBoost));
  }

  updateAudio(dt) {
    const p = this.player, car = p.car;
    let squeal = 0;
    for (const w of car.wheels) if (w.contact) squeal = Math.max(squeal, w.skid);
    const inp = car.input;
    let throttle = this.state === 'countdown' ? (this.playerInput.throttle || 0) : inp.throttle;
    if (this.state === 'countdown') car.rpm = damp(car.rpm, throttle > 0.1 ? 5200 : 1300, 6, dt || 0.016);
    this.tmpRight = this.tmpRight || new THREE.Vector3();
    const camRight = this.tmpRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
    this.audio.update(dt, {
      player: car,
      engineOn: this.state !== 'title' && this.state !== 'paused',
      throttle,
      squeal: squeal * (car.grounded > 0 ? 1 : 0),
      scrape: car.scrape,
      rivals: this.racers.filter((r) => !r.isPlayer),
      listener: this.camera.position,
      right: camRight,
    });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 16));
