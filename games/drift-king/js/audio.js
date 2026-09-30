// Everything you hear is synthesised here with the Web Audio API. No audio files.
import { clamp, lerp, damp } from './util.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

function noiseBuffer(ctx, seconds = 2) {
  const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function distCurve(amount) {
  const n = 512, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  return c;
}

class EngineVoice {
  constructor(ctx, out, { pan = false, base = 1 } = {}) {
    this.ctx = ctx;
    this.gain = ctx.createGain(); this.gain.gain.value = 0;
    this.filter = ctx.createBiquadFilter(); this.filter.type = 'lowpass'; this.filter.Q.value = 2.2; this.filter.frequency.value = 800;
    this.shaper = ctx.createWaveShaper(); this.shaper.curve = distCurve(pan ? 2 : 4);
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square';
    this.o3 = ctx.createOscillator(); this.o3.type = 'sawtooth';
    this.g1 = ctx.createGain(); this.g2 = ctx.createGain(); this.g3 = ctx.createGain();
    this.g1.gain.value = 0.5; this.g2.gain.value = 0.3; this.g3.gain.value = 0.16;
    this.o1.connect(this.g1); this.o2.connect(this.g2); this.o3.connect(this.g3);
    this.g1.connect(this.shaper); this.g2.connect(this.shaper); this.g3.connect(this.shaper);
    this.shaper.connect(this.filter); this.filter.connect(this.gain);
    // turbo whine + intake noise (player only)
    this.turbo = null;
    if (!pan) {
      this.turbo = ctx.createOscillator(); this.turbo.type = 'sine';
      this.tg = ctx.createGain(); this.tg.gain.value = 0;
      this.turbo.connect(this.tg); this.tg.connect(this.gain);
      this.turbo.start();
      this.nz = ctx.createBufferSource(); this.nz.buffer = noiseBuffer(ctx, 2); this.nz.loop = true;
      this.nf = ctx.createBiquadFilter(); this.nf.type = 'bandpass'; this.nf.frequency.value = 500; this.nf.Q.value = 0.8;
      this.ng = ctx.createGain(); this.ng.gain.value = 0;
      this.nz.connect(this.nf); this.nf.connect(this.ng); this.ng.connect(this.gain);
      this.nz.start();
    }
    if (pan) {
      this.panner = ctx.createStereoPanner();
      this.gain.connect(this.panner); this.panner.connect(out);
    } else this.gain.connect(out);
    this.o1.start(); this.o2.start(); this.o3.start();
    this.base = base;
  }
  set(rpm, throttle, volume, pan = 0) {
    const t = this.ctx.currentTime;
    const f = rpm / 60 * 2; // 4-cyl firing frequency
    this.o1.frequency.setTargetAtTime(f, t, 0.03);
    this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.o3.frequency.setTargetAtTime(f * 2.01, t, 0.03);
    this.filter.frequency.setTargetAtTime(380 + rpm * 0.32 + throttle * 1400, t, 0.05);
    this.gain.gain.setTargetAtTime(volume * (0.13 + throttle * 0.11), t, 0.04);
    if (this.turbo) {
      this.turbo.frequency.setTargetAtTime(1600 + rpm * 0.55, t, 0.05);
      this.tg.gain.setTargetAtTime(throttle * clamp((rpm - 3000) / 4000, 0, 1) * 0.035, t, 0.08);
      this.nf.frequency.setTargetAtTime(300 + rpm * 0.2, t, 0.06);
      this.ng.gain.setTargetAtTime(throttle * 0.05 + 0.01, t, 0.06);
    }
    if (this.panner) this.panner.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.05);
  }
  stop() { try { this.gain.gain.value = 0; this.o1.stop(); this.o2.stop(); this.o3.stop(); this.turbo && this.turbo.stop(); this.nz && this.nz.stop(); } catch (e) { /* ignore */ } }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.8;
    this.ready = false;
    this.musicMode = 'off'; // off | menu | race
    this.hitCooldown = 0;
    this.scrapeAmt = 0;
  }

  init() {
    if (this.ctx) { this.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 4; this.comp.attack.value = 0.005; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 1; this.sfx.connect(this.master);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = 0.5; this.musicBus.connect(this.master);
    this.noise = noiseBuffer(ctx, 2.5);

    this.engine = new EngineVoice(ctx, this.sfx);
    this.rivals = [];
    for (let i = 0; i < 3; i++) this.rivals.push(new EngineVoice(ctx, this.sfx, { pan: true }));

    // tyre squeal: filtered noise + a thin whistle
    this.sqNoise = ctx.createBufferSource(); this.sqNoise.buffer = this.noise; this.sqNoise.loop = true;
    this.sqF = ctx.createBiquadFilter(); this.sqF.type = 'bandpass'; this.sqF.frequency.value = 1500; this.sqF.Q.value = 7;
    this.sqG = ctx.createGain(); this.sqG.gain.value = 0;
    this.sqNoise.connect(this.sqF); this.sqF.connect(this.sqG); this.sqG.connect(this.sfx);
    this.sqOsc = ctx.createOscillator(); this.sqOsc.type = 'triangle'; this.sqOsc.frequency.value = 1900;
    this.sqLfo = ctx.createOscillator(); this.sqLfo.frequency.value = 11; this.sqLfoG = ctx.createGain(); this.sqLfoG.gain.value = 60;
    this.sqLfo.connect(this.sqLfoG); this.sqLfoG.connect(this.sqOsc.frequency);
    this.sqOscG = ctx.createGain(); this.sqOscG.gain.value = 0;
    this.sqOsc.connect(this.sqOscG); this.sqOscG.connect(this.sfx);
    this.sqNoise.start(); this.sqOsc.start(); this.sqLfo.start();

    // wind
    this.wind = ctx.createBufferSource(); this.wind.buffer = this.noise; this.wind.loop = true;
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'highpass'; this.windF.frequency.value = 500;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    this.wind.connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.sfx);
    this.wind.start();

    // boost loop (hiss)
    this.bNoise = ctx.createBufferSource(); this.bNoise.buffer = this.noise; this.bNoise.loop = true;
    this.bF = ctx.createBiquadFilter(); this.bF.type = 'bandpass'; this.bF.frequency.value = 1200; this.bF.Q.value = 0.9;
    this.bG = ctx.createGain(); this.bG.gain.value = 0;
    this.bNoise.connect(this.bF); this.bF.connect(this.bG); this.bG.connect(this.sfx);
    this.bNoise.start();

    // scrape (metal on wall)
    this.scNoise = ctx.createBufferSource(); this.scNoise.buffer = this.noise; this.scNoise.loop = true;
    this.scF = ctx.createBiquadFilter(); this.scF.type = 'highpass'; this.scF.frequency.value = 2400;
    this.scG = ctx.createGain(); this.scG.gain.value = 0;
    this.scNoise.connect(this.scF); this.scF.connect(this.scG); this.scG.connect(this.sfx);
    this.scNoise.start();

    this.initMusic();
    this.ready = true;
  }

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }
  setVolume(v) { this.volume = v; if (this.master && !this.muted) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03); }

  // ------------------------------------------------------------- per-frame mixing
  // player: Vehicle; rivals: [{car, dist}] ; listener info for panning
  update(dt, s) {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const p = s.player;
    if (s.engineOn) {
      const th = s.throttle;
      this.engine.set(p.rpm, th, 1);
      const sq = clamp(s.squeal, 0, 1);
      this.sqG.gain.setTargetAtTime(sq * 0.13, t, 0.05);
      this.sqF.frequency.setTargetAtTime(1300 + p.speedFlat * 12 + sq * 500, t, 0.08);
      this.sqOscG.gain.setTargetAtTime(sq * sq * 0.035, t, 0.06);
      this.sqOsc.frequency.setTargetAtTime(1500 + p.speedFlat * 10, t, 0.1);
      this.windG.gain.setTargetAtTime(clamp(p.speedFlat / 70, 0, 1) ** 2 * 0.16, t, 0.1);
      this.windF.frequency.setTargetAtTime(300 + p.speedFlat * 8, t, 0.1);
      this.bG.gain.setTargetAtTime(p.boostBlend * 0.13, t, 0.05);
      this.bF.frequency.setTargetAtTime(900 + p.boostBlend * 1600, t, 0.1);
      this.scrapeAmt = damp(this.scrapeAmt, s.scrape, 20, dt);
      this.scG.gain.setTargetAtTime(this.scrapeAmt * 0.16, t, 0.03);
      s.rivals.forEach((r, i) => {
        const v = this.rivals[i];
        if (!v) return;
        const dx = r.car.pos.x - s.listener.x, dz = r.car.pos.z - s.listener.z;
        const d = Math.hypot(dx, dz);
        const vol = clamp(1 - d / 110, 0, 1) ** 2;
        const pan = (dx * s.right.x + dz * s.right.z) / Math.max(d, 1) * clamp(d / 12, 0, 1);
        v.set(r.car.rpm, 0.6, vol * 0.7, pan);
      });
    } else {
      this.engine.gain.gain.setTargetAtTime(0, t, 0.08);
      this.sqG.gain.setTargetAtTime(0, t, 0.05); this.sqOscG.gain.setTargetAtTime(0, t, 0.05);
      this.windG.gain.setTargetAtTime(0, t, 0.1); this.bG.gain.setTargetAtTime(0, t, 0.05); this.scG.gain.setTargetAtTime(0, t, 0.05);
      for (const v of this.rivals) v.gain.gain.setTargetAtTime(0, t, 0.08);
    }
    this.hitCooldown -= dt;
  }

  // ------------------------------------------------------------- one shots
  beep(freq = 440, dur = 0.16, vol = 0.22, type = 'square') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.005); g.gain.setValueAtTime(vol, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  countdown(n) { if (n > 0) this.beep(440, 0.18, 0.2); else { this.beep(880, 0.55, 0.22); this.beep(1320, 0.55, 0.08, 'sine'); } }
  click() { this.beep(660, 0.05, 0.08, 'triangle'); }

  burst(dur, f0, f1, q, vol, type = 'bandpass') {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.08, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(f); f.connect(g); g.connect(this.sfx);
    src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  boostStart() {
    if (!this.ready) return;
    this.burst(0.9, 300, 3600, 1.2, 0.34);
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(420, t + 0.5);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.1, t + 0.12); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.7);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.8);
  }
  impact(mag, big = true) {
    if (!this.ready || this.hitCooldown > 0) return;
    this.hitCooldown = 0.08;
    const v = clamp(mag / 14, 0.05, 1);
    const ctx = this.ctx, t = ctx.currentTime;
    this.burst(0.25 + v * 0.25, 1800, 180, 0.7, 0.35 * v, 'lowpass');
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.55 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.35);
    if (v > 0.5) this.burst(0.4, 5000, 800, 1.5, 0.12 * v, 'highpass');
  }
  propHit(kind, mag) {
    if (!this.ready) return;
    const v = clamp(mag / 25, 0.1, 1);
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = kind === 'barrel' ? 'triangle' : 'square';
    const f0 = kind === 'barrel' ? 190 : kind === 'cone' ? 520 : 300;
    o.frequency.setValueAtTime(f0 * (0.9 + Math.random() * 0.2), t); o.frequency.exponentialRampToValueAtTime(f0 * 0.5, t + 0.12);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.22 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'barrel' ? 0.22 : 0.14));
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.25);
    if (kind === 'fence') this.burst(0.18, 2400, 700, 1.4, 0.16 * v);
  }
  landing(mag) {
    if (!this.ready) return;
    const v = clamp(mag / 12, 0.1, 1);
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(100, t); o.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.6 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.45);
    this.burst(0.3, 900, 120, 0.6, 0.25 * v, 'lowpass');
  }
  shift() { if (this.ready) this.burst(0.09, 2500, 700, 2, 0.04); }
  lapChime() { this.beep(660, 0.12, 0.12, 'triangle'); setTimeout(() => this.beep(990, 0.22, 0.12, 'triangle'), 110); }
  fanfare() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { this.beep(f, 0.28, 0.13, 'triangle'); this.beep(f * 2, 0.28, 0.04, 'sine'); }, i * 120));
  }

  // ------------------------------------------------------------- music
  initMusic() {
    const ctx = this.ctx;
    this.mDuck = ctx.createGain(); this.mDuck.gain.value = 1;
    this.mDuck.connect(this.musicBus);
    this.mLeadBus = ctx.createGain(); this.mLeadBus.gain.value = 0.5;
    this.delay = ctx.createDelay(1); this.delay.delayTime.value = (60 / 128) * 0.75;
    this.delayFb = ctx.createGain(); this.delayFb.gain.value = 0.38;
    this.delayOut = ctx.createGain(); this.delayOut.gain.value = 0.4;
    this.mLeadBus.connect(this.mDuck);
    this.mLeadBus.connect(this.delay); this.delay.connect(this.delayFb); this.delayFb.connect(this.delay);
    this.delay.connect(this.delayOut); this.delayOut.connect(this.mDuck);
    this.mDrums = ctx.createGain(); this.mDrums.gain.value = 0; this.mDrums.connect(this.musicBus);
    this.mBass = ctx.createGain(); this.mBass.gain.value = 0; this.mBass.connect(this.mDuck);
    this.mPad = ctx.createGain(); this.mPad.gain.value = 0.5; this.mPad.connect(this.mDuck);
    this.bpm = 128; this.step = 0; this.nextTime = 0;
    this.chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [52, 56, 59], [55, 59, 62]]; // Am F C G Am F E G
    this.roots = [45, 41, 36, 43, 45, 41, 40, 43];
    this.timer = setInterval(() => this.scheduler(), 35);
  }
  setMusic(mode) {
    this.musicMode = mode;
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.mDrums.gain.setTargetAtTime(mode === 'race' ? 0.9 : 0, t, 0.3);
    this.mBass.gain.setTargetAtTime(mode === 'race' ? 0.55 : mode === 'menu' ? 0.18 : 0, t, 0.3);
    this.mPad.gain.setTargetAtTime(mode === 'off' ? 0 : mode === 'menu' ? 0.7 : 0.4, t, 0.5);
    this.mLeadBus.gain.setTargetAtTime(mode === 'off' ? 0 : mode === 'menu' ? 0.35 : 0.55, t, 0.4);
  }
  scheduler() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.25) {
      this.playStep(this.step, this.nextTime, stepDur);
      this.step = (this.step + 1) % 128;
      this.nextTime += stepDur;
    }
  }
  playStep(step, t, dur) {
    if (this.musicMode === 'off') return;
    const bar = Math.floor(step / 16) % 8, s16 = step % 16;
    const race = this.musicMode === 'race';
    const ctx = this.ctx;
    // drums
    if (race) {
      if (s16 % 4 === 0) this.kick(t);
      if (s16 % 4 === 2) this.hat(t, 0.13, 0.09, 7000);
      if (s16 % 2 === 1 && s16 % 4 !== 2) this.hat(t, 0.04, 0.03, 9000);
      if (s16 === 4 || s16 === 12) this.clap(t);
      if (bar % 4 === 3 && s16 >= 12) this.hat(t, 0.05, 0.03, 8000);
    }
    // pad on the first step of each bar
    if (s16 === 0) this.pad(t, this.chords[bar], dur * 16);
    // bass
    if (race || this.musicMode === 'menu') {
      const pat = [0, 0, 12, 0, 0, 0, 12, 7, 0, 0, 12, 0, 0, 7, 12, 10];
      if (race || s16 % 4 === 0) this.bass(t, this.roots[bar] + pat[s16], dur * 0.9);
    }
    // arpeggio lead
    const ch = this.chords[bar];
    const arp = [0, 2, 1, 2, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 1];
    const play = race ? true : s16 % 2 === 0;
    if (play) {
      const idx = arp[s16];
      const note = ch[idx] + 12 + (bar >= 4 && s16 >= 8 ? 12 : 0);
      this.lead(t, note, dur * 1.6, race ? 0.06 : 0.05);
    }
    // duck on the kick
    if (race && s16 % 4 === 0) {
      this.mDuck.gain.cancelScheduledValues(t);
      this.mDuck.gain.setValueAtTime(0.55, t);
      this.mDuck.gain.linearRampToValueAtTime(1, t + dur * 3.2);
    }
  }
  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    o.connect(g); g.connect(this.mDrums); o.start(t); o.stop(t + 0.3);
    const c = ctx.createOscillator(); c.type = 'square'; c.frequency.setValueAtTime(900, t); c.frequency.exponentialRampToValueAtTime(100, t + 0.02);
    const cg = ctx.createGain(); cg.gain.setValueAtTime(0.14, t); cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    c.connect(cg); cg.connect(this.mDrums); c.start(t); c.stop(t + 0.04);
  }
  hat(t, len, vol, freq) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g); g.connect(this.mDrums); s.start(t, Math.random() * 1.5); s.stop(t + len + 0.02);
  }
  clap(t) {
    const ctx = this.ctx;
    for (let i = 0; i < 3; i++) {
      const s = ctx.createBufferSource(); s.buffer = this.noise;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.9;
      const g = ctx.createGain(); const tt = t + i * 0.011;
      g.gain.setValueAtTime(0.28, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + (i === 2 ? 0.16 : 0.03));
      s.connect(f); f.connect(g); g.connect(this.mDrums); s.start(tt, Math.random() * 1.5); s.stop(tt + 0.2);
    }
  }
  bass(t, note, len) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(note);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 6;
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(220, t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f); f.connect(g); g.connect(this.mBass); o.start(t); o.stop(t + len + 0.02);
  }
  lead(t, note, len, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + len);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(4200, t); f.frequency.exponentialRampToValueAtTime(900, t + len);
    for (const d of [-9, 9]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(note); o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + len + 0.02);
    }
    f.connect(g); g.connect(this.mLeadBus);
  }
  pad(t, chord, len) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09, t + 0.5); g.gain.setValueAtTime(0.09, t + len - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + len);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1100; f.Q.value = 0.5;
    for (const n of chord) for (const d of [-7, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = d;
      o.connect(f); o.start(t); o.stop(t + len + 0.05);
    }
    f.connect(g); g.connect(this.mPad);
  }
}
