// Particles (instanced billboards + code-made sprite atlas), camera rig with trauma shake, screen overlay FX.
import * as THREE from 'three';
import { clamp, damp, rnd, TAU } from './util.js';

// ---------------------------------------------------------------- sprite atlas (drawn with canvas 2D)
export const SPRITE = { SOFT: 0, DISC: 1, STAR: 2, PETAL: 3, SQUARE: 4, HEART: 5, NOTE: 6, RING: 7, SMOKE: 8, LEAF: 9, FLAKE: 10, DIAMOND: 11, ZERO: 12, ONE: 13, BOLT: 14, STREAK: 15 };

let _atlas = null;
export function spriteAtlas() {
  if (_atlas) return _atlas;
  const N = 4, S = 64, c = document.createElement('canvas');
  c.width = c.height = N * S;
  const g = c.getContext('2d');
  const cell = (i, draw) => { g.save(); g.translate((i % N) * S + S / 2, Math.floor(i / N) * S + S / 2); draw(); g.restore(); };
  const white = 'rgba(255,255,255,1)';
  cell(0, () => { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, white); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-32, -32, 64, 64); });
  cell(1, () => { g.fillStyle = white; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill(); });
  cell(2, () => { g.fillStyle = white; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? 6 : 30; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); const gr = g.createRadialGradient(0, 0, 0, 0, 0, 14); gr.addColorStop(0, white); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-16, -16, 32, 32); });
  cell(3, () => { g.fillStyle = white; g.beginPath(); g.moveTo(0, -26); g.bezierCurveTo(22, -20, 24, 10, 0, 26); g.bezierCurveTo(-24, 10, -22, -20, 0, -26); g.fill(); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -20); g.lineTo(0, 22); g.stroke(); });
  cell(4, () => { g.fillStyle = white; g.fillRect(-24, -24, 48, 48); });
  cell(5, () => { g.fillStyle = white; g.beginPath(); g.moveTo(0, 24); g.bezierCurveTo(-40, -4, -18, -32, 0, -12); g.bezierCurveTo(18, -32, 40, -4, 0, 24); g.fill(); });
  cell(6, () => { g.fillStyle = white; g.beginPath(); g.ellipse(-8, 16, 11, 8, -0.4, 0, TAU); g.fill(); g.fillRect(1, -26, 5, 42); g.beginPath(); g.moveTo(6, -26); g.quadraticCurveTo(24, -20, 22, -2); g.lineTo(18, -4); g.quadraticCurveTo(18, -14, 6, -16); g.fill(); });
  cell(7, () => { g.strokeStyle = white; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.stroke(); });
  cell(8, () => { for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU, r = 10 + (i % 3) * 3; const x = Math.cos(a) * r, y = Math.sin(a) * r; const gr = g.createRadialGradient(x, y, 0, x, y, 16); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - 16, y - 16, 32, 32); } });
  cell(9, () => { g.fillStyle = white; g.beginPath(); g.moveTo(0, -28); g.bezierCurveTo(26, -10, 22, 18, 0, 28); g.bezierCurveTo(-22, 18, -26, -10, 0, -28); g.fill(); g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -22); g.lineTo(0, 30); g.stroke(); });
  cell(10, () => { g.strokeStyle = white; g.lineWidth = 5; g.lineCap = 'round'; for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI; g.beginPath(); g.moveTo(Math.cos(a) * 26, Math.sin(a) * 26); g.lineTo(-Math.cos(a) * 26, -Math.sin(a) * 26); g.stroke(); } });
  cell(11, () => { g.fillStyle = white; g.beginPath(); g.moveTo(0, -28); g.lineTo(20, 0); g.lineTo(0, 28); g.lineTo(-20, 0); g.closePath(); g.fill(); });
  cell(12, () => { g.fillStyle = white; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('0', 0, 3); });
  cell(13, () => { g.fillStyle = white; g.font = 'bold 54px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('1', 0, 3); });
  cell(14, () => { g.fillStyle = white; g.beginPath(); g.moveTo(6, -30); g.lineTo(-14, 4); g.lineTo(-2, 4); g.lineTo(-8, 30); g.lineTo(16, -8); g.lineTo(3, -8); g.closePath(); g.fill(); });
  cell(15, () => { const gr = g.createLinearGradient(-30, 0, 30, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, white); gr.addColorStop(1, white); g.fillStyle = gr; g.fillRect(-30, -4, 60, 8); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  _atlas = tex;
  return tex;
}

// ---------------------------------------------------------------- particle layers
const VERT = /* glsl */`
attribute vec3 iPos; attribute float iSize; attribute float iRot; attribute vec4 iColor; attribute float iFrame;
varying vec4 vColor; varying vec2 vUv;
void main(){
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  float c = cos(iRot), s = sin(iRot);
  mv.xy += vec2(position.x*c - position.y*s, position.x*s + position.y*c) * iSize;
  gl_Position = projectionMatrix * mv;
  vec2 cell = vec2(mod(iFrame, 4.0), floor(iFrame / 4.0));
  vUv = vec2((cell.x + uv.x) / 4.0, 1.0 - (cell.y + 1.0 - uv.y) / 4.0);
  vColor = iColor;
}`;
const FRAG = /* glsl */`
uniform sampler2D uMap; varying vec4 vColor; varying vec2 vUv;
void main(){
  vec4 t = texture2D(uMap, vUv);
  gl_FragColor = vec4(vColor.rgb * t.rgb, vColor.a * t.a);
  if (gl_FragColor.a < 0.01) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Layer {
  constructor(scene, max, additive) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    const q = new THREE.PlaneGeometry(1, 1);
    g.index = q.index; g.setAttribute('position', q.attributes.position); g.setAttribute('uv', q.attributes.uv);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aRot = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aFrame = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iSize', this.aSize); g.setAttribute('iRot', this.aRot); g.setAttribute('iColor', this.aCol); g.setAttribute('iFrame', this.aFrame);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: spriteAtlas() } }, vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 20 : 15;
    scene.add(this.mesh);
    // simulation state (struct of arrays)
    this.p = new Float32Array(max * 3); this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 4); this.c1 = new Float32Array(max * 4);
    this.g = new Float32Array(max); this.drag = new Float32Array(max); this.spin = new Float32Array(max); this.rot = new Float32Array(max);
    this.frame = new Float32Array(max); this.floor = new Float32Array(max);
    this.wind = new Float32Array(max);
  }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

const _c = new THREE.Color(), _c1 = new THREE.Color();
const vx = (v, i, d = 0) => (v == null ? d : Array.isArray(v) ? v[i] : v.isVector3 ? (i === 0 ? v.x : i === 1 ? v.y : v.z) : v);

export class Particles {
  /** @param engine used for quality caps */
  constructor(scene, engine, opts = {}) {
    this.scene = scene; this.engine = engine;
    const cap = engine ? engine.cfg.maxParticles : 3000;
    this.normal = new Layer(scene, Math.floor(cap * 0.6), false);
    this.add = new Layer(scene, Math.floor(cap * 0.4), true);
    this.wind = opts.wind || [0, 0, 0];
    this.time = 0;
  }
  get density() { return this.engine ? this.engine.cfg.detail : 1; }

  /**
   * Emit particles. Options:
   * p: position, spread: positional jitter, v: base velocity, vr: velocity randomness (number or [x,y,z]),
   * life/lifeVar, size/size1, color/color1, alpha/alpha1, g gravity (negative falls), drag, spin, frame,
   * add: additive blending, n: count, floor: y level where particles die/bounce, essential: ignore density
   */
  emit(o) {
    const layer = o.add ? this.add : this.normal;
    let n = o.n || 1;
    if (!o.essential) n = Math.max(1, Math.round(n * this.density));
    const spread = o.spread || 0, vr = o.vr == null ? 0 : o.vr;
    _c.set(o.color ?? 0xffffff); _c1.set(o.color1 ?? o.color ?? 0xffffff);
    for (let k = 0; k < n; k++) {
      if (layer.n >= layer.max) return;
      const i = layer.n++;
      const sx = vx(spread, 0), sy = vx(spread, 1), sz = vx(spread, 2);
      layer.p[i * 3] = vx(o.p, 0) + (Math.random() * 2 - 1) * sx;
      layer.p[i * 3 + 1] = vx(o.p, 1) + (Math.random() * 2 - 1) * sy;
      layer.p[i * 3 + 2] = vx(o.p, 2) + (Math.random() * 2 - 1) * sz;
      const rx = vx(vr, 0), ry = vx(vr, 1), rz = vx(vr, 2);
      layer.v[i * 3] = vx(o.v, 0) + (Math.random() * 2 - 1) * rx;
      layer.v[i * 3 + 1] = vx(o.v, 1) + (Math.random() * 2 - 1) * ry;
      layer.v[i * 3 + 2] = vx(o.v, 2) + (Math.random() * 2 - 1) * rz;
      const life = (o.life ?? 1) + (Math.random() * 2 - 1) * (o.lifeVar ?? 0);
      layer.life[i] = layer.maxLife[i] = Math.max(0.05, life);
      const sz0 = (o.size ?? 0.2) * (1 + (Math.random() * 2 - 1) * (o.sizeVar ?? 0.2));
      layer.s0[i] = sz0; layer.s1[i] = (o.size1 ?? o.size ?? 0.2) * sz0 / (o.size ?? 0.2);
      layer.c0[i * 4] = _c.r; layer.c0[i * 4 + 1] = _c.g; layer.c0[i * 4 + 2] = _c.b; layer.c0[i * 4 + 3] = o.alpha ?? 1;
      layer.c1[i * 4] = _c1.r; layer.c1[i * 4 + 1] = _c1.g; layer.c1[i * 4 + 2] = _c1.b; layer.c1[i * 4 + 3] = o.alpha1 ?? 0;
      layer.g[i] = o.g ?? 0; layer.drag[i] = o.drag ?? 0;
      layer.spin[i] = (o.spin ?? 0) * (Math.random() * 2 - 1); layer.rot[i] = o.rot ?? Math.random() * TAU;
      layer.frame[i] = Array.isArray(o.frame) ? o.frame[Math.floor(Math.random() * o.frame.length)] : (o.frame ?? SPRITE.SOFT);
      layer.floor[i] = o.floor ?? -1e9;
      layer.wind[i] = o.wind ?? 0;
    }
  }

  update(dt) {
    this.time += dt;
    for (const L of [this.normal, this.add]) {
      const { p, v, life, maxLife } = L;
      for (let i = 0; i < L.n;) {
        life[i] -= dt;
        if (life[i] <= 0) { this._swap(L, i, --L.n); continue; }
        const d = Math.exp(-L.drag[i] * dt);
        v[i * 3] = v[i * 3] * d + this.wind[0] * L.wind[i] * dt; v[i * 3 + 1] = v[i * 3 + 1] * d + L.g[i] * dt + this.wind[1] * L.wind[i] * dt; v[i * 3 + 2] = v[i * 3 + 2] * d + this.wind[2] * L.wind[i] * dt;
        p[i * 3] += v[i * 3] * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += v[i * 3 + 2] * dt;
        if (p[i * 3 + 1] < L.floor[i]) { p[i * 3 + 1] = L.floor[i]; v[i * 3 + 1] *= -0.35; v[i * 3] *= 0.7; v[i * 3 + 2] *= 0.7; L.spin[i] *= 0.5; }
        L.rot[i] += L.spin[i] * dt;
        const t = 1 - life[i] / maxLife[i];
        L.aPos.array[i * 3] = p[i * 3]; L.aPos.array[i * 3 + 1] = p[i * 3 + 1]; L.aPos.array[i * 3 + 2] = p[i * 3 + 2];
        L.aSize.array[i] = L.s0[i] + (L.s1[i] - L.s0[i]) * t;
        L.aRot.array[i] = L.rot[i];
        L.aFrame.array[i] = L.frame[i];
        const o = i * 4;
        L.aCol.array[o] = L.c0[o] + (L.c1[o] - L.c0[o]) * t; L.aCol.array[o + 1] = L.c0[o + 1] + (L.c1[o + 1] - L.c0[o + 1]) * t;
        L.aCol.array[o + 2] = L.c0[o + 2] + (L.c1[o + 2] - L.c0[o + 2]) * t; L.aCol.array[o + 3] = L.c0[o + 3] + (L.c1[o + 3] - L.c0[o + 3]) * t;
        i++;
      }
      const g = L.mesh.geometry; g.instanceCount = L.n;
      for (const a of [L.aPos, L.aSize, L.aRot, L.aCol, L.aFrame]) a.needsUpdate = true;
    }
  }
  _swap(L, a, b) {
    if (a === b) return;
    const cp = (arr, s) => { for (let k = 0; k < s; k++) arr[a * s + k] = arr[b * s + k]; };
    cp(L.p, 3); cp(L.v, 3); cp(L.c0, 4); cp(L.c1, 4);
    for (const k of ['life', 'maxLife', 's0', 's1', 'g', 'drag', 'spin', 'rot', 'frame', 'floor', 'wind']) L[k][a] = L[k][b];
  }
  clear() { this.normal.n = 0; this.add.n = 0; }
  dispose() { this.normal.dispose(this.scene); this.add.dispose(this.scene); }

  // ------- presets -------
  dust(p, n = 6, color = 0xd8cdb4) { this.emit({ p, n, spread: 0.12, v: [0, 0.25, 0], vr: [0.9, 0.25, 0.9], life: 0.5, lifeVar: 0.15, size: 0.16, size1: 0.42, color, alpha: 0.55, alpha1: 0, drag: 2.5, frame: SPRITE.SMOKE }); }
  sparks(p, n = 14, color = 0xffd27a, speed = 4) { this.emit({ p, n, v: [0, speed * 0.4, 0], vr: [speed, speed * 0.6, speed], life: 0.5, lifeVar: 0.25, size: 0.13, size1: 0.02, color, color1: 0xff5a1f, alpha: 1, alpha1: 0, g: -9, drag: 1.2, frame: SPRITE.STAR, add: true, spin: 6 }); }
  flash(p, size = 2.5, color = 0xffffff) { this.emit({ p, n: 1, life: 0.22, size, size1: size * 1.6, color, alpha: 1, alpha1: 0, frame: SPRITE.SOFT, add: true, essential: true }); }
  ring(p, size = 3, color = 0xffffff, life = 0.45) { this.emit({ p, n: 1, life, size: 0.2, size1: size, color, alpha: 0.9, alpha1: 0, frame: SPRITE.RING, add: true, essential: true }); }
  smoke(p, n = 8, color = 0x777777, size = 0.5) { this.emit({ p, n, spread: 0.2, v: [0, 1.1, 0], vr: [0.6, 0.4, 0.6], life: 1.1, lifeVar: 0.3, size, size1: size * 3, color, alpha: 0.5, alpha1: 0, drag: 1, frame: SPRITE.SMOKE }); }
  confetti(p, n = 60, colors = [0xff4d6d, 0xffd23f, 0x4dd6ff, 0x7dff6b, 0xc77dff]) {
    for (let i = 0; i < n; i++) this.emit({ p, n: 1, spread: 0.3, v: [0, 6, 0], vr: [4.5, 3, 4.5], life: 2.6, lifeVar: 0.6, size: 0.16, size1: 0.14, color: colors[i % colors.length], alpha: 1, alpha1: 1, g: -7, drag: 1.4, spin: 9, frame: [SPRITE.SQUARE, SPRITE.STAR, SPRITE.PETAL], essential: true, floor: (p.y ?? 0) - 0.01 });
  }
}

// ---------------------------------------------------------------- camera rig with trauma shake
export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.pos = camera.position.clone(); this.look = new THREE.Vector3();
    this.tPos = this.pos.clone(); this.tLook = this.look.clone();
    this.fov = camera.fov || 45; this.tFov = this.fov;
    this.stiff = 5; this.direct = false; this.trauma = 0; this.roll = 0; this.tRoll = 0;
    this.time = 0;
    this._shake = new THREE.Vector3();
  }
  set(pos, look, fov) { this.pos.copy(pos); this.tPos.copy(pos); this.look.copy(look); this.tLook.copy(look); if (fov) { this.fov = this.tFov = fov; } this.apply(0); }
  goTo(pos, look, fov, stiff) { this.tPos.copy(pos); this.tLook.copy(look); if (fov) this.tFov = fov; if (stiff) this.stiff = stiff; this.direct = false; }
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  update(dt) {
    this.time += dt;
    if (this.direct) { this.pos.copy(this.tPos); this.look.copy(this.tLook); this.fov = this.tFov; }
    else {
      const k = 1 - Math.exp(-this.stiff * dt);
      this.pos.lerp(this.tPos, k); this.look.lerp(this.tLook, k); this.fov += (this.tFov - this.fov) * k;
    }
    this.roll += (this.tRoll - this.roll) * (1 - Math.exp(-4 * dt));
    this.apply(dt);
  }
  apply(dt) {
    const cam = this.cam;
    const tr = this.trauma * this.trauma;
    const t = this.time * 42;
    this._shake.set(Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5, Math.sin(t * 1.9 + 1) + Math.sin(t * 3.1) * 0.5, Math.sin(t * 1.1 + 2)).multiplyScalar(tr * 0.35);
    cam.position.copy(this.pos).add(this._shake);
    cam.lookAt(this.look);
    cam.rotation.z += this.roll + Math.sin(t * 1.7) * tr * 0.05;
    if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
  }
}

// ---------------------------------------------------------------- screen overlay effects
export class ScreenFX {
  constructor(root) {
    this.root = root;
    this.flashEl = el('div', 'fx-flash');
    this.linesEl = el('canvas', 'fx-lines');
    this.barsEl = el('div', 'fx-bars'); this.barsEl.innerHTML = '<i></i><i></i>';
    this.vig = el('div', 'fx-vignette');
    this.bannerEl = el('div', 'fx-banner');
    root.append(this.vig, this.linesEl, this.flashEl, this.barsEl, this.bannerEl);
    this.ctx = this.linesEl.getContext('2d');
    this.lines = 0; this.linesDur = 0; this.linesColor = '#fff'; this.t = 0;
  }
  flash(color = '#fff', dur = 0.3, alpha = 0.95) {
    const f = this.flashEl; f.style.background = color;
    f.animate([{ opacity: alpha }, { opacity: 0 }], { duration: dur * 1000, easing: 'ease-out' });
  }
  speedLines(dur = 1, color = '#fff') { this.lines = dur; this.linesDur = dur; this.linesColor = color; }
  letterbox(on) { this.barsEl.classList.toggle('on', !!on); }
  vignette(on, color = '#000') { this.vig.style.setProperty('--vig', color); this.vig.classList.toggle('on', !!on); }
  banner(text, sub = '', color = '#ffd23f', ms = 1400) {
    const b = this.bannerEl;
    b.innerHTML = `<b style="--c:${color}">${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
    b.getAnimations().forEach((a) => a.cancel());
    b.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(2.2) rotate(-6deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(-3deg)', offset: 0.12 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.06) rotate(-3deg)', offset: 0.8 }, { opacity: 0, transform: 'translate(-50%,-56%) scale(1.12) rotate(-3deg)' }], { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
  }
  update(dt) {
    const c = this.linesEl;
    if (this.lines > 0) {
      this.lines -= dt;
      const w = (c.width = innerWidth), h = (c.height = innerHeight), g = this.ctx;
      const a = clamp(this.lines / this.linesDur * 2, 0, 1);
      g.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, R = Math.hypot(w, h) / 2;
      g.strokeStyle = this.linesColor; g.globalAlpha = a * 0.85;
      const n = 70;
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * TAU + Math.random() * 0.09;
        const r0 = R * (0.28 + Math.random() * 0.35), r1 = R * (0.75 + Math.random() * 0.4);
        g.lineWidth = 1 + Math.random() * 3.5;
        g.beginPath(); g.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); g.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); g.stroke();
      }
      if (this.lines <= 0) g.clearRect(0, 0, w, h);
    }
  }
  clear() { this.lines = 0; this.ctx.clearRect(0, 0, this.linesEl.width, this.linesEl.height); this.letterbox(false); this.vignette(false); }
}
function el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
