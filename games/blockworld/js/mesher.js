// Chunk mesher: visible faces only, per-vertex ambient occlusion + sky light + biome tint.
// Output is compact (Uint16 positions in 1/16 block units, Uint16 UVs, Uint8 colour+light).
import { CS, H, B, DEFS, OPAQUE, AOOCC, TRANSP, PLANT, LEAF, WATERB, TILES } from './blocks.js';
import { hash3 } from './noise.js';

const PW = CS + 2;
const PP = PW * PW;
const AO_LEVELS = [0.46, 0.64, 0.82, 1.0];
const EPS = 0.004;

const TILE_TOP = new Uint8Array(256), TILE_BOT = new Uint8Array(256), TILE_SIDE = new Uint8Array(256), TINT = new Uint8Array(256);
for (const d of DEFS) { if (!d) continue; TILE_TOP[d.id] = d.top; TILE_BOT[d.id] = d.bottom; TILE_SIDE[d.id] = d.side; TINT[d.id] = d.tint ? 1 : 0; }

// dir, corners BL BR TR TL, tangent1 (BL->BR), tangent2 (BL->TL), shade, tile selector
const FACES = [
  { d: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], t1: [0, 0, -1], t2: [0, 1, 0], shade: 0.72, sel: 2 },
  { d: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], t1: [0, 0, 1], t2: [0, 1, 0], shade: 0.72, sel: 2 },
  { d: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], t1: [1, 0, 0], t2: [0, 0, -1], shade: 1.0, sel: 0 },
  { d: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], t1: [1, 0, 0], t2: [0, 0, 1], shade: 0.5, sel: 1 },
  { d: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], t1: [1, 0, 0], t2: [0, 1, 0], shade: 0.86, sel: 2 },
  { d: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], t1: [-1, 0, 0], t2: [0, 1, 0], shade: 0.86, sel: 2 },
];
const SX = [-1, 1, 1, -1], SY = [-1, -1, 1, 1];

class Buf {
  constructor() {
    this.cap = 4096; this.n = 0; this.ni = 0;
    this.pos = new Uint16Array(this.cap * 3); this.uv = new Uint16Array(this.cap * 2);
    this.col = new Uint8Array(this.cap * 4); this.idx = new Uint32Array(this.cap * 3 / 2);
  }
  grow() {
    const c = this.cap * 2;
    const p = new Uint16Array(c * 3); p.set(this.pos); this.pos = p;
    const u = new Uint16Array(c * 2); u.set(this.uv); this.uv = u;
    const k = new Uint8Array(c * 4); k.set(this.col); this.col = k;
    const i = new Uint32Array(c * 3 / 2); i.set(this.idx); this.idx = i;
    this.cap = c;
  }
  vert(x, y, z, u, v, r, g, b, a) {
    if (this.n >= this.cap) this.grow();
    const n = this.n++;
    // +16 (one block) bias keeps Uint16 positive for plant quads that poke slightly outside the chunk
    this.pos[n * 3] = x + 16; this.pos[n * 3 + 1] = y + 16; this.pos[n * 3 + 2] = z + 16;
    this.uv[n * 2] = u; this.uv[n * 2 + 1] = v;
    this.col[n * 4] = r; this.col[n * 4 + 1] = g; this.col[n * 4 + 2] = b; this.col[n * 4 + 3] = a;
  }
  quad(flip) {
    const b = this.n - 4, i = this.ni;
    const ix = this.idx;
    if (!flip) { ix[i] = b; ix[i + 1] = b + 1; ix[i + 2] = b + 2; ix[i + 3] = b; ix[i + 4] = b + 2; ix[i + 5] = b + 3; }
    else { ix[i] = b + 1; ix[i + 1] = b + 2; ix[i + 2] = b + 3; ix[i + 3] = b + 1; ix[i + 4] = b + 3; ix[i + 5] = b; }
    this.ni += 6;
  }
  finish() {
    const n = this.n;
    const idx = n < 65536 ? new Uint16Array(this.idx.subarray(0, this.ni)) : this.idx.slice(0, this.ni);
    return { n, ni: this.ni, pos: this.pos.slice(0, n * 3), uv: this.uv.slice(0, n * 2), col: this.col.slice(0, n * 4), idx };
  }
}

const pad = new Uint8Array(PW * PW * (H + 2));
const topS = new Int16Array(PW * PW), topL = new Int16Array(PW * PW);
const tintCache = new Float32Array(CS * CS * 3);
const tintHas = new Uint8Array(CS * CS);
const ob = new Buf(), tb = new Buf();

function tintFor(terrain, wx, wz, lx, lz, out) {
  const k = lz * CS + lx;
  if (!tintHas[k]) {
    const { t, m } = terrain.climate(wx, wz);
    const sm = (a, b, x) => { const q = Math.min(1, Math.max(0, (x - a) / (b - a))); return q * q * (3 - 2 * q); };
    const wet = sm(0.5, 0.85, m), cold = sm(0.4, 0.15, t), hot = sm(0.5, 0.78, t) * (1 - wet * 0.5);
    tintCache[k * 3] = 1 - 0.22 * wet - 0.28 * cold - 0.0 * hot;
    tintCache[k * 3 + 1] = 1 - 0.14 * wet - 0.04 * cold - 0.14 * hot;
    tintCache[k * 3 + 2] = 1 - 0.30 * wet + 0.0 * cold - 0.55 * hot;
    tintHas[k] = 1;
  }
  out[0] = tintCache[k * 3]; out[1] = tintCache[k * 3 + 1]; out[2] = tintCache[k * 3 + 2];
}

export function meshChunk(cx, cz, chunks, terrain, useAO) {
  ob.n = ob.ni = 0; tb.n = tb.ni = 0;
  tintHas.fill(0);
  // ---- padded copy of the 3x3 neighbourhood (only 1 block border needed) ----
  pad.fill(0);
  pad.fill(3, 0, PP);                       // below the world reads as solid
  for (let y = 0; y < H; y++) {
    for (let pz = 0; pz < PW; pz++) {
      const dzc = pz === 0 ? -1 : pz === PW - 1 ? 1 : 0;
      const lz = pz === 0 ? CS - 1 : pz === PW - 1 ? 0 : pz - 1;
      const base = ((y + 1) * PW + pz) * PW;
      const mid = chunks[(dzc + 1) * 3 + 1];
      if (mid) pad.set(mid.subarray((y * CS + lz) * CS, (y * CS + lz) * CS + CS), base + 1);
      const l = chunks[(dzc + 1) * 3];
      if (l) pad[base] = l[(y * CS + lz) * CS + CS - 1];
      const r = chunks[(dzc + 1) * 3 + 2];
      if (r) pad[base + PW - 1] = r[(y * CS + lz) * CS];
    }
  }
  // ---- top-of-column maps for sky light ----
  let maxY = 0;
  for (let i = 0; i < PP; i++) {
    let ts = -1, tl = -1;
    for (let y = H - 1; y >= 0; y--) {
      const b = pad[(y + 1) * PP + i];
      if (b === 0) continue;
      if (tl < 0 && LEAF[b]) tl = y;
      if (OPAQUE[b]) { ts = y; break; }
    }
    topS[i] = ts; topL[i] = tl;
    const top = Math.max(ts, tl);
    if (top > maxY) maxY = top;
  }
  // water/glass can extend above solids
  for (let y = H - 1; y > maxY; y--) {
    for (let i = 0; i < PP; i++) if (pad[(y + 1) * PP + i]) { maxY = y; y = 0; break; }
  }
  maxY = Math.min(H - 1, maxY + 1);

  const own = (px, pz, y) => {
    const i = pz * PW + px;
    const ts = topS[i];
    let l = y > ts ? 1 : Math.max(0, 1 - (ts - y) * 0.17);
    if (topL[i] > y && l > 0.55) l = 0.55;
    return l;
  };
  const skyAt = (px, y, pz) => {
    let l = own(px, pz, y);
    if (l < 0.95) {
      const a = own(px > 0 ? px - 1 : px, pz, y), b = own(px < PW - 1 ? px + 1 : px, pz, y);
      const c = own(px, pz > 0 ? pz - 1 : pz, y), d = own(px, pz < PW - 1 ? pz + 1 : pz, y);
      const m = Math.max(a, b, c, d) * 0.78;
      if (m > l) l = m;
    }
    return l;
  };
  const at = (px, y, pz) => pad[((y + 1) * PW + pz) * PW + px];

  const wx0 = cx * CS, wz0 = cz * CS;
  const tint = [1, 1, 1];
  const seed = terrain.s;

  const uvTile = (tile) => {
    const c = tile % TILES, r = (tile / TILES) | 0;
    U0 = ((c + EPS) / TILES * 65535) | 0; U1 = ((c + 1 - EPS) / TILES * 65535) | 0;
    V0 = ((r + EPS) / TILES * 65535) | 0; V1 = ((r + 1 - EPS) / TILES * 65535) | 0;
  };
  let U0 = 0, U1 = 0, V0 = 0, V1 = 0;
  const aoV = [0, 0, 0, 0], skyV = [0, 0, 0, 0];

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const px = x + 1, pz = z + 1;
        const pi = ((y + 1) * PW + pz) * PW + px;
        const b = pad[pi];
        if (b === 0) continue;

        if (PLANT[b]) {
          uvTile(TILE_TOP[b]);
          let sh = 0.92, tr = 1, tg = 1, tb2 = 1;
          if (TINT[b]) { tintFor(terrain, wx0 + x, wz0 + z, x, z, tint); tr = tint[0]; tg = tint[1]; tb2 = tint[2]; }
          const sky = skyAt(px, y, pz);
          const sk = Math.round(sky * 63);
          const jx = (hash3(wx0 + x, y, wz0 + z, seed) - 0.5) * 0.3, jz = (hash3(wx0 + x, y + 3, wz0 + z, seed + 1) - 0.5) * 0.3;
          const r = Math.round(255 * sh * tr), g = Math.round(255 * sh * tg), bl = Math.round(255 * sh * tb2);
          const X = (x + 0.5 + jx) * 16, Z = (z + 0.5 + jz) * 16, Y = y * 16;
          const d = 0.46 * 16, hgt = (b === B.TALLGRASS ? 0.95 : 0.9) * 16;
          // two crossed quads, drawn twice (both sides)
          for (let k = 0; k < 2; k++) {
            const [ax, az, bx, bz] = k === 0 ? [-d, -d, d, d] : [d, -d, -d, d];
            for (let side = 0; side < 2; side++) {
              const s0x = side ? bx : ax, s0z = side ? bz : az, s1x = side ? ax : bx, s1z = side ? az : bz;
              ob.vert(X + s0x, Y, Z + s0z, U0, V1, r, g, bl, sk);
              ob.vert(X + s1x, Y, Z + s1z, U1, V1, r, g, bl, sk);
              ob.vert(X + s1x, Y + hgt, Z + s1z, U1, V0, r, g, bl, sk + 64);
              ob.vert(X + s0x, Y + hgt, Z + s0z, U0, V0, r, g, bl, sk + 64);
              ob.quad(false);
            }
          }
          continue;
        }

        const isOpq = OPAQUE[b], isLeaf = LEAF[b], isWater = WATERB[b];
        const buf = (isOpq || isLeaf) ? ob : tb;
        const jit = 0.94 + 0.06 * hash3(wx0 + x, y, wz0 + z, seed + 17);
        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nx = px + F.d[0], ny = y + F.d[1], nz = pz + F.d[2];
          const nb = at(nx, ny, nz);
          let vis;
          if (isOpq) vis = !OPAQUE[nb];
          else if (isLeaf) vis = !OPAQUE[nb] && !LEAF[nb];
          else if (isWater) vis = !TRANSP[nb] && !OPAQUE[nb];
          else vis = nb !== b && !OPAQUE[nb];
          if (!vis) continue;

          const tile = F.sel === 0 ? TILE_TOP[b] : F.sel === 1 ? TILE_BOT[b] : TILE_SIDE[b];
          uvTile(tile);
          let tr = 1, tg = 1, tbl = 1;
          if (TINT[b] && (F.sel === 0 || isLeaf)) {
            tintFor(terrain, wx0 + x, wz0 + z, x, z, tint); tr = tint[0]; tg = tint[1]; tbl = tint[2];
            if (isLeaf) { tr *= 0.92; tg *= 0.92; tbl *= 0.92; }
          } else if (TINT[b]) {
            tintFor(terrain, wx0 + x, wz0 + z, x, z, tint);
            tr = 0.5 + 0.5 * tint[0]; tg = 0.5 + 0.5 * tint[1]; tbl = 0.5 + 0.5 * tint[2];
          }
          const base = F.shade * jit;

          if (isOpq || isLeaf) {
            for (let k = 0; k < 4; k++) {
              const sx = SX[k], sy = SY[k];
              const ax = nx + sx * F.t1[0], ay = ny + sx * F.t1[1], az = nz + sx * F.t1[2];
              const bx = nx + sy * F.t2[0], by = ny + sy * F.t2[1], bz = nz + sy * F.t2[2];
              const cx2 = ax + sy * F.t2[0], cy2 = ay + sy * F.t2[1], cz2 = az + sy * F.t2[2];
              const sa = at(ax, ay, az), sb = at(bx, by, bz), sc = at(cx2, cy2, cz2);
              let ao = 3;
              if (useAO) {
                const o1 = AOOCC[sa], o2 = AOOCC[sb];
                ao = (o1 && o2) ? 0 : 3 - (o1 + o2 + AOOCC[sc]);
              }
              let l = skyAt(nx, ny, nz), c = 1;
              if (!OPAQUE[sa]) { l += skyAt(ax, ay, az); c++; }
              if (!OPAQUE[sb]) { l += skyAt(bx, by, bz); c++; }
              if (!OPAQUE[sc] && !(OPAQUE[sa] && OPAQUE[sb])) { l += skyAt(cx2, cy2, cz2); c++; }
              aoV[k] = AO_LEVELS[ao]; skyV[k] = l / c;
            }
            const flip = aoV[0] + aoV[2] < aoV[1] + aoV[3];
            for (let k = 0; k < 4; k++) {
              const cc = F.c[k];
              const br = base * aoV[k];
              const u = (k === 0 || k === 3) ? U0 : U1, v = (k < 2) ? V1 : V0;
              buf.vert((x + cc[0]) * 16, (y + cc[1]) * 16, (z + cc[2]) * 16, u, v,
                Math.min(255, (255 * br * tr) | 0), Math.min(255, (255 * br * tg) | 0), Math.min(255, (255 * br * tbl) | 0),
                Math.round(skyV[k] * 63));
            }
            buf.quad(flip);
          } else {
            // glass / ice / water: flat lighting, no AO
            const sky = Math.round(skyAt(nx, ny, nz) * 63);
            let top = 16;
            let waterTop = false;
            if (isWater) {
              const above = at(px, y + 1, pz);
              if (!WATERB[above]) { top = 14; waterTop = true; }
            }
            const br = isWater ? Math.min(255, (255 * F.shade) | 0) : Math.min(255, (255 * base) | 0);
            for (let k = 0; k < 4; k++) {
              const cc = F.c[k];
              const u = (k === 0 || k === 3) ? U0 : U1, v = (k < 2) ? V1 : V0;
              let yy = (y + cc[1]) * 16, flag = 0;
              if (isWater) { if (cc[1] === 1) { yy = y * 16 + top; flag = waterTop ? 2 : 3; } else flag = 3; }
              buf.vert((x + cc[0]) * 16, yy, (z + cc[2]) * 16, u, v, br, br, br, sky + flag * 64);
            }
            buf.quad(false);
          }
        }
      }
    }
  }
  // merge: opaque geometry first, blended geometry second -> one mesh, two draw groups
  const on = ob.n, tn = tb.n, n = on + tn;
  const pos = new Uint16Array(n * 3), uv = new Uint16Array(n * 2), col = new Uint8Array(n * 4);
  pos.set(ob.pos.subarray(0, on * 3)); pos.set(tb.pos.subarray(0, tn * 3), on * 3);
  uv.set(ob.uv.subarray(0, on * 2)); uv.set(tb.uv.subarray(0, tn * 2), on * 2);
  col.set(ob.col.subarray(0, on * 4)); col.set(tb.col.subarray(0, tn * 4), on * 4);
  const idx = n < 65536 ? new Uint16Array(ob.ni + tb.ni) : new Uint32Array(ob.ni + tb.ni);
  idx.set(ob.idx.subarray(0, ob.ni));
  for (let i = 0; i < tb.ni; i++) idx[ob.ni + i] = tb.idx[i] + on;
  return { cx, cz, maxY, n, pos, uv, col, idx, oCount: ob.ni, tCount: tb.ni };
}
