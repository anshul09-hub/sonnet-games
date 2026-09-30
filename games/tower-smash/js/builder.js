// Level-building DSL. Coordinates given to the builder are LOCAL: x from the
// castle origin, y above the plateau surface, z across the lane (0 = centre).
// Structure helpers take the MIN corner. The output is plain spec data.
import { PLATEAU_Y } from './terrain.js';

// split a length into brick pieces, staggered by parity (running bond)
export function tile(len, parity, bl = 2) {
  const out = [];
  if (len <= 0) return out;
  let rest = len;
  if (parity && len > 1) { out.push(1); rest -= 1; }
  while (rest >= bl) { out.push(bl); rest -= bl; }
  if (rest > 0) out.push(rest);
  return out;
}

export class Builder {
  constructor(ox, gy = PLATEAU_Y) {
    this.ox = ox; this.gy = gy;
    this.blocks = []; this.flags = []; this.pendulums = []; this.platforms = [];
  }

  // low-level box (min corner)
  box(mat, x, y, z, sx, sy, sz, extra = {}) {
    const s = { mat, x: this.ox + x + sx / 2, y: this.gy + y + sy / 2, z: z + sz / 2, sx, sy, sz, ...extra };
    this.blocks.push(s);
    return s;
  }
  static(mat, x, y, z, sx, sy, sz) { return this.box(mat, x, y, z, sx, sy, sz, { static: true }); }

  // running-bond wall
  wall(o) {
    const { x, z, y = 0, len, rows, axis = 'x', t = 1, h = 1, bl = 2, par0 = 0, crenel = false } = o;
    let mat = o.mat || 'stone';
    for (let r = 0; r < rows; r++) {
      const tp = (r + par0) & 1;
      const pieces = tile(len, tp, bl);
      let pos = 0;
      pieces.forEach((pl, i) => {
        const top = r === rows - 1;
        const m = typeof mat === 'function' ? mat(r, i, pieces.length) : mat;
        const skip = crenel && top && (i & 1);
        if (!skip && m) {
          if (axis === 'x') this.box(m, x + pos, y + r * h, z, pl, h, t);
          else this.box(m, x, y + r * h, z + pos, t, h, pl);
        }
        pos += pl;
      });
    }
    return y + rows * h;
  }

  // hollow tower ring, optional wooden floors. mat(r, side, i) may return null (gap) or a material
  tower(o) {
    const { x, z, w, d, rows, t = 1, h = 1, crenel = false, floors = [], floorMat = 'wood', floorTh = 0.5 } = o;
    let y = o.y || 0;
    this.lastFloors = [];                       // y of each slab top, in order
    const matFn = typeof o.mat === 'function' ? o.mat : () => o.mat || 'stone';
    for (let r = 0; r < rows; r++) {
      const even = (r & 1) === 0;
      const top = r === rows - 1;
      const par = (r >> 1) & 1;
      const mk = (side) => (rr, i, n) => matFn(r, side, i, n);
      const cr = crenel && top;
      const run = (side, ax, px, pz, len) => {
        const pieces = tile(len, par, 2);
        let pos = 0;
        pieces.forEach((pl, i) => {
          const m = mk(side)(r, i, pieces.length);
          if (m && !(cr && (i & 1))) {
            if (ax === 'x') this.box(m, px + pos, y, pz, pl, h, t);
            else this.box(m, px, y, pz + pos, t, h, pl);
          }
          pos += pl;
        });
      };
      if (even) {
        run('front', 'x', x, z + d - t, w);
        run('back', 'x', x, z, w);
        run('left', 'z', x, z + t, d - 2 * t);
        run('right', 'z', x + w - t, z + t, d - 2 * t);
      } else {
        run('left', 'z', x, z, d);
        run('right', 'z', x + w - t, z, d);
        run('front', 'x', x + t, z + d - t, w - 2 * t);
        run('back', 'x', x + t, z, w - 2 * t);
      }
      y += h;
      if (floors.includes(r)) { this.slab({ x, z, w, d, y, mat: floorMat, th: floorTh }); y += floorTh; this.lastFloors.push(y); }
    }
    return y;
  }

  // floor of planks running across z
  slab(o) {
    const { x, z, w, d, y, mat = 'wood', th = 0.5, pw = 2 } = o;
    let pos = 0;
    while (pos < w - 1e-6) {
      const pl = Math.min(pw, w - pos);
      this.box(mat, x + pos, y, z, pl, th, d);
      pos += pl;
    }
    return y + th;
  }

  // filled grid of identical blocks
  solid(o) {
    const { x, y = 0, z, nx, ny, nz, sx = 1, sy = 1, sz = 1, mat = 'wood' } = o;
    for (let k = 0; k < ny; k++) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const m = typeof mat === 'function' ? mat(i, k, j) : mat;
      if (m) this.box(m, x + i * sx, y + k * sy, z + j * sz, sx, sy, sz);
    }
    return y + ny * sy;
  }

  post(x, y, z, hgt, mat = 'wood', s = 0.6) { return this.box(mat, x - s / 2, y, z - s / 2, s, hgt, s); }

  // TNT barrel; x, z = centre, y = bottom
  barrel(x, y, z) {
    const s = { mat: 'tnt', x: this.ox + x, y: this.gy + y + 0.5, z, sx: 0.9, sy: 1, sz: 0.9 };
    this.blocks.push(s);
    return s;
  }

  // enemy flag; x, z = centre of base, y = bottom. `ref` = platform index it rides on
  flag(x, y, z, ref = null) {
    const f = { x: this.ox + x, y: this.gy + y, z, ref };
    this.flags.push(f);
    return f;
  }

  // wrecking ball on a rod. pivot local (x,y,z); rod length len; ball radius r; initial swing angle (deg)
  pendulum(o) {
    const p = { x: this.ox + o.x, y: this.gy + o.y, z: o.z || 0, len: o.len, r: o.r || 1.3, ang: (o.ang ?? 55) * Math.PI / 180, density: o.density || 6 };
    this.pendulums.push(p);
    return p;
  }

  // gallows crane: two pylons outside the swing arc plus a top beam. Returns the pivot (local coords).
  crane(x, z, hgt, span, mat = 'swood') {
    this.static(mat, x, 0, z - 0.45, 0.9, hgt, 0.9);
    this.static(mat, x + span - 0.9, 0, z - 0.45, 0.9, hgt, 0.9);
    this.static(mat, x - 0.4, hgt, z - 0.45, span + 0.8, 0.7, 0.9);
    return { px: x + span / 2, py: hgt };
  }

  // kinematic platform. Returns its index (for `ref`). y = deck bottom at rest.
  platform(o) {
    const p = {
      x: this.ox + o.x + o.w / 2, y: this.gy + (o.y || 0) + (o.th || 0.7) / 2, z: o.z + o.d / 2,
      w: o.w, d: o.d, th: o.th || 0.7, axis: o.axis || 'x', range: o.range || 5, period: o.period || 8, phase: o.phase || 0,
    };
    this.platforms.push(p);
    return this.platforms.length - 1;
  }
}
