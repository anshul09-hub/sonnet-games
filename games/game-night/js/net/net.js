// PeerJS transport. Star topology: the host is the source of truth, guests send inputs.
// Free public PeerJS broker by default; override with ?peerhost=&peerport=&peerpath=&peersecure=0 (used by the tests).
import { store, params, sleep } from '../core/util.js';

export const PEER_PREFIX = 'gnite3d-';
const dlog = (...a) => { if (params.get('debug')) console.log('[net]', ...a); };
const LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ'; // no I, L, O (easy to read out loud)
export const makeCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
export const cleanCode = (s) => (s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);

export function getClientId() {
  let id = store.get('clientId');
  if (!id) { id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); store.set('clientId', id); }
  return id;
}

export function peerOptions() {
  const o = { debug: params.get('debug') ? 3 : 1, config: { iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' },
    // best-effort public relay for strict NATs / mobile carriers
    { urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443?transport=tcp'], username: 'openrelayproject', credential: 'openrelayproject' },
  ] } };
  if (params.get('peerhost')) {
    o.host = params.get('peerhost'); o.port = +(params.get('peerport') || 9000); o.path = params.get('peerpath') || '/'; o.secure = params.get('peersecure') === '1';
    o.config = { iceServers: [] };
  }
  return o;
}

async function loadPeer() {
  if (window.Peer) return window.Peer;
  if (window.__peerReady) await window.__peerReady.catch(() => {});
  if (!window.Peer) throw new Error('Online play needs the PeerJS library, which could not be loaded. Check your connection.');
  return window.Peer;
}

const withTimeout = (p, ms, msg) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error(msg)), ms); p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); }); });

// ------------------------------------------------------------------------------------------------ host
export class HostNet {
  constructor() {
    this.peer = null; this.code = ''; this.conns = new Map(); // clientId -> {conn, seen}
    this.onHello = null; this.onMessage = null; this.onLeave = null; this.closed = false;
    this.timer = null;
  }

  async open() {
    const Peer = await loadPeer();
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = makeCode();
      try {
        await withTimeout(new Promise((resolve, reject) => {
          const peer = new Peer(PEER_PREFIX + code, peerOptions());
          const onErr = (e) => { peer.destroy(); reject(e); };
          peer.once('error', onErr);
          peer.once('open', () => { peer.off('error', onErr); this.peer = peer; resolve(); });
        }), 12000, 'Could not reach the matchmaking broker.');
        this.code = code;
        this._wire();
        return code;
      } catch (e) {
        if (e && e.type === 'unavailable-id') continue; // code already taken, roll another
        if (e && /broker|timed/i.test(e.message || '')) throw new Error('Could not reach the free PeerJS broker. Check your connection and try again.');
        if (attempt === 7) throw e;
      }
    }
    throw new Error('Could not allocate a room code.');
  }

  _wire() {
    const peer = this.peer;
    peer.on('connection', (conn) => {
      let clientId = null;
      if (params.get('debug')) { const oc = conn.close.bind(conn); conn.close = () => { console.log('[net] host conn.close() called from', new Error().stack); oc(); }; }
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') {
          clientId = msg.clientId;
          const prev = this.conns.get(clientId);
          if (prev && prev.conn !== conn) { prev.conn.__replaced = true; try { prev.conn.close(); } catch { /* */ } }
          this.conns.set(clientId, { conn, seen: performance.now() });
          this.onHello?.(clientId, msg, conn);
          return;
        }
        if (!clientId) return;
        const rec = this.conns.get(clientId); if (rec) rec.seen = performance.now();
        dlog('host got', msg.t);
        if (msg.t === 'ping') { this.sendTo(clientId, { t: 'pong', ts: msg.ts }); return; }
        this.onMessage?.(clientId, msg);
      });
      const gone = (why) => {
        dlog('host: conn gone', clientId, why && (why.type || why.message || why));
        if (conn.__replaced || !clientId) return;
        const rec = this.conns.get(clientId);
        if (rec && rec.conn === conn) { this.conns.delete(clientId); this.onLeave?.(clientId, 'closed'); }
      };
      conn.on('close', () => gone('close')); conn.on('error', (e) => gone(e));
    });
    peer.on('disconnected', () => { if (!this.closed) { try { peer.reconnect(); } catch { /* */ } } });
    peer.on('error', (e) => { console.warn('[host peer]', e.type || e); });
    // drop silent guests
    this.timer = setInterval(() => {
      const now = performance.now();
      for (const [id, rec] of this.conns) if (now - rec.seen > 11000) { dlog('host timeout', id, now, rec.seen); this.conns.delete(id); try { rec.conn.close(); } catch { /* */ } this.onLeave?.(id, 'timeout'); }
    }, 2000);
  }

  sendTo(clientId, msg) { const r = this.conns.get(clientId); if (r && r.conn.open) { try { r.conn.send(msg); } catch (e) { console.warn('send failed', e); } } }
  broadcast(msg, exceptId) { for (const [id, r] of this.conns) if (id !== exceptId && r.conn.open) { try { r.conn.send(msg); } catch { /* */ } } }
  kick(clientId) { const r = this.conns.get(clientId); if (r) { this.conns.delete(clientId); try { r.conn.close(); } catch { /* */ } } }
  close() {
    this.closed = true; clearInterval(this.timer);
    this.broadcast({ t: 'closed', reason: 'The host closed the room.' });
    setTimeout(() => { try { this.peer?.destroy(); } catch { /* */ } }, 200);
  }
}

// ------------------------------------------------------------------------------------------------ client
export class ClientNet {
  constructor() {
    this.peer = null; this.conn = null; this.code = ''; this.hello = null;
    this.onMessage = null; this.onDrop = null; this.onRejoin = null; this.onGiveUp = null;
    this.state = 'idle'; this.seen = 0; this.rtt = 0; this.timer = null; this.closedByUs = false;
  }

  /** Connect to a room. Resolves with the host's welcome message. */
  async join(code, hello) {
    this.code = code; this.hello = hello; this.closedByUs = false;
    const welcome = await this._connect(false);
    this._startTimers();
    return welcome;
  }

  async _connect(isRejoin) {
    const Peer = await loadPeer();
    if (this.peer) { try { this.peer.destroy(); } catch { /* */ } this.peer = null; }
    const peer = new Peer(undefined, peerOptions());
    this.peer = peer;
    await withTimeout(new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); }), 12000, 'Could not reach the matchmaking broker.');
    return withTimeout(new Promise((resolve, reject) => {
      const conn = peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' });
      this.conn = conn;
      let done = false;
      const fail = (m) => { if (!done) { done = true; reject(new Error(m)); } };
      peer.on('error', (e) => { if (e.type === 'peer-unavailable') fail('Room ' + this.code + ' was not found. Check the code and try again.'); else if (!done) fail(e.message || String(e)); });
      conn.on('open', () => conn.send({ ...this.hello, t: 'hello', rejoin: isRejoin }));
      conn.on('data', (msg) => {
        if (!msg || typeof msg !== 'object') return;
        this.seen = performance.now();
        if (msg.t === 'welcome' && !done) { done = true; this.state = 'up'; resolve(msg); return; }
        if (msg.t === 'reject' && !done) { done = true; reject(new Error(msg.reason || 'The host refused the connection.')); return; }
        if (msg.t === 'pong') { this.rtt = Math.round(performance.now() - msg.ts); return; }
        this.onMessage?.(msg);
      });
      conn.on('close', () => { if (!done) fail('Connection closed.'); else this._dropped('close'); });
      conn.on('error', (e) => { if (!done) fail('Connection error.'); else this._dropped(e); });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch { /* */ } });
    }), 14000, 'The host did not answer. Is the room still open?');
  }

  _startTimers() {
    clearInterval(this.timer);
    this.seen = performance.now();
    this.timer = setInterval(() => {
      if (this.state === 'up' && this.conn && this.conn.open) { try { this.conn.send({ t: 'ping', ts: performance.now() }); } catch { /* */ } }
      if (this.state === 'up' && performance.now() - this.seen > 11000) this._dropped('timeout');
    }, 3000);
  }

  send(msg) { if (this.state === 'up' && this.conn && this.conn.open) { try { this.conn.send(msg); } catch { /* */ } } }

  _dropped(why) {
    dlog('client: dropped', why, this.state);
    if (this.closedByUs || this.state !== 'up') return;
    this.state = 'dropped'; this.onDrop?.();
    this._retryLoop();
  }
  async _retryLoop() {
    const t0 = performance.now();
    while (!this.closedByUs && performance.now() - t0 < 90000) {
      await sleep(2000);
      if (this.closedByUs) return;
      try {
        const w = await this._connect(true);
        this.state = 'up'; this._startTimers(); this.onRejoin?.(w); return;
      } catch (e) { if (/refused|started/i.test(e.message)) break; }
    }
    if (!this.closedByUs) { this.state = 'gone'; this.onGiveUp?.(); }
  }

  leave() {
    this.closedByUs = true; clearInterval(this.timer);
    try { this.conn?.send({ t: 'leave' }); } catch { /* */ }
    setTimeout(() => { try { this.peer?.destroy(); } catch { /* */ } }, 150);
    this.state = 'idle';
  }
}
