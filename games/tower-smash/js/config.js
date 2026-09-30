// Shared constants and tuning tables for Tower Smash.

export const GRAVITY = -18;      // a little stronger than Earth: snappier, less floaty
export const LANE = 15;          // half-width (z) of the physical play lane
export const CATAPULT_X = -32;   // catapult root position (on the left hill)
export const FIXED_DT = 1 / 60;

// Block materials. hp = damage capacity, thr = extra contact force (N) needed
// beyond the block's own static load before it takes damage, snd = force that
// is loud enough to trigger an impact sound.
export const MATS = {
  wood:  { density: 0.55, friction: 0.70, restitution: 0.12, hp: 260, thr: 900,  snd: 110, chip: 0xc48a4f, dust: 0xc9a273 },
  stone: { density: 2.30, friction: 0.85, restitution: 0.05, hp: 900, thr: 4000, snd: 400, chip: 0x9ea3a8, dust: 0xb9b4a8 },
  glass: { density: 0.90, friction: 0.30, restitution: 0.10, hp: 80,  thr: 300,  snd: 70,  chip: 0xbdeaff, dust: 0xdff6ff },
  tnt:   { density: 0.90, friction: 0.50, restitution: 0.15, hp: 130, thr: 1100, snd: 160, chip: 0xd8262b, dust: 0x555049 },
};

// Ammunition. All shots leave the catapult at the same speed for a given pull,
// so heavier ammo simply carries more momentum.
export const AMMO = {
  rock:    { name: 'Stone',   desc: 'Reliable all-rounder.',                    r: 0.55, density: 9,   restitution: 0.15, friction: 0.5, color: 0x8b8f96 },
  boulder: { name: 'Boulder', desc: 'Five times heavier. Crushes stone.',       r: 0.95, density: 9,   restitution: 0.08, friction: 0.6, color: 0x6f7178 },
  cluster: { name: 'Cluster', desc: 'Tap in flight to split into five.',        r: 0.55, density: 8,   restitution: 0.10, friction: 0.5, color: 0xe0a030 },
  bouncy:  { name: 'Bouncy',  desc: 'Ricochets through structures.',            r: 0.62, density: 4.5, restitution: 0.93, friction: 0.25, color: 0xe64a9c },
  bomb:    { name: 'Bomb',    desc: 'Explodes on impact. Tap to detonate.',     r: 0.62, density: 6,   restitution: 0.1,  friction: 0.5, color: 0x25262b },
};
export const AMMO_ORDER = ['rock', 'boulder', 'cluster', 'bouncy', 'bomb'];

export const LAUNCH = { minSpeed: 8, maxSpeed: 42, minAngle: 6, maxAngle: 82 };

// Graphics presets.
export const QUALITY = {
  low:    { pixelRatio: 1,   shadows: true,  shadowSize: 1024, bloom: false, msaa: 0, ao: false, rays: 0,  flare: false, grade: false, particles: 0.35, debris: 36,  grass: 0.08, trees: 0.22 },
  medium: { pixelRatio: 1.5, shadows: true,  shadowSize: 2048, bloom: true,  msaa: 0, ao: false, rays: 20, flare: true,  grade: true,  particles: 0.7,  debris: 80,  grass: 0.4,  trees: 0.55 },
  high:   { pixelRatio: 2,   shadows: true,  shadowSize: 4096, bloom: true,  msaa: 4, ao: true,  rays: 40, flare: true,  grade: true,  particles: 1,    debris: 150, grass: 1,    trees: 1 },
};

export function starsForShots(shots) {
  return shots <= 2 ? 3 : shots <= 4 ? 2 : 1;
}
