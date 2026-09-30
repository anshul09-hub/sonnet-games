// All audio is synthesized with the Web Audio API: no sound files. SFX toolkit, sound packs, per-theme music loops.
import { store, clamp, rnd } from '../core/util.js';

/** Sound packs: change SFX timbre + the instruments/scale/tempo of the music loop. */
export const SOUND_PACKS = [
  { id: 'koto', theme: 'anime', name: 'Sakura Koto', desc: 'Plucked strings and soft taiko', lead: 'triangle', bass: 'sine', kit: 'taiko', scale: [0, 2, 3, 7, 8], pitch: 1, bpm: 0.92, sfxWave: 'triangle', shimmer: 0.5, color: '#ff9bc0' },
  { id: 'taiko', theme: 'anime', name: 'Taiko Thunder', desc: 'Big drums, hero energy', lead: 'sawtooth', bass: 'triangle', kit: 'taiko', scale: [0, 2, 4, 7, 9], pitch: 0.94, bpm: 1.08, sfxWave: 'sawtooth', shimmer: 0.2, color: '#ff6b4a' },
  { id: 'bells', theme: 'anime', name: 'Temple Bells', desc: 'Glassy bells and wind', lead: 'sine', bass: 'sine', kit: 'soft', scale: [0, 2, 4, 7, 9], pitch: 1.12, bpm: 0.85, sfxWave: 'sine', shimmer: 1, color: '#ffe08a' },
  { id: 'chip', theme: 'gamer', name: '8-Bit Arcade', desc: 'Square-wave chiptune', lead: 'square', bass: 'square', kit: '8bit', scale: [0, 3, 5, 7, 10], pitch: 1, bpm: 1.05, sfxWave: 'square', shimmer: 0, color: '#7dff6b' },
  { id: 'hero16', theme: 'gamer', name: '16-Bit Hero', desc: 'Warm console-era synth', lead: 'sawtooth', bass: 'triangle', kit: 'acoustic', scale: [0, 2, 3, 5, 7, 8, 10], pitch: 1, bpm: 1, sfxWave: 'sawtooth', shimmer: 0.3, color: '#4dd6ff' },
  { id: 'boss', theme: 'gamer', name: 'Boss Rush', desc: 'Fast, aggressive, loud', lead: 'square', bass: 'sawtooth', kit: '808', scale: [0, 1, 4, 5, 7, 8, 11], pitch: 0.9, bpm: 1.18, sfxWave: 'square', shimmer: 0, color: '#ff4d6d' },
  { id: 'neon', theme: 'tech', name: 'Neon Synth', desc: 'Analog arps and big pads', lead: 'sawtooth', bass: 'sawtooth', kit: '808', scale: [0, 2, 3, 5, 7, 9, 10], pitch: 1, bpm: 1, sfxWave: 'sawtooth', shimmer: 0.6, color: '#c77dff' },
  { id: 'glitch', theme: 'tech', name: 'Glitch Core', desc: 'Stuttering digital percussion', lead: 'square', bass: 'square', kit: 'glitch', scale: [0, 1, 3, 6, 7, 10], pitch: 1.06, bpm: 1.1, sfxWave: 'square', shimmer: 0.1, color: '#00f0c8' },
  { id: 'holo', theme: 'tech', name: 'Holo Pulse', desc: 'Ambient sine pulses', lead: 'sine', bass: 'sine', kit: 'soft', scale: [0, 2, 4, 6, 7, 9, 11], pitch: 1.05, bpm: 0.9, sfxWave: 'sine', shimmer: 1, color: '#7ad7ff' },
];
export const packById = (id) => SOUND_PACKS.find((p) => p.id === id) || SOUND_PACKS[0];

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

class AudioEngine {
  constructor() {
    this.ctx = null; this.muted = store.get('muted', false);
    const v = store.get('vol', {});
    this.vol = { master: v.master ?? 0.8, music: v.music ?? 0.55, sfx: v.sfx ?? 0.9 };
    this.pack = SOUND_PACKS[0]; this._last = {}; this.music = { theme: null, timer: null, step: 0, playing: false, energy: 0.6, game: 'hub' };
    this.loops = {};
    this.queue = [];
  }

  /** Must be called from a user gesture (first pointerdown/keydown) to satisfy autoplay policies. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol.master;
      this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.vol.sfx;
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.vol.music * 0.5;
      this.duckNode = c.createGain(); this.duckNode.gain.value = 1;
      this.revIn = c.createGain(); this.revIn.gain.value = 0.35;
      this.rev = c.createConvolver(); this.rev.buffer = this._impulse(1.6, 2.6); this.revIn.connect(this.rev);
      this.revOut = c.createGain(); this.revOut.gain.value = 0.6; this.rev.connect(this.revOut); this.revOut.connect(this.comp);
      this.sfxBus.connect(this.comp); this.sfxBus.connect(this.revIn);
      this.musicBus.connect(this.duckNode); this.duckNode.connect(this.comp); this.musicBus.connect(this.revIn);
      this.comp.connect(this.master); this.master.connect(c.destination);
      this.noise = this._noiseBuf(2);
      if (this.music.pending) { const p = this.music.pending; this.music.pending = null; this.playMusic(p.theme, p.opts); }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) { this.muted = m; store.set('muted', m); if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.vol.master, this.ctx.currentTime, 0.03); }
  setVolume(kind, v) {
    this.vol[kind] = v; store.set('vol', this.vol);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (kind === 'master' && !this.muted) this.master.gain.setTargetAtTime(v, t, 0.03);
    if (kind === 'music') this.musicBus.gain.setTargetAtTime(v * 0.5, t, 0.03);
    if (kind === 'sfx') this.sfxBus.gain.setTargetAtTime(v, t, 0.03);
  }
  setPack(id) { this.pack = packById(id); }
  duck(amount = 0.35, sec = 1.2) {
    if (!this.ctx) return; const g = this.duckNode.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setTargetAtTime(amount, t, 0.05); g.setTargetAtTime(1, t + sec, 0.4);
  }

  // ------------------------------------------------------------ building blocks
  _impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  _noiseBuf(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  /** Oscillator note with ADSR-ish envelope. Returns {osc, gain}. */
  tone({ f = 440, f2 = null, type = 'sine', t = 0, dur = 0.15, vol = 0.3, a = 0.005, d = null, det = 0, bus = null, filter = null, fq = 1, vib = 0, pan = 0 }) {
    const c = this.ctx, t0 = c.currentTime + t;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2 != null) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    if (det) o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (d ?? dur) + a);
    let out = g;
    o.connect(g);
    if (filter) { const fl = c.createBiquadFilter(); fl.type = filter.type || 'lowpass'; fl.frequency.setValueAtTime(filter.f, t0); if (filter.f2) fl.frequency.exponentialRampToValueAtTime(filter.f2, t0 + dur); fl.Q.value = filter.q ?? fq; g.connect(fl); out = fl; }
    if (vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 6; lg.gain.value = vib; l.connect(lg); lg.connect(o.detune); l.start(t0); l.stop(t0 + dur + 0.2); }
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; out.connect(p); out = p; }
    out.connect(bus || this.sfxBus);
    o.start(t0); o.stop(t0 + dur + a + 0.05);
    return { osc: o, gain: g };
  }
  /** Filtered noise burst. */
  noiseHit({ t = 0, dur = 0.2, vol = 0.3, type = 'bandpass', f = 2000, f2 = null, q = 1, a = 0.002, bus = null, pan = 0, rate = 1 }) {
    const c = this.ctx, t0 = c.currentTime + t;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur); fl.Q.value = q;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g);
    let out = g; if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(bus || this.sfxBus);
    s.start(t0, Math.random() * 1.5); s.stop(t0 + dur + 0.05);
    return g;
  }

  // ------------------------------------------------------------ SFX
  /** Play a named sound effect. `o` may hold {v: intensity 0..1, n: index, pan}. */
  sfx(name, o = {}) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const gate = { dice: 0.018, hop: 0.03, shoot: 0.03, click: 0.02, hover: 0.05, tick: 0.05 }[name];
    if (gate) { if (now - (this._last[name] || 0) < gate) return; this._last[name] = now; }
    const fn = SFX[name];
    if (fn) try { fn(this, o); } catch (e) { console.warn('sfx', name, e); }
  }
  /** Note from the pack's scale: index may exceed the scale length (climbs octaves). */
  note(idx, root = 60) {
    const sc = this.pack.scale, n = sc.length;
    const oct = Math.floor(idx / n), deg = ((idx % n) + n) % n;
    return midi(root + sc[deg] + oct * 12) * this.pack.pitch;
  }

  /** Looping ambience/whoosh style sounds: start returns a handle to stop. */
  loopStart(name, o = {}) {
    if (!this.ctx || this.muted) return null;
    const c = this.ctx;
    if (name === 'boost') {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 900; fl.Q.value = 1.2;
      const g = c.createGain(); g.gain.value = 0; g.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.1);
      s.connect(fl); fl.connect(g); g.connect(this.sfxBus); s.start();
      return { stop: () => { g.gain.setTargetAtTime(0, c.currentTime, 0.05); setTimeout(() => { try { s.stop(); } catch { /* */ } }, 300); } };
    }
    return null;
  }

  // ------------------------------------------------------------ MUSIC
  playMusic(theme, opts = {}) {
    if (!this.ctx) { this.music.pending = { theme, opts }; return; }
    const m = this.music;
    m.game = opts.game || 'hub'; m.energy = opts.energy ?? 0.6;
    if (m.playing && m.theme === theme && m.gameKey === m.game) return;
    this.stopMusic(true);
    m.theme = theme; m.gameKey = m.game; m.playing = true; m.step = 0;
    m.nextTime = this.ctx.currentTime + 0.1;
    m.timer = setInterval(() => this._musicTick(), 30);
  }
  stopMusic(quick) { const m = this.music; if (m.timer) clearInterval(m.timer); m.timer = null; m.playing = false; m.pending = null; }
  setEnergy(e) { this.music.energy = e; }

  _musicTick() {
    const m = this.music, c = this.ctx;
    if (!c || !m.playing) return;
    const th = MUSIC[m.theme] || MUSIC.anime;
    const gm = GAME_MOOD[m.game] || GAME_MOOD.hub;
    const bpm = th.bpm * this.pack.bpm * gm.tempo;
    const stepDur = 60 / bpm / 4;
    while (m.nextTime < c.currentTime + 0.14) {
      if (m.nextTime < c.currentTime - 0.2) m.nextTime = c.currentTime + 0.05;
      this._musicStep(th, gm, m.step, m.nextTime - c.currentTime, stepDur);
      m.nextTime += stepDur; m.step = (m.step + 1) % 128;
    }
  }

  _musicStep(th, gm, step, t, sd) {
    const p = this.pack, e = clamp(this.music.energy * gm.energy, 0, 1);
    const bar = Math.floor(step / 16) % 8, s16 = step % 16;
    const prog = th.prog[bar % th.prog.length]; // chord root scale-degree offset
    const root = th.root;
    const sc = p.scale;
    const degNote = (d, oct = 0) => root + sc[((d % sc.length) + sc.length) % sc.length] + 12 * (Math.floor(d / sc.length) + oct);
    // bass
    if (th.bass[s16 % th.bass.length] && (s16 % 2 === 0 || e > 0.7)) {
      const n = degNote(prog, -2);
      this.tone({ f: midi(n) * p.pitch, type: p.bass, t, dur: sd * 1.8, vol: 0.2, a: 0.004, filter: { type: 'lowpass', f: 700 + e * 900, q: 1.5 }, bus: this.musicBus });
    }
    // chord pad / stab on bar starts
    if (s16 === 0 || (th.stab && s16 === 8)) {
      for (const k of [0, 2, 4]) this.tone({ f: midi(degNote(prog + k, 0)) * p.pitch, type: p.lead === 'square' ? 'triangle' : 'sine', t, dur: sd * (th.stab ? 6 : 15), vol: 0.06 + 0.02 * p.shimmer, a: th.stab ? 0.005 : 0.25, d: sd * (th.stab ? 6 : 14), bus: this.musicBus });
    }
    // arpeggio / lead
    const lead = th.lead[(step + bar * 3) % th.lead.length];
    if (lead != null && e > 0.15) {
      const f = midi(degNote(prog + lead, 1)) * p.pitch;
      if (p.lead === 'sine' && p.shimmer > 0.7) this.tone({ f: f * 2, type: 'sine', t, dur: sd * 3, vol: 0.05, a: 0.003, bus: this.musicBus });
      this.tone({ f, type: p.lead, t, dur: sd * th.gate, vol: 0.09 * (0.6 + e * 0.6), a: 0.004, filter: p.lead === 'sawtooth' ? { type: 'lowpass', f: 1800 + e * 1500, q: 2 } : null, det: (bar % 2) * 4, bus: this.musicBus });
    }
    // drums
    this._drums(th, gm, p.kit, s16, bar, t, sd, e);
  }

  _drums(th, gm, kit, s16, bar, t, sd, e) {
    const pat = th.drums;
    const k = pat.kick[s16], sn = pat.snare[s16], h = pat.hat[s16];
    const v = 0.5 + e * 0.5;
    if (k) {
      if (kit === 'taiko') { this.tone({ f: 130, f2: 48, type: 'sine', t, dur: 0.28, vol: 0.55 * v, bus: this.musicBus }); this.noiseHit({ t, dur: 0.07, vol: 0.12 * v, type: 'lowpass', f: 900, bus: this.musicBus }); }
      else if (kit === '8bit') this.tone({ f: 150, f2: 40, type: 'square', t, dur: 0.14, vol: 0.28 * v, bus: this.musicBus });
      else if (kit === 'glitch') this.tone({ f: 110, f2: 35, type: 'triangle', t, dur: 0.1, vol: 0.5 * v, bus: this.musicBus });
      else if (kit === 'soft') this.tone({ f: 90, f2: 45, type: 'sine', t, dur: 0.25, vol: 0.32 * v, bus: this.musicBus });
      else this.tone({ f: 140, f2: 42, type: 'sine', t, dur: 0.22, vol: 0.6 * v, bus: this.musicBus });
    }
    if (sn && e > 0.3) {
      if (kit === 'taiko') this.tone({ f: 200, f2: 120, type: 'triangle', t, dur: 0.12, vol: 0.28 * v, bus: this.musicBus });
      else if (kit === '8bit') this.noiseHit({ t, dur: 0.1, vol: 0.14 * v, type: 'highpass', f: 2500, bus: this.musicBus, rate: 3 });
      else { this.noiseHit({ t, dur: 0.16, vol: 0.2 * v, type: 'bandpass', f: 1800, q: 0.8, bus: this.musicBus }); this.tone({ f: 190, f2: 110, type: 'triangle', t, dur: 0.1, vol: 0.2 * v, bus: this.musicBus }); }
    }
    if (h && e > 0.45 && kit !== 'soft') {
      if (kit === 'taiko') this.tone({ f: 900 + Math.random() * 200, type: 'sine', t, dur: 0.03, vol: 0.05, bus: this.musicBus });
      else this.noiseHit({ t, dur: kit === 'glitch' ? 0.02 + Math.random() * 0.03 : 0.04, vol: 0.07 * v, type: 'highpass', f: 7000, bus: this.musicBus });
    }
  }

  // ------------------------------------------------------------ jingles
  jingle(name) {
    if (!this.ctx || this.muted) return;
    const p = this.pack, seqs = {
      win: [0, 2, 4, 7, 4, 7, 9, 12], lose: [7, 5, 3, 0], six: [0, 2, 4, 7], start: [0, 4, 7, 12], round: [0, 3, 5, 7, 10, 12], pickup: [0, 4, 7], home: [0, 2, 4, 7, 9],
    };
    const s = seqs[name] || seqs.six;
    s.forEach((d, i) => this.tone({ f: this.note(d, 64), type: p.sfxWave, t: i * 0.09, dur: 0.22, vol: 0.22, a: 0.004, d: 0.28, filter: p.sfxWave === 'sawtooth' ? { type: 'lowpass', f: 3000 } : null }));
  }
}

// ------------------------------------------------------------ music definitions
const R = (n, on) => Array.from({ length: n }, (_, i) => (on.includes(i) ? 1 : 0));
const MUSIC = {
  anime: { bpm: 100, root: 62, prog: [0, 3, 4, 2], bass: [1, 0, 0, 1, 0, 0, 1, 0], stab: false, gate: 2.2,
    lead: [0, null, 2, null, 4, null, 2, null, 1, null, 3, null, 4, 3, null, 2],
    drums: { kick: R(16, [0, 8, 11]), snare: R(16, [4, 12]), hat: R(16, [2, 6, 10, 14]) } },
  gamer: { bpm: 128, root: 57, prog: [0, 5, 3, 4], bass: [1, 1, 0, 1, 1, 0, 1, 0], stab: true, gate: 1.1,
    lead: [0, 2, 4, 2, 0, 2, 4, 7, 0, 2, 4, 2, 5, 4, 2, 4],
    drums: { kick: R(16, [0, 4, 8, 12]), snare: R(16, [4, 12]), hat: R(16, [2, 6, 10, 14, 15]) } },
  tech: { bpm: 116, root: 55, prog: [0, 5, 2, 6], bass: [1, 0, 1, 1, 0, 1, 1, 0], stab: true, gate: 1.6,
    lead: [0, null, 4, null, 2, null, 5, null, 0, 2, null, 4, null, 7, 5, null],
    drums: { kick: R(16, [0, 4, 8, 12]), snare: R(16, [4, 12]), hat: R(16, [1, 3, 5, 7, 9, 11, 13, 15]) } },
};
const GAME_MOOD = {
  hub: { tempo: 0.9, energy: 0.6 }, ludo: { tempo: 1, energy: 0.65 }, snake: { tempo: 1.18, energy: 1 }, brawl: { tempo: 1.25, energy: 1 }, win: { tempo: 0.9, energy: 0.8 },
};

// ------------------------------------------------------------ SFX recipes
const SFX = {
  click(a) { const p = a.pack; a.tone({ f: 620 * p.pitch, f2: 900 * p.pitch, type: p.sfxWave === 'sawtooth' ? 'triangle' : p.sfxWave, dur: 0.06, vol: 0.2 }); },
  hover(a) { a.tone({ f: 1300 * a.pack.pitch, type: 'sine', dur: 0.03, vol: 0.05 }); },
  back(a) { a.tone({ f: 520, f2: 330, type: 'triangle', dur: 0.09, vol: 0.2 }); },
  ok(a) { a.tone({ f: a.note(0, 72), type: a.pack.sfxWave, dur: 0.08, vol: 0.2 }); a.tone({ f: a.note(2, 72), type: a.pack.sfxWave, t: 0.07, dur: 0.14, vol: 0.2 }); },
  error(a) { a.tone({ f: 200, f2: 120, type: 'square', dur: 0.16, vol: 0.18 }); },
  tick(a) { a.tone({ f: 1500, type: 'square', dur: 0.02, vol: 0.06 }); },
  warn(a) { a.tone({ f: 880, type: 'square', dur: 0.09, vol: 0.14 }); a.tone({ f: 880, type: 'square', t: 0.14, dur: 0.09, vol: 0.14 }); },
  turn(a) { a.tone({ f: a.note(4, 72), type: a.pack.sfxWave, dur: 0.1, vol: 0.16 }); a.tone({ f: a.note(7, 72), type: a.pack.sfxWave, t: 0.09, dur: 0.16, vol: 0.16 }); },
  // ---- dice
  diceThrow(a) { a.noiseHit({ dur: 0.35, vol: 0.18, type: 'bandpass', f: 700, f2: 2400, q: 0.7 }); },
  dice(a, o) { const v = clamp(o.v ?? 0.6, 0.05, 1); a.noiseHit({ dur: 0.035 + 0.03 * v, vol: 0.06 + 0.3 * v, type: 'bandpass', f: 1800 + Math.random() * 2400, q: 2.2 }); a.tone({ f: 150 + Math.random() * 90, f2: 90, type: 'triangle', dur: 0.05, vol: 0.05 + 0.22 * v }); },
  diceLand(a) { a.tone({ f: a.note(0, 60), type: a.pack.sfxWave, dur: 0.12, vol: 0.14 }); },
  six(a) { a.jingle('six'); },
  // ---- tokens
  hop(a, o) { const n = o.n || 0, p = a.pack; a.tone({ f: a.note(n, 60) , f2: a.note(n, 60) * 1.35, type: p.sfxWave, dur: 0.11, vol: 0.2, filter: { type: 'lowpass', f: 3500 } }); },
  land(a) { a.tone({ f: 160, f2: 70, type: 'sine', dur: 0.09, vol: 0.25 }); a.noiseHit({ dur: 0.05, vol: 0.06, type: 'lowpass', f: 900 }); },
  spawn(a) { for (let i = 0; i < 5; i++) a.tone({ f: a.note(i * 2, 64), type: 'sine', t: i * 0.04, dur: 0.12, vol: 0.14 }); },
  home(a) { a.jingle('home'); a.sfx('cheer', { v: 0.6 }); },
  // ---- capture
  draw(a) { a.noiseHit({ dur: 0.28, vol: 0.13, type: 'highpass', f: 3000, f2: 9000, q: 0.5 }); a.tone({ f: 3400, type: 'sine', dur: 0.35, vol: 0.06, d: 0.5 }); a.tone({ f: 5100, type: 'sine', dur: 0.3, vol: 0.04, d: 0.45 }); },
  slash(a) { a.noiseHit({ dur: 0.22, vol: 0.35, type: 'highpass', f: 2500, f2: 9000, q: 0.6, a: 0.003 }); a.tone({ f: 1400, f2: 900, type: 'sawtooth', dur: 0.25, vol: 0.08, filter: { type: 'bandpass', f: 1600, q: 3 } }); a.tone({ f: 2100, type: 'sine', dur: 0.5, vol: 0.09, d: 0.6 }); a.tone({ f: 3150, type: 'sine', dur: 0.4, vol: 0.05, d: 0.5 }); },
  smash(a) { a.tone({ f: 170, f2: 34, type: 'sine', dur: 0.42, vol: 0.7 }); a.noiseHit({ dur: 0.45, vol: 0.4, type: 'lowpass', f: 1400, f2: 180, q: 0.7 }); a.noiseHit({ dur: 0.06, vol: 0.3, type: 'highpass', f: 3000 }); a.duck(0.4, 1); },
  kick(a) { a.tone({ f: 220, f2: 60, type: 'triangle', dur: 0.1, vol: 0.35 }); a.noiseHit({ dur: 0.08, vol: 0.25, type: 'bandpass', f: 1500 }); },
  crack(a) { a.noiseHit({ dur: 0.09, vol: 0.4, type: 'bandpass', f: 1400, q: 1.5 }); a.tone({ f: 300, f2: 120, type: 'square', dur: 0.05, vol: 0.12 }); },
  laser(a) { a.tone({ f: 2400, f2: 300, type: 'sawtooth', dur: 0.5, vol: 0.14, filter: { type: 'lowpass', f: 5000 } }); a.tone({ f: 1200, f2: 150, type: 'square', dur: 0.5, vol: 0.06 }); a.noiseHit({ dur: 0.5, vol: 0.08, type: 'highpass', f: 5000 }); },
  voxel(a) { for (let i = 0; i < 6; i++) a.tone({ f: 500 + Math.random() * 1400, type: 'square', t: i * 0.03, dur: 0.06, vol: 0.06 }); },
  whoosh(a) { a.noiseHit({ dur: 0.5, vol: 0.2, type: 'bandpass', f: 400, f2: 2500, q: 0.6, a: 0.12 }); },
  boom(a) { a.tone({ f: 120, f2: 26, type: 'sine', dur: 0.9, vol: 0.85 }); a.noiseHit({ dur: 1, vol: 0.55, type: 'lowpass', f: 2200, f2: 90, q: 0.6 }); a.noiseHit({ dur: 0.15, vol: 0.3, type: 'highpass', f: 2500 }); a.duck(0.35, 1.2); },
  cheer(a, o) {
    const v = o.v ?? 1, len = 1.2 + v * 0.8;
    a.noiseHit({ dur: len, vol: 0.16 * v, type: 'bandpass', f: 1100, q: 0.6, a: 0.15 });
    a.noiseHit({ dur: len, vol: 0.1 * v, type: 'bandpass', f: 2600, q: 0.8, a: 0.2 });
    for (let i = 0; i < 5; i++) { const f = 260 + Math.random() * 220; a.tone({ f, f2: f * 1.25, type: 'sawtooth', t: Math.random() * 0.3, dur: 0.5 + Math.random() * 0.5, vol: 0.025 * v, a: 0.1, filter: { type: 'bandpass', f: 900 + Math.random() * 500, q: 3 }, vib: 30 }); }
  },
  oh(a) { a.noiseHit({ dur: 0.9, vol: 0.12, type: 'bandpass', f: 900, f2: 500, q: 1.2, a: 0.1 }); for (let i = 0; i < 4; i++) a.tone({ f: 420 + i * 20, f2: 250, type: 'sawtooth', dur: 0.8, vol: 0.03, a: 0.08, filter: { type: 'bandpass', f: 700, q: 3 } }); },
  win(a) { a.jingle('win'); a.sfx('cheer', { v: 1 }); },
  lose(a) { a.jingle('lose'); },
  start(a) { a.jingle('start'); },
  // ---- snake
  eat(a, o) { a.tone({ f: 500 + (o.n || 0) * 40, f2: 1100, type: 'sine', dur: 0.09, vol: 0.2 }); },
  boostOn(a) { a.noiseHit({ dur: 0.25, vol: 0.14, type: 'bandpass', f: 500, f2: 3000, q: 1 }); },
  burst(a) { a.noiseHit({ dur: 0.5, vol: 0.4, type: 'lowpass', f: 3000, f2: 200 }); a.tone({ f: 400, f2: 60, type: 'sawtooth', dur: 0.4, vol: 0.2 }); for (let i = 0; i < 6; i++) a.tone({ f: 800 + Math.random() * 1200, f2: 200, type: 'square', t: i * 0.04, dur: 0.1, vol: 0.05 }); },
  roundWin(a) { a.jingle('round'); },
  // ---- blaster
  shoot(a) { a.tone({ f: 1100, f2: 180, type: 'square', dur: 0.09, vol: 0.13 }); a.noiseHit({ dur: 0.05, vol: 0.1, type: 'highpass', f: 3000 }); },
  shotgun(a) { a.noiseHit({ dur: 0.28, vol: 0.5, type: 'lowpass', f: 2600, f2: 300 }); a.tone({ f: 140, f2: 40, type: 'sine', dur: 0.25, vol: 0.5 }); },
  rocket(a) { a.noiseHit({ dur: 0.5, vol: 0.28, type: 'bandpass', f: 500, f2: 1600, q: 0.7 }); a.tone({ f: 90, f2: 60, type: 'sawtooth', dur: 0.4, vol: 0.14 }); },
  hit(a) { a.tone({ f: 260, f2: 80, type: 'square', dur: 0.08, vol: 0.18 }); a.noiseHit({ dur: 0.06, vol: 0.18, type: 'bandpass', f: 1200 }); },
  pickup(a) { a.jingle('pickup'); },
  shield(a) { a.tone({ f: 300, f2: 900, type: 'sine', dur: 0.4, vol: 0.2 }); a.tone({ f: 600, f2: 1800, type: 'triangle', dur: 0.4, vol: 0.1 }); },
  clang(a) { a.tone({ f: 220, type: 'square', dur: 0.4, vol: 0.12, d: 0.5, filter: { type: 'bandpass', f: 500, q: 4 } }); a.tone({ f: 333, type: 'sine', dur: 0.4, vol: 0.1, d: 0.5 }); },
  spawnBrawl(a) { a.tone({ f: 200, f2: 800, type: 'sine', dur: 0.25, vol: 0.18 }); },
};

export const audio = new AudioEngine();
export const MUSIC_THEMES = Object.keys(MUSIC);
