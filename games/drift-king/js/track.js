// Track definition: closed centreline through hills, long straight, sweeper, hairpin,
// jump over a gap, S-bend and a big U-turn. Pure data + maths (no rendering here).
import * as THREE from 'three';
import { clamp, lerp, smoothstep, fbm } from './util.js';

export const ROAD_HW = 7.0; // half width of asphalt
export const KERB_W = 1.3; // kerb strip outside the asphalt
export const EDGE = ROAD_HW + KERB_W; // physical road half width
export const WALL_OFF = EDGE + 1.1; // wall centre line offset
export const SPACING = 2.0; // metres between centreline samples
export const GAP_LEN = 34; // jump gap length
export const RAMP_LEN = 32; // ramp length before the gap
export const RAMP_RISE = 3.0; // how much higher the lip is than the base road
export const LAND_DROP = 1.4; // landing pad is lower than the take-off lip
const PIT_DEPTH = 20;

// x, y (height), z. x east, z south, so heading east then turning right goes south.
const CTRL = [
  [-110, 0, 0], [0, -1, 0], [120, 2, 0], [240, 6, 0],
  [318, 9.5, 20], [366, 12.5, 72], [388, 13, 140], [384, 9.5, 212], [378, 6.5, 252],
  [378, 5, 282], [369, 4, 303], [348, 4, 312], [327, 4, 303], [318, 5.5, 282], [318, 8, 250],
  [314, 11, 215], [311, 13, 190], [294, 15, 168], [262, 16.5, 158], [222, 17, 156],
  [170, 17, 156], [120, 16, 156], [70, 12.5, 156], [25, 9.5, 154],
  [-10, 7, 152], [-40, 5, 128], [-75, 3, 108], [-110, 3, 112], [-140, 4.5, 138], [-175, 6, 158],
  [-230, 6, 158], [-269.5, 5, 147.4], [-298.4, 3, 118.5], [-309, 1, 79], [-298.4, -1, 39.5],
  [-269.5, -2, 10.6], [-230, -2, 0], [-175, -1.5, 0],
];

export function buildTrack() {
  const pts3 = CTRL.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const curve = new THREE.CatmullRomCurve3(pts3, true, 'centripetal');
  curve.arcLengthDivisions = 12000;
  const total = curve.getLength();
  const N = Math.round(total / SPACING);
  const L = N * SPACING; // treat as uniform spacing after rescale
  // Uniform arc length sampling. Start (index 0) is the first control point = start line.
  const raw = curve.getSpacedPoints(N); // N+1 points, last == first
  const pts = [];
  for (let i = 0; i < N; i++) pts.push({ x: raw[i].x, y: raw[i].y, z: raw[i].z, s: i * SPACING });

  // Heading + curvature
  const th = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    th[i] = Math.atan2(b.z - a.z, b.x - a.x);
  }
  // unwrap
  const thu = new Float32Array(N);
  thu[0] = th[0];
  for (let i = 1; i < N; i++) {
    let d = th[i] - th[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    thu[i] = thu[i - 1] + d;
  }
  const kRaw = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let d = th[b] - th[a];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    kRaw[i] = d / (2 * SPACING);
  }
  const k = new Float32Array(N);
  const W = 4;
  for (let i = 0; i < N; i++) {
    let sum = 0;
    for (let j = -W; j <= W; j++) sum += kRaw[(i + j + N) % N];
    k[i] = sum / (2 * W + 1);
  }

  // Jump: find the sample nearest to a point on the west run.
  let jIdx = 0, best = 1e9;
  for (let i = 0; i < N; i++) {
    const d = Math.hypot(pts[i].x - 152, pts[i].z - 156);
    if (d < best) { best = d; jIdx = i; }
  }
  const gapStart = jIdx; // index where road stops (lip)
  const gapEnd = jIdx + Math.round(GAP_LEN / SPACING); // index where road resumes
  const rampStart = gapStart - Math.round(RAMP_LEN / SPACING);
  const landEnd = gapEnd + Math.round(90 / SPACING);

  // Apply ramp / landing offsets to the height.
  for (let i = 0; i < N; i++) {
    let j = 0;
    if (i >= rampStart && i <= gapStart) {
      const t = (i - rampStart) / (gapStart - rampStart);
      j = RAMP_RISE * (t * t * 0.35 + t * 0.65); // eased start, steeper near the lip
    } else if (i > gapStart && i < gapEnd) {
      j = RAMP_RISE; // (no road here, kept continuous for the AI/progress logic)
    } else if (i >= gapEnd && i <= landEnd) {
      const t = (i - gapEnd) / (landEnd - gapEnd);
      j = lerp(RAMP_RISE - LAND_DROP - 3.0, 0, smoothstep(0, 1, t)) ;
      j = lerp(-LAND_DROP, 0, smoothstep(0, 1, t));
    }
    pts[i].y += j;
  }

  // Tangents, right vectors
  for (let i = 0; i < N; i++) {
    const a = pts[(i - 1 + N) % N], b = pts[(i + 1) % N];
    let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const fl = Math.hypot(dx, dz);
    const p = pts[i];
    p.fx = dx / fl; p.fz = dz / fl; // flat tangent
    p.rx = -p.fz; p.rz = p.fx; // right (see comment on axes)
    const l3 = Math.hypot(dx, dy, dz);
    p.tx = dx / l3; p.ty = dy / l3; p.tz = dz / l3;
    p.k = k[i];
    p.hasRoad = !(i > gapStart && i < gapEnd);
  }

  // Run-off / fence zones: outside of every corner and along the start straight.
  // fence[0] = left side, fence[1] = right side (0..1, smoothed).
  const fenceRaw = [new Float32Array(N), new Float32Array(N)];
  {
    let i = 0;
    while (i < N) {
      if (Math.abs(pts[i].k) > 0.011) {
        let j = i, ks = 0;
        while (j < N && Math.abs(pts[j].k) > 0.011) { ks += pts[j].k; j++; }
        if (j - i > 8) {
          const outside = ks > 0 ? 0 : 1; // right turn -> outside is the left side
          for (let m = i - 10; m < j + 10; m++) fenceRaw[outside][((m % N) + N) % N] = 1;
        }
        i = j;
      } else i++;
    }
    for (let m = N - 55; m < N + 110; m++) { const ii = m % N; fenceRaw[0][ii] = 1; fenceRaw[1][ii] = 1; }
    // never around the jump
    for (let m = rampStart - 20; m <= landEnd + 10; m++) { fenceRaw[0][m] = 0; fenceRaw[1][m] = 0; }
  }
  const fence = fenceRaw.map((f) => {
    const out = new Float32Array(N);
    const W = 8;
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = -W; j <= W; j++) sum += f[(i + j + N) % N];
      out[i] = sum / (2 * W + 1);
    }
    return out;
  });
  const RUNOFF = 4.4;
  const wallOff = (i, side) => WALL_OFF + RUNOFF * smoothstep(0.15, 0.95, fence[side < 0 ? 0 : 1][((i % N) + N) % N]);

  const track = {
    pts, N, L, spacing: SPACING, gapStart, gapEnd, rampStart, landEnd, fence, wallOff, RUNOFF,
    hw: ROAD_HW, edge: EDGE,
    idx: (i) => pts[((i % N) + N) % N],
  };

  // Bounding box of the whole thing
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  track.bounds = { minX, maxX, minZ, maxZ };

  track.nearest = (x, z, hint = -1, window = 30) => {
    let bi = -1, bd = 1e12;
    if (hint < 0) {
      for (let i = 0; i < N; i++) {
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bi = i; }
      }
    } else {
      for (let o = -Math.floor(window / 3); o <= window; o++) {
        const i = (((hint + o) % N) + N) % N;
        const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
        if (d < bd) { bd = d; bi = i; }
      }
    }
    return { i: bi, d: Math.sqrt(bd) };
  };
  // Signed lateral offset (positive = right of the centreline) of a point relative to sample i.
  track.lateral = (x, z, i) => {
    const p = pts[i];
    return (x - p.x) * p.rx + (z - p.z) * p.rz;
  };
  return track;
}

// ---------------------------------------------------------------------------------------
// Terrain: a heightfield that hugs the road near it and rolls into hills further away.
// ---------------------------------------------------------------------------------------
export const CELL = 3;
export function buildTerrain(track) {
  const M = 200;
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const x0 = Math.floor((minX - M) / CELL) * CELL, z0 = Math.floor((minZ - M) / CELL) * CELL;
  const nx = Math.ceil((maxX + M - x0) / CELL) + 1, nz = Math.ceil((maxZ + M - z0) / CELL) + 1;
  const n = nx * nz;
  const dist = new Float32Array(n).fill(1e9);
  const roadY = new Float32Array(n);
  const inGap = new Uint8Array(n);
  const R = 62;
  const { pts, N } = track;
  for (let i = 0; i < N; i++) {
    const a = pts[i], b = pts[(i + 1) % N];
    const gap = (i > track.gapStart + 0 && i < track.gapEnd - 1) ? 1 : 0;
    const sx = b.x - a.x, sz = b.z - a.z, sl2 = sx * sx + sz * sz;
    const cx0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - R - x0) / CELL));
    const cx1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + R - x0) / CELL));
    const cz0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - R - z0) / CELL));
    const cz1 = Math.min(nz - 1, Math.ceil((Math.max(a.z, b.z) + R - z0) / CELL));
    for (let cz = cz0; cz <= cz1; cz++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const px = x0 + cx * CELL, pz = z0 + cz * CELL;
        let t = ((px - a.x) * sx + (pz - a.z) * sz) / sl2;
        t = clamp(t, 0, 1);
        const qx = a.x + sx * t - px, qz = a.z + sz * t - pz;
        const d = Math.hypot(qx, qz);
        const idx = cz * nx + cx;
        if (d < dist[idx]) {
          dist[idx] = d;
          roadY[idx] = lerp(a.y, b.y, t);
          inGap[idx] = gap;
        }
      }
    }
  }
  const heights = new Float32Array(n);
  const cxm = (minX + maxX) / 2, czm = (minZ + maxZ) / 2;
  const far = (x, z) => {
    const base = fbm(x * 0.0048 + 11.3, z * 0.0048 - 4.7, 4);
    const detail = fbm(x * 0.02 - 3, z * 0.02 + 8, 2);
    const ridge = 1 - Math.abs(fbm(x * 0.0026 + 40, z * 0.0026 + 9, 3) * 2 - 1);
    return -6 + 46 * base + 3.2 * detail + 12 * ridge * ridge;
  };
  for (let cz = 0; cz < nz; cz++) {
    for (let cx = 0; cx < nx; cx++) {
      const idx = cz * nx + cx;
      const x = x0 + cx * CELL, z = z0 + cz * CELL;
      const d = dist[idx];
      let f = far(x, z);
      // rim of the world rises up so the play area is enclosed by hills
      const dEdge = Math.min(x - x0, x0 + (nx - 1) * CELL - x, z - z0, z0 + (nz - 1) * CELL - z);
      f += 26 * (1 - smoothstep(0, 130, dEdge));
      let target = roadY[idx] - 0.4;
      let flat = EDGE + 3.0;
      let blendW = 34;
      if (inGap[idx]) { target = roadY[idx] - PIT_DEPTH; flat = EDGE + 0.5; blendW = 13; }
      const t = smoothstep(flat + 3.5, flat + 3.5 + blendW, d);
      let h = lerp(target, f, t);
      // shoulder just outside the kerb is flat-ish gravel run-off
      if (!inGap[idx] && d < flat + 3.5) h = target - (d > EDGE + 0.2 ? (d - EDGE) * 0.03 : 0);
      heights[idx] = h;
    }
  }
  const terrain = { x0, z0, nx, nz, cell: CELL, heights, dist, inGap };
  terrain.sizeX = (nx - 1) * CELL;
  terrain.sizeZ = (nz - 1) * CELL;
  terrain.heightAt = (x, z) => {
    const fx = clamp((x - x0) / CELL, 0, nx - 1.001), fz = clamp((z - z0) / CELL, 0, nz - 1.001);
    const ix = Math.floor(fx), iz = Math.floor(fz);
    const tx = fx - ix, tz = fz - iz;
    const h00 = heights[iz * nx + ix], h10 = heights[iz * nx + ix + 1];
    const h01 = heights[(iz + 1) * nx + ix], h11 = heights[(iz + 1) * nx + ix + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };
  return terrain;
}
