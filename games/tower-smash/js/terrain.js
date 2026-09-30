// The valley profile. Inside the play lane the ground is a piecewise-linear
// extrusion of PROFILE along z, so the physics slabs match the visuals exactly.
import { LANE } from './config.js';

// [x, y] pairs. Left: catapult hill. Middle: river valley. Right: castle plateau.
export const PROFILE = [
  [-220, 30], [-130, 16], [-78, 6], [-26, 6], [-12, -1.5],
  [-3, -1.5], [13, 3], [78, 3], [116, 10], [220, 28],
];
export const WATER_Y = -0.35;
export const PLATEAU_Y = 3;
export const HILL_Y = 6;

export function groundY(x) {
  const P = PROFILE;
  if (x <= P[0][0]) return P[0][1];
  for (let i = 1; i < P.length; i++) {
    if (x <= P[i][0]) {
      const [x0, y0] = P[i - 1], [x1, y1] = P[i];
      return y0 + (y1 - y0) * (x - x0) / (x1 - x0);
    }
  }
  return P[P.length - 1][1];
}

const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };

// cheap smooth value noise
function hash(i, j) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = smooth(x - i), fz = smooth(z - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Visual terrain height (lane is exact; outside the lane it rolls into hills).
export function terrainHeight(x, z) {
  const out = Math.abs(z) - LANE;
  const t = smooth(out / 14);
  const shift = t * (Math.sin(z * 0.05) * 9 + Math.sin(z * 0.021 + 1) * 6);
  let h = groundY(x - shift);
  const n = vnoise(x * 0.06, z * 0.06) * 2 + vnoise(x * 0.18, z * 0.18) * 0.5;
  h += (n - 1.2) * t * 1.6;
  // hills rise behind/in front of the lane, but leave the river channel open
  const vc = -7.5 + shift;
  const mask = 1 - 0.97 * (1 - smooth((Math.abs(x - vc) - 9) / 30));
  if (z < -LANE) h += smooth((-z - LANE) / 70) * (10 + vnoise(x * 0.03, z * 0.03) * 12) * mask;
  else h += smooth((z - LANE - 6) / 40) * (2 + vnoise(x * 0.04, z * 0.04) * 3) * mask;
  return h;
}
