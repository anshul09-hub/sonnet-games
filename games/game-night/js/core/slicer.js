// Real mesh slicing: cut any group of closed meshes along a world-space plane into two capped halves,
// shatter into many shards, or voxelize into coloured cubes. Used by the capture finishers.
import * as THREE from 'three';

const EPS = 1e-5;
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

class Vtx { constructor(p, n, c, d) { this.p = p; this.n = n; this.c = c; this.d = d; } }
const lerpV = (a, b, t) => new Vtx(a.p.clone().lerp(b.p, t), a.n.clone().lerp(b.n, t).normalize(), a.c && b.c ? [a.c[0] + (b.c[0] - a.c[0]) * t, a.c[1] + (b.c[1] - a.c[1]) * t, a.c[2] + (b.c[2] - a.c[2]) * t] : null, 0);

function clip(poly, side) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], da = a.d * side, db = b.d * side;
    if (da >= -EPS) out.push(a);
    if ((da > EPS && db < -EPS) || (da < -EPS && db > EPS)) out.push(lerpV(a, b, da / (da - db)));
  }
  return out;
}

class Side {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.hasCol = false; }
  tri(a, b, c) {
    for (const v of [a, b, c]) { this.pos.push(v.p.x, v.p.y, v.p.z); this.nor.push(v.n.x, v.n.y, v.n.z); if (v.c) { this.col.push(v.c[0], v.c[1], v.c[2]); this.hasCol = true; } }
  }
  poly(list) { for (let i = 1; i < list.length - 1; i++) this.tri(list[0], list[i], list[i + 1]); }
  get empty() { return this.pos.length === 0; }
}

function keyOf(p) { return Math.round(p.x * 5000) + ',' + Math.round(p.y * 5000) + ',' + Math.round(p.z * 5000); }

/** Chain loose segments into closed loops. */
function loops(segs) {
  const map = new Map();
  const add = (k, i) => { (map.get(k) || map.set(k, []).get(k)).push(i); };
  segs.forEach((s, i) => { add(keyOf(s[0]), i); add(keyOf(s[1]), i); });
  const used = new Array(segs.length).fill(false), out = [];
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true; const loop = [segs[i][0].clone()]; let end = segs[i][1], guard = 0;
    while (guard++ < 4000) {
      loop.push(end.clone());
      const cand = (map.get(keyOf(end)) || []).find((j) => !used[j]);
      if (cand === undefined) break;
      used[cand] = true; const s = segs[cand]; end = keyOf(s[0]) === keyOf(end) ? s[1] : s[0];
      if (keyOf(end) === keyOf(loop[0])) break;
    }
    if (loop.length >= 3) out.push(loop);
  }
  return out;
}

function capTriangles(segs, n, into, faceDir, colorFn) {
  if (segs.length < 3) return;
  const up = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(n, up).normalize(), v = new THREE.Vector3().crossVectors(n, u).normalize();
  for (const loop of loops(segs)) {
    // drop the duplicated closing point
    if (keyOf(loop[0]) === keyOf(loop[loop.length - 1])) loop.pop();
    if (loop.length < 3) continue;
    const contour = loop.map((p) => new THREE.Vector2(p.dot(u), p.dot(v)));
    const idx = THREE.ShapeUtils.triangulateShape(contour, []);
    for (const [i, j, k] of idx) {
      let A = loop[i], B = loop[j], C = loop[k];
      _a.subVectors(B, A); _b.subVectors(C, A);
      if (_a.cross(_b).dot(faceDir) < 0) { const t = B; B = C; C = t; }
      const nn = faceDir.clone();
      const c = colorFn ? colorFn() : null;
      into.tri(new Vtx(A, nn, c, 0), new Vtx(B, nn, c, 0), new Vtx(C, nn, c, 0));
    }
  }
}

function meshTriangles(mesh) {
  const g = mesh.geometry, pos = g.attributes.position, nor = g.attributes.normal, col = g.attributes.color, index = g.index;
  const m = mesh.matrixWorld, nm = new THREE.Matrix3().getNormalMatrix(m);
  const count = index ? index.count : pos.count, tris = [];
  const vtx = (i) => {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
    const n = nor ? new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize() : new THREE.Vector3(0, 1, 0);
    const c = col ? [col.getX(i), col.getY(i), col.getZ(i)] : null;
    return new Vtx(p, n, c, 0);
  };
  for (let i = 0; i < count; i += 3) { const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2; tris.push([vtx(a), vtx(b), vtx(c)]); }
  return tris;
}

function capMaterialFor(mat, capColor) {
  const base = mat && mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
  const c = capColor != null ? new THREE.Color(capColor) : base.clone().lerp(new THREE.Color(0xffffff), 0.55);
  if (mat && mat.isMeshToonMaterial) return new THREE.MeshToonMaterial({ color: c, gradientMap: mat.gradientMap, emissive: c.clone().multiplyScalar(0.25) });
  return new THREE.MeshStandardMaterial({ color: c, emissive: c.clone().multiplyScalar(0.35), roughness: 0.6, metalness: 0 });
}

/**
 * Slice `root` (an Object3D whose matrixWorld is current) by `plane` (world space).
 * Returns { a, b } groups (a = positive side, b = negative side); either may be null.
 * The groups are positioned at their own centroid, ready to hand to the physics wrapper.
 */
export function sliceObject(root, plane, { capColor = null } = {}) {
  root.updateMatrixWorld(true);
  const n = plane.normal.clone().normalize(), off = plane.constant;
  const parts = []; // {mat, A:Side, B:Side, segs:[]}
  const skipped = [];
  root.traverse((m) => {
    if (!m.isMesh) return;
    if (m.userData.outline || m.userData.noSlice) { skipped.push(m); return; }
    if (!m.geometry || !m.geometry.attributes.position) return;
    const A = new Side(), B = new Side(), segs = [];
    for (const tri of meshTriangles(m)) {
      let pos = 0, neg = 0;
      for (const v of tri) { v.d = n.dot(v.p) + off; if (v.d > EPS) pos++; else if (v.d < -EPS) neg++; }
      if (neg === 0) { A.poly(tri); continue; }
      if (pos === 0) { B.poly(tri); continue; }
      const pa = clip(tri, 1), pb = clip(tri, -1);
      if (pa.length >= 3) A.poly(pa); if (pb.length >= 3) B.poly(pb);
      const cross = pa.filter((v) => Math.abs(v.d) <= EPS && !tri.includes(v)); // new intersection points
      if (cross.length >= 2) segs.push([cross[0].p.clone(), cross[1].p.clone()]);
    }
    parts.push({ mesh: m, mat: m.material, A, B, segs });
  });
  const build = (side) => {
    const meshes = []; const pts = [];
    for (const p of parts) {
      const S = side === 1 ? p.A : p.B; const cap = new Side();
      const faceDir = n.clone().multiplyScalar(side === 1 ? -1 : 1);
      capTriangles(p.segs, n, cap, faceDir, null);
      const cols = S.hasCol ? [1, 1, 1] : null;
      if (!S.empty) meshes.push({ side: S, mat: p.mat, isCap: false });
      if (!cap.empty) meshes.push({ side: cap, mat: capMaterialFor(p.mat, capColor), isCap: true, hasCol: S.hasCol, mesh: p.mesh });
    }
    if (!meshes.length) return null;
    const box = new THREE.Box3();
    for (const m of meshes) for (let i = 0; i < m.side.pos.length; i += 3) box.expandByPoint(_a.set(m.side.pos[i], m.side.pos[i + 1], m.side.pos[i + 2]));
    const centre = box.getCenter(new THREE.Vector3());
    const group = new THREE.Group(); group.position.copy(centre);
    for (const m of meshes) {
      const g = new THREE.BufferGeometry();
      const P = new Float32Array(m.side.pos); for (let i = 0; i < P.length; i += 3) { P[i] -= centre.x; P[i + 1] -= centre.y; P[i + 2] -= centre.z; }
      g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(m.side.nor, 3));
      let mat = m.mat;
      if (m.side.hasCol) g.setAttribute('color', new THREE.Float32BufferAttribute(m.side.col, 3));
      else if (m.isCap && m.hasCol) { const c = new Float32Array(P.length).fill(1); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); mat = mat.clone(); mat.vertexColors = true; }
      const mesh = new THREE.Mesh(g, mat); mesh.castShadow = true; mesh.userData.cap = m.isCap; group.add(mesh);
    }
    return group;
  };
  return { a: build(1), b: build(-1) };
}

/** Repeatedly slice with random planes through the centre to get `pieces` shards (glitch / rocket finishers). */
export function shatter(root, pieces = 6, rnd = Math.random, capColor = null) {
  root.updateMatrixWorld(true);
  let list = [root];
  for (let i = 1; i < pieces; i++) {
    // cut the biggest piece
    let bi = 0, bv = -1; list.forEach((g, k) => { const bb = new THREE.Box3().setFromObject(g); const v = bb.getSize(new THREE.Vector3()).length(); if (v > bv) { bv = v; bi = k; } });
    const g = list[bi]; const bb = new THREE.Box3().setFromObject(g); const c = bb.getCenter(new THREE.Vector3());
    const normal = new THREE.Vector3(rnd() - 0.5, (rnd() - 0.5) * 0.8, rnd() - 0.5).normalize();
    const plane = new THREE.Plane(normal, -normal.dot(c) + (rnd() - 0.5) * 0.05);
    const { a, b } = sliceObject(g, plane, { capColor });
    list.splice(bi, 1); if (a) list.push(a); if (b) list.push(b);
  }
  return list;
}

/** Turn a token into coloured voxels (surface shell) of roughly `size` world units. */
export function voxelize(root, size = 0.11, maxVoxels = 320) {
  root.updateMatrixWorld(true);
  for (let attempt = 0; attempt < 4; attempt++) {
    const map = new Map();
    root.traverse((m) => {
      if (!m.isMesh || m.userData.outline || m.userData.noSlice || !m.geometry?.attributes.position) return;
      const mat = Array.isArray(m.material) ? m.material[0] : m.material;
      let base = mat.color ? mat.color.clone() : new THREE.Color(0xffffff);
      if (mat.emissive && mat.emissiveIntensity > 1 && base.getHex() < 0x222222) base = mat.emissive.clone().multiplyScalar(0.7);
      if (mat.isMeshBasicMaterial && mat.wireframe) base = mat.color.clone();
      const col = m.geometry.attributes.color;
      for (const t of meshTriangles(m)) {
        const [A, B, C] = t; _a.subVectors(B.p, A.p); _b.subVectors(C.p, A.p);
        const area = _a.clone().cross(_b).length() / 2, samples = Math.max(1, Math.ceil(area / (size * size * 0.35)));
        for (let s = 0; s < samples; s++) {
          let u = Math.random(), v = Math.random(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          const p = A.p.clone().addScaledVector(_a, u).addScaledVector(_b, v);
          const k = Math.floor(p.x / size) + ',' + Math.floor(p.y / size) + ',' + Math.floor(p.z / size);
          if (!map.has(k)) { const c = A.c ? new THREE.Color(A.c[0], A.c[1], A.c[2]) : base.clone(); map.set(k, { pos: new THREE.Vector3((Math.floor(p.x / size) + 0.5) * size, (Math.floor(p.y / size) + 0.5) * size, (Math.floor(p.z / size) + 0.5) * size), color: c }); }
        }
      }
    });
    if (map.size <= maxVoxels || attempt === 3) return { voxels: [...map.values()], size };
    size *= Math.sqrt(map.size / maxVoxels) * 1.05;
  }
}
