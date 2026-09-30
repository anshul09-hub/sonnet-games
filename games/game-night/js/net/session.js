// Session = lobby seats + game message plumbing, identical for online host, online guest, local and vs-bots play.
// The host is the source of truth. Guests send inputs; the host simulates and broadcasts.
import { HostNet, ClientNet, getClientId, cleanCode } from './net.js';
import { store } from '../core/util.js';

export const GAMES = {
  ludo: { id: 'ludo', name: 'LUDO', min: 2, max: 4, tagline: 'Real 3D physics dice, epic captures' },
  snake: { id: 'snake', name: 'SNAKE ARENA', min: 2, max: 4, tagline: 'Glowing snakes, last one alive wins' },
  brawl: { id: 'brawl', name: 'BLASTER BRAWL', min: 2, max: 4, tagline: 'Top-down mayhem, first to 10 KOs' },
};

class Emitter {
  constructor() { this.h = {}; }
  on(t, fn) { (this.h[t] ||= new Set()).add(fn); return () => this.h[t].delete(fn); }
  emit(t, ...a) { (this.h[t] || []).forEach((fn) => { try { fn(...a); } catch (e) { console.error(e); } }); }
}

const emptySeat = (i) => ({ i, kind: 'open', name: '', avatar: 'fox', look: null, level: 'normal', online: false, clientId: null, local: false });
const pub = (s) => ({ i: s.i, kind: s.kind, name: s.name, avatar: s.avatar, look: s.look, level: s.level, online: s.online, local: false });

export class Session extends Emitter {
  constructor(game, mode) {
    super();
    this.game = game; this.mode = mode; // 'online' | 'local' | 'bots'
    this.isHost = true; this.code = ''; this.phase = 'lobby';
    this.seats = [0, 1, 2, 3].map(emptySeat);
    this.mySeats = []; this.clientId = getClientId();
    this.hostNet = null; this.clientNet = null; this.cfg = null; this.seedBase = 0;
    this.status = 'ok'; // ok | dropped
    this.gameHandler = null; // host: (msg, seatIdx) ; guest: (msg)
    this.pending = [];
  }

  /** The game registers its message handler here; anything that arrived while modules were loading is flushed. */
  attachGame(fn) { this.gameHandler = fn; const q = this.pending; this.pending = []; q.forEach(([m, seat]) => fn(m, seat)); }
  _deliver(m, seat) { if (this.gameHandler) this.gameHandler(m, seat); else this.pending.push([m, seat]); }

  // ---------------------------------------------------------------- factories
  static async createHost(game, profile) {
    const s = new Session(game, 'online');
    s.hostNet = new HostNet();
    s.code = await s.hostNet.open();
    s.seats[0] = { ...emptySeat(0), kind: 'human', name: profile.name, avatar: profile.avatar, look: profile.look, online: true, clientId: s.clientId, local: true };
    s.mySeats = [0];
    s._wireHost();
    store.set('lastRoom', { code: s.code, host: true, game, ts: Date.now() });
    return s;
  }

  static async joinRoom(code, profile, rejoin = false) {
    const s = new Session(null, 'online');
    s.isHost = false; s.code = cleanCode(code);
    s.clientNet = new ClientNet();
    const welcome = await s.clientNet.join(s.code, { clientId: s.clientId, name: profile.name, avatar: profile.avatar, look: profile.look, rejoin });
    s._applyWelcome(welcome);
    s._wireClient();
    // tell the host right away when this tab goes away, so a bot can take the seat (rejoin still works)
    s._onHide = () => { if (!s.closedFlag) s.clientNet?.send({ t: 'leave' }); };
    addEventListener('pagehide', s._onHide);
    store.set('lastRoom', { code: s.code, host: false, game: s.game, ts: Date.now() });
    return s;
  }

  /** Local pass-and-play or vs bots: everything runs on this device. */
  static offline(game, mode, seatSpecs, opts = {}) {
    const s = new Session(game, mode);
    seatSpecs.forEach((sp, i) => { s.seats[i] = { ...emptySeat(i), ...sp, i, online: true, local: sp.kind === 'human', clientId: s.clientId }; });
    s.mySeats = s.seats.filter((x) => x.kind === 'human').map((x) => x.i);
    s.opts = opts;
    return s;
  }

  // ---------------------------------------------------------------- host wiring
  _wireHost() {
    const n = this.hostNet;
    n.onHello = (clientId, msg, conn) => this._hostHello(clientId, msg);
    n.onMessage = (clientId, msg) => {
      const seat = this.seats.find((x) => x.clientId === clientId);
      if (!seat) return;
      if (msg.t === 'g') this._deliver(msg.m, seat.i);
      else if (msg.t === 'look') { seat.name = (msg.name || seat.name).slice(0, 14); seat.avatar = msg.avatar || seat.avatar; seat.look = msg.look || seat.look; this._pushRoom(); }
      else if (msg.t === 'leave') { this._hostLeave(clientId, 'left'); }
    };
    n.onLeave = (clientId, why) => this._hostLeave(clientId, why);
  }

  _hostHello(clientId, msg) {
    let seat = this.seats.find((s) => s.clientId === clientId && s.kind === 'human');
    let rejoined = !!seat;
    if (!seat && this.phase === 'playing') {
      // late rejoin from another device: take an away human seat with the same name
      seat = this.seats.find((s) => s.kind === 'human' && !s.online && !s.local && s.name === (msg.name || '').slice(0, 14));
      if (seat) { seat.clientId = clientId; rejoined = true; }
    }
    if (!seat) {
      if (this.phase === 'playing') { this.hostNet.sendTo(clientId, { t: 'reject', reason: 'That game has already started.' }); this.hostNet.kick(clientId); return; }
      const max = GAMES[this.game].max;
      seat = this.seats.slice(0, max).find((s) => s.kind === 'open');
      if (!seat) { this.hostNet.sendTo(clientId, { t: 'reject', reason: 'The room is full.' }); this.hostNet.kick(clientId); return; }
      seat.kind = 'human'; seat.clientId = clientId;
    }
    seat.name = (msg.name || 'Guest').slice(0, 14); seat.avatar = msg.avatar || 'cat'; seat.look = msg.look || seat.look; seat.online = true; seat.away = false;
    this.hostNet.sendTo(clientId, { t: 'welcome', seat: seat.i, room: this._room(), started: this.phase === 'playing' ? this.cfg : null, rejoined });
    this._pushRoom();
    if (this.phase === 'playing') this.emit('seat', seat.i, true);
  }

  _hostLeave(clientId, why) {
    const seat = this.seats.find((s) => s.clientId === clientId);
    if (!seat) return;
    if (this.phase === 'lobby') { Object.assign(seat, emptySeat(seat.i)); }
    else { seat.online = false; }
    this._pushRoom();
    this.emit('seat', seat.i, false, why);
  }

  _room() { return { game: this.game, code: this.code, phase: this.phase, seats: this.seats.map(pub) }; }
  _pushRoom() { if (this.hostNet) this.hostNet.broadcast({ t: 'room', room: this._room() }); this.emit('room'); }

  // host lobby controls
  setGame(game) { if (!this.isHost || this.phase !== 'lobby') return; this.game = game; const max = GAMES[game].max; this.seats.forEach((s, i) => { if (i >= max && s.kind !== 'open') { if (s.clientId && s.clientId !== this.clientId) this.hostNet.kick(s.clientId); Object.assign(s, emptySeat(i)); } }); this._pushRoom(); }
  setSeatBot(i, level = 'normal') { if (!this.isHost || i === 0) return; const s = this.seats[i]; if (s.kind === 'human' && s.clientId) this.hostNet?.kick(s.clientId); Object.assign(s, emptySeat(i), { kind: 'bot', level, name: '', online: true }); this._pushRoom(); }
  setSeatOpen(i) { if (!this.isHost || i === 0) return; const s = this.seats[i]; if (s.kind === 'human' && s.clientId) this.hostNet?.kick(s.clientId); Object.assign(s, emptySeat(i)); this._pushRoom(); }
  updateSelf(profile) { const s = this.seats[this.mySeats[0]]; if (!s) return; s.name = profile.name; s.avatar = profile.avatar; s.look = profile.look; if (this.isHost) this._pushRoom(); else this.clientNet?.send({ t: 'look', name: profile.name, avatar: profile.avatar, look: profile.look }); }

  playerCount() { return this.seats.slice(0, GAMES[this.game].max).filter((s) => s.kind !== 'open').length; }
  canStart() { return this.playerCount() >= GAMES[this.game].min; }

  /** Host starts the match: broadcast the config, everyone (host included) constructs the game from it. */
  start(opts = {}) {
    if (!this.isHost) return;
    const max = GAMES[this.game].max;
    const active = this.seats.slice(0, max).filter((s) => s.kind !== 'open');
    const cfg = { game: this.game, code: this.code, seed: (Math.random() * 2 ** 31) >>> 0, opts, seats: active.map((s, k) => ({ ...pub(s), i: k, srcSeat: s.i })) };
    // remap seat indices to compact 0..n-1; remember owners
    this.playSeats = active;
    active.forEach((s, k) => { s.play = k; });
    this.cfg = cfg; this.phase = 'playing';
    if (this.mode === 'online') { this.hostNet.broadcast({ t: 'start', cfg }); this._pushRoom(); }
    this.mySeats = active.filter((s) => s.local || (this.mode !== 'online' && s.kind === 'human')).map((s) => s.play);
    this.emit('start', cfg);
  }

  // game phase: host side
  botControlled(k) { const s = this.playSeats?.[k] || this.seats[k]; return s.kind === 'bot' || (s.kind === 'human' && !s.online && !s.local && this.mode === 'online'); }
  seatOnline(k) { const s = this.playSeats?.[k] || this.seats[k]; return s.online || s.local; }
  isMine(k) { return this.mySeats.includes(k); }
  /** Inputs from local players: host applies directly, guests send. */
  input(seat, m) { if (this.isHost) this.gameHandler?.(m, seat); else this.clientNet?.send({ t: 'g', m }); }
  /** Host -> everyone else. */
  broadcast(m) { if (this.hostNet) this.hostNet.broadcast({ t: 'g', m }); }
  sendToSeat(k, m) { if (!this.hostNet) return; const s = this.playSeats?.[k]; if (s?.clientId) this.hostNet.sendTo(s.clientId, { t: 'g', m }); }
  /** Host: back to the lobby after a match. */
  endMatch() { if (!this.isHost) return; this.phase = 'lobby'; this.cfg = null; this.gameHandler = null; this.pending = []; this.seats.forEach((s) => { if (s.kind === 'human' && !s.online && !s.local) Object.assign(s, emptySeat(s.i)); }); if (this.hostNet) { this.hostNet.broadcast({ t: 'back' }); this._pushRoom(); } }

  // ---------------------------------------------------------------- guest wiring
  _applyWelcome(w) {
    this.game = w.room.game; this.phase = w.room.phase; this.seats = w.room.seats.map((s) => ({ ...s })); this.mySeatLobby = w.seat; this.mySeats = [w.seat];
    if (w.started) this.cfg = w.started;
    this.welcome = w;
  }
  _wireClient() {
    const c = this.clientNet;
    c.onMessage = (m) => {
      if (m.t === 'room') { this.game = m.room.game; this.phase = m.room.phase; this.seats = m.room.seats.map((s) => ({ ...s })); this.emit('room'); }
      else if (m.t === 'start') { this.cfg = m.cfg; this.phase = 'playing'; this.playSeats = m.cfg.seats; const me = m.cfg.seats.find((s) => s.srcSeat === this.mySeatLobby); this.mySeats = me ? [me.i] : []; this.emit('start', m.cfg); }
      else if (m.t === 'g') this._deliver(m.m);
      else if (m.t === 'back') { this.phase = 'lobby'; this.cfg = null; this.gameHandler = null; this.pending = []; this.emit('back'); }
      else if (m.t === 'closed') { this.emit('closed', m.reason); }
    };
    c.onDrop = () => { this.status = 'dropped'; this.emit('status', 'dropped'); };
    c.onRejoin = (w) => { this.status = 'ok'; this._applyWelcome(w); if (w.started) { this.playSeats = w.started.seats; const me = w.started.seats.find((s) => s.srcSeat === this.mySeatLobby); this.mySeats = me ? [me.i] : []; } this.emit('status', 'ok'); this.emit('rejoined', w); };
    c.onGiveUp = () => { this.status = 'gone'; this.emit('closed', 'Lost connection to the host.'); };
    // if we joined mid-game (rejoin), synthesize a start
    if (this.cfg) { this.playSeats = this.cfg.seats; const me = this.cfg.seats.find((s) => s.srcSeat === this.mySeatLobby); this.mySeats = me ? [me.i] : []; }
  }

  get rtt() { return this.clientNet?.rtt || 0; }

  close() {
    if (this.hostNet) { this.hostNet.close(); }
    if (this.clientNet) this.clientNet.leave();
    if (this.mode === 'online') store.del('lastRoom');
    this.closedFlag = true;
    if (this._onHide) removeEventListener('pagehide', this._onHide);
  }
}
