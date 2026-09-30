// All textures are painted on canvases at start-up: no image files.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

// draw fn(x, y) at wrapped copies so the texture tiles seamlessly
function wrapped(w, h, x, y, r, fn) {
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const px = x + dx, py = y + dy;
      if (px + r < 0 || px - r > w || py + r < 0 || py - r > h) continue;
      fn(px, py);
    }
  }
}

export function woodTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(11);
  for (let p = 0; p < 4; p++) {
    const y0 = p * 64, v = (R() - 0.5) * 30;
    g.fillStyle = `rgb(${205 + v | 0},${150 + v * 0.8 | 0},${92 + v * 0.55 | 0})`;
    g.fillRect(0, y0, S, 64);
    for (let i = 0; i < 30; i++) {
      const y = y0 + 3 + R() * 58, ph = R() * 6, amp = 0.8 + R() * 2.2;
      g.strokeStyle = `rgba(${95 + R() * 40 | 0},${55 + R() * 25 | 0},${22},${0.10 + R() * 0.2})`;
      g.lineWidth = 0.6 + R() * 1.6;
      g.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin(x / S * Math.PI * 4 + ph) * amp;
        x ? g.lineTo(x, yy) : g.moveTo(x, yy);
      }
      g.stroke();
    }
    if (R() < 0.75) {
      const kx = 30 + R() * 190, ky = y0 + 16 + R() * 32;
      for (let k = 4; k > 0; k--) {
        g.strokeStyle = `rgba(70,38,16,${0.16 + (4 - k) * 0.08})`;
        g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(kx, ky, k * 4.2, k * 2.1, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.fillStyle = 'rgba(58,30,12,.85)'; g.fillRect(0, y0, S, 2.5);
    g.fillStyle = 'rgba(255,225,170,.20)'; g.fillRect(0, y0 + 2.5, S, 1.5);
    // nails
    g.fillStyle = 'rgba(45,35,30,.75)';
    for (const nx of [10, 246]) { g.beginPath(); g.arc(nx, y0 + 32, 2.1, 0, 6.3); g.fill(); }
  }
  return toTexture(c);
}

export function stoneTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(23);
  g.fillStyle = '#a3a7ab'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = R() * S, y = R() * S, r = 30 + R() * 60, l = R() < 0.5;
    wrapped(S, S, x, y, r, (px, py) => {
      const gr = g.createRadialGradient(px, py, 0, px, py, r);
      gr.addColorStop(0, l ? 'rgba(235,235,232,.20)' : 'rgba(70,72,80,.20)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
    });
  }
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, s = 0.6 + R() * 1.8, d = R() < 0.5;
    g.fillStyle = d ? `rgba(60,62,70,${0.10 + R() * 0.2})` : `rgba(245,245,240,${0.10 + R() * 0.22})`;
    wrapped(S, S, x, y, s, (px, py) => g.fillRect(px, py, s, s));
  }
  g.strokeStyle = 'rgba(60,62,70,.30)'; g.lineWidth = 0.9;
  for (let i = 0; i < 5; i++) {
    let x = R() * S, y = R() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (R() - 0.5) * 34; y += (R() - 0.5) * 34; g.lineTo(x, y); }
    g.stroke();
  }
  return toTexture(c);
}

export function glassTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#c9efff'; g.fillRect(0, 0, S, S);
  const gr = g.createLinearGradient(0, 0, S, S);
  gr.addColorStop(0, 'rgba(255,255,255,.0)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.55)');
  gr.addColorStop(0.42, 'rgba(255,255,255,.0)');
  gr.addColorStop(0.62, 'rgba(255,255,255,.35)');
  gr.addColorStop(0.7, 'rgba(255,255,255,.0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTexture(c);
}

export function tntTexture() {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(5);
  g.fillStyle = '#d3242a'; g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 32) {                       // staves
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(x, 0, 2, H);
    g.fillStyle = 'rgba(255,190,170,.13)'; g.fillRect(x + 2, 0, 2, H);
  }
  for (let i = 0; i < 500; i++) {                          // grime
    g.fillStyle = `rgba(60,10,10,${R() * 0.12})`;
    g.fillRect(R() * W, R() * H, 2, 2 + R() * 6);
  }
  for (const y of [22, 218]) {                             // hoops
    g.fillStyle = '#3a3230'; g.fillRect(0, y - 11, W, 22);
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, y - 11, W, 3);
    g.fillStyle = '#6b625c';
    for (let x = 12; x < W; x += 32) { g.beginPath(); g.arc(x, y, 2.5, 0, 6.3); g.fill(); }
  }
  g.font = '900 60px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const x of [64, 192]) {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText('TNT', x + 2, 122);
    g.fillStyle = '#fff4d6'; g.fillText('TNT', x, 120);
  }
  return toTexture(c);
}

export function crackTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(77);
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  g.lineCap = 'round';
  const crack = (x, y, a, len, w, depth) => {
    g.strokeStyle = '#fff'; g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    let cx = x, cy = y;
    const steps = 6 + (R() * 4 | 0);
    for (let i = 0; i < steps; i++) {
      a += (R() - 0.5) * 0.9;
      cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps;
      g.lineTo(cx, cy);
      if (depth > 0 && R() < 0.3) { g.stroke(); crack(cx, cy, a + (R() - 0.5) * 1.8, len * 0.5, w * 0.7, depth - 1); g.beginPath(); g.moveTo(cx, cy); g.strokeStyle = '#fff'; g.lineWidth = w; }
    }
    g.stroke();
  };
  for (let i = 0; i < 6; i++) crack(R() * S, R() * S, R() * 6.28, 90 + R() * 80, 2.2, 2);
  return toTexture(c, { srgb: false });
}

export function flagTexture() {
  const W = 128, H = 80, c = canvas(W, H), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#e8323a'); gr.addColorStop(1, '#a5151f');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, W, 6);
  g.fillStyle = '#ffd23d';
  g.beginPath(); g.arc(W / 2, H / 2, 24, 0, 6.3); g.fill();
  g.fillStyle = '#7a1018';
  g.beginPath();                                   // skull-ish crown emblem
  const cx = W / 2, cy = H / 2;
  g.moveTo(cx - 15, cy + 10); g.lineTo(cx - 17, cy - 8); g.lineTo(cx - 8, cy - 1);
  g.lineTo(cx, cy - 13); g.lineTo(cx + 8, cy - 1); g.lineTo(cx + 17, cy - 8); g.lineTo(cx + 15, cy + 10);
  g.closePath(); g.fill();
  g.strokeStyle = '#ffd23d'; g.lineWidth = 3; g.strokeRect(2, 2, W - 4, H - 4);
  return toTexture(c, { repeat: false });
}

export function cloudSprite() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return toTexture(c, { repeat: false });
}

// Box geometry mapping: world-unit UVs so textures keep a constant scale on
// every block size; the texture's u axis follows the block's longest axis so
// wood grain always runs along the plank.
export function applyBoxUV(geo, size, texScale) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const s = [size[0], size[1], size[2]];
  let long = 0;
  if (s[1] > s[long]) long = 1;
  if (s[2] > s[long]) long = 2;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const face = nx >= ny && nx >= nz ? 0 : ny >= nz ? 1 : 2;
    const axes = [0, 1, 2].filter((a) => a !== face);
    let uA = axes[0], vA = axes[1];
    if (axes.includes(long)) { uA = long; vA = axes.find((a) => a !== long); }
    const p = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    uv.setXY(i, p[uA] / texScale, p[vA] / texScale);
  }
  uv.needsUpdate = true;
  return geo;
}

// ======================================================================
// Environment textures (all painted on canvases)
// ======================================================================
function blob(g, S, x, y, r, color) {
  wrapped(S, S, x, y, r, (px, py) => {
    const gr = g.createRadialGradient(px, py, 0, px, py, r);
    gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2);
  });
}

export function grassDetailTexture() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d'), R = rng(31);
  g.fillStyle = '#c9d8b8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 90; i++) blob(g, S, R() * S, R() * S, 30 + R() * 90, R() < 0.5 ? 'rgba(255,255,235,.22)' : 'rgba(60,110,40,.22)');
  for (let i = 0; i < 9000; i++) {
    const x = R() * S, y = R() * S, l = 3 + R() * 7, a = -Math.PI / 2 + (R() - 0.5) * 1.1;
    g.strokeStyle = R() < 0.5 ? `rgba(70,120,40,${0.12 + R() * 0.2})` : `rgba(255,255,225,${0.10 + R() * 0.16})`;
    g.lineWidth = 0.8 + R() * 0.8;
    wrapped(S, S, x, y, 10, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
  const t = toTexture(c); t.repeat.set(1, 1);
  return t;
}

export function barkTexture(light = false) {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(light ? 71 : 41);
  g.fillStyle = light ? '#e8e4da' : '#6a4b31'; g.fillRect(0, 0, S, S);
  if (light) {                                    // birch: dark horizontal marks
    for (let i = 0; i < 70; i++) {
      const x = R() * S, y = R() * S, w = 10 + R() * 40;
      g.fillStyle = `rgba(30,28,26,${0.35 + R() * 0.5})`;
      wrapped(S, S, x, y, w, (px, py) => g.fillRect(px, py, w, 2 + R() * 3));
    }
  } else {
    for (let i = 0; i < 260; i++) {                // fissures
      const x = R() * S, y = R() * S, l = 30 + R() * 90;
      g.strokeStyle = `rgba(28,18,10,${0.25 + R() * 0.45})`; g.lineWidth = 1 + R() * 2.4;
      wrapped(S, S, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); for (let k = 1; k <= 4; k++) g.lineTo(px + (R() - 0.5) * 6, py + k * l / 4); g.stroke(); });
    }
    for (let i = 0; i < 60; i++) blob(g, S, R() * S, R() * S, 20 + R() * 40, R() < 0.5 ? 'rgba(200,170,130,.16)' : 'rgba(20,12,6,.2)');
  }
  return toTexture(c);
}

export function leafTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(52);
  g.fillStyle = '#9fbd7a'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 700; i++) {
    const x = R() * S, y = R() * S, w = 5 + R() * 9, h = 3 + R() * 5, a = R() * 6.28, v = R();
    g.fillStyle = v < 0.3 ? 'rgba(45,90,30,.55)' : v < 0.7 ? 'rgba(255,255,220,.30)' : 'rgba(120,170,70,.45)';
    wrapped(S, S, x, y, w, (px, py) => { g.save(); g.translate(px, py); g.rotate(a); g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 6.3); g.fill(); g.restore(); });
  }
  return toTexture(c);
}

// RGBA card with a clump of grass blades
export function bladeTexture(tone = 0) {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(90 + tone);
  for (let i = 0; i < 26; i++) {
    const x = 20 + R() * (W - 40), h = 90 + R() * 150, lean = (R() - 0.5) * 70, w = 4 + R() * 6;
    const gr = g.createLinearGradient(0, H, 0, H - h);
    gr.addColorStop(0, tone ? '#3b5e1e' : '#2c5a1c'); gr.addColorStop(0.5, tone ? '#7fa83a' : '#5c9a2a'); gr.addColorStop(1, tone ? '#d6dd6a' : '#a5d24f');
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - w, H); g.quadraticCurveTo(x - w * 0.4 + lean * 0.3, H - h * 0.55, x + lean, H - h);
    g.quadraticCurveTo(x + w * 0.4 + lean * 0.3, H - h * 0.55, x + w, H); g.closePath(); g.fill();
  }
  const t = toTexture(c, { repeat: false }); return t;
}

export function flowerTexture(head, center = '#ffd23d') {
  const W = 256, H = 256, c = canvas(W, H), g = c.getContext('2d'), R = rng(120 + head.length * 7);
  for (let i = 0; i < 7; i++) {
    const x = 30 + R() * (W - 60), h = 80 + R() * 110, lean = (R() - 0.5) * 30;
    g.strokeStyle = '#3d7a24'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, H); g.quadraticCurveTo(x + lean * 0.2, H - h * 0.5, x + lean, H - h); g.stroke();
    g.fillStyle = '#4d9430'; g.beginPath(); g.ellipse(x + lean * 0.3, H - h * 0.35, 14, 4, -0.5, 0, 6.3); g.fill();
    const hx = x + lean, hy = H - h, pr = 9 + R() * 4;
    g.fillStyle = head;
    for (let p = 0; p < 6; p++) { const a = p * Math.PI / 3; g.beginPath(); g.ellipse(hx + Math.cos(a) * pr * 0.8, hy + Math.sin(a) * pr * 0.8, pr * 0.75, pr * 0.42, a, 0, 6.3); g.fill(); }
    g.fillStyle = center; g.beginPath(); g.arc(hx, hy, pr * 0.42, 0, 6.3); g.fill();
  }
  return toTexture(c, { repeat: false });
}

export function rockTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(63);
  g.fillStyle = '#9a9690'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) blob(g, S, R() * S, R() * S, 20 + R() * 60, R() < 0.5 ? 'rgba(235,230,220,.28)' : 'rgba(50,48,46,.30)');
  for (let i = 0; i < 26; i++) {                     // strata
    const y = R() * S; g.strokeStyle = `rgba(40,38,36,${0.10 + R() * 0.2})`; g.lineWidth = 1 + R() * 3;
    g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.05 + i) * 4); g.stroke();
  }
  for (let i = 0; i < 40; i++) blob(g, S, R() * S, R() * S, 6 + R() * 14, 'rgba(120,150,60,.30)');   // lichen
  for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.18})`; g.fillRect(R() * S, R() * S, 1.5, 1.5); }
  return toTexture(c);
}

export function plasterTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(81);
  g.fillStyle = '#efe3c8'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) blob(g, S, R() * S, R() * S, 20 + R() * 50, R() < 0.5 ? 'rgba(255,255,255,.25)' : 'rgba(150,120,80,.18)');
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(90,70,40,${R() * 0.15})`; g.fillRect(R() * S, R() * S, 2, 2); }
  g.fillStyle = 'rgba(90,60,30,.85)';                 // timber framing
  for (const x of [0, 126, 250]) g.fillRect(x, 0, 6, S);
  for (const y of [0, 126, 250]) g.fillRect(0, y, S, 6);
  return toTexture(c);
}

export function roofTexture() {
  const S = 256, c = canvas(S, S), g = c.getContext('2d'), R = rng(91);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 9; col++) {
    const x = col * 32 + (row % 2) * 16, y = row * 32, v = R() * 26;
    g.fillStyle = `rgb(${176 + v | 0},${72 + v * 0.6 | 0},${46 + v * 0.4 | 0})`;
    g.beginPath(); g.roundRect ? g.roundRect(x, y, 30, 36, [0, 0, 14, 14]) : g.rect(x, y, 30, 36); g.fill();
    g.strokeStyle = 'rgba(60,20,10,.55)'; g.lineWidth = 2; g.stroke();
  }
  return toTexture(c);
}
