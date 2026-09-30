// Trees, bushes, rocks, grass, flowers, reeds and lily pads. All geometry is generated in code.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE, CATAPULT_X } from './config.js';
import { terrainHeight, WATER_Y } from './terrain.js';
import { rng, barkTexture, leafTexture, bladeTexture, flowerTexture, rockTexture } from './textures.js';

const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const sm = (t) => t * t * (3 - 2 * t);
function vn3(x, y, z) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z), fx = sm(x - i), fy = sm(y - j), fz = sm(z - k);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(i, j, k), hash3(i + 1, j, k), fx), L(hash3(i, j + 1, k), hash3(i + 1, j + 1, k), fx), fy),
    L(L(hash3(i, j, k + 1), hash3(i + 1, j, k + 1), fx), L(hash3(i, j + 1, k + 1), hash3(i + 1, j + 1, k + 1), fx), fy), fz);
}

// smooth, lumpy sphere
function blob(r, detail, cx, cy, cz, amp = 0.5, seed = 0, sx = 1, sy = 1, sz = 1) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g);
  const p = g.attributes.position, v = new THREE.Vector3(), f = 1.5 / r;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vn3(v.x * f + seed, v.y * f, v.z * f) * 0.65 + vn3(v.x * f * 2.3, v.y * f * 2.3 + seed, v.z * f * 2.3) * 0.35;
    v.multiplyScalar(1 + (n - 0.5) * amp);
    p.setXYZ(i, v.x * sx + cx, v.y * sy + cy, v.z * sz + cz);
  }
  g.computeVertexNormals();
  return g;
}
function paint(g, fn) {
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(c, p.getX(i), p.getY(i), p.getZ(i)); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function planarUV(g, s = 0.25) {
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i) * 0.7) * s; uv[i * 2 + 1] = p.getY(i) * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}
const withUV = (g) => { if (!g.attributes.uv) planarUV(g); return g; };
const stripToVerts = (g) => { g = g.index ? g.toNonIndexed() : g; return g; };

function sway(mat, uTime, amp, key) {
  mat.customProgramCacheKey = () => key;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.19;
        float hg = max(position.y, 0.0);
        transformed.x += (sin(uTime * 1.25 + ph + position.y * 0.5) + sin(uTime * 2.3 + ph * 1.7) * 0.4) * ${amp.toFixed(3)} * hg;
        transformed.z += cos(uTime * 0.95 + ph) * ${(amp * 0.7).toFixed(3)} * hg;`);
  };
}

export function createVegetation(scene, ctx) {
  const { R, uTime, detail, scatter } = ctx;
  const Q = new THREE.Quaternion(), M = new THREE.Matrix4(), S = new THREE.Vector3(), P = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const eul = new THREE.Euler();
  const col = new THREE.Color();
  const leaf = leafTexture();
  const bark = barkTexture(false); bark.repeat.set(2, 2);
  const birchBark = barkTexture(true); birchBark.repeat.set(1, 3);

  const foliageMat = new THREE.MeshStandardMaterial({ map: leaf, vertexColors: true, roughness: 0.82, metalness: 0 });
  sway(foliageMat, uTime, 0.011, 'foliage');
  const pineMat = new THREE.MeshStandardMaterial({ map: leaf, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  sway(pineMat, uTime, 0.006, 'pine');
  const trunkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 0.95, bumpMap: bark, bumpScale: 2 });
  const birchMat = new THREE.MeshStandardMaterial({ map: birchBark, roughness: 0.8 });

  const okTree = (x, z, h) => {
    if (h < 1.0) return false;
    if (Math.abs(z) < LANE + 3 && x > -46 && x < 88) return false;
    if (z > 16 && x > -60 && x < 100) return false;
    const e = 1.0;
    const sl = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    return sl < 0.7;
  };

  function instanceTrees(list, trunkGeo, foliageGeo, tMat, fMat, hsl, scale, key, extra = []) {
    const pts = list;
    const trunk = new THREE.InstancedMesh(trunkGeo, tMat, pts.length);
    const fol = new THREE.InstancedMesh(foliageGeo, fMat, pts.length);
    pts.forEach((p, i) => {
      const s = (scale[0] + R() * (scale[1] - scale[0])) * (p.big || 1);
      Q.setFromAxisAngle(UP, R() * 6.28);
      eul.set((R() - 0.5) * 0.06, 0, (R() - 0.5) * 0.06);
      const q2 = new THREE.Quaternion().setFromEuler(eul); Q.multiply(q2);
      M.compose(P.set(p[0], p[1] - 0.25, p[2]), Q, S.set(s, s * (0.9 + R() * 0.25), s));
      trunk.setMatrixAt(i, M); fol.setMatrixAt(i, M);
      const c = typeof hsl === 'function' ? hsl() : col.setHSL(hsl[0] + R() * hsl[1], hsl[2], hsl[3] + R() * hsl[4]);
      fol.setColorAt(i, c);
    });
    for (const m of [trunk, fol]) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m); }
    detail.push({ mesh: trunk, total: pts.length, key }, { mesh: fol, total: pts.length, key });
    return [trunk, fol];
  }

  // ---------------------------------------------------------------- oak / maple
  function buildOak(seed) {
    const tr = [];
    const t0 = new THREE.CylinderGeometry(0.28, 0.5, 3.6, 10, 4).translate(0, 1.8, 0);
    const flare = new THREE.CylinderGeometry(0.5, 0.95, 0.6, 10, 1).translate(0, 0.3, 0);
    tr.push(t0, flare);
    for (let k = 0; k < 4; k++) {
      const b = new THREE.CylinderGeometry(0.09, 0.2, 2.4, 6).translate(0, 1.2, 0);
      b.rotateZ((k % 2 ? 1 : -1) * (0.7 + (k * 0.13))); b.rotateY(k * 1.7 + seed); b.translate(0, 2.7 + k * 0.28, 0);
      tr.push(b);
    }
    const trunk = mergeGeometries(tr.map((g) => { g.deleteAttribute('normal'); return g.index ? g.toNonIndexed() : g; }).map((g) => { g.computeVertexNormals(); return g; }));
    const bl = [];
    const Rr = rng(seed * 7 + 1);
    const n = 7;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.28 + Rr() * 0.6, s = k === 0 ? 0 : 1.2 + Rr() * 1.2, y = 4.3 + Rr() * 2.3 + (k === 0 ? 0.8 : 0);
      bl.push(blob(1.5 + Rr() * 0.9, 2, Math.cos(a) * s, y, Math.sin(a) * s, 0.75, seed + k, 1, 0.85, 1));
    }
    const foliage = mergeGeometries(bl);
    paint(foliage, (c, x, y, z) => {
      const t = THREE.MathUtils.clamp((y - 3.6) / 4.2, 0, 1), o = THREE.MathUtils.clamp(Math.hypot(x, z) / 2.8, 0, 1);
      c.setRGB(0.20, 0.34, 0.11).lerp(col.setRGB(0.86, 1.0, 0.48), 0.12 + 0.6 * t + 0.28 * o);
    });
    planarUV(foliage, 0.3);
    withUV(trunk); trunk.setAttribute('uv', trunk.attributes.uv);
    return { trunk: fixTrunkUV(trunk), foliage };
  }
  function fixTrunkUV(g) {
    const p = g.attributes.position, uv = new Float32Array(p.count * 2);
    for (let i = 0; i < p.count; i++) { uv[i * 2] = Math.atan2(p.getZ(i), p.getX(i)) * 0.32 + p.getX(i) * 0.1; uv[i * 2 + 1] = p.getY(i) * 0.22; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return g;
  }

  // ---------------------------------------------------------------- birch
  function buildBirch(seed) {
    const t = new THREE.CylinderGeometry(0.12, 0.22, 5.4, 8, 4).translate(0, 2.7, 0);
    const bp = t.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) + Math.sin(bp.getY(i) * 0.7 + seed) * 0.18);
    const br = [t];
    for (let k = 0; k < 3; k++) { const b = new THREE.CylinderGeometry(0.05, 0.1, 1.6, 5).translate(0, 0.8, 0); b.rotateZ((k % 2 ? 1 : -1) * 0.8); b.rotateY(k * 2.1); b.translate(0, 3.6 + k * 0.6, 0); br.push(b); }
    const trunk = mergeGeometries(br.map((g) => g.index ? g.toNonIndexed() : g));
    const Rr = rng(seed * 3 + 5), bl = [];
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + Rr(), s = 0.4 + Rr() * 1.0;
      bl.push(blob(0.85 + Rr() * 0.6, 2, Math.cos(a) * s, 4.4 + Rr() * 2.6, Math.sin(a) * s, 0.7, seed + k, 1, 1.1, 1));
    }
    const foliage = mergeGeometries(bl);
    paint(foliage, (c, x, y) => { c.setRGB(0.35, 0.5, 0.16).lerp(col.setRGB(1.0, 1.05, 0.55), THREE.MathUtils.clamp((y - 3.8) / 3.4, 0, 1) * 0.75 + 0.15); });
    planarUV(foliage, 0.35);
    const uv = new Float32Array(trunk.attributes.position.count * 2), tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { uv[i * 2] = Math.atan2(tp.getZ(i), tp.getX(i)) * 0.4; uv[i * 2 + 1] = tp.getY(i) * 0.3; }
    trunk.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return { trunk, foliage };
  }

  // ---------------------------------------------------------------- pine
  function buildPine(seed) {
    const trunk = fixTrunkUV((() => { const g = new THREE.CylinderGeometry(0.16, 0.42, 3.2, 8, 3).translate(0, 1.6, 0); return g.toNonIndexed(); })());
    const tiers = [];
    const Rr = rng(seed * 11 + 3);
    for (let k = 0; k < 7; k++) {
      const r = 2.5 * (1 - k / 7.6) + 0.25, h = 2.1 - k * 0.1, y = 1.4 + k * 1.05;
      let g = new THREE.ConeGeometry(r, h, 14, 1, true).translate(0, y + h / 2, 0);
      g.deleteAttribute('uv'); g.deleteAttribute('normal'); g = mergeVertices(g);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const rim = 1 - THREE.MathUtils.clamp((v.y - y) / h, 0, 1);
        const j = (hash3(v.x * 3 + seed, v.y * 2, v.z * 3) - 0.5) * 0.5 * rim;
        p.setXYZ(i, v.x * (1 + j), v.y - rim * (0.2 + hash3(v.x * 5, v.z * 5, seed) * 0.4), v.z * (1 + j));
      }
      g.computeVertexNormals();
      tiers.push(g);
    }
    const foliage = mergeGeometries(tiers);
    paint(foliage, (c, x, y, z) => {
      const t = THREE.MathUtils.clamp((y - 1.4) / 7.6, 0, 1), rim = THREE.MathUtils.clamp(Math.hypot(x, z) / 2.3, 0, 1);
      c.setRGB(0.10, 0.22, 0.10).lerp(col.setRGB(0.58, 0.88, 0.45), 0.1 + 0.42 * t + 0.28 * rim * (1 - t));
    });
    planarUV(foliage, 0.4);
    return { trunk, foliage };
  }

  // oaks (green) and maples (autumn), birches, pines
  {
    const variants = [buildOak(1), buildOak(2), buildOak(3)];
    const pts = scatter(72, 4000, okTree);
    const groups = [[], [], []];
    pts.forEach((p, i) => groups[i % 3].push(p));
    const autumn = () => { const r = R(); return r < 0.5 ? col.setHSL(0.03 + R() * 0.03, 0.85, 0.5) : r < 0.8 ? col.setHSL(0.09 + R() * 0.03, 0.9, 0.52) : col.setHSL(0.14, 0.75, 0.5); };
    groups.forEach((gp, i) => {
      // every fourth oak is a maple in autumn colours
      const green = gp.filter((_, k) => k % 4), maples = gp.filter((_, k) => !(k % 4));
      instanceTrees(green, variants[i].trunk, variants[i].foliage, trunkMat, foliageMat, [0.22, 0.07, 0.6, 0.95, 0.2], [0.8, 1.35], 'trees');
      instanceTrees(maples, variants[i].trunk, variants[i].foliage, trunkMat, foliageMat, autumn, [0.8, 1.25], 'trees');
    });
    // hero trees framing the view
    const hero = [[-66, 16], [-58, 30], [96, 20], [104, 34], [-74, -6], [110, -8]].map(([x, z]) => { const a = [x, terrainHeight(x, z), z]; a.big = 1.5; return a; });
    instanceTrees(hero, variants[0].trunk, variants[0].foliage, trunkMat, foliageMat, [0.22, 0.05, 0.6, 0.95, 0.15], [1.3, 1.7], 'trees');

    const bv = [buildBirch(1), buildBirch(2)];
    const bpts = scatter(46, 3000, okTree);
    [0, 1].forEach((i) => instanceTrees(bpts.filter((_, k) => k % 2 === i), bv[i].trunk, bv[i].foliage, birchMat, foliageMat, [0.16, 0.06, 0.6, 1.0, 0.15], [0.85, 1.2], 'trees'));

    const pv = [buildPine(1), buildPine(2)];
    const ppts = scatter(120, 4000, okTree);
    [0, 1].forEach((i) => instanceTrees(ppts.filter((_, k) => k % 2 === i), pv[i].trunk, pv[i].foliage, trunkMat, pineMat, [0.30, 0.06, 0.55, 0.95, 0.2], [0.85, 1.5], 'trees'));
  }

  // ---------------------------------------------------------------- bushes
  {
    const g = mergeGeometries([blob(0.75, 2, 0, 0.55, 0, 0.6, 3, 1, 0.8, 1), blob(0.55, 2, 0.7, 0.4, 0.2, 0.6, 5, 1, 0.8, 1), blob(0.5, 2, -0.6, 0.4, -0.2, 0.6, 8, 1, 0.8, 1), blob(0.45, 2, 0.1, 0.35, 0.7, 0.6, 2, 1, 0.8, 1)]);
    paint(g, (c, x, y) => { c.setRGB(0.22, 0.38, 0.13).lerp(col.setRGB(0.8, 1.0, 0.45), THREE.MathUtils.clamp(y / 1.1, 0, 1) * 0.7); });
    planarUV(g, 0.5);
    const pts = scatter(240, 6000, (x, z, h) => h > 1.1 && !(Math.abs(z) < LANE + 1 && x > 6 && x < 80) && Math.hypot(x - CATAPULT_X, z) > 6 && !(z > 18 && x > -50 && x < 96));
    const m = new THREE.InstancedMesh(g, foliageMat, pts.length);
    pts.forEach((p, i) => {
      const s = 0.7 + R() * 1.1; Q.setFromAxisAngle(UP, R() * 6.28);
      M.compose(P.set(p[0], p[1] - 0.1, p[2]), Q, S.set(s, s, s)); m.setMatrixAt(i, M);
      m.setColorAt(i, col.setHSL(0.24 + R() * 0.08, 0.55, 0.52 + R() * 0.12));
    });
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    detail.push({ mesh: m, total: pts.length, key: 'trees' });
  }

  // ---------------------------------------------------------------- rocks
  {
    const rockTex = rockTexture();
    const rockMat = new THREE.MeshStandardMaterial({ map: rockTex, bumpMap: rockTex, bumpScale: 3, roughness: 0.95, color: 0xffffff });
    const geos = [0, 1, 2].map((k) => planarUV(blob(1, 2, 0, 0, 0, 0.9 + k * 0.2, 11 + k * 5), 0.5));
    const acc = (x, z, h) => h > 1.0 && !(Math.abs(z) < LANE + 1 && x > -40 && x < 80);
    const shore = (x, z, h) => h > WATER_Y - 0.7 && h < WATER_Y + 1.1 && Math.abs(z) < 120 && Math.abs(x) < 60;
    geos.forEach((g, gi) => {
      const pts = scatter(gi === 2 ? 16 : 26, 4000, acc);
      const sp = scatter(gi === 2 ? 0 : 34, 6000, shore);
      const all = pts.concat(sp);
      const m = new THREE.InstancedMesh(g, rockMat, all.length);
      all.forEach((p, i) => {
        const small = i >= pts.length;
        const s = (small ? 0.25 + R() * 0.55 : 0.5 + R() * (gi === 2 ? 3.0 : 1.5));
        Q.setFromEuler(eul.set(R() * 0.5, R() * 6, R() * 0.5));
        M.compose(P.set(p[0], p[1] + s * 0.18, p[2]), Q, S.set(s * (1 + R() * 0.5), s * (0.55 + R() * 0.3), s));
        m.setMatrixAt(i, M);
        m.setColorAt(i, col.setHSL(0.09, 0.08, 0.72 + R() * 0.28));
      });
      m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    });
  }

  // ---------------------------------------------------------------- grass + flowers (alpha cards)
  function cross(w, h, n = 2) {
    const parts = [];
    for (let i = 0; i < n; i++) { const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2, 0); a.rotateY(i * Math.PI / n + 0.3); parts.push(a); }
    const g = mergeGeometries(parts);
    const nor = g.attributes.normal; for (let i = 0; i < nor.count; i++) nor.setXYZ(i, 0, 1, 0);
    return g;
  }
  const cardMat = (map, key) => {
    const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 1, metalness: 0, alphaToCoverage: true });
    sway(m, uTime, 0.10, key);
    return m;
  };
  const meadow = (x, z, h) => h > 1.35 && Math.abs(z) < 75 && !(Math.abs(z) < LANE + 0.5 && x > 8 && x < 78) && Math.hypot(x - CATAPULT_X, z) > 4.5;
  {
    [[bladeTexture(0), cross(1.2, 0.75, 3), 7000, 0], [bladeTexture(1), cross(1.5, 1.0, 3), 1800, 1]].forEach(([tex, geo, count, key]) => {
      const pts = scatter(count, count * 3, meadow);
      const m = new THREE.InstancedMesh(geo, cardMat(tex, 'grass' + key), pts.length);
      pts.forEach((p, i) => {
        const s = 0.7 + R() * 0.9; Q.setFromAxisAngle(UP, R() * 6.28);
        M.compose(P.set(p[0], p[1] - 0.03, p[2]), Q, S.set(s, s * (0.75 + R() * 0.7), s)); m.setMatrixAt(i, M);
        m.setColorAt(i, col.setHSL(0.22 + R() * 0.08, 0.5 + R() * 0.3, 0.55 + R() * 0.25));
      });
      m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      detail.push({ mesh: m, total: pts.length, key: 'grass' });
    });
    [['#ffffff', '#ffd23d'], ['#ffd23d', '#c77b10'], ['#ff6f9f', '#ffe27a'], ['#a884ff', '#ffe27a'], ['#ff5a3c', '#3a2410']].forEach(([head, center], k) => {
      const pts = scatter(240, 3000, (x, z, h) => meadow(x, z, h) && h > 1.5);
      const m = new THREE.InstancedMesh(cross(1.15, 1.05, 2), cardMat(flowerTexture(head, center), 'flw' + k), pts.length);
      pts.forEach((p, i) => {
        const s = 0.7 + R() * 0.7; Q.setFromAxisAngle(UP, R() * 6.28);
        M.compose(P.set(p[0], p[1] - 0.03, p[2]), Q, S.set(s, s, s)); m.setMatrixAt(i, M);
        m.setColorAt(i, col.setRGB(1, 1, 1));
      });
      m.frustumCulled = false; scene.add(m);
      detail.push({ mesh: m, total: pts.length, key: 'grass' });
    });
  }

  // ---------------------------------------------------------------- reeds + cattails
  {
    const parts = [];
    const Rr = rng(77);
    for (let k = 0; k < 9; k++) {
      const h = 1.3 + Rr() * 1.3, b = new THREE.ConeGeometry(0.045, h, 4, 1).translate(0, h / 2, 0);
      b.rotateZ((Rr() - 0.5) * 0.5); b.rotateY(Rr() * 6.28); b.translate((Rr() - 0.5) * 0.5, 0, (Rr() - 0.5) * 0.5);
      paint(b, (c, x, y) => { c.setRGB(0.25, 0.42, 0.12).lerp(col.setRGB(0.7, 0.75, 0.3), THREE.MathUtils.clamp(y / 2.4, 0, 1)); });
      parts.push(b);
    }
    for (let k = 0; k < 3; k++) {
      const h = 1.5 + Rr() * 0.9, head = new THREE.CylinderGeometry(0.075, 0.075, 0.42, 6).translate(0, h, 0);
      const stem = new THREE.CylinderGeometry(0.02, 0.02, h, 4).translate(0, h / 2, 0);
      const ox = (Rr() - 0.5) * 0.6, oz = (Rr() - 0.5) * 0.6;
      paint(head, (c) => c.setRGB(0.32, 0.16, 0.07)); paint(stem, (c) => c.setRGB(0.3, 0.45, 0.15));
      head.translate(ox, 0, oz); stem.translate(ox, 0, oz);
      parts.push(head, stem);
    }
    const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
    sway(mat, uTime, 0.035, 'reed');
    const pts = scatter(260, 12000, (x, z, h) => h > WATER_Y - 0.3 && h < WATER_Y + 0.55 && Math.abs(z) < 115 && Math.abs(x) < 60);
    const m = new THREE.InstancedMesh(g, mat, pts.length);
    pts.forEach((p, i) => {
      const s = 0.8 + R() * 0.8; Q.setFromAxisAngle(UP, R() * 6.28);
      M.compose(P.set(p[0], Math.max(p[1], WATER_Y - 0.15), p[2]), Q, S.set(s, s, s)); m.setMatrixAt(i, M);
    });
    m.castShadow = false; m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
    detail.push({ mesh: m, total: pts.length, key: 'grass' });
  }

  // ---------------------------------------------------------------- lily pads + lotus
  {
    const pad = new THREE.CircleGeometry(0.62, 18, 0.35, 5.6).rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x4fa03a, roughness: 0.6, side: THREE.DoubleSide, transparent: true });
    const pts = scatter(110, 15000, (x, z, h) => h < WATER_Y - 0.5 && h > WATER_Y - 1.5 && Math.abs(z) < 60 && Math.abs(x) < 40);
    const m = new THREE.InstancedMesh(pad, padMat, pts.length);
    m.renderOrder = 3;
    pts.forEach((p, i) => {
      const s = 0.6 + R() * 0.9; Q.setFromAxisAngle(UP, R() * 6.28);
      M.compose(P.set(p[0], WATER_Y + 0.05, p[2]), Q, S.set(s, 1, s)); m.setMatrixAt(i, M);
      m.setColorAt(i, col.setHSL(0.27 + R() * 0.06, 0.55, 0.32 + R() * 0.12));
    });
    m.frustumCulled = false; m.receiveShadow = true; scene.add(m);
    const flowerG = mergeGeometries([0, 1, 2, 3, 4, 5].map((k) => { const g = new THREE.ConeGeometry(0.13, 0.32, 5).translate(0, 0.16, 0.14); g.rotateZ(0.5); g.rotateY(k * 1.05); return g; }));
    const fpts = pts.filter((_, i) => i % 5 === 0);
    const fm = new THREE.InstancedMesh(flowerG, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5, emissive: 0x552030 }), fpts.length);
    fpts.forEach((p, i) => { M.compose(P.set(p[0], WATER_Y + 0.08, p[2]), Q.identity(), S.set(1, 1, 1)); fm.setMatrixAt(i, M); fm.setColorAt(i, col.setHSL(0.93 + R() * 0.05, 0.85, 0.75)); });
    fm.frustumCulled = false; scene.add(fm);
  }
}
