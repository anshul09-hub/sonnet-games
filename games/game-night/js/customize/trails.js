// Move trails: 24 particle configurations (8 per theme), emitted behind hopping tokens.
import { SPRITE as S } from '../core/fx.js';

const P = (o) => ({ rate: 24, life: 1, size: 0.15, size1: null, g: 0, drag: 0.5, vr: 0.3, spread: 0.1, alpha: 1, alpha1: 0, add: false, spin: 3, ...o });

export const TRAILS = {
  // anime
  petals: P({ frame: [S.PETAL], colors: [0xffb7d5, 0xff8fb1, 0xffd6e8], size: 0.17, life: 1.5, g: -0.5, drag: 0.8, vr: [0.5, 0.2, 0.5], spin: 4, alpha1: 0.9 }),
  leaves: P({ frame: [S.LEAF], colors: [0xff8a3d, 0xc0392b, 0xe6b422], size: 0.18, life: 1.4, g: -0.9, drag: 0.7, vr: [0.6, 0.3, 0.6], spin: 6, alpha1: 0.9 }),
  fireflies: P({ frame: [S.SOFT], colors: [0xffe66d, 0xa6ff3d], size: 0.17, size1: 0.05, life: 1.6, g: 0.15, vr: 0.5, add: true, rate: 16 }),
  snow: P({ frame: [S.FLAKE], colors: [0xffffff, 0xbde7ff], size: 0.13, life: 1.6, g: -0.45, drag: 0.7, vr: 0.4, spin: 3, alpha1: 0.9 }),
  foxfire: P({ frame: [S.SOFT], colors: [0x6fe7ff, 0x7a5cff], size: 0.3, size1: 0.04, life: 0.9, g: 1.0, vr: [0.3, 0.2, 0.3], add: true, rate: 34 }),
  hearts: P({ frame: [S.HEART], colors: [0xff6b9a, 0xffc2d1], size: 0.17, life: 1.3, g: 0.7, vr: 0.35, spin: 2, rate: 14 }),
  inksplash: P({ frame: [S.DISC], colors: [0x2b2d42, 0x555b73], size: 0.13, size1: 0.02, life: 0.8, g: -2, vr: [0.9, 0.9, 0.9], rate: 26, alpha1: 0.6 }),
  sparkle: P({ frame: [S.STAR], colors: [0xfff3a3, 0xffd23f], size: 0.2, size1: 0.02, life: 0.9, g: -0.2, vr: 0.5, add: true, spin: 6, rate: 30 }),
  // gamer
  pixels: P({ frame: [S.SQUARE], colors: [0x7dff6b, 0x2ecc71, 0xb6ff9e], size: 0.1, size1: 0.1, life: 0.7, g: -2.2, vr: [0.7, 0.4, 0.7], spin: 0, alpha1: 1 }),
  coins: P({ frame: [S.DISC], colors: [0xffd23f, 0xff9f1c], size: 0.14, life: 1.0, g: -3.5, vr: [0.8, 1.6, 0.8], spin: 9, rate: 14, alpha1: 0.8 }),
  chipstars: P({ frame: [S.STAR, S.DIAMOND], colors: [0xffffff, 0x4dd6ff], size: 0.15, size1: 0.08, life: 0.7, vr: 0.5, add: true, spin: 0, rate: 26 }),
  pixelheart: P({ frame: [S.HEART], colors: [0xff4d6d, 0xffd1dc], size: 0.16, life: 1.0, g: 0.5, vr: 0.4, spin: 0, rate: 12 }),
  embers: P({ frame: [S.SOFT], colors: [0xff9f1c, 0xe63946, 0xffd166], size: 0.15, size1: 0.02, life: 0.9, g: 1.6, vr: [0.5, 0.3, 0.5], add: true, rate: 34 }),
  confetti: P({ frame: [S.SQUARE, S.STAR], colors: [0xff4d6d, 0x4dd6ff, 0xffd23f, 0x7dff6b, 0xc77dff], size: 0.1, life: 1.2, g: -3, vr: [1.2, 1.5, 1.2], spin: 10, alpha1: 1, rate: 30 }),
  smoke: P({ frame: [S.SMOKE], colors: [0xc8c8c8, 0x777777], size: 0.25, size1: 0.8, life: 0.9, g: 0.3, vr: 0.2, drag: 1.2, alpha: 0.6, rate: 20 }),
  notes: P({ frame: [S.NOTE], colors: [0xc77dff, 0xffd23f], size: 0.2, life: 1.3, g: 0.8, vr: 0.4, spin: 2, rate: 10 }),
  // tech
  binary: P({ frame: [S.ZERO, S.ONE], colors: [0x00ff9c, 0x7dffc4], size: 0.16, life: 1.0, g: -0.8, vr: [0.2, 0.2, 0.2], spin: 0, add: true, rate: 30 }),
  bolts: P({ frame: [S.BOLT], colors: [0x7ad7ff, 0xffffff], size: 0.22, size1: 0.1, life: 0.35, vr: 0.9, add: true, spin: 5, rate: 34, spread: 0.2 }),
  hexes: P({ frame: [S.DIAMOND], colors: [0x00f0c8, 0x2a9bd6], size: 0.14, size1: 0.02, life: 0.9, g: 0.2, vr: 0.5, add: true, spin: 2, rate: 20 }),
  streams: P({ frame: [S.STREAK], colors: [0xc77dff, 0x7ad7ff], size: 0.36, size1: 0.1, life: 0.4, vr: 0.3, add: true, spin: 0, rate: 30, rot: 0 }),
  glitchpx: P({ frame: [S.SQUARE], colors: [0xff2bd6, 0x00f0c8, 0xffffff], size: 0.12, size1: 0.12, life: 0.4, vr: [0.9, 0.2, 0.9], spin: 0, alpha1: 1, rate: 40, spread: 0.2 }),
  plasma: P({ frame: [S.SOFT], colors: [0xb388ff, 0xff9bff], size: 0.36, size1: 0.05, life: 0.9, g: 0.4, vr: [0.5, 0.3, 0.5], add: true, rate: 26 }),
  bubbles: P({ frame: [S.RING], colors: [0x7ad7ff, 0xe0fbff], size: 0.1, size1: 0.32, life: 1.1, g: 0.6, vr: 0.4, spin: 0, rate: 14 }),
  lightrain: P({ frame: [S.STREAK], colors: [0x4dd6ff, 0xc77dff], size: 0.32, size1: 0.2, life: 0.6, g: -7, vr: [0.3, 0.1, 0.3], add: true, spin: 0, rot: Math.PI / 2, rate: 30, spread: 0.25 }),
};

/** Emit trail particles for `id` at world position p. `state.acc` keeps the fractional emission. */
export function emitTrail(fx, id, p, dt, state) {
  const c = TRAILS[id] || TRAILS.petals;
  state.acc = (state.acc || 0) + dt * c.rate;
  while (state.acc >= 1) {
    state.acc -= 1;
    const col = c.colors[Math.floor(Math.random() * c.colors.length)];
    fx.emit({ p: [p.x, p.y + 0.12, p.z], spread: c.spread, v: [0, c.g > 0 ? 0.3 : 0.5, 0], vr: c.vr, life: c.life, lifeVar: c.life * 0.25, size: c.size, size1: c.size1 ?? c.size, color: col, color1: col, alpha: c.alpha, alpha1: c.alpha1, g: c.g, drag: c.drag, spin: c.spin, frame: c.frame, add: c.add, rot: c.rot, wind: 0.4 });
  }
}
export function trailBurst(fx, id, p, n = 10) {
  const c = TRAILS[id] || TRAILS.petals;
  for (let i = 0; i < n; i++) { const col = c.colors[i % c.colors.length]; fx.emit({ p: [p.x, p.y + 0.2, p.z], n: 1, spread: 0.2, v: [0, 1.4, 0], vr: [1.6, 1, 1.6], life: c.life, size: c.size * 1.2, size1: (c.size1 ?? c.size) * 1.2, color: col, alpha: 1, alpha1: 0, g: c.g === 0 ? -1 : c.g, drag: c.drag, spin: c.spin, frame: c.frame, add: c.add, rot: c.rot }); }
}
