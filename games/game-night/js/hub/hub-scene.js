// The 3D lobby: big floating game cards that tilt toward the pointer, 3D props popping out of them.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTex } from '../core/toon.js';
import { Particles, SPRITE } from '../core/fx.js';
import { clamp, damp, lerp, TAU } from '../core/util.js';
import { audio } from '../audio/audio.js';

const FONT = '"Arial Rounded MT Bold","Trebuchet MS","Segoe UI",system-ui,sans-serif';
const CW = 512, CH = 720;

function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
function title(g, text, x, y, size, fill, stroke = '#1a0d4a', sw = 14, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  g.lineWidth = sw; g.strokeStyle = stroke; g.strokeText(text, 0, 6); g.strokeStyle = '#000a'; g.strokeText(text, 0, 12);
  g.strokeStyle = stroke; g.strokeText(text, 0, 0);
  const gr = g.createLinearGradient(0, -size / 2, 0, size / 2); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]);
  g.fillStyle = gr; g.fillText(text, 0, 0); g.restore();
}
function ribbon(g, text, y, c1, c2) {
  g.save(); g.translate(CW / 2, y);
  g.fillStyle = c2; g.beginPath(); g.moveTo(-250, -30); g.lineTo(250, -30); g.lineTo(250, 34); g.lineTo(-250, 34); g.closePath(); g.fill();
  const gr = g.createLinearGradient(0, -30, 0, 26); gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr;
  g.fillRect(-250, -32, 500, 58);
  g.font = `900 30px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff'; g.shadowColor = '#0008'; g.shadowBlur = 0; g.shadowOffsetY = 3; g.fillText(text, 0, 0); g.restore();
}

const ART = {
  ludo(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#39c6ff'); bg.addColorStop(0.55, '#5b6bff'); bg.addColorStop(1, '#2b1a8a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 28; i++) { g.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.04})`; g.beginPath(); g.arc((i * 97) % w, (i * 53) % h, 6 + (i % 5) * 4, 0, TAU); g.fill(); }
    // mini board
    const S = 340, x0 = (w - S) / 2, y0 = 215, c = S / 15;
    g.save(); g.shadowColor = '#000a'; g.shadowBlur = 24; g.shadowOffsetY = 12; g.fillStyle = '#fff'; rr(g, x0 - 10, y0 - 10, S + 20, S + 20, 26); g.fill(); g.restore();
    const cols = { r: '#ff4d5e', g: '#3ddc6a', y: '#ffd23f', b: '#3aa0ff' };
    const quad = (cx, cy, col) => { g.fillStyle = col; rr(g, x0 + cx * c, y0 + cy * c, 6 * c, 6 * c, 14); g.fill(); g.fillStyle = '#fff'; rr(g, x0 + (cx + 1) * c, y0 + (cy + 1) * c, 4 * c, 4 * c, 12); g.fill(); for (const [a, b] of [[1.7, 1.7], [3.3, 1.7], [1.7, 3.3], [3.3, 3.3]]) { g.fillStyle = col; g.beginPath(); g.arc(x0 + (cx + a) * c, y0 + (cy + b) * c, c * 0.5, 0, TAU); g.fill(); g.strokeStyle = '#0003'; g.lineWidth = 3; g.stroke(); } };
    quad(0, 0, cols.r); quad(9, 0, cols.g); quad(9, 9, cols.y); quad(0, 9, cols.b);
    for (let i = 0; i < 15; i++) for (let j = 0; j < 15; j++) {
      const inCross = (i >= 6 && i <= 8) || (j >= 6 && j <= 8);
      if (!inCross) continue;
      let col = '#f4f0ff';
      if (j === 7 && i >= 1 && i <= 5) col = cols.r; if (i === 7 && j >= 1 && j <= 5) col = cols.g; if (j === 7 && i >= 9 && i <= 13) col = cols.y; if (i === 7 && j >= 9 && j <= 13) col = cols.b;
      g.fillStyle = col; g.fillRect(x0 + i * c + 1, y0 + j * c + 1, c - 2, c - 2);
    }
    g.fillStyle = '#fff'; g.fillRect(x0 + 6 * c, y0 + 6 * c, 3 * c, 3 * c);
    const tri = (pts, col) => { g.fillStyle = col; g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(x0 + a * c, y0 + b * c) : g.moveTo(x0 + a * c, y0 + b * c))); g.closePath(); g.fill(); };
    tri([[6, 6], [9, 6], [7.5, 7.5]], cols.g); tri([[9, 6], [9, 9], [7.5, 7.5]], cols.y); tri([[9, 9], [6, 9], [7.5, 7.5]], cols.b); tri([[6, 9], [6, 6], [7.5, 7.5]], cols.r);
    title(g, 'LUDO', w / 2, 105, 130, ['#fff6a8', '#ffb000'], '#2b1466', 20, -0.03);
    ribbon(g, '3D DICE · CAPTURES', h - 56, '#ff7ab8', '#d0207a');
  },
  snake(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#12062e'); bg.addColorStop(1, '#03242e'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(60,255,200,.16)'; g.lineWidth = 2;
    for (let r = 0; r < 14; r++) for (let q = 0; q < 10; q++) { const x = q * 60 + (r % 2) * 30, y = 200 + r * 34; g.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; g.lineTo(x + Math.cos(a) * 32, y + Math.sin(a) * 32); } g.closePath(); g.stroke(); }
    const rad = g.createRadialGradient(w / 2, 380, 10, w / 2, 380, 260); rad.addColorStop(0, 'rgba(0,255,190,.35)'); rad.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rad; g.fillRect(0, 150, w, 460);
    const path = new Path2D(); path.moveTo(70, 560); path.bezierCurveTo(60, 380, 260, 520, 250, 380); path.bezierCurveTo(240, 250, 440, 330, 420, 250);
    for (const [wd, col, blur] of [[46, '#0a5a55', 30], [34, '#19e6b0', 26], [18, '#b6fff0', 8]]) { g.save(); g.lineCap = 'round'; g.lineWidth = wd; g.strokeStyle = col; g.shadowColor = '#19ffcc'; g.shadowBlur = blur; g.stroke(path); g.restore(); }
    g.save(); g.fillStyle = '#ffd23f'; g.shadowColor = '#ffd23f'; g.shadowBlur = 30; for (const [x, y, r] of [[110, 300, 12], [400, 470, 10], [140, 470, 8], [370, 350, 9]]) { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); } g.restore();
    title(g, 'SNAKE', w / 2, 92, 108, ['#b8fff0', '#19e6b0'], '#052a2a', 18, -0.03);
    title(g, 'ARENA', w / 2, 178, 78, ['#ffe9ff', '#ff5fd0'], '#3a0a3a', 14, -0.03);
    ribbon(g, 'LAST SNAKE ALIVE', h - 56, '#1fd6a5', '#0b7d63');
  },
  brawl(g, w, h) {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#ffb13d'); bg.addColorStop(0.5, '#ff5a1f'); bg.addColorStop(1, '#5a0f2a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.save(); g.translate(w / 2, 400); for (let i = 0; i < 20; i++) { g.rotate(TAU / 20); g.fillStyle = i % 2 ? 'rgba(255,240,180,.22)' : 'rgba(255,255,255,.06)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(-30, -520); g.lineTo(30, -520); g.closePath(); g.fill(); } g.restore();
    for (const [x, y, r, col] of [[130, 470, 90, '#3a1030'], [250, 420, 120, '#4a1440'], [380, 480, 90, '#3a1030'], [250, 500, 100, '#5a1a30']]) { g.fillStyle = col; g.globalAlpha = .55; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1; }
    g.strokeStyle = '#fff'; g.lineWidth = 8; g.globalAlpha = .75; g.beginPath(); g.arc(w / 2, 400, 110, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(w / 2 - 150, 400); g.lineTo(w / 2 - 60, 400); g.moveTo(w / 2 + 60, 400); g.lineTo(w / 2 + 150, 400); g.moveTo(w / 2, 250); g.lineTo(w / 2, 340); g.moveTo(w / 2, 460); g.lineTo(w / 2, 550); g.stroke(); g.globalAlpha = 1;
    title(g, 'BLASTER', w / 2, 92, 100, ['#fff6a8', '#ff9f1c'], '#4a0a1a', 18, -0.03);
    title(g, 'BRAWL', w / 2, 180, 96, ['#ffffff', '#ffd0d0'], '#4a0a1a', 18, -0.03);
    ribbon(g, 'FIRST TO 10 KOs', h - 56, '#ff5a5a', '#a0122a');
  },
};

function roundedShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0); s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI); s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
  return s;
}

function pipTexture(n, bg = '#fff', fg = '#2a1470') {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, 128, 128);
    const P = { 1: [[64, 64]], 2: [[36, 36], [92, 92]], 3: [[34, 34], [64, 64], [94, 94]], 4: [[36, 36], [92, 36], [36, 92], [92, 92]], 5: [[36, 36], [92, 36], [64, 64], [36, 92], [92, 92]], 6: [[38, 34], [90, 34], [38, 64], [90, 64], [38, 94], [90, 94]] }[n];
    g.fillStyle = fg; for (const [x, y] of P) { g.beginPath(); g.arc(x, y, 12, 0, TAU); g.fill(); }
  });
}
function woodTex() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#c98a4b'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#b87838' : '#d99a5b'; g.fillRect(0, i * 32, 128, 30); g.strokeStyle = '#6b4020'; g.lineWidth = 2; g.strokeRect(1, i * 32 + 1, 126, 30); }
    g.strokeStyle = '#3b2a1a'; g.lineWidth = 8; g.strokeRect(4, 4, 120, 120); g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.moveTo(124, 4); g.lineTo(4, 124); g.stroke();
  });
}

function pawn(color) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05, emissive: color, emissiveIntensity: 0.12 });
  const pts = [[0, 0], [0.34, 0], [0.36, 0.06], [0.3, 0.13], [0.16, 0.24], [0.13, 0.5], [0.24, 0.56], [0.2, 0.62], [0, 0.62]].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), m));
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 16), m); head.position.y = 0.8; g.add(head);
  return g;
}

export class HubScene {
  constructor(engine, { onSelect, games }) {
    this.engine = engine; this.onSelect = onSelect; this.games = games;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    this.camera.position.set(0, 0.8, 13); this.time = 0;
    this.pointer = new THREE.Vector2(9, 9); this.raycaster = new THREE.Raycaster();
    this.cards = []; this.focus = 1; this.focusF = 1; this.hover = -1; this.dragging = null;
    this._build();
    this.fx = new Particles(this.scene, engine);
    this._bind();
  }

  _build() {
    const sc = this.scene;
    // backdrop gradient
    sc.background = canvasTex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a0524'); gr.addColorStop(0.55, '#231060'); gr.addColorStop(0.8, '#4b1c86'); gr.addColorStop(1, '#8a2fa0'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    sc.fog = new THREE.Fog(0x1a0b45, 22, 60);
    // lights
    sc.add(new THREE.HemisphereLight(0xb9a5ff, 0x1a0b45, 0.9));
    const key = new THREE.DirectionalLight(0xfff0ff, 2.4); key.position.set(4, 8, 10); sc.add(key);
    const pinkL = new THREE.PointLight(0xff4fd8, 90, 26, 1.6); pinkL.position.set(-8, 2, 4); sc.add(pinkL);
    const cyanL = new THREE.PointLight(0x37e3ff, 90, 26, 1.6); cyanL.position.set(8, 2, 4); sc.add(cyanL);
    // stars
    const N = 500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * TAU, b = Math.acos(Math.random() * 0.9 + 0.05) , r = 70; pos[i * 3] = Math.cos(a) * Math.sin(b) * r; pos[i * 3 + 1] = Math.cos(b) * r * 0.7 - 6; pos[i * 3 + 2] = -Math.sin(a) * Math.sin(b) * r - 10; const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.25, 0.7, 0.75); col.set([c.r, c.g, c.b], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.9, fog: false, depthWrite: false }));
    sc.add(this.stars);
    // stage floor with glowing rings
    const ringTex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#0a0524'; g.fillRect(0, 0, w, h);
      for (let i = 1; i <= 6; i++) { g.strokeStyle = i % 2 ? '#ff4fd8' : '#37e3ff'; g.globalAlpha = 0.9 - i * 0.1; g.lineWidth = i === 6 ? 10 : 3; g.beginPath(); g.arc(w / 2, h / 2, i * 40, 0, TAU); g.stroke(); }
      g.globalAlpha = 0.25; g.strokeStyle = '#8b6bff'; g.lineWidth = 2; for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.lineTo(w / 2 + Math.cos(a) * 250, h / 2 + Math.sin(a) * 250); g.stroke(); }
    });
    const stage = new THREE.Mesh(new THREE.CircleGeometry(15, 96), new THREE.MeshStandardMaterial({ color: 0x120a35, emissive: 0xffffff, emissiveMap: ringTex, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.6, map: ringTex }));
    stage.rotation.x = -Math.PI / 2; stage.position.y = -3.3; sc.add(stage); this.stage = stage;
    // floating ambient shapes
    this.floaters = [];
    const geos = [new RoundedBoxGeometry(0.7, 0.7, 0.7, 3, 0.12), new THREE.IcosahedronGeometry(0.5, 0), new THREE.TorusGeometry(0.4, 0.14, 12, 24), new THREE.OctahedronGeometry(0.5)];
    const palette = [0xff4d6d, 0xffd23f, 0x37e3ff, 0x5bea6b, 0xc77dff, 0xff9f1c];
    for (let i = 0; i < 26; i++) {
      const m = new THREE.Mesh(geos[i % geos.length], new THREE.MeshStandardMaterial({ color: palette[i % palette.length], roughness: 0.35, metalness: 0.15, emissive: palette[i % palette.length], emissiveIntensity: 0.18 }));
      const a = Math.random() * TAU, r = 7 + Math.random() * 14;
      m.position.set(Math.cos(a) * r * 1.3, -2 + Math.random() * 9, -6 - Math.random() * 16 + Math.sin(a) * 3);
      m.scale.setScalar(0.5 + Math.random() * 1.2);
      m.userData = { s: Math.random() * 10, rs: [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5], y0: m.position.y };
      sc.add(m); this.floaters.push(m);
    }
    // soft blob shadow texture
    const blob = canvasTex(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.65)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    // cards
    const defs = [
      { id: 'ludo', accent: 0xffb000, props: this._propsLudo },
      { id: 'snake', accent: 0x19e6b0, props: this._propsSnake },
      { id: 'brawl', accent: 0xff5a1f, props: this._propsBrawl },
    ];
    const W = 3.5, H = 4.9, D = 0.3;
    const shape = roundedShape(W, H, 0.36);
    const bodyGeo = new THREE.ExtrudeGeometry(shape, { depth: D, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 4, curveSegments: 20 });
    bodyGeo.translate(0, 0, -D / 2);
    defs.forEach((d, i) => {
      const grp = new THREE.Group(); const inner = new THREE.Group(); grp.add(inner);
      const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ color: 0x1a1050, metalness: 0.7, roughness: 0.28, emissive: d.accent, emissiveIntensity: 0.1 }));
      inner.add(body);
      const rim = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(d.accent).multiplyScalar(0.9), side: THREE.BackSide, transparent: true, opacity: 0.9 }));
      rim.scale.set(1.045, 1.033, 1.6); inner.add(rim);
      const tex = canvasTex(CW, CH, ART[d.id]); tex.anisotropy = 8;
      const art = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.34, H - 0.34), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); art.position.z = D / 2 + 0.085; inner.add(art);
      art.scale.set(1, 1, 1);
      const sheenTex = canvasTex(256, 256, (g) => { const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,.75)'); gr.addColorStop(0.65, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); }, { repeat: true });
      const sheen = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.34, H - 0.34), new THREE.MeshBasicMaterial({ map: sheenTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      sheen.position.z = D / 2 + 0.09; inner.add(sheen); sheenTex.repeat.set(0.5, 0.5);
      const props = new THREE.Group(); props.position.z = D / 2 + 0.5; inner.add(props);
      const hit = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.4, H + 0.4), new THREE.MeshBasicMaterial({ visible: false })); hit.position.z = D / 2 + 0.2; inner.add(hit); hit.userData.card = i;
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), new THREE.MeshBasicMaterial({ map: blob, transparent: true, depthWrite: false })); shadow.rotation.x = -Math.PI / 2; shadow.position.y = -3.28; sc.add(shadow);
      sc.add(grp);
      const card = { id: d.id, i, grp, inner, body, rim, art, sheen, sheenTex, props, hit, shadow, accent: new THREE.Color(d.accent), hov: 0, rx: 0, ry: 0, px: 0, py: 0, x: 0, s: 1, tx: 0, ts: 1, anim: {}, phase: i * 2.1 };
      d.props.call(this, card);
      this.cards.push(card);
    });
  }

  // ---- 3D props that pop out of each card
  _propsLudo(card) {
    const die = new THREE.Mesh(new RoundedBoxGeometry(0.95, 0.95, 0.95, 5, 0.14), [1, 6, 2, 5, 3, 4].map((n) => new THREE.MeshStandardMaterial({ map: pipTexture(n), roughness: 0.25, metalness: 0.05 })));
    die.position.set(0, 0.6, 0.3); card.props.add(die); card.anim.die = die;
    const p1 = pawn(0xff4d5e), p2 = pawn(0x3aa0ff), p3 = pawn(0x3ddc6a);
    p1.position.set(-1.05, -1.5, 0.2); p2.position.set(1.05, -1.5, 0.2); p3.position.set(0, -1.75, 0.6); p1.scale.setScalar(1.2); p2.scale.setScalar(1.2); p3.scale.setScalar(1.35);
    card.props.add(p1, p2, p3); card.anim.pawns = [p1, p2, p3];
  }
  _propsSnake(card) {
    const N = 26, spheres = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const c = new THREE.Color().setHSL(0.42 - t * 0.2, 1, 0.5);
      const m = new THREE.Mesh(new THREE.SphereGeometry(i === 0 ? 0.36 : 0.28 - t * 0.12, 20, 14), new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.55), emissive: c, emissiveIntensity: 0.55, roughness: 0.3 }));
      card.props.add(m); spheres.push(m);
    }
    const eyeM = new THREE.MeshBasicMaterial({ color: 0xffffff }), pupM = new THREE.MeshBasicMaterial({ color: 0x110022 });
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), eyeM); e.position.set(sx * 0.17, 0.16, 0.24); spheres[0].add(e); const p = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), pupM); p.position.set(sx * 0.17, 0.16, 0.33); spheres[0].add(p); }
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 16), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 0.9 }));
    card.props.add(orb); card.anim.snake = spheres; card.anim.orb = orb;
  }
  _propsBrawl(card) {
    const barrel = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ color: 0xe02a45, roughness: 0.5, metalness: 0.3 });
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 24), bm); barrel.add(cyl);
    for (const y of [-0.3, 0.3]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 8, 24), new THREE.MeshStandardMaterial({ color: 0x2b2d42, metalness: 0.8, roughness: 0.4 })); t.rotation.x = Math.PI / 2; t.position.y = y; barrel.add(t); }
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.18, 3), new THREE.MeshBasicMaterial({ color: 0xffd23f })); sign.position.set(0, 0, 0.43); barrel.add(sign);
    barrel.position.set(-1.1, -1.4, 0.4); card.props.add(barrel);
    const crate = new THREE.Mesh(new RoundedBoxGeometry(0.85, 0.85, 0.85, 3, 0.05), new THREE.MeshStandardMaterial({ map: woodTex(), roughness: 0.8 })); crate.position.set(1.15, -1.5, 0.3); crate.rotation.y = 0.4; card.props.add(crate);
    const gun = new THREE.Group();
    const gm = new THREE.MeshStandardMaterial({ color: 0x2ad0c4, roughness: 0.3, metalness: 0.5 }), dm = new THREE.MeshStandardMaterial({ color: 0x1d1d2b, roughness: 0.4, metalness: 0.6 });
    gun.add(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.36, 0.34), gm));
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 12), dm); bar.rotation.z = Math.PI / 2; bar.position.x = 0.85; gun.add(bar);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.26), dm); grip.position.set(-0.3, -0.38, 0); grip.rotation.z = 0.25; gun.add(grip);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0xffd23f, emissiveIntensity: 3 })); tip.position.x = 1.28; gun.add(tip);
    gun.position.set(0, 0.35, 0.5); gun.rotation.z = 0.15; card.props.add(gun); card.anim.gun = gun; card.anim.tip = tip;
    card.anim.barrel = barrel; card.anim.crate = crate;
  }

  // ---- interaction
  _bind() {
    const el = this.engine.canvas;
    this._move = (e) => {
      const r = el.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (this.dragging && e.pointerId === this.dragging.id) {
        const dx = e.clientX - this.dragging.x;
        if (Math.abs(dx) > 8) this.dragging.moved = true;
        if (this.engine.portrait && this.dragging.moved) { this.focusF = clamp(this.dragging.f0 - dx / (r.width * 0.42), -0.3, 2.3); }
      }
    };
    this._down = (e) => { this._move(e); this.dragging = { id: e.pointerId, x: e.clientX, f0: this.focusF, moved: false, hit: this._pick(), t: performance.now() }; if (e.pointerType !== 'mouse') this.hover = this.dragging.hit; };
    this._up = (e) => {
      const d = this.dragging; if (!d || d.id !== e.pointerId) return; this.dragging = null;
      if (this.engine.portrait) { if (d.moved) { this.focus = clamp(Math.round(this.focusF), 0, 2); this.focusF = this.focus; audio.sfx('hover'); if (e.pointerType !== 'mouse') this.hover = -1; return; } }
      const hit = this._pick();
      if (!d.moved && hit >= 0 && hit === d.hit) {
        if (this.engine.portrait && hit !== this.focus) { this.focus = hit; audio.sfx('hover'); return; }
        this._pop(hit); this.onSelect(this.cards[hit].id);
      }
      if (e.pointerType !== 'mouse') this.hover = -1;
    };
    this._leave = () => { this.pointer.set(9, 9); this.hover = -1; };
    el.addEventListener('pointermove', this._move); el.addEventListener('pointerdown', this._down); el.addEventListener('pointerup', this._up); el.addEventListener('pointerleave', this._leave); el.addEventListener('pointercancel', this._leave);
  }
  unbind() { const el = this.engine.canvas; el.removeEventListener('pointermove', this._move); el.removeEventListener('pointerdown', this._down); el.removeEventListener('pointerup', this._up); el.removeEventListener('pointerleave', this._leave); el.removeEventListener('pointercancel', this._leave); }

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.cards.map((c) => c.hit), false);
    if (!hits.length) return -1;
    const i = hits[0].object.userData.card; this._hitUv = hits[0].uv; return i;
  }
  _pop(i) {
    const c = this.cards[i];
    this.fx.emit({ p: [c.grp.position.x, 0, 1.2], n: 30, spread: 1.6, vr: [3, 3, 1], life: 0.8, size: 0.16, size1: 0.02, color: c.accent, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, spin: 6, essential: true });
    c.pop = 1;
  }
  setFocus(i) { this.focus = i; }
  get focusIndex() { return this.focus; }

  layout() {
    const aspect = this.engine.aspect;
    if (aspect >= 1.15) {
      const gap = 4.2, half = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 13 * aspect;
      const s = clamp(half / 7.1, 0.5, 1.12);
      this.cards.forEach((c, i) => { c.tx = (i - 1) * gap * s; c.ts = s; });
      this.camBase = new THREE.Vector3(0, 0.6, 13);
    } else {
      const s = clamp(aspect * 1.05 + 0.25, 0.52, 1.0);
      this.cards.forEach((c, i) => { c.tx = (i - this.focusF) * 4.1 * s; c.ts = s * (i === Math.round(this.focusF) ? 1 : 0.8); });
      this.camBase = new THREE.Vector3(0, 0.3, 13.5);
    }
  }

  update(dt) {
    this.time += dt; const t = this.time;
    if (this.engine.portrait) this.focusF = this.dragging && this.dragging.moved ? this.focusF : damp(this.focusF, this.focus, 9, dt);
    this.layout();
    if (!this.dragging || !this.engine.portrait) { /* hover from pointer */ }
    if (!(this.dragging && this.dragging.moved) && this.pointer.x < 5) { const h = this._pick(); if (!this.dragging || this.dragging.moved) this.hover = h; else this.hover = h; }
    this.cards.forEach((c, i) => {
      const hov = this.hover === i ? 1 : 0;
      c.hov = damp(c.hov, hov, 10, dt);
      if (hov && this._hitUv) { c.px = damp(c.px, (this._hitUv.x - 0.5) * 2, 12, dt); c.py = damp(c.py, (this._hitUv.y - 0.5) * 2, 12, dt); }
      else { c.px = damp(c.px, 0, 4, dt); c.py = damp(c.py, 0, 4, dt); }
      const idleY = Math.sin(t * 0.7 + c.phase) * 0.1, idleX = Math.sin(t * 0.55 + c.phase * 1.7) * 0.05;
      c.ry = damp(c.ry, idleY * (1 - c.hov) + c.px * 0.5 * c.hov, 10, dt);
      c.rx = damp(c.rx, idleX * (1 - c.hov) - c.py * 0.38 * c.hov, 10, dt);
      c.x = damp(c.x, c.tx, 8, dt); c.s = damp(c.s, c.ts * (1 + c.hov * 0.09 + (c.pop || 0) * 0.1), 10, dt);
      c.pop = Math.max(0, (c.pop || 0) - dt * 3);
      const bob = Math.sin(t * 1.1 + c.phase * 1.3) * 0.16;
      c.grp.position.set(c.x, -0.5 + bob + c.hov * 0.2, c.hov * 1.1);
      c.grp.scale.setScalar(c.s);
      c.inner.rotation.set(c.rx, c.ry, Math.sin(t * 0.4 + c.phase) * 0.012 * (1 - c.hov));
      c.rim.material.color.copy(c.accent).multiplyScalar(0.6 + c.hov * 0.9 + Math.sin(t * 2 + c.phase) * 0.1);
      c.art.material.color.setScalar(0.92 + c.hov * 0.12);
      c.body.material.emissiveIntensity = 0.1 + c.hov * 0.25;
      c.sheen.material.opacity = c.hov * 0.5; c.sheenTex.offset.set(clamp(0.25 - c.px * 0.22, 0.02, 0.48), clamp(0.25 - c.py * 0.2, 0.02, 0.48));
      c.props.position.z = 0.42 + c.hov * 0.4; c.props.scale.setScalar(1 + c.hov * 0.12);
      const off = this.engine.portrait ? Math.max(0, Math.abs(i - this.focusF) - 0.6) : 0;
      c.grp.visible = c.shadow.visible = off < 1.9;
      c.shadow.position.x = c.grp.position.x; c.shadow.scale.setScalar(c.s * (0.9 - c.hov * 0.1)); c.shadow.material.opacity = 0.85 - c.hov * 0.25;
      this._animProps(c, t, dt);
      if (c.hov > 0.5 && Math.random() < dt * 22) this.fx.emit({ p: [c.grp.position.x + (Math.random() - 0.5) * 3.4 * c.s, c.grp.position.y + (Math.random() - 0.5) * 4.6 * c.s, 0.8], n: 1, v: [0, 0.5, 0.6], vr: 0.4, life: 0.9, size: 0.12, size1: 0.01, color: c.accent, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, spin: 4, essential: true });
    });
    // ambient
    for (const f of this.floaters) {
      const u = f.userData; f.rotation.x += u.rs[0] * dt * 0.6; f.rotation.y += u.rs[1] * dt * 0.6; f.rotation.z += u.rs[2] * dt * 0.6; f.position.y = u.y0 + Math.sin(t * 0.4 + u.s) * 0.5;
    }
    if (Math.random() < dt * 5) this.fx.emit({ p: [(Math.random() - 0.5) * 22, -2.5 + Math.random() * 1, -2 + Math.random() * 4], n: 1, v: [0, 0.6, 0], life: 4, size: 0.12, size1: 0.02, color: Math.random() < 0.5 ? 0xff7ad9 : 0x6ee7ff, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT });
    this.stars.rotation.y += dt * 0.004;
    this.stage.material.emissiveIntensity = 0.75 + Math.sin(t * 1.5) * 0.15;
    // camera parallax
    const px = this.pointer.x < 5 ? this.pointer.x : 0, py = this.pointer.x < 5 ? this.pointer.y : 0;
    this.camera.position.x = damp(this.camera.position.x, this.camBase.x + px * 0.7, 3, dt); this.camera.position.y = damp(this.camera.position.y, this.camBase.y + py * 0.4, 3, dt); this.camera.position.z = this.camBase.z;
    this.camera.lookAt(this.camera.position.x * 0.3, 0.1, 0);
    this.fx.update(dt);
  }

  _animProps(c, t, dt) {
    const a = c.anim, spin = 1 + c.hov * 3;
    if (a.die) { a.die.rotation.x += dt * 0.9 * spin; a.die.rotation.y += dt * 1.3 * spin; a.die.position.y = 0.62 + Math.sin(t * 1.6) * 0.14; a.pawns.forEach((p, i) => { p.position.y += (-1.5 + (i === 2 ? -0.25 : 0) + Math.max(0, Math.sin(t * 2.2 + i * 2)) * 0.28 * (0.5 + c.hov) - p.position.y) * Math.min(1, dt * 12); p.rotation.y += dt * 0.6; }); }
    if (a.snake) {
      const n = a.snake.length;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), ph = t * 1.6 - u * 5;
        const x = Math.sin(ph) * (0.95 - u * 0.15) + Math.sin(u * 3 + 1) * 0.3, y = 1.2 - u * 3.7 + Math.cos(ph * 0.8) * 0.15;
        a.snake[i].position.set(x, y, 0.15 + Math.sin(ph * 1.3) * 0.25);
      }
      const h = a.snake[0], p1 = a.snake[1]; h.lookAt(h.position.x + (h.position.x - p1.position.x) * 4, h.position.y + (h.position.y - p1.position.y) * 4, 4);
      a.orb.position.set(Math.sin(t * 1.1) * 0.6 + 0.9, 1.5 + Math.sin(t * 2.3) * 0.15, 0.4); a.orb.scale.setScalar(1 + Math.sin(t * 6) * 0.15);
    }
    if (a.gun) {
      a.gun.rotation.z = 0.15 + Math.sin(t * 1.3) * 0.08 + c.hov * 0.1; a.gun.position.y = 0.35 + Math.sin(t * 1.5) * 0.1; a.tip.scale.setScalar(1 + Math.max(0, Math.sin(t * 9)) * (0.6 + c.hov));
      a.barrel.rotation.y += dt * 0.5; a.crate.rotation.y += dt * 0.3; a.crate.rotation.x = Math.sin(t) * 0.1;
      if (c.hov > 0.4 && Math.random() < dt * 8) this.fx.emit({ p: [c.grp.position.x + 1.4 * c.s, c.grp.position.y + 0.7 * c.s, 1.1], n: 1, v: [7, 0, 0], life: 0.5, size: 0.16, size1: 0.04, color: 0xffe9a0, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STREAK, essential: true, rot: 0 });
    }
  }

  dispose() { this.unbind(); this.fx.dispose(); this.scene.traverse((o) => { o.geometry?.dispose?.(); }); }
}
