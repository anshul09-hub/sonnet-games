// Terrain generation: climate -> smoothly blended biomes -> height, caves, ores, trees, flowers.
import { CS, H, SEA, SZ, B, idx } from './blocks.js';
import { Simplex, hashStr, hash2 } from './noise.js';

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function smooth(e0, e1, x) { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); }

export const BIOME = { PLAINS: 0, FOREST: 1, SNOW: 2, DESERT: 3 };
export const BIOME_NAMES = ['Plains', 'Forest', 'Snowy Mountains', 'Desert'];
const BORDER = 4;
const CW = CS + BORDER * 2;

export class Terrain {
  constructor(seed) {
    this.seed = String(seed);
    const s = hashStr(this.seed);
    this.s = s;
    const mk = k => new Simplex((s + Math.imul(k, 0x9E3779B1)) >>> 0);
    this.nT = mk(1); this.nM = mk(2); this.nH = mk(3); this.nR = mk(4); this.nD = mk(5); this.nL = mk(6);
    this.nC1 = mk(7); this.nC2 = mk(8); this.nC3 = mk(9); this.nO = mk(10); this.nX = mk(11); this.nJ = mk(12);
    // scratch for column info
    this.col = { h: 0, biome: 0, top: 0, t: 0, m: 0, wS: 0, wD: 0, wF: 0, wP: 0 };
  }

  climate(x, z, out) {
    const t = clamp(0.5 + 1.25 * this.nT.fbm2(x * 0.0034, z * 0.0034, 3), 0, 1);
    const m = clamp(0.5 + 1.25 * this.nM.fbm2(x * 0.0034 + 500, z * 0.0034 - 300, 3), 0, 1);
    if (out) { out.t = t; out.m = m; return out; }
    return { t, m };
  }

  // Fill `o` with height/biome info for a world column.
  column(x, z, o) {
    this.climate(x, z, o);
    const t = o.t, m = o.m;
    const wS = smooth(0.31, 0.20, t);
    const wD = smooth(0.60, 0.72, t) * smooth(0.55, 0.42, m);
    const wF = smooth(0.52, 0.66, m) * (1 - wS) * (1 - wD);
    let wP = Math.max(0.03, 1 - wS - wD - wF);
    const sum = wS + wD + wF + wP;
    const ns = 1 / sum;
    o.wS = wS * ns; o.wD = wD * ns; o.wF = wF * ns; o.wP = wP * ns;

    const n = this.nH.fbm2(x * 0.006, z * 0.006, 4);
    const det = this.nX.noise2(x * 0.05, z * 0.05);
    const hP = SEA + 3 + n * 5 + det * 0.8;
    const hF = SEA + 5 + n * 8 + det * 1.2;
    const d1 = 1 - Math.abs(this.nD.noise2(x * 0.011 + z * 0.004, z * 0.019 - x * 0.006));
    const hD = SEA + 3 + n * 3 + d1 * d1 * 11 + det * 0.4;
    const r = 1 - Math.abs(this.nR.fbm2(x * 0.0075, z * 0.0075, 3) * 1.6);
    const rr = clamp(r, 0, 1);
    const hS = SEA + 6 + rr * rr * 58 + n * 7 + det * 2.2;
    let h = o.wP * hP + o.wF * hF + o.wD * hD + o.wS * hS;

    // lakes: smooth basins carved below sea level
    const ln = this.nL.fbm2(x * 0.0075 - 200, z * 0.0075 + 90, 2);
    const lm = smooth(0.30, 0.50, ln) * (1 - o.wS * 0.9);
    if (lm > 0) {
      const floor = SEA - 2 - Math.min(7, (ln - 0.3) * 14);
      h = lerp(h, Math.min(h, floor), lm);
    }
    h = Math.floor(clamp(h, 6, H - 10));
    o.h = h;

    // biome by dithered argmax => soft ragged transitions
    const j = this.nJ.noise2(x * 0.09, z * 0.09) * 0.14;
    let best = BIOME.PLAINS, bv = o.wP + j;
    if (o.wF + j * 0.7 > bv) { best = BIOME.FOREST; bv = o.wF + j * 0.7; }
    if (o.wD + j > bv) { best = BIOME.DESERT; bv = o.wD + j; }
    if (o.wS + j > bv) { best = BIOME.SNOW; bv = o.wS + j; }
    o.biome = best;
    // surface block
    let top = B.GRASS;
    if (best === BIOME.DESERT) top = B.SAND;
    else if (best === BIOME.SNOW) {
      const rock = this.nJ.noise2(x * 0.045 + 90, z * 0.045) + (h - 52) / 26;
      top = (h >= 80) ? B.SNOW : (rock > 0.55 ? B.STONE : B.SNOW);
    }
    if (h <= SEA + 1) top = best === BIOME.SNOW ? B.GRAVEL : B.SAND;
    o.top = top;
    return o;
  }

  // Cave test (spaghetti tunnels + deeper caverns)
  cave(x, y, z, h) {
    const depth = h - y;
    if (depth < 1 || y < 4) return false;
    if (h <= SEA + 1 && y > SEA - 9) return false;
    const thr = 0.078 * (depth < 7 ? 0.28 + 0.72 * (depth / 7) : 1) * (y < 22 ? 1.2 : 1);
    const a = this.nC1.noise3(x * 0.021, y * 0.034, z * 0.021);
    if (a > -thr && a < thr) {
      const b = this.nC2.noise3(x * 0.021 + 31.7, y * 0.034 + 11.3, z * 0.021 + 7.1);
      if (b > -thr && b < thr) return true;
    }
    if (y < 30 && this.nC3.noise3(x * 0.014, y * 0.024, z * 0.014) > 0.6) return true;
    return false;
  }

  generate(cx, cz, edits) {
    const data = new Uint8Array(SZ);
    const x0 = cx * CS, z0 = cz * CS;
    const seed = this.s;
    // column info incl. border for trees
    const hs = new Int16Array(CW * CW), bio = new Uint8Array(CW * CW), tops = new Uint8Array(CW * CW);
    const o = this.col;
    for (let z = 0; z < CW; z++) for (let x = 0; x < CW; x++) {
      this.column(x0 + x - BORDER, z0 + z - BORDER, o);
      const i = z * CW + x;
      hs[i] = o.h; bio[i] = o.biome; tops[i] = o.top;
    }
    const cold = new Uint8Array(CW * CW);
    for (let i = 0; i < CW * CW; i++) cold[i] = 0;

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const ci = (z + BORDER) * CW + (x + BORDER);
      const h = hs[ci], top = tops[ci], biome = bio[ci];
      const wx = x0 + x, wz = z0 + z;
      let fill = 3, under = B.DIRT;
      if (top === B.SAND) { fill = biome === BIOME.DESERT ? 5 : 3; under = biome === BIOME.DESERT ? B.SANDSTONE : B.DIRT; }
      else if (top === B.GRAVEL) { fill = 3; under = B.STONE; }
      else if (top === B.SNOW) { fill = 2; under = B.SNOW; }
      else if (top === B.STONE) { fill = 0; under = B.STONE; }
      else fill = 3 + (hash2(wx, wz, seed) * 1.99 | 0);
      const dither = hash2(wx, wz, seed + 7);
      for (let y = 0; y <= h; y++) {
        const i = idx(x, y, z);
        if (y === 0) { data[i] = B.BEDROCK; continue; }
        if (y < 3 && dither < (3 - y) * 0.3) { data[i] = B.BEDROCK; continue; }
        const d = h - y;
        let b;
        if (d === 0) b = top;
        else if (d <= fill) b = under === B.SANDSTONE && d > 3 ? B.SANDSTONE : (top === B.SAND && biome === BIOME.DESERT ? B.SAND : under);
        else b = B.STONE;
        if (b === B.STONE || b === B.DIRT || b === B.SAND || b === B.SANDSTONE) {
          if (this.cave(wx, y, wz, h)) { continue; }
          if (b === B.STONE && y < 72) {
            const on = this.nO.noise3(wx * 0.09, y * 0.09, wz * 0.09);
            if (on > 0.68) b = B.COAL; else if (on < -0.72 && y < 56) b = B.GRAVEL;
          }
        }
        data[i] = b;
      }
      // water & ice
      if (h < SEA) {
        for (let y = h + 1; y <= SEA; y++) data[idx(x, y, z)] = B.WATER;
        if (biome === BIOME.SNOW || this.climate(wx, wz).t < 0.33) data[idx(x, SEA, z)] = B.ICE;
      }
    }

    // trees / cacti (deterministic per world column, so they cross chunk borders)
    const inChunk = (x, z) => x >= 0 && x < CS && z >= 0 && z < CS;
    const trees = [];
    for (let tz = -3; tz < CS + 3; tz++) for (let tx = -3; tx < CS + 3; tx++) {
      const ci = (tz + BORDER) * CW + (tx + BORDER);
      const h = hs[ci];
      if (h <= SEA + 1 || h > H - 16) continue;
      const wx = x0 + tx, wz = z0 + tz;
      const biome = bio[ci], top = tops[ci];
      const r = hash2(wx, wz, seed + 101);
      let chance = 0;
      if (biome === BIOME.FOREST && top === B.GRASS) chance = 0.052;
      else if (biome === BIOME.PLAINS && top === B.GRASS) chance = 0.004;
      else if (biome === BIOME.SNOW && top === B.SNOW && h < 70) chance = 0.014;
      else if (biome === BIOME.DESERT && top === B.SAND) chance = 0.0055;
      if (r >= chance) continue;
      if (biome === BIOME.DESERT) trees.push({ tx, tz, h, cactus: true, n: 1 + (hash2(wx, wz, seed + 5) * 3 | 0) });
      else trees.push({ tx, tz, h, n: 4 + (hash2(wx, wz, seed + 5) * 3 | 0), snow: biome === BIOME.SNOW, wx, wz });
    }
    for (const t of trees) {
      if (t.cactus) {
        for (let i = 1; i <= t.n; i++) if (inChunk(t.tx, t.tz)) data[idx(t.tx, t.h + i, t.tz)] = B.CACTUS;
      } else if (inChunk(t.tx, t.tz)) {
        for (let i = 1; i <= t.n; i++) data[idx(t.tx, t.h + i, t.tz)] = B.LOG;
      }
    }
    for (const t of trees) {
      if (t.cactus) continue;
      const top = t.h + t.n;
      for (let ly = top - 2; ly <= top + 1; ly++) {
        const rad = ly >= top + 1 ? 1 : 2;
        for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
          const x = t.tx + dx, z = t.tz + dz;
          if (!inChunk(x, z)) continue;
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && (ly >= top + 1 || hash2(t.wx + dx, t.wz + dz + ly * 31, seed + 9) < 0.5)) continue;
          if (ly < top - 1 && dx === 0 && dz === 0) continue;
          const i = idx(x, ly, z);
          if (data[i] === B.AIR) data[i] = B.LEAVES;
        }
      }
    }

    // flowers + tall grass
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const ci = (z + BORDER) * CW + (x + BORDER);
      if (tops[ci] !== B.GRASS) continue;
      const h = hs[ci];
      if (h <= SEA) continue;
      const i = idx(x, h + 1, z);
      if (data[i] !== B.AIR) continue;
      const wx = x0 + x, wz = z0 + z;
      const r = hash2(wx, wz, seed + 33);
      const patch = this.nX.noise2(wx * 0.11, wz * 0.11) > 0.5;
      const biome = bio[ci];
      if (r < (patch ? 0.32 : 0.010)) data[i] = hash2(wx, wz, seed + 34) < 0.5 ? B.FLOWER_R : B.FLOWER_Y;
      else if (r < (biome === BIOME.FOREST ? 0.10 : 0.16) + (patch ? 0.3 : 0)) data[i] = B.TALLGRASS;
    }

    if (edits) for (let i = 0; i < edits.length; i++) { const e = edits[i]; data[e >> 5] = e & 31; }
    return data;
  }
}

const cache = new Map();
export function getTerrain(seed) {
  let t = cache.get(seed);
  if (!t) { if (cache.size > 3) cache.clear(); t = new Terrain(seed); cache.set(seed, t); }
  return t;
}
