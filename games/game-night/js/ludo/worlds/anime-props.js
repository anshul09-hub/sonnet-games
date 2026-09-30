// Village dressing for the anime meadow: PBR-lit houses, torii, pagoda, water wheel, stalls, well, boats, pond, groves,
// rocks, fences, butterflies, chimney smoke, light shafts. Everything is built from merged geometry + procedural textures.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pbr, worldUV, procTex } from '../../core/proc.js';
import { toon } from '../../core/toon.js';
import { Rng, TAU, lerp, clamp, wrapAngle } from '../../core/util.js';
import { SPRITE } from '../../core/fx.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();

/** Collects geometry per material and builds one merged mesh per material. */
class Merger {
  constructor() { this.b = new Map(); }
  add(geo, mat, m4, uv = mat.userData.uv ?? 0.6) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(m4); if (uv) worldUV(g, uv);
    (this.b.get(mat) || this.b.set(mat, []).get(mat)).push(g);
  }
  box(w, h, d, mat, m4, uv) { this.add(new THREE.BoxGeometry(w, h, d), mat, m4, uv); }
  cyl(rt, rb, h, seg, mat, m4, uv) { this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, m4, uv); }
  build(cast = true) {
    const g = new THREE.Group();
    for (const [mat, list] of this.b) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); list.forEach((x) => x.dispose()); }
    return g;
  }
}

function mats() {
  const u = (m, v) => { m.userData.uv = v; return m; };
  const roofBlue = u(pbr('roof', { base: 0x3a4d63, repeat: [1, 1], rough: 0.5, metal: 0.2, normal: 1.1 }), 0.55);
  const roofRed = u(pbr('roof', { base: 0x8a3a2c, rough: 0.55, metal: 0.15 }), 0.55);
  return {
    woodDark: u(pbr('wood', { base: 0x6b4427, dark: 0x2c190b, planks: 8, rough: 0.75 }), 0.5),
    woodLight: u(pbr('wood', { base: 0xb98650, dark: 0x6a4626, planks: 7, rough: 0.7 }), 0.5),
    plaster: u(pbr('plaster', { base: 0xf3ead6, rough: 0.9 }), 0.35),
    stone: u(pbr('stone', { base: 0x9c978c, cells: 5, rough: 0.9, normal: 1.2 }), 0.45),
    roofBlue, roofRed,
    thatch: u(pbr('thatch', { base: 0xc09a58, rough: 1 }), 0.6),
    lacquer: new THREE.MeshPhysicalMaterial({ color: 0xc23a2a, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.18 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.5 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe8b84a, roughness: 0.3, metalness: 0.9 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xfff4d6, roughness: 0.9, emissive: 0xffc46b, emissiveIntensity: 0.2, side: THREE.DoubleSide }),
    bamboo: new THREE.MeshStandardMaterial({ color: 0x8fb04a, roughness: 0.5 }),
    leafG: new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.8, side: THREE.DoubleSide }),
    pine: new THREE.MeshStandardMaterial({ color: 0x2f6a3e, roughness: 0.9, flatShading: true }),
    hay: u(pbr('thatch', { base: 0xd8b458, rough: 1 }), 0.9),
    fabricR: new THREE.MeshStandardMaterial({ color: 0xd94a4a, roughness: 0.9, side: THREE.DoubleSide }),
    fabricW: new THREE.MeshStandardMaterial({ color: 0xf5f1e6, roughness: 0.9, side: THREE.DoubleSide }),
  };
}

/** Gable roof with a curved profile and upturned eaves; runs along z. */
function roofGeometry(halfW, height, length, thick = 0.28) {
  const N = 26, top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N * 2 - 1, ax = Math.abs(t);
    const y = height * (1 - Math.pow(ax, 1.55)) + 0.5 * Math.pow(Math.max(0, (ax - 0.82) / 0.18), 2);
    top.push(new THREE.Vector2(t * halfW, y)); bot.push(new THREE.Vector2(t * halfW, y - thick));
  }
  const s = new THREE.Shape([...top, ...bot.reverse()]);
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -length / 2);
  return g;
}

function makeHouse(M, mg, x, z, ry, variant, rng) {
  const w = rng.range(5.4, 7.2), d = rng.range(4.6, 5.8), hWall = 2.5, roof = variant === 0 ? M.roofBlue : variant === 1 ? M.roofRed : M.thatch;
  const at = (lx, ly, lz, rx = 0, ryy = 0, rz = 0, sx = 1, sy = sx, sz = sx) => { const m = M4(lx, ly, lz, rx, ryy, rz, sx, sy, sz); const r = new THREE.Matrix4().makeRotationY(ry); return new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(x, 0, z), r).multiply(m); };
  mg.box(w + 1.2, 0.5, d + 1.2, M.stone, at(0, 0.0, 0));
  // walls with timber framing
  mg.box(w, hWall, d, M.plaster, at(0, 0.25 + hWall / 2, 0));
  for (const px of [-w / 2, w / 2]) for (const pz of [-d / 2, d / 2]) mg.cyl(0.16, 0.16, hWall + 0.15, 8, M.woodDark, at(px, 0.25 + hWall / 2, pz));
  for (let i = 1; i < 4; i++) { const px = -w / 2 + (w * i) / 4; mg.box(0.12, hWall, 0.12, M.woodDark, at(px, 0.25 + hWall / 2, d / 2 + 0.02)); mg.box(0.12, hWall, 0.12, M.woodDark, at(px, 0.25 + hWall / 2, -d / 2 - 0.02)); }
  for (const y of [0.55, 0.25 + hWall - 0.05]) { mg.box(w + 0.2, 0.16, 0.16, M.woodDark, at(0, y, d / 2 + 0.03)); mg.box(w + 0.2, 0.16, 0.16, M.woodDark, at(0, y, -d / 2 - 0.03)); mg.box(0.16, 0.16, d + 0.2, M.woodDark, at(w / 2 + 0.03, y, 0)); mg.box(0.16, 0.16, d + 0.2, M.woodDark, at(-w / 2 - 0.03, y, 0)); }
  // engawa (veranda) with railing at the front
  mg.box(w + 0.6, 0.14, 1.3, M.woodLight, at(0, 0.62, d / 2 + 0.75));
  for (let i = 0; i < 6; i++) mg.cyl(0.06, 0.06, 0.9, 6, M.woodDark, at(-w / 2 + 0.2 + (i * (w - 0.4)) / 5, 1.1, d / 2 + 1.3));
  mg.box(w, 0.09, 0.09, M.woodDark, at(0, 1.55, d / 2 + 1.3));
  // steps
  mg.box(1.6, 0.16, 0.5, M.stone, at(0, 0.3, d / 2 + 1.6)); mg.box(1.8, 0.16, 0.5, M.stone, at(0, 0.14, d / 2 + 2.0));
  // roof: main + lower skirt roof
  const rg = roofGeometry(w / 2 + 1.3, 2.5, d + 2.2, 0.32);
  mg.add(rg, roof, at(0, 0.25 + hWall - 0.1, 0), 0.5);
  // ridge cap + gable ends
  mg.cyl(0.16, 0.16, d + 2.5, 8, M.black, at(0, 0.25 + hWall + 2.42, 0, Math.PI / 2, 0, 0));
  for (const s of [-1, 1]) { const tri = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.3, 0), new THREE.Vector2(w / 2 + 0.3, 0), new THREE.Vector2(0, 1.9)]); mg.add(new THREE.ExtrudeGeometry(tri, { depth: 0.1, bevelEnabled: false }), M.plaster, at(0, 0.25 + hWall, s * (d / 2) - (s > 0 ? 0 : 0.1)), 0.35); }
  for (let i = 0; i < 3; i++) mg.box(w / 3 - 0.5, 1.7, 0.05, M.paper, at(-w / 3 + i * (w / 3), 1.5, d / 2 + 0.07), 0);
  mg.box(1.1, 1.7, 0.05, M.paper, at(w / 2 - 0.2 - 0.6, 1.5, -d / 2 - 0.07), 0);
  return { w, d, chimney: new THREE.Vector3(x, 0, z).add(new THREE.Vector3(w * 0.25, 0.25 + hWall + 2.6, -d * 0.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)) };
}

function makeTorii(M, mg, x, z, ry, scale = 1) {
  const at = (lx, ly, lz, rx = 0, ryy = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().multiplyMatrices(new THREE.Matrix4().makeTranslation(x, 0, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(new THREE.Matrix4().makeScale(scale, scale, scale)), M4(lx, ly, lz, rx, ryy, rz, sx, sy, sz));
  for (const s of [-1, 1]) { mg.cyl(0.3, 0.36, 6.4, 16, M.lacquer, at(s * 2.5, 3.2, 0), 0); mg.cyl(0.45, 0.45, 0.35, 16, M.black, at(s * 2.5, 0.18, 0), 0); }
  mg.box(6.6, 0.32, 0.36, M.lacquer, at(0, 4.9, 0), 0); mg.box(5.4, 0.28, 0.3, M.lacquer, at(0, 5.6, 0), 0);
  mg.box(7.4, 0.42, 0.55, M.black, at(0, 6.2, 0), 0);
  for (const s of [-1, 1]) mg.box(1.2, 0.42, 0.55, M.black, at(s * 3.95, 6.38, 0, 0, 0, s * 0.35), 0);
  mg.box(0.8, 0.9, 0.16, M.gold, at(0, 5.25, 0.02), 0);
}

function makePagoda(M, mg, x, z) {
  const at = (lx, ly, lz, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().makeTranslation(x, 0, z).multiply(M4(lx, ly, lz, rx, ry, rz, sx, sy, sz));
  mg.cyl(9, 12, 6, 24, M.stone, at(0, -3, 0));
  let y = 3;
  for (let i = 0; i < 5; i++) {
    const w = 8 - i * 1.2; mg.box(w, 3, w, M.plaster, at(0, y + 1.5, 0), 0.2);
    for (const px of [-1, 1]) for (const pz of [-1, 1]) mg.cyl(0.18, 0.18, 3, 8, M.lacquer, at(px * w / 2, y + 1.5, pz * w / 2), 0);
    mg.add(new THREE.ConeGeometry((w + 4) / 1.414, 1.9, 4), i % 2 ? M.roofRed : M.roofBlue, at(0, y + 3.5, 0, 0, Math.PI / 4, 0), 0.2);
    y += 3.8;
  }
  mg.cyl(0.12, 0.12, 5, 6, M.gold, at(0, y + 1.5, 0)); for (let i = 0; i < 6; i++) mg.add(new THREE.TorusGeometry(0.4 - i * 0.04, 0.05, 6, 14), M.gold, at(0, y + 0.3 + i * 0.5, 0, Math.PI / 2));
}

export function buildVillageProps(ctx, root, V, D, rng, GY, blockers) {
  const M = mats(), { engine, fx } = ctx;
  const glowNight = V.night ? 3 : V.sunset ? 1.6 : 0.25;
  // keep dressing out of the board footprint, the dice-tray spots (side / front layouts) and the camera lane
  const avoid = [{ x: 12.4, z: 0, r: 6.8 }, { x: 0, z: 12.4, r: 6.8 }];
  const free = (x, z, pad = 0) => !(Math.abs(x) < 9.8 && Math.abs(z) < 9.8) && !avoid.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + pad) && !blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r + pad);
  M.paper.emissiveIntensity = glowNight;
  const mg = new Merger(), anim = { smoke: [], wheel: null, boats: [], lanterns: [], butterflies: [], koi: [], glows: [], shafts: [] };
  // ---- houses on the left and back-left, leaving the camera (+z) and tray (+x) sides open
  const houseSpots = [[-19, -3, Math.PI / 2 + 0.2], [-17, -13, 0.7], [-6, -21, 0.1], [7, -20, -0.25], [17, -15, -0.75]];
  const nHouses = Math.max(2, Math.round(houseSpots.length * Math.min(1, D + 0.2)));
  houseSpots.slice(0, nHouses).forEach(([x, z, ry], i) => {
    const h = makeHouse(M, mg, x, z, ry, i % 3, rng); blockers.push({ x, z, r: 5.0 });
    anim.smoke.push(h.chimney);
    // warm window glows + door lantern (emissive, bloom picks them up)
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xffb45a, emissiveIntensity: glowNight * 1.4 })); const off = new THREE.Vector3(s * (h.w / 2 - 0.4), 1.6, h.d / 2 + 1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry); l.position.set(x + off.x, off.y, z + off.z); root.add(l); anim.glows.push(l.material); }
  });
  // ---- torii gate + pagoda landmarks (behind the board, visible from the game camera)
  makeTorii(M, mg, 0, -23.5, 0, 1.15);
  makePagoda(M, mg, -62, -95);
  // ---- well
  { const x = 14.5, z = 9.5; mg.cyl(1.05, 1.15, 1.0, 20, M.stone, M4(x, GY + 0.5, z)); for (const s of [-1, 1]) mg.cyl(0.09, 0.09, 2.4, 8, M.woodDark, M4(x + s * 0.9, GY + 1.9, z)); mg.box(2.2, 0.16, 1.5, M.woodDark, M4(x, GY + 3.05, z)); mg.add(new THREE.ConeGeometry(1.6, 0.9, 4), M.roofBlue, M4(x, GY + 3.6, z, 0, Math.PI / 4, 0), 0.5); mg.cyl(0.05, 0.05, 1.7, 6, M.woodDark, M4(x, GY + 2.15, z, 0, 0, Math.PI / 2)); blockers.push({ x, z, r: 2.2 }); }
  // ---- market stalls (striped awnings, crates, fruit)
  const awn = new THREE.MeshStandardMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f5f1e6' : '#d94a4a'; g.fillRect(i * 16, 0, 16, 128); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })(), roughness: 0.85, side: THREE.DoubleSide });
  const fruit = [];
  [[-13.5, 13.2, 0.6], [-10.5, 16.5, 0.2]].slice(0, D < 0.5 ? 1 : 2).forEach(([x, z, ry]) => {
    const at = (lx, ly, lz, rx = 0, ryy = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().makeTranslation(x, GY, z).multiply(new THREE.Matrix4().makeRotationY(ry)).multiply(M4(lx, ly, lz, rx, ryy, rz, sx, sy, sz));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) mg.cyl(0.07, 0.07, 2.6, 6, M.woodDark, at(sx * 1.4, 1.3, sz * 0.8), 0);
    mg.box(3, 0.9, 1.5, M.woodLight, at(0, 0.45, 0), 0.5); mg.box(3.2, 0.1, 1.7, M.woodDark, at(0, 0.95, 0), 0.5);
    mg.add(new THREE.PlaneGeometry(3.4, 2.0, 1, 1), awn, at(0, 2.7, -0.15, -0.55), 0);
    mg.add(new THREE.PlaneGeometry(3.4, 0.6, 1, 1), awn, at(0, 2.15, 0.92, 0.1), 0);
    for (let i = 0; i < 9; i++) fruit.push([new THREE.Vector3(x, 0, z).add(new THREE.Vector3(-1.0 + (i % 5) * 0.5, 1.12, -0.3 + Math.floor(i / 5) * 0.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), ry)).setY(GY + 1.12), i]);
    const lan = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff8a3a, emissiveIntensity: glowNight * 1.3 })); lan.position.set(x, GY + 2.2, z).add(new THREE.Vector3(0, 0, 0)); root.add(lan); anim.glows.push(lan.material);
    blockers.push({ x, z, r: 2.6 });
  });
  if (fruit.length) { const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 8), new THREE.MeshStandardMaterial({ roughness: 0.5 }), fruit.length), c = new THREE.Color(); fruit.forEach(([p, i], k) => { im.setMatrixAt(k, M4(p.x, p.y, p.z)); c.set([0xe63946, 0xffb703, 0x8ac926, 0xf28482][i % 4]); im.setColorAt(k, c); }); im.castShadow = true; root.add(im); }
  // ---- fences (arc segments), hay bales, benches, stepping-stone path from the bridge
  for (let i = 0; i < 26; i++) { const a = -0.15 + i * 0.045, r = 22.3, x = Math.cos(a + Math.PI * 1.15) * r, z = Math.sin(a + Math.PI * 1.15) * r; if (Math.abs(x) < 4 && z > 0) continue; mg.box(0.16, 1.3, 0.16, M.woodDark, M4(x, GY + 0.65, z), 0.5); if (i) { const px = Math.cos(a - 0.045 + Math.PI * 1.15) * r, pz = Math.sin(a - 0.045 + Math.PI * 1.15) * r; const len = Math.hypot(x - px, z - pz), ang = Math.atan2(x - px, z - pz); for (const y of [0.4, 0.95]) mg.box(0.09, 0.11, len, M.woodLight, M4((x + px) / 2, GY + y, (z + pz) / 2, 0, ang, 0), 0.5); } }
  for (let i = 0; i < Math.round(5 * D + 1); i++) { const x = 11 + rng.range(-1, 2), z = -12 + i * 1.7 * (i % 2 ? 1 : 0.6) - i * 0.4; mg.cyl(0.6, 0.6, 1.0, 14, M.hay, M4(x, GY + 0.6, z, Math.PI / 2, 0, rng.next()), 0.9); }
  for (const [x, z, ry] of [[9.5, 12, 0.3], [-9.6, 12.8, -0.4], [-13, -8, 1.5]]) { mg.box(2.0, 0.14, 0.6, M.woodLight, M4(x, GY + 0.62, z, 0, ry, 0), 0.5); for (const s of [-1, 1]) mg.box(0.12, 0.6, 0.5, M.woodDark, M4(x + Math.cos(ry) * s * 0.85, GY + 0.3, z - Math.sin(ry) * s * 0.85, 0, ry, 0), 0.5); mg.box(2.0, 0.5, 0.1, M.woodLight, M4(x - Math.sin(ry) * 0.28, GY + 1.0, z - Math.cos(ry) * 0.28, -0.15, ry, 0), 0.5); }
  for (let i = 0; i < 12; i++) mg.cyl(0.55 + (i % 3) * 0.05, 0.6, 0.12, 10, M.stone, M4(rng.range(-0.5, 0.5) + Math.sin(i * 0.6) * 0.5, GY + 0.07, 25.5 - i * 1.25, 0, rng.next() * 3, 0), 0.6);
  // ---- rocks (instanced, displaced) + moss tint
  const rockGeo = new THREE.IcosahedronGeometry(1, 2); { const p = rockGeo.attributes.position; for (let i = 0; i < p.count; i++) { const n = 1 + (Math.sin(p.getX(i) * 4.1) * Math.cos(p.getZ(i) * 3.7) + Math.sin(p.getY(i) * 5.3)) * 0.14; p.setXYZ(i, p.getX(i) * n, p.getY(i) * n * 0.75, p.getZ(i) * n); } rockGeo.computeVertexNormals(); }
  const rockN = Math.round(46 * D) + 6, rocks = new THREE.InstancedMesh(rockGeo, pbr('stone', { base: 0x8f8b82, cells: 4, rough: 0.95, normal: 1.4 }), rockN), c2 = new THREE.Color();
  for (let i = 0; i < rockN; i++) {
    let p = null, s = 1;
    for (let t = 0; t < 10 && !p; t++) { const a = rng.next() * TAU, r = rng.range(10.5, 23.5) + (i % 5 === 0 ? 9 : 0); s = rng.range(0.25, 0.9) * (i % 11 === 0 ? 1.9 : 1); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (free(x, z, s)) p = new THREE.Vector3(x, GY + s * 0.3, z); }
    if (!p) { rocks.setMatrixAt(i, M4(0, -50, 0)); continue; }
    rocks.setMatrixAt(i, M4(p.x, p.y, p.z, rng.next(), rng.next() * 6, rng.next(), s * rng.range(1, 1.5), s, s * rng.range(1, 1.4)));
    c2.setHSL(0.09 + rng.next() * 0.08, 0.08, 0.72 + rng.next() * 0.28); if (rng.next() < 0.3) c2.lerp(new THREE.Color(0x7aa860), 0.55); rocks.setColorAt(i, c2);
  }
  rocks.castShadow = true; rocks.receiveShadow = true; root.add(rocks);
  // ---- bushes with flowers
  const bushGeo = mergeGeometries([0, 1, 2, 3].map((i) => { const g = new THREE.IcosahedronGeometry(0.55 - i * 0.05, 1); g.translate(Math.cos(i * 1.7) * 0.45, 0.35 + (i % 2) * 0.15, Math.sin(i * 1.7) * 0.45); return g; }));
  const bushN = Math.round(40 * D) + 6, bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), bushN);
  for (let i = 0; i < bushN; i++) {
    let p = null; for (let t = 0; t < 10 && !p; t++) { const a = rng.next() * TAU, r = rng.range(10.2, 23); const x = Math.cos(a) * r, z = Math.sin(a) * r; if (free(x, z, 1)) p = new THREE.Vector3(x, GY, z); }
    if (!p) { bushes.setMatrixAt(i, M4(0, -50, 0)); continue; }
    bushes.setMatrixAt(i, M4(p.x, p.y, p.z, 0, rng.next() * 6, 0, rng.range(0.8, 1.6))); c2.setHSL(0.26 + rng.next() * 0.07, 0.5, 0.15 + rng.next() * 0.1); bushes.setColorAt(i, c2);
  }
  bushes.castShadow = true; bushes.receiveShadow = true; root.add(bushes);
  // ---- bamboo grove (back-right) and Japanese pines
  const bamN = Math.round(60 * D) + 8, bamGeo = new THREE.CylinderGeometry(0.11, 0.13, 1, 8, 6), bam = new THREE.InstancedMesh(bamGeo, M.bamboo, bamN);
  for (let i = 0; i < bamN; i++) { const a = rng.range(-0.75, -0.2) , r = rng.range(15, 24); const h = rng.range(7, 13); bam.setMatrixAt(i, M4(Math.cos(a) * r + 6, GY + h / 2, Math.sin(a) * r - 4, rng.range(-0.06, 0.06), 0, rng.range(-0.08, 0.08), 1, h, 1)); c2.setHSL(0.22 + rng.next() * 0.05, 0.55, 0.38 + rng.next() * 0.12); bam.setColorAt(i, c2); }
  bam.castShadow = true; root.add(bam);
  const leafMerge = new Merger(); for (let i = 0; i < Math.round(38 * D) + 6; i++) { const a = rng.range(-0.75, -0.2), r = rng.range(15, 24), h = rng.range(6, 12); const px = Math.cos(a) * r + 6, pz = Math.sin(a) * r - 4; for (let k = 0; k < 4; k++) leafMerge.add(new THREE.PlaneGeometry(0.28, 1.5), M.leafG, M4(px + rng.range(-0.4, 0.4), GY + h + rng.range(-1.4, 0.4), pz + rng.range(-0.4, 0.4), rng.range(-0.9, 0.9), rng.next() * 6, rng.range(-0.7, 0.7)), 0); }
  root.add(leafMerge.build(false));
  for (let i = 0; i < Math.round(5 * D) + 1; i++) { const a = rng.range(2.4, 3.6) , r = rng.range(17, 23), x = Math.cos(a) * r, z = Math.sin(a) * r; if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < 4)) continue; const pg = new Merger(); pg.cyl(0.25, 0.42, 5, 8, M.woodDark, M4(x, GY + 2.5, z), 0.5); for (let k = 0; k < 4; k++) { pg.add(new THREE.CylinderGeometry(1.1 + (3 - k) * 0.55, 1.5 + (3 - k) * 0.6, 0.7, 9), M.pine, M4(x + Math.sin(k * 2) * 0.5, GY + 3.5 + k * 1.05, z + Math.cos(k * 2) * 0.4, 0, k, 0), 0); } root.add(pg.build()); blockers.push({ x, z, r: 1.6 }); }
  // ---- pond with lily pads and koi
  { const px = -12.5, pz = 11, pr = 3.1; const water = new THREE.Mesh(new THREE.CircleGeometry(pr, 40), new THREE.MeshStandardMaterial({ color: V.night ? 0x102a5a : 0x2a8fb8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.85 })); water.rotation.x = -Math.PI / 2; water.position.set(px, GY + 0.06, pz); root.add(water);
    const edge = new THREE.Mesh(new THREE.TorusGeometry(pr + 0.1, 0.32, 8, 40), M.stone); edge.rotation.x = Math.PI / 2; edge.position.set(px, GY + 0.1, pz); edge.castShadow = true; edge.receiveShadow = true; root.add(edge);
    for (let i = 0; i < 9; i++) { const a = rng.next() * TAU, r = rng.range(0.3, pr - 0.6); const lp = new THREE.Mesh(new THREE.CircleGeometry(rng.range(0.25, 0.45), 12, 0.4, TAU - 0.5), new THREE.MeshStandardMaterial({ color: 0x3e8f3a, roughness: 0.6, side: THREE.DoubleSide })); lp.rotation.x = -Math.PI / 2; lp.rotation.z = rng.next() * 6; lp.position.set(px + Math.cos(a) * r, GY + 0.09, pz + Math.sin(a) * r); root.add(lp); if (i % 3 === 0) { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffa6c9, roughness: 0.6 })); fl.position.set(lp.position.x, GY + 0.16, lp.position.z); root.add(fl); } }
    for (let i = 0; i < 4; i++) { const f = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshStandardMaterial({ color: [0xff8a2a, 0xffffff, 0xe63946, 0xffb703][i], roughness: 0.4 })); body.scale.set(1, 0.6, 2.2); f.add(body); const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 4), body.material); tail.rotation.x = -Math.PI / 2; tail.position.z = -0.55; f.add(tail); f.userData = { cx: px, cz: pz, r: rng.range(0.8, pr - 0.8), sp: rng.range(0.4, 0.9) * (i % 2 ? 1 : -1), a: rng.next() * TAU }; f.position.y = GY + 0.02; root.add(f); anim.koi.push(f); }
    blockers.push({ x: px, z: pz, r: pr + 1.4 }); }
  // ---- water wheel on the river
  { const g = new THREE.Group(), R = 3.0; const wm = new Merger(); for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; wm.box(0.14, 0.14, 1.6, M.woodDark, M4(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0, 0, 0, a), 0.5); wm.box(0.3, 1.0, 1.3, M.woodLight, M4(Math.cos(a) * R, Math.sin(a) * R, 0, 0, 0, a + Math.PI / 2), 0.5); } for (const z of [-0.8, 0.8]) wm.add(new THREE.TorusGeometry(R, 0.09, 6, 30), M.woodDark, M4(0, 0, z), 0.5); wm.cyl(0.25, 0.25, 2.2, 10, M.woodDark, M4(0, 0, 0, Math.PI / 2, 0, 0), 0.5); const wheel = wm.build(); g.add(wheel); const A = -2.2; g.position.set(Math.cos(A) * 27, GY + 1.5, Math.sin(A) * 27); g.rotation.y = Math.atan2(Math.cos(A), Math.sin(A)); root.add(g); anim.wheel = wheel; const sm = new Merger(); for (const s of [-1, 1]) sm.box(0.4, 4.4, 0.4, M.woodDark, M4(0, -0.6, s * 1.3), 0.5); sm.box(0.6, 0.4, 3.2, M.woodDark, M4(0, 1.6, 0), 0.5); const sup = sm.build(); g.add(sup); }
  // ---- boats drifting on the river + floating lanterns
  for (let i = 0; i < 2; i++) { const b = new THREE.Group(); const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.6, 4, 12), M.woodLight); hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.55); hull.castShadow = true; hull.position.y = 0.05; b.add(hull); const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xffb45a, emissiveIntensity: glowNight * 1.3 })); lan.position.set(1.3, 0.85, 0); b.add(lan); anim.glows.push(lan.material); const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.85, 6), M.woodDark); pole.position.set(1.3, 0.42, 0); b.add(pole); b.userData = { a: rng.next() * TAU, sp: 0.02 * (i ? -1 : 1), r: 26.4 + i * 1.6 }; root.add(b); anim.boats.push(b); }
  for (let i = 0; i < Math.round(16 * D) + 2; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), new THREE.MeshStandardMaterial({ color: 0x442200, emissive: [0xffb45a, 0xff8fb6, 0xffe08a][i % 3], emissiveIntensity: glowNight * 1.8 + 0.3 })); l.userData = { a: rng.next() * TAU, sp: rng.range(0.01, 0.025), r: rng.range(24.8, 29.2), ph: rng.next() * 6 }; root.add(l); anim.lanterns.push(l); anim.glows.push(l.material); }
  // ---- butterflies
  const wingGeo = new THREE.PlaneGeometry(0.34, 0.26); wingGeo.translate(0.17, 0, 0);
  for (let i = 0; i < Math.round(22 * D) + 2; i++) { const b = new THREE.Group(); const wm = new THREE.MeshStandardMaterial({ color: [0xffd23f, 0xff8fb6, 0xffffff, 0x8fd3ff, 0xffa64d][i % 5], side: THREE.DoubleSide, roughness: 0.6, emissive: 0x221100 }); const w1 = new THREE.Mesh(wingGeo, wm), w2 = new THREE.Mesh(wingGeo, wm); w2.scale.x = -1; b.add(w1, w2); b.userData = { w1, w2, cx: rng.range(-20, 20), cz: rng.range(-20, 20), a: rng.next() * TAU, sp: rng.range(0.4, 0.9), y: rng.range(0.8, 2.6), ph: rng.next() * 6 }; root.add(b); anim.butterflies.push(b); }
  root.add(mg.build());
  // ---- light shafts (god rays) through the trees
  if (engine.cfg.shafts && !V.night) {
    const tex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); const gy = g.createLinearGradient(0, 0, 0, 256); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.15, 'rgba(0,0,0,0.0)'); gy.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = gy; g.fillRect(0, 0, 64, 256); return new THREE.CanvasTexture(c); })();
    const dir = new THREE.Vector3(...V.sunDir).normalize();
    for (let i = 0; i < Math.round(9 * D) + 2; i++) {
      const grp = new THREE.Group(); const w = rng.range(2.2, 5); const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, color: V.sunset ? 0xffb070 : 0xfff2c0, side: THREE.DoubleSide, fog: false });
      for (const r of [0, Math.PI / 2]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 46), mat); m.rotation.y = r; m.renderOrder = 22; grp.add(m); }
      const tx = rng.range(-16, 16), tz = rng.range(-16, 8);
      grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir); grp.position.set(tx, GY, tz).addScaledVector(dir, 23);
      grp.userData = { mat, base: rng.range(0.03, 0.08), ph: rng.next() * 6, sp: rng.range(0.3, 0.8) }; root.add(grp); anim.shafts.push(grp);
    }
  }
  const smokeT = { v: 0 };
  return {
    glowMats: anim.glows,
    update(dt, t) {
      if (anim.wheel) anim.wheel.rotation.z -= dt * 0.7;
      for (const b of anim.boats) { const u = b.userData; u.a += u.sp * dt; b.position.set(Math.cos(u.a) * u.r, GY - 0.22 + Math.sin(t * 1.2 + u.a * 4) * 0.04, Math.sin(u.a) * u.r); b.rotation.y = -(u.a + Math.PI / 2) + (u.sp > 0 ? 0 : Math.PI); b.rotation.x = Math.sin(t * 1.4 + u.a) * 0.05; }
      for (const l of anim.lanterns) { const u = l.userData; u.a += u.sp * dt; l.position.set(Math.cos(u.a) * u.r, GY - 0.24 + Math.sin(t * 1.8 + u.ph) * 0.03, Math.sin(u.a) * u.r); l.rotation.y = t * 0.2 + u.ph; }
      for (const f of anim.koi) { const u = f.userData; u.a += u.sp * dt; f.position.set(u.cx + Math.cos(u.a) * u.r, GY + 0.02, u.cz + Math.sin(u.a) * u.r); f.rotation.y = Math.atan2(-Math.sin(u.a) * Math.sign(u.sp), Math.cos(u.a) * Math.sign(u.sp)); }
      for (const b of anim.butterflies) { const u = b.userData; u.a += dt * u.sp; b.position.set(u.cx + Math.cos(u.a * 1.3) * 4 + Math.sin(t * 0.6 + u.ph) * 1.5, GY + u.y + Math.sin(t * 2 + u.ph) * 0.35, u.cz + Math.sin(u.a) * 4); b.rotation.y = -u.a * 1.3 + 1.6; const fl = Math.sin(t * 16 + u.ph) * 0.9; u.w1.rotation.y = fl; u.w2.rotation.y = -fl; if (Math.hypot(b.position.x, b.position.z) < 10.8) b.position.y += 3; }
      for (const s of anim.shafts) { const u = s.userData; u.mat.opacity = (u.base + Math.sin(t * u.sp + u.ph) * u.base * 0.5) * (engine.cfg.detail > 0.5 ? 1 : 0.6); }
      smokeT.v += dt; if (fx && smokeT.v > 0.22) { smokeT.v = 0; for (const c of anim.smoke) fx.emit({ p: [c.x, c.y, c.z], n: 1, v: [0.4, 1.4, 0.2], vr: [0.2, 0.2, 0.2], life: 4, size: 0.4, size1: 1.7, color: 0xcfcfd8, alpha: 0.35, alpha1: 0, drag: 0.4, frame: SPRITE.SMOKE, wind: 1 }); }
      if (fx && !V.night && Math.random() < dt * 6) fx.emit({ p: [(Math.random() - 0.5) * 30, 2 + Math.random() * 6, (Math.random() - 0.5) * 24 - 4], n: 1, v: [0.05, 0.05, 0.02], life: 6, size: 0.05, size1: 0.05, color: 0xfff2c0, alpha: 0.7, alpha1: 0, add: true, frame: SPRITE.SOFT, drag: 0.5 });
    },
  };
}
