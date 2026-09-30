// Visual builders for flags, pendulums, platforms, projectiles and debris.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { blockMaterial, textures } from './blocks.js';
import { flagTexture, rng, applyBoxUV } from './textures.js';
import { AMMO } from './config.js';

let _flagTex = null;
export const FLAG = { baseH: 0.35, poleH: 2.4 };

export function makeFlag() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, FLAG.poleH, 8),
    new THREE.MeshStandardMaterial({ color: 0x5b3a20, roughness: 0.8 }));
  pole.position.y = FLAG.baseH + FLAG.poleH / 2;
  pole.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffc830, metalness: 0.7, roughness: 0.3 }));
  knob.position.y = FLAG.baseH + FLAG.poleH + 0.08;
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.8, FLAG.baseH, 0.8, 2, 0.05), blockMaterial('sstone'));
  base.position.y = FLAG.baseH / 2; base.castShadow = true;
  _flagTex = _flagTex || flagTexture();
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.05, 12, 6),
    new THREE.MeshStandardMaterial({ map: _flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.geometry.translate(0.8 + 0.05, 0, 0);
  cloth.position.y = FLAG.baseH + FLAG.poleH - 0.62;
  cloth.castShadow = true;
  cloth.userData.base = cloth.geometry.attributes.position.array.slice();
  g.add(base, pole, knob, cloth);
  g.userData.cloth = cloth;
  return g;
}

export function waveFlag(g, t, phase, fell) {
  const cloth = g.userData.cloth, pos = cloth.geometry.attributes.position, b = cloth.userData.base;
  const amp = fell ? 0.05 : 0.14;
  for (let i = 0; i < pos.count; i++) {
    const x = b[i * 3], y = b[i * 3 + 1];
    const k = Math.max(0, (x - 0.05)) / 1.6;
    pos.setZ(i, Math.sin(x * 3.4 - t * 5.5 + phase) * amp * k * 1.6 + Math.sin(y * 4 + t * 3 + phase) * 0.03 * k);
    pos.setY(i, y - k * k * 0.10);
  }
  pos.needsUpdate = true;
  cloth.geometry.computeVertexNormals();
}

export function makePendulum(len, r) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x4b5058, metalness: 0.65, roughness: 0.4 });
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, len, 8), new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.7, roughness: 0.5 }));
  rod.position.y = -len / 2; rod.castShadow = true;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), iron);
  ball.position.y = -len; ball.castShadow = true;
  g.add(rod, ball);
  const spikeG = new THREE.ConeGeometry(r * 0.2, r * 0.55, 8);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    [.7, .7, 0], [-.7, .7, 0], [.7, -.7, 0], [-.7, -.7, 0], [0, .7, .7], [0, -.7, .7], [0, .7, -.7], [0, -.7, -.7],
    [.7, 0, .7], [-.7, 0, .7], [.7, 0, -.7], [-.7, 0, -.7]];
  const up = new THREE.Vector3(0, 1, 0);
  for (const d of dirs) {
    const v = new THREE.Vector3(...d).normalize();
    const s = new THREE.Mesh(spikeG, iron);
    s.position.copy(v).multiplyScalar(r + r * 0.18).add(new THREE.Vector3(0, -len, 0));
    s.quaternion.setFromUnitVectors(up, v);
    s.castShadow = true;
    g.add(s);
  }
  const hub = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 8, 16), iron);
  hub.position.y = 0; g.add(hub);
  return g;
}

export function makePlatform(p) {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new RoundedBoxGeometry(p.w, p.th, p.d, 2, 0.06), blockMaterial('swood'));
  applyBoxUV(deck.geometry, [p.w, p.th, p.d], 2);
  deck.castShadow = deck.receiveShadow = true;
  g.add(deck);
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3f46, metalness: 0.6, roughness: 0.5 });
  for (const sx of [-1, 1]) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, p.d + 0.1), iron);
    bar.position.set(sx * (p.w / 2 - 0.5), -p.th / 2 - 0.1, 0); bar.castShadow = true; g.add(bar);
  }
  if (p.axis !== 'y') {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 14), new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 0.8 }));
      wh.rotation.x = Math.PI / 2;
      wh.position.set(sx * (p.w / 2 - 0.9), -p.th / 2 - 0.25, sz * (p.d / 2 + 0.1)); wh.castShadow = true; g.add(wh);
    }
  }
  return g;
}

// ---- projectiles ----
const _pt = {};
function noisySphere(r, detail, amp, seed) {
  const geo = new THREE.IcosahedronGeometry(r, detail);
  const R = rng(seed), pos = geo.attributes.position, v = new THREE.Vector3();
  const cache = new Map();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)}${v.y.toFixed(3)}${v.z.toFixed(3)}`;
    if (!cache.has(key)) cache.set(key, 1 + (R() - 0.5) * amp);
    v.multiplyScalar(cache.get(key));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

export function makeProjectileMesh(type) {
  const A = AMMO[type], r = A.r;
  const g = new THREE.Group();
  const T = textures();
  if (type === 'rock' || type === 'boulder') {
    const geo = noisySphere(r, type === 'boulder' ? 3 : 2, type === 'boulder' ? 0.28 : 0.18, type === 'boulder' ? 9 : 4);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: T.stone, color: type === 'boulder' ? 0x8d8f96 : 0xb8bcc2, roughness: 0.95, flatShading: true }));
    m.castShadow = true; g.add(m);
  } else if (type === 'cluster') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf0a92e, roughness: 0.4, metalness: 0.35 }));
    m.castShadow = true; g.add(m);
    for (const y of [-0.45, 0, 0.45]) {
      const rr = Math.sqrt(1 - y * y) * r * 1.01;
      const t = new THREE.Mesh(new THREE.TorusGeometry(rr, r * 0.07, 8, 28), new THREE.MeshStandardMaterial({ color: 0x40352a, roughness: 0.6, metalness: 0.5 }));
      t.rotation.x = Math.PI / 2; t.position.y = y * r; g.add(t);
    }
  } else if (type === 'bouncy') {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64;
    const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#e8388f'; x.fillRect(i * 16, 0, 16, 64); }
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ map: tx, roughness: 0.22, metalness: 0, emissive: 0x330011 }));
    m.castShadow = true; g.add(m);
  } else if (type === 'bomb') {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({ color: 0x2a2b31, roughness: 0.3, metalness: 0.7 }));
    m.castShadow = true; g.add(m);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.28, r * 0.34, r * 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x8b6f47, metalness: 0.6, roughness: 0.4 }));
    cap.position.y = r * 0.98; g.add(cap);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 6), new THREE.MeshStandardMaterial({ color: 0xd9c9a0, roughness: 1 }));
    fuse.position.set(0.09, r * 1.22 + 0.05, 0); fuse.rotation.z = -0.4; g.add(fuse);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a20 }));
    tip.position.set(0.2, r * 1.22 + 0.27, 0); g.add(tip);
    g.userData.tip = tip;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.06, 8, 28), new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.5 }));
    g.add(ring);
    g.userData.ring = ring;
  }
  return g;
}

export function makeMiniRock(r, color = 0xe0a030) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3 }));
  m.castShadow = true;
  return m;
}

// ---- debris pool visuals ----
export function debrisMesh(kind, n) {
  let geo, mat;
  if (kind === 'glass') {
    geo = new THREE.TetrahedronGeometry(0.2, 0); geo.scale(1.5, 0.45, 1.2);
    mat = new THREE.MeshStandardMaterial({ color: 0xd4f2ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.7, envMapIntensity: 2 });
  } else if (kind === 'wood') {
    geo = new THREE.BoxGeometry(0.55, 0.07, 0.1);
    mat = new THREE.MeshStandardMaterial({ map: textures().wood, roughness: 0.85 });
  } else {
    geo = new THREE.DodecahedronGeometry(0.2, 0); geo.scale(1, 0.75, 0.9);
    mat = new THREE.MeshStandardMaterial({ map: textures().stone, roughness: 0.95, flatShading: true });
  }
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.castShadow = kind !== 'glass';
  const z = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < n; i++) mesh.setMatrixAt(i, z);
  return mesh;
}

// floating chevron that marks a standing flag, drawn on top of everything
let _markTex = null;
export function makeFlagMarker() {
  if (!_markTex) {
    const c = document.createElement('canvas'); c.width = c.height = 96;
    const g = c.getContext('2d');
    g.lineJoin = 'round';
    g.beginPath(); g.moveTo(14, 20); g.lineTo(48, 82); g.lineTo(82, 20); g.lineTo(62, 20); g.lineTo(48, 46); g.lineTo(34, 20); g.closePath();
    g.fillStyle = '#ef3b3b'; g.fill();
    g.lineWidth = 8; g.strokeStyle = '#fff'; g.stroke();
    g.lineWidth = 3; g.strokeStyle = '#7a1010'; g.stroke();
    _markTex = new THREE.CanvasTexture(c); _markTex.colorSpace = THREE.SRGBColorSpace;
  }
  const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: _markTex, transparent: true, depthTest: false, depthWrite: false, opacity: 0.92, fog: false }));
  m.scale.set(1.5, 1.5, 1); m.renderOrder = 15;
  return m;
}
