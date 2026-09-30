// Shared scenery toolkit for the arena games: sky dome with sun/stars, cloud seas, floating rocks, crystals, trees,
// energy barriers, animated shader strips. Everything is generated in code (no image or model files).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp, lerp } from './util.js';
import { pbr, fbm } from './proc.js';

const C = (v) => new THREE.Color(v);

// ------------------------------------------------------------------------------------------------ sky
export function skyDome(o = {}) {
  const u = {
    top: { value: C(o.top ?? 0x1a2a6c) }, mid: { value: C(o.mid ?? 0x6a8fd8) }, bot: { value: C(o.bottom ?? 0xdde9ff) },
    sunDir: { value: new THREE.Vector3(...(o.sunDir || [0.3, 0.4, -1])).normalize() }, sunCol: { value: C(o.sunColor ?? 0xfff2c0) },
    sunSize: { value: o.sunSize ?? 0.05 }, stripes: { value: o.stripes ? 1 : 0 }, stars: { value: o.stars ?? 0 }, time: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top, mid, bot, sunDir, sunCol; uniform float sunSize, stripes, stars, time;
      float h31(vec3 p){ p = fract(p * 0.3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      void main(){
        vec3 d = normalize(vP); float y = d.y;
        vec3 col = y > 0. ? mix(mid, top, pow(clamp(y, 0., 1.), 0.55)) : mix(mid, bot, pow(clamp(-y, 0., 1.), 0.45));
        float cs = clamp(dot(d, sunDir), -1., 1.), ang = acos(cs), s = max(cs, 0.);
        float disc = smoothstep(sunSize, sunSize * 0.93, ang);
        if (stripes > .5) { float k = (sunDir.y - d.y) / sunSize; if (k > 0.) disc *= step(k * 0.85, 0.5 + 0.5 * sin(k * 26.)); }
        col += sunCol * (pow(s, 90.) * 0.6 + pow(s, 7.) * 0.16);
        col = mix(col, sunCol * 1.8, disc);
        if (stars > 0.) { vec3 c = d * 150.; float r = h31(floor(c)); float tw = 0.65 + 0.35 * sin(time * 2.5 + r * 60.); float st = step(1. - stars, r) * smoothstep(.5, .0, length(fract(c) - .5)); col += vec3(.85, .92, 1.) * st * tw * 1.6; }
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(o.radius ?? 700, 40, 20), mat);
  mesh.renderOrder = -10; mesh.frustumCulled = false;
  return { mesh, u, update(t) { u.time.value = t; } };
}

// ------------------------------------------------------------------------------------------------ soft textures
let _cloudTex = null, _glowTex = null;
export function cloudTexture() {
  if (_cloudTex) return _cloudTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = new Rng(9);
  for (let i = 0; i < 26; i++) {
    const x = 60 + r.next() * 136, y = 100 + r.next() * 60 + (i < 8 ? 0 : -r.next() * 30), rad = 26 + r.next() * 34;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.55, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _cloudTex = t; return t;
}
export function glowTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; _glowTex = t; return t;
}

/** A sea of soft clouds as camera-facing sprites. */
export function cloudSea({ y = -16, count = 40, r0 = 40, r1 = 130, color = 0xffffff, opacity = 0.85, size = [26, 60], seed = 3, spread = 6 } = {}) {
  const grp = new THREE.Group(), rng = new Rng(seed), tex = cloudTexture(), items = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity: opacity * rng.range(0.6, 1), depthWrite: false, fog: false });
    const s = new THREE.Sprite(m), w = rng.range(size[0], size[1]);
    const a = rng.next() * TAU, r = rng.range(r0, r1);
    s.scale.set(w, w * 0.5, 1); s.position.set(Math.cos(a) * r, y + rng.range(-spread, spread), Math.sin(a) * r);
    s.userData = { a, r, sp: rng.range(0.004, 0.012) * (rng.chance(0.5) ? 1 : -1), y0: s.position.y };
    grp.add(s); items.push(s);
  }
  return { group: grp, update(t) { for (const s of items) { const d = s.userData; const a = d.a + t * d.sp; s.position.x = Math.cos(a) * d.r; s.position.z = Math.sin(a) * d.r; s.position.y = d.y0 + Math.sin(t * 0.1 + d.a * 3) * 0.6; } } };
}

// ------------------------------------------------------------------------------------------------ rocks & crystals
/** A floating island chunk: flat top, tapered underside, per-face colours (grassy top, rocky flanks). */
export function floatingRock(rng, r = 4, { top = 0x6fb35a, rock = 0x8a7f74, height = 1.0 } = {}) {
  const geo = new THREE.IcosahedronGeometry(1, 2), pos = geo.attributes.position, v = new THREE.Vector3(), seed = rng.int(1, 99);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.7 + 5, v.z * 1.7 + v.y * 1.4, 3, seed);
    v.multiplyScalar(0.78 + n * 0.55);
    if (v.y > 0.2) v.y = 0.2 + (v.y - 0.2) * 0.22;
    else { const t = clamp(-v.y / 1.1, 0, 1); v.x *= 1 - t * 0.72; v.z *= 1 - t * 0.72; v.y *= 1.55 * height; }
    pos.setXYZ(i, v.x * r, v.y * r, v.z * r);
  }
  geo.computeVertexNormals();
  const col = new Float32Array(pos.count * 3), a = C(top), b = C(rock), tmp = new THREE.Color(), nor = geo.attributes.normal;
  for (let i = 0; i < pos.count; i += 3) {
    const ny = (nor.getY(i) + nor.getY(i + 1) + nor.getY(i + 2)) / 3, k = 0.85 + rng.next() * 0.3;
    tmp.copy(ny > 0.55 ? a : b).multiplyScalar(k);
    for (let j = 0; j < 3; j++) { col[(i + j) * 3] = tmp.r; col[(i + j) * 3 + 1] = tmp.g; col[(i + j) * 3 + 2] = tmp.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, ROCK_MAT()); m.castShadow = true; m.receiveShadow = true;
  m.userData.topY = 0.2 * 0.22 * r + 0.2 * r * 0.8;
  return m;
}
let _rockMat = null;
const ROCK_MAT = () => (_rockMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02, flatShading: true }));

export function crystalCluster(rng, { n = 5, color = 0x66ddff, size = 1, intensity = 1.6 } = {}) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: color, emissiveIntensity: intensity, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.92 });
  for (let i = 0; i < n; i++) {
    const s = size * rng.range(0.5, 1.2), m = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), mat);
    m.scale.set(s * 0.7, s * rng.range(2, 3.4), s * 0.7);
    m.position.set(rng.range(-0.6, 0.6) * size, m.scale.y * 0.4, rng.range(-0.6, 0.6) * size);
    m.rotation.set(rng.range(-0.35, 0.35), rng.next() * TAU, rng.range(-0.35, 0.35));
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------ trees
let _barkMat = null;
const bark = () => (_barkMat ||= pbr('wood', { base: 0x5a3a2a, dark: 0x2a1a12, planks: 3, repeat: [1, 2], rough: 0.9 }));
const blobGeo = (rng, r, col) => {
  const g = new THREE.IcosahedronGeometry(r, 2), p = g.attributes.position, v = new THREE.Vector3(), seed = rng.int(1, 99);
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 0.82 + fbm(v.x * 2.2 + 3, v.z * 2.2 + v.y * 2, 3, seed) * 0.4; v.multiplyScalar(n); v.y *= 0.82; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  const cc = new Float32Array(p.count * 3), t = C(col);
  for (let i = 0; i < p.count; i++) { const k = 0.85 + (p.getY(i) / r) * 0.22 + rng.next() * 0.04; cc[i * 3] = t.r * k; cc[i * 3 + 1] = t.g * k; cc[i * 3 + 2] = t.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(cc, 3));
  return g;
};
let _leafMat = null;
const leaf = () => (_leafMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, emissive: 0x2a0a18, emissiveIntensity: 0.25 }));

/** Cherry-blossom tree: bent trunk, three branches, clumped blossom canopy. */
export function sakuraTree(rng, s = 1, cols = [0xffb7d5, 0xff9ec4, 0xffd6e6]) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 2.4, 8), bark()); trunk.position.y = 1.2; trunk.rotation.z = rng.range(-0.08, 0.08); trunk.castShadow = true; g.add(trunk);
  const geos = [];
  const n = 3 + rng.int(0, 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rng.range(-0.4, 0.4), len = rng.range(1.1, 1.7), br = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.16, len, 6), bark());
    br.position.set(Math.cos(a) * len * 0.34, 2.3 + len * 0.28, Math.sin(a) * len * 0.34); br.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); br.castShadow = true; g.add(br);
    const b = blobGeo(rng, rng.range(1.05, 1.5), cols[i % cols.length]); b.translate(Math.cos(a) * len * 0.75, 2.5 + len * 0.6 + rng.range(0, 0.4), Math.sin(a) * len * 0.75); geos.push(b);
  }
  const top = blobGeo(rng, 1.5, cols[0]); top.translate(0, 4.0, 0); geos.push(top);
  const canopy = new THREE.Mesh(mergeGeometries(geos), leaf()); canopy.castShadow = true; canopy.receiveShadow = true; g.add(canopy);
  g.scale.setScalar(s); g.userData.canopy = canopy;
  return g;
}

let _pineMat = null;
export function pineTree(rng, s = 1, col = 0x2f6b3f, snow = false) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.2, 7), bark()); trunk.position.y = 0.6; trunk.castShadow = true; g.add(trunk);
  const geos = [], c = C(col);
  for (let i = 0; i < 4; i++) {
    const r = 1.25 - i * 0.24, cone = new THREE.ConeGeometry(r, 1.3, 9, 1); cone.translate(0, 1.55 + i * 0.85, 0);
    const p = cone.attributes.position, cc = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) { const y = p.getY(k), sn = snow ? clamp((y - (1.55 + i * 0.85)) * 0.9 + 0.35, 0, 1) : 0; const b = 0.75 + rng.next() * 0.2; cc[k * 3] = lerp(c.r * b, 0.95, sn); cc[k * 3 + 1] = lerp(c.g * b, 0.97, sn); cc[k * 3 + 2] = lerp(c.b * b, 1, sn); }
    cone.setAttribute('color', new THREE.BufferAttribute(cc, 3)); geos.push(cone);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), (_pineMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }))); m.castShadow = true; g.add(m);
  g.scale.setScalar(s);
  return g;
}

// ------------------------------------------------------------------------------------------------ shader strips & barrier
/** Translucent cylinder wall with a scrolling diamond pattern that lights up near given points (snake heads). */
export function energyBarrier({ R = 30, h = 3, color = 0x4dd6ff, danger = 0xff3a3a, segs = 160 } = {}) {
  const u = { time: { value: 0 }, col: { value: C(color) }, dcol: { value: C(danger) }, danger: { value: 0 }, alpha: { value: 0.5 }, heads: { value: [new THREE.Vector3(999, 0, 999), new THREE.Vector3(999, 0, 999), new THREE.Vector3(999, 0, 999), new THREE.Vector3(999, 0, 999)] } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: u, fog: false,
    vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `varying vec2 vUv; varying vec3 vW; uniform vec3 col, dcol, heads[4]; uniform float time, danger, alpha;
      void main(){
        float fade = pow(1. - vUv.y, 1.6);
        float a = abs(fract(vUv.x * 120. + vUv.y * 4. + time * 0.05) - .5), b = abs(fract(vUv.x * 120. - vUv.y * 4.) - .5);
        float grid = smoothstep(.07, .0, min(a, b));
        float near = 0.; for (int i = 0; i < 4; i++) near = max(near, smoothstep(9., 0., distance(vW.xz, heads[i].xz)));
        float pulse = .5 + .5 * sin(time * 2.2 + vUv.x * 40.);
        vec3 c = mix(col, dcol, danger);
        float I = fade * (0.16 + grid * (0.5 + pulse * 0.4)) + near * fade * (0.5 + grid);
        gl_FragColor = vec4(c * I * alpha * 2., I * alpha);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R, R, h, segs, 1, true), mat);
  mesh.position.y = h / 2; mesh.renderOrder = 12;
  // flip so uv.y = 0 at the top (bright at the floor edge): CylinderGeometry has v=1 at the top; fade uses 1 - v
  return { mesh, u, setR(r, r0) { mesh.scale.set(r / r0, 1, r / r0); }, update(t) { u.time.value = t; } };
}

/** A vertical strip of falling water / light with scrolling streaks. */
export function fallStrip({ w = 2.4, h = 14, color = 0xdff4ff, alpha = 0.7, speed = 1.6 } = {}) {
  const u = { time: { value: 0 }, col: { value: C(color) }, alpha: { value: alpha }, speed: { value: speed } };
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: u, fog: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
    fragmentShader: `varying vec2 vUv; uniform vec3 col; uniform float time, alpha, speed;
      float h(float x){ return fract(sin(x * 91.3) * 43758.5); }
      void main(){
        float cx = floor(vUv.x * 14.); float s = .6 + h(cx) * .8;
        float streak = smoothstep(.35, .9, fract(vUv.y * 3. * s + time * speed * s + h(cx + 3.)));
        float edge = smoothstep(0., .18, vUv.x) * smoothstep(1., .82, vUv.x);
        float top = smoothstep(1., .9, vUv.y), foam = smoothstep(.18, 0., vUv.y);
        float a = (.35 + streak * .65) * edge * top * alpha + foam * .5 * edge;
        gl_FragColor = vec4(mix(col, vec3(1.), foam + streak * .3), a);
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), mat); m.renderOrder = 8;
  return { mesh: m, u, update(t) { u.time.value = t; } };
}

/** Additive light beam (cone) used for stage spotlights and god rays. */
export function lightBeam({ color = 0xffffff, len = 40, r = 3, opacity = 0.13 } = {}) {
  const geo = new THREE.CylinderGeometry(0.05, r, len, 24, 1, true); geo.translate(0, len / 2, 0); // narrow tip at the origin, widening upward
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = 9; return m;
}

/** Soft additive glow quad (billboard sprite). */
export function glowSprite(color = 0xffffff, size = 4, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.set(size, size, 1); return s;
}

/** Planet with banded texture drawn in code and a fresnel atmosphere shell. */
export function planet({ radius = 60, colors = ['#1b3a6b', '#2f6fb0', '#8fc7ff', '#e8f4ff'], atmosphere = 0x6ec6ff, seed = 4, city = false } = {}) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d'), r = new Rng(seed);
  const gr = g.createLinearGradient(0, 0, 0, 512); colors.forEach((col, i) => gr.addColorStop(i / (colors.length - 1), col)); g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 120; i++) { const y = r.next() * 512, w = 200 + r.next() * 600, x = r.next() * 1024, hgt = 3 + r.next() * 22; g.fillStyle = `rgba(255,255,255,${0.03 + r.next() * 0.09})`; g.fillRect(x - w / 2, y, w, hgt); g.fillStyle = `rgba(0,0,30,${0.03 + r.next() * 0.08})`; g.fillRect(x - w / 3, y + hgt, w * 0.8, hgt * 0.6); }
  for (let i = 0; i < 30; i++) { const x = r.next() * 1024, y = 80 + r.next() * 350, rad = 6 + r.next() * 30; const rg = g.createRadialGradient(x, y, 0, x, y, rad); rg.addColorStop(0, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
  if (city) { g.fillStyle = 'rgba(255,220,140,.9)'; for (let i = 0; i < 500; i++) g.fillRect(r.next() * 1024, 120 + r.next() * 280, 2, 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const grp = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0, emissive: 0x0a1428, emissiveIntensity: 0.6 }));
  grp.add(body);
  const atm = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 64, 40), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false, uniforms: { col: { value: C(atmosphere) } },
    vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 n; varying vec3 v; uniform vec3 col; void main(){ float f = pow(1. - abs(dot(normalize(n), v)), 2.4); gl_FragColor = vec4(col * f * 2.2, f); }' }));
  grp.add(atm);
  return { group: grp, body };
}

/** Mountain ring (low-poly silhouettes) with optional emissive ridge lines. */
export function mountainRing({ radius = 170, count = 26, hMin = 16, hMax = 46, color = 0x14082a, edge = 0xff2bd6, rng = new Rng(21), edgeOpacity = 0.9 } = {}) {
  const g = new THREE.Group(), geos = [], lines = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + rng.range(-0.05, 0.05), w = rng.range(18, 34), h = rng.range(hMin, hMax), r = radius + rng.range(-12, 12);
    const geo = new THREE.ConeGeometry(w, h, 5 + rng.int(0, 2), 1); geo.translate(0, h / 2, 0); geo.rotateY(rng.next() * TAU); geo.translate(Math.cos(a) * r, -14, Math.sin(a) * r);
    geos.push(geo); const eg = new THREE.EdgesGeometry(geo, 25); lines.push(eg);
  }
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, emissive: 0x0a0018, emissiveIntensity: 0.6 }));
  g.add(m);
  if (edge != null) g.add(new THREE.LineSegments(mergeGeometries(lines), new THREE.LineBasicMaterial({ color: edge, transparent: true, opacity: edgeOpacity, fog: false })));
  return g;
}

/** Shared soft radial-gradient plane material for ground glows. */
export function groundGlowMaterial(opacity = 0.5) {
  return new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
}
