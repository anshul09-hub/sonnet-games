// Thin wrapper around Rapier: world, ground slabs, collision groups.
import RAPIER from '@dimforge/rapier3d-compat';
import { GRAVITY, LANE } from './config.js';
import { PROFILE } from './terrain.js';

export let R = null;
export async function initPhysics() {
  await RAPIER.init();
  R = RAPIER;
  return R;
}

// interaction groups: memberships << 16 | filter
export const G = { STATIC: 1, BLOCK: 2, PROJ: 4, DEBRIS: 8 };
export const groups = (member, filter) => ((member << 16) | filter) >>> 0;
export const GROUPS = {
  static: groups(G.STATIC, G.BLOCK | G.PROJ | G.DEBRIS),
  block: groups(G.BLOCK, G.STATIC | G.BLOCK | G.PROJ),
  proj: groups(G.PROJ, G.STATIC | G.BLOCK | G.PROJ),
  debris: groups(G.DEBRIS, G.STATIC),
};

export class PhysWorld {
  constructor() {
    const w = this.world = new R.World({ x: 0, y: GRAVITY, z: 0 });
    w.numSolverIterations = 6;
    w.numAdditionalFrictionIterations = 2;
    this.queue = new R.EventQueue(true);
    this.buildGround();
  }

  buildGround() {
    const w = this.world;
    const body = w.createRigidBody(R.RigidBodyDesc.fixed());
    const half = LANE + 3;
    for (let i = 1; i < PROFILE.length; i++) {
      const [x0, y0] = PROFILE[i - 1], [x1, y1] = PROFILE[i];
      const len = Math.hypot(x1 - x0, y1 - y0), th = Math.atan2(y1 - y0, x1 - x0);
      const nx = -Math.sin(th), ny = Math.cos(th);
      const cx = (x0 + x1) / 2 + nx * -2, cy = (y0 + y1) / 2 + ny * -2;
      const desc = R.ColliderDesc.cuboid(len / 2 + 0.05, 2, half)
        .setTranslation(cx, cy, 0)
        .setRotation({ x: 0, y: 0, z: Math.sin(th / 2), w: Math.cos(th / 2) })
        .setFriction(0.9).setRestitution(0.12)
        .setCollisionGroups(GROUPS.static);
      w.createCollider(desc, body);
    }
    // invisible side walls keep everything in the lane
    for (const s of [-1, 1]) {
      w.createCollider(R.ColliderDesc.cuboid(230, 30, 1)
        .setTranslation(0, 25, s * (LANE + 1.5)).setFriction(0.1).setRestitution(0.2)
        .setCollisionGroups(GROUPS.static), body);
    }
    this.ground = body;
  }

  step(dt) {
    this.world.timestep = dt;
    this.world.step(this.queue);
  }

  drainForces(cb) { this.queue.drainContactForceEvents(cb); }
}
