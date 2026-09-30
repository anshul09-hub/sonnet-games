// Physics dice. A real Rapier simulation of a cube thrown into a tray: the face that lands up is the result.
// The authoritative machine (host / offline) simulates once, records the trajectory and everybody replays it,
// so all players see the very same tumble. Pure module (no three.js) so it also runs in Node tests.

// Faces: pip value for each local axis direction. Opposite faces add up to 7.
export const FACES = [
  { v: 1, n: [0, 1, 0] }, { v: 6, n: [0, -1, 0] },
  { v: 3, n: [1, 0, 0] }, { v: 4, n: [-1, 0, 0] },
  { v: 2, n: [0, 0, 1] }, { v: 5, n: [0, 0, -1] },
];
export const TRAY = { hx: 3.4, hz: 2.4, wall: 1.6, half: 0.5 }; // interior half extents in die units (die is 1x1x1)

/** Rotate vector v by unit quaternion q. */
export function rotate(q, v) {
  const { x, y, z, w } = q, [vx, vy, vz] = v;
  const c1x = y * vz - z * vy, c1y = z * vx - x * vz, c1z = x * vy - y * vx;
  const c2x = y * c1z - z * c1y, c2y = z * c1x - x * c1z, c2z = x * c1y - y * c1x;
  return [vx + 2 * (w * c1x + c2x), vy + 2 * (w * c1y + c2y), vz + 2 * (w * c1z + c2z)];
}

/** Which face points up for orientation q? `ny` is how vertical it is (1 = perfectly flat). */
export function upFace(q) {
  let best = 1, bv = -2;
  for (const f of FACES) { const ry = rotate(q, f.n)[1]; if (ry > bv) { bv = ry; best = f.v; } }
  return { value: best, ny: bv };
}

export class DiceSim {
  constructor(RAPIER) {
    this.R = RAPIER;
    const R = RAPIER;
    this.world = new R.World({ x: 0, y: -34, z: 0 });
    this.world.timestep = 1 / 60;
    const fix = (cx, cy, cz, hx, hy, hz, rest = 0.42, fr = 0.55) => {
      const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(cx, cy, cz));
      this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setRestitution(rest).setFriction(fr), b);
    };
    const { hx, hz, wall } = TRAY;
    fix(0, -0.5, 0, hx + 1, 0.5, hz + 1, 0.38, 0.6); // floor (top at y=0)
    fix(-hx - 0.5, wall / 2, 0, 0.5, wall, hz + 1, 0.55, 0.3);
    fix(hx + 0.5, wall / 2, 0, 0.5, wall, hz + 1, 0.55, 0.3);
    fix(0, wall / 2, -hz - 0.5, hx + 1, wall, 0.5, 0.55, 0.3);
    fix(0, wall / 2, hz + 0.5, hx + 1, wall, 0.5, 0.55, 0.3);
    fix(0, 5.2, 0, hx + 1, 0.5, hz + 1, 0.3, 0.3); // invisible ceiling keeps the die in the tray
  }

  /**
   * Simulate one throw. p = {x,y,z, vx,vy,vz, ax,ay,az, q:{x,y,z,w}}
   * Returns { frames: flat [x,y,z,qx,qy,qz,qw,...] at 60Hz, value, hits: [[frame, strength]...] }
   */
  throwDie(p) {
    const R = this.R, world = this.world;
    const q = p.q || { x: 0, y: 0, z: 0, w: 1 };
    const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(p.x, p.y, p.z).setRotation(q).setLinvel(p.vx, p.vy, p.vz).setAngvel({ x: p.ax, y: p.ay, z: p.az }).setLinearDamping(0.08).setAngularDamping(0.32).setCcdEnabled(true));
    world.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5).setRestitution(0.5).setFriction(0.6).setDensity(1.2), body);
    const frames = [], hits = [];
    let lastV = null, still = 0;
    for (let i = 0; i < 420; i++) {
      world.step();
      const t = body.translation(), r = body.rotation(), v = body.linvel(), a = body.angvel();
      frames.push(t.x, t.y, t.z, r.x, r.y, r.z, r.w);
      if (lastV) {
        const dv = Math.hypot(v.x - lastV.x, v.y - lastV.y, v.z - lastV.z);
        if (dv > 3.2) hits.push([i, Math.min(1, dv / 16)]);
      }
      lastV = { x: v.x, y: v.y, z: v.z };
      const slow = Math.hypot(v.x, v.y, v.z) < 0.06 && Math.hypot(a.x, a.y, a.z) < 0.12;
      still = slow ? still + 1 : 0;
      if (still > 14 || body.isSleeping()) break;
    }
    // make sure the last pose is perfectly flat so the top face is unambiguous
    let q1 = body.rotation(), t1 = body.translation();
    const { value, ny } = upFace(q1);
    let flat = ny > 0.985;
    if (!flat) {
      // ease into the nearest flat orientation over ~12 frames (only happens when the die rests against a wall)
      const target = nearestFlat(q1);
      for (let k = 1; k <= 12; k++) {
        const s = k / 12, e = s * s * (3 - 2 * s);
        const qq = slerp(q1, target, e);
        frames.push(t1.x, t1.y + (0.5 - t1.y) * e, t1.z, qq.x, qq.y, qq.z, qq.w);
      }
    }
    world.removeRigidBody(body);
    const last = frames.length - 7;
    const fin = upFace({ x: frames[last + 3], y: frames[last + 4], z: frames[last + 5], w: frames[last + 6] });
    return { frames, value: fin.value, hits, n: frames.length / 7 };
  }

  /** Random throw from the player's side of the tray. dir is the flick direction in tray space (x right, z away from player). */
  randomThrow(rnd, dir = null, power = 1) {
    const r = () => rnd() * 2 - 1;
    let dx = dir ? dir.x : r() * 0.35, dz = dir ? dir.z : -1;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    const sp = (9 + rnd() * 5) * power;
    const q = randomQuat(rnd);
    return {
      x: -dz * 0 + (rnd() - 0.5) * 1.6, y: 2.2 + rnd() * 0.6, z: TRAY.hz - 0.9,
      vx: dx * sp + r() * 1.2, vy: 2 + rnd() * 4, vz: dz * sp * 0.75 + r() * 0.8,
      ax: r() * 22, ay: r() * 22, az: r() * 22, q,
    };
  }

  /** Simulate throws until the die lands on `target` (used by tests and debug hooks). Still real physics. */
  throwForcing(target, rnd, dir, power) {
    for (let i = 0; i < 80; i++) { const res = this.throwDie(this.randomThrow(rnd, dir, power)); if (res.value === target) return res; }
    return this.throwDie(this.randomThrow(rnd, dir, power));
  }
}

function randomQuat(rnd) {
  const u1 = rnd(), u2 = rnd(), u3 = rnd();
  const a = Math.sqrt(1 - u1), b = Math.sqrt(u1);
  return { x: a * Math.sin(2 * Math.PI * u2), y: a * Math.cos(2 * Math.PI * u2), z: b * Math.sin(2 * Math.PI * u3), w: b * Math.cos(2 * Math.PI * u3) };
}
function slerp(a, b, t) {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w; let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  if (cos < 0) { cos = -cos; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (cos > 0.9995) { const r = { x: a.x + (bx - a.x) * t, y: a.y + (by - a.y) * t, z: a.z + (bz - a.z) * t, w: a.w + (bw - a.w) * t }; const l = Math.hypot(r.x, r.y, r.z, r.w); return { x: r.x / l, y: r.y / l, z: r.z / l, w: r.w / l }; }
  const th = Math.acos(cos), s = Math.sin(th), w1 = Math.sin((1 - t) * th) / s, w2 = Math.sin(t * th) / s;
  return { x: a.x * w1 + bx * w2, y: a.y * w1 + by * w2, z: a.z * w1 + bz * w2, w: a.w * w1 + bw * w2 };
}
/** Snap q to the closest of the 24 axis-aligned orientations (a flat die) while keeping yaw close. */
function nearestFlat(q) {
  const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, -1, 0], [0, 0, -1]];
  // rotate local axes by q, find which world axis each aligns with, rebuild a rotation matrix from snapped axes
  const rot = (v) => rotate(q, v);
  const snap = (v) => { let bi = 0, bd = -9; axes.forEach((a, i) => { const d = a[0] * v[0] + a[1] * v[1] + a[2] * v[2]; if (d > bd) { bd = d; bi = i; } }); return axes[bi]; };
  const X = snap(rot([1, 0, 0])), Y = snap(rot([0, 1, 0]));
  const Z = [X[1] * Y[2] - X[2] * Y[1], X[2] * Y[0] - X[0] * Y[2], X[0] * Y[1] - X[1] * Y[0]];
  // rotation matrix columns X,Y,Z -> quaternion
  const m00 = X[0], m01 = Y[0], m02 = Z[0], m10 = X[1], m11 = Y[1], m12 = Z[1], m20 = X[2], m21 = Y[2], m22 = Z[2];
  const tr = m00 + m11 + m22; let w, x, y, z;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; x = (m21 - m12) / s; y = (m02 - m20) / s; z = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
  return { x, y, z, w };
}

/** Compact wire format: ints (positions x1000, quats x1000 rounded) so a throw is a few KB of JSON. */
export function packThrow(res) {
  const f = res.frames, out = new Array(f.length);
  for (let i = 0; i < f.length; i++) out[i] = Math.round(f[i] * 1000);
  return { f: out, v: res.value, h: res.hits.map(([i, s]) => [i, Math.round(s * 100)]) };
}
export function unpackThrow(p) {
  const frames = new Float32Array(p.f.length);
  for (let i = 0; i < p.f.length; i++) frames[i] = p.f[i] / 1000;
  // renormalise quaternions after rounding
  for (let i = 0; i < frames.length; i += 7) { const l = Math.hypot(frames[i + 3], frames[i + 4], frames[i + 5], frames[i + 6]) || 1; for (let k = 3; k < 7; k++) frames[i + k] /= l; }
  return { frames, value: p.v, hits: p.h.map(([i, s]) => [i, s / 100]), n: frames.length / 7 };
}
