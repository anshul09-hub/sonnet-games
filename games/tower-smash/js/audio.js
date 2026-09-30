// Everything you hear is synthesised here with the Web Audio API. No audio files.

const rand = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.sfxVol = 0.85;
    this.musicVol = 0.6;
    this.voices = 0;
    this.last = {};
    this.musicPlaying = false;
    this.creaking = false;
    this.lastPower = 0;
  }

  // must be called from a user gesture
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this.sfxVol; this.sfx.connect(this.master);
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000;
    this.music = ctx.createGain(); this.music.gain.value = 0.26 * this.musicVol;
    this.music.connect(this.musicFilter); this.musicFilter.connect(this.master);
    // shared noise buffer
    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.initCreak();
  }

  get ok() { return !!this.ctx && this.ctx.state === 'running'; }
  get t() { return this.ctx.currentTime; }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.t, 0.03);
  }
  setSfxVolume(v) { this.sfxVol = v; if (this.ctx) this.sfx.gain.setTargetAtTime(v, this.t, 0.03); }
  setMusicVolume(v) { this.musicVol = v; if (this.ctx) this.music.gain.setTargetAtTime(0.26 * v, this.t, 0.05); }
  // muffle the music (slow motion, pause)
  muffle(on) { if (this.ctx) this.musicFilter.frequency.setTargetAtTime(on ? 600 : 18000, this.t, 0.12); }
  suspend() { this.ctx?.suspend(); }
  resume() { this.ctx?.resume(); }

  gate(key, gap) {
    const n = performance.now();
    if (this.last[key] && n - this.last[key] < gap) return false;
    this.last[key] = n;
    return this.voices < 40;
  }

  out(pan = 0, dest = null) {
    const ctx = this.ctx;
    if (!ctx.createStereoPanner || !pan) return dest || this.sfx;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(dest || this.sfx);
    return p;
  }

  track(node) {
    this.voices++;
    node.onended = () => { this.voices--; };
  }

  // oscillator blip with pitch glide and exponential decay
  tone(type, f0, f1, dur, vol, out, at = 0, attack = 0.003) {
    const ctx = this.ctx, t = this.t + at;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
    this.track(o);
    return o;
  }

  noise(ftype, f0, f1, Q, dur, vol, out, at = 0, attack = 0.002) {
    const ctx = this.ctx, t = this.t + at;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = Q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
    this.track(s);
  }

  // ---------------------------------------------------------------- impacts
  impact(mat, inten = 0.6, pan = 0) {
    if (!this.ok || !this.gate('imp' + mat, 35)) return;
    const o = this.out(pan), v = 0.25 + inten * 0.75;
    switch (mat) {
      case 'wood': {
        const f = rand(150, 300) * (1.15 - inten * 0.3);
        this.tone('triangle', f * 1.6, f, 0.14, 0.5 * v, o);
        this.tone('sine', f * 2.6, f * 2.2, 0.07, 0.25 * v, o);
        this.noise('bandpass', 1100, 700, 1.2, 0.07, 0.45 * v, o);
        break;
      }
      case 'stone': case 'sstone': {
        const f = rand(70, 120);
        this.tone('sine', f * 1.8, f, 0.2, 0.7 * v, o);
        this.noise('lowpass', 2400, 500, 0.8, 0.13, 0.6 * v, o);
        this.noise('highpass', 3500, 3500, 0.7, 0.03, 0.35 * v, o);
        break;
      }
      case 'glass': {
        const f = rand(2200, 4200);
        this.tone('sine', f, f * 0.98, 0.32, 0.32 * v, o);
        this.tone('sine', f * 1.51, f * 1.5, 0.22, 0.2 * v, o);
        this.noise('highpass', 6000, 6000, 0.7, 0.05, 0.25 * v, o);
        break;
      }
      case 'tnt': {
        const f = rand(90, 140);
        this.tone('triangle', f * 2, f, 0.16, 0.55 * v, o);
        this.noise('bandpass', 500, 300, 1, 0.1, 0.4 * v, o);
        break;
      }
      default: break;
    }
  }

  shatter(inten = 1, pan = 0) {
    if (!this.ok || !this.gate('shatter', 45)) return;
    const o = this.out(pan);
    this.noise('highpass', 5000, 7000, 0.6, 0.28, 0.5 * inten, o);
    const n = 6 + Math.floor(inten * 5);
    for (let i = 0; i < n; i++) {
      const f = rand(2000, 7500);
      this.tone('sine', f, f * rand(0.9, 1.05), rand(0.06, 0.22), rand(0.08, 0.2) * inten, o, rand(0, 0.22));
    }
    this.tone('triangle', 900, 350, 0.09, 0.3 * inten, o);
  }

  splinter(inten = 1, pan = 0) {
    if (!this.ok || !this.gate('splinter', 45)) return;
    const o = this.out(pan);
    this.noise('bandpass', 1600, 900, 1.5, 0.22, 0.5 * inten, o);
    for (let i = 0; i < 4; i++) {
      const f = rand(200, 520);
      this.tone('square', f * 1.5, f, rand(0.03, 0.07), rand(0.08, 0.16) * inten, o, rand(0, 0.16));
    }
    this.noise('lowpass', 700, 200, 0.7, 0.15, 0.35 * inten, o);
  }

  crumble(inten = 1, pan = 0) {
    if (!this.ok || !this.gate('crumble', 60)) return;
    const o = this.out(pan);
    this.noise('lowpass', 1400, 200, 0.7, 0.5, 0.7 * inten, o);
    this.tone('sine', 110, 40, 0.35, 0.6 * inten, o);
    for (let i = 0; i < 4; i++) this.noise('bandpass', rand(600, 1600), 400, 1.2, 0.05, 0.25 * inten, o, rand(0.05, 0.35));
  }

  crack(mat, pan = 0) {
    if (!this.ok || !this.gate('crack', 60)) return;
    const o = this.out(pan);
    this.noise('highpass', mat === 'glass' ? 6000 : 2500, 2500, 0.8, 0.05, 0.4, o);
    this.tone('triangle', mat === 'stone' ? 500 : 900, 250, 0.06, 0.25, o);
  }

  thud(inten = 0.6, pan = 0) {
    if (!this.ok || !this.gate('thud', 90)) return;
    const o = this.out(pan);
    this.tone('sine', 130, 42, 0.22, 0.85 * inten + 0.1, o);
    this.noise('lowpass', 500, 150, 0.8, 0.15, 0.5 * inten, o);
  }

  explosion(size = 1, pan = 0) {
    if (!this.ok || !this.gate('boom', 50)) return;
    const o = this.out(pan);
    this.noise('lowpass', 2200, 60, 0.7, 1.3 * size, 1.0, o, 0, 0.004);
    this.noise('bandpass', 700, 120, 0.5, 0.6 * size, 0.7, o);
    this.tone('sine', 100, 26, 1.0 * size, 1.1, o);
    this.tone('sawtooth', 70, 30, 0.5, 0.35, o);
    for (let i = 0; i < 7; i++) this.noise('highpass', rand(1500, 4500), 1200, 0.7, rand(0.03, 0.09), rand(0.15, 0.3), o, rand(0.08, 0.9 * size));
  }

  splash(pan = 0) {
    if (!this.ok || !this.gate('splash', 120)) return;
    const o = this.out(pan);
    this.noise('bandpass', 1300, 380, 0.9, 0.6, 0.55, o);
    for (let i = 0; i < 5; i++) {
      const f = rand(400, 900);
      this.tone('sine', f, f * 2.2, 0.08, 0.14, o, rand(0.05, 0.4));
    }
  }

  pop(pan = 0) {
    if (!this.ok) return;
    const o = this.out(pan);
    this.tone('sine', 260, 980, 0.11, 0.45, o);
    this.noise('bandpass', 2000, 900, 1, 0.08, 0.3, o);
  }

  flagDown(n = 1, pan = 0) {
    if (!this.ok) return;
    const o = this.out(pan);
    const base = 880 * Math.pow(2, (n - 1) * 2 / 12);
    for (const [m, v, d] of [[1, 0.4, 0.7], [2.76, 0.16, 0.35], [1.5, 0.22, 0.55]]) this.tone('sine', base * m, base * m, d, v, o);
    this.noise('highpass', 7000, 7000, 0.7, 0.18, 0.18, o);
    this.tone('triangle', 220, 110, 0.14, 0.4, o);
  }

  // ---------------------------------------------------------------- catapult
  initCreak() {
    const ctx = this.ctx;
    this.creakGain = ctx.createGain(); this.creakGain.gain.value = 0;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 5; bp.frequency.value = 520;
    this.creakBP = bp;
    this.creakO1 = ctx.createOscillator(); this.creakO1.type = 'sawtooth'; this.creakO1.frequency.value = 60;
    this.creakO2 = ctx.createOscillator(); this.creakO2.type = 'sawtooth'; this.creakO2.frequency.value = 63.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9;
    const lg = ctx.createGain(); lg.gain.value = 9;
    lfo.connect(lg); lg.connect(this.creakO1.frequency); lg.connect(this.creakO2.frequency);
    const ns = ctx.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 2.5;
    const ng = ctx.createGain(); ng.gain.value = 0.35;
    ns.connect(nf); nf.connect(ng); ng.connect(this.creakGain);
    this.creakO1.connect(bp); this.creakO2.connect(bp); bp.connect(this.creakGain);
    this.creakGain.connect(this.sfx);
    for (const n of [this.creakO1, this.creakO2, lfo, ns]) n.start();
  }
  creakUpdate(power, dt) {
    if (!this.ok) return;
    const dp = Math.abs(power - this.lastPower) / Math.max(dt, 0.008);
    this.lastPower = power;
    const target = Math.min(0.22, dp * 0.35) * (power > 0.03 ? 1 : 0);
    const t = this.t;
    this.creakGain.gain.setTargetAtTime(target, t, 0.05);
    const f = 55 + power * 120 + rand(-6, 6);
    this.creakO1.frequency.setTargetAtTime(f, t, 0.05);
    this.creakO2.frequency.setTargetAtTime(f * 1.06, t, 0.05);
    this.creakBP.frequency.setTargetAtTime(380 + power * 700, t, 0.05);
  }
  creakStop() { if (this.ctx) this.creakGain.gain.setTargetAtTime(0, this.t, 0.04); this.lastPower = 0; }

  release(power = 1) {
    if (!this.ok) return;
    const o = this.sfx;
    this.tone('triangle', 240, 80, 0.55, 0.5, o);
    this.tone('sine', 480, 160, 0.4, 0.2, o);
    this.noise('bandpass', 300, 2600, 0.8, 0.32, 0.5, o);
    this.tone('sine', 150, 48, 0.25, 0.9, o, 0.08);
    this.noise('lowpass', 900, 200, 0.7, 0.16, 0.6, o, 0.1);
  }

  // ---------------------------------------------------------------- UI / fanfares
  click() {
    if (!this.ok) return;
    this.tone('triangle', 660, 880, 0.07, 0.25, this.sfx);
  }
  star(i) {
    if (!this.ok) return;
    const f = midi([84, 88, 91][i] ?? 91);
    const o = this.sfx;
    this.tone('sine', f, f, 0.9, 0.42, o);
    this.tone('sine', f * 2.756, f * 2.756, 0.3, 0.12, o);
    this.tone('triangle', f * 0.5, f * 0.5, 0.6, 0.2, o);
    this.noise('highpass', 8000, 8000, 0.6, 0.25, 0.14, o);
  }
  fanfare() {
    if (!this.ok) return;
    const notes = [72, 76, 79, 84, 79, 84, 88];
    notes.forEach((n, i) => {
      this.tone('triangle', midi(n), midi(n), 0.35, 0.3, this.sfx, i * 0.11);
      this.tone('sine', midi(n) * 2, midi(n) * 2, 0.25, 0.08, this.sfx, i * 0.11);
    });
    for (const n of [72, 76, 79, 84]) this.tone('triangle', midi(n), midi(n), 0.9, 0.16, this.sfx, 0.8);
  }
  fail() {
    if (!this.ok) return;
    [67, 64, 60, 55].forEach((n, i) => {
      const o = this.tone('sawtooth', midi(n), midi(n) * 0.97, 0.42, 0.16, this.sfx, i * 0.28);
    });
    this.tone('sine', 60, 40, 0.9, 0.4, this.sfx, 0.8);
  }
  unlock() {
    if (!this.ok) return;
    [79, 83, 86, 91].forEach((n, i) => this.tone('sine', midi(n), midi(n), 0.5, 0.25, this.sfx, i * 0.09));
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    this.timer = setInterval(() => this.schedule(), 40);
  }
  stopMusic() { this.musicPlaying = false; clearInterval(this.timer); }

  schedule() {
    if (!this.ctx || this.ctx.state !== 'running') { this.nextTime = this.ctx ? this.ctx.currentTime + 0.1 : 0; return; }
    const stepDur = 60 / 118 / 2;
    while (this.nextTime < this.ctx.currentTime + 0.3) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += stepDur;
      this.step = (this.step + 1) % 64;
    }
  }

  note(type, freq, t, dur, vol, cutoff = 3500, dest = this.music) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = type; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.03);
  }

  playStep(step, t) {
    const bar = (step / 8) | 0, s = step % 8;
    const roots = [48, 43, 45, 41, 48, 43, 41, 43];        // C G Am F C G F G
    const chords = [[0, 4, 7], [0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7], [0, 4, 7]];
    const root = roots[bar], ch = chords[bar];
    // bass
    if (s === 0 || s === 4) this.note('triangle', midi(root), t, 0.42, 0.55, 700);
    if (s === 6) this.note('triangle', midi(root + 7), t, 0.22, 0.4, 700);
    // arpeggio pluck
    const arp = [0, 1, 2, 1, 0, 1, 2, 1][s];
    this.note('triangle', midi(root + 24 + ch[arp]), t, 0.2, 0.2, 3000);
    // melody
    const mel = MELODY[bar][s];
    if (mel) this.note('square', midi(mel), t, 0.27, 0.17, 2600);
    // drums
    if (s === 0 || s === 4) this.drum('kick', t);
    if (s === 2 || s === 6) this.drum('snare', t);
    if (s % 2 === 1) this.drum('hat', t);
  }

  drum(kind, t) {
    const ctx = this.ctx;
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      o.connect(g); g.connect(this.music); o.start(t); o.stop(t + 0.2);
    } else {
      const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter(), g = ctx.createGain();
      if (kind === 'snare') { f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8; g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.11); }
      else { f.type = 'highpass'; f.frequency.value = 7500; g.gain.setValueAtTime(0.14, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); }
      s.connect(f); f.connect(g); g.connect(this.music);
      s.start(t, Math.random()); s.stop(t + 0.15);
    }
  }
}

// eighth-note melody, one array of 8 per bar (C G Am F C G F G)
const MELODY = [
  [76, 0, 79, 76, 74, 0, 72, 0],
  [74, 0, 79, 74, 71, 0, 74, 0],
  [76, 0, 81, 76, 72, 0, 69, 72],
  [77, 0, 81, 77, 72, 0, 74, 72],
  [76, 79, 84, 79, 76, 0, 79, 0],
  [74, 79, 83, 79, 74, 0, 71, 0],
  [77, 76, 74, 72, 77, 0, 81, 0],
  [79, 0, 74, 0, 71, 74, 79, 0],
];
