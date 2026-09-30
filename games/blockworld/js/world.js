// Chunk manager: streams chunks around a focus point through a worker pool, owns block data + edits.
import * as THREE from 'three';
import { CS, H, B, SOLID, PLANT, WATERB } from './blocks.js';

const MAXR = 18;
const OFFSETS = [];
for (let z = -MAXR - 4; z <= MAXR + 4; z++) for (let x = -MAXR - 4; x <= MAXR + 4; x++) OFFSETS.push([x, z, x * x + z * z]);
OFFSETS.sort((a, b) => a[2] - b[2]);

export class World {
  constructor(scene, materials) {
    this.scene = scene;
    this.mats = materials;
    this.chunks = new Map();
    this.edits = new Map();          // "cx,cz" -> Map(idx -> id)
    this.seed = '0';
    this.epoch = 0;
    this.viewDist = 8;
    this.useAO = true;
    this.listeners = [];
    this.results = [];
    this.dirty = [];                 // high-priority remesh
    this.scan = true;
    this.pcx = 1e9; this.pcz = 1e9;
    this.editCount = 0;
    this.unsaved = false;
    this.stats = { genMs: 0, meshMs: 0, meshes: 0, gens: 0 };
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 4) - 2));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.busy = 0;
      w.onmessage = (e) => this.onWorker(w, e.data);
      w.onerror = (e) => console.error('worker error', e.message || e);
      this.workers.push(w);
    }
  }

  key(cx, cz) { return cx + ',' + cz; }

  setSeed(seed, savedEdits) {
    this.seed = String(seed);
    this.epoch++;
    for (const c of this.chunks.values()) this.dropMesh(c);
    this.chunks.clear();
    this.edits.clear();
    this.results.length = 0; this.dirty.length = 0;
    if (savedEdits) for (const k in savedEdits) {
      const m = new Map(); for (const e of savedEdits[k]) m.set(e >> 5, e & 31);
      this.edits.set(k, m);
    }
    this.scan = true; this.pcx = 1e9;
  }

  exportEdits() {
    const o = {};
    for (const [k, m] of this.edits) { if (!m.size) continue; const a = []; for (const [i, id] of m) a.push((i << 5) | id); o[k] = a; }
    return o;
  }

  onChange(fn) { this.listeners.push(fn); }

  // ---------- block access ----------
  chunkAt(x, z) { return this.chunks.get((x >> 4) + ',' + (z >> 4)); }
  getBlock(x, y, z) {
    if (y < 0 || y >= H) return 0;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c || !c.data) return 0;
    return c.data[(y * CS + (z & 15)) * CS + (x & 15)];
  }
  hasData(x, z) { const c = this.chunks.get((x >> 4) + ',' + (z >> 4)); return !!(c && c.data); }
  // solid for entity collision; unloaded terrain is treated as solid so nothing falls through the world
  solidAt(x, y, z) {
    if (y < 0) return true;
    if (y >= H) return false;
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c || !c.data) return true;
    return SOLID[c.data[(y * CS + (z & 15)) * CS + (x & 15)]] === 1;
  }
  topY(x, z) {
    const c = this.chunks.get((x >> 4) + ',' + (z >> 4));
    if (!c || !c.data) return -1;
    for (let y = H - 1; y >= 0; y--) { const b = c.data[(y * CS + (z & 15)) * CS + (x & 15)]; if (b && !PLANT[b]) return y; }
    return -1;
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= H) return false;
    const cx = x >> 4, cz = z >> 4, k = cx + ',' + cz;
    const lx = x & 15, lz = z & 15, i = (y * CS + lz) * CS + lx;
    const c = this.chunks.get(k);
    let old = 0;
    if (c && c.data) { old = c.data[i]; if (old === id) return false; c.data[i] = id; }
    else return false;
    let m = this.edits.get(k); if (!m) { m = new Map(); this.edits.set(k, m); }
    m.set(i, id);
    this.unsaved = true; this.editCount++;
    this.markDirty(c);
    if (lx === 0) this.markDirtyAt(cx - 1, cz); else if (lx === 15) this.markDirtyAt(cx + 1, cz);
    if (lz === 0) this.markDirtyAt(cx, cz - 1); else if (lz === 15) this.markDirtyAt(cx, cz + 1);
    if ((lx === 0 || lx === 15) && (lz === 0 || lz === 15)) this.markDirtyAt(cx + (lx ? 1 : -1), cz + (lz ? 1 : -1));
    for (const fn of this.listeners) fn(x, y, z, old, id);
    return true;
  }
  markDirtyAt(cx, cz) { const c = this.chunks.get(cx + ',' + cz); if (c) this.markDirty(c); }
  markDirty(c) {
    c.ver++;
    if (!c.dirtyQ && c.mesh) { c.dirtyQ = true; this.dirty.push(c); }
    else if (!c.mesh) this.scan = true;
  }

  // ---------- streaming ----------
  onWorker(w, m) {
    w.busy--;
    if (m.epoch !== this.epoch) return;
    if (m.type === 'gen') {
      this.stats.genMs += m.ms; this.stats.gens++;
      const c = this.chunks.get(m.cx + ',' + m.cz);
      if (!c) return;
      c.data = m.data; c.genPending = false;
      const ed = this.edits.get(c.key);
      if (ed) for (const [i, id] of ed) c.data[i] = id;
      this.scan = true;
    } else if (m.type === 'mesh') {
      this.stats.meshMs += m.ms; this.stats.meshes++;
      this.results.push(m);
    }
  }

  pump(pcx, pcz) {
    const R = this.viewDist;
    const cap = 2;
    const free = () => this.workers.filter(w => w.busy < cap).sort((a, b) => a.busy - b.busy)[0];
    // edits first
    while (this.dirty.length) {
      const w = free(); if (!w) return;
      const c = this.dirty.shift(); c.dirtyQ = false;
      if (!this.chunks.has(c.key)) continue;
      this.dispatchMesh(w, c);
    }
    if (!this.scan) return;
    let busy = false;
    const genR2 = (R + 2.5) * (R + 2.5), meshR2 = (R + 0.5) * (R + 0.5);
    // generation
    for (let i = 0; i < OFFSETS.length; i++) {
      const o = OFFSETS[i]; if (o[2] > genR2) break;
      const cx = pcx + o[0], cz = pcz + o[1], k = cx + ',' + cz;
      let c = this.chunks.get(k);
      if (c && (c.data || c.genPending)) continue;
      const w = free(); if (!w) { busy = true; break; }
      if (!c) { c = { cx, cz, key: k, data: null, genPending: false, mesh: null, ver: 0, meshedVer: -1, meshPending: 0, appliedVer: -1, dirtyQ: false }; this.chunks.set(k, c); }
      c.genPending = true; w.busy++;
      const ed = this.edits.get(k);
      w.postMessage({ type: 'gen', seed: this.seed, cx, cz, epoch: this.epoch, edits: ed ? Array.from(ed, ([a, b]) => (a << 5) | b) : null });
    }
    if (!busy) {
      // meshing
      for (let i = 0; i < OFFSETS.length; i++) {
        const o = OFFSETS[i]; if (o[2] > meshR2) break;
        const c = this.chunks.get((pcx + o[0]) + ',' + (pcz + o[1]));
        if (!c || !c.data || c.meshPending || c.meshedVer === c.ver) continue;
        if (!this.neighborsReady(c)) continue;
        const w = free(); if (!w) { busy = true; break; }
        this.dispatchMesh(w, c);
      }
    }
    if (!busy) this.scan = false;
  }

  neighborsReady(c) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const n = this.chunks.get((c.cx + dx) + ',' + (c.cz + dz));
      if (!n || !n.data) return false;
    }
    return true;
  }

  dispatchMesh(w, c) {
    if (!c.data || !this.neighborsReady(c)) return;
    const arr = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) arr.push(this.chunks.get((c.cx + dx) + ',' + (c.cz + dz)).data);
    c.meshPending++; c.meshedVer = c.ver; w.busy++;
    w.postMessage({ type: 'mesh', seed: this.seed, cx: c.cx, cz: c.cz, ver: c.ver, epoch: this.epoch, ao: this.useAO, chunks: arr });
  }

  applyResults(budgetMs) {
    const t0 = performance.now();
    let n = 0;
    while (this.results.length && (n === 0 || performance.now() - t0 < budgetMs)) {
      const m = this.results.shift(); n++;
      const c = this.chunks.get(m.cx + ',' + m.cz);
      if (!c) continue;
      c.meshPending = Math.max(0, c.meshPending - 1);
      if (m.ver < c.appliedVer) continue;   // stale result overtaken by a newer one
      c.appliedVer = m.ver;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      g.setAttribute('a_uv', new THREE.BufferAttribute(m.uv, 2, true));
      g.setAttribute('a_col', new THREE.BufferAttribute(m.col, 4, true));
      g.setIndex(new THREE.BufferAttribute(m.idx, 1));
      if (m.oCount) g.addGroup(0, m.oCount, 0);
      if (m.tCount) g.addGroup(m.oCount, m.tCount, 1);
      const hy = (m.maxY + 2) / 2;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(8, hy, 8), Math.hypot(8, 8, hy) + 1);
      if (c.mesh) { c.mesh.geometry.dispose(); c.mesh.geometry = g; }
      else {
        const mesh = new THREE.Mesh(g, [this.mats.opaque, this.mats.trans]);
        mesh.matrixAutoUpdate = false;
        mesh.position.set(c.cx * CS, 0, c.cz * CS);
        mesh.updateMatrix();
        mesh.userData.chunk = c;
        c.mesh = mesh; this.scene.add(mesh);
      }
      if (c.meshedVer !== c.ver && !c.dirtyQ) { c.dirtyQ = true; this.dirty.push(c); }
    }
  }

  dropMesh(c) {
    if (c.mesh) { this.scene.remove(c.mesh); c.mesh.geometry.dispose(); c.mesh = null; }
  }

  update(fx, fz, budgetMs = 3) {
    const pcx = Math.floor(fx / CS), pcz = Math.floor(fz / CS);
    if (pcx !== this.pcx || pcz !== this.pcz) {
      this.pcx = pcx; this.pcz = pcz; this.scan = true;
      const ur = (this.viewDist + 3.5) * (this.viewDist + 3.5);
      for (const [k, c] of this.chunks) {
        const dx = c.cx - pcx, dz = c.cz - pcz;
        if (dx * dx + dz * dz > ur) { this.dropMesh(c); this.chunks.delete(k); }
      }
    }
    this.pump(pcx, pcz);
    this.applyResults(budgetMs);
  }

  remeshAll() {
    for (const c of this.chunks.values()) { c.ver++; }
    this.scan = true;
    // re-mesh keeps old geometry until the new one arrives
  }

  meshedCount(cx, cz, r) {
    let n = 0, total = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { total++; const c = this.chunks.get((cx + dx) + ',' + (cz + dz)); if (c && c.mesh) n++; }
    return n / total;
  }
  get meshCount() { let n = 0; for (const c of this.chunks.values()) if (c.mesh) n++; return n; }

  // Voxel DDA ray. Skips air and water; returns first block hit.
  raycast(ox, oy, oz, dx, dy, dz, maxD) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1 / (dx || 1e-9)), tdy = Math.abs(1 / (dy || 1e-9)), tdz = Math.abs(1 / (dz || 1e-9));
    let tx = (sx > 0 ? x + 1 - ox : ox - x) * tdx, ty = (sy > 0 ? y + 1 - oy : oy - y) * tdy, tz = (sz > 0 ? z + 1 - oz : oz - z) * tdz;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 100; i++) {
      const b = this.getBlock(x, y, z);
      if (b !== 0 && b !== B.WATER) return { x, y, z, nx, ny, nz, id: b, t };
      if (tx < ty && tx < tz) { t = tx; if (t > maxD) return null; x += sx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { t = ty; if (t > maxD) return null; y += sy; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { t = tz; if (t > maxD) return null; z += sz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }
}
