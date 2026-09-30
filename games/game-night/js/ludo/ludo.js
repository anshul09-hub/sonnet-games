// LUDO 3D: game controller. The host (or the offline device) runs the rules and the dice physics; every machine renders
// the same packets of events, so all players see identical throws, hops and captures.
import * as THREE from 'three';
import { initPhysics, Physics, RAPIER, G as PG } from '../core/physics.js';
import { Particles, CameraRig } from '../core/fx.js';
import { Clock, Rng, ease, params, clamp, damp, wrapAngle, hex, sleep, store, lerp } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { toast } from '../core/ui.js';
import { profile, itemOf, DEFAULT_LOOK } from '../customize/catalog.js';
import { Session } from '../net/session.js';
import { newGame, applyRoll, applyMove, colorsFor, ranking, cloneState, COLOR_HEX, HOME } from './rules.js';
import { chooseMove } from './bots.js';
import { DiceSim, packThrow, unpackThrow } from './dice-sim.js';
import { Board } from './board.js';
import { DiceView } from './dice-view.js';
import { Pieces } from './pieces.js';
import { LudoHud } from './hud.js';
import { fitCamera } from './cam.js';
import { buildWorld } from './worlds/index.js';

const TURN_MS = 30000;
const THEME_OF_SCENE = (id) => itemOf('scene', id).theme;

export async function createGame({ app, session, rejoin }) {
  const g = new LudoGame(app, session, rejoin);
  await g.init();
  return g;
}

const nullHud = () => new Proxy(function () {}, { get: (t, k) => (k === 'cards' ? [] : k === 'then' ? undefined : nullHud()), apply: () => undefined });

/** A real Ludo scene without HUD/input/rules loop, used by the Customize screen for live previews. */
export async function createPreviewGame(app, { look, sceneId }) {
  const seats = [{ kind: 'human', name: 'You', avatar: 'fox', look }, { kind: 'bot', name: 'Rival', avatar: 'cat', level: 'normal', look: { ...look, skin: look.skin === 'ninja' ? 'fox' : 'ninja', finisher: 'katana' } }];
  const s = Session.offline('ludo', 'bots', seats, { timer: false, rotate: false }); s.start({});
  const g = new LudoGame(app, s, false, { preview: true, sceneId });
  await g.init();
  return g;
}

class LudoGame {
  constructor(app, session, rejoin, opts = {}) {
    this.preview = !!opts.preview;
    this.app = app; this.engine = app.engine; this.session = session; this.cfg = session.cfg; this.rejoin = !!rejoin;
    this.n = this.cfg.seats.length; this.colors = colorsFor(this.n);
    this.speed = Math.max(0.1, +params.get('speed') || 1); this.fast = this.speed >= 6;
    this.clock = new Clock(); this.clock.scale = this.speed;
    this.time = 0; this.isHost = session.isHost; this.rng = new Rng(this.cfg.seed);
    this.queue = []; this.busy = false; this.idleWaiters = []; this.seq = 0; this.appliedSeq = 0;
    this.prompt = null; this.pending = null; this.afk = new Set(); this.afkCount = [];
    this.autoplay = false; this.forceRoll = null; this.stats = { rolls: 0 };
    this.sceneId = opts.sceneId || params.get('scene') || profile.look.scene;
    this.theme = THEME_OF_SCENE(this.sceneId);
    this.viewYaw = 0; this.viewYawTarget = 0; this.over = false; this.menuOpen = false;
    this.slowmo = 1; this.dustColor = 0xd8cdb4; this.activeColor = 0xffffff;
  }

  seatColor(s) { return this.colors[s]; }
  seatLook(s) { return { ...DEFAULT_LOOK, ...(this.cfg.seats[s].look || {}) }; }
  seatName(s) { return this.cfg.seats[s].name || 'Bot'; }
  isBot(s) { return this.autoplay || this.session.botControlled(s) || this.afk.has(s); }

  async init() {
    const { engine } = this;
    await initPhysics();
    this.phys = new Physics({ gravity: 26, events: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, engine.aspect, 0.3, 700);
    this.rig = new CameraRig(this.camera);
    this.fx = new Particles(this.scene, engine);
    this.board = new Board(this.theme);
    this.scene.add(this.board.group);
    this.world = await buildWorld(this.sceneId, { scene: this.scene, engine, fx: this.fx, camera: this.camera });
    this.dustColor = this.theme === 'anime' ? 0xd8cdb4 : this.theme === 'gamer' ? 0xb8a0ff : 0x9fe8ff;
    this.dice = new DiceView(this, this.theme, this.seatLook(this.session.mySeats[0] ?? 0).dice);
    this.scene.add(this.dice.root);
    if (this.isHost) { this.sim = new DiceSim(RAPIER); }
    this.pieces = new Pieces(this);
    this.pieces.build(this.n);
    this.state = newGame(this.n, this.cfg.opts); this.display = cloneState(this.state);
    this.pieces.layoutAll(this.display);
    this.hud = this.preview ? nullHud() : new LudoHud(this);
    this.raycaster = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    // static colliders for the capture physics: board slab + grass floor (pieces kicked off the board fall into the meadow)
    this.phys.fixedBox(0, -0.35, 0, 8.3, 0.35, 8.3, { restitution: 0.25, friction: 0.7, groups: PG.STATIC << 16 | 0xffff });
    this.phys.fixedBox(0, this.world.groundY - 1.0, 0, 90, 1.0, 90, { restitution: 0.2, friction: 0.9, groups: PG.STATIC << 16 | 0xffff });
    this.phys.onContact = (a, b) => this.capture?.onContact?.(a, b);
    const { CaptureDirector } = await import('./capture.js');
    this.capture = new CaptureDirector(this);
    this._onResize = () => this.frameCamera(true);
    addEventListener('resize', this._onResize);
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  mountPreview() {
    this.engine.setView(this.scene, this.camera);
    this.engine.setBloom(this.theme === 'anime' ? 0.28 : 0.55, 0.6, this.theme === 'anime' ? 0.9 : 0.72);
    this.shotActive = true; this.frameCamera(true);
  }

  mount() {
    const { engine } = this;
    engine.setView(this.scene, this.camera);
    engine.setBloom(this.theme === 'anime' ? 0.28 : 0.55, 0.6, this.theme === 'anime' ? 0.9 : 0.72);
    this.hud.mount();
    this.setupInput();
    this.hud.setNet('');
    this.session.attachGame((m, seat) => this.onMessage(m, seat));
    this.session.on('seat', (k, on) => this.onSeatChange(k, on));
    this.session.on('status', (s) => { this.hud.setNet(s === 'ok' ? '' : 'Reconnecting…', s !== 'ok'); });
    this.session.on('rejoined', () => this.send({ a: 'sync' }));
    this.session.on('closed', (why) => { toast(why || 'Room closed', 'error', 4000); this.quit(true); });
    this.session.on('back', () => this.app.go('hub', { lobby: this.session }));
    audio.playMusic(this.theme, { game: 'ludo', energy: 0.6 });
    this.frameCamera(false);
    this.hud.cards.forEach((c, i) => this.hud.setHome(i, 0));
    this.hud.setTurn(0);
    this.introShot();
    if (this.isHost) setTimeout(() => this.hostLoop(), 400);
    else if (this.rejoin) this.send({ a: 'sync' });
    window.__ludo = this.debugApi();
  }

  unmount() {
    removeEventListener('resize', this._onResize);
    this.teardownInput();
    this.hud.unmount(); this.hud.stopTimer?.();
    this.fx.dispose(); this.world.dispose?.(); this.pieces.dispose(); this.dice.dispose();
    this.phys.dispose(); this.capture?.dispose?.(); this.podium?.dispose();
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    this.alive = false; this.stopped = true;
    if (!this.preview) audio.stopMusic();
    this.engine.renderer.toneMappingExposure = 1;
    if (window.__ludo && window.__ludo.game === this) delete window.__ludo;
  }

  quit(silent) { this.stopped = true; this.app.exitToHub(this.session); }

  update(dt) {
    if (this.stopped) return;
    if (this.freeze) { this.rig.update(dt); this.hud.update(0); return; }
    const rdt = dt;
    this.clock.scale = this.speed * this.slowmo * (this.boost || 1);
    const gdt = dt * this.clock.scale;
    this.time += gdt;
    this.clock.update(dt);
    this.phys.timeScale = this.clock.scale; this.phys.update(dt);
    this.viewYaw = damp(this.viewYaw, this.viewYaw + wrapAngle(this.viewYawTarget - this.viewYaw), 6, rdt);
    this.board.group.rotation.y = this.viewYaw;
    this.board.update(this.time);
    this.pieces.update(gdt, this.time);
    this.dice.update(gdt, this.time);
    this.world.update(gdt, this.time);
    this.capture?.update?.(gdt);
    this.podium?.update(gdt);
    this.fx.update(gdt);
    if (!this.shotActive && this.homeCam && !this.preview) { const t = this.time; const h = this.homeCam; this.rig.goTo(h.pos.clone().add(new THREE.Vector3(Math.sin(t * 0.13) * 0.9, Math.sin(t * 0.17) * 0.35, Math.cos(t * 0.11) * 0.5)), h.look.clone().add(new THREE.Vector3(Math.sin(t * 0.09) * 0.3, 0, 0)), this.homeFov, 1.4); }
    this.rig.update(rdt);
    this.hud.update(rdt);
    this.tickPending(rdt);
    this.tickPointer();
  }

  // ------------------------------------------------------------------------------------------ camera
  frameCamera(snap) {
    const aspect = this.engine.aspect;
    const layout = aspect > 1.3 ? 'side' : 'front';
    this.dice.place(layout);
    if (this.world.blockers) { const bl = this.world.blockers; for (let i = bl.length - 1; i >= 0; i--) if (bl[i].dyn) bl.splice(i, 1); bl.push({ x: this.dice.root.position.x, z: this.dice.root.position.z, r: 6.2, dyn: true }); }
    const pts = [];
    for (const [x, z] of [[-8.4, -8.4], [8.4, -8.4], [-8.4, 8.4], [8.4, 8.4]]) { pts.push(new THREE.Vector3(x, 0, z)); pts.push(new THREE.Vector3(x, 1.5, z)); }
    pts.push(...this.dice.corners());
    const portrait = aspect < 1;
    const fit = fitCamera(pts, { fov: 36, aspect, pitch: portrait ? 56 : 46, yaw: 0, margins: { l: 0.03, r: 0.03, t: portrait ? 0.15 : 0.15, b: portrait ? 0.15 : 0.08 } });
    this.homeCam = fit;
    this.homeFov = 36;
    if (this.shotActive) return;
    if (snap) { this.rig.set(fit.pos, fit.look, 36); } else this.rig.goTo(fit.pos, fit.look, 36, 2.5);
  }
  homeShot(stiff = 3) { this.shotActive = false; this.rig.direct = false; this.rig.goTo(this.homeCam.pos, this.homeCam.look, this.homeFov, stiff); this.rig.tRoll = 0; }

  async introShot() {
    const h = this.homeCam; if (!h) return;
    const from = h.pos.clone().multiplyScalar(1.5).add(new THREE.Vector3(18, 12, 10)); from.y = Math.max(from.y, 32);
    this.rig.set(from, h.look, 46); this.shotActive = true;
    await this.clock.wait(0.2);
    this.rig.goTo(h.pos, h.look, this.homeFov, 1.6);
    await this.clock.wait(this.fast ? 0.1 : 1.8);
    this.shotActive = false; this.frameCamera(false);
  }

  // ------------------------------------------------------------------------------------------ view yaw (seat-oriented board)
  orientTo(seat) { const c = this.seatColor(seat); this.viewYawTarget = (((c + 1) % 4) * Math.PI) / 2; }

  // ------------------------------------------------------------------------------------------ messaging
  send(m) { this.session.input(this.session.mySeats[0] ?? 0, m); }

  onMessage(m, fromSeat) {
    if (this.isHost) return this.hostMessage(m, fromSeat);
    switch (m.t) {
      case 'ev': this.enqueue(m); break;
      case 'prompt': this.prompt = m; this.refreshPrompt(); if (m.seat != null) this.hud.startTimer(m.seat, m.ms / 1000); break;
      case 'sync': this.applySync(m); break;
      case 'over': this.pendingOver = m; this.tryShowOver(); break;
      case 'afk': this.afk = new Set(m.seats); this.hud && this.cfg.seats.forEach((s, i) => this.hud.setAway(i, this.afk.has(i) || (m.away || []).includes(i))); break;
    }
  }

  onSeatChange(k, online) {
    if (!this.isHost) return;
    this.hud.setAway(k, !online);
    this.session.broadcast({ t: 'afk', seats: [...this.afk], away: this.cfg.seats.map((s, i) => i).filter((i) => !this.session.seatOnline(i)) });
    if (online) { this.afk.delete(k); this.session.sendToSeat(k, this.syncPacket()); if (this.pending) this.session.sendToSeat(k, { t: 'prompt', seat: this.pending.seat, phase: this.pending.kind, ms: Math.max(0, this.pending.deadline - performance.now()), seq: this.seq }); }
    else toast(`${this.seatName(k)} disconnected. A bot takes over.`, 'info', 3000);
    // a pending human wait for a now-offline seat is resolved by the bot logic on the next tick
  }

  syncPacket() { return { t: 'sync', state: cloneState(this.state), seq: this.seq, over: this.over ? this.overPacket : null }; }

  applySync(m) {
    this.queue.length = 0;
    this.display = cloneState(m.state); this.appliedSeq = m.seq; this.seq = m.seq;
    this.pieces.layoutAll(this.display); this.updateHudFromState(this.display);
    this.refreshPrompt();
    if (m.over) { this.pendingOver = m.over; this.tryShowOver(); }
  }

  // ------------------------------------------------------------------------------------------ view queue
  enqueue(p) { this.queue.push(p); this.pump(); }
  idle() { return !this.busy && !this.queue.length ? Promise.resolve() : new Promise((r) => this.idleWaiters.push(r)); }
  async pump() {
    if (this.busy) return; this.busy = true;
    while (this.queue.length && !this.stopped) {
      const p = this.queue.shift();
      try { await this.playPacket(p); } catch (e) { console.error('packet failed', e); }
      this.display = cloneState(p.state); this.appliedSeq = p.seq;
      this.pieces.settleStacks(this.display); this.updateHudFromState(this.display);
    }
    this.busy = false;
    this.refreshPrompt();
    const w = this.idleWaiters.splice(0); w.forEach((r) => r());
    this.tryShowOver();
  }

  updateHudFromState(st) {
    this.hud.setTurn(st.turn);
    st.tokens.forEach((arr, s) => this.hud.setHome(s, arr.filter((p) => p === HOME).length));
    this.activeColor = COLOR_HEX[this.seatColor(st.turn)];
  }

  async playPacket(p) {
    const ev = p.events, clock = this.clock;
    if (p.kind === 'roll') {
      const re = ev.find((e) => e.t === 'roll');
      const seat = re.seat;
      this.hud.setHint(''); this.hud.showRollButton(false); this.dice.setActive(false); this.hud.stopTimer();
      this.pieces.setHighlight([]);
      if (this.dice.state === 'settled') await this.dice.returnToRest();
      const res = unpackThrow(p.throw);
      await this.dice.playThrow(res, { fast: this.fast });
      this.hud.showRoll(re.v, seat);
      if (re.v === 6) { audio.sfx('six'); this.rig.shake(0.18); }
      await clock.wait(this.fast ? 0.02 : 0.55);
      for (const e of ev) {
        if (e.t === 'triple6') { this.app.screenFx.banner('3 SIXES!', 'Turn lost', '#ff4d5e', 1500); audio.sfx('oh'); await clock.wait(this.fast ? 0.02 : 1.0); }
        else if (e.t === 'nomove') { this.hud.toast(this.seatName(e.seat) + ': no legal move'); await clock.wait(this.fast ? 0.02 : 0.5); }
        else if (e.t === 'extra') { this.hud.toast(this.seatName(e.seat) + ' rolls again!', 'good'); }
        else if (e.t === 'turn') { audio.sfx('turn'); if (this.session.mode === 'local' && this.cfg.opts?.rotate) this.orientTo(e.seat); }
      }
    } else {
      for (const e of ev) {
        if (e.t === 'hop') await this.animateHop(e);
        else if (e.t === 'capture') await this.capture.play(e);
        else if (e.t === 'home') await this.animateHome(e);
        else if (e.t === 'extra') { this.hud.toast(this.seatName(e.seat) + (e.why === 'capture' ? ' captured! Extra turn' : e.why === 'home' ? ' got home! Extra turn' : ' rolls again!'), 'good'); }
        else if (e.t === 'turn') { audio.sfx('turn'); if (this.session.mode === 'local' && this.cfg.opts?.rotate) this.orientTo(e.seat); await clock.wait(this.fast ? 0.01 : 0.25); }
        else if (e.t === 'win') { this.over = true; }
      }
    }
  }

  async animateHop(e) {
    const t = this.pieces.tokens[e.seat][e.tok];
    if (!this.fast) {
      this.followToken(t);
      await this.pieces.hop(e.seat, e.tok, e.path, { leave: e.leave });
      await this.clock.wait(0.08);
    } else { t.group.position.copy(this.board.tokenPos(t.colorIdx, e.to, e.tok)); t.rel = e.to; await this.clock.wait(0.01); }
    if (e.leave && !this.fast) this.fx.ring(this.pieces.worldOf(t), 2.4, COLOR_HEX[t.colorIdx]);
  }

  followToken(t) {
    if (this.shotActive) return;
    const wp = this.pieces.worldOf(t); const h = this.homeCam;
    const look = h.look.clone().lerp(wp, 0.22);
    this.rig.goTo(h.pos.clone().lerp(new THREE.Vector3(wp.x, h.pos.y * 0.86, wp.z + (h.pos.z - h.look.z) * 0.8), 0.18), look, this.homeFov, 2.2);
  }

  async animateHome(e) {
    const t = this.pieces.tokens[e.seat][e.tok], clock = this.clock;
    audio.sfx('home');
    const w = this.pieces.worldOf(t);
    this.fx.confetti(w.clone().setY(1.2), this.fast ? 4 : 40, [COLOR_HEX[t.colorIdx], 0xffffff, 0xffd23f]);
    this.fx.ring(w, 3.5, COLOR_HEX[t.colorIdx], 0.7); this.fx.flash(w.clone().setY(0.8), 3, COLOR_HEX[t.colorIdx]);
    this.world.cheer?.(0.6);
    if (!this.fast) {
      this.rig.shake(0.2); this.app.screenFx.banner('HOME!', this.seatName(e.seat), hex(COLOR_HEX[t.colorIdx]), 1300);
      const c = this.board.group.localToWorld(new THREE.Vector3(0, 0, 0));
      this.shotActive = true; this.rig.goTo(new THREE.Vector3(c.x + 7 * Math.sin(this.time), 9, c.z + 9), c.clone().setY(0.4), 34, 3);
      await clock.wait(1.4); this.homeShot(3);
    }
    await clock.tween(this.fast ? 0.01 : 0.5, (k) => { t.scale = 1 + Math.sin(k * Math.PI) * 0.3; }, ease.linear); t.scale = 1;
  }

  // ------------------------------------------------------------------------------------------ prompts / UI state
  refreshPrompt() {
    if (this.stopped || !this.hud) return;
    const st = this.display, s = st.turn, mine = this.session.isMine(s);
    const fresh = this.isHost ? true : (this.prompt && this.prompt.seat === s && this.prompt.phase === st.phase && this.appliedSeq >= this.prompt.seq);
    const ready = !this.busy && !this.queue.length && st.phase !== 'over' && fresh && !this.sentFor;
    this.hud.showRollButton(false);
    if (st.phase === 'over') { this.hud.setHint(''); return; }
    if (this.busy || !ready) { if (!this.busy && !fresh) this.hud.setHint(`${this.seatName(s)}'s turn`); return; }
    if (this.isHost && !this.pending) { this.hud.setHint(this.isBot(s) ? `${this.seatName(s)} is thinking…` : ''); }
    const canAct = mine && !this.isBot(s);
    if (st.phase === 'roll') {
      this.dice.setActive(canAct); this.pieces.setHighlight([]);
      this.hud.showRollButton(canAct);
      this.hud.setHint(canAct ? (this.session.mySeats.length > 1 ? `${this.seatName(s)}: flick or click the dice` : 'Flick or click the dice!') : `${this.seatName(s)}'s turn`);
    } else if (st.phase === 'move') {
      this.dice.setActive(false);
      this.pieces.setHighlight(canAct ? st.legal.map((k) => [s, k]) : []);
      this.hud.setHint(canAct ? 'Tap a glowing token to move' : `${this.seatName(s)} is choosing…`);
      if (canAct) this.showMovePreview(st.legal);
    }
  }
  showMovePreview() {}

  onRollButton() { this.throwDice(null, 1); }
  throwDice(dir, power) {
    const s = this.display.turn;
    if (this.display.phase !== 'roll' || !this.session.isMine(s) || this.isBot(s) || this.sentFor || this.busy) return;
    this.sentFor = 'roll'; this.hud.showRollButton(false); this.dice.setActive(false);
    this.session.input(s, { a: 'throw', dir, power });
    setTimeout(() => { this.sentFor = null; }, 1200);
  }
  moveToken(k) {
    const s = this.display.turn;
    if (this.display.phase !== 'move' || !this.session.isMine(s) || this.isBot(s) || this.sentFor || this.busy || !this.display.legal.includes(k)) return;
    this.sentFor = 'move'; this.pieces.setHighlight([]);
    this.session.input(s, { a: 'move', tok: k });
    setTimeout(() => { this.sentFor = null; }, 1200);
  }

  // ------------------------------------------------------------------------------------------ input
  setupInput() {
    const el = this.engine.canvas; this.flick = null; this.hoverTok = null;
    this._pd = (e) => this.pointerDown(e); this._pm = (e) => this.pointerMove(e); this._pu = (e) => this.pointerUp(e);
    el.addEventListener('pointerdown', this._pd); el.addEventListener('pointermove', this._pm); addEventListener('pointerup', this._pu);
    this._key = (e) => { if (e.code === 'Space' || e.code === 'Enter') { if (this.display.phase === 'roll') { this.throwDice(null, 1); e.preventDefault(); } } if (e.code === 'Escape') this.hud.openMenu(); };
    addEventListener('keydown', this._key);
  }
  teardownInput() { const el = this.engine.canvas; el.removeEventListener('pointerdown', this._pd); el.removeEventListener('pointermove', this._pm); removeEventListener('pointerup', this._pu); removeEventListener('keydown', this._key); }

  setRay(e) { const r = this.engine.canvas.getBoundingClientRect(); this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); this.raycaster.setFromCamera(this.ndc, this.camera); }
  groundPoint(e, y = 0) { this.setRay(e); const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y), out = new THREE.Vector3(); return this.raycaster.ray.intersectPlane(pl, out) ? out : null; }

  pointerDown(e) {
    if (this.stopped || this.session.closedFlag) return;
    if (this.captureLive) { this.boost = 3.5; return; } // tap to fast-forward a cinematic
    this.pointerPos = { x: e.clientX, y: e.clientY };
    const st = this.display, s = st.turn;
    if (this.busy || this.over) return;
    const canAct = this.session.isMine(s) && !this.isBot(s);
    if (!canAct) return;
    this.setRay(e);
    if (st.phase === 'move') {
      const hits = this.raycaster.intersectObjects(this.pieces.pickables, false);
      for (const h of hits) { const pc = h.object.userData.piece; if (pc && pc.seat === s && st.legal.includes(pc.tok)) { this.moveToken(pc.tok); return; } }
    } else if (st.phase === 'roll') {
      if (this.dice.hitTest(this.raycaster)) { const p0 = this.groundPoint(e, this.dice.root.position.y); this.flick = { id: e.pointerId, pts: [{ x: e.clientX, y: e.clientY, t: performance.now(), g: p0 }], p0 }; }
    }
  }
  pointerMove(e) {
    this.pointerPos = { x: e.clientX, y: e.clientY };
    if (this.flick && e.pointerId === this.flick.id) { const g = this.groundPoint(e, this.dice.root.position.y); this.flick.pts.push({ x: e.clientX, y: e.clientY, t: performance.now(), g }); if (this.flick.pts.length > 12) this.flick.pts.shift(); }
  }
  pointerUp(e) {
    const f = this.flick; if (!f || e.pointerId !== f.id) return; this.flick = null;
    const a = f.pts[0], b = f.pts[f.pts.length - 1], dist = Math.hypot(b.x - f.pts[0].x, b.y - f.pts[0].y);
    // use the last ~120ms for velocity
    let ref = f.pts[0]; for (const p of f.pts) if (b.t - p.t < 140) { ref = p; break; }
    const dt = Math.max(16, b.t - ref.t), v = Math.hypot(b.x - ref.x, b.y - ref.y) / dt * 1000;
    if (dist < 14 || !f.p0 || !b.g) { this.throwDice(null, 1); return; }
    const dx = b.g.x - f.p0.x, dz = b.g.z - f.p0.z;
    const local = this.dice.worldDirToLocal(dx, dz);
    this.throwDice(local, clamp(v / 1400, 0.6, 1.4));
  }
  tickPointer() {
    // hover cursor over legal tokens
    if (this.display.phase === 'move' && this.pointerPos && !this.busy) { this.engine.canvas.style.cursor = this.pieces.legal.size ? 'pointer' : ''; }
    else this.engine.canvas.style.cursor = this.display.phase === 'roll' && this.dice.active ? 'grab' : '';
  }

  // ------------------------------------------------------------------------------------------ HOST
  hostMessage(m, seat) {
    if (m.a === 'throw' && this.pending && this.pending.kind === 'roll' && this.pending.seat === seat) this.pending.resolve({ ...m, from: 'human' });
    else if (m.a === 'move' && this.pending && this.pending.kind === 'move' && this.pending.seat === seat && this.state.legal.includes(m.tok)) this.pending.resolve({ ...m, from: 'human' });
    else if (m.a === 'sync') this.session.sendToSeat(seat, this.syncPacket());
  }

  /** Wait for a human input (or timeout). Resolves {timeout:true} when the 30s turn timer expires. */
  waitInput(seat, kind, ms) {
    return new Promise((resolve) => {
      const deadline = performance.now() + ms;
      this.pending = { seat, kind, deadline, resolve: (v) => { this.pending = null; resolve(v); }, remainingGame: ms / 1000 };
      const p = { t: 'prompt', seat, phase: kind, ms, seq: this.seq };
      this.session.broadcast(p); this.prompt = p; this.hud.startTimer(seat, ms / 1000);
      this.refreshPrompt();
    });
  }
  /** The turn timer runs in game time so it scales with test speed. */
  tickPending(dt) {
    const p = this.pending; if (!p) return;
    p.remainingGame -= dt * this.clock.scale;
    if (p.remainingGame <= 0) p.resolve({ timeout: true });
    else if (!this.session.seatOnline(p.seat) || this.isBot(p.seat)) p.resolve({ timeout: false, bot: true });
  }

  async hostLoop() {
    await this.clock.wait(this.fast ? 0.1 : 1.6);
    this.session.broadcast(this.syncPacket());
    while (!this.stopped && this.state.phase !== 'over') {
      await this.idle();
      if (this.stopped) return;
      const st = this.state;
      if (st.phase === 'roll') await this.hostRoll(); else if (st.phase === 'move') await this.hostMove();
      // let the local view finish (it may still be playing)
      await this.clock.wait(0.01);
    }
    await this.idle();
    if (!this.stopped) this.hostFinish();
  }

  async hostRoll() {
    const st = this.state, seat = st.turn;
    let input;
    if (this.isBot(seat)) { await this.clock.wait(this.fast ? 0.02 : 0.7 + this.rng.next() * 0.6); input = { from: 'bot' }; }
    else {
      input = await this.waitInput(seat, 'roll', TURN_MS);
      if (input.timeout) this.noteTimeout(seat); else if (input.from === 'human') this.afkCount[seat] = 0;
    }
    this.hud.stopTimer();
    const timerOff = this.cfg.opts?.timer === false;
    const dir = input.dir || null, power = input.power || 1;
    const res = this.forceRoll ? this.sim.throwForcing(this.forceRoll, () => this.rng.next(), dir, power) : this.sim.throwDie(this.sim.randomThrow(() => this.rng.next(), dir, power));
    this.forceRoll = null;
    const events = applyRoll(this.state, res.value);
    this.emitPacket('roll', events, { throw: packThrow(res) });
  }

  async hostMove() {
    const st = this.state, seat = st.turn;
    let tok;
    const legal = st.legal;
    const positions = new Set(legal.map((k) => st.tokens[seat][k]));
    if (legal.length === 1 || positions.size === 1) { await this.clock.wait(this.fast ? 0.02 : 0.45); tok = legal[0]; }
    else if (this.isBot(seat)) { await this.clock.wait(this.fast ? 0.02 : 0.6 + this.rng.next() * 0.6); tok = chooseMove(st, seat, this.levelOf(seat), () => this.rng.next()); }
    else {
      const input = await this.waitInput(seat, 'move', TURN_MS);
      if (input.timeout) { this.noteTimeout(seat); tok = chooseMove(st, seat, 'normal', () => this.rng.next()); }
      else if (input.bot) tok = chooseMove(st, seat, this.levelOf(seat), () => this.rng.next());
      else { this.afkCount[seat] = 0; tok = input.tok; }
    }
    this.hud.stopTimer();
    const events = applyMove(this.state, tok);
    this.emitPacket('move', events, {});
  }

  levelOf(seat) { const s = this.cfg.seats[seat]; return s.kind === 'bot' ? s.level : 'normal'; }

  noteTimeout(seat) {
    this.afkCount[seat] = (this.afkCount[seat] || 0) + 1;
    if (this.afkCount[seat] >= 2 && !this.afk.has(seat)) {
      this.afk.add(seat); this.hud.setAway(seat, true); toast(`${this.seatName(seat)} is away. A bot plays for them.`, 'info', 3000);
      this.session.broadcast({ t: 'afk', seats: [...this.afk] });
    }
  }

  emitPacket(kind, events, extra) {
    this.seq++;
    const p = { t: 'ev', seq: this.seq, kind, events, state: cloneState(this.state), ...extra };
    this.session.broadcast(p);
    this.enqueue(p);
    if (this.afk.size && kind === 'roll') { /* AFK players regain control as soon as they act */ }
  }

  hostFinish() {
    const st = this.state, rank = ranking(st);
    this.overPacket = { t: 'over', rank, state: cloneState(st) };
    this.over = true;
    if (!this.cfg.seats[rank[0]].kind !== 'bot') { /* stats */ }
    const wSeat = this.cfg.seats[rank[0]];
    if (wSeat.kind === 'human' && this.session.isMine(rank[0])) profile.addWin('ludo');
    this.session.broadcast(this.overPacket);
    this.pendingOver = this.overPacket; this.tryShowOver();
  }

  // ------------------------------------------------------------------------------------------ finish / win screen
  async tryShowOver() {
    if (!this.pendingOver || this.busy || this.queue.length || this.overShown) return;
    this.overShown = true;
    const { rank, state } = this.pendingOver;
    await this.winSequence(rank, state);
  }

  async winSequence(rank, state) {
    const { PodiumScene } = await import('./podium.js');
    this.hud.setHint(''); this.hud.showRollButton(false); this.hud.stopTimer(); this.pieces.setHighlight([]);
    this.podium = new PodiumScene(this, rank, state);
    await this.podium.play();
    const canAgain = this.isHost;
    this.hud.showWin(rank, state, this.cfg, {
      canAgain, waitingText: 'Waiting for the host…',
      onAgain: () => this.playAgain(),
      onLobby: () => (this.session.mode === 'online' ? (this.isHost ? (this.session.endMatch(), this.app.go('hub', { lobby: this.session })) : this.quit()) : this.quit()),
    });
  }

  playAgain() {
    if (this.session.mode === 'online') { this.session.endMatch(); this.app.go('hub', { lobby: this.session }); return; }
    const seats = this.cfg.seats.map((s) => ({ kind: s.kind, name: s.name, avatar: s.avatar, look: s.look, level: s.level }));
    const s2 = Session.offline('ludo', this.session.mode, seats, this.cfg.opts); s2.start(this.cfg.opts);
    this.stopped = true; this.app.launch(s2);
  }

  // ------------------------------------------------------------------------------------------ debug / test hooks
  debugApi() {
    const g = this;
    return {
      game: g, get state() { return g.state; }, get display() { return g.display; },
      forceNext(v) { g.forceRoll = v; }, setSpeed(v) { g.speed = v; g.fast = v >= 6; },
      autoplay(on = true) { g.autoplay = on; },
      /** Test helper: replace token positions/turn on the host. */
      setup({ tokens, turn = 0 }) { g.state.tokens = tokens.map((a) => a.slice()); g.state.turn = turn; g.state.phase = 'roll'; g.state.roll = null; g.state.sixes = 0; g.state.legal = []; g.display = cloneState(g.state); g.pieces.layoutAll(g.display); g.updateHudFromState(g.display); g.session.broadcast(g.syncPacket()); },
      idle: () => g.idle(),
      get busy() { return g.busy; },
    };
  }
}
