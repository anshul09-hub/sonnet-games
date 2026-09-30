// All textures are drawn at load time on canvases: no image files.
import * as THREE from 'three';
import { rng } from './util.js';
import { ROAD_HW, EDGE } from './track.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { repeat = false, srgb = true, aniso = 8, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  return t;
}

// Asphalt with painted lines and red/white kerbs. u across the road, v along it (32 m per repeat).
export const ROAD_TILE = 32;
export function makeRoadTexture(aniso) {
  const W = 512, H = 1024;
  const c = canvas(W, H), g = c.getContext('2d');
  const r = rng(7);
  g.fillStyle = '#33343c';
  g.fillRect(0, 0, W, H);
  // grain
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 30;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 1.05;
  }
  g.putImageData(img, 0, 0);
  // patches
  for (let i = 0; i < 160; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? '20,20,26' : '80,80,90'},${0.03 + r() * 0.06})`;
    g.beginPath(); g.ellipse(r() * W, r() * H, 10 + r() * 40, 8 + r() * 60, r() * 3, 0, 6.28); g.fill();
  }
  const uPx = (m) => ((m + EDGE) / (2 * EDGE)) * W; // metres from centre -> px
  // darker rubbered-in racing lanes
  for (const m of [-2.6, 2.6]) {
    const grd = g.createLinearGradient(uPx(m - 1.5), 0, uPx(m + 1.5), 0);
    grd.addColorStop(0, 'rgba(10,10,14,0)'); grd.addColorStop(0.5, 'rgba(10,10,14,0.28)'); grd.addColorStop(1, 'rgba(10,10,14,0)');
    g.fillStyle = grd; g.fillRect(uPx(m - 1.5), 0, uPx(m + 1.5) - uPx(m - 1.5), H);
  }
  // edge lines
  g.fillStyle = 'rgba(235,235,225,0.92)';
  for (const m of [-ROAD_HW + 0.45, ROAD_HW - 0.45]) g.fillRect(uPx(m - 0.11), 0, uPx(m + 0.11) - uPx(m - 0.11), H);
  // dashed centre line (3 m dash / 5 m gap)
  g.fillStyle = 'rgba(245,205,70,0.95)';
  const pxPerM = H / ROAD_TILE;
  for (let d = 0; d < ROAD_TILE; d += 8) g.fillRect(uPx(-0.11), d * pxPerM, uPx(0.11) - uPx(-0.11), 3 * pxPerM);
  // kerbs: alternate red/white every 2 m
  const kl = uPx(-ROAD_HW), kr = uPx(ROAD_HW);
  for (let d = 0, i = 0; d < ROAD_TILE; d += 2, i++) {
    g.fillStyle = i % 2 ? '#f2efe8' : '#d3262a';
    g.fillRect(0, d * pxPerM, kl, 2 * pxPerM + 1);
    g.fillRect(kr, d * pxPerM, W - kr, 2 * pxPerM + 1);
  }
  // kerb inner shadow line
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(kl - 2, 0, 3, H); g.fillRect(kr - 1, 0, 3, H);
  return tex(c, { repeat: true, aniso });
}

export function makeCheckerTexture(cols = 16, rows = 4, aniso = 8) {
  const S = 32;
  const c = canvas(cols * S, rows * S), g = c.getContext('2d');
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f0';
    g.fillRect(x * S, y * S, S, S);
  }
  return tex(c, { aniso });
}

export function makeTerrainDetail(aniso) {
  const c = canvas(256, 256), g = c.getContext('2d');
  const r = rng(11);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = 150 + r() * 105;
    g.fillStyle = `rgba(${v},${v},${v},${0.25 + r() * 0.3})`;
    const s = 1 + r() * 4;
    g.fillRect(r() * 256, r() * 256, s, s * (0.6 + r()));
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,255,${0.04 + r() * 0.05})`;
    g.beginPath(); g.ellipse(r() * 256, r() * 256, 12 + r() * 30, 8 + r() * 24, r() * 3, 0, 6.28); g.fill();
  }
  return tex(c, { repeat: true, aniso });
}

export function makeSoftCircle(size = 64, inner = 0.0, color = '255,255,255') {
  const c = canvas(size, size), g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, size * inner, size / 2, size / 2, size / 2);
  grd.addColorStop(0, `rgba(${color},1)`);
  grd.addColorStop(0.45, `rgba(${color},0.5)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Fluffy smoke sprite (noisy blob)
export function makeSmokeTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = S / 2 + (r() - 0.5) * S * 0.45, y = S / 2 + (r() - 0.5) * S * 0.45, rad = S * (0.16 + r() * 0.2);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
  }
  // fade the edges
  const m = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S / 2);
  m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = m; g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeBannerTexture(text, { w = 1024, h = 160, bg = '#151824', fg = '#ffcf5a', accent = '#ff3b30', check = true } = {}) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  if (check) {
    const s = h / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < Math.ceil(w / s); x++) {
      if ((x + y) % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x * s, y * s, s, s); }
    }
  }
  g.fillStyle = accent; g.fillRect(0, h - 14, w, 14); g.fillRect(0, 0, w, 8);
  g.font = `italic 900 ${h * 0.62}px "Trebuchet MS", "Arial Black", Impact, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#000'; g.fillText(text, w / 2 + 5, h / 2 + 6);
  g.fillStyle = fg; g.fillText(text, w / 2, h / 2);
  return tex(c, { aniso: 8 });
}

export function makeCarNumber(n, color = '#fff') {
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 58, 0, 6.28); g.fill();
  g.fillStyle = '#111'; g.font = 'italic 900 78px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
