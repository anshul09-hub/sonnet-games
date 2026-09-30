// SNAKE ARENA: game controller. The host (or the offline device) runs SnakeSim; everyone renders the same snapshots.
// Guests send steering inputs, receive ~15 Hz snapshots and interpolate them ~110 ms behind, so motion stays smooth.
import * as THREE from 'three';
import { Session } from '../net/session.js';
import { SnakeSim, CFG } from './snake-sim.js';
import { SnakeView, SNAKE_COLORS } from './snake-view.js';
import { SnakeHud } from './snake-hud.js';
import { Keys, readPad, VirtualStick, TouchButton } from '../core/input.js';
import { toast } from '../core/ui.js';
import { profile, itemOf } from '../customize/catalog.js';
import { audio } from '../audio/audio.js';
import { params, isTouch, clamp, lerp, wrapAngle, hex } from '../core/util.js';

const DT = 1 / 60, DELAY = 110;
// key schemes for shared-keyboard play: [left, right, boost]
const SCHEMES = [
  { name: 'A / D + W', l: ['KeyA'], r: ['KeyD'], b: ['KeyW'] },
  { name: '← / → + ↑', l: ['ArrowLeft'], r: ['ArrowRight'], b: ['ArrowUp'] },
  { name: 'J / L + I', l: ['KeyJ'], r: ['KeyL'], b: ['KeyI'] },
  { name: 'V / N + B', l: ['KeyV'], r: ['KeyN'], b: ['KeyB'] },
];

export async function createGame({ app, session, rejoin }) {
  const g = new SnakeGame(app, session, rejoin);
  await g.init();
  return g;
}

class SnakeGame {
  constructor(app, session, rejoin) {
    this.app = app; this.engine = app.engine; this.session = session; this.cfg = session.cfg; this.rejoin = !!rejoin;
    this.n = this.cfg.seats.length; this.isHost = session.isHost;
    this.speed = Math.max(0.1, +params.get('speed') || 1); this.fast = this.speed >= 6;
    this.theme = itemOf('scene', params.get('scene') || profile.look.scene).theme;
    this.snaps = []; this.evQ = []; this.pendingEv = []; this.acc = 0; this.snapT = 0; this.hold = 1.1;
    this.rs = null; this.paused = false; this.over = false; this.overShown = false; this.stopped = false;
    this.lastSent = new Map(); this.lastSendT = 0; this.lastRd = 0; this.mouse = { x: 0, y: 0, moved: 0, aim: false }; this.count = -1;
  }

  async init() {
    this.view = new SnakeView({ app: this.app, cfg: this.cfg, theme: this.theme, fast: this.fast });
    await this.view.init();
    this.view.setLocal(this.session.mySeats);
    this.hud = new SnakeHud(this);
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0); this.hit = new THREE.Vector3();
    if (this.isHost) {
      this.sim = new SnakeSim(this.cfg.seats.map((s, i) => ({ kind: this.session.botControlled(i) ? 'bot' : 'human', level: s.level })), this.cfg.seed);
      this.rs = this.renderFromSim();
    }
  }

  // ------------------------------------------------------------------------------------------ lifecycle
  mount() {
    const { engine } = this;
    engine.setView(this.view.scene, this.view.camera);
    this.hud.mount();
    this.setupInput();
    this.session.attachGame((m, seat) => this.onMessage(m, seat));
    this.session.on('seat', (k, on) => this.onSeatChange(k, on));
    this.session.on('status', (s) => this.hud.setNet(s === 'ok' ? '' : 'Reconnecting…', s !== 'ok'));
    this.session.on('closed', (why) => { toast(why || 'Room closed', 'error', 4000); this.quit(true); });
    this.session.on('back', () => this.app.go('hub', { lobby: this.session }));
    this._onResize = () => this.view.frameCamera(true);
    addEventListener('resize', this._onResize);
    audio.playMusic(this.theme, { game: 'snake', energy: 0.75 });
    this.hud.setHint(this.controlsHint());
    this.cfg.seats.forEach((s, i) => this.hud.setAway(i, !this.session.seatOnline?.(i) && this.session.mode === 'online' && s.kind === 'human' && !this.session.isMine(i)));
    window.__snake = this.debugApi();
  }

  unmount() {
    removeEventListener('resize', this._onResize);
    this.teardownInput(); this.hud.unmount(); this.view.dispose();
    this.stopped = true; audio.stopMusic();
    if (window.__snake && window.__snake.game === this) delete window.__snake;
  }
  quit() { this.stopped = true; this.app.exitToHub(this.session); }

  controlsHint() {
    if (this.touch) return '<b>Drag</b> the left side to steer · hold <b>BOOST</b> to sprint (costs length)';
    if (this.session.mySeats.length > 1) return this.session.mySeats.map((s, j) => `<span style="color:${hex(SNAKE_COLORS[s % 4])}">P${s + 1}: ${SCHEMES[j % 4].name}</span>`).join(' &nbsp; ');
    return '<b>A / D</b> or <b>← / →</b> to steer, <b>mouse</b> to aim · hold <b>Space</b> to boost (costs length)';
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt) {
    if (this.stopped) return;
    this.pollInput(dt);
    if (this.isHost) this.hostUpdate(dt); else this.guestUpdate(dt);
    this.processEvents();
    this.view.setState(this.rs);
    this.view.update(dt);
    this.hud.update(this.rs);
    this.watchPhase();
    this.keys.endFrame();
  }

  // ------------------------------------------------------------------------------------------ host simulation
  hostUpdate(dt) {
    this.hold -= dt;
    if (this.hold <= 0 && !this.paused) {
      this.acc += Math.min(dt, 0.1) * this.speed; let steps = 0;
      while (this.acc >= DT && steps < 480) {
        this.sim.step(DT); this.acc -= DT; steps++;
        const ev = this.sim.drainEvents(); if (ev.length) { this.emit(ev); this.pendingEv.push(...ev); }
      }
      if (steps === 480) this.acc = 0;
    }
    this.snapT += dt;
    if (this.session.hostNet && this.snapT >= 0.066) { this.snapT = 0; this.sendSnap(); }
    this.rs = this.renderFromSim();
  }
  sendSnap() { this.session.broadcast({ t: 'snap', d: this.sim.snapshot(), ev: this.pendingEv }); this.pendingEv = []; }

  renderFromSim() {
    const sim = this.sim;
    return {
      ph: sim.phase, pt: sim.phaseT, R: sim.R, rd: sim.round, tm: sim.time, mw: sim.matchWinner ?? -1, rw: sim.roundWinner ?? -1,
      s: sim.snakes.map((s) => {
        const pts = []; if (s.alive) { const seg = sim.segments(s); for (let k = 1; k < seg.length; k++) pts.push(seg[k].x, seg[k].z); }
        return { alive: s.alive, x: s.x, z: s.z, ang: s.ang, len: s.len, boost: s.boost, wins: s.wins, kills: s.kills, pts };
      }),
      o: sim.orbs.map((o) => ({ id: o.id, x: o.x, z: o.z, big: o.big, hue: o.hue, hid: Math.max(0, o.t0 - sim.time) })),
    };
  }

  // ------------------------------------------------------------------------------------------ guest
  decode(d) {
    return {
      ph: d.ph, pt: d.pt, R: d.R, rd: d.rd, tm: d.tm, mw: d.mw ?? -1, rw: d.rw ?? -1,
      s: d.s.map((r) => ({ alive: r[0] === 1, x: r[1] / 20, z: r[2] / 20, ang: r[3] / 100, len: r[4] / 10, boost: r[5] === 1, wins: r[6], kills: r[7], pts: r[8].map((v) => v / 20) })),
      o: d.o.map((r) => ({ id: r[0], x: r[1] / 20, z: r[2] / 20, big: r[3] === 1, hue: r[4], hid: r[5] / 10 })),
    };
  }
  guestUpdate() {
    const now = performance.now(), sn = this.snaps; if (!sn.length) return;
    const rt = now - DELAY; let i = 0;
    while (i + 1 < sn.length && sn[i + 1].t <= rt) i++;
    while (i > 1) { sn.shift(); i--; }
    const a = sn[i], b = sn[i + 1];
    if (!b) { this.rs = a.rs; return; }
    const k = clamp((rt - a.t) / Math.max(1, b.t - a.t), 0, 1), A = a.rs, B = b.rs;
    this.rs = {
      ...B,
      s: B.s.map((sb, j) => {
        const sa = A.s[j]; if (!sa || sa.alive !== sb.alive || !sb.alive) return sb;
        const pts = new Array(sb.pts.length); for (let q = 0; q < pts.length; q++) pts[q] = q < sa.pts.length ? lerp(sa.pts[q], sb.pts[q], k) : sb.pts[q];
        return { ...sb, x: lerp(sa.x, sb.x, k), z: lerp(sa.z, sb.z, k), ang: sa.ang + wrapAngle(sb.ang - sa.ang) * k, len: lerp(sa.len, sb.len, k), pts };
      }),
    };
  }

  // ------------------------------------------------------------------------------------------ messages
  onMessage(m, fromSeat) {
    if (this.isHost) {
      if (m.a === 'in' && this.sim) this.sim.setInput(fromSeat, { steer: m.s || 0, tgt: m.g ?? null, boost: !!m.b });
      return;
    }
    if (m.t === 'snap') {
      const now = performance.now();
      if (this.rs && m.d.rd !== this.lastRd && this.lastRd) this.view.onRound();
      this.lastRd = m.d.rd;
      this.snaps.push({ t: now, rs: this.decode(m.d) });
      if (this.snaps.length > 12) this.snaps.shift();
      if (!this.rs) this.rs = this.snaps[0].rs;
      for (const ev of m.ev || []) this.evQ.push({ due: now + DELAY, ev });
    }
  }
  /** Events that the host produced arrive with each snapshot; guests replay them in sync with the delayed picture. */
  processEvents() {
    if (this.isHost || !this.evQ.length) return;
    const now = performance.now(), due = [];
    while (this.evQ.length && this.evQ[0].due <= now) due.push(this.evQ.shift().ev);
    if (due.length) this.emit(due);
  }

  /** Apply events to the view + HUD (called on host as they happen, on guests when due). */
  emit(evs) {
    this.view.applyEvents(evs);
    const seats = this.cfg.seats, nm = (i) => `<b style="color:${hex(SNAKE_COLORS[i % 4])}">${(seats[i]?.name || 'Bot')}</b>`;
    for (const ev of evs) {
      if (ev.k === 'go') { this.app.screenFx.banner('GO!', '', '#7dff6b', 700); audio.sfx('start'); }
      else if (ev.k === 'die') {
        if (ev.by >= 0 && ev.by !== ev.s) this.hud.feed(`${nm(ev.by)} ▸ ${nm(ev.s)}`);
        else this.hud.feed(`${nm(ev.s)} ${ev.why === 'edge' ? 'fell off the edge' : 'crashed'}`);
        if (this.session.isMine(ev.s) && this.session.mySeats.length === 1) this.app.screenFx.banner('WIPEOUT!', '', '#ff4d6d', 1100);
      } else if (ev.k === 'roundend') {
        if (ev.winner >= 0) this.app.screenFx.banner((seats[ev.winner]?.name || 'Bot').toUpperCase() + ' SCORES!', `${ev.wins[ev.winner]} / ${CFG.WINS_NEEDED}`, hex(SNAKE_COLORS[ev.winner % 4]), 2000);
        else this.app.screenFx.banner('DRAW', '', '#ffffff', 1500);
      }
    }
  }

  watchPhase() {
    const rs = this.rs; if (!rs) return;
    if (rs.ph === 'countdown') {
      const n = Math.max(1, Math.ceil(rs.pt - 0.02));
      if (n !== this.count && rs.pt > 0.05) { this.count = n; this.app.screenFx.banner(String(n), `ROUND ${rs.rd}`, '#ffd23f', 850); audio.sfx('tick'); }
    } else this.count = -1;
    if (rs.ph === 'over' && !this.overShown) { this.overShown = true; this.showOver(rs); }
  }

  onSeatChange(k, online) {
    if (!this.isHost) return;
    if (this.sim?.snakes[k]) this.sim.snakes[k].bot = this.session.botControlled(k);
    this.hud.setAway(k, !online);
    if (!online) toast(`${this.cfg.seats[k].name || 'Player'} disconnected. A bot takes over.`, 'info', 3000);
  }

  // ------------------------------------------------------------------------------------------ results
  async showOver(rs) {
    const wins = rs.s.map((s) => s.wins);
    let winner = rs.mw; if (winner < 0) winner = wins.indexOf(Math.max(...wins));
    const rows = rs.s.map((s, i) => ({ seat: i, wins: s.wins, kills: s.kills, peak: this.view.sn[i].peak })).sort((a, b) => b.wins - a.wins || b.kills - a.kills || b.peak - a.peak);
    if (this.isHost && this.cfg.seats[winner].kind === 'human' && this.session.isMine(winner)) profile.addWin('snake');
    else if (!this.isHost && this.session.isMine(winner)) profile.addWin('snake');
    this.view.startCelebrate(winner);
    audio.playMusic(this.theme, { game: 'win', energy: 0.9 }); audio.sfx('win');
    this.app.screenFx.banner('CHAMPION!', (this.cfg.seats[winner].name || 'Bot'), hex(SNAKE_COLORS[winner % 4]), 2400); this.app.screenFx.flash('#ffffff', 0.5, 0.6);
    await new Promise((r) => setTimeout(r, this.fast ? 50 : 2200));
    if (this.stopped) return;
    this.hud.showWin(rows, winner, {
      canAgain: this.isHost, waitingText: 'Waiting for the host…',
      onAgain: () => this.playAgain(),
      onLobby: () => (this.session.mode === 'online' ? (this.isHost ? (this.session.endMatch(), this.app.go('hub', { lobby: this.session })) : this.quit()) : this.quit()),
    });
  }

  playAgain() {
    if (this.session.mode === 'online') { this.session.endMatch(); this.app.go('hub', { lobby: this.session }); return; }
    const seats = this.cfg.seats.map((s) => ({ kind: s.kind, name: s.name, avatar: s.avatar, look: s.look, level: s.level }));
    const s2 = Session.offline('snake', this.session.mode, seats, this.cfg.opts); s2.start(this.cfg.opts);
    this.stopped = true; this.app.launch(s2);
  }

  // ------------------------------------------------------------------------------------------ input
  setupInput() {
    this.keys = new Keys(); this.touch = isTouch();
    const ui = document.getElementById('ui');
    if (this.touch) {
      this.stick = new VirtualStick(ui, { left: '0', right: '52%', top: '18%', bottom: '0', color: '#8fe8ff', radius: 62, label: 'STEER', anchor: [0.4, 0.74] });
      this.boostBtn = new TouchButton(ui, { label: 'BOOST', color: '#ffd23f', right: 'calc(26px + var(--safe-r))', bottom: 'calc(40px + var(--safe-b))', size: 96 });
    }
    this._pm = (e) => { if (e.pointerType !== 'mouse') return; const m = this.mouse; m.moved = Math.min(200, m.moved + Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0)); m.x = e.clientX; m.y = e.clientY; if (m.moved > 60) m.aim = true; };
    this._pd = (e) => { if (e.pointerType === 'mouse' && e.target === this.engine.canvas && e.button === 0) { this.mouseDown = true; this.mouse.aim = true; } };
    this._pu = (e) => { if (e.pointerType === 'mouse') this.mouseDown = false; };
    addEventListener('pointermove', this._pm); addEventListener('pointerdown', this._pd); addEventListener('pointerup', this._pu);
  }
  teardownInput() {
    this.keys?.dispose(); this.stick?.dispose(); this.boostBtn?.dispose();
    removeEventListener('pointermove', this._pm); removeEventListener('pointerdown', this._pd); removeEventListener('pointerup', this._pu);
  }

  readSeat(j, st) {
    const k = this.keys, multi = this.session.mySeats.length > 1;
    let s = 0, g = null, b = false;
    if (multi) { const sc = SCHEMES[j % 4]; s = (k.is(...sc.r) ? 1 : 0) - (k.is(...sc.l) ? 1 : 0); b = k.is(...sc.b); }
    else {
      s = k.axis(['KeyA', 'ArrowLeft'], ['KeyD', 'ArrowRight']); b = k.is('Space', 'KeyW', 'ArrowUp', 'ShiftLeft', 'ShiftRight') || !!this.mouseDown;
      if (s !== 0) this.mouse.aim = false, this.mouse.moved = 0;
      else if (this.mouse.aim && !this.touch && st) { g = this.mouseAngle(st); }
    }
    const pad = readPad(multi ? j : 0);
    if (pad) { const m = Math.hypot(pad.lx, pad.ly); if (m > 0.35) g = Math.atan2(pad.ly, pad.lx); if (pad.a || pad.rt) b = true; }
    if (this.touch && j === 0) { const o = this.stick.out; if (o.mag > 0.15) g = Math.atan2(o.y, o.x); if (this.boostBtn.down) b = true; }
    this.mouse.moved = Math.max(0, this.mouse.moved - 1.5);
    return { s, g, b };
  }
  mouseAngle(st) {
    const w = this.engine.w, h = this.engine.h; this.ndc.set((this.mouse.x / w) * 2 - 1, -(this.mouse.y / h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.view.camera);
    if (!this.ray.ray.intersectPlane(this.floor, this.hit)) return null;
    const dx = this.hit.x - st.x, dz = this.hit.z - st.z;
    return Math.hypot(dx, dz) < 1.6 ? null : Math.atan2(dz, dx);
  }

  pollInput() {
    if (!this.rs || this.over) return;
    const now = performance.now(), mine = this.session.mySeats;
    for (let j = 0; j < mine.length; j++) {
      const seat = mine[j], st = this.rs.s[seat]; if (!st) continue;
      const inp = this.readSeat(j, st), last = this.lastSent.get(seat);
      const changed = !last || last.s !== inp.s || last.b !== inp.b || (last.g == null) !== (inp.g == null) || (inp.g != null && Math.abs(wrapAngle(inp.g - last.g)) > 0.04);
      if ((changed && now - (last?.t || 0) >= 45) || now - (last?.t || 0) > 450) {
        this.lastSent.set(seat, { ...inp, t: now });
        this.session.input(seat, { a: 'in', s: inp.s, g: inp.g == null ? null : Math.round(inp.g * 100) / 100, b: inp.b ? 1 : 0 });
      }
    }
  }

  // ------------------------------------------------------------------------------------------ test hooks
  debugApi() {
    const g = this;
    return {
      game: g, get sim() { return g.sim; }, get rs() { return g.rs; }, get view() { return g.view; },
      setSpeed(v) { g.speed = v; g.fast = v >= 6; g.view.fast = g.fast; },
      autoplay(on = true) { g.sim?.snakes.forEach((s) => { s.bot = on || g.session.botControlled(s.id); }); },
      freeze(on = true) { g.paused = on; },
    };
  }
}
