// Axis-separated AABB vs voxel collision shared by the player, sheep, falling blocks and TNT.
const E = 1e-4;

export function boxOverlaps(world, e) {
  const x0 = Math.floor(e.x - e.hw + 1e-5), x1 = Math.floor(e.x + e.hw - 1e-5);
  const y0 = Math.floor(e.y + 1e-5), y1 = Math.floor(e.y + e.h - 1e-5);
  const z0 = Math.floor(e.z - e.hw + 1e-5), z1 = Math.floor(e.z + e.hw - 1e-5);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (world.solidAt(x, y, z)) return true;
  return false;
}

// Move `e` (x,y,z = feet centre, hw = half width, h = height) by (dx,dy,dz). Returns collision flags.
export function moveBox(world, e, dx, dy, dz) {
  const r = { x: false, y: false, z: false, ground: false };
  // Y first so landing is resolved before horizontal sliding
  let steps = Math.max(1, Math.ceil(Math.abs(dy) / 0.4)), s = dy / steps;
  for (let i = 0; i < steps && dy !== 0; i++) {
    e.y += s;
    if (boxOverlaps(world, e)) {
      if (s > 0) e.y = Math.floor(e.y + e.h) - e.h - E; else { e.y = Math.floor(e.y) + 1 + E; r.ground = true; }
      r.y = true; break;
    }
  }
  steps = Math.max(1, Math.ceil(Math.abs(dx) / 0.4)); s = dx / steps;
  for (let i = 0; i < steps && dx !== 0; i++) {
    e.x += s;
    if (boxOverlaps(world, e)) {
      if (s > 0) e.x = Math.floor(e.x + e.hw) - e.hw - E; else e.x = Math.floor(e.x - e.hw) + 1 + e.hw + E;
      r.x = true; break;
    }
  }
  steps = Math.max(1, Math.ceil(Math.abs(dz) / 0.4)); s = dz / steps;
  for (let i = 0; i < steps && dz !== 0; i++) {
    e.z += s;
    if (boxOverlaps(world, e)) {
      if (s > 0) e.z = Math.floor(e.z + e.hw) - e.hw - E; else e.z = Math.floor(e.z - e.hw) + 1 + e.hw + E;
      r.z = true; break;
    }
  }
  return r;
}
