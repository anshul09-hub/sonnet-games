// Avatars + avatar frames: inline SVG generated in code (no image files).
import { ITEMS } from './catalog.js';

export const AVATARS = ['fox', 'cat', 'panda', 'frog', 'robot', 'alien', 'ninja', 'knight', 'astro', 'pirate', 'dragon', 'bunny'];

const eye = (x, y, r = 4, c = '#1d1d2b') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/><circle cx="${x + r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#fff"/>`;

const ART = {
  fox: { bg: ['#ffd9a8', '#ff9a3c'], svg: `
    <path d="M18 42 L24 10 L46 30Z" fill="#ff8a24"/><path d="M82 42 L76 10 L54 30Z" fill="#ff8a24"/>
    <path d="M25 33 L27 19 L38 29Z" fill="#ffd1b0"/><path d="M75 33 L73 19 L62 29Z" fill="#ffd1b0"/>
    <ellipse cx="50" cy="58" rx="31" ry="28" fill="#ff9a3c"/>
    <path d="M20 62 Q50 100 80 62 Q64 80 50 80 Q36 80 20 62Z" fill="#fff1d6"/>
    ${eye(37, 54)}${eye(63, 54)}<ellipse cx="50" cy="69" rx="4.5" ry="3.4" fill="#2b2d42"/>` },
  cat: { bg: ['#d7e3ff', '#7d8cff'], svg: `
    <path d="M20 44 L22 12 L46 30Z" fill="#8d99ae"/><path d="M80 44 L78 12 L54 30Z" fill="#8d99ae"/>
    <path d="M26 34 L26 20 L38 29Z" fill="#ffb3c6"/><path d="M74 34 L74 20 L62 29Z" fill="#ffb3c6"/>
    <ellipse cx="50" cy="58" rx="31" ry="28" fill="#a7b1c2"/>
    <path d="M40 40 L44 47 M50 38 L50 46 M60 40 L56 47" stroke="#8d99ae" stroke-width="3" stroke-linecap="round"/>
    ${eye(37, 56, 4.5, '#2a9d8f')}${eye(63, 56, 4.5, '#2a9d8f')}<path d="M46 66 h8 l-4 5z" fill="#ff8fab"/>
    <path d="M16 62 h18 M16 70 h18 M84 62 h-18 M84 70 h-18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>` },
  panda: { bg: ['#d8f5d0', '#5aa469'], svg: `
    <circle cx="24" cy="26" r="12" fill="#1d1d2b"/><circle cx="76" cy="26" r="12" fill="#1d1d2b"/>
    <ellipse cx="50" cy="56" rx="33" ry="30" fill="#fff"/>
    <ellipse cx="36" cy="52" rx="8.5" ry="11" fill="#1d1d2b" transform="rotate(20 36 52)"/><ellipse cx="64" cy="52" rx="8.5" ry="11" fill="#1d1d2b" transform="rotate(-20 64 52)"/>
    <circle cx="37" cy="52" r="3.2" fill="#fff"/><circle cx="63" cy="52" r="3.2" fill="#fff"/><ellipse cx="50" cy="66" rx="5" ry="3.4" fill="#1d1d2b"/>
    <path d="M44 73 Q50 78 56 73" stroke="#1d1d2b" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
  frog: { bg: ['#e6ffd1', '#6bcf4f'], svg: `
    <circle cx="30" cy="34" r="14" fill="#5cc23d"/><circle cx="70" cy="34" r="14" fill="#5cc23d"/>
    <ellipse cx="50" cy="60" rx="34" ry="26" fill="#6fdc4e"/>
    <circle cx="30" cy="33" r="9" fill="#fff"/><circle cx="70" cy="33" r="9" fill="#fff"/><circle cx="31" cy="34" r="4.6" fill="#1d1d2b"/><circle cx="69" cy="34" r="4.6" fill="#1d1d2b"/>
    <path d="M28 68 Q50 86 72 68" stroke="#1d5c12" stroke-width="3.2" fill="none" stroke-linecap="round"/><circle cx="43" cy="58" r="1.8" fill="#1d5c12"/><circle cx="57" cy="58" r="1.8" fill="#1d5c12"/>
    <circle cx="26" cy="64" r="5" fill="#ff9bb0" opacity=".6"/><circle cx="74" cy="64" r="5" fill="#ff9bb0" opacity=".6"/>` },
  robot: { bg: ['#d9f0ff', '#4dd6ff'], svg: `
    <rect x="47" y="8" width="6" height="14" fill="#8d99ae"/><circle cx="50" cy="9" r="5.5" fill="#ff4d6d"/>
    <rect x="18" y="22" width="64" height="58" rx="14" fill="#c8d1de"/><rect x="24" y="30" width="52" height="34" rx="9" fill="#2b2d42"/>
    <rect x="31" y="40" width="14" height="12" rx="4" fill="#4dffea"/><rect x="55" y="40" width="14" height="12" rx="4" fill="#4dffea"/>
    <rect x="34" y="68" width="32" height="6" rx="3" fill="#8d99ae"/><path d="M40 68v6M46 68v6M52 68v6M58 68v6" stroke="#c8d1de" stroke-width="1.5"/>
    <rect x="10" y="40" width="8" height="18" rx="3" fill="#8d99ae"/><rect x="82" y="40" width="8" height="18" rx="3" fill="#8d99ae"/>` },
  alien: { bg: ['#f0d9ff', '#8a5cff'], svg: `
    <path d="M50 12 C82 12 88 56 62 84 Q50 92 38 84 C12 56 18 12 50 12Z" fill="#7be07b"/>
    <path d="M20 42 Q30 34 44 56 Q34 66 22 56Z" fill="#111"/><path d="M80 42 Q70 34 56 56 Q66 66 78 56Z" fill="#111"/>
    <circle cx="30" cy="48" r="2.2" fill="#fff" opacity=".8"/><circle cx="70" cy="48" r="2.2" fill="#fff" opacity=".8"/>
    <path d="M44 74 Q50 78 56 74" stroke="#2c7a2c" stroke-width="2.4" fill="none" stroke-linecap="round"/>` },
  ninja: { bg: ['#ffd1dc', '#e63946'], svg: `
    <circle cx="50" cy="55" r="34" fill="#2b2d42"/><rect x="18" y="42" width="64" height="20" rx="8" fill="#f5cba7"/>
    <rect x="16" y="32" width="68" height="9" fill="#e63946"/><path d="M82 34 q14 -2 12 12 q-4 -8 -12 -6z" fill="#e63946"/>
    <ellipse cx="37" cy="52" rx="6" ry="5" fill="#fff"/><ellipse cx="63" cy="52" rx="6" ry="5" fill="#fff"/><circle cx="38" cy="52" r="3" fill="#1d1d2b"/><circle cx="62" cy="52" r="3" fill="#1d1d2b"/>
    <path d="M28 46 L44 49 M72 46 L56 49" stroke="#1d1d2b" stroke-width="2.6" stroke-linecap="round"/>` },
  knight: { bg: ['#e8ecf5', '#8d99ae'], svg: `
    <path d="M46 4 Q60 -2 72 8 Q60 10 58 24Z" fill="#e63946"/>
    <path d="M22 46 Q22 14 50 14 Q78 14 78 46 L78 82 Q50 96 22 82Z" fill="#c8d1de"/><path d="M22 46 Q22 14 50 14 Q78 14 78 46Z" fill="#dfe6f2"/>
    <rect x="26" y="44" width="48" height="12" rx="4" fill="#2b2d42"/><rect x="47" y="14" width="6" height="30" fill="#aab4c6"/><path d="M40 68 h20 M40 74 h20 M40 80 h20" stroke="#8d99ae" stroke-width="2"/>
    <rect x="34" y="47" width="10" height="4" rx="2" fill="#ffd23f"/><rect x="56" y="47" width="10" height="4" rx="2" fill="#ffd23f"/>` },
  astro: { bg: ['#d9e4ff', '#3a4a9a'], svg: `
    <circle cx="50" cy="52" r="38" fill="#f5f7fa"/><circle cx="50" cy="52" r="38" fill="none" stroke="#c5cee0" stroke-width="4"/>
    <rect x="22" y="34" width="56" height="38" rx="19" fill="#26315e"/><path d="M28 42 Q40 36 58 40" stroke="#7ad7ff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".8"/>
    <circle cx="62" cy="60" r="3" fill="#7ad7ff" opacity=".7"/><rect x="40" y="82" width="20" height="8" rx="3" fill="#ff4d6d"/><circle cx="20" cy="50" r="5" fill="#c5cee0"/><circle cx="80" cy="50" r="5" fill="#c5cee0"/>` },
  pirate: { bg: ['#ffe9b0', '#2a9d8f'], svg: `
    <path d="M10 44 Q50 -6 90 44 Q50 34 10 44Z" fill="#22223b"/><path d="M10 44 Q50 34 90 44 L86 50 Q50 40 14 50Z" fill="#e9c46a"/>
    <circle cx="50" cy="26" r="6" fill="#f5f5f5"/><path d="M45 26 h10 M50 21 v10" stroke="#22223b" stroke-width="2"/>
    <ellipse cx="50" cy="66" rx="28" ry="26" fill="#f1c9a0"/><path d="M40 52 Q60 44 68 58" stroke="#22223b" stroke-width="3" fill="none"/><ellipse cx="60" cy="58" rx="8" ry="7" fill="#22223b"/>
    ${eye(38, 60)}<path d="M38 78 Q50 86 62 78" stroke="#8a4b2a" stroke-width="3" fill="none" stroke-linecap="round"/><path d="M36 74 q14 6 28 0" stroke="#5a3a1a" stroke-width="2.5" fill="none"/>` },
  dragon: { bg: ['#ffd6c2', '#ef476f'], svg: `
    <path d="M20 40 L10 8 L36 26Z" fill="#ffd166"/><path d="M80 40 L90 8 L64 26Z" fill="#ffd166"/>
    <path d="M50 16 C80 16 88 44 82 66 Q50 96 18 66 C12 44 20 16 50 16Z" fill="#ef476f"/>
    <path d="M50 16 L46 28 L54 28Z M40 22 L38 32 L46 30Z M60 22 L62 32 L54 30Z" fill="#ffd166"/>
    <ellipse cx="50" cy="74" rx="20" ry="13" fill="#ff8fa3"/><circle cx="43" cy="74" r="2.6" fill="#8a1c3c"/><circle cx="57" cy="74" r="2.6" fill="#8a1c3c"/>
    <path d="M26 50 Q36 42 44 52 Q34 56 26 50Z" fill="#ffe66d"/><path d="M74 50 Q64 42 56 52 Q66 56 74 50Z" fill="#ffe66d"/><circle cx="37" cy="50" r="2.6" fill="#1d1d2b"/><circle cx="63" cy="50" r="2.6" fill="#1d1d2b"/>` },
  bunny: { bg: ['#ffe0ee', '#ff8fb1'], svg: `
    <ellipse cx="34" cy="20" rx="9" ry="22" fill="#fff"/><ellipse cx="66" cy="20" rx="9" ry="22" fill="#fff"/><ellipse cx="34" cy="22" rx="4.6" ry="15" fill="#ffb3c6"/><ellipse cx="66" cy="22" rx="4.6" ry="15" fill="#ffb3c6"/>
    <ellipse cx="50" cy="62" rx="31" ry="27" fill="#fff"/>${eye(38, 58)}${eye(62, 58)}
    <circle cx="28" cy="68" r="5" fill="#ffb3c6" opacity=".7"/><circle cx="72" cy="68" r="5" fill="#ffb3c6" opacity=".7"/><path d="M46 68 h8 l-4 4z" fill="#ff8fab"/><path d="M50 72 v4 M44 78 Q50 80 50 76 Q50 80 56 78" stroke="#c9849a" stroke-width="1.8" fill="none"/>` },
};

let uid = 0;
export function avatarSVG(id, size = 64) {
  const a = ART[id] || ART.fox;
  const gid = 'av' + (uid++);
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient></defs><rect width="100" height="100" fill="url(#${gid})"/>${a.svg}</svg>`;
}

// ---------------------------------------------------------------- frames
const SHAPES = {
  circle: 'M50 6a44 44 0 1 0 .01 0Z',
  hex: 'M50 4 L90 27 L90 73 L50 96 L10 73 L10 27Z',
  square: 'M20 6 H80 Q94 6 94 20 V80 Q94 94 80 94 H20 Q6 94 6 80 V20 Q6 6 20 6Z',
  shield: 'M50 4 L90 16 V52 Q90 82 50 97 Q10 82 10 52 V16Z',
  diamond: 'M50 3 L97 50 L50 97 L3 50Z',
  oct: 'M32 5 H68 L95 32 V68 L68 95 H32 L5 68 V32Z',
  pixel: 'M14 6 H86 V14 H94 V86 H86 V94 H14 V86 H6 V14 H14Z',
};
const dots = (n, r, size, fill, fn) => Array.from({ length: n }, (_, i) => { const a = (i / n) * Math.PI * 2 - Math.PI / 2; const x = 50 + Math.cos(a) * r, y = 50 + Math.sin(a) * r; return fn ? fn(x, y, a, i) : `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${size}" fill="${fill}"/>`; }).join('');
const petal = (x, y, a, c) => `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(a * 180 / Math.PI + 90).toFixed(0)})"><path d="M0 -6 C6 -5 6 4 0 7 C-6 4 -6 -5 0 -6Z" fill="${c}" stroke="#fff" stroke-width=".8"/></g>`;
const stroke = (shape, w, c, extra = '') => `<path d="${SHAPES[shape]}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round" ${extra}/>`;
const glowF = (c, id) => `<filter id="g${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

const FRAMES = {
  // ---- anime
  sakura: { shape: 'circle', deco: (c) => stroke('circle', 4, c[0]) + dots(8, 44, 0, '', (x, y, a) => petal(x, y, a, c[1])) },
  torii: { shape: 'square', deco: (c) => stroke('square', 4.5, c[0]) + `<rect x="14" y="0" width="72" height="9" rx="2" fill="${c[0]}"/><rect x="20" y="10" width="60" height="4" fill="${c[1]}"/>` },
  koi: { shape: 'circle', deco: (c) => stroke('circle', 5, c[0], 'stroke-dasharray="30 10"') + stroke('circle', 2, c[1]) },
  lantern: { shape: 'circle', deco: (c) => stroke('circle', 4, c[0]) + dots(6, 44, 0, '', (x, y) => `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="4.2" ry="5.4" fill="${c[1]}" stroke="${c[0]}" stroke-width="1.6"/>`) },
  bamboo: { shape: 'square', deco: (c) => stroke('square', 5, c[0]) + [16, 34, 52, 70].map((v) => `<path d="M${v} 3 v5 M${v} 92 v5 M3 ${v} h5 M92 ${v} h5" stroke="${c[1]}" stroke-width="2.5"/>`).join('') },
  fan: { shape: 'circle', deco: (c) => stroke('circle', 4, c[0]) + dots(10, 45, 0, '', (x, y, a) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.6" fill="${c[1]}" stroke="${c[0]}" stroke-width="1.4"/>`) },
  wave: { shape: 'circle', deco: (c) => stroke('circle', 5, c[0]) + stroke('circle', 2, c[1], 'stroke-dasharray="6 5"') },
  cloud: { shape: 'circle', deco: (c) => dots(11, 44, 0, '', (x, y) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6.2" fill="${c[1]}" stroke="${c[0]}" stroke-width="1.6"/>`) },
  // ---- gamer
  pixel: { shape: 'pixel', deco: (c) => stroke('pixel', 5, c[0], 'stroke-linejoin="miter"') + `<rect x="2" y="2" width="8" height="8" fill="${c[0]}"/><rect x="90" y="2" width="8" height="8" fill="${c[0]}"/><rect x="2" y="90" width="8" height="8" fill="${c[0]}"/><rect x="90" y="90" width="8" height="8" fill="${c[0]}"/>` },
  heart: { shape: 'circle', deco: (c) => stroke('circle', 4, c[1]) + [-30, 0, 30].map((dx) => `<path transform="translate(${50 + dx} 95) scale(.5)" d="M0 8 C-18 -4 -8 -18 0 -8 C8 -18 18 -4 0 8Z" fill="${c[0]}" stroke="#fff" stroke-width="2"/>`).join('') },
  shield: { shape: 'shield', deco: (c) => stroke('shield', 5, c[0]) + stroke('shield', 1.6, c[1]) },
  crown: { shape: 'circle', deco: (c) => stroke('circle', 5, c[0]) + `<path d="M26 12 L34 -2 L42 10 L50 -6 L58 10 L66 -2 L74 12Z" fill="${c[0]}" stroke="${c[1]}" stroke-width="2"/>` },
  neonring: { shape: 'circle', glow: true, deco: (c) => stroke('circle', 4, c[0], 'filter="url(#gG)"') + stroke('circle', 1.5, '#fff') },
  coin: { shape: 'circle', deco: (c) => stroke('circle', 6, c[0]) + dots(24, 44, 1.6, c[1]) },
  bolt: { shape: 'diamond', deco: (c) => stroke('diamond', 4.5, c[0]) + `<path d="M56 -2 L40 14 L50 14 L44 28 L60 10 L50 10Z" fill="${c[1]}" transform="translate(-6 -2)"/>` },
  badge: { shape: 'oct', deco: (c) => stroke('oct', 5, c[0]) + `<path transform="translate(50 100) scale(.9)" d="M0 -9 L3 -3 L10 -3 L4.5 1.6 L6.5 8.5 L0 4.5 L-6.5 8.5 L-4.5 1.6 L-10 -3 L-3 -3Z" fill="${c[1]}" stroke="${c[0]}" stroke-width="1.5"/>` },
  // ---- tech
  hex: { shape: 'hex', deco: (c) => stroke('hex', 5, c[0]) + stroke('hex', 1.5, c[1]) },
  circuit: { shape: 'circle', deco: (c) => stroke('circle', 3.6, c[1]) + dots(8, 44, 0, '', (x, y) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${c[0]}"/>`) + `<path d="M50 4 v-2 M96 50 h2 M50 96 v2 M4 50 h-2" stroke="${c[0]}" stroke-width="3"/>` },
  radar: { shape: 'circle', deco: (c) => stroke('circle', 4, c[0]) + `<g><path d="M50 50 L50 6 A44 44 0 0 1 82 19Z" fill="${c[0]}" opacity=".35"/><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="3s" repeatCount="indefinite"/></g>` },
  orbitring: { shape: 'circle', deco: (c) => stroke('circle', 2.5, c[0]) + `<g><circle cx="50" cy="4" r="5" fill="${c[0]}"/><circle cx="50" cy="96" r="3.4" fill="#fff"/><animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="5s" repeatCount="indefinite"/></g>` },
  glitchfr: { shape: 'circle', deco: (c) => `<g transform="translate(-2 0)">${stroke('circle', 3, c[0])}</g><g transform="translate(2 0)">${stroke('circle', 3, c[1])}</g>` + stroke('circle', 1.6, '#fff', 'stroke-dasharray="14 8"') },
  scanline: { shape: 'square', deco: (c) => ['M6 24 V6 H24', 'M76 6 H94 V24', 'M94 76 V94 H76', 'M24 94 H6 V76'].map((d) => `<path d="${d}" fill="none" stroke="${c[0]}" stroke-width="5" stroke-linecap="square"/>`).join('') },
  dataring: { shape: 'circle', deco: (c) => `<g>${stroke('circle', 5, c[0], 'stroke-dasharray="12 7"')}<animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur="8s" repeatCount="indefinite"/></g>` + stroke('circle', 1.5, c[1]) },
  target: { shape: 'circle', deco: (c) => stroke('circle', 3, c[0]) + `<path d="M50 -2 v14 M50 88 v14 M-2 50 h14 M88 50 h14" stroke="${c[0]}" stroke-width="4"/>` },
};

/** Avatar clipped to the frame shape, frame decoration on top. Returns an <svg> string. */
export function badgeSVG(avatarId, frameId, size = 56) {
  const f = FRAMES[frameId] || FRAMES.sakura;
  const meta = ITEMS.frame.find((i) => i.id === frameId) || ITEMS.frame[0];
  const a = ART[avatarId] || ART.fox;
  const gid = 'b' + (uid++);
  return `<svg class="badge" viewBox="-6 -6 112 112" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" overflow="visible">
  <defs><clipPath id="c${gid}"><path d="${SHAPES[f.shape]}" transform="translate(50 50) scale(.92) translate(-50 -50)"/></clipPath>
  <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a.bg[0]}"/><stop offset="1" stop-color="${a.bg[1]}"/></linearGradient>${glowF(meta.c[0], 'G')}</defs>
  <g clip-path="url(#c${gid})"><rect x="-6" y="-6" width="112" height="112" fill="url(#${gid})"/>${a.svg}</g>${f.deco(meta.c)}</svg>`.replace(/url\(#gG\)/g, `url(#g${'G'})`);
}
export const badgeHTML = (avatarId, frameId, size = 56) => `<span class="badge-wrap" style="width:${size}px;height:${size}px">${badgeSVG(avatarId, frameId, size)}</span>`;
