// Static physics for the world: terrain heightfield, road ribbon, barrier walls.
import * as THREE from 'three';
import { EDGE, WALL_OFF, CELL } from './track.js';
import { G, grp } from './vehicle.js';

export const WALL_H = 1.15;
export const WALL_T = 0.55; // half thickness (thick so nothing tunnels through)

// Geometry of the road surface (also used by the renderer): returns {positions, indices, uvs}
export function roadGeometryData(track) {
  const { pts, N } = track;
  const pos = [], idx = [], uv = [];
  const map = new Int32Array(N).fill(-1);
  let v = 0;
  for (let i = 0; i < N; i++) {
    if (!pts[i].hasRoad) continue;
    const p = pts[i];
    map[i] = v;
    pos.push(p.x - p.rx * EDGE, p.y, p.z - p.rz * EDGE, p.x + p.rx * EDGE, p.y, p.z + p.rz * EDGE);
    uv.push(0, p.s / 32, 1, p.s / 32);
    v += 2;
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (map[i] < 0 || map[j] < 0) continue;
    const a = map[i], b = map[j];
    // left(a) right(a) left(b) right(b); keep an upward-facing winding
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { positions: pos, indices: idx, uvs: uv, map };
}

// Wall geometry (solid extrusion) on one side (+1 right / -1 left). Segments are skipped near the gap.
export function wallGeometryData(track, side, opts = {}) {
  const { pts, N } = track;
  const h = opts.h ?? WALL_H, t = opts.t ?? WALL_T;
  const pos = [], idx = [], uv = [];
  const ok = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    // no wall within the gap (+2 samples each side so the lip is clean)
    const inGap = i >= track.gapStart - 1 && i <= track.gapEnd + 1;
    ok[i] = pts[i].hasRoad && !inGap ? 1 : 0;
  }
  const first = new Int32Array(N).fill(-1);
  let v = 0;
  for (let i = 0; i < N; i++) {
    if (!ok[i]) continue;
    const p = pts[i];
    const oo = opts.off ?? track.wallOff(i, side);
    const inner = side * (oo - t), outer = side * (oo + t);
    const x0 = p.x + p.rx * inner, z0 = p.z + p.rz * inner;
    const x1 = p.x + p.rx * outer, z1 = p.z + p.rz * outer;
    first[i] = v;
    // 0 inner-bottom, 1 inner-top, 2 outer-top, 3 outer-bottom
    pos.push(x0, p.y - 1.6, z0, x0, p.y + h, z0, x1, p.y + h, z1, x1, p.y - 1.6, z1);
    const u = p.s / 12;
    uv.push(u, 0.08, u, 0.42, u, 0.58, u, 0.92);
    v += 4;
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    if (first[i] < 0 || first[j] < 0) continue;
    const a = first[i], b = first[j];
    const quad = (a0, a1, b0, b1) => { idx.push(a0, b0, a1, a1, b0, b1); };
    // orientation is irrelevant for a static trimesh in Rapier (two sided)
    quad(a + 0, a + 1, b + 0, b + 1); // inner face
    quad(a + 1, a + 2, b + 1, b + 2); // top
    quad(a + 2, a + 3, b + 2, b + 3); // outer face
  }
  // end caps
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N, k = (i - 1 + N) % N;
    if (first[i] >= 0 && first[j] < 0) { const a = first[i]; idx.push(a, a + 1, a + 2, a, a + 2, a + 3); }
    if (first[i] >= 0 && first[k] < 0) { const a = first[i]; idx.push(a, a + 2, a + 1, a, a + 3, a + 2); }
  }
  return { positions: pos, indices: idx, uvs: uv, first };
}

export function buildStaticPhysics(RAPIER, world, track, terrain) {
  const handles = { wall: new Set(), ground: new Set() };
  // terrain heightfield (column major: rows follow z, columns follow x)
  const { nx, nz, cell, heights } = terrain;
  const nrows = nz - 1, ncols = nx - 1;
  const h = new Float32Array((nrows + 1) * (ncols + 1));
  for (let j = 0; j < nx; j++) for (let i = 0; i < nz; i++) h[i + j * nz] = heights[i * nx + j];
  const tb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(terrain.x0 + terrain.sizeX / 2, 0, terrain.z0 + terrain.sizeZ / 2));
  const tc = world.createCollider(
    RAPIER.ColliderDesc.heightfield(nrows, ncols, h, { x: terrain.sizeX, y: 1, z: terrain.sizeZ })
      .setFriction(0.8).setCollisionGroups(grp(G.GROUND)), tb);
  handles.ground.add(tc.handle);

  // road
  const rd = roadGeometryData(track);
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const rc = world.createCollider(
    RAPIER.ColliderDesc.trimesh(new Float32Array(rd.positions), new Uint32Array(rd.indices))
      .setFriction(0.8).setCollisionGroups(grp(G.GROUND)), rb);
  handles.ground.add(rc.handle);

  // walls
  for (const side of [-1, 1]) {
    const wd = wallGeometryData(track, side);
    const wb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    const wc = world.createCollider(
      RAPIER.ColliderDesc.trimesh(new Float32Array(wd.positions), new Uint32Array(wd.indices), RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
        .setFriction(0.05).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
        .setRestitution(0.2)
        .setCollisionGroups(grp(G.WALL)), wb);
    handles.wall.add(wc.handle);
  }
  return handles;
}
