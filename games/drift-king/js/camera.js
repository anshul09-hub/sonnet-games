// Chase camera with drift swing, speed FOV, boost pull-back and trauma-based shake.
import * as THREE from 'three';
import { clamp, lerp, damp, dampAngle, wrapAngle, smoothstep } from './util.js';

export class CameraRig {
  constructor(camera, terrain) {
    this.camera = camera;
    this.terrain = terrain;
    this.yaw = 0;
    this.dist = 7.4;
    this.height = 2.6;
    this.fov = 62;
    this.trauma = 0;
    this.time = 0;
    this.roll = 0;
    this.lookAhead = 5;
    this.blend = 0; // 0 = orbit, 1 = chase
    this.orbitAngle = 0.6;
    this.py = 0; // smoothed vertical follow
    this.initialised = false;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.mode = 'orbit';
    this.orbitRadius = 8.6;
    this.orbitHeight = 2.4;
    this._cp = new THREE.Vector3(); this._op = new THREE.Vector3(); this._lp = new THREE.Vector3(); this._ol = new THREE.Vector3();
  }

  addTrauma(t) { this.trauma = Math.min(1, this.trauma + t); }

  snapBehind(car) {
    const yaw = Math.atan2(car.fwd.x, car.fwd.z);
    this.yaw = yaw; this.py = car.pos.y; this.initialised = true;
  }

  // car: Vehicle (uses interpolated pos via alpha), speedKmh etc.
  update(dt, car, alpha, opts = {}) {
    this.time += dt;
    const target = this._cp;
    target.lerpVectors(car.prevPos, car.pos, alpha);
    const speed = car.speedFlat;
    const kmh = speed * 3.6;
    // --- chase pose
    const hy = Math.atan2(car.fwd.x, car.fwd.z);
    let vy = hy;
    if (speed > 5) vy = Math.atan2(car.vel.x, car.vel.z);
    const slip = wrapAngle(vy - hy);
    const drift = car.drifting ? 1 : 0;
    const swing = clamp(slip, -1.1, 1.1) * (0.7 + 0.25 * drift);
    const targetYaw = hy + swing * smoothstep(4, 14, speed);
    if (!this.initialised) { this.yaw = targetYaw; this.py = target.y; this.initialised = true; }
    this.yaw = dampAngle(this.yaw, targetYaw, 3.4 + speed * 0.02, dt);
    this.py = damp(this.py, target.y, 7, dt);
    const boost = car.boostBlend || 0;
    const wantDist = 7.3 + Math.min(kmh, 260) * 0.0085 + boost * 1.6;
    const wantH = 2.45 + Math.min(kmh, 260) * 0.0045 - boost * 0.15;
    this.dist = damp(this.dist, wantDist, 3, dt);
    this.height = damp(this.height, wantH, 3, dt);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const chasePos = this._cp2 || (this._cp2 = new THREE.Vector3());
    chasePos.set(target.x - sy * this.dist, this.py + this.height, target.z - cy * this.dist);
    // look point ahead of the car, slightly up
    const la = 4 + Math.min(speed, 60) * 0.08;
    const chaseLook = this._lp.set(target.x + Math.sin(lerp(this.yaw, hy, 0.5)) * la, target.y + 0.95, target.z + Math.cos(lerp(this.yaw, hy, 0.5)) * la);

    // --- orbit pose (title / results)
    this.orbitAngle += dt * (opts.orbitSpeed ?? 0.22);
    const oa = this.orbitAngle;
    const orbitPos = this._op.set(target.x + Math.sin(oa) * this.orbitRadius, target.y + this.orbitHeight + Math.sin(oa * 0.7) * 0.5, target.z + Math.cos(oa) * this.orbitRadius);
    const orbitLook = this._ol.set(target.x, target.y + 0.55, target.z);

    // blend
    const goal = this.mode === 'chase' ? 1 : 0;
    this.blend = damp(this.blend, goal, opts.blendRate ?? 2.2, dt);
    if (Math.abs(this.blend - goal) < 0.002) this.blend = goal;
    const b = smoothstep(0, 1, this.blend);
    const cam = this.camera;
    const finalPos = this.pos.copy(orbitPos).lerp(chasePos, b);
    const finalLook = this.look.copy(orbitLook).lerp(chaseLook, b);

    // keep above the ground
    const gy = this.terrain.heightAt(finalPos.x, finalPos.z);
    const roadTop = car.groundPoint ? car.groundPoint.y : gy;
    finalPos.y = Math.max(finalPos.y, Math.max(gy, roadTop - 1.5) + 1.1);

    // --- shake
    this.trauma = Math.max(0, this.trauma - dt * 1.5);
    const speedRumble = this.mode === 'chase' ? clamp(kmh / 260, 0, 1) * 0.045 + boost * 0.08 : 0;
    const t2 = Math.min(1, this.trauma + speedRumble);
    const sh = t2 * t2;
    const T = this.time;
    const ox = (Math.sin(T * 43.1) + Math.sin(T * 27.7 + 1.3)) * 0.5 * sh * 0.55;
    const oy = (Math.sin(T * 39.3 + 2.1) + Math.sin(T * 31.9)) * 0.5 * sh * 0.45;
    const oz = (Math.sin(T * 35.7 + 0.7)) * sh * 0.3;
    const rz = Math.sin(T * 33.3) * sh * 0.045;
    finalPos.x += ox; finalPos.y += oy; finalPos.z += oz;

    cam.position.copy(finalPos);
    cam.lookAt(finalLook);
    // bank slightly into turns
    const wantRoll = this.mode === 'chase' ? clamp(-car.visYaw * speed * 0.0009, -0.05, 0.05) : 0;
    this.roll = damp(this.roll, wantRoll, 4, dt);
    cam.rotateZ(this.roll + rz);

    // FOV
    const wantFov = 60 + Math.min(kmh, 280) * 0.045 + boost * 15;
    this.fov = damp(this.fov, this.mode === 'chase' ? wantFov : 52, 4, dt);
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
