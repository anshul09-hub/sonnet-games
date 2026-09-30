// Snake Arena world: a floating platform whose look follows the player's chosen theme
// (anime sky garden / gamer neon synth arena / tech orbital station). Real shadows, image-based lighting, coloured
// point lights, colour grading, animated decor. The danger zone (shrinking arena) is painted by a floor shader patch.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp, lerp } from '../core/util.js';
import { pbr, procTex, fbm } from '../core/proc.js';
import { SPRITE } from '../core/fx.js';
import { skyDome, cloudSea, floatingRock, crystalCluster, sakuraTree, pineTree, energyBarrier, fallStrip, lightBeam, glowSprite, planet, mountainRing } from '../core/decor.js';

const C = (v) => new THREE.Color(v);
const mkCanvas = (n) => { const c = document.createElement('canvas'); c.width = c.height = n; return c; };

export const ARENA = {
  anime: {
    sky: { top: 0x2f7dff, mid: 0x8cc8ff, bottom: 0x5aa2f0, sunDir: [0.5, 0.5, -0.7], sunColor: 0xfff0d0, sunSize: 0.06 },
    fog: [0xa8d4ff, 0.0026], bg: 0x8cc8ff,
    sun: { color: 0xfff0d0, i: 2.5, dir: [0.55, 0.8, 0.5] }, hemi: [0xbfe4ff, 0x6a8f5a, 0.7], fill: [0xffc4de, 0.35, [-0.7, 0.35, -0.5]],
    env: { top: 0x4aa3ff, mid: 0xbfe4ff, horizon: 0xffffff, ground: 0x6a8f5a, sunDir: [0.55, 0.8, 0.5], sunColor: 0xfff0d0, sunPower: 6, intensity: 0.5 },
    grade: { vig: 0.26, sat: 1.22, con: 1.06, grain: 0.012, tint: [1.02, 1.0, 0.97] }, bloom: [0.28, 0.6, 1.05], barrier: 0xffb0e0, glow: 0.22, exposure: 1.0,
  },
  gamer: {
    sky: { top: 0x10002a, mid: 0x5a0f8f, bottom: 0xff2d95, sunDir: [0.0, 0.16, -1], sunColor: 0xffb347, sunSize: 0.17, stripes: true, stars: 0.004 },
    fog: [0x22083f, 0.0032], bg: 0x140028,
    sun: { color: 0xff9ad5, i: 1.5, dir: [-0.5, 0.75, 0.6] }, hemi: [0x9a6cff, 0x1a0030, 0.55], fill: [0x3ad8ff, 1.5, [0.7, 0.3, -0.6]],
    env: { top: 0x1a0040, mid: 0x7a2aa8, horizon: 0xff5aa8, ground: 0x12001f, sunDir: [0, 0.2, -1], sunColor: 0xffa060, sunPower: 9, intensity: 1.0 },
    grade: { vig: 0.36, sat: 1.28, con: 1.1, grain: 0.02, tint: [1.0, 0.98, 1.05] }, bloom: [0.85, 0.6, 0.6], barrier: 0x39e6ff, glow: 0.6, exposure: 1.0,
  },
  tech: {
    sky: { top: 0x010208, mid: 0x0a1a3a, bottom: 0x1c5a8a, sunDir: [-0.5, 0.35, -0.8], sunColor: 0xe8f4ff, sunSize: 0.03, stars: 0.008 },
    fog: [0x030a1c, 0.0022], bg: 0x02040c,
    sun: { color: 0xdfeaff, i: 3.0, dir: [-0.5, 0.8, 0.45] }, hemi: [0x4a6a9a, 0x0c1428, 0.6], fill: [0x2ac8ff, 0.9, [0.6, 0.2, 0.7]],
    env: { top: 0x02040c, mid: 0x0f2a5a, horizon: 0x3a8ad0, ground: 0x050a18, sunDir: [-0.5, 0.8, 0.45], sunColor: 0xdfeaff, sunPower: 8, intensity: 1.0 },
    grade: { vig: 0.38, sat: 1.12, con: 1.12, grain: 0.02, tint: [0.97, 1.0, 1.06] }, bloom: [0.7, 0.55, 0.62], barrier: 0x54e0ff, glow: 0.5, exposure: 1.0,
  },
};

// ------------------------------------------------------------------------------------------------ floor painting
function disc(g, cx, r, fill) { g.fillStyle = fill; g.beginPath(); g.arc(cx, cx, r, 0, TAU); g.fill(); }
function wedge(g, cx, r0, r1, a0, a1) { g.beginPath(); g.arc(cx, cx, r1, a0, a1); g.arc(cx, cx, r0, a1, a0, true); g.closePath(); g.fill(); }
function ring(g, cx, r, w, stroke) { g.strokeStyle = stroke; g.lineWidth = w; g.beginPath(); g.arc(cx, cx, r, 0, TAU); g.stroke(); }

function paintFloor(theme, N, RF, R0) {
  const albedo = mkCanvas(N), glow = mkCanvas(N), g = albedo.getContext('2d'), e = glow.getContext('2d'), rng = new Rng(77);
  const k = N / (2 * RF), cx = N / 2, P = (u) => u * k;
  e.fillStyle = '#000'; e.fillRect(0, 0, N, N);
  const inCircle = (fn) => { g.save(); g.beginPath(); g.arc(cx, cx, P(R0 + 0.4), 0, TAU); g.clip(); fn(); g.restore(); };
  if (theme === 'anime') {
    g.fillStyle = '#5db049'; g.fillRect(0, 0, N, N);
    for (let r = RF, i = 0; r > 0; r -= 2.4, i++) disc(g, cx, P(r), i % 2 ? 'rgba(20,90,25,.10)' : 'rgba(190,255,130,.07)');
    for (let i = 0; i < 9000; i++) { const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * RF; const x = cx + Math.cos(a) * P(r), y = cx + Math.sin(a) * P(r); g.fillStyle = `rgba(${30 + rng.next() * 60 | 0},${110 + rng.next() * 90 | 0},${30 + rng.next() * 40 | 0},${0.12 + rng.next() * 0.18})`; g.fillRect(x, y, 1 + rng.next() * 2.5, 1 + rng.next() * 3.5); }
    // stone path ring with individually tinted slabs
    const segs = 72;
    for (let ringI = 0; ringI < 2; ringI++) { const r0 = 25.4 + ringI * 1.95, r1 = r0 + 1.9; for (let s = 0; s < segs; s++) { const t = 0.78 + rng.next() * 0.16; g.fillStyle = `rgb(${217 * t | 0},${201 * t | 0},${163 * t | 0})`; wedge(g, cx, P(r0), P(r1 - 0.06), (s / segs) * TAU, ((s + 1) / segs) * TAU - 0.004); } }
    ring(g, cx, P(29.4), P(0.3), '#8d7b5f'); ring(g, cx, P(25.35), P(0.28), '#8d7b5f');
    disc(g, cx, P(29.5), 'rgba(0,0,0,0)');
    g.fillStyle = '#6b5a45'; wedge(g, cx, P(29.5), P(RF), 0, TAU);
    // flowers
    for (let i = 0; i < 520; i++) { const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * 24.5; const c = ['#ffb7d5', '#ffffff', '#ffe066', '#ff8fb1'][i % 4]; g.fillStyle = c; g.beginPath(); g.arc(cx + Math.cos(a) * P(r), cx + Math.sin(a) * P(r), P(0.11 + rng.next() * 0.1), 0, TAU); g.fill(); }
    // centre blossom emblem
    g.save(); g.translate(cx, cx); g.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) { g.rotate(TAU / 5); g.fillStyle = '#ffc2dc'; g.beginPath(); g.ellipse(0, -P(3.2), P(1.5), P(2.6), 0, 0, TAU); g.fill(); }
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(0, 0, P(1.1), 0, TAU); g.fill(); g.restore();
    ring(g, cx, P(9), P(0.25), 'rgba(255,255,255,.25)'); ring(g, cx, P(17), P(0.25), 'rgba(255,255,255,.2)');
  } else if (theme === 'gamer') {
    g.fillStyle = '#0c0921'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 6000; i++) { g.fillStyle = `rgba(255,255,255,${rng.next() * 0.03})`; g.fillRect(rng.next() * N, rng.next() * N, 1 + rng.next() * 3, 1 + rng.next() * 3); }
    inCircle(() => {
      for (let u = -RF; u <= RF; u += 2.5) { const p = cx + P(u); g.strokeStyle = 'rgba(120,170,255,.10)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, N); g.moveTo(0, p); g.lineTo(N, p); g.stroke(); }
      for (let u = -RF; u <= RF; u += 5) { const p = cx + P(u); e.strokeStyle = 'rgba(34,211,238,.42)'; e.lineWidth = Math.max(1.5, P(0.07)); e.beginPath(); e.moveTo(p, 0); e.lineTo(p, N); e.moveTo(0, p); e.lineTo(N, p); e.stroke(); }
    });
    for (const [r, col, w] of [[6, '#ff2bd6', 0.32], [14, '#22d3ee', 0.3], [22, '#ff2bd6', 0.32], [29.4, '#ffe14d', 0.4]]) { e.shadowColor = col; e.shadowBlur = P(0.7); ring(e, cx, P(r), P(w), col); e.shadowBlur = 0; ring(g, cx, P(r), P(w), 'rgba(255,255,255,.12)'); }
    // spokes
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; e.strokeStyle = 'rgba(255,43,214,.5)'; e.lineWidth = P(0.16); e.setLineDash([P(0.8), P(0.6)]); e.beginPath(); e.moveTo(cx + Math.cos(a) * P(6.4), cx + Math.sin(a) * P(6.4)); e.lineTo(cx + Math.cos(a) * P(13.6), cx + Math.sin(a) * P(13.6)); e.stroke(); e.setLineDash([]); }
    // centre emblem: hex + bolt
    const hexPath = (ctx, r) => { ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; ctx.lineTo(cx + Math.cos(a) * P(r), cx + Math.sin(a) * P(r)); } ctx.closePath(); };
    e.shadowColor = '#ff2bd6'; e.shadowBlur = P(0.8); e.strokeStyle = '#ff2bd6'; e.lineWidth = P(0.3); hexPath(e, 3.6); e.stroke(); e.shadowBlur = 0;
    e.fillStyle = '#22d3ee'; e.beginPath(); e.moveTo(cx + P(0.6), cx - P(2.4)); e.lineTo(cx - P(1.3), cx + P(0.3)); e.lineTo(cx - P(0.1), cx + P(0.3)); e.lineTo(cx - P(0.7), cx + P(2.4)); e.lineTo(cx + P(1.3), cx - P(0.5)); e.lineTo(cx + P(0.1), cx - P(0.5)); e.closePath(); e.fill();
    // hazard band
    g.save(); g.beginPath(); g.arc(cx, cx, P(RF), 0, TAU); g.arc(cx, cx, P(29.6), 0, TAU, true); g.clip(); g.fillStyle = '#16121c'; g.fillRect(0, 0, N, N); g.fillStyle = '#e6c21c'; for (let i = -N; i < N * 2; i += P(1.6)) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + P(0.8), 0); g.lineTo(i + P(0.8) - N, N); g.lineTo(i - N, N); g.fill(); } g.restore();
  } else {
    g.fillStyle = '#101b2d'; g.fillRect(0, 0, N, N);
    // hex plating
    const hr = 1.45, hw = hr * Math.sqrt(3), hh = hr * 1.5;
    inCircle(() => {
      for (let row = -24; row < 24; row++) for (let col = -20; col < 20; col++) {
        const x = cx + P(col * hw + (row % 2 ? hw / 2 : 0)), y = cx + P(row * hh);
        g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; g.lineTo(x + Math.cos(a) * P(hr - 0.05), y + Math.sin(a) * P(hr - 0.05)); } g.closePath();
        const t = rng.next(); g.fillStyle = `rgba(${90 + t * 60 | 0},${140 + t * 60 | 0},${200 + t * 50 | 0},${0.03 + t * 0.07})`; g.fill(); g.strokeStyle = 'rgba(100,170,230,.28)'; g.lineWidth = 1.4; g.stroke();
        if (rng.chance(0.05)) { e.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + Math.PI / 6; e.lineTo(x + Math.cos(a) * P(hr - 0.2), y + Math.sin(a) * P(hr - 0.2)); } e.closePath(); e.fillStyle = 'rgba(0,240,200,.14)'; e.fill(); e.strokeStyle = 'rgba(0,240,200,.7)'; e.lineWidth = P(0.06); e.stroke(); }
      }
    });
    // circuit traces
    for (let i = 0; i < 34; i++) {
      const a = rng.next() * TAU, r = rng.range(8, 27); let x = cx + Math.cos(a) * P(r), y = cx + Math.sin(a) * P(r); const col = rng.chance(0.7) ? '0,240,200' : '199,125,255';
      const pts = [[x, y]]; let dir = rng.int(0, 7) * (Math.PI / 4);
      for (let s = 0; s < rng.int(3, 6); s++) { const L = P(rng.range(1.5, 5)); x += Math.cos(dir) * L; y += Math.sin(dir) * L; pts.push([x, y]); dir += (rng.chance(0.5) ? 1 : -1) * (Math.PI / 4); }
      for (const [ctx, alpha, w] of [[e, 0.85, P(0.09)], [g, 0.25, P(0.09)]]) { ctx.strokeStyle = `rgba(${col},${alpha})`; ctx.lineWidth = w; ctx.beginPath(); pts.forEach(([px, py], j) => (j ? ctx.lineTo(px, py) : ctx.moveTo(px, py))); ctx.stroke(); ctx.fillStyle = `rgba(${col},${alpha})`; for (const [px, py] of [pts[0], pts[pts.length - 1]]) { ctx.beginPath(); ctx.arc(px, py, P(0.2), 0, TAU); ctx.fill(); } }
    }
    for (const [r, w] of [[10, 0.12], [20, 0.12], [29.3, 0.22]]) { e.shadowColor = '#00f0c8'; e.shadowBlur = P(0.5); ring(e, cx, P(r), P(w), '#00f0c8'); e.shadowBlur = 0; ring(g, cx, P(r), P(w), 'rgba(120,220,255,.25)'); }
    for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU, l = i % 5 ? 0.5 : 1.0; e.strokeStyle = 'rgba(0,240,200,.8)'; e.lineWidth = P(0.07); e.beginPath(); e.moveTo(cx + Math.cos(a) * P(29.3 - l), cx + Math.sin(a) * P(29.3 - l)); e.lineTo(cx + Math.cos(a) * P(29.3), cx + Math.sin(a) * P(29.3)); e.stroke(); }
    // radar centre
    for (const r of [1.6, 3.2, 4.8]) { e.strokeStyle = 'rgba(0,240,200,.55)'; e.lineWidth = P(0.07); e.beginPath(); e.arc(cx, cx, P(r), 0, TAU); e.stroke(); }
    e.beginPath(); e.moveTo(cx - P(5.4), cx); e.lineTo(cx + P(5.4), cx); e.moveTo(cx, cx - P(5.4)); e.lineTo(cx, cx + P(5.4)); e.stroke();
    // hazard rim
    g.save(); g.beginPath(); g.arc(cx, cx, P(RF), 0, TAU); g.arc(cx, cx, P(29.6), 0, TAU, true); g.clip(); g.fillStyle = '#1c1a20'; g.fillRect(0, 0, N, N); g.fillStyle = '#ff8a1c'; for (let i = -N; i < N * 2; i += P(1.6)) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + P(0.8), 0); g.lineTo(i + P(0.8) - N, N); g.lineTo(i - N, N); g.fill(); } g.restore();
  }
  const a = new THREE.CanvasTexture(albedo), gl = new THREE.CanvasTexture(glow);
  a.colorSpace = THREE.SRGBColorSpace; gl.colorSpace = THREE.SRGBColorSpace; a.anisotropy = 8; gl.anisotropy = 8;
  return { albedo: a, glow: gl };
}

// ------------------------------------------------------------------------------------------------ arena
export class Arena {
  constructor({ engine, scene, fx, theme, R0 = 30, rmin = 10, camera }) {
    this.engine = engine; this.scene = scene; this.fx = fx; this.theme = theme; this.R0 = R0; this.rmin = rmin; this.camera = camera;
    this.T = ARENA[theme]; this.rng = new Rng(11); this.anims = []; this.R = R0; this.danger = 0; this.disposables = [];
    this.q = engine.cfg.detail;
    this.build();
  }

  build() {
    const { scene, T, engine, R0, theme } = this;
    scene.fog = new THREE.FogExp2(T.fog[0], T.fog[1]); scene.background = C(T.bg);
    this.sky = skyDome({ ...T.sky }); scene.add(this.sky.mesh); this.anims.push((t) => this.sky.update(t));
    engine.setEnvironment(scene, T.env); engine.setGrade(T.grade); engine.setBloom(...T.bloom);
    // ---- lights: key sun (real soft shadows), sky fill, coloured rim
    this.hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(T.sun.color, T.sun.i);
    const sd = new THREE.Vector3(...T.sun.dir).normalize(); sun.position.copy(sd).multiplyScalar(80); sun.target.position.set(0, 0, 0);
    sun.castShadow = true; const sc = sun.shadow.camera; sc.left = sc.bottom = -36; sc.right = sc.top = 36; sc.near = 20; sc.far = 170; sc.updateProjectionMatrix();
    scene.add(sun, sun.target); engine.tuneLight(sun);
    const fill = new THREE.DirectionalLight(T.fill[0], T.fill[1]); fill.position.set(...T.fill[2]).multiplyScalar(60); scene.add(fill);
    // ---- floor
    const RF = R0 + 1.4, N = this.q > 0.5 ? 2048 : 1024;
    const { albedo, glow } = paintFloor(theme, N, 31.4, 30);
    const nm = procTex(theme === 'anime' ? 'grass' : theme === 'gamer' ? 'concrete' : 'metal', { repeat: [18, 18], bump: 2, size: 256 }).normalMap;
    const topMat = new THREE.MeshStandardMaterial({ map: albedo, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5), roughness: theme === 'anime' ? 0.95 : 0.42, metalness: theme === 'anime' ? 0 : 0.35, envMapIntensity: theme === 'anime' ? 0.35 : 0.9 });
    if (theme !== 'anime') { topMat.emissiveMap = glow; topMat.emissive = C(0xffffff); topMat.emissiveIntensity = theme === 'gamer' ? 1.5 : 1.3; }
    this.dangerU = { R0: { value: R0 }, R: { value: R0 }, time: { value: 0 }, edge: { value: C(T.barrier) } };
    this.patchDanger(topMat);
    const sideMat = pbr(theme === 'anime' ? 'stone' : theme === 'gamer' ? 'concrete' : 'metal', { repeat: [24, 1], base: theme === 'anime' ? 0x8b8272 : theme === 'gamer' ? 0x241a3a : 0x3a4658, rough: 0.7, metal: theme === 'anime' ? 0 : 0.5 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(RF, RF, 1.5, 128), [sideMat, topMat, sideMat]);
    floor.position.y = -0.75; floor.receiveShadow = true; floor.castShadow = true; scene.add(floor); this.floor = floor;
    // ---- rim curb + posts
    const rimMat = pbr(theme === 'anime' ? 'stone' : 'metal', { repeat: [40, 1], base: theme === 'anime' ? 0xa79c86 : theme === 'gamer' ? 0x2a2040 : 0x4a586c, rough: 0.6, metal: theme === 'anime' ? 0 : 0.6 });
    const curbPts = [[R0 + 0.55, -1.4], [R0 + 0.55, 0.15], [R0 + 0.72, 0.5], [R0 + 1.25, 0.5], [R0 + 1.42, 0.15], [R0 + 1.42, -1.4]].map(([x, y]) => new THREE.Vector2(x, y));
    const curb = new THREE.Mesh(new THREE.LatheGeometry(curbPts, 128), rimMat); curb.castShadow = true; curb.receiveShadow = true; scene.add(curb);
    if (theme !== 'anime') { const strip = new THREE.Mesh(new THREE.TorusGeometry(R0 + 0.98, 0.09, 8, 160), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: T.barrier, emissiveIntensity: 1.3 })); strip.rotation.x = Math.PI / 2; strip.position.y = 0.5; scene.add(strip); }
    this.buildPosts();
    // ---- energy barrier
    this.barrier = energyBarrier({ R: R0, h: 3.2, color: T.barrier }); this.barrier.u.alpha.value = theme === 'anime' ? 0.55 : 0.7; scene.add(this.barrier.mesh); this.anims.push((t) => this.barrier.update(t));
    this.buildUnderside();
    this.buildDecor();
  }

  patchDanger(mat) {
    const U = this.dangerU;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uR = U.R; sh.uniforms.uR0 = U.R0; sh.uniforms.uTime = U.time; sh.uniforms.uEdge = U.edge;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uR, uR0, uTime; uniform vec3 uEdge;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          float rr = length(vWP.xz);
          float over = smoothstep(uR - 0.1, uR + 0.3, rr);
          float band = smoothstep(1.0, 0.0, abs(rr - uR)) * step(uR, uR0 - 0.1);
          float hatch = step(0.5, fract((vWP.x + vWP.z) * 0.8 + uTime * 0.5));
          totalEmissiveRadiance += uEdge * band * 1.6 + vec3(1.0, 0.1, 0.06) * over * (0.3 + 0.35 * hatch) * (0.65 + 0.35 * sin(uTime * 5.0)) * step(uR, uR0 - 0.1);
          diffuseColor.rgb *= 1.0 - 0.5 * over;`);
    };
    mat.customProgramCacheKey = () => 'snake-arena-danger';
  }

  buildPosts() {
    const { scene, R0, theme, T } = this, n = 24;
    const bodyGeo = theme === 'anime' ? new THREE.BoxGeometry(0.5, 1.3, 0.5) : theme === 'gamer' ? new THREE.BoxGeometry(0.34, 1.9, 0.34) : new THREE.CylinderGeometry(0.1, 0.16, 2.6, 8);
    const bodyMat = theme === 'anime' ? pbr('stone', { base: 0xb9ae98, rough: 0.9 }) : new THREE.MeshStandardMaterial({ color: theme === 'gamer' ? 0x16102a : 0x556478, roughness: 0.4, metalness: 0.7 });
    const posts = new THREE.InstancedMesh(bodyGeo, bodyMat, n), tops = new THREE.InstancedMesh(theme === 'anime' ? new THREE.SphereGeometry(0.34, 12, 10) : new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: theme === 'anime' ? 0xffa64d : T.barrier, emissiveIntensity: theme === 'anime' ? 2.2 : 3, roughness: 0.4 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    const h = theme === 'anime' ? 1.3 : theme === 'gamer' ? 1.9 : 2.6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, r = R0 + 1.02, p = new THREE.Vector3(Math.cos(a) * r, 0.5 + h / 2, Math.sin(a) * r);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a); m.compose(p, q, s); posts.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(p.x, 0.5 + h + (theme === 'anime' ? 0.2 : 0.06), p.z), q, s); tops.setMatrixAt(i, m);
    }
    posts.castShadow = true; posts.receiveShadow = true; scene.add(posts, tops);
    if (this.engine.cfg.detail > 0.5) { // a few real coloured lights on the rim
      const cols = theme === 'anime' ? [0xffb26b] : theme === 'gamer' ? [0x39e6ff, 0xff2bd6] : [0x54e0ff, 0x00f0c8];
      for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4, l = new THREE.PointLight(cols[i % cols.length], theme === 'anime' ? 14 : 160, 26, 2); l.position.set(Math.cos(a) * (R0 + 1), 3.2, Math.sin(a) * (R0 + 1)); scene.add(l); }
    }
  }

  buildUnderside() {
    const { scene, R0, theme, T } = this, RF = R0 + 1.4, rng = this.rng;
    const S = RF / 31.4, prof = [[0.01, -19], [3, -17.5], [8, -14], [14, -10.2], [20, -6.6], [25, -3.8], [31.4 - 0.5, -2.0], [31.4, -1.4]].map(([x, y]) => new THREE.Vector2(x * S, y));
    const rock = new THREE.Mesh(new THREE.LatheGeometry(prof, 64), pbr(theme === 'anime' ? 'stone' : 'concrete', { repeat: [10, 5], base: theme === 'anime' ? 0x6f6658 : theme === 'gamer' ? 0x2a1d44 : 0x2c3646, rough: 0.9, normal: 1.4 }));
    scene.add(rock);
    // craggy chunks hugging the underside
    const chunk = new THREE.IcosahedronGeometry(1, 1), pos = chunk.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i); v.multiplyScalar(0.7 + fbm(v.x * 2 + 4, v.z * 2 + v.y, 3, 5) * 0.7); pos.setXYZ(i, v.x, v.y * 1.4, v.z); }
    chunk.computeVertexNormals();
    const n = 48, im = new THREE.InstancedMesh(chunk, new THREE.MeshStandardMaterial({ color: theme === 'anime' ? 0x7d7264 : theme === 'gamer' ? 0x33244f : 0x3a475a, roughness: 0.9, flatShading: true }), n), m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < n; i++) {
      const a = rng.next() * TAU, t = rng.next(), r = lerp(RF - 1.5, 3, t * t), y = lerp(-1.8, -15, t) + rng.range(-0.6, 0.6), s = rng.range(1.3, 3.6) * (1 - t * 0.5);
      e.set(rng.next() * 3, rng.next() * 3, rng.next() * 3); q.setFromEuler(e); m.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(s, s, s)); im.setMatrixAt(i, m);
    }
    im.castShadow = false; scene.add(im);
    // glowing crystals hanging below
    const cc = theme === 'anime' ? 0xff9ed0 : theme === 'gamer' ? 0xff2bd6 : 0x00f0c8;
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + rng.range(-0.2, 0.2), r = rng.range(10, 24), c = crystalCluster(rng, { n: 4, color: cc, size: rng.range(1.4, 2.6), intensity: 1.7 }); c.position.set(Math.cos(a) * r, -3.2 - (RF - r) * 0.28, Math.sin(a) * r); c.rotation.x = Math.PI; scene.add(c); }
  }

  // ---------------------------------------------------------------------------------------------- decor by theme
  buildDecor() { this['decor_' + this.theme](); }

  decor_anime() {
    const { scene, rng, R0, q } = this;
    // grass tufts swaying in the wind (instanced blades with a vertex-shader sway)
    const tufts = Math.floor(3800 * q);
    if (tufts > 100) {
      const bl = new THREE.ConeGeometry(0.055, 0.42, 3, 1); bl.translate(0, 0.21, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0x4fa03e, roughness: 0.9, flatShading: true });
      const tu = { time: { value: 0 } };
      mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = tu.time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4;\ntransformed.x += sin(uTime * 2.2 + ph) * position.y * 0.55; transformed.z += cos(uTime * 1.7 + ph) * position.y * 0.3;\n#endif'); };
      mat.customProgramCacheKey = () => 'tufts';
      const im = new THREE.InstancedMesh(bl, mat, tufts), m = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < tufts; i++) {
        const a = rng.next() * TAU, r = Math.sqrt(rng.next()) * 24.6, s = rng.range(0.7, 1.7);
        m.compose(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng.next() * 3), new THREE.Vector3(s, s * rng.range(0.7, 1.4), s)); im.setMatrixAt(i, m);
        col.setHSL(0.27 + rng.range(-0.03, 0.04), 0.5, rng.range(0.28, 0.42)); im.setColorAt(i, col);
      }
      scene.add(im); this.anims.push((t) => { tu.time.value = t; });
    }
    // floating islets: trees, shrines, a pagoda
    const islets = [];
    const ring = [[0.15, 52, -3, 8], [0.42, 60, 1, 7], [0.7, 48, -6, 6], [1.05, 76, 3, 10], [1.4, 66, -2, 8], [-0.25, 55, 0, 7.5], [-0.55, 72, -5, 9], [-0.9, 50, 2, 6], [2.55, 58, -4, 8], [2.95, 72, 2, 9.5], [3.45, 52, -2, 6.5], [3.9, 68, 4, 8], [4.25, 80, -1, 11], [-1.2, 84, 6, 13]];
    ring.forEach(([ang, dist, y, r], i) => {
      const rk = floatingRock(rng, r, { top: 0x6fbf5c, rock: 0x87796a }); rk.position.set(Math.cos(ang) * dist, y, Math.sin(ang) * dist); rk.rotation.y = rng.next() * TAU;
      scene.add(rk); islets.push(rk);
      const top = r * 0.32, n = Math.floor(rng.range(2, 4.4) * Math.max(0.6, q));
      for (let k = 0; k < n; k++) { const a = rng.next() * TAU, rr = rng.range(0.1, 0.5) * r; const p = new THREE.Vector3(rk.position.x + Math.cos(a) * rr, rk.position.y + top, rk.position.z + Math.sin(a) * rr); const t = i % 5 === 4 ? pineTree(rng, r * 0.2, 0x2f6b3f, true) : sakuraTree(rng, r * 0.24 + 0.2); t.position.copy(p); t.rotation.y = rng.next() * TAU; scene.add(t); }
      const crystal = crystalCluster(rng, { n: 3, color: 0xff9ed0, size: r * 0.25 }); crystal.rotation.x = Math.PI; crystal.position.set(rk.position.x, rk.position.y - r * 0.55, rk.position.z); scene.add(crystal);
    });
    // torii + lantern shrine on two islets, big pagoda on the far one
    const red = new THREE.MeshStandardMaterial({ color: 0xd63a2f, roughness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d1a20, roughness: 0.6 });
    const torii = (s) => { const g = new THREE.Group(); for (const x of [-1.3, 1.3]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 4.2, 10), red); p.position.set(x, 2.1, 0); p.castShadow = true; g.add(p); } const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.34, 0.5), dark); b1.position.y = 4.4; const b2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.24, 0.3), red); b2.position.y = 3.6; b1.castShadow = b2.castShadow = true; g.add(b1, b2); g.scale.setScalar(s); return g; };
    [[0, 0.32], [4, 0.32]].forEach(([i]) => { const rk = islets[i], t = torii(rk.geometry.boundingSphere ? 1.1 : 1.1); t.position.set(rk.position.x, rk.position.y + rk.userData.topY * 0 + ring[i][3] * 0.32, rk.position.z); t.rotation.y = Math.atan2(rk.position.x, rk.position.z); scene.add(t); });
    const pagoda = new THREE.Group(), roofM = new THREE.MeshStandardMaterial({ color: 0x3b4a6b, roughness: 0.6 }), wall = pbr('plaster', { base: 0xf5ecd8 });
    for (let i = 0; i < 5; i++) { const w = 4.4 - i * 0.62, body = new THREE.Mesh(new THREE.BoxGeometry(w, 1.5, w), wall); body.position.y = 1.0 + i * 2.2; const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 1.05, 1.0, 4), roofM); roof.rotation.y = Math.PI / 4; roof.position.y = 2.0 + i * 2.2 + 0.3; body.castShadow = roof.castShadow = true; pagoda.add(body, roof); }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 3, 6), red); spire.position.y = 12.7; pagoda.add(spire);
    const far = islets[13]; pagoda.position.set(far.position.x, far.position.y + ring[13][3] * 0.32, far.position.z); pagoda.scale.setScalar(1.25); scene.add(pagoda);
    // cloud sea below + higher wisps around the horizon
    this.clouds = cloudSea({ y: -16, count: Math.floor(48 * Math.max(0.5, q)), r0: 20, r1: 150, color: 0xffffff, opacity: 0.92, size: [30, 64], spread: 5 }); scene.add(this.clouds.group);
    const hi = cloudSea({ y: 6, count: Math.floor(16 * Math.max(0.5, q)), r0: 80, r1: 160, color: 0xfff4fb, opacity: 0.5, size: [40, 80], spread: 14, seed: 8 }); scene.add(hi.group);
    this.anims.push((t) => { this.clouds.update(t); hi.update(t); });
    // waterfalls off the rim
    for (const a of [0.2, 2.1, 4.1]) { const f = fallStrip({ w: 3.4, h: 16, color: 0xdff4ff, alpha: 0.8 }); f.mesh.position.set(Math.cos(a) * (R0 + 1.5), -1.7 - 8, Math.sin(a) * (R0 + 1.5)); f.mesh.rotation.y = Math.PI / 2 - a; scene.add(f.mesh); this.anims.push((t) => f.update(t)); }
    // birds
    const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1.3, 0, -0.3, 0.15, 0, -0.7], 3)); wingGeo.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false }), birds = [];
    for (let i = 0; i < 8; i++) { const g = new THREE.Group(), l = new THREE.Mesh(wingGeo, bm), r = new THREE.Mesh(wingGeo, bm); r.scale.x = -1; g.add(l, r); g.userData = { a: rng.next() * TAU, R: rng.range(42, 70), y: rng.range(6, 15), sp: rng.range(0.05, 0.11) * (rng.chance(0.5) ? 1 : -1), ph: rng.next() * 6 }; scene.add(g); birds.push({ g, l, r }); }
    this.anims.push((t) => { for (const { g, l, r } of birds) { const d = g.userData, a = d.a + t * d.sp; g.position.set(Math.cos(a) * d.R, d.y + Math.sin(t * 0.6 + d.ph) * 0.8, Math.sin(a) * d.R); g.rotation.y = -a + (d.sp > 0 ? Math.PI : 0); const f = Math.sin(t * 8 + d.ph) * 0.7; l.rotation.z = f; r.rotation.z = -f; } });
    // falling petals
    this.anims.push((t, dt) => { if (Math.random() < dt * 55 * q) this.fx.emit({ p: [(Math.random() - 0.5) * 90, 16 + Math.random() * 6, (Math.random() - 0.5) * 60 - 5], n: 1, v: [1.4, -1.2, 0.3], vr: [0.5, 0.3, 0.5], life: 8, size: 0.2, color: [0xffb7d5, 0xffc9de, 0xff9ec4][Math.random() * 3 | 0], alpha: 0.95, alpha1: 0.9, g: -0.05, drag: 0.4, spin: 3, frame: SPRITE.PETAL, floor: 0.05 }); });
  }

  decor_gamer() {
    const { scene, rng, R0, q } = this;
    // neon grid ground far below with fading horizon lines
    const gm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { time: { value: 0 } },
      vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `varying vec3 vW; uniform float time;
        float line(float v, float w){ float d = abs(fract(v - .5) - .5) / fwidth(v); return 1. - smoothstep(0., w, d); }
        void main(){
          vec2 p = vW.xz * 0.045; p.y += time * 0.35;
          float g = max(line(p.x, 1.2), line(p.y, 1.2)); float g2 = max(line(p.x * 4., 1.), line(p.y * 4., 1.)) * .18;
          float dist = length(vW.xz - cameraPosition.xz); float fade = smoothstep(420., 60., dist);
          vec3 c = mix(vec3(1., .16, .8), vec3(.15, .85, 1.), smoothstep(-80., 80., vW.x));
          gl_FragColor = vec4(c * (g + g2) * 0.85, (g + g2) * fade);
        }` });
    const grid = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), gm); grid.rotation.x = -Math.PI / 2; grid.position.y = -14; grid.renderOrder = -5; scene.add(grid);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshBasicMaterial({ color: 0x10001f, fog: false })); under.rotation.x = -Math.PI / 2; under.position.y = -14.2; under.renderOrder = -6; scene.add(under);
    this.anims.push((t) => { gm.uniforms.time.value = t; });
    const mts = mountainRing({ radius: 210, count: 30, hMin: 26, hMax: 70, color: 0x1a0836, edge: 0xff2bd6 }); mts.position.y = -6; scene.add(mts);
    const mts2 = mountainRing({ radius: 160, count: 22, hMin: 12, hMax: 34, color: 0x120626, edge: 0x22d3ee, rng: new Rng(5), edgeOpacity: 0.7 }); mts2.position.y = -12; scene.add(mts2);
    // floating neon shapes
    const mats = [0xff2bd6, 0x22d3ee, 0xffe14d, 0x7a5cff].map((c) => new THREE.MeshStandardMaterial({ color: 0x120a24, emissive: c, emissiveIntensity: 1.9, roughness: 0.3, metalness: 0.5 }));
    const geos = [new THREE.OctahedronGeometry(1.3), new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.TorusGeometry(1.2, 0.3, 10, 24), new THREE.TetrahedronGeometry(1.5), new THREE.IcosahedronGeometry(1.2, 0)], shapes = [];
    for (let i = 0; i < Math.floor(26 * Math.max(0.5, q)); i++) {
      const a = rng.range(-0.5, 3.7) + Math.PI * 0.0, r = rng.range(40, 95), m = new THREE.Mesh(geos[i % geos.length], mats[i % mats.length]);
      m.position.set(Math.cos(a) * r, rng.range(-6, 14), Math.sin(a) * r - 6); m.scale.setScalar(rng.range(0.9, 2.4)); m.castShadow = true; m.userData = { sp: new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).multiplyScalar(0.6), y0: m.position.y, ph: rng.next() * 6 };
      scene.add(m); shapes.push(m);
    }
    this.anims.push((t) => { for (const m of shapes) { m.rotation.x += m.userData.sp.x * 0.01; m.rotation.y += m.userData.sp.y * 0.01; m.rotation.z += m.userData.sp.z * 0.01; m.position.y = m.userData.y0 + Math.sin(t * 0.8 + m.userData.ph) * 0.8; } });
    // equaliser screens
    const eq = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, fog: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `varying vec2 vUv; uniform float time;
        float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
        void main(){
          float bars = 26.; float id = floor(vUv.x * bars); float fx = fract(vUv.x * bars);
          float lvl = .25 + .65 * (.5 + .5 * sin(time * (2. + h(id) * 4.) + h(id) * 30.));
          float on = step(vUv.y, lvl) * step(.12, fx) * step(fx, .88) * step(.08, fract(vUv.y * 22.)) ;
          vec3 c = mix(vec3(.15, .9, 1.), vec3(1., .16, .8), vUv.y); c = mix(c, vec3(1., .9, .3), smoothstep(.75, 1., vUv.y));
          float edge = step(vUv.x, .015) + step(.985, vUv.x) + step(vUv.y, .02) + step(.98, vUv.y);
          gl_FragColor = vec4(c * (on * 1.4 + edge * .6) + vec3(.02, .01, .05), 1.);
        }` });
    const frameM = new THREE.MeshStandardMaterial({ color: 0x100c1c, roughness: 0.4, metalness: 0.8 });
    [[-0.35, 58], [0.05, 66], [0.5, 60], [-0.9, 52], [-1.2, 50]].forEach(([a0, r], i) => {
      const a = -Math.PI / 2 + a0 * 1.6; const g = new THREE.Group(); const scr = new THREE.Mesh(new THREE.PlaneGeometry(20, 9), eq); const fr = new THREE.Mesh(new THREE.BoxGeometry(21.2, 10.2, 0.8), frameM); fr.position.z = -0.5; g.add(fr, scr);
      g.position.set(Math.cos(a) * r, 6 + (i % 2) * 2, Math.sin(a) * r); g.lookAt(0, 4, 0); scene.add(g);
    });
    this.anims.push((t) => { eq.uniforms.time.value = t; });
    // sweeping spot beams from rim pylons
    const beams = [];
    for (let i = 0; i < 8; i++) { const b = lightBeam({ color: i % 2 ? 0xff2bd6 : 0x22d3ee, len: 70, r: 2.4, opacity: 0.07 }); const a = (i / 8) * TAU + 0.3; b.position.set(Math.cos(a) * 44, -6, Math.sin(a) * 44); scene.add(b); beams.push({ b, a, i }); }
    this.anims.push((t) => { for (const { b, a, i } of beams) { b.rotation.set(Math.sin(t * 0.7 + i) * 0.45, 0, Math.cos(t * 0.6 + i * 1.7) * 0.45); b.rotation.x += -Math.cos(a) * 0.25; b.rotation.z += Math.sin(a) * 0.25; } });
    // rim glow sprites
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, s = glowSprite(i % 2 ? 0xff2bd6 : 0x22d3ee, 5, 0.55); s.position.set(Math.cos(a) * (R0 + 1), 1.8, Math.sin(a) * (R0 + 1)); scene.add(s); }
  }

  decor_tech() {
    const { scene, rng, R0, q } = this;
    // planet + atmosphere below the station, big and slow
    const pl = planet({ radius: 90, colors: ['#0b1d3a', '#1f5fa0', '#6fb6ff', '#e6f3ff', '#1f5fa0'], atmosphere: 0x69c8ff, seed: 6, city: true });
    pl.group.position.set(30, -128, -150); pl.group.rotation.set(0.35, 0, 0.2); scene.add(pl.group); this.anims.push((t) => { pl.body.rotation.y = t * 0.01; });
    const moon = planet({ radius: 16, colors: ['#3a3d4a', '#8b8f9c', '#c9ccd6'], atmosphere: 0x9aa4c0, seed: 12 }); moon.group.position.set(-95, -25, -140); scene.add(moon.group);
    // nebula clouds
    for (const [c, x, y, z, s] of [[0xff2bd6, -140, -40, -200, 240], [0x2a8bff, 150, -60, -220, 260], [0x7a2bff, 20, 40, -260, 300], [0x00f0c8, -220, -70, -60, 200]]) { const sp = glowSprite(c, s, 0.34); sp.position.set(x, y, z); scene.add(sp); }
    // orbital ring with lit windows
    const wc = mkCanvas(512), g = wc.getContext('2d'); g.fillStyle = '#1a2233'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 40; i++) for (let j = 0; j < 4; j++) { if (Math.random() < 0.72) { g.fillStyle = Math.random() < 0.85 ? '#ffe6a8' : '#7fe8ff'; g.fillRect(i * 12.8 + 2, 60 + j * 100, 8, 30); } }
    const wt = new THREE.CanvasTexture(wc); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(6, 1); wt.colorSpace = THREE.SRGBColorSpace;
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(88, 4.2, 20, 200), new THREE.MeshStandardMaterial({ color: 0x8a97ad, roughness: 0.4, metalness: 0.8, emissiveMap: wt, emissive: 0xffffff, emissiveIntensity: 1.1, map: wt })); ringM.rotation.set(Math.PI / 2 - 0.22, 0, 0.15); ringM.position.y = -4; scene.add(ringM);
    this.anims.push((t) => { ringM.rotation.z = 0.15 + t * 0.012; });
    // solar array arms
    const panelC = mkCanvas(256), pg = panelC.getContext('2d'); pg.fillStyle = '#0d2a5c'; pg.fillRect(0, 0, 256, 256); pg.strokeStyle = 'rgba(120,200,255,.6)'; pg.lineWidth = 2; for (let i = 0; i <= 8; i++) { pg.beginPath(); pg.moveTo(i * 32, 0); pg.lineTo(i * 32, 256); pg.moveTo(0, i * 32); pg.lineTo(256, i * 32); pg.stroke(); }
    const pt = new THREE.CanvasTexture(panelC); pt.colorSpace = THREE.SRGBColorSpace; const panelM = new THREE.MeshStandardMaterial({ map: pt, emissiveMap: pt, emissive: 0x2a6ad8, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.8 }), armM = new THREE.MeshStandardMaterial({ color: 0x9aa6ba, roughness: 0.4, metalness: 0.8 });
    for (const a of [-2.55, -0.6, 3.5]) { const arm = new THREE.Group(); const boom = new THREE.Mesh(new THREE.BoxGeometry(34, 0.7, 0.7), armM); boom.position.x = 17; arm.add(boom); for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 5), panelM); p.position.set(8 + i * 10, 0, s * 3.2); p.castShadow = true; arm.add(p); } arm.position.set(Math.cos(a) * (R0 + 1.5), -0.6, Math.sin(a) * (R0 + 1.5)); arm.rotation.y = -a; scene.add(arm); }
    // antenna towers with blinking lamps
    const lamps = [];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5, tw = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.26, 7 + (i % 3) * 2, 8), armM); tw.position.set(Math.cos(a) * (R0 + 2.2), 3.5 + (i % 3), Math.sin(a) * (R0 + 2.2)); tw.castShadow = true; scene.add(tw); const s = glowSprite(0xff3b3b, 1.6, 0.9); s.position.set(tw.position.x, tw.position.y * 2 - 0.4, tw.position.z); scene.add(s); lamps.push(s); }
    this.anims.push((t) => { lamps.forEach((s, i) => { s.material.opacity = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.2 + i * 1.3)); }); });
    // patrol drones
    const drones = [], dm = new THREE.MeshStandardMaterial({ color: 0x9aa6ba, roughness: 0.3, metalness: 0.9 }), dl = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x00f0c8, emissiveIntensity: 3 });
    for (let i = 0; i < 8; i++) { const g2 = new THREE.Group(); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), dl); eye.position.set(0, -0.1, 0.55); g2.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.0), dm), eye); for (const x of [-0.8, 0.8]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), dm); r.position.set(x, 0.3, 0); g2.add(r); } g2.userData = { a: rng.next() * TAU, R: rng.range(38, 66), y: rng.range(2, 12), sp: rng.range(0.08, 0.16) * (i % 2 ? 1 : -1) }; g2.castShadow = true; scene.add(g2); drones.push(g2); }
    this.anims.push((t) => { for (const d of drones) { const u = d.userData, a = u.a + t * u.sp; d.position.set(Math.cos(a) * u.R, u.y + Math.sin(t + u.a) * 0.6, Math.sin(a) * u.R); d.rotation.y = -a + (u.sp > 0 ? Math.PI : 0); d.rotation.z = Math.sin(t * 1.3 + u.a) * 0.1; } });
    // radar sweep on the floor
    const sweep = new THREE.Mesh(new THREE.CircleGeometry(29.5, 96), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { time: { value: 0 } }, fog: false,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'varying vec2 vP; uniform float time; void main(){ float a = atan(vP.y, vP.x); float d = mod(time * 0.9 - a, 6.2832); float I = exp(-d * 2.2) * smoothstep(30., 6., length(vP)) * 0.22; gl_FragColor = vec4(vec3(0., .95, .8) * I, I); }' }));
    sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.03; sweep.renderOrder = 3; scene.add(sweep); this.anims.push((t) => { sweep.material.uniforms.time.value = t; });
  }

  // ---------------------------------------------------------------------------------------------- per frame
  setR(R) { this.R = R; this.dangerU.R.value = R; this.barrier.setR(R, this.R0); const d = clamp((this.R0 - R) / (this.R0 - this.rmin), 0, 1); this.barrier.u.danger.value = d > 0 ? Math.min(1, 0.4 + d) : 0; }
  setHeads(list) { const h = this.barrier.u.heads.value; for (let i = 0; i < 4; i++) { if (list[i]) h[i].copy(list[i]); else h[i].set(999, 0, 999); } }
  update(t, dt) {
    this.dangerU.time.value = t;
    for (const f of this.anims) f(t, dt);
  }
  dispose() {
    this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); });
    if (this.scene.userData.envRT) this.scene.userData.envRT.dispose();
    this.engine.untuneLight(this.sun);
  }
}
