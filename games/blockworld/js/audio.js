// Everything you hear is synthesised with the Web Audio API: no audio files.
import { DEFS } from './blocks.js';

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class GameAudio {
  constructor() {
    this.ctx = null; this.muted = false; this.master = 0.8; this.musicVol = 0.5;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.fuseCount = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.out = ctx.createGain(); this.out.gain.value = this.muted ? 0 : this.master;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
    this.out.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.out);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol * 0.5; this.musicBus.connect(this.out);
    // noise buffers
    const sr = ctx.sampleRate;
    this.white = ctx.createBuffer(1, sr * 2, sr);
    const d = this.white.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.brown = ctx.createBuffer(1, sr * 2, sr);
    const b = this.brown.getChannelData(0); let last = 0;
    for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
    // reverb impulse
    const len = sr * 3.2, imp = ctx.createBuffer(2, len, sr);
    for (let c = 0; c < 2; c++) { const ch = imp.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = imp;
    this.reverbGain = ctx.createGain(); this.reverbGain.gain.value = 0.55;
    this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.musicBus);
    this.startWind();
    this.startMusic();
  }

  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume(); }
  setListener(x, y, z, yaw) { const l = this.listener; l.x = x; l.y = y; l.z = z; l.yaw = yaw; }
  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.out.gain.setTargetAtTime(m ? 0 : this.master, this.ctx.currentTime, 0.05);
  }
  setVolumes(master, music) {
    this.master = master; this.musicVol = music;
    if (!this.ctx) return;
    if (!this.muted) this.out.gain.setTargetAtTime(master, this.ctx.currentTime, 0.05);
    this.musicBus.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.1);
  }

  // distance attenuation + stereo pan relative to the listener
  spatial(x, y, z, refDist = 10) {
    if (x === undefined) return { g: 1, p: 0 };
    const l = this.listener, dx = x - l.x, dz = z - l.z, dy = y - l.y;
    const dist = Math.hypot(dx, dy, dz);
    const rx = Math.cos(l.yaw), rz = -Math.sin(l.yaw);
    const p = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * rx + dz * rz) / dist)) * 0.85 : 0;
    return { g: 1 / (1 + dist / refDist), p, dist };
  }

  _out(pan, gain) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(this.sfx); }
    else g.connect(this.sfx);
    return g;
  }

  noise(o) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = o.brown ? this.brown : this.white;
    src.playbackRate.value = o.rate || 1;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 0.8;
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.fEnd) f.frequency.exponentialRampToValueAtTime(o.fEnd, t + o.dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(o.gain || 0.2, t + (o.a || 0.003));
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(env); env.connect(this._out(o.pan || 0, o.vol === undefined ? 1 : o.vol));
    src.start(t, Math.random() * 1.5, o.dur + 0.05);
  }
  tone(o) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.fEnd) osc.frequency.exponentialRampToValueAtTime(o.fEnd, t + o.dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(o.gain || 0.2, t + (o.a || 0.004));
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(env); env.connect(this._out(o.pan || 0, o.vol === undefined ? 1 : o.vol));
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  // ---- block sounds by material family ----
  material(snd, kind, s = { g: 1, p: 0 }) {
    const v = s.g, pan = s.p, big = kind === 'break' ? 1.6 : kind === 'place' ? 1.2 : 1;
    const j = 0.85 + Math.random() * 0.3;
    const base = { pan, vol: v };
    switch (snd) {
      case 'grass': this.noise({ ...base, type: 'bandpass', f: 1300 * j, q: 0.7, dur: 0.09 * big, gain: 0.16 * big }); if (kind !== 'step') this.tone({ ...base, f: 160, fEnd: 90, dur: 0.1, gain: 0.12 }); break;
      case 'stone': this.noise({ ...base, type: 'highpass', f: 2400 * j, dur: 0.05 * big, gain: 0.14 * big }); this.tone({ ...base, f: 700 * j, fEnd: 420, dur: 0.06 * big, type: 'triangle', gain: 0.09 * big }); break;
      case 'sand': this.noise({ ...base, type: 'bandpass', f: 3200 * j, q: 0.5, dur: 0.13 * big, gain: 0.13 * big }); break;
      case 'gravel': for (let i = 0; i < 3; i++) this.noise({ ...base, delay: i * 0.03, type: 'bandpass', f: (1800 + i * 300) * j, q: 0.9, dur: 0.05, gain: 0.12 * big }); break;
      case 'wood': this.tone({ ...base, f: 230 * j, fEnd: 130, dur: 0.09 * big, type: 'triangle', gain: 0.22 }); this.noise({ ...base, type: 'lowpass', f: 700, dur: 0.06, gain: 0.1 }); break;
      case 'snow': this.noise({ ...base, type: 'highpass', f: 1900 * j, dur: 0.11 * big, gain: 0.12 * big }); this.noise({ ...base, delay: 0.05, type: 'bandpass', f: 4200, dur: 0.06, gain: 0.07 }); break;
      case 'glass': this.tone({ ...base, f: 2400 * j, fEnd: 2000, dur: 0.16 * big, gain: 0.1 }); this.tone({ ...base, f: 3300 * j, dur: 0.12, gain: 0.06 }); if (kind === 'break') for (let i = 0; i < 4; i++) this.tone({ ...base, delay: i * 0.03, f: (2000 + Math.random() * 2500), dur: 0.08, gain: 0.07 }); break;
      case 'water': this.noise({ ...base, type: 'lowpass', f: 900, fEnd: 400, dur: 0.28, gain: 0.16, a: 0.03 }); break;
      default: this.noise({ ...base, dur: 0.06, gain: 0.1 });
    }
  }
  step(id, sprint) { const d = DEFS[id]; this.material(d ? d.snd : 'grass', 'step', { g: sprint ? 0.9 : 0.7, p: 0 }); }
  breakBlock(id, x, y, z) { const d = DEFS[id]; this.material(d ? d.snd : 'stone', 'break', this.spatial(x, y, z, 14)); }
  placeBlock(id, x, y, z) { const d = DEFS[id]; this.material(d ? d.snd : 'stone', 'place', this.spatial(x, y, z, 14)); this.tone({ f: 150, fEnd: 80, dur: 0.07, gain: 0.1, type: 'sine' }); }
  splash(power = 6) { this.noise({ type: 'lowpass', f: 1400, fEnd: 300, dur: 0.5, gain: Math.min(0.3, 0.05 * power), a: 0.02 }); }
  swim() { this.noise({ type: 'lowpass', f: 700, dur: 0.22, gain: 0.08, a: 0.04 }); }
  jump() {}
  land(v) { this.noise({ type: 'lowpass', f: 500, dur: 0.12, gain: Math.min(0.3, v * 0.015) }); }
  thud(x, y, z) { const s = this.spatial(x, y, z, 12); this.tone({ f: 120, fEnd: 60, dur: 0.12, gain: 0.12, pan: s.p, vol: s.g }); }
  pop() { this.tone({ f: 900, fEnd: 400, dur: 0.05, gain: 0.05 }); }

  whoosh(power = 1) {
    this.noise({ type: 'bandpass', f: 400, fEnd: 2600, q: 0.7, dur: 0.7, gain: 0.22 * power, a: 0.08 });
    this.noise({ type: 'highpass', f: 1800, dur: 0.45, gain: 0.08 * power, a: 0.05, delay: 0.05 });
  }

  // ---- TNT ----
  fuseStart() {
    if (!this.ctx) return;
    this.fuseCount++;
    if (this.fuse) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.white; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3200;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6500; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 23; const lg = ctx.createGain(); lg.gain.value = 0.02;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(hp); hp.connect(bp); bp.connect(g); g.connect(this.sfx);
    src.start(); lfo.start();
    this.fuse = { src, g, lfo };
  }
  fuseLevel(v) { if (this.fuse) this.fuse.g.gain.setTargetAtTime(Math.min(0.13, v * 0.13), this.ctx.currentTime, 0.05); }
  fuseStop() {
    if (!this.ctx) return;
    this.fuseCount = Math.max(0, this.fuseCount - 1);
    if (this.fuseCount === 0 && this.fuse) {
      const f = this.fuse; this.fuse = null;
      f.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => { try { f.src.stop(); f.lfo.stop(); } catch (e) { /* already stopped */ } }, 300);
    }
  }
  boom(x, y, z, power = 1) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 26);
    const v = Math.min(1, s.g * 1.6) * power, pan = s.p;
    this.noise({ brown: true, type: 'lowpass', f: 1600, fEnd: 70, q: 0.6, dur: 1.9, gain: 1.1 * v, a: 0.006, pan, vol: 1, rate: 0.7 });
    this.tone({ f: 78, fEnd: 24, dur: 1.4, gain: 0.95 * v, a: 0.01, pan });
    this.noise({ type: 'bandpass', f: 2500, fEnd: 500, q: 0.5, dur: 0.55, gain: 0.5 * v, a: 0.004, pan, delay: 0.02 });
    for (let i = 0; i < 6; i++) this.noise({ type: 'bandpass', f: 900 + Math.random() * 2500, q: 1.4, dur: 0.07, gain: 0.16 * v, delay: 0.35 + Math.random() * 1.0, pan });
    this.tone({ f: 42, fEnd: 30, dur: 2.4, gain: 0.3 * v, a: 0.2, pan, delay: 0.1 });
  }
  bleat(x, y, z) {
    if (!this.ctx) return;
    const s = this.spatial(x, y, z, 9); if (s.g < 0.15) return;
    const ctx = this.ctx, t = ctx.currentTime, base = 260 + Math.random() * 60;
    const osc = ctx.createOscillator(); osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base, t); osc.frequency.linearRampToValueAtTime(base * 1.12, t + 0.12); osc.frequency.linearRampToValueAtTime(base * 0.9, t + 0.55);
    const vib = ctx.createOscillator(); vib.frequency.value = 26; const vg = ctx.createGain(); vg.gain.value = 22; vib.connect(vg); vg.connect(osc.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1500, t + 0.15); f.frequency.linearRampToValueAtTime(800, t + 0.55);
    const env = ctx.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.4, t + 0.05); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(f); f.connect(env); env.connect(this._out(s.p, s.g * 0.5));
    osc.start(t); vib.start(t); osc.stop(t + 0.65); vib.stop(t + 0.65);
  }

  // ---- ambience ----
  startWind() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource(); src.buffer = this.brown; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.0;
    const l1 = ctx.createOscillator(); l1.frequency.value = 0.07; const l1g = ctx.createGain(); l1g.gain.value = 220; l1.connect(l1g); l1g.connect(bp.frequency);
    const l2 = ctx.createOscillator(); l2.frequency.value = 0.11; const l2g = ctx.createGain(); l2g.gain.value = 0.012; l2.connect(l2g); l2g.connect(g.gain);
    src.connect(bp); bp.connect(g); g.connect(this.out);
    src.start(); l1.start(); l2.start();
    this.windGain = g;
  }
  setWind(level) { if (this.windGain) this.windGain.gain.setTargetAtTime(0.03 + level * 0.06, this.ctx.currentTime, 0.6); }

  startMusic() {
    const ctx = this.ctx;
    this.chords = [[48, 55, 59, 64, 71], [45, 52, 55, 59, 64], [41, 48, 52, 57, 64], [43, 50, 55, 59, 66]];
    this.penta = [72, 74, 76, 79, 81, 84, 88];
    this.nextChord = ctx.currentTime + 0.5; this.chordIdx = 0; this.nextNote = ctx.currentTime + 3;
    this.musicTimer = setInterval(() => this.musicTick(), 400);
  }
  musicTick() {
    const ctx = this.ctx; if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime, ahead = now + 1.5, len = 8.5;
    while (this.nextChord < ahead) {
      const t = this.nextChord, ch = this.chords[this.chordIdx % 4]; this.chordIdx++;
      for (const m of ch) this.pad(mtof(m), t, len + 1.5);
      this.nextChord += len;
    }
    while (this.nextNote < ahead) {
      const t = this.nextNote;
      if (Math.random() < 0.62) this.pluck(mtof(this.penta[(Math.random() * this.penta.length) | 0] - (Math.random() < 0.15 ? 12 : 0)), t);
      this.nextNote += 1.05 + Math.random() * 1.1;
    }
  }
  pad(f, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.6); g.gain.setValueAtTime(0.05, t + dur - 3.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100; lp.Q.value = 0.3;
    for (const [type, det] of [['sine', -3], ['triangle', 4]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = det;
      const og = ctx.createGain(); og.gain.value = type === 'sine' ? 1 : 0.45;
      o.connect(og); og.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    }
    lp.connect(g); g.connect(this.musicBus); g.connect(this.reverb);
  }
  pluck(f, t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; const o2g = ctx.createGain(); o2g.gain.value = 0.25;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
    o.connect(g); o2.connect(o2g); o2g.connect(g);
    g.connect(this.musicBus); g.connect(this.reverb);
    o.start(t); o2.start(t); o.stop(t + 3); o2.stop(t + 3);
  }
}
