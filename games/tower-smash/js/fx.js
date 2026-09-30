// Particles: dust/smoke (alpha), fire/sparks (additive), debris chips, rings, light flash.
import * as THREE from 'three';
import { groundY } from './terrain.js';

const TONE = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

// A pool of camera-facing soft quads drawn as one instanced mesh.
class Sprites {
  constructor(max, additive) {
    this.max = max;
    this.next = 0;
    const g = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.aAlpha = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha, this.aRot]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iCol', this.aCol);
    g.setAttribute('iSize', this.aSize); g.setAttribute('iAlpha', this.aAlpha); g.setAttribute('iRot', this.aRot);
    g.instanceCount = max;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: `attribute vec3 iPos; attribute vec3 iCol; attribute float iSize; attribute float iAlpha; attribute float iRot;
        varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){
          vUv = uv; vCol = iCol; vA = iAlpha;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          float c = cos(iRot), s = sin(iRot);
          vec2 p = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * iSize;
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){
          vec2 q = vUv - 0.5;
          float d = length(q) * 2.0;
          float a = smoothstep(1.0, 0.15, d) * vA;
          ${additive ? '' : 'float sh = 0.82 + 0.3 * (0.5 - q.y) + 0.1 * q.x; '}
          if (a < 0.004) discard;
          gl_FragColor = vec4(vCol ${additive ? '' : '* sh'}, a);
          ${TONE}
        }`,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
    // simulation state
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.grow = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3);
    this.a0 = new Float32Array(max); this.drag = new Float32Array(max);
    this.grav = new Float32Array(max); this.rv = new Float32Array(max);
    this.rot = new Float32Array(max);
    this.fadeIn = new Float32Array(max);
    for (let i = 0; i < max; i++) this.aSize.array[i] = 0;
  }

  spawn(o) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    const j = i * 3;
    this.p[j] = o.x; this.p[j + 1] = o.y; this.p[j + 2] = o.z;
    this.v[j] = o.vx || 0; this.v[j + 1] = o.vy || 0; this.v[j + 2] = o.vz || 0;
    this.life[i] = this.maxLife[i] = o.life;
    this.s0[i] = o.size; this.grow[i] = o.grow || 0;
    const c0 = o.c0, c1 = o.c1 || o.c0;
    this.c0[j] = c0.r; this.c0[j + 1] = c0.g; this.c0[j + 2] = c0.b;
    this.c1[j] = c1.r; this.c1[j + 1] = c1.g; this.c1[j + 2] = c1.b;
    this.a0[i] = o.alpha ?? 1; this.drag[i] = o.drag ?? 1.5; this.grav[i] = o.grav ?? 0;
    this.rot[i] = o.rot ?? Math.random() * 6.28; this.rv[i] = o.rv ?? (Math.random() - 0.5) * 1.5;
    this.fadeIn[i] = o.fadeIn ?? 0.12;
  }

  update(dt) {
    const N = this.max;
    for (let i = 0; i < N; i++) {
      const l = this.life[i];
      if (l <= 0) { if (this.aAlpha.array[i] !== 0) { this.aAlpha.array[i] = 0; this.aSize.array[i] = 0; } continue; }
      const nl = l - dt; this.life[i] = nl;
      const j = i * 3, t = 1 - nl / this.maxLife[i];
      const k = Math.exp(-this.drag[i] * dt);
      this.v[j] *= k; this.v[j + 1] = this.v[j + 1] * k + this.grav[i] * dt; this.v[j + 2] *= k;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      this.rot[i] += this.rv[i] * dt;
      this.aPos.array[j] = this.p[j]; this.aPos.array[j + 1] = this.p[j + 1]; this.aPos.array[j + 2] = this.p[j + 2];
      this.aCol.array[j] = this.c0[j] + (this.c1[j] - this.c0[j]) * t;
      this.aCol.array[j + 1] = this.c0[j + 1] + (this.c1[j + 1] - this.c0[j + 1]) * t;
      this.aCol.array[j + 2] = this.c0[j + 2] + (this.c1[j + 2] - this.c0[j + 2]) * t;
      this.aSize.array[i] = this.s0[i] + this.grow[i] * (1 - (1 - t) * (1 - t));
      const fi = Math.min(1, t / this.fadeIn[i]);
      this.aAlpha.array[i] = this.a0[i] * fi * (1 - t) * (1 - t * 0.3);
      this.aRot.array[i] = this.rot[i];
    }
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aSize.needsUpdate = this.aAlpha.needsUpdate = this.aRot.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

const C = (h) => new THREE.Color(h);

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.q = 1;
    this.smoke = new Sprites(1400, false);
    this.glow = new Sprites(900, true);
    scene.add(this.smoke.mesh, this.glow.mesh);

    // debris chips (ballistic cubes)
    const MAXC = 700;
    this.chipMax = MAXC;
    this.chipMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }), MAXC);
    this.chipMesh.frustumCulled = false;
    this.chipMesh.castShadow = false;
    this.chipMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAXC; i++) { this.chipMesh.setMatrixAt(i, z); this.chipMesh.setColorAt(i, C(0xffffff)); }
    scene.add(this.chipMesh);
    this.cp = new Float32Array(MAXC * 3); this.cv = new Float32Array(MAXC * 3);
    this.cr = new Float32Array(MAXC * 3); this.cw = new Float32Array(MAXC * 3);
    this.cs = new Float32Array(MAXC); this.cl = new Float32Array(MAXC); this.cm = new Float32Array(MAXC);
    this.cnext = 0;

    // shockwave rings
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 56),
        new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.renderOrder = 7;
      this.rings.push({ m, t: 1, dur: 0.6, r: 1 });
      scene.add(m);
    }
    this.ringNext = 0;

    // explosion light
    this.light = new THREE.PointLight(0xffa64d, 0, 60, 1.6);
    this.light.position.set(0, -50, 0);
    scene.add(this.light);
    this.lightT = 0; this.lightI = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3();
  }

  setQuality(q) { this.q = q.particles; }

  clear() {
    this.smoke.clear(); this.glow.clear(); this.cl.fill(0);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.chipMax; i++) this.chipMesh.setMatrixAt(i, z);
    this.chipMesh.instanceMatrix.needsUpdate = true;
    this.lightI = 0; this.light.intensity = 0;
  }

  // dust / smoke puff
  puff(p, o = {}) {
    const n = Math.max(1, Math.round((o.n ?? 5) * this.q));
    const col = C(o.color ?? 0xcfc6b5);
    const dark = col.clone().multiplyScalar(0.75);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (o.speed ?? 2.2) * (0.3 + Math.random());
      this.smoke.spawn({
        x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + Math.random() * 0.4, z: p.z + (Math.random() - 0.5) * 0.6,
        vx: Math.cos(a) * sp, vy: (o.up ?? 1.4) * (0.4 + Math.random()), vz: Math.sin(a) * sp,
        life: (o.life ?? 1.3) * (0.7 + Math.random() * 0.6), size: (o.size ?? 1.2) * (0.6 + Math.random() * 0.6),
        grow: (o.grow ?? 2.4) * (0.6 + Math.random() * 0.8), c0: col, c1: dark, alpha: o.alpha ?? 0.55, drag: 1.8, grav: 0.3,
      });
    }
  }

  // small ballistic pieces
  chips(p, color, n, speed = 5, vel = null, size = 0.16) {
    n = Math.max(1, Math.round(n * this.q));
    const col = C(color), tmp = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const i = this.cnext; this.cnext = (this.cnext + 1) % this.chipMax;
      const j = i * 3;
      this.cp[j] = p.x + (Math.random() - 0.5) * 0.5; this.cp[j + 1] = p.y + (Math.random() - 0.5) * 0.5; this.cp[j + 2] = p.z + (Math.random() - 0.5) * 0.5;
      const a = Math.random() * 6.28, e = Math.random() * 1.1, sp = speed * (0.3 + Math.random());
      this.cv[j] = Math.cos(a) * Math.cos(e) * sp + (vel ? vel.x * 0.5 : 0);
      this.cv[j + 1] = Math.sin(e) * sp + 1.5 + (vel ? vel.y * 0.3 : 0);
      this.cv[j + 2] = Math.sin(a) * Math.cos(e) * sp + (vel ? vel.z * 0.5 : 0);
      this.cr[j] = Math.random() * 6; this.cr[j + 1] = Math.random() * 6; this.cr[j + 2] = Math.random() * 6;
      this.cw[j] = (Math.random() - 0.5) * 14; this.cw[j + 1] = (Math.random() - 0.5) * 14; this.cw[j + 2] = (Math.random() - 0.5) * 14;
      this.cs[i] = size * (0.5 + Math.random() * 0.9);
      this.cl[i] = 1.6 + Math.random() * 1.6; this.cm[i] = this.cl[i];
      const v = 0.75 + Math.random() * 0.4;
      this.chipMesh.setColorAt(i, tmp.copy(col).multiplyScalar(v));
    }
    if (this.chipMesh.instanceColor) this.chipMesh.instanceColor.needsUpdate = true;
  }

  sparks(p, n = 14, speed = 8, color = 0xffc35a) {
    n = Math.max(1, Math.round(n * this.q));
    const c0 = C(color).multiplyScalar(2.2), c1 = C(0xff5a1a);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, e = (Math.random() - 0.2) * 1.4, sp = speed * (0.3 + Math.random());
      this.glow.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp + 2, vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.35 + Math.random() * 0.5, size: 0.16 + Math.random() * 0.14, grow: -0.1, c0, c1, alpha: 1, drag: 1.2, grav: -14, fadeIn: 0.02,
      });
    }
  }

  ring(p, radius = 8, dur = 0.55, color = 0xffe2a8) {
    const r = this.rings[this.ringNext]; this.ringNext = (this.ringNext + 1) % this.rings.length;
    r.m.position.set(p.x, p.y, p.z); r.t = 0; r.dur = dur; r.r = radius; r.m.visible = true;
    r.m.material.color.set(color);
  }

  explosion(p, scale = 1) {
    const s = scale, q = this.q;
    // fireball core
    const hot = C(0xfff0b0).multiplyScalar(3.2), mid = C(0xff7a1a).multiplyScalar(1.4), dark = C(0x5a2410);
    const nF = Math.max(4, Math.round(12 * q));
    for (let i = 0; i < nF; i++) {
      const a = Math.random() * 6.28, e = Math.random() * 3.14 - 1.0, sp = (2 + Math.random() * 7) * s;
      this.glow.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp * 0.9 + 1, vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.5 + Math.random() * 0.45, size: (1.4 + Math.random() * 1.2) * s, grow: (3.2 + Math.random() * 2) * s, c0: hot, c1: mid, alpha: 1, drag: 3.5, fadeIn: 0.04,
      });
    }
    // rolling smoke
    const nS = Math.max(6, Math.round(22 * q));
    for (let i = 0; i < nS; i++) {
      const a = Math.random() * 6.28, sp = (1 + Math.random() * 6) * s;
      this.smoke.spawn({
        x: p.x, y: p.y + Math.random(), z: p.z, vx: Math.cos(a) * sp, vy: (1.5 + Math.random() * 4.5) * s, vz: Math.sin(a) * sp,
        life: 1.8 + Math.random() * 1.6, size: (1.6 + Math.random() * 1.4) * s, grow: (4 + Math.random() * 3) * s,
        c0: C(0x4a4038), c1: C(0x8a8378), alpha: 0.75, drag: 1.6, grav: 0.6,
      });
    }
    this.sparks(p, 40, 16 * s);
    this.ring(p, 9 * s, 0.5);
    this.ring({ x: p.x, y: p.y + 0.2, z: p.z }, 5 * s, 0.35, 0xffb050);
    this.lightI = 900 * s; this.lightT = 0;
    this.light.position.set(p.x, p.y + 1.5, p.z + 3);
  }

  splash(p, scale = 1) {
    const n = Math.max(3, Math.round(10 * this.q));
    const w = C(0xeaffff);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, sp = (1 + Math.random() * 3) * scale;
      this.smoke.spawn({
        x: p.x, y: p.y, z: p.z, vx: Math.cos(a) * sp, vy: (5 + Math.random() * 5) * scale, vz: Math.sin(a) * sp,
        life: 0.9 + Math.random() * 0.5, size: 0.7 * scale, grow: 1.2, c0: w, c1: C(0x9fd8f0), alpha: 0.8, drag: 0.8, grav: -16,
      });
    }
    this.ring(p, 3.2 * scale, 0.7, 0xdff8ff);
  }

  trail(p, color = 0xffffff, size = 0.5) {
    this.smoke.spawn({
      x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.2) * 0.4, vz: (Math.random() - 0.5) * 0.4,
      life: 0.7, size, grow: 0.9, c0: C(color), c1: C(color), alpha: 0.5, drag: 2, fadeIn: 0.05,
    });
  }

  update(dt) {
    this.smoke.update(dt);
    this.glow.update(dt);
    // chips
    const m = this._m, q = this._q, e = this._e, v = this._v, s = this._s;
    for (let i = 0; i < this.chipMax; i++) {
      const l = this.cl[i];
      if (l <= 0) continue;
      const nl = l - dt; this.cl[i] = nl;
      const j = i * 3;
      this.cv[j + 1] -= 18 * dt;
      this.cp[j] += this.cv[j] * dt; this.cp[j + 1] += this.cv[j + 1] * dt; this.cp[j + 2] += this.cv[j + 2] * dt;
      const gy = groundY(this.cp[j]) + this.cs[i] * 0.5;
      if (this.cp[j + 1] < gy) {
        this.cp[j + 1] = gy;
        if (this.cv[j + 1] < 0) this.cv[j + 1] *= -0.32;
        this.cv[j] *= 0.7; this.cv[j + 2] *= 0.7;
        this.cw[j] *= 0.6; this.cw[j + 1] *= 0.6; this.cw[j + 2] *= 0.6;
      }
      this.cr[j] += this.cw[j] * dt; this.cr[j + 1] += this.cw[j + 1] * dt; this.cr[j + 2] += this.cw[j + 2] * dt;
      const sc = this.cs[i] * Math.min(1, nl / 0.5);
      e.set(this.cr[j], this.cr[j + 1], this.cr[j + 2]);
      q.setFromEuler(e);
      m.compose(v.set(this.cp[j], this.cp[j + 1], this.cp[j + 2]), q, s.set(sc, sc * 0.8, sc));
      this.chipMesh.setMatrixAt(i, m);
      if (nl <= 0) { m.makeScale(0, 0, 0); this.chipMesh.setMatrixAt(i, m); }
    }
    this.chipMesh.instanceMatrix.needsUpdate = true;
    // rings
    for (const r of this.rings) {
      if (r.t >= 1) { r.m.visible = false; continue; }
      r.t += dt / r.dur;
      const k = Math.min(1, r.t), e2 = 1 - (1 - k) * (1 - k);
      const sc = 0.5 + r.r * e2;
      r.m.scale.set(sc, sc, sc);
      r.m.material.opacity = (1 - k) * 0.8;
      r.m.quaternion.copy(this.camQuat || r.m.quaternion);
    }
    // light
    if (this.lightI > 0) {
      this.lightT += dt;
      this.light.intensity = this.lightI * Math.exp(-this.lightT * 7);
      if (this.lightT > 1) { this.lightI = 0; this.light.intensity = 0; }
    }
  }
}
