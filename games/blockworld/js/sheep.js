// Sheep: wander, stop, turn, graze, and hop up one-block steps. Boxy models with painted textures.
import * as THREE from 'three';
import { moveBox } from './collide.js';
import { B, SOLID, WATERB } from './blocks.js';
import { makeSheepTextures } from './textures.js';

const WOOL = [[1, 1, 1, 0.66], [0.78, 0.78, 0.78, 0.14], [0.6, 0.45, 0.32, 0.1], [0.28, 0.27, 0.3, 0.05], [1.0, 0.72, 0.82, 0.05]];

export class SheepManager {
  constructor(scene, world, audio) {
    this.scene = scene; this.world = world; this.audio = audio;
    this.list = [];
    this.tex = makeSheepTextures();
    this.geo = {
      body: new THREE.BoxGeometry(0.92, 0.78, 1.25),
      head: new THREE.BoxGeometry(0.5, 0.5, 0.5),
      tuft: new THREE.BoxGeometry(0.56, 0.16, 0.56),
      leg: new THREE.BoxGeometry(0.2, 0.5, 0.2),
    };
    const lam = (map, color) => new THREE.MeshLambertMaterial({ map, color });
    this.skinMat = lam(this.tex.skin, 0xffffff);
    this.faceMats = [this.skinMat, this.skinMat, this.skinMat, this.skinMat, this.skinMat, lam(this.tex.face, 0xffffff)];
    this.legMat = lam(this.tex.skin, 0xb9a48f);
    this.woolMats = WOOL.map(w => lam(this.tex.wool, new THREE.Color(w[0], w[1], w[2])));
    this.spawnT = 0; this.target = 8;
    this.ambient = new THREE.AmbientLight(0xffffff, 1.7); scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5); this.sun.position.set(0, 1, 0); scene.add(this.sun); scene.add(this.sun.target);
  }

  lighting(sky, camera) {
    const c = sky.lightColor;
    this.ambient.color.copy(c).multiplyScalar(0.62).addScalar(0.06);
    this.ambient.intensity = Math.PI;
    const d = sky.sunDir;
    const up = d.y > -0.05 ? 1 : -1;
    this.sun.position.copy(camera.position).addScaledVector(d, 50 * up);
    this.sun.target.position.copy(camera.position);
    this.sun.color.copy(c).multiplyScalar(sky.dayF * 0.85 + 0.06);
    this.sun.intensity = Math.PI * 0.75;
  }

  spawn(x, y, z) {
    let r = Math.random(), wi = 0;
    for (let i = 0; i < WOOL.length; i++) { r -= WOOL[i][3]; if (r <= 0) { wi = i; break; } }
    const g = new THREE.Group();
    const body = new THREE.Mesh(this.geo.body, this.woolMats[wi]); body.position.set(0, 0.95, 0.02); g.add(body);
    const headPivot = new THREE.Group(); headPivot.position.set(0, 1.12, -0.6); g.add(headPivot);
    const head = new THREE.Mesh(this.geo.head, this.faceMats); head.position.set(0, 0.05, -0.28); headPivot.add(head);
    const tuft = new THREE.Mesh(this.geo.tuft, this.woolMats[wi]); tuft.position.set(0, 0.32, -0.26); headPivot.add(tuft);
    const legs = [];
    for (const [lx, lz] of [[-0.27, -0.42], [0.27, -0.42], [-0.27, 0.46], [0.27, 0.46]]) {
      const pv = new THREE.Group(); pv.position.set(lx, 0.6, lz);
      const leg = new THREE.Mesh(this.geo.leg, this.legMat); leg.position.y = -0.25; pv.add(leg); g.add(pv); legs.push(pv);
    }
    this.scene.add(g);
    const s = { g, head: headPivot, legs, e: { x, y, z, hw: 0.42, h: 1.1 }, vy: 0, yaw: Math.random() * 6.28, targetYaw: 0, state: 'idle', timer: 1 + Math.random() * 3,
      kx: 0, kz: 0, phase: Math.random() * 6, graze: 0, grazeT: 0, speed: 0.85 + Math.random() * 0.4, hop: 0, inWater: false, ground: false, seed: Math.random() * 100 };
    s.targetYaw = s.yaw;
    this.list.push(s);
    return s;
  }

  clear() { for (const s of this.list) this.scene.remove(s.g); this.list.length = 0; }

  trySpawnNear(px, pz, minR, maxR, group) {
    const w = this.world;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = Math.random() * Math.PI * 2, r = minR + Math.random() * (maxR - minR);
      const x = Math.floor(px + Math.cos(a) * r), z = Math.floor(pz + Math.sin(a) * r);
      if (!w.hasData(x, z)) continue;
      const ty = w.topY(x, z); if (ty < 0) continue;
      const b = w.getBlock(x, ty, z);
      if (b !== B.GRASS && b !== B.SNOW) continue;
      if (w.solidAt(x, ty + 1, z) || w.solidAt(x, ty + 2, z)) continue;
      const n = group ? 2 + (Math.random() * 3 | 0) : 1;
      for (let i = 0; i < n; i++) this.spawn(x + 0.5 + (Math.random() - 0.5) * 3, ty + 1, z + 0.5 + (Math.random() - 0.5) * 3);
      return true;
    }
    return false;
  }

  explosionPush(cx, cy, cz, R) {
    for (const s of this.list) {
      const e = s.e, dx = e.x - cx, dy = e.y + 0.5 - cy, dz = e.z - cz, d = Math.hypot(dx, dy, dz), range = R * 3.2;
      if (d > range) continue;
      const f = Math.pow(1 - d / range, 1.2), l = d || 1;
      s.kx += dx / l * 16 * f; s.kz += dz / l * 16 * f; s.vy += (dy / l * 8 + 6) * f;
      s.state = 'idle'; s.timer = 1.5;
    }
  }

  update(dt, px, pz, time) {
    const w = this.world;
    // population management
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 2;
      if (this.list.length < this.target) this.trySpawnNear(px, pz, 14, 42, true);
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i], e = s.e;
      const d = Math.hypot(e.x - px, e.z - pz);
      if (d > 90 || e.y < -10) { this.scene.remove(s.g); this.list.splice(i, 1); continue; }
      if (!w.hasData(Math.floor(e.x), Math.floor(e.z))) { continue; }
      this.think(s, dt, px, pz);
      // movement
      let wx = 0, wz = 0;
      if (s.state === 'walk') { wx = -Math.sin(s.yaw) * s.speed; wz = -Math.cos(s.yaw) * s.speed; }
      s.kx *= Math.exp(-3 * dt); s.kz *= Math.exp(-3 * dt);
      const wet = WATERB[w.getBlock(Math.floor(e.x), Math.floor(e.y + 0.4), Math.floor(e.z))] === 1;
      s.inWater = wet;
      if (wet) { s.vy += (s.vy < 2 ? 22 : 0) * dt; s.vy *= Math.exp(-2 * dt); wx *= 0.6; wz *= 0.6; }
      else s.vy -= 27 * dt;
      const r = moveBox(w, e, (wx + s.kx) * dt, s.vy * dt, (wz + s.kz) * dt);
      s.ground = r.ground;
      if (r.y) s.vy = 0;
      if (s.state === 'walk' && (r.x || r.z)) {
        // hop up a one-block step, else turn away
        const fx = Math.floor(e.x - Math.sin(s.yaw) * 0.75), fz = Math.floor(e.z - Math.cos(s.yaw) * 0.75), fy = Math.floor(e.y + 0.05);
        if (s.ground && SOLID[w.getBlock(fx, fy, fz)] && !w.solidAt(fx, fy + 1, fz) && !w.solidAt(fx, fy + 2, fz)) { s.vy = 8.4; s.ground = false; }
        else if (s.ground || wet) { s.state = 'turn'; s.targetYaw = s.yaw + Math.PI * (0.6 + Math.random() * 0.8) * (Math.random() < 0.5 ? 1 : -1); s.timer = 3; }
      }
      // animate
      const moving = s.state === 'walk' && s.ground;
      s.phase += dt * (moving ? 7.5 * s.speed : 0);
      const sw = moving ? 0.6 : 0;
      s.legs[0].rotation.x = Math.sin(s.phase) * sw; s.legs[3].rotation.x = Math.sin(s.phase) * sw;
      s.legs[1].rotation.x = -Math.sin(s.phase) * sw; s.legs[2].rotation.x = -Math.sin(s.phase) * sw;
      if (!s.ground && !wet) for (const l of s.legs) l.rotation.x = 0.5 * (l === s.legs[0] || l === s.legs[1] ? -1 : 1) * Math.min(1, Math.abs(s.vy) * 0.2);
      s.graze += ((s.state === 'idle' && s.grazeT > 0 ? 1 : 0) - s.graze) * Math.min(1, dt * 5);
      s.head.rotation.x = s.graze * 0.85 + Math.sin(time * 1.3 + s.seed) * 0.03;
      s.head.rotation.y = Math.sin(time * 0.7 + s.seed * 2) * 0.12 * (1 - s.graze);
      s.g.position.set(e.x, e.y + (moving ? Math.abs(Math.sin(s.phase)) * 0.03 : 0), e.z);
      s.g.rotation.y = s.yaw;
    }
  }

  think(s, dt, px, pz) {
    s.timer -= dt;
    if (s.grazeT > 0) s.grazeT -= dt;
    if (s.state === 'idle') {
      if (s.timer <= 0) {
        const r = Math.random();
        if (r < 0.28) { s.grazeT = 1.4 + Math.random() * 1.6; s.timer = s.grazeT + 0.3; }
        else if (r < 0.55) { s.state = 'turn'; s.targetYaw = s.yaw + (Math.random() - 0.5) * 3.6; s.timer = 3; }
        else { s.state = 'turn'; s.targetYaw = Math.random() * Math.PI * 2; s.timer = 3; s.next = 'walk'; }
        if (Math.random() < 0.18) this.audio && this.audio.bleat(s.e.x, s.e.y + 1, s.e.z);
      }
    } else if (s.state === 'turn') {
      let diff = ((s.targetYaw - s.yaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      const step = 3.2 * dt;
      if (Math.abs(diff) <= step || s.timer <= 0) {
        s.yaw = s.targetYaw; s.state = s.next === 'walk' || Math.random() < 0.55 ? 'walk' : 'idle';
        s.next = null; s.timer = s.state === 'walk' ? 2 + Math.random() * 4.5 : 1 + Math.random() * 2.5;
      } else s.yaw += Math.sign(diff) * step;
    } else if (s.state === 'walk') {
      if (s.timer <= 0) { s.state = 'idle'; s.timer = 1.2 + Math.random() * 3.5; }
    }
  }
}
