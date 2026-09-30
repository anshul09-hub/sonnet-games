// First-person player: walking, sprinting, jumping, swimming, optional flying; voxel collision.
import * as THREE from 'three';
import { boxOverlaps, moveBox } from './collide.js';
import { B, WATERB } from './blocks.js';

const GRAV = 27, JUMP = 8.6;

export class Player {
  constructor(world) {
    this.world = world;
    this.e = { x: 0, y: 80, z: 0, hw: 0.3, h: 1.8 };   // feet centre + box
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.inWater = false; this.headInWater = false;
    this.flying = false; this.sprinting = false;
    this.eye = 1.62;
    this.stepDist = 0; this.bob = 0; this.roll = 0;
    this.justLanded = 0; this.lastVy = 0; this.moving = false;
    this.spaceTap = 0;
  }
  get pos() { return this.e; }
  eyePos(out) { return out.set(this.e.x, this.e.y + this.eye, this.e.z); }
  teleport(x, y, z) { this.e.x = x; this.e.y = y; this.e.z = z; this.vel.set(0, 0, 0); }
  intersectsCell(x, y, z) {
    const e = this.e;
    return e.x + e.hw > x && e.x - e.hw < x + 1 && e.y + e.h > y && e.y < y + 1 && e.z + e.hw > z && e.z - e.hw < z + 1;
  }
  lookDir(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  explosionPush(cx, cy, cz, R) {
    const e = this.e, dx = e.x - cx, dy = e.y + 0.9 - cy, dz = e.z - cz, d = Math.hypot(dx, dy, dz), range = R * 3;
    if (d > range) return;
    const f = Math.pow(1 - d / range, 1.3), l = d || 1;
    this.vel.x += dx / l * 26 * f; this.vel.z += dz / l * 26 * f;
    this.vel.y += (dy / l * 12 + 7) * f;
    this.onGround = false;
  }

  update(dt, k, events) {
    const w = this.world, e = this.e, v = this.vel;
    // Freeze until the ground under us exists
    if (!w.hasData(Math.floor(e.x), Math.floor(e.z))) return;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let mx = (k.r ? 1 : 0) - (k.l ? 1 : 0), mz = (k.f ? 1 : 0) - (k.b ? 1 : 0);
    const len = Math.hypot(mx, mz);
    this.moving = len > 0;
    if (len > 0) { mx /= len; mz /= len; }
    const cellFeet = w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.2), Math.floor(e.z));
    const cellHead = w.getBlock(Math.floor(e.x), Math.floor(e.y + this.eye), Math.floor(e.z));
    const wasWater = this.inWater;
    this.inWater = WATERB[cellFeet] === 1 || WATERB[w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.9), Math.floor(e.z))] === 1;
    this.headInWater = WATERB[cellHead] === 1;
    if (this.inWater && !wasWater && v.y < -3) events.splash && events.splash(-v.y);
    this.sprinting = k.sprint && mz > 0 && !this.headInWater;

    let speed = this.flying ? (k.sprint ? 36 : 14) : this.inWater ? 2.9 : this.sprinting ? 6.4 : 4.5;
    const tx = (fx * mz + rx * mx) * speed, tz = (fz * mz + rz * mx) * speed;
    const acc = this.flying ? 9 : this.onGround ? 14 : this.inWater ? 5 : 3.2;
    const a = 1 - Math.exp(-acc * dt);
    if (this.onGround || this.flying || this.inWater || len > 0) { v.x += (tx - v.x) * a; v.z += (tz - v.z) * a; }
    else { const d = 1 - Math.exp(-0.4 * dt); v.x -= v.x * d; v.z -= v.z * d; }

    if (this.flying) {
      const ty = (k.jump ? 1 : 0) * speed * 0.7 - (k.down ? 1 : 0) * speed * 0.7;
      v.y += (ty - v.y) * (1 - Math.exp(-9 * dt));
    } else if (this.inWater) {
      v.y -= 7 * dt;
      if (k.jump) v.y += 22 * dt; else v.y -= 0.0;
      v.y *= Math.exp(-2.2 * dt);
      if (k.jump && this.headInWater === false && v.y > 3.4) v.y = 3.4;
      if (k.jump && v.y > 3.2) v.y = 3.2;
    } else {
      v.y -= GRAV * dt;
      if (v.y < -60) v.y = -60;
      if (k.jump && this.onGround) { v.y = JUMP; this.onGround = false; events.jump && events.jump(); }
    }

    const wasGround = this.onGround;
    const pvy = v.y;
    const r = moveBox(w, e, v.x * dt, v.y * dt, v.z * dt);
    if (r.x) v.x = 0; if (r.z) v.z = 0;
    if (r.y) { if (v.y < 0) { this.onGround = true; if (!wasGround && pvy < -9 && events.land) events.land(-pvy); } v.y = 0; }
    else this.onGround = false;
    if (this.flying && this.onGround) { /* still allow lift-off */ }
    // shove out of blocks (e.g. debris settled on us)
    if (boxOverlaps(w, e)) { e.y += 1; if (boxOverlaps(w, e)) e.y += 1; }

    // footsteps
    const hs = Math.hypot(v.x, v.z);
    if (this.onGround && !this.inWater && !this.flying && hs > 0.6) {
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 1.95 : 1.6;
      if (this.stepDist > stride) { this.stepDist = 0; events.step && events.step(w.getBlock(Math.floor(e.x), Math.floor(e.y - 0.1), Math.floor(e.z))); }
      this.bob += hs * dt * 1.55;
    } else if (this.inWater && hs > 0.5) {
      this.stepDist += hs * dt; if (this.stepDist > 1.8) { this.stepDist = 0; events.swim && events.swim(); }
    } else this.bob *= Math.exp(-6 * dt);
    if (e.y < -30) { events.fell && events.fell(); }
  }
}
