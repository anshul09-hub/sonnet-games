// Particle effects (smoke, sparks, dust) and skid marks.
import * as THREE from 'three';
import { makeSmokeTexture, makeSoftCircle } from './textures.js';
import { rng, clamp } from './util.js';

const vs = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute float aRot;
attribute vec3 aColor;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
uniform float uScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.1), 0.0, 400.0);
  vAlpha = aAlpha; vRot = aRot; vColor = aColor;
}`;
const fs = /* glsl */ `
uniform sampler2D uMap;
uniform float uFogDensity;
uniform vec3 uFogColor;
varying float vAlpha;
varying float vRot;
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), co = cos(vRot);
  vec2 uv = vec2(co * c.x - s * c.y, s * c.x + co * c.y) + 0.5;
  vec4 t = texture2D(uMap, uv);
  float a = t.a * vAlpha;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor * t.rgb, a);
}`;

class Pool {
  constructor(scene, { max, map, additive, depthWrite = false, order = 5 }) {
    this.max = max;
    this.n = 0;
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.age = new Float32Array(max); this.life = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max); this.rot0 = new Float32Array(max); this.rotV = new Float32Array(max);
    this.col = new Float32Array(max * 3);
    this.grav = new Float32Array(max); this.drag = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.aSize = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aAlpha = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aRot = new THREE.BufferAttribute(new Float32Array(max), 1);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    for (const a of [this.aPos, this.aSize, this.aAlpha, this.aRot, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('aSize', this.aSize); g.setAttribute('aAlpha', this.aAlpha);
    g.setAttribute('aRot', this.aRot); g.setAttribute('aColor', this.aCol);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uMap: { value: map }, uScale: { value: 500 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = order;
    scene.add(this.points);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a0, grav = 0, drag = 0, rotV = 0) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (this.cursor = ((this.cursor ?? -1) + 1) % this.max);
    const k = i * 3;
    this.p[k] = x; this.p[k + 1] = y; this.p[k + 2] = z;
    this.v[k] = vx; this.v[k + 1] = vy; this.v[k + 2] = vz;
    this.age[i] = 0; this.life[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.grav[i] = grav; this.drag[i] = drag;
    this.rot0[i] = Math.random() * 6.28; this.rotV[i] = rotV * (Math.random() - 0.5) * 2;
  }
  update(dt, uScale) {
    this.mat.uniforms.uScale.value = uScale;
    let i = 0;
    while (i < this.n) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap with last
        const l = --this.n;
        if (i !== l) {
          for (const arr of [this.age, this.life, this.s0, this.s1, this.a0, this.rot0, this.rotV, this.grav, this.drag]) arr[i] = arr[l];
          for (let c = 0; c < 3; c++) { this.p[i * 3 + c] = this.p[l * 3 + c]; this.v[i * 3 + c] = this.v[l * 3 + c]; this.col[i * 3 + c] = this.col[l * 3 + c]; }
        }
        continue;
      }
      const k = i * 3;
      const drag = Math.exp(-this.drag[i] * dt);
      this.v[k] *= drag; this.v[k + 1] = this.v[k + 1] * drag - this.grav[i] * dt; this.v[k + 2] *= drag;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = this.age[i] / this.life[i];
      this.aPos.array[k] = this.p[k]; this.aPos.array[k + 1] = this.p[k + 1]; this.aPos.array[k + 2] = this.p[k + 2];
      this.aSize.array[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      // quick fade in, slow fade out
      this.aAlpha.array[i] = this.a0[i] * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      this.aRot.array[i] = this.rot0[i] + this.rotV[i] * this.age[i];
      this.aCol.array[k] = this.col[k]; this.aCol.array[k + 1] = this.col[k + 1]; this.aCol.array[k + 2] = this.col[k + 2];
      i++;
    }
    this.geo.setDrawRange(0, this.n);
    this.aPos.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aRot.needsUpdate = this.aCol.needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

export class Effects {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality;
    const k = quality.particles;
    this.smoke = new Pool(scene, { max: Math.floor(700 * k), map: makeSmokeTexture(), additive: false, order: 6 });
    this.dust = new Pool(scene, { max: Math.floor(300 * k), map: makeSmokeTexture(), additive: false, order: 6 });
    this.sparks = new Pool(scene, { max: Math.floor(500 * k), map: makeSoftCircle(32), additive: true, order: 7 });
    this.debris = new Pool(scene, { max: Math.floor(160 * k), map: makeSoftCircle(32), additive: false, order: 6 });
    this.accum = new Map();
    this.skids = new Skids(scene, quality.skids);
  }
  setQuality(q) {
    this.q = q;
  }
  // Called each frame per car
  updateCar(car, dt, racerLateral, isPlayer) {
    const c = car;
    const rear = [2, 3];
    for (let i = 0; i < 4; i++) {
      const w = c.wheels[i];
      const key = c.name + i;
      const active = w.contact && w.skid > 0.25;
      if (active) {
        // smoke
        const rate = (i >= 2 ? 95 : 40) * w.skid * this.q.particles;
        let a = (this.accum.get(key) || 0) + rate * dt;
        while (a >= 1) {
          a -= 1;
          const sp = c.speedFlat;
          const j = () => (Math.random() - 0.5);
          this.smoke.emit(w.point.x + j() * 0.3, w.point.y + 0.15, w.point.z + j() * 0.3,
            c.vel.x * 0.25 + j() * 1.6, 0.7 + Math.random() * 1.2, c.vel.z * 0.25 + j() * 1.6,
            1.2 + Math.random() * 1.0, 1.1, 4.4 + Math.random() * 2.2, 0.94, 0.92, 0.9, 0.5 * Math.min(1, w.skid + 0.3), -0.25, 0.9, 1.3);
        }
        this.accum.set(key, a);
        this.skids.add(key, w.point, w.normal, c.right, w.skid, c.speedFlat);
      } else {
        this.skids.end(key);
        if (w.contact && racerLateral > 8.4 && c.speedFlat > 9 && Math.random() < dt * 30 * this.q.particles) {
          const sp = c.speedFlat;
          this.dust.emit(w.point.x, w.point.y + 0.1, w.point.z, c.vel.x * 0.15 + (Math.random() - 0.5), 0.8 + Math.random(), c.vel.z * 0.15 + (Math.random() - 0.5),
            0.9 + Math.random() * 0.7, 0.8, 3.2, 0.78, 0.66, 0.46, 0.35, -0.1, 1.2, 1);
        }
      }
    }
  }
  spark(x, y, z, nx, nz, speed, n = 1) {
    for (let i = 0; i < n * this.q.particles; i++) {
      const a = Math.random() * 6.28, s = 2 + Math.random() * 6;
      this.sparks.emit(x, y, z,
        nx * (2 + Math.random() * 3) + Math.cos(a) * s * 0.5 + (Math.random() - 0.5) * speed * 0.15,
        1.5 + Math.random() * 4, nz * (2 + Math.random() * 3) + Math.sin(a) * s * 0.5,
        0.25 + Math.random() * 0.45, 0.18, 0.06, 1.0, 0.62 + Math.random() * 0.25, 0.2, 1.0, 9, 0.4);
    }
  }
  chunk(x, y, z, vx, vy, vz, r, g, b) {
    this.debris.emit(x, y, z, vx, vy, vz, 0.6 + Math.random() * 0.6, 0.26, 0.2, r, g, b, 0.95, 12, 0.3);
  }
  update(dt, camera, viewportH) {
    const uScale = viewportH * 0.5 / Math.tan((camera.fov * Math.PI) / 360);
    this.smoke.update(dt, uScale); this.dust.update(dt, uScale); this.sparks.update(dt, uScale); this.debris.update(dt, uScale);
    this.skids.flush();
  }
  clear() { this.smoke.clear(); this.dust.clear(); this.sparks.clear(); this.debris.clear(); this.skids.clear(); }
}

// Skid marks: ring buffer of quads.
export class Skids {
  constructor(scene, maxQuads) {
    this.max = maxQuads;
    this.cursor = 0;
    this.pos = new Float32Array(maxQuads * 4 * 3);
    this.colr = new Float32Array(maxQuads * 4 * 4);
    const idx = new Uint32Array(maxQuads * 6);
    for (let i = 0; i < maxQuads; i++) {
      const v = i * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], i * 6);
    }
    for (let i = 0; i < maxQuads * 4; i++) this.pos[i * 3 + 1] = -1000;
    this.g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aCol = new THREE.BufferAttribute(this.colr, 4);
    this.aPos.setUsage(THREE.DynamicDrawUsage); this.aCol.setUsage(THREE.DynamicDrawUsage);
    this.g.setAttribute('position', this.aPos); this.g.setAttribute('color', this.aCol);
    this.g.setIndex(new THREE.BufferAttribute(idx, 1));
    this.g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 1e5);
    const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    this.mesh = new THREE.Mesh(this.g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    scene.add(this.mesh);
    this.last = new Map();
    this.dirty = false;
  }
  add(key, p, n, right, intensity, speed) {
    let l = this.last.get(key);
    if (!l) { l = { x: p.x, y: p.y, z: p.z, active: false, rx: right.x, rz: right.z, a: 0 }; this.last.set(key, l); }
    const w = 0.17;
    if (!l.active) { l.x = p.x; l.y = p.y; l.z = p.z; l.rx = right.x; l.rz = right.z; l.active = true; l.a = 0; return; }
    const dx = p.x - l.x, dy = p.y - l.y, dz = p.z - l.z;
    if (dx * dx + dy * dy + dz * dz < 0.16) return;
    if (dx * dx + dy * dy + dz * dz > 25) { l.active = false; return; }
    const a1 = clamp(0.25 + intensity * 0.5, 0, 0.7);
    const q = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const o = q * 12, oc = q * 16;
    const lift = 0.035;
    // left/right offsets use the car's right axis (kept flat)
    const rl = Math.hypot(right.x, right.z) || 1;
    const rx = right.x / rl * w, rz = right.z / rl * w;
    const lrx = l.rx * w, lrz = l.rz * w;
    const P = this.pos;
    P[o] = l.x - lrx; P[o + 1] = l.y + lift; P[o + 2] = l.z - lrz;
    P[o + 3] = l.x + lrx; P[o + 4] = l.y + lift; P[o + 5] = l.z + lrz;
    P[o + 6] = p.x - rx; P[o + 7] = p.y + lift + n.y * 0.0; P[o + 8] = p.z - rz;
    P[o + 9] = p.x + rx; P[o + 10] = p.y + lift; P[o + 11] = p.z + rz;
    const C = this.colr, a0 = l.a;
    const put = (k, a) => { C[oc + k * 4] = 0.03; C[oc + k * 4 + 1] = 0.03; C[oc + k * 4 + 2] = 0.035; C[oc + k * 4 + 3] = a; };
    put(0, a0); put(1, a0); put(2, a1); put(3, a1);
    l.x = p.x; l.y = p.y; l.z = p.z; l.rx = right.x / rl; l.rz = right.z / rl; l.a = a1;
    this.dirty = true;
  }
  end(key) { const l = this.last.get(key); if (l) l.active = false; }
  flush() { if (this.dirty) { this.aPos.needsUpdate = true; this.aCol.needsUpdate = true; this.dirty = false; } }
  clear() {
    for (let i = 0; i < this.max * 4; i++) { this.pos[i * 3 + 1] = -1000; }
    this.colr.fill(0);
    this.cursor = 0; this.last.clear(); this.dirty = true;
  }
}
