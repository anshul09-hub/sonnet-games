// GPU point-sprite particles: textured block crumbs (opaque) and soft fire/smoke/dust (blended).
import * as THREE from 'three';
import { U } from './shaders.js';

const VS = `
attribute vec4 aP0;   // x: tile (>=0) | -1 flat | -2 soft, y,z: sub-uv, w: size (world units)
attribute vec4 aC;    // rgb + alpha
uniform float uScale;
varying vec4 vC; varying vec3 vP; varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aP0.w * uScale / max(0.1, -mv.z), 1.0, 220.0);
  vC = aC; vP = aP0.xyz; vDist = length(mv.xyz);
}`;
const FS = `
uniform sampler2D uAtlas; uniform vec3 uSkyLight; uniform vec3 uCave; uniform vec3 uFogColor; uniform float uFogNear; uniform float uFogFar;
varying vec4 vC; varying vec3 vP; varying float vDist;
void main(){
  vec4 col;
  if (vP.x >= 0.0) {
    float tile = vP.x; vec2 t = vec2(mod(tile, 16.0), floor(tile / 16.0));
    vec2 uv = (t + vec2(vP.y, vP.z) + gl_PointCoord * 0.25) / 16.0;
    vec4 tx = texture2D(uAtlas, uv);
    if (tx.a < 0.5) discard;
    col = vec4(tx.rgb * (uCave + uSkyLight * 0.95) * 0.9, 1.0);
  } else if (vP.x > -1.5) {
    col = vC;
  } else {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    col = vec4(vC.rgb, vC.a * smoothstep(1.0, 0.25, d));
  }
  float f = smoothstep(uFogNear, uFogFar, vDist);
  col.rgb = mix(col.rgb, uFogColor, f);
  gl_FragColor = col;
  #include <colorspace_fragment>
}`;

export class Particles {
  constructor(scene, world, cap, soft) {
    this.world = world; this.cap = cap; this.n = 0; this.soft = soft;
    this.pos = new Float32Array(cap * 3); this.p0 = new Float32Array(cap * 4); this.col = new Float32Array(cap * 4);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap);
    this.grav = new Float32Array(cap); this.drag = new Float32Array(cap); this.grow = new Float32Array(cap); this.size0 = new Float32Array(cap);
    this.fade = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3); this.aP0 = new THREE.BufferAttribute(this.p0, 4); this.aC = new THREE.BufferAttribute(this.col, 4);
    for (const a of [this.aPos, this.aP0, this.aC]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos); g.setAttribute('aP0', this.aP0); g.setAttribute('aC', this.aC);
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { ...U, uScale: { value: 600 } }, vertexShader: VS, fragmentShader: FS,
      transparent: soft, depthWrite: !soft,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = soft ? 5 : 0;
    scene.add(this.points);
  }
  setScale(viewportHeightPx, fovRad) { this.mat.uniforms.uScale.value = viewportHeightPx / (2 * Math.tan(fovRad / 2)); }

  add(x, y, z, vx, vy, vz, life, size, tile, sx, sy, r, g, b, a, grav, drag, grow) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.grow[i] = grow || 0;
    this.p0[i * 4] = tile; this.p0[i * 4 + 1] = sx; this.p0[i * 4 + 2] = sy; this.p0[i * 4 + 3] = size;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = a;
    this.grav[i] = grav; this.drag[i] = drag; this.fade[i] = a;
  }

  // crumbs of a broken block
  blockBits(x, y, z, tile, n = 14, power = 1, cx, cy, cz) {
    for (let i = 0; i < n; i++) {
      const px = x + Math.random(), py = y + Math.random(), pz = z + Math.random();
      let vx = (Math.random() - 0.5) * 3.2 * power, vy = Math.random() * 3.4 * power + 1, vz = (Math.random() - 0.5) * 3.2 * power;
      if (cx !== undefined) { vx += (px - cx) * 2; vz += (pz - cz) * 2; }
      this.add(px, py, pz, vx, vy, vz, 0.7 + Math.random() * 0.7, 0.1 + Math.random() * 0.07, tile, (Math.random() * 4 | 0) / 4, (Math.random() * 4 | 0) / 4, 1, 1, 1, 1, 22, 0.5, 0);
    }
  }
  burst(x, y, z, n, o) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, r = Math.sqrt(1 - u * u), s = (o.speed || 4) * (0.3 + Math.random() * 0.8);
      const c = o.colors[(Math.random() * o.colors.length) | 0];
      this.add(x + (Math.random() - 0.5) * (o.spread || 0), y + (Math.random() - 0.5) * (o.spread || 0), z + (Math.random() - 0.5) * (o.spread || 0),
        Math.cos(a) * r * s, u * s * (o.up || 1) + (o.lift || 0), Math.sin(a) * r * s,
        (o.life || 1) * (0.6 + Math.random() * 0.7), (o.size || 1) * (0.6 + Math.random() * 0.7), -2, 0, 0, c[0], c[1], c[2], o.alpha || 0.8, o.grav || 0, o.drag || 1.5, o.grow || 0);
    }
  }

  update(dt) {
    const w = this.world;
    for (let i = 0; i < this.n; i++) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        const l = --this.n;
        if (i !== l) {
          for (let k = 0; k < 3; k++) { this.pos[i * 3 + k] = this.pos[l * 3 + k]; this.vel[i * 3 + k] = this.vel[l * 3 + k]; }
          for (let k = 0; k < 4; k++) { this.p0[i * 4 + k] = this.p0[l * 4 + k]; this.col[i * 4 + k] = this.col[l * 4 + k]; }
          this.life[i] = this.life[l]; this.max[i] = this.max[l]; this.grav[i] = this.grav[l]; this.drag[i] = this.drag[l];
          this.grow[i] = this.grow[l]; this.size0[i] = this.size0[l]; this.fade[i] = this.fade[l];
        }
        i--; continue;
      }
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (this.soft ? d : 1) - this.grav[i] * dt;
      let nx = this.pos[i * 3] + this.vel[i * 3] * dt, ny = this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt, nz = this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt;
      if (!this.soft && w.solidAt(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        if (!w.solidAt(Math.floor(nx), Math.floor(this.pos[i * 3 + 1]), Math.floor(nz))) { this.vel[i * 3 + 1] *= -0.35; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; ny = this.pos[i * 3 + 1]; }
        else { this.vel[i * 3] *= -0.3; this.vel[i * 3 + 2] *= -0.3; nx = this.pos[i * 3]; nz = this.pos[i * 3 + 2]; }
      }
      this.pos[i * 3] = nx; this.pos[i * 3 + 1] = ny; this.pos[i * 3 + 2] = nz;
      const k = this.life[i] / this.max[i];
      this.p0[i * 4 + 3] = this.size0[i] * (1 + this.grow[i] * (1 - k));
      if (this.soft) this.col[i * 4 + 3] = this.fade[i] * Math.min(1, k * 2.2);
    }
    this.points.geometry.setDrawRange(0, this.n);
    this.points.visible = this.n > 0;
    if (this.n > 0) this.aPos.needsUpdate = this.aP0.needsUpdate = this.aC.needsUpdate = true;
  }
}
