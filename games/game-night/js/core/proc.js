// Procedural PBR textures drawn in code (no image files): albedo + normal (+roughness) from canvas height fields.
import * as THREE from 'three';
import { Rng, TAU } from './util.js';

const cache = new Map();

// ---- value noise ----
function hash(x, y, s) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y, s) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function fbm(x, y, oct = 4, s = 1) { let a = 0.5, f = 1, sum = 0; for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 17); a *= 0.5; f *= 2; } return sum; }

const mkCanvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };
const hexToRgb = (h) => { const c = new THREE.Color(h); return [c.r * 255, c.g * 255, c.b * 255]; };

/** Draw per-pixel albedo (r,g,b) and height (0..1) with fn(u,v)->{c:[r,g,b], h}. */
function paint(n, fn) {
  const albedo = mkCanvas(n), height = new Float32Array(n * n), g = albedo.getContext('2d'), img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const o = fn(x / n, y / n, x, y); const i = (y * n + x) * 4; img.data[i] = o.c[0]; img.data[i + 1] = o.c[1]; img.data[i + 2] = o.c[2]; img.data[i + 3] = 255; height[y * n + x] = o.h; }
  g.putImageData(img, 0, 0);
  return { albedo, height };
}
function normalFrom(height, n, strength = 2.5) {
  const c = mkCanvas(n), g = c.getContext('2d'), img = g.createImageData(n, n);
  const H = (x, y) => height[((y + n) % n) * n + ((x + n) % n)];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * n + x) * 4;
    img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0); return c;
}
function pack(albedoC, normalC, repeat, rough) {
  const map = new THREE.CanvasTexture(albedoC), nm = new THREE.CanvasTexture(normalC);
  for (const t of [map, nm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 8; }
  map.colorSpace = THREE.SRGBColorSpace;
  return { map, normalMap: nm, roughness: rough };
}

const KINDS = {
  wood(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x8a5a34), [r1, g1, b1] = hexToRgb(o.dark || 0x4a2c16); const planks = o.planks ?? 6; return paint(n, (u, v) => { const p = Math.floor(u * planks), pu = (u * planks) % 1; const grain = fbm(u * 4 + p * 9, v * 40, 4, p + 3); const ring = Math.sin((v * 22 + grain * 8 + p) * 1.5) * 0.5 + 0.5; const gap = pu < 0.03 || pu > 0.97 ? 1 : 0; const t = clamp01(grain * 0.7 + ring * 0.3 - gap * 0.6); return { c: [lerp(r1, r0, t), lerp(g1, g0, t), lerp(b1, b0, t)], h: gap ? 0 : 0.6 + ring * 0.25 + grain * 0.15 }; }); },
  stone(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x9a958a); const rng = new Rng(11); const cells = o.cells ?? 6; const off = []; for (let i = 0; i < cells * cells; i++) off.push([rng.next(), rng.next(), rng.range(0.85, 1.15)]); return paint(n, (u, v) => { let best = 9, second = 9, id = 0; const cu = u * cells, cv = v * cells; const ix = Math.floor(cu), iy = Math.floor(cv); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const cx = ix + dx, cy = iy + dy, k = (((cy + cells) % cells) * cells + ((cx + cells) % cells)); const px = cx + off[k][0], py = cy + off[k][1]; const d = Math.hypot(cu - px, cv - py); if (d < best) { second = best; best = d; id = k; } else if (d < second) second = d; } const edge = clamp01((second - best) * 6); const n2 = fbm(u * 30, v * 30, 3, 5); const tone = 0.7 + off[id][2] * 0.2 + n2 * 0.25 - (1 - edge) * 0.35; return { c: [r0 * tone, g0 * tone, b0 * tone], h: edge * 0.7 + n2 * 0.3 }; }); },
  bricks(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x9a4a3a); const rows = o.rows ?? 8; return paint(n, (u, v) => { const row = Math.floor(v * rows), vv = (v * rows) % 1, uu = (u * (rows / 2) + (row % 2) * 0.5) % 1; const mortar = vv < 0.1 || uu < 0.05 ? 1 : 0; const tone = 0.75 + hash(Math.floor(u * (rows / 2) + (row % 2) * 0.5), row, 4) * 0.4 + fbm(u * 25, v * 25, 3, 2) * 0.2; return { c: mortar ? [150, 145, 135] : [r0 * tone, g0 * tone, b0 * tone], h: mortar ? 0.05 : 0.7 + fbm(u * 40, v * 40, 2, 8) * 0.3 }; }); },
  roof(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x3a4a5e); const cols = o.cols ?? 10; return paint(n, (u, v) => { const cu = (u * cols) % 1, row = Math.floor(v * 8), vv = (v * 8) % 1; const ridge = Math.sin(cu * Math.PI); const curve = Math.sin(vv * Math.PI * 0.5); const tone = 0.55 + ridge * 0.4 + (1 - vv) * 0.1 + hash(Math.floor(u * cols), row, 9) * 0.12; return { c: [r0 * tone, g0 * tone, b0 * tone], h: ridge * 0.6 + (1 - vv) * 0.3 }; }); },
  plaster(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0xf1e9d8); return paint(n, (u, v) => { const t = 0.86 + fbm(u * 12, v * 12, 5, 21) * 0.2; const stain = fbm(u * 3, v * 3, 3, 7) > 0.62 ? 0.94 : 1; return { c: [r0 * t * stain, g0 * t * stain, b0 * t * stain], h: fbm(u * 24, v * 24, 4, 3) }; }); },
  thatch(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0xb08a4a); return paint(n, (u, v) => { const s = fbm(u * 60, v * 4, 3, 1); const t = 0.6 + s * 0.6; return { c: [r0 * t, g0 * t, b0 * t], h: s }; }); },
  dirt(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x8a6a48); return paint(n, (u, v) => { const t = 0.7 + fbm(u * 10, v * 10, 5, 5) * 0.5; const peb = hash(Math.floor(u * 60), Math.floor(v * 60), 3) > 0.96 ? 1.25 : 1; return { c: [r0 * t * peb, g0 * t * peb, b0 * t * peb], h: fbm(u * 20, v * 20, 3, 6) }; }); },
  metal(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x6a7484); return paint(n, (u, v) => { const brushed = fbm(u * 2, v * 90, 3, 4); const panel = (u * 4) % 1 < 0.02 || (v * 4) % 1 < 0.02 ? 0.6 : 1; const t = (0.75 + brushed * 0.35) * panel; return { c: [r0 * t, g0 * t, b0 * t], h: panel < 1 ? 0.1 : 0.6 + brushed * 0.1 }; }); },
  concrete(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x8a8d92); return paint(n, (u, v) => { const t = 0.72 + fbm(u * 14, v * 14, 5, 8) * 0.4; const crack = Math.abs(Math.sin((u + fbm(u * 6, v * 6, 3, 2) * 0.4) * 30)) < 0.02 ? 0.7 : 1; return { c: [r0 * t * crack, g0 * t * crack, b0 * t * crack], h: fbm(u * 30, v * 30, 4, 9) * crack }; }); },
  grass(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x5aa84a); return paint(n, (u, v) => { const t = 0.7 + fbm(u * 18, v * 18, 5, 12) * 0.55 + fbm(u * 3, v * 3, 2, 30) * 0.3; return { c: [r0 * t * 0.9, g0 * t, b0 * t * 0.85], h: fbm(u * 60, v * 60, 3, 4) }; }); },
  tiles(n, o) { const [r0, g0, b0] = hexToRgb(o.base || 0x2a2f45); const k = o.cells ?? 8; return paint(n, (u, v) => { const gx = (u * k) % 1, gy = (v * k) % 1; const line = gx < 0.04 || gy < 0.04 ? 1 : 0; const t = 0.8 + hash(Math.floor(u * k), Math.floor(v * k), 6) * 0.3 + fbm(u * 20, v * 20, 3, 3) * 0.1; return { c: line ? [r0 * 0.4, g0 * 0.4, b0 * 0.4] : [r0 * t, g0 * t, b0 * t], h: line ? 0 : 0.8 }; }); },
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Returns {map, normalMap} tuned for MeshStandardMaterial / MeshToonMaterial. Cached per option set. */
export function procTex(kind, o = {}) {
  const key = kind + JSON.stringify(o); if (cache.has(key)) return cache.get(key);
  const n = o.size || 256, { albedo, height } = KINDS[kind](n, o);
  const t = pack(albedo, normalFrom(height, n, o.bump ?? 2.5), o.repeat || [1, 1], o.rough ?? 0.8);
  cache.set(key, t); return t;
}
/** Standard PBR material from a procedural texture. */
export function pbr(kind, o = {}) {
  const t = procTex(kind, o);
  return new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(o.normal ?? 0.9, o.normal ?? 0.9), roughness: o.rough ?? t.roughness ?? 0.8, metalness: o.metal ?? 0.0, color: o.tint ?? 0xffffff, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, side: o.side ?? THREE.FrontSide });
}
/** Cel-shaded material that still shows the procedural detail. */
export function toonTex(kind, o = {}, gradientMap) {
  const t = procTex(kind, o);
  return new THREE.MeshToonMaterial({ map: t.map, normalMap: t.normalMap, normalScale: new THREE.Vector2(o.normal ?? 0.6, o.normal ?? 0.6), gradientMap, color: o.tint ?? 0xffffff, side: o.side ?? THREE.FrontSide });
}
/** Rescale UVs of a geometry so a texture repeats in world units (u,v per meter). */
export function worldUV(geo, perMeter = 0.5) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  if (!uv || !nor) return geo;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); } else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); } else { u = pos.getX(i); v = pos.getY(i); }
    uv.setXY(i, u * perMeter, v * perMeter);
  }
  uv.needsUpdate = true; return geo;
}
