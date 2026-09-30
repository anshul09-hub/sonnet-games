// BLASTER BRAWL: game controller. The host (or the offline device) runs BrawlSim with a real Rapier world; guests send
// inputs and interpolate ~15 Hz snapshots ~110 ms behind. Keyboard+mouse, twin-stick touch, gamepads and shared-keyboard local play.
import * as THREE from 'three';
import { Session } from '../net/session.js';
import { initPhysics } from '../core/physics.js';
import { BrawlSim, CFG, WEAPONS, generateMap } from './brawl-sim.js';
import { BrawlView, PLAYER_COLORS } from './brawl-view.js';
import { BrawlHud } from './brawl-hud.js';
import { Keys, readPad, VirtualStick, TouchButton } from '../core/input.js';
import { toast } from '../core/ui.js';
import { profile, itemOf } from '../customize/catalog.js';
import { audio } from '../audio/audio.js';
import { params, isTouch, clamp, lerp, wrapAngle, hex } from '../core/util.js';

const DT = 1 / 60, DELAY = 110;
// shared-keyboard schemes: move keys, fire, dash (aim follows movement)
const SCHEMES = [
  { name: 'WASD + F/G', u: ['KeyW'], d: ['KeyS'], l: ['KeyA'], r: ['KeyD'], f: ['KeyF'], s: ['KeyG'] },
  { name: 'Arrows + Enter/Shift', u: ['ArrowUp'], d: ['ArrowDown'], l: ['ArrowLeft'], r: ['ArrowRight'], f: ['Enter'], s: ['ShiftRight'] },
  { name: 'IJKL + O/U', u: ['KeyI'], d: ['KeyK'], l: ['KeyJ'], r: ['KeyL'], f: ['KeyO'], s: ['KeyU'] },
  { name: 'Numpad 8456 + 0/Enter', u: ['Numpad8'], d: ['Numpad5'], l: ['Numpad4'], r: ['Numpad6'], f: ['Numpad0'], s: ['NumpadEnter'] },
];

export async function createGame({ app, session, rejoin }) {
  const g = new BrawlGame(app, session, rejoin);
  await g.init();
  return g;
}

class BrawlGame {
  constructor(app, session, rejoin) {
    this.app = app; this.engine = app.engine; this.session = session; this.cfg = session.cfg; this.rejoin = !!rejoin;
    this.n = this.cfg.seats.length; this.isHost = session.isHost;
    this.speed = Math.max(0.1, +params.get('speed') || 1); this.fast = this.speed >= 6;
    this.theme = itemOf('scene', params.get('scene') || profile.look.scene).theme;
    this.snaps = []; this.evQ = []; this.pendingEv = []; this.acc = 0; this.snapT = 0; this.hold = 1.1;
    this.rs = null; this.paused = false; this.overShown = false; this.stopped = false;
    this.lastSent = new Map(); this.mouse = { x: 0, y: 0, moved: false }; this.count = -1; this.fire = false; this.dashQ = false;
  }

  async init() {
    const RAPIER = await initPhysics();
    this.map = this.isHost ? null : generateMap(this.cfg.seed);
    if (this.isHost) {
      this.sim = new BrawlSim(RAPIER, this.cfg.seats.map((s, i) => ({ kind: this.session.botControlled(i) ? 'bot' : 'human', level: s.level })), this.cfg.seed);
      this.map = this.sim.map;
    }
    this.view = new BrawlView({ app: this.app, cfg: this.cfg, theme: this.theme, map: this.map, fast: this.fast });
    await this.view.init();
    this.view.setLocal(this.session.mySeats);
    this.hud = new BrawlHud(this);
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.85); this.hit = new THREE.Vector3();
    if (this.isHost) this.rs = this.renderFromSim();
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  mount() {
    this.engine.setView(this.view.scene, this.view.camera);
    this.hud.mount(); this.setupInput();
    this.session.attachGame((m, seat) => this.onMessage(m, seat));
    this.session.on('seat', (k, on) => this.onSeatChange(k, on));
    this.session.on('status', (s) => this.hud.setNet(s === 'ok' ? '' : 'Reconnecting…', s !== 'ok'));
    this.session.on('closed', (why) => { toast(why || 'Room closed', 'error', 4000); this.quit(true); });
    this.session.on('back', () => this.app.go('hub', { lobby: this.session }));
    this._onResize = () => this.view.frameCamera(true); addEventListener('resize', this._onResize);
    audio.playMusic(this.theme, { game: 'brawl', energy: 0.9 });
    this.hud.setHint(this.controlsHint());
    if (!this.touch && this.session.mySeats.length === 1) this.engine.canvas.classList.add('bb-cursor');
    window.__brawl = this.debugApi();
  }
  unmount() {
    removeEventListener('resize', this._onResize); this.engine.canvas.classList.remove('bb-cursor');
    this.teardownInput(); this.hud.unmount(); this.view.dispose(); this.sim?.dispose();
    this.stopped = true; audio.stopMusic(); if (window.__brawl && window.__brawl.game === this) delete window.__brawl;
  }
  quit() { this.stopped = true; this.app.exitToHub(this.session); }
  controlsHint() {
    if (this.touch) return '<b>Left stick</b> moves · <b>right stick</b> aims and fires · <b>DASH</b> button dodges';
    if (this.session.mySeats.length > 1) return this.session.mySeats.map((s, j) => `<span style="color:${hex(PLAYER_COLORS[s % 4])}">P${s + 1}: ${SCHEMES[j % 4].name}</span>`).join(' &nbsp; ');
    return '<b>WASD</b> move · <b>mouse</b> aim · <b>click</b> fire · <b>Shift</b> dash · shoot barrels and crates!';
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    if (this.stopped) return;
    this.pollInput(dt);
    if (this.isHost) this.hostUpdate(dt); else this.guestUpdate();
    this.processEvents();
    this.view.setState(this.rs); this.view.update(dt); this.hud.update(this.rs); this.watchPhase(); this.keys.endFrame();
  }

  // ------------------------------------------------------------------------------------------ host
  hostUpdate(dt) {
    this.hold -= dt;
    if (this.hold <= 0 && !this.paused) {
      this.acc += Math.min(dt, 0.1) * this.speed; let steps = 0;
      while (this.acc >= DT && steps < 300) {
        this.sim.step(DT); this.acc -= DT; steps++;
        const ev = this.sim.drainEvents(); if (ev.length) { this.emit(ev); this.pendingEv.push(...ev); }
      }
      if (steps === 300) this.acc = 0;
    }
    this.snapT += dt;
    if (this.session.hostNet && this.snapT >= 0.066) { this.snapT = 0; this.session.broadcast({ t: 'snap', d: this.sim.snapshot(), ev: this.pendingEv }); this.pendingEv = []; }
    this.rs = this.renderFromSim();
  }
  renderFromSim() {
    const sim = this.sim, q = (v) => v;
    const o = []; for (const e of sim.props.values()) { if (!e.alive) continue; const t = e.body.translation(), r = e.body.rotation(); o.push({ id: e.id, x: t.x, y: t.y, z: t.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w, hp: e.hp }); }
    const wl = [], wd = []; for (const w of sim.walls.values()) { if (!w.alive) wd.push(w.id); else if (w.hp < w.maxHp) wl.push([w.id, w.hp]); }
    return {
      ph: sim.phase, pt: sim.phaseT, tm: sim.time, w: sim.winner ?? -1,
      p: sim.players.map((p) => ({ alive: p.alive, x: p.x, z: p.z, yaw: p.yaw, hp: p.hp, wid: CFG.W[p.weapon].id, ammo: p.ammo === Infinity ? -1 : p.ammo, shield: p.shield > 0, speed: p.speedT > 0, inv: p.invuln > 0, kos: p.kos, deaths: p.deaths, dashCd: p.dashCd, respawn: p.respawnT, vx: p.vx, vz: p.vz })),
      b: sim.bullets.map((b) => ({ id: b.id, x: b.x, z: b.z, a: b.a, w: CFG.W[b.w].id, o: b.owner })), o, wl, wd, u: sim.pickups.map((u) => [u.id, u.kind, u.x, u.z]),
    };
  }

  // ------------------------------------------------------------------------------------------ guest
  decode(d) {
    return {
      ph: d.ph, pt: d.pt, tm: d.tm, w: d.w,
      p: d.p.map((r) => ({ alive: r[0] === 1, x: r[1] / 100, z: r[2] / 100, yaw: r[3] / 100, hp: r[4], wid: r[5], ammo: r[6], shield: r[7] === 1, speed: r[8] === 1, inv: r[9] === 1, kos: r[10], deaths: r[11], dashCd: r[12] / 10, respawn: r[13] / 10, vx: r[14] / 100, vz: r[15] / 100 })),
      b: d.b.map((r) => ({ id: r[0], x: r[1] / 100, z: r[2] / 100, a: r[3] / 100, w: r[4], o: r[5] })),
      o: d.o.map((r) => ({ id: r[0], x: r[1] / 100, y: r[2] / 100, z: r[3] / 100, qx: r[4] / 1000, qy: r[5] / 1000, qz: r[6] / 1000, qw: r[7] / 1000, hp: r[8] })),
      wl: d.wl, wd: d.wd || [], u: d.u.map((r) => [r[0], r[1], r[2] / 100, r[3] / 100]),
    };
  }
  guestUpdate() {
    const now = performance.now(), sn = this.snaps; if (!sn.length) return;
    const rt = now - DELAY; let i = 0; while (i + 1 < sn.length && sn[i + 1].t <= rt) i++; while (i > 1) { sn.shift(); i--; }
    const a = sn[i], b = sn[i + 1]; if (!b) { this.rs = a.rs; return; }
    const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1), A = a.rs, B = b.rs;
    A.bmap ||= new Map(A.b.map((x) => [x.id, x])); A.omap ||= new Map(A.o.map((x) => [x.id, x]));
    this.rs = {
      ...B,
      p: B.p.map((pb, j) => { const pa = A.p[j]; if (!pa || !pa.alive || !pb.alive) return pb; return { ...pb, x: lerp(pa.x, pb.x, k), z: lerp(pa.z, pb.z, k), yaw: pa.yaw + wrapAngle(pb.yaw - pa.yaw) * k, vx: lerp(pa.vx, pb.vx, k), vz: lerp(pa.vz, pb.vz, k) }; }),
      b: B.b.map((bb) => { const ba = A.bmap.get(bb.id); return ba ? { ...bb, x: lerp(ba.x, bb.x, k), z: lerp(ba.z, bb.z, k) } : bb; }),
      o: B.o.map((ob) => { const oa = A.omap.get(ob.id); if (!oa) return ob; const s = oa.qx * ob.qx + oa.qy * ob.qy + oa.qz * ob.qz + oa.qw * ob.qw < 0 ? -1 : 1; let qx = lerp(oa.qx * s, ob.qx, k), qy = lerp(oa.qy * s, ob.qy, k), qz = lerp(oa.qz * s, ob.qz, k), qw = lerp(oa.qw * s, ob.qw, k); const l = Math.hypot(qx, qy, qz, qw) || 1; return { ...ob, x: lerp(oa.x, ob.x, k), y: lerp(oa.y, ob.y, k), z: lerp(oa.z, ob.z, k), qx: qx / l, qy: qy / l, qz: qz / l, qw: qw / l }; }),
    };
  }

  onMessage(m, fromSeat) {
    if (this.isHost) { if (m.a === 'in' && this.sim) this.sim.setInput(fromSeat, { mx: m.x || 0, mz: m.z || 0, aim: m.g ?? null, fire: !!m.f, dash: !!m.d }); return; }
    if (m.t === 'snap') {
      const now = performance.now(); this.snaps.push({ t: now, rs: this.decode(m.d) }); if (this.snaps.length > 12) this.snaps.shift(); if (!this.rs) this.rs = this.snaps[0].rs;
      for (const ev of m.ev || []) this.evQ.push({ due: now + DELAY, ev });
    }
  }
  processEvents() {
    if (this.isHost || !this.evQ.length) return; const now = performance.now(), due = [];
    while (this.evQ.length && this.evQ[0].due <= now) due.push(this.evQ.shift().ev); if (due.length) this.emit(due);
  }
  emit(evs) {
    this.view.applyEvents(evs);
    const seats = this.cfg.seats, nm = (i) => `<b style="color:${hex(PLAYER_COLORS[i % 4])}">${seats[i]?.name || 'Bot'}</b>`;
    for (const ev of evs) {
      if (ev.k === 'go') { this.app.screenFx.banner('FIGHT!', '', '#ff4d6d', 800); audio.sfx('start'); }
      else if (ev.k === 'ko') { this.hud.feed(ev.by >= 0 ? `${nm(ev.by)} ✕ ${nm(ev.p)}` : `${nm(ev.p)} blew up`); if (ev.by >= 0 && this.session.isMine(ev.by) && this.session.mySeats.length === 1) this.app.screenFx.banner('K.O.!', '', '#ffd23f', 700); }
    }
  }
  watchPhase() {
    const rs = this.rs; if (!rs) return;
    if (rs.ph === 'countdown') { const n = Math.max(1, Math.ceil(rs.pt - 0.02)); if (n !== this.count && rs.pt > 0.05) { this.count = n; this.app.screenFx.banner(String(n), 'BLASTER BRAWL', '#ffd23f', 850); audio.sfx('tick'); } } else this.count = -1;
    if (rs.ph === 'over' && !this.overShown) { this.overShown = true; this.showOver(rs); }
  }
  onSeatChange(k, online) {
    if (!this.isHost) return; if (this.sim?.players[k]) this.sim.players[k].bot = this.session.botControlled(k);
    this.hud.setAway(k, !online); if (!online) toast(`${this.cfg.seats[k].name || 'Player'} disconnected. A bot takes over.`, 'info', 3000);
  }

  // ------------------------------------------------------------------------------------------ results
  async showOver(rs) {
    let winner = rs.w; if (winner < 0) winner = rs.p.reduce((a, b, i) => (b.kos > rs.p[a].kos ? i : a), 0);
    const rows = rs.p.map((p, i) => ({ seat: i, kos: p.kos, deaths: p.deaths })).sort((a, b) => b.kos - a.kos || a.deaths - b.deaths);
    if (this.session.isMine(winner) && (this.isHost ? this.cfg.seats[winner].kind === 'human' : true)) profile.addWin('brawl');
    this.view.startCelebrate(winner); audio.playMusic(this.theme, { game: 'win', energy: 0.9 }); audio.sfx('win');
    this.app.screenFx.banner('CHAMPION!', this.cfg.seats[winner].name || 'Bot', hex(PLAYER_COLORS[winner % 4]), 2400); this.app.screenFx.flash('#ffffff', 0.5, 0.6);
    await new Promise((r) => setTimeout(r, this.fast ? 50 : 2200)); if (this.stopped) return;
    this.hud.showWin(rows, winner, { canAgain: this.isHost, waitingText: 'Waiting for the host…', onAgain: () => this.playAgain(),
      onLobby: () => (this.session.mode === 'online' ? (this.isHost ? (this.session.endMatch(), this.app.go('hub', { lobby: this.session })) : this.quit()) : this.quit()) });
  }
  playAgain() {
    if (this.session.mode === 'online') { this.session.endMatch(); this.app.go('hub', { lobby: this.session }); return; }
    const seats = this.cfg.seats.map((s) => ({ kind: s.kind, name: s.name, avatar: s.avatar, look: s.look, level: s.level }));
    const s2 = Session.offline('brawl', this.session.mode, seats, this.cfg.opts); s2.start(this.cfg.opts); this.stopped = true; this.app.launch(s2);
  }

  // ------------------------------------------------------------------------------------------ input
  setupInput() {
    this.keys = new Keys(); this.touch = isTouch(); const ui = document.getElementById('ui');
    if (this.touch) {
      this.stickL = new VirtualStick(ui, { left: '0', right: '52%', top: '30%', bottom: '0', color: '#8fe8ff', radius: 60, label: 'MOVE', anchor: [0.4, 0.78] });
      this.stickR = new VirtualStick(ui, { left: '48%', right: '0', top: '30%', bottom: '0', color: '#ff9ab0', radius: 60, label: 'AIM + FIRE', anchor: [0.62, 0.78] });
      this.dashBtn = new TouchButton(ui, { label: 'DASH', color: '#ffd23f', right: 'calc(20px + var(--safe-r))', bottom: 'calc(190px + var(--safe-b))', size: 74 });
    }
    this._pm = (e) => { if (e.pointerType !== 'mouse') return; this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.moved = true; };
    this._pd = (e) => { if (e.pointerType !== 'mouse' || e.target !== this.engine.canvas) return; if (e.button === 0) this.fire = true; else if (e.button === 2) this.dashQ = true; };
    this._pu = (e) => { if (e.pointerType === 'mouse' && e.button === 0) this.fire = false; };
    this._cm = (e) => { if (e.target === this.engine.canvas) e.preventDefault(); };
    addEventListener('pointermove', this._pm); addEventListener('pointerdown', this._pd); addEventListener('pointerup', this._pu); addEventListener('contextmenu', this._cm);
  }
  teardownInput() { this.keys?.dispose(); this.stickL?.dispose(); this.stickR?.dispose(); this.dashBtn?.dispose(); removeEventListener('pointermove', this._pm); removeEventListener('pointerdown', this._pd); removeEventListener('pointerup', this._pu); removeEventListener('contextmenu', this._cm); }

  readSeat(j, st) {
    const k = this.keys, multi = this.session.mySeats.length > 1; let mx = 0, mz = 0, aim = null, fire = false, dash = false;
    if (multi) { const sc = SCHEMES[j % 4]; mx = (k.is(...sc.r) ? 1 : 0) - (k.is(...sc.l) ? 1 : 0); mz = (k.is(...sc.d) ? 1 : 0) - (k.is(...sc.u) ? 1 : 0); fire = k.is(...sc.f); dash = k.pressed(...sc.s); }
    else {
      mx = k.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']); mz = k.axis(['KeyW', 'ArrowUp'], ['KeyS', 'ArrowDown']);
      fire = k.is('Space', 'KeyJ') || this.fire; dash = k.pressed('ShiftLeft', 'ShiftRight', 'KeyE', 'KeyK') || this.dashQ; this.dashQ = false;
      if (this.mouse.moved && !this.touch && st) aim = this.mouseAngle(st);
    }
    const pad = readPad(multi ? j : 0);
    if (pad) { if (Math.hypot(pad.lx, pad.ly) > 0.2) { mx = pad.lx; mz = pad.ly; } if (Math.hypot(pad.rx, pad.ry) > 0.35) aim = Math.atan2(pad.ry, pad.rx); if (pad.rt) fire = true; if (pad.a || pad.lt) dash = true; }
    if (this.touch && j === 0) {
      const l = this.stickL.out, r = this.stickR.out; if (l.mag > 0.12) { mx = l.x; mz = l.y; }
      if (r.mag > 0.2) { aim = Math.atan2(r.y, r.x); fire = r.mag > 0.4; }
      if (this.dashBtn.consume()) dash = true;
    }
    return { mx: Math.round(mx * 100) / 100, mz: Math.round(mz * 100) / 100, aim, fire, dash };
  }
  mouseAngle(st) {
    this.ndc.set((this.mouse.x / this.engine.w) * 2 - 1, -(this.mouse.y / this.engine.h) * 2 + 1); this.ray.setFromCamera(this.ndc, this.view.camera);
    if (!this.ray.ray.intersectPlane(this.plane, this.hit)) return null; const dx = this.hit.x - st.x, dz = this.hit.z - st.z; return Math.hypot(dx, dz) < 0.4 ? null : Math.atan2(dz, dx);
  }
  pollInput() {
    if (!this.rs || this.rs.ph === 'over') return; const now = performance.now(), mine = this.session.mySeats;
    for (let j = 0; j < mine.length; j++) {
      const seat = mine[j], st = this.rs.p[seat]; if (!st) continue; const inp = this.readSeat(j, st), last = this.lastSent.get(seat);
      const changed = !last || last.mx !== inp.mx || last.mz !== inp.mz || last.fire !== inp.fire || inp.dash || (last.aim == null) !== (inp.aim == null) || (inp.aim != null && Math.abs(wrapAngle(inp.aim - last.aim)) > 0.035);
      if ((changed && now - (last?.t || 0) >= 30) || now - (last?.t || 0) > 400) {
        this.lastSent.set(seat, { ...inp, t: now });
        this.session.input(seat, { a: 'in', x: inp.mx, z: inp.mz, g: inp.aim == null ? null : Math.round(inp.aim * 100) / 100, f: inp.fire ? 1 : 0, d: inp.dash ? 1 : 0 });
      }
    }
  }

  debugApi() {
    const g = this;
    return {
      game: g, get sim() { return g.sim; }, get rs() { return g.rs; }, get view() { return g.view; },
      setSpeed(v) { g.speed = v; g.fast = v >= 6; g.view.fast = g.fast; },
      autoplay(on = true) { g.sim?.players.forEach((p) => { p.bot = on || g.session.botControlled(p.id); }); },
      freeze(on = true) { g.paused = on; },
    };
  }
}
