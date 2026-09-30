// Twelve hand-designed levels. Each build(b) works in local coordinates:
// x from the castle origin, y above the plateau, z across the lane.
import { Builder } from './builder.js';

// ---- small composition helpers ----
function roof(b, x, z, w, d, y, mat = 'wood') { b.slab({ x, z, w, d, y, mat, th: 0.5 }); return y + 0.5; }
function flagOn(b, x, z, w, d, y, mat = 'wood', fx = null, fz = null) {
  const top = roof(b, x, z, w, d, y, mat);
  b.flag(fx ?? x + w / 2, top, fz ?? z + d / 2);
  return top;
}
// timber scaffold with glass panes and floors
function scaffold(b, { x, z, w, d, levels, h = 2.4, bays, glass = true, y = 0 }) {
  bays = bays || Math.max(1, Math.round(w / 2.4));
  const span = w / bays;
  for (let L = 0; L < levels; L++) {
    for (let i = 0; i <= bays; i++) for (const pz of [z, z + d]) b.post(x + i * span, y, pz, h, 'wood', 0.6);
    if (glass) for (let i = 0; i < bays; i++) for (const pz of [z + d - 0.1, z - 0.1]) b.box('glass', x + i * span + 0.3, y + 0.05, pz, span - 0.6, h - 0.1, 0.2);
    b.box('wood', x - 0.3, y + h, z - 0.3, w + 0.6, 0.35, 0.6);
    b.box('wood', x - 0.3, y + h, z + d - 0.3, w + 0.6, 0.35, 0.6);
    b.slab({ x: x - 0.3, z: z - 0.3, w: w + 0.6, d: d + 0.6, y: y + h + 0.35, mat: 'wood', th: 0.4, pw: 2 });
    y += h + 0.75;
  }
  return y;
}
// window pattern for tower(): glass in the middle brick of a wall, on chosen rows/sides
const win = (rows, sides = ['left', 'front', 'back'], base = 'stone', pane = 'glass') =>
  (r, side, i, n) => (rows.includes(r) && sides.includes(side) && i === (n >> 1) ? pane : base);

// A stone tower with a sealed chamber holding a flag: foundation rows, a floor, the chamber
// (windows in the given chamber rows), a lid, then a heavy cap of extra rows and a roof.
function chamberKeep(b, o) {
  const { x, z, w = 6, d = 6, t = 2, base = 3, chamber = 4, cap = 4, windows = [1, 2], sides, mat = 'stone' } = o;
  const rows = base + chamber + cap;
  const y = b.tower({ x, z, w, d, t, rows, floors: [base - 1, base + chamber - 1], mat: win(windows.map((k) => base + k), sides, mat) });
  b.flag(x + w / 2, b.lastFloors[0], z + d / 2);
  return roof(b, x, z, w, d, y, 'wood');
}

export const LEVELS = [
  {
    name: 'Warm-Up', tip: 'Drag back to aim, release to fire. Knock the flag off the tower!',
    ammo: { rock: 4 },
    build(b) {
      const y = b.tower({ x: 8, z: -2, w: 4, d: 4, rows: 8, mat: win([2, 5], ['front', 'back']), floors: [3] });
      flagOn(b, 8, -2, 4, 4, y);
      b.barrel(5.5, 0, 0);
      b.solid({ x: 12.5, z: -1, nx: 1, ny: 3, nz: 2, mat: 'wood', sx: 1, sy: 1, sz: 1 });
    },
  },
  {
    name: 'Timber Yard', tip: 'Wood splinters and glass shatters. TNT barrels explode!',
    ammo: { rock: 5 },
    build(b) {
      const y = scaffold(b, { x: 6, z: -1.8, w: 7.2, d: 3.6, levels: 3 });
      b.barrel(8, 2 * 3.15, 0);
      b.flag(9.6, y, 0);
      const y2 = scaffold(b, { x: 20, z: -1.8, w: 4.8, d: 3.6, levels: 2 });
      b.barrel(21.5, 0, 0); b.barrel(23, 0, 0);
      b.flag(22.4, y2, 0);
    },
  },
  {
    name: 'Stone Keep', tip: 'The flag is sealed inside. Stone is tough: heavy boulders crush it.', newAmmo: 'boulder',
    ammo: { rock: 2, boulder: 3 },
    build(b) {
      chamberKeep(b, { x: 12, z: -3, base: 3, chamber: 4, cap: 4, windows: [1, 2] });
      b.wall({ x: 6, z: -4, axis: 'z', len: 8, rows: 3, t: 1, mat: 'wood', h: 1 });
      b.barrel(9, 0, 0); b.barrel(9, 0, 2);
    },
  },
  {
    name: 'Twin Towers', tip: 'Two solid towers, two flags. The bridge is packed with TNT.',
    ammo: { rock: 3, boulder: 3 },
    build(b) {
      const yA = b.tower({ x: 5, z: -2, w: 4, d: 4, t: 2, rows: 9, mat: 'stone' });
      const yB = b.tower({ x: 21, z: -2, w: 4, d: 4, t: 2, rows: 9, mat: 'stone' });
      roof(b, 5, -2, 4, 4, yA); roof(b, 21, -2, 4, 4, yB);
      b.box('wood', 7, yA + 0.5, -1.6, 16, 0.5, 1.2);
      b.box('wood', 7, yA + 0.5, 0.4, 16, 0.5, 1.2);
      b.barrel(12, yA + 1, -1); b.barrel(14, yA + 1, 1); b.barrel(16.5, yA + 1, -1);
      b.flag(6, yA + 0.5, 0); b.flag(24.2, yB + 0.5, 0);
      b.barrel(13, 0, 0); b.barrel(15, 0, 0);
    },
  },
  {
    name: 'Glass Palace', tip: 'Tap while the cluster shot is in the air to split it.', newAmmo: 'cluster',
    ammo: { rock: 2, cluster: 3, boulder: 1 },
    build(b) {
      const pav = (x, rows) => {
        const y = b.tower({ x, z: -2, w: 4, d: 4, rows, mat: (r) => (r === 0 ? 'stone' : 'glass'), floors: [2] });
        b.flag(x + 2, b.lastFloors[0], 0);
        roof(b, x, -2, 4, 4, y, 'wood');
      };
      pav(4, 8); pav(14, 10); pav(24, 8);
      b.wall({ x: 8, z: -1, len: 6, rows: 2, t: 2, mat: 'glass', h: 1 });
      b.wall({ x: 18, z: -1, len: 6, rows: 2, t: 2, mat: 'glass', h: 1 });
      b.barrel(11, 0, 2); b.barrel(21, 0, -2);
    },
  },
  {
    name: 'Powder Keep', tip: 'Set off the barrels in the cellar and everything above goes up.',
    ammo: { rock: 3, boulder: 2, cluster: 2 },
    build(b) {
      b.wall({ x: 3, z: -5, axis: 'z', len: 10, rows: 5, t: 2, mat: 'stone' });
      // keep: TNT cellar (rows 0-1), chamber with the flag above it, heavy cap on top
      const y = b.tower({ x: 11, z: -3, w: 6, d: 6, t: 1, rows: 9, floors: [1, 5], mat: win([3, 4], ['left', 'front', 'back']) });
      b.flag(14, b.lastFloors[0], 0);
      roof(b, 11, -3, 6, 6, y);
      for (const [x, z] of [[13, -1.2], [13, 1.2], [15, -1.2], [15, 1.2]]) b.barrel(x, 0, z);
      const y2 = b.tower({ x: 26, z: -2, w: 4, d: 4, t: 2, rows: 7, mat: 'stone' });
      flagOn(b, 26, -2, 4, 4, y2, 'wood');
      b.barrel(25, 0, 0); b.barrel(30.5, 0, 0);
    },
  },
  {
    name: 'Wrecking Yard', tip: 'Time your shot, or lob it over the wrecking ball.', newAmmo: 'bouncy',
    ammo: { rock: 2, bouncy: 2, boulder: 3 },
    build(b) {
      const c = b.crane(2, 0, 9.6, 16.4);
      b.pendulum({ x: c.px, y: c.py, z: 0, len: 7.4, r: 1.3, ang: 48 });
      chamberKeep(b, { x: 20, z: -2, w: 4, d: 4, t: 1, base: 3, chamber: 4, cap: 3, windows: [1, 2] });
      const y2 = scaffold(b, { x: 28.5, z: -1.8, w: 4.8, d: 3.6, levels: 2, glass: false });
      b.flag(30.9, y2, 0);
      b.barrel(26, 0, 0);
    },
  },
  {
    name: 'The Elevator', tip: 'The lift never stops. Hit it while it is low, or wait for it to rise.',
    ammo: { rock: 3, boulder: 3, bouncy: 1, cluster: 1 },
    build(b) {
      const pi = b.platform({ x: 6, z: -2.6, w: 6, d: 5.2, y: 3.6, axis: 'y', range: 3, period: 8 });
      b.static('swood', 5.3, 0, -0.3, 0.5, 12, 0.6); b.static('swood', 12.2, 0, -0.3, 0.5, 12, 0.6);
      const base = 3.6 + 0.7;
      const y = b.tower({ x: 7, z: -2, w: 4, d: 4, rows: 7, y: base, mat: (r, s, i) => (r % 3 === 1 && i === 0 ? 'glass' : 'stone'), floors: [1] });
      roof(b, 7, -2, 4, 4, y);
      b.flag(9, b.lastFloors[0], 0, pi);
      b.barrel(8, base, 0);
      chamberKeep(b, { x: 22, z: -2, w: 4, d: 4, t: 1, base: 2, chamber: 3, cap: 3, windows: [1] });
      b.barrel(20, 0, 0);
    },
  },
  {
    name: 'The Great Wall', tip: 'Tap in flight to detonate a bomb early, or blast right through.', newAmmo: 'bomb',
    ammo: { bomb: 2, boulder: 3, rock: 2, cluster: 1 },
    build(b) {
      b.wall({ x: 5, z: -8, axis: 'z', len: 16, rows: 9, t: 2, mat: 'stone', crenel: true });
      chamberKeep(b, { x: 15, z: -3, base: 3, chamber: 4, cap: 5, windows: [1, 2] });
      b.barrel(10, 0, -2); b.barrel(10, 0, 2); b.barrel(12.5, 0, 0);
      const y2 = b.tower({ x: 28, z: -2, w: 4, d: 4, t: 2, rows: 8, mat: 'stone' });
      flagOn(b, 28, -2, 4, 4, y2, 'wood');
    },
  },
  {
    name: 'Sky Bridge', tip: 'Three flags. The bridge falls when its towers do.',
    ammo: { rock: 2, boulder: 3, bouncy: 1, cluster: 2, bomb: 2 },
    build(b) {
      const yA = b.tower({ x: 4, z: -2, w: 4, d: 4, t: 2, rows: 12, mat: 'stone' });
      const yB = b.tower({ x: 22, z: -2, w: 4, d: 4, t: 2, rows: 12, mat: 'stone' });
      roof(b, 4, -2, 4, 4, yA); roof(b, 22, -2, 4, 4, yB);
      const by = yA + 0.5;
      b.box('wood', 6, by, -1.2, 18, 0.8, 2.4);
      b.barrel(12, by + 0.8, 0); b.barrel(16, by + 0.8, 0); b.barrel(14, by + 0.8, 0.9);
      b.flag(4.9, by, 0); b.flag(25.1, by, 0); b.flag(14, by + 0.8, -0.8);
      b.pendulum({ x: 14, y: by - 0.2, z: 0, len: 5.2, r: 1.2, ang: 50, density: 5 });
      b.barrel(14, 0, 0); b.barrel(10, 0, 0); b.barrel(18, 0, 0);
    },
  },
  {
    name: 'Drifting Fortress', tip: 'The whole castle rides a moving platform.',
    ammo: { rock: 3, boulder: 3, cluster: 2, bomb: 2 },
    build(b) {
      const pi = b.platform({ x: 4, z: -4, w: 24, d: 8, y: 0.9, axis: 'x', range: 4, period: 13 });
      const base = 0.9 + 0.7;
      b.static('swood', 3, 0, -4, 0.6, 0.9, 8); b.static('swood', 30.4, 0, -4, 0.6, 0.9, 8);
      const yC = b.tower({ x: 13, z: -3, w: 6, d: 6, t: 2, rows: 9, y: base, floors: [3], mat: win([4, 5, 6], ['left', 'front', 'back']) });
      b.flag(16, b.lastFloors[0], 0, pi);
      roof(b, 13, -3, 6, 6, yC);
      const side = (x) => {
        const yy = b.tower({ x, z: -2, w: 4, d: 4, t: 1, rows: 7, y: base, floors: [1, 4], mat: win([3], ['left', 'front', 'back']) });
        b.flag(x + 2, b.lastFloors[0], 0, pi);
        roof(b, x, -2, 4, 4, yy);
      };
      side(6); side(22);
      b.barrel(11.5, base, 0); b.barrel(20.3, base, 0); b.barrel(20.3, base, 1.4);
    },
  },
  {
    name: "Dragon's Keep", tip: 'The final fortress. Use everything you have.',
    ammo: { rock: 2, boulder: 3, bouncy: 1, cluster: 2, bomb: 3 },
    build(b) {
      b.wall({ x: 3, z: -6, axis: 'z', len: 12, rows: 7, t: 2, mat: 'stone', crenel: true });
      for (const z of [-8.5, 4.5]) {
        chamberKeep(b, { x: 8, z, w: 4, d: 4, t: 1, base: 3, chamber: 3, cap: 3, windows: [1] });
      }
      chamberKeep(b, { x: 14, z: -3, w: 6, d: 6, t: 2, base: 4, chamber: 4, cap: 6, windows: [1, 2] });
      b.static('swood', 9.3, 9.6, -4.2, 1.2, 0.8, 8.4);
      b.pendulum({ x: 9.9, y: 9.6, z: 0, len: 4.6, r: 1.25, ang: 32, density: 5 });
      for (let i = 0; i < 5; i++) b.barrel(6.3, 0, -4 + i * 2);
      b.barrel(12.5, 0, -1); b.barrel(12.5, 0, 1);
      const pi = b.platform({ x: 26, z: -2.6, w: 6, d: 5.2, y: 3.6, axis: 'y', range: 3, period: 9 });
      b.static('swood', 25.3, 0, -0.3, 0.5, 13, 0.6); b.static('swood', 32.2, 0, -0.3, 0.5, 13, 0.6);
      const base = 3.6 + 0.7;
      const y2 = b.tower({ x: 27, z: -2, w: 4, d: 4, rows: 7, y: base, mat: (r, s, i) => (r % 3 === 1 && i === 0 ? 'glass' : 'wood') });
      roof(b, 27, -2, 4, 4, y2); b.flag(29, y2 + 0.5, 0, pi);
    },
  },
].map((L, i) => ({ id: i + 1, ...L }));

// A showy structure for the title screen backdrop.
export function buildDemo(ox = 16) {
  const b = new Builder(ox);
  const y = b.tower({ x: 8, z: -2, w: 4, d: 4, rows: 11, mat: (r, s, i) => (r % 3 === 1 && i === 0 ? 'glass' : r > 7 ? 'wood' : 'stone'), floors: [3, 7] });
  flagOn(b, 8, -2, 4, 4, y, 'wood');
  b.barrel(6.4, 0, 0); b.barrel(12.8, 0, 0);
  const y2 = scaffold(b, { x: 16, z: -1.8, w: 4.8, d: 3.6, levels: 2 });
  b.flag(18.4, y2, 0);
  b.barrel(17.5, 0, 0);
  b.wall({ x: 24, z: -3, axis: 'z', len: 6, rows: 4, t: 2, mat: 'stone' });
  return { level: { id: 0, name: 'Demo' }, blocks: b.blocks, flags: b.flags, pendulums: [], platforms: [], ox };
}

export const AMMO_UNLOCK_LEVEL = { rock: 1, boulder: 3, cluster: 5, bouncy: 7, bomb: 9 };

// Build the spec (pure data) for a level.
export function buildLevel(index, ox = 16) {
  const L = LEVELS[index];
  const b = new Builder(ox);
  L.build(b);
  return { level: L, blocks: b.blocks, flags: b.flags, pendulums: b.pendulums, platforms: b.platforms, ox };
}
