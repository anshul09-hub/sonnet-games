// All art is painted in code: one 256x256 texture atlas (16x16 tiles of 16px) plus a few small canvases.
import * as THREE from 'three';
import { T, TILES, TILE_PX, DEFS } from './blocks.js';
import { mulberry32 } from './noise.js';

const AW = TILES * TILE_PX; // 256
const rnd = mulberry32(90210);
const clamp8 = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;

export function buildAtlas() {
  const px = new Uint8ClampedArray(AW * AW * 4);
  const put = (t, x, y, c, a = 255) => {
    if (x < 0 || y < 0 || x >= 16 || y >= 16) return;
    const ox = (t % TILES) * TILE_PX + x, oy = ((t / TILES) | 0) * TILE_PX + y;
    const i = (oy * AW + ox) * 4;
    px[i] = clamp8(c[0]); px[i + 1] = clamp8(c[1]); px[i + 2] = clamp8(c[2]); px[i + 3] = a;
  };
  const get = (t, x, y) => {
    const ox = (t % TILES) * TILE_PX + x, oy = ((t / TILES) | 0) * TILE_PX + y;
    const i = (oy * AW + ox) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]];
  };
  const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
  const vary = (c, v) => mul(c, 1 + (rnd() - 0.5) * 2 * v);
  const each = (t, fn) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const r = fn(x, y); if (r) put(t, x, y, r[0], r[1]); } };
  const noisy = (t, base, v, specks = 0.1) => each(t, () => {
    let k = 1 + (rnd() - 0.5) * 2 * v; const r = rnd();
    if (r < specks) k *= 0.82; else if (r > 1 - specks * 0.6) k *= 1.14;
    return [mul(base, k)];
  });

  // grass top
  noisy(T.GRASS_TOP, [100, 172, 54], 0.1, 0.12);
  // dirt
  noisy(T.DIRT, [134, 96, 66], 0.09, 0.12);
  for (let i = 0; i < 9; i++) { const x = rnd() * 15 | 0, y = rnd() * 15 | 0; put(T.DIRT, x, y, [168, 128, 96]); put(T.DIRT, x + 1, y, [110, 76, 50]); }
  // grass side
  each(T.GRASS_SIDE, (x, y) => [get(T.DIRT, x, y)]);
  for (let x = 0; x < 16; x++) {
    const depth = 3 + (rnd() < 0.5 ? 1 : 0) + (rnd() < 0.25 ? 1 : 0);
    for (let y = 0; y < depth; y++) put(T.GRASS_SIDE, x, y, get(T.GRASS_TOP, x, y));
    put(T.GRASS_SIDE, x, depth, mul(get(T.GRASS_TOP, x, depth), 0.78));
  }
  // stone
  noisy(T.STONE, [126, 126, 128], 0.07, 0.14);
  for (let i = 0; i < 4; i++) { let x = rnd() * 14 | 0, y = rnd() * 14 | 0; for (let k = 0; k < 4; k++) { put(T.STONE, x, y, [92, 92, 96]); x += rnd() < 0.6 ? 1 : 0; y += rnd() < 0.4 ? 1 : 0; } }
  // sand
  noisy(T.SAND, [221, 208, 145], 0.045, 0.1);
  // gravel: blobs of different greys
  each(T.GRAVEL, () => [mul([132, 128, 126], 0.9 + rnd() * 0.2)]);
  for (let i = 0; i < 22; i++) {
    const cx = rnd() * 16 | 0, cy = rnd() * 16 | 0, w = 2 + (rnd() * 2 | 0), c = mul(rnd() < 0.3 ? [150, 140, 128] : [118, 116, 118], 0.85 + rnd() * 0.3);
    for (let y = 0; y < w; y++) for (let x = 0; x < w + 1; x++) put(T.GRAVEL, (cx + x) & 15, (cy + y) & 15, mul(c, x === 0 || y === w - 1 ? 0.8 : 1));
  }
  // logs
  const colK = Array.from({ length: 16 }, () => 0.82 + rnd() * 0.3);
  each(T.LOG_SIDE, (x) => [mul([104, 82, 50], colK[x] * (0.95 + rnd() * 0.1))]);
  for (let i = 0; i < 3; i++) { const x = rnd() * 15 | 0, y = rnd() * 14 | 0; put(T.LOG_SIDE, x, y, [58, 42, 26]); put(T.LOG_SIDE, x, y + 1, [58, 42, 26]); }
  each(T.LOG_TOP, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.6) return [mul([104, 82, 50], 0.9 + rnd() * 0.15)];
    const ring = Math.floor(d / 1.4) % 2;
    return [mul(ring ? [150, 116, 68] : [174, 140, 86], 0.95 + rnd() * 0.1)];
  });
  // leaves (cut-out)
  each(T.LEAVES, () => {
    const r = rnd();
    if (r < 0.2) return [[0, 0, 0], 0];
    return [mul([70, 150, 44], 0.7 + rnd() * 0.5)];
  });
  // water icon tile
  each(T.WATER, () => [vary([40, 100, 200], 0.08), 190]);
  // snow
  each(T.SNOW, () => [mul([246, 249, 253], 0.955 + rnd() * 0.05)]);
  for (let i = 0; i < 10; i++) put(T.SNOW, rnd() * 16 | 0, rnd() * 16 | 0, [214, 226, 240]);
  // planks
  each(T.PLANKS, (x, y) => {
    const board = y >> 2;
    let k = 0.94 + ((board * 37 + (x >> 2) * 11) % 5) * 0.02 + (rnd() - 0.5) * 0.05;
    if ((y & 3) === 3) k *= 0.68;
    const joint = (board * 7 + 3) & 15;
    if (x === joint && (y & 3) !== 3) k *= 0.72;
    return [mul([178, 140, 82], k)];
  });
  // cobblestone: voronoi cells
  const seeds = Array.from({ length: 9 }, () => [rnd() * 16, rnd() * 16, 0.75 + rnd() * 0.4]);
  each(T.COBBLE, (x, y) => {
    let d1 = 1e9, d2 = 1e9, s1 = null;
    for (const s of seeds) for (const ox of [-16, 0, 16]) for (const oy of [-16, 0, 16]) {
      const d = Math.hypot(x - s[0] - ox, y - s[1] - oy);
      if (d < d1) { d2 = d1; d1 = d; s1 = s; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1 < 1.1;
    return [mul([128, 126, 126], edge ? 0.5 : s1[2] * (0.94 + rnd() * 0.1))];
  });
  // glass
  each(T.GLASS, (x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    if (border) return [[214, 236, 244], 235];
    if ((x + y === 5 || x + y === 6 || x + y === 11) && x > 1 && y > 1) return [[240, 250, 255], 190];
    return [[190, 225, 240], 38];
  });
  // TNT
  each(T.TNT_SIDE, (x, y) => {
    if (y >= 5 && y <= 10) return [mul([236, 230, 218], 0.96 + rnd() * 0.06)];
    let k = 1 + (rnd() - 0.5) * 0.1;
    if (y === 4 || y === 11) k *= 0.72;
    if (x === 0 || x === 15) k *= 0.88;
    return [mul([204, 42, 32], k)];
  });
  const glyph = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '101', '101'] };
  [['T', 3], ['N', 7], ['T', 11]].forEach(([g, x0]) => glyph[g].forEach((row, gy) => [...row].forEach((c, gx) => { if (c === '1') put(T.TNT_SIDE, x0 + gx, 5 + gy, [64, 34, 30]); })));
  each(T.TNT_TOP, (x, y) => {
    const edge = x < 2 || y < 2 || x > 13 || y > 13;
    if (edge) return [mul([190, 44, 34], 0.9 + rnd() * 0.15)];
    if (x >= 7 && x <= 8 && y >= 7 && y <= 8) return [[50, 38, 30]];
    return [mul([206, 178, 132], 0.92 + rnd() * 0.1)];
  });
  each(T.TNT_BOTTOM, () => [mul([172, 38, 30], 0.92 + rnd() * 0.14)]);
  // bedrock
  each(T.BEDROCK, () => { const k = 0.4 + rnd() * 0.8; return [mul([62, 62, 66], k)]; });
  // sandstone
  each(T.SANDSTONE_SIDE, (x, y) => {
    let k = 0.97 + (rnd() - 0.5) * 0.06;
    if (y === 4 || y === 5) k *= 0.9; if (y === 12) k *= 1.06; if (y === 0) k *= 0.88;
    return [mul([218, 202, 150], k)];
  });
  each(T.SANDSTONE_TOP, (x, y) => { let k = 0.98 + (rnd() - 0.5) * 0.05; if (x === 0 || y === 0) k *= 0.93; return [mul([222, 208, 154], k)]; });
  // coal ore
  each(T.COAL, (x, y) => [get(T.STONE, x, y)]);
  for (let i = 0; i < 6; i++) {
    const cx = 1 + (rnd() * 12 | 0), cy = 1 + (rnd() * 12 | 0), w = 2 + (rnd() * 2 | 0), h = 2 + (rnd() * 2 | 0);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) put(T.COAL, cx + x, cy + y, mul([26, 26, 30], 0.8 + rnd() * 0.5));
    put(T.COAL, cx, cy, [70, 70, 78]);
  }
  // flowers & grass (cut-out)
  const clear = (t) => each(t, () => [[0, 0, 0], 0]);
  const flower = (t, petal, dark, center) => {
    clear(t);
    for (let y = 7; y < 16; y++) put(t, 7, y, mul([60, 142, 44], 0.85 + rnd() * 0.3));
    put(t, 8, 11, [70, 160, 50]); put(t, 9, 10, [70, 160, 50]); put(t, 6, 13, [70, 160, 50]); put(t, 5, 12, [70, 160, 50]);
    for (let y = 3; y <= 6; y++) for (let x = 5; x <= 9; x++) {
      if ((x === 5 || x === 9) && (y === 3 || y === 6)) continue;
      put(t, x, y, ((x + y) & 1) ? petal : dark);
    }
    put(t, 7, 4, center); put(t, 7, 5, center); put(t, 6, 4, center);
  };
  flower(T.FLOWER_R, [214, 40, 44], [172, 26, 34], [250, 226, 70]);
  flower(T.FLOWER_Y, [252, 218, 44], [226, 176, 30], [235, 130, 30]);
  clear(T.TALLGRASS);
  for (let x = 1; x < 15; x++) {
    if (rnd() < 0.25) continue;
    const h = 5 + (rnd() * 9 | 0), lean = rnd() < 0.5 ? 0 : (rnd() < 0.5 ? -1 : 1);
    for (let i = 0; i < h; i++) {
      const y = 15 - i, xx = x + (i > h * 0.55 ? lean : 0);
      put(T.TALLGRASS, xx, y, mul([84, 158, 46], 0.78 + (i / h) * 0.45 + (rnd() - 0.5) * 0.1));
    }
  }
  // cactus
  each(T.CACTUS_SIDE, (x, y) => {
    let k = 0.95 + (rnd() - 0.5) * 0.1;
    if (x === 0 || x === 15) k *= 0.72; else if (x === 1 || x === 14) k *= 0.88;
    if (x === 5 || x === 10) k *= 0.88;
    return [mul([62, 132, 52], k)];
  });
  [[3, 3], [3, 11], [8, 7], [12, 4], [12, 12], [8, 14], [6, 1]].forEach(([x, y]) => { put(T.CACTUS_SIDE, x, y, [214, 232, 188]); put(T.CACTUS_SIDE, x + 1, y, [160, 190, 130]); });
  each(T.CACTUS_TOP, (x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    return [mul(d > 6.6 ? [46, 108, 40] : d > 3.2 ? [76, 158, 62] : [60, 132, 50], 0.94 + rnd() * 0.1)];
  });
  // bricks
  each(T.BRICK, (x, y) => {
    const row = y >> 2;
    if ((y & 3) === 3) return [mul([188, 182, 170], 0.9 + rnd() * 0.1)];
    const jx = (row & 1) ? 4 : 0;
    if (((x + jx) & 7) === 7) return [mul([188, 182, 170], 0.9 + rnd() * 0.1)];
    return [mul([152, 68, 52], 0.88 + ((row * 3 + ((x + jx) >> 3)) % 3) * 0.07 + rnd() * 0.06)];
  });
  // ice
  each(T.ICE, (x, y) => {
    let k = 0.96 + rnd() * 0.06, c = [156, 204, 242];
    if (((x + y * 2) % 11) === 0) c = [220, 238, 252];
    if (((x * 3 + y) % 17) === 2) k *= 0.9;
    return [mul(c, k), 168];
  });

  // ---- mip chain (alpha-weighted so cut-out leaves don't turn dark) ----
  const mips = [];
  let cur = { data: new Uint8Array(px.buffer.slice(0)), width: AW, height: AW };
  mips.push(cur);
  for (let lv = 1; lv <= 4; lv++) {
    const nw = cur.width >> 1, nh = cur.height >> 1, out = new Uint8Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = ((y * 2 + dy) * cur.width + x * 2 + dx) * 4, w = cur.data[i + 3];
        r += cur.data[i] * w; g += cur.data[i + 1] * w; b += cur.data[i + 2] * w; a += w;
      }
      const o = (y * nw + x) * 4;
      if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
      out[o + 3] = Math.min(255, (a / 4) * (lv >= 2 ? 1.5 : 1));
    }
    cur = { data: out, width: nw, height: nh };
    mips.push(cur);
  }
  const tex = new THREE.DataTexture(mips[0].data, AW, AW, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.flipY = false;
  tex.needsUpdate = true;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = AW;
  canvas.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px), AW, AW), 0, 0);
  return { texture: tex, canvas, pixels: px };
}

// Isometric block icon for the hotbar / inventory.
export function blockIcon(atlas, id, size = 40) {
  const d = DEFS[id];
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  const tile = (t) => { const s = document.createElement('canvas'); s.width = s.height = 16; s.getContext('2d').drawImage(atlas, (t % TILES) * 16, ((t / TILES) | 0) * 16, 16, 16, 0, 0, 16, 16); return s; };
  if (d.kind === 'plant') {
    g.drawImage(tile(d.top), 0, 0, 16, 16, size * 0.1, size * 0.1, size * 0.8, size * 0.8); return c;
  }
  const s = size * 0.47, cx = size / 2, cy = size / 2 + size * 0.02;
  const face = (t, p0, u, v, shade) => {
    g.save(); g.setTransform(u[0] / 16, u[1] / 16, v[0] / 16, v[1] / 16, p0[0], p0[1]);
    g.drawImage(tile(t), 0, 0); g.restore();
    if (shade) {
      g.fillStyle = `rgba(0,0,0,${shade})`; g.beginPath();
      g.moveTo(p0[0], p0[1]); g.lineTo(p0[0] + u[0], p0[1] + u[1]); g.lineTo(p0[0] + u[0] + v[0], p0[1] + u[1] + v[1]); g.lineTo(p0[0] + v[0], p0[1] + v[1]); g.fill();
    }
  };
  const k = 0.866;
  face(d.top, [cx, cy - s], [s * k, s * 0.5], [-s * k, s * 0.5], 0);
  face(d.side, [cx - s * k, cy - s * 0.5], [s * k, s * 0.5], [0, s], 0.22);
  face(d.side, [cx, cy], [s * k, -s * 0.5], [0, s], 0.4);
  return c;
}

export function makeCrackTextures() {
  const r = mulberry32(777);
  const pts = [];
  for (let w = 0; w < 7; w++) {
    let x = 8 + (r() * 4 - 2), y = 8 + (r() * 4 - 2), a = r() * Math.PI * 2;
    for (let i = 0; i < 12; i++) { pts.push([Math.round(x), Math.round(y)]); a += (r() - 0.5) * 1.1; x += Math.cos(a) * 1.15; y += Math.sin(a) * 1.15; }
  }
  const out = [];
  for (let s = 0; s < 10; s++) {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d'); g.fillStyle = 'rgba(10,8,6,0.78)';
    const n = Math.round(pts.length * (s + 1) / 10);
    for (let i = 0; i < n; i++) g.fillRect(pts[i][0], pts[i][1], 1, 1);
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
    out.push(t);
  }
  return out;
}

export function makeSunTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#ffb84a'; g.fillRect(4, 4, 24, 24);
  g.fillStyle = '#ffd96e'; g.fillRect(6, 6, 20, 20);
  g.fillStyle = '#fff3b8'; g.fillRect(9, 9, 14, 14);
  g.fillStyle = '#ffffff'; g.fillRect(12, 12, 8, 8);
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function makeMoonTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 32, 32);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const d = Math.hypot(x - 15.5, y - 15.5);
    if (d < 11) { const k = 0.86 + ((x * 7 + y * 13) % 5) * 0.03; g.fillStyle = `rgb(${226 * k | 0},${230 * k | 0},${244 * k | 0})`; g.fillRect(x, y, 1, 1); }
  }
  g.fillStyle = 'rgba(120,128,150,0.7)';
  [[11, 11, 3], [19, 15, 4], [13, 20, 2], [18, 9, 2]].forEach(([x, y, r]) => g.fillRect(x, y, r, r));
  const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeSheepTextures() {
  const r = mulberry32(4242);
  const mk = (fn) => {
    const c = document.createElement('canvas'); c.width = c.height = 16;
    const g = c.getContext('2d');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = fn(x, y); g.fillStyle = `rgb(${col[0] | 0},${col[1] | 0},${col[2] | 0})`; g.fillRect(x, y, 1, 1); }
    const t = new THREE.CanvasTexture(c); t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const wool = mk(() => { const k = 0.9 + r() * 0.1; return [244 * k, 242 * k, 236 * k]; });
  const skin = mk(() => { const k = 0.9 + r() * 0.12; return [200 * k, 170 * k, 145 * k]; });
  const face = mk((x, y) => {
    const k = 0.92 + r() * 0.1; let c = [200 * k, 170 * k, 145 * k];
    if (y >= 5 && y <= 7 && ((x >= 2 && x <= 4) || (x >= 11 && x <= 13))) c = (y === 6 && (x === 3 || x === 12)) ? [20, 16, 16] : [246, 246, 240];
    if (y >= 10 && y <= 12 && x >= 5 && x <= 10) c = [150 * k, 112 * k, 96 * k];
    return c;
  });
  return { wool, skin, face };
}
