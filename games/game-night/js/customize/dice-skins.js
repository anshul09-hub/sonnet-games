// Dice skins: procedural face textures (canvas) + material settings. 24 skins, 8 per theme.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { FACES } from '../ludo/dice-sim.js';

const S = 256;
const PIPS = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.26, .26], [.5, .5], [.74, .74]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]], 5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.3, .25], [.7, .25], [.3, .5], [.7, .5], [.3, .75], [.7, .75]] };

// id -> {base, pip, shape, pattern, rough, metal, opacity, glow, edge}
export const DICE = {
  sakura: { base: '#fff1e6', pip: '#ff8fb1', shape: 'petal', pattern: 'plain', rough: 0.35 },
  ink: { base: '#1d1d2b', pip: '#ffffff', shape: 'brush', pattern: 'speckle', rough: 0.28 },
  kitsune: { base: '#d62839', pip: '#ffd166', shape: 'circle', pattern: 'grad', rough: 0.22, metal: 0.15 },
  jade: { base: '#3ddc97', pip: '#0b6e4f', shape: 'circle', pattern: 'grad', rough: 0.12, opacity: 0.86 },
  tanabata: { base: '#233d8f', pip: '#ffe66d', shape: 'star', pattern: 'stars', rough: 0.3, glow: true },
  koi: { base: '#f4c542', pip: '#e8590c', shape: 'circle', pattern: 'scales', rough: 0.3, metal: 0.55 },
  moonrabbit: { base: '#f8f9fa', pip: '#ffd43b', shape: 'ring', pattern: 'plain', rough: 0.4 },
  ramen: { base: '#f4a261', pip: '#fff8e7', shape: 'swirl', pattern: 'grad', rough: 0.4 },
  lava: { base: '#3b2a26', pip: '#ff5a1f', shape: 'circle', pattern: 'cracks', rough: 0.9, glow: true },
  pixel: { base: '#2ecc71', pip: '#0b3d20', shape: 'square', pattern: 'bricks', rough: 0.8 },
  ice: { base: '#bde7ff', pip: '#3d8fe0', shape: 'diamond', pattern: 'facets', rough: 0.08, opacity: 0.8 },
  loot: { base: '#ffd43b', pip: '#7c4a03', shape: 'circle', pattern: 'plain', rough: 0.22, metal: 0.85 },
  slime: { base: '#a6ff3d', pip: '#2b5a00', shape: 'circle', pattern: 'speckle', rough: 0.15, opacity: 0.9, emissive: 0.25 },
  arcade: { base: '#1a0a2a', pip: '#ff2bd6', shape: 'ring', pattern: 'neonedge', rough: 0.4, glow: true },
  bomb: { base: '#22252b', pip: '#ff9f1c', shape: 'circle', pattern: 'plain', rough: 0.4, glow: true },
  ruby: { base: '#c1121f', pip: '#ffe3e3', shape: 'diamond', pattern: 'facets', rough: 0.1, opacity: 0.92 },
  pcb: { base: '#0f7b4a', pip: '#e0b44c', shape: 'circle', pattern: 'pcb', rough: 0.35, metal: 0.3 },
  holodie: { base: '#7ad7ff', pip: '#e0fbff', shape: 'hex', pattern: 'scan', rough: 0.1, opacity: 0.55, emissive: 0.3, glow: true },
  chrome: { base: '#d0d6de', pip: '#20242c', shape: 'circle', pattern: 'plain', rough: 0.1, metal: 1 },
  datacube: { base: '#1c3d99', pip: '#7ad7ff', shape: 'binary', pattern: 'binary', rough: 0.35, glow: true },
  plasma: { base: '#8a2be2', pip: '#ffd1ff', shape: 'circle', pattern: 'swirl', rough: 0.25, emissive: 0.45, glow: true },
  carbon: { base: '#15171c', pip: '#ff3860', shape: 'circle', pattern: 'carbon', rough: 0.35, metal: 0.3, glow: true },
  matrixdie: { base: '#02160b', pip: '#00ff9c', shape: 'binary', pattern: 'rain', rough: 0.4, glow: true },
  quantum: { base: '#b388ff', pip: '#ffffff', shape: 'diamond', pattern: 'prism', rough: 0.15, metal: 0.6 },
};

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

function pattern(g, type, d) {
  const c = d.base;
  g.fillStyle = c; g.fillRect(0, 0, S, S);
  const rnd = (() => { let a = 12345; return () => ((a = (a * 1664525 + 1013904223) >>> 0) / 4294967296); })();
  switch (type) {
    case 'grad': { const gr = g.createLinearGradient(0, 0, S, S); gr.addColorStop(0, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); break; }
    case 'speckle': for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.16})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 1 + rnd() * 5, 0, 7); g.fill(); } break;
    case 'stars': for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,240,180,${0.15 + rnd() * 0.6})`; const x = rnd() * S, y = rnd() * S, r = 1 + rnd() * 3; g.fillRect(x, y, r, r); } break;
    case 'scales': g.strokeStyle = 'rgba(160,60,0,.35)'; g.lineWidth = 3; for (let y = 0; y < S + 30; y += 26) for (let x = -20 + ((y / 26) % 2) * 20; x < S + 30; x += 40) { g.beginPath(); g.arc(x, y, 20, 0, Math.PI); g.stroke(); } break;
    case 'cracks': g.strokeStyle = d.pip; g.lineWidth = 3; g.shadowColor = d.pip; g.shadowBlur = 10; for (let i = 0; i < 7; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } g.shadowBlur = 0; break;
    case 'bricks': g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; for (let y = 0; y < S; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < S; x += 64) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 32); g.stroke(); } } break;
    case 'facets': for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.22})`; g.beginPath(); g.moveTo(rnd() * S, rnd() * S); g.lineTo(rnd() * S, rnd() * S); g.lineTo(rnd() * S, rnd() * S); g.fill(); } break;
    case 'neonedge': g.strokeStyle = d.pip; g.lineWidth = 8; g.shadowColor = d.pip; g.shadowBlur = 18; rr(g, 14, 14, S - 28, S - 28, 26); g.stroke(); g.shadowBlur = 0; break;
    case 'pcb': g.strokeStyle = '#e0b44c'; g.lineWidth = 4; g.globalAlpha = 0.7; for (let i = 0; i < 10; i++) { let x = rnd() * S, y = rnd() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { if (rnd() < 0.5) x += (rnd() - 0.5) * 100; else y += (rnd() - 0.5) * 100; g.lineTo(x, y); } g.stroke(); g.beginPath(); g.arc(x, y, 6, 0, 7); g.stroke(); } g.globalAlpha = 1; break;
    case 'binary': g.fillStyle = 'rgba(122,215,255,.22)'; g.font = 'bold 22px monospace'; for (let y = 22; y < S; y += 26) for (let x = 6; x < S; x += 20) g.fillText(rnd() < 0.5 ? '0' : '1', x, y); break;
    case 'rain': g.font = 'bold 20px monospace'; for (let x = 8; x < S; x += 22) { const len = 3 + Math.floor(rnd() * 8), y0 = rnd() * S; for (let k = 0; k < len; k++) { g.fillStyle = `rgba(0,255,156,${0.9 - k * 0.11})`; g.fillText(rnd() < 0.5 ? '0' : '1', x, (y0 + k * 22) % S); } } break;
    case 'carbon': for (let y = 0; y < S; y += 16) for (let x = 0; x < S; x += 16) { g.fillStyle = ((x + y) / 16) % 2 ? '#2a2d35' : '#0e0f13'; g.fillRect(x, y, 16, 16); g.fillStyle = 'rgba(255,255,255,.06)'; g.fillRect(x, y, 16, 3); } break;
    case 'swirl': { const gr = g.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S * 0.7); gr.addColorStop(0, '#d9a3ff'); gr.addColorStop(0.5, c); gr.addColorStop(1, '#3a0a7a'); g.fillStyle = gr; g.fillRect(0, 0, S, S); g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.beginPath(); for (let a = 0; a < 26; a += 0.15) g.lineTo(S / 2 + Math.cos(a) * a * 8, S / 2 + Math.sin(a) * a * 8); g.stroke(); break; }
    case 'prism': { const gr = g.createLinearGradient(0, 0, S, S); ['#b388ff', '#64ffda', '#ffd166', '#ff6b9a', '#b388ff'].forEach((col, i) => gr.addColorStop(i / 4, col)); g.fillStyle = gr; g.fillRect(0, 0, S, S); break; }
    case 'scan': g.fillStyle = 'rgba(255,255,255,.14)'; for (let y = 0; y < S; y += 8) g.fillRect(0, y, S, 2); break;
    default: break;
  }
}

function pipShape(g, shape, x, y, r, d) {
  g.save(); g.translate(x, y); g.fillStyle = d.pip; g.strokeStyle = d.pip;
  switch (shape) {
    case 'petal': for (let i = 0; i < 5; i++) { g.rotate((Math.PI * 2) / 5); g.beginPath(); g.ellipse(0, -r * 0.55, r * 0.42, r * 0.62, 0, 0, 7); g.fill(); } g.fillStyle = '#ffd6e2'; g.beginPath(); g.arc(0, 0, r * 0.22, 0, 7); g.fill(); break;
    case 'square': g.fillRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7); break;
    case 'star': g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * 7 - 1.57, rr2 = i % 2 ? r * 0.4 : r * 1.05; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.closePath(); g.fill(); break;
    case 'diamond': g.beginPath(); g.moveTo(0, -r * 1.1); g.lineTo(r * 0.9, 0); g.lineTo(0, r * 1.1); g.lineTo(-r * 0.9, 0); g.closePath(); g.fill(); break;
    case 'hex': g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * 6.283; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); break;
    case 'ring': g.lineWidth = r * 0.36; g.beginPath(); g.arc(0, 0, r * 0.78, 0, 7); g.stroke(); break;
    case 'swirl': g.lineWidth = r * 0.26; g.lineCap = 'round'; g.beginPath(); for (let a = 0; a < 12; a += 0.2) g.lineTo(Math.cos(a) * a * r * 0.09, Math.sin(a) * a * r * 0.09); g.stroke(); break;
    case 'binary': g.font = `900 ${r * 2.2}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(Math.random() < 0.5 ? '1' : '0', 0, 0); break;
    case 'brush': g.beginPath(); g.ellipse(0, 0, r * 0.95, r * 0.8, 0.5, 0, 7); g.fill(); g.globalAlpha = 0.5; g.beginPath(); g.arc(r * 0.6, -r * 0.7, r * 0.2, 0, 7); g.fill(); g.globalAlpha = 1; break;
    default: g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, 7); g.fill();
  }
  g.restore();
}

const cache = new Map();
function faceTexture(id, value) {
  const d = DICE[id], key = id + value;
  if (cache.has(key)) return cache.get(key);
  const mk = (pipsOnly) => {
    const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    if (pipsOnly) { g.fillStyle = '#000'; g.fillRect(0, 0, S, S); } else pattern(g, d.pattern, d);
    // rounded edge shading
    if (!pipsOnly) { g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 10; rr(g, 5, 5, S - 10, S - 10, 26); g.stroke(); }
    const r = value === 1 ? 44 : 27;
    for (const [px, py] of PIPS[value]) pipShape(g, d.shape, px * S, py * S, pipsOnly ? r : r, pipsOnly ? { pip: '#fff' } : d);
    const t = new THREE.CanvasTexture(c); t.colorSpace = pipsOnly ? THREE.SRGBColorSpace : THREE.SRGBColorSpace; t.anisotropy = 4; return t;
  };
  const out = { map: mk(false), glow: d.glow ? mk(true) : null };
  cache.set(key, out); return out;
}

/** Face order of BoxGeometry groups: +x, -x, +y, -y, +z, -z. */
const ORDER = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
export function dieMaterials(id) {
  const d = DICE[id] || DICE.sakura;
  return ORDER.map((n) => {
    const face = FACES.find((f) => f.n[0] === n[0] && f.n[1] === n[1] && f.n[2] === n[2]);
    const t = faceTexture(DICE[id] ? id : 'sakura', face.v);
    const m = new THREE.MeshStandardMaterial({ map: t.map, roughness: d.rough ?? 0.4, metalness: d.metal ?? 0.05, transparent: d.opacity != null && d.opacity < 1, opacity: d.opacity ?? 1 });
    if (t.glow) { m.emissive = new THREE.Color(d.pip); m.emissiveMap = t.glow; m.emissiveIntensity = 1.6; }
    else if (d.emissive) { m.emissive = new THREE.Color(d.base); m.emissiveIntensity = d.emissive; }
    return m;
  });
}

let _dieGeo = null;
export function buildDie(id) {
  _dieGeo ||= new RoundedBoxGeometry(1, 1, 1, 5, 0.13);
  const m = new THREE.Mesh(_dieGeo, dieMaterials(id));
  m.castShadow = true; m.receiveShadow = false;
  return m;
}
