// Small shared helpers: math, easing, seeded RNG, safe storage, a scaled game clock with promise tweens.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => { const t = invLerp(a, b, v); return t * t * (3 - 2 * t); };
/** Frame-rate independent exponential smoothing. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const angleDelta = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, lambda, dt) => a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  constructor(seed = (Math.random() * 2 ** 32) >>> 0) { this.seed = seed >>> 0; this.f = mulberry32(this.seed); }
  next() { return this.f(); }
  range(a, b) { return a + (b - a) * this.f(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.f() * arr.length)]; }
  chance(p) { return this.f() < p; }
  shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(this.f() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
  sign() { return this.f() < 0.5 ? -1 : 1; }
}
export const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
export const rndInt = (a, b) => Math.floor(rnd(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  inBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return c3 * t * t * t - c1 * t * t; },
  outElastic: (t) => (t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// ---------- storage ----------
export const store = {
  get(key, fallback = null) {
    try { const v = localStorage.getItem('gn.' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('gn.' + key, JSON.stringify(value)); } catch { /* private mode etc */ }
  },
  del(key) { try { localStorage.removeItem('gn.' + key); } catch { /* */ } },
};

// ---------- query params ----------
export const params = new URLSearchParams(location.search);
export const isTouch = () => params.get('touch') === '1' || (params.get('touch') !== '0' && (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches));

// ---------- scaled game clock ----------
/**
 * Drives promise-based waits and tweens in *game time* so slow-motion and the fast-forward test speed
 * affect every animation the same way. Each game owns one Clock and calls update(dt) from its loop.
 */
export class Clock {
  constructor() { this.t = 0; this.scale = 1; this.tasks = []; this.frame = 0; }
  update(dt) {
    const d = dt * this.scale;
    this.t += d; this.frame++;
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const k = this.tasks[i];
      if (k.dead) { this.tasks.splice(i, 1); continue; }
      k.t += d;
      const done = k.t >= k.dur;
      if (k.fn) { const p = k.dur > 0 ? Math.min(1, k.t / k.dur) : 1; k.fn(k.ease ? k.ease(p) : p, p); }
      if (done) { this.tasks.splice(i, 1); k.resolve(); }
    }
  }
  /** Resolve after `sec` seconds of game time. */
  wait(sec) { return new Promise((resolve) => this.tasks.push({ t: 0, dur: sec, resolve })); }
  /** Call fn(easedT, rawT) every frame for `sec` seconds of game time. */
  tween(sec, fn, easing = ease.inOutQuad) {
    return new Promise((resolve) => this.tasks.push({ t: 0, dur: sec, fn, ease: easing, resolve }));
  }
  /** Fire and forget callback in `sec` seconds. */
  after(sec, cb) { const task = { t: 0, dur: sec, resolve: cb }; this.tasks.push(task); return () => { task.dead = true; }; }
  clear() { this.tasks.length = 0; }
}

export const rafWait = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- color helpers ----------
export function hex(n) { return '#' + n.toString(16).padStart(6, '0'); }
export function shade(color, amt) {
  // color: 0xRRGGBB, amt -1..1
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  const f = (c) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}
export function mixColor(a, b, t) {
  const f = (s) => Math.round(lerp((a >> s) & 255, (b >> s) & 255, t));
  return (f(16) << 16) | (f(8) << 8) | f(0);
}
