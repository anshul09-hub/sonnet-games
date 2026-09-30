// Blaster Brawl world: three themed arenas (anime rooftop courtyard, neon gamer cage arena, orbital cargo deck) with
// PBR materials drawn in code, real sun shadows, image-based lighting, colour grading and lots of animated scenery.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng, TAU, clamp, lerp } from '../core/util.js';
import { pbr, procTex, worldUV, fbm } from '../core/proc.js';
import { SPRITE } from '../core/fx.js';
import { skyDome, cloudSea, floatingRock, crystalCluster, sakuraTree, pineTree, lightBeam, glowSprite, planet, mountainRing } from '../core/decor.js';
import { CFG } from './brawl-sim.js';

const C = (v) => new THREE.Color(v);
const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const box = (w, h, d, uv = 0.5) => worldUV(new THREE.BoxGeometry(w, h, d), uv);
const { HX, HZ } = CFG;

export const THEMES = {
  anime: {
    sky: { top: 0x3a8fff, mid: 0xa5d6ff, bottom: 0xf2f8ff, sunDir: [0.45, 0.45, -0.75], sunColor: 0xfff0d0, sunSize: 0.05 }, fog: [0xd8ecff, 0.006], bg: 0xb8dcff,
    sun: { color: 0xfff0d2, i: 2.9, dir: [0.5, 0.85, 0.55] }, hemi: [0xcfe8ff, 0x7a9060, 0.75], fill: [0xffc4de, 0.35, [-0.7, 0.4, -0.4]],
    env: { top: 0x4aa3ff, mid: 0xbfe4ff, horizon: 0xffffff, ground: 0x7a9060, sunDir: [0.5, 0.85, 0.55], sunColor: 0xfff0d0, sunPower: 6, intensity: 0.55 },
    grade: { vig: 0.28, sat: 1.2, con: 1.07, grain: 0.012, tint: [1.02, 1.0, 0.97] }, bloom: [0.28, 0.6, 1.05], accent: 0xff7eb6, glowy: false,
  },
  gamer: {
    sky: { top: 0x10002a, mid: 0x5a0f8f, bottom: 0xff2d95, sunDir: [0.0, 0.16, -1], sunColor: 0xffb347, sunSize: 0.17, stripes: true, stars: 0.004 }, fog: [0x1a0838, 0.005], bg: 0x120024,
    sun: { color: 0xffb0e0, i: 2.4, dir: [-0.4, 0.85, 0.6] }, hemi: [0xb08cff, 0x2a1050, 1.0], fill: [0x3ad8ff, 1.2, [0.7, 0.3, -0.5]],
    env: { top: 0x1a0040, mid: 0x7a2aa8, horizon: 0xff5aa8, ground: 0x12001f, sunDir: [0, 0.2, -1], sunColor: 0xffa060, sunPower: 9, intensity: 1.0 },
    grade: { vig: 0.36, sat: 1.28, con: 1.1, grain: 0.02, tint: [1.0, 0.98, 1.05] }, bloom: [0.45, 0.5, 0.85], accent: 0x22d3ee, glowy: true,
  },
  tech: {
    sky: { top: 0x010208, mid: 0x0a1a3a, bottom: 0x1c5a8a, sunDir: [-0.5, 0.35, -0.8], sunColor: 0xe8f4ff, sunSize: 0.03, stars: 0.008 }, fog: [0x030a1c, 0.004], bg: 0x02040c,
    sun: { color: 0xdfeaff, i: 3.2, dir: [-0.5, 0.85, 0.45] }, hemi: [0x6a8aba, 0x1c2848, 0.95], fill: [0x2ac8ff, 0.8, [0.6, 0.2, 0.7]],
    env: { top: 0x02040c, mid: 0x0f2a5a, horizon: 0x3a8ad0, ground: 0x050a18, sunDir: [-0.5, 0.8, 0.45], sunColor: 0xdfeaff, sunPower: 8, intensity: 1.0 },
    grade: { vig: 0.38, sat: 1.12, con: 1.12, grain: 0.02, tint: [0.97, 1.0, 1.06] }, bloom: [0.4, 0.5, 0.85], accent: 0x54e0ff, glowy: true,
  },
};

// ------------------------------------------------------------------------------------------------ floor painting
function paintFloor(theme, FW, FD) {
  const W = 2048, H = Math.round(2048 * FD / FW), a = mkCanvas(W, H), e = mkCanvas(W, H), g = a.getContext('2d'), gl = e.getContext('2d'), rng = new Rng(21);
  const k = W / FW, cx = W / 2, cy = H / 2, X = (u) => cx + u * k, Z = (v) => cy + v * k;
  gl.fillStyle = '#000'; gl.fillRect(0, 0, W, H);
  if (theme === 'anime') {
    const ph = 0.6;
    for (let z = -FD / 2, i = 0; z < FD / 2; z += ph, i++) {
      for (let x = -FW / 2 - (i % 2) * 1.6; x < FW / 2; x += 3.2) { const t = 0.8 + rng.next() * 0.35; g.fillStyle = `rgb(${172 * t | 0},${118 * t | 0},${68 * t | 0})`; g.fillRect(X(x), Z(z), 3.2 * k - 2, ph * k - 2); for (let s = 0; s < 6; s++) { g.fillStyle = `rgba(60,30,10,${0.06 + rng.next() * 0.07})`; g.fillRect(X(x) + rng.next() * 3.2 * k, Z(z) + rng.next() * ph * k, 26 + rng.next() * 120, 1.5); } }
    }
    // dojo ring + painted lines
    g.strokeStyle = 'rgba(120,20,25,.8)'; g.lineWidth = 0.32 * k; g.beginPath(); g.arc(cx, cy, 5.2 * k, 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(255,245,230,.55)'; g.lineWidth = 0.14 * k; g.beginPath(); g.arc(cx, cy, 4.7 * k, 0, TAU); g.stroke();
    g.strokeRect(X(-HX + 0.5), Z(-HZ + 0.5), (2 * HX - 1) * k, (2 * HZ - 1) * k);
    g.fillStyle = 'rgba(200,40,50,.55)'; g.beginPath(); g.arc(cx, cy, 1.1 * k, 0, TAU); g.fill();
    for (const s of [-1, 1]) { g.strokeStyle = 'rgba(255,245,230,.4)'; g.beginPath(); g.moveTo(X(s * 0.0), Z(-HZ + 0.5)); g.lineTo(X(0), Z(HZ - 0.5)); g.stroke(); }
    // petals that landed
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,${170 + rng.next() * 50 | 0},${200 + rng.next() * 40 | 0},.85)`; g.beginPath(); g.ellipse(X(rng.range(-HX, HX)), Z(rng.range(-HZ, HZ)), 0.09 * k, 0.05 * k, rng.next() * 3, 0, TAU); g.fill(); }
  } else if (theme === 'gamer') {
    g.fillStyle = '#0d0a20'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(255,255,255,${rng.next() * 0.03})`; g.fillRect(rng.next() * W, rng.next() * H, 1 + rng.next() * 4, 1 + rng.next() * 3); }
    for (let x = -FW / 2; x <= FW / 2; x += 1) { g.strokeStyle = 'rgba(120,150,255,.09)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(x), 0); g.lineTo(X(x), H); g.stroke(); }
    for (let z = -FD / 2; z <= FD / 2; z += 1) { g.strokeStyle = 'rgba(120,150,255,.09)'; g.beginPath(); g.moveTo(0, Z(z)); g.lineTo(W, Z(z)); g.stroke(); }
    const neon = (ctx, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w * k; ctx.shadowColor = col; ctx.shadowBlur = 0.5 * k; };
    for (const ctx of [gl]) {
      neon(ctx, '#22d3ee', 0.16); ctx.strokeRect(X(-HX + 0.6), Z(-HZ + 0.6), (2 * HX - 1.2) * k, (2 * HZ - 1.2) * k);
      neon(ctx, '#ff2bd6', 0.18); ctx.beginPath(); ctx.arc(cx, cy, 4.6 * k, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(X(0), Z(-HZ + 0.6)); ctx.lineTo(X(0), Z(HZ - 0.6)); ctx.stroke();
      neon(ctx, '#ffe14d', 0.1); ctx.beginPath(); ctx.arc(cx, cy, 2.2 * k, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
      for (const [sx, sz] of [[-1, -1], [1, 1], [1, -1], [-1, 1]]) { ctx.strokeStyle = 'rgba(34,211,238,.5)'; ctx.lineWidth = 0.08 * k; ctx.strokeRect(X(sx * 14.6) - 1.4 * k, Z(sz * 8.6) - 1.4 * k, 2.8 * k, 2.8 * k); }
      ctx.fillStyle = '#ff2bd6'; ctx.font = `900 ${1.6 * k}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.85; ctx.fillText('BRAWL', cx, cy); ctx.globalAlpha = 1;
    }
    g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 0.16 * k; g.strokeRect(X(-HX + 0.6), Z(-HZ + 0.6), (2 * HX - 1.2) * k, (2 * HZ - 1.2) * k); g.beginPath(); g.arc(cx, cy, 4.6 * k, 0, TAU); g.stroke();
  } else {
    g.fillStyle = '#131c2c'; g.fillRect(0, 0, W, H);
    const s = 2.0, hh = s * 0.866;
    for (let row = -14; row < 14; row++) for (let col = -14; col < 14; col++) {
      const x = col * s * 1.5, z = row * hh + (col % 2 ? hh / 2 : 0); if (Math.abs(x) > FW / 2 + 2 || Math.abs(z) > FD / 2 + 2) continue;
      g.beginPath(); for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; g.lineTo(X(x) + Math.cos(an) * (s - 0.06) * k, Z(z) + Math.sin(an) * (s - 0.06) * k); } g.closePath();
      const t = rng.next(); g.fillStyle = `rgba(${100 + t * 60 | 0},${140 + t * 60 | 0},${190 + t * 50 | 0},${0.04 + t * 0.09})`; g.fill(); g.strokeStyle = 'rgba(110,170,230,.3)'; g.lineWidth = 1.6; g.stroke();
      if (rng.chance(0.05)) { gl.fillStyle = 'rgba(0,240,200,.16)'; gl.fill && gl.beginPath(); for (let i = 0; i < 6; i++) { const an = (i / 6) * TAU; gl.lineTo(X(x) + Math.cos(an) * (s - 0.25) * k, Z(z) + Math.sin(an) * (s - 0.25) * k); } gl.closePath(); gl.fill(); gl.strokeStyle = 'rgba(0,240,200,.7)'; gl.lineWidth = 0.05 * k; gl.stroke(); }
    }
    // conduits + landing pad marks
    for (const zz of [-6.8, 6.8]) { gl.strokeStyle = 'rgba(0,240,200,.75)'; gl.lineWidth = 0.1 * k; gl.beginPath(); gl.moveTo(X(-HX + 1), Z(zz)); gl.lineTo(X(-6), Z(zz)); gl.lineTo(X(-4.5), Z(zz * 0.6)); gl.lineTo(X(4.5), Z(zz * 0.6)); gl.lineTo(X(6), Z(zz)); gl.lineTo(X(HX - 1), Z(zz)); gl.stroke(); }
    gl.strokeStyle = '#00f0c8'; gl.lineWidth = 0.14 * k; gl.shadowColor = '#00f0c8'; gl.shadowBlur = 0.5 * k; gl.beginPath(); gl.arc(cx, cy, 4.4 * k, 0, TAU); gl.stroke(); gl.beginPath(); gl.arc(cx, cy, 3.0 * k, 0, TAU); gl.stroke(); gl.shadowBlur = 0;
    gl.fillStyle = 'rgba(0,240,200,.9)'; gl.font = `900 ${2.4 * k}px sans-serif`; gl.textAlign = 'center'; gl.textBaseline = 'middle'; gl.fillText('H', cx, cy);
    g.strokeStyle = 'rgba(180,220,255,.3)'; g.lineWidth = 0.1 * k; g.beginPath(); g.arc(cx, cy, 4.4 * k, 0, TAU); g.stroke();
    // hazard band along the walls
    g.save(); g.beginPath(); g.rect(X(-HX), Z(-HZ), 2 * HX * k, 2 * HZ * k); g.rect(X(-HX + 0.9), Z(-HZ + 0.9), (2 * HX - 1.8) * k, (2 * HZ - 1.8) * k); g.clip('evenodd'); g.fillStyle = '#1c1a20'; g.fillRect(0, 0, W, H); g.fillStyle = '#ff8a1c'; for (let i = -H; i < W + H; i += 0.9 * k) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 0.45 * k, 0); g.lineTo(i + 0.45 * k - H, H); g.lineTo(i - H, H); g.fill(); } g.restore();
  }
  const ta = new THREE.CanvasTexture(a), tg = new THREE.CanvasTexture(e);
  ta.colorSpace = tg.colorSpace = THREE.SRGBColorSpace; ta.anisotropy = tg.anisotropy = 8;
  return { albedo: ta, glow: tg };
}

// ------------------------------------------------------------------------------------------------ arena
export class BrawlArena {
  constructor({ engine, scene, fx, theme, map, camera }) {
    this.engine = engine; this.scene = scene; this.fx = fx; this.theme = theme; this.map = map; this.camera = camera; this.T = THEMES[theme];
    this.anims = []; this.rng = new Rng(31); this.q = engine.cfg.detail; this.wallMesh = new Map(); this.mats = {};
    this.build();
  }

  build() {
    const { scene, T, engine, theme } = this;
    scene.fog = new THREE.FogExp2(T.fog[0], T.fog[1]); scene.background = C(T.bg);
    this.sky = skyDome({ ...T.sky }); scene.add(this.sky.mesh); this.anims.push((t) => this.sky.update(t));
    engine.setEnvironment(scene, T.env); engine.setGrade(T.grade); engine.setBloom(...T.bloom);
    scene.add(new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]));
    const sun = this.sun = new THREE.DirectionalLight(T.sun.color, T.sun.i); sun.position.copy(new THREE.Vector3(...T.sun.dir).normalize().multiplyScalar(60)); sun.castShadow = true;
    const sc = sun.shadow.camera; sc.left = -26; sc.right = 26; sc.top = 20; sc.bottom = -20; sc.near = 15; sc.far = 130; sc.updateProjectionMatrix(); scene.add(sun, sun.target); engine.tuneLight(sun);
    const fill = new THREE.DirectionalLight(T.fill[0], T.fill[1]); fill.position.set(...T.fill[2]).multiplyScalar(40); scene.add(fill);
    this.buildMaterials();
    // floor
    const FW = 2 * HX + 14, FD = 2 * HZ + 12, { albedo, glow } = paintFloor(theme, FW, FD);
    const nm = procTex(theme === 'anime' ? 'wood' : theme === 'gamer' ? 'concrete' : 'metal', { repeat: [8, 6], bump: 2, size: 256 }).normalMap;
    const fm = new THREE.MeshStandardMaterial({ map: albedo, normalMap: nm, normalScale: new THREE.Vector2(0.45, 0.45), roughness: theme === 'anime' ? 0.72 : 0.38, metalness: theme === 'anime' ? 0 : 0.4, envMapIntensity: theme === 'anime' ? 0.3 : 0.9 });
    if (theme !== 'anime') { fm.emissiveMap = glow; fm.emissive = C(0xffffff); fm.emissiveIntensity = theme === 'gamer' ? 1.1 : 0.9; }
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(FW, FD), fm); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    this.buildWalls();
    this['decor_' + theme]();
  }

  buildMaterials() {
    const { theme } = this, M = this.mats;
    if (theme === 'anime') {
      M.crate = pbr('wood', { base: 0xf2bd7a, dark: 0xb57a3c, planks: 4, rough: 0.85, tint: 0xfff0dc }); M.frame = pbr('wood', { base: 0xb4824c, dark: 0x6a4020, planks: 2, rough: 0.8 });
      M.hard = pbr('stone', { base: 0xa9a293, repeat: [1, 1], rough: 0.9 }); M.soft = pbr('plaster', { base: 0xf1e6cf, rough: 0.9 }); M.rim = pbr('plaster', { base: 0xf6efe0, rough: 0.9 });
      M.debris = [0xc08850, 0x8a5a30, 0x5a3820]; M.wallDebris = [0xf1e6cf, 0xd8c8a8, 0x8a6a48];
    } else if (theme === 'gamer') {
      M.crate = pbr('metal', { base: 0x6a6aa0, rough: 0.5, metal: 0.3 }); M.frame = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x22d3ee, emissiveIntensity: 1.6 });
      M.hard = pbr('concrete', { base: 0x7a6ab0, rough: 0.55, metal: 0.15 }); M.soft = pbr('metal', { base: 0xa05ac8, rough: 0.45, metal: 0.3 }); M.rim = pbr('concrete', { base: 0x5a4a88, rough: 0.55, metal: 0.2 });
      M.debris = [0x2a2a44, 0x22d3ee, 0x55558a]; M.wallDebris = [0x4a2a6a, 0xff2bd6, 0x3a3358];
    } else {
      M.crate = pbr('metal', { base: 0xaab4c8, rough: 0.5, metal: 0.4 }); M.frame = pbr('metal', { base: 0xd8a23a, rough: 0.5, metal: 0.5 });
      M.hard = pbr('metal', { base: 0x8a9ab4, rough: 0.5, metal: 0.35 }); M.soft = pbr('concrete', { base: 0xc0c8d4, rough: 0.7, metal: 0.15 }); M.rim = pbr('metal', { base: 0x7a8aa4, rough: 0.5, metal: 0.35 });
      M.debris = [0x8a95a8, 0xd8a23a, 0x5a667a]; M.wallDebris = [0x9aa4b4, 0x5a667a, 0x394456];
    }
    M.barrel = pbr('metal', { base: 0xd02a2a, rough: 0.5, metal: 0.15, emissive: 0x2a0404, ei: 1 }); M.barrel.envMapIntensity = 0.5; M.band = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc21a, emissiveIntensity: 0.7, roughness: 0.5 });
    // instanced prop geometry
    const frame = []; const t = 0.09;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { frame.push(new THREE.BoxGeometry(t, 1.02, t).translate(sx * 0.5, 0, sz * 0.5)); for (const sy of [-1, 1]) { frame.push(new THREE.BoxGeometry(1.02, t, t).translate(0, sy * 0.5, sz * 0.5)); frame.push(new THREE.BoxGeometry(t, t, 1.02).translate(sx * 0.5, sy * 0.5, 0)); } }
    this.crateGeo = mergeGeometries([box(1, 1, 1, 1), mergeGeometries(frame)], true);
    const prof = [[0, -0.55], [0.4, -0.55], [0.45, -0.5], [0.46, -0.3], [0.45, -0.28], [0.44, -0.2], [0.45, -0.18], [0.46, 0.0], [0.45, 0.18], [0.44, 0.2], [0.45, 0.28], [0.46, 0.3], [0.45, 0.5], [0.4, 0.55], [0, 0.55]].map(([x, y]) => new THREE.Vector2(x, y));
    const lid = new THREE.CylinderGeometry(0.4, 0.4, 0.04, 20).translate(0, 0.545, 0), body = mergeGeometries([new THREE.LatheGeometry(prof, 20), lid]);
    const bands = mergeGeometries([new THREE.CylinderGeometry(0.466, 0.466, 0.07, 20, 1, true).translate(0, 0.0, 0), new THREE.CylinderGeometry(0.462, 0.462, 0.05, 20, 1, true).translate(0, 0.38, 0), new THREE.CylinderGeometry(0.462, 0.462, 0.05, 20, 1, true).translate(0, -0.38, 0)]);
    this.barrelGeo = mergeGeometries([body, bands], true);
  }

  buildWalls() {
    const { scene, map, mats, theme, T } = this, capM = theme === 'anime' ? new THREE.MeshStandardMaterial({ color: 0x35435f, roughness: 0.55 }) : new THREE.MeshStandardMaterial({ color: 0x14121e, roughness: 0.4, metalness: 0.8 });
    const glowM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: T.accent, emissiveIntensity: 1.5 });
    const addBox = (x, z, w, d, h, mat, capOverhang) => {
      const m = new THREE.Mesh(box(w, h, d, 0.5), mat); m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
      if (capOverhang != null) {
        if (theme === 'anime') { const ch = 0.22, cap = new THREE.Mesh(new THREE.BoxGeometry(w + capOverhang, ch, d + capOverhang), capM); cap.position.set(x, h + ch / 2, z); cap.castShadow = true; scene.add(cap); m.userData.cap = cap; }
        else { const band = new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, 0.07, d + 0.03), glowM); band.position.set(x, h - 0.25, z); scene.add(band); m.userData.band = band; }
      }
      return m;
    };
    // perimeter (tall enough to read as a wall, low enough to see over)
    const ph = 2.6;
    addBox(0, -HZ - 0.5, 2 * HX + 2, 1, ph, mats.rim, 0.3); addBox(0, HZ + 0.5, 2 * HX + 2, 1, 1.5, mats.rim, 0.3);
    addBox(-HX - 0.5, 0, 1, 2 * HZ, ph, mats.rim, 0.3); addBox(HX + 0.5, 0, 1, 2 * HZ, ph, mats.rim, 0.3);
    for (const w of map.walls) {
      const m = addBox(w.x, w.z, w.w, w.d, w.h, w.hard ? mats.hard : mats.soft.clone(), w.hard ? 0.18 : 0.12);
      m.userData.max = w.hp; m.userData.hard = w.hard; this.wallMesh.set(w.id, m);
    }
  }

  // ---------------------------------------------------------------------------------------------- scenery
  decor_anime() {
    const { scene, rng, q } = this;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), pbr('grass', { base: 0x63b04e, repeat: [90, 90], rough: 0.95, normal: 0.7 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; ground.receiveShadow = true; scene.add(ground);
    // stone path ring + lanterns
    const lantern = new THREE.Group(); const stone = pbr('stone', { base: 0xa9a293 });
    const lp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), stone); lp.position.y = 0.45;
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffa64d, emissiveIntensity: 2.4 })); lb.position.y = 1.15;
    const lc = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.4, 4), stone); lc.position.y = 1.62; lc.rotation.y = Math.PI / 4; lantern.add(lp, lb, lc);
    const spots = []; for (let x = -HX - 2; x <= HX + 2; x += 5.6) spots.push([x, -HZ - 2]); for (let z = -HZ + 2; z <= HZ - 2; z += 5.4) { spots.push([-HX - 2, z]); spots.push([HX + 2, z]); }
    for (const [x, z] of spots) { const l = lantern.clone(); l.position.set(x, 0, z); l.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(l); }
    // trees ring: far side and flanks (the near side stays clear of the camera view)
    const nTrees = Math.floor(26 * Math.max(0.5, q));
    for (let i = 0; i < nTrees; i++) {
      const a = rng.range(-2.9, -0.25) + (i % 3 === 0 ? Math.PI + 0.3 : 0), r = rng.range(HX + 5, HX + 26); let x = Math.cos(a) * r * 1.15, z = Math.sin(a) * r * 0.9;
      if (z > HZ + 3 && Math.abs(x) < HX + 3) z = -z; if (Math.abs(x) < HX + 3 && Math.abs(z) < HZ + 3) continue;
      const t = i % 4 === 3 ? pineTree(rng, rng.range(1.2, 1.9), 0x2f6b3f, true) : sakuraTree(rng, rng.range(1.5, 2.4)); t.position.set(x, 0, z); t.rotation.y = rng.next() * TAU; scene.add(t);
    }
    // houses with curved tile roofs
    const wallM = pbr('plaster', { base: 0xf1e6cf }), roofM = new THREE.MeshStandardMaterial({ color: 0x3a4a6a, roughness: 0.55 });
    for (let i = 0; i < 12; i++) {
      const a = rng.range(-3.0, -0.15), r = rng.range(HX + 12, HX + 40), x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.85, w = rng.range(4, 7), d = rng.range(4, 6), h = rng.range(2.6, 3.6);
      const g = new THREE.Group(), body = new THREE.Mesh(box(w, h, d, 0.4), wallM); body.position.y = h / 2; body.castShadow = true;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.78, 2.1, 4), roofM); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.position.y = h + 1.0; roof.castShadow = true; g.add(body, roof); g.position.set(x, 0, z); g.rotation.y = rng.range(-0.3, 0.3); scene.add(g);
    }
    // torii gate + pagoda on the horizon
    const red = new THREE.MeshStandardMaterial({ color: 0xd63a2f, roughness: 0.55 }), dark = new THREE.MeshStandardMaterial({ color: 0x1d1a20, roughness: 0.6 });
    const torii = new THREE.Group(); for (const x of [-2, 2]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.38, 6.4, 10), red); p.position.set(x, 3.2, 0); p.castShadow = true; torii.add(p); }
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.5, 0.8), dark); b1.position.y = 6.7; const b2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.36, 0.5), red); b2.position.y = 5.5; b1.castShadow = b2.castShadow = true; torii.add(b1, b2); torii.position.set(0, 0, -HZ - 8); scene.add(torii);
    const pagoda = new THREE.Group(); for (let i = 0; i < 5; i++) { const w = 6 - i * 0.85, body = new THREE.Mesh(new THREE.BoxGeometry(w, 2, w), wallM), roof = new THREE.Mesh(new THREE.ConeGeometry(w * 1.1, 1.4, 4), roofM); roof.rotation.y = Math.PI / 4; body.position.y = 1.3 + i * 3; roof.position.y = 2.9 + i * 3; body.castShadow = roof.castShadow = true; pagoda.add(body, roof); }
    pagoda.position.set(-24, 0, -HZ - 26); scene.add(pagoda);
    const hills = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12, 0, TAU, 0, Math.PI / 2), pbr('grass', { base: 0x5aa048, repeat: [12, 12], rough: 0.95 })); hills.scale.set(2.2, 0.35, 1); hills.position.set(0, -6, -120); scene.add(hills);
    const clouds = cloudSea({ y: 22, count: Math.floor(14 * Math.max(0.5, q)), r0: 60, r1: 200, color: 0xffffff, opacity: 0.55, size: [40, 90], spread: 6, seed: 9 }); scene.add(clouds.group); this.anims.push((t) => clouds.update(t));
    // falling petals + birds
    this.anims.push((t, dt) => { if (Math.random() < dt * 45 * q) this.fx.emit({ p: [(Math.random() - 0.5) * 60, 12 + Math.random() * 4, (Math.random() - 0.5) * 36], n: 1, v: [1.2, -1.0, 0.3], vr: [0.5, 0.3, 0.5], life: 8, size: 0.2, color: [0xffb7d5, 0xffc9de, 0xff9ec4][Math.random() * 3 | 0], alpha: 0.95, alpha1: 0.9, g: -0.05, drag: 0.4, spin: 3, frame: SPRITE.PETAL, floor: 0.05 }); });
  }

  decor_gamer() {
    const { scene, rng, q } = this;
    const under = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshStandardMaterial({ color: 0x0b0818, roughness: 0.25, metalness: 0.8 })); under.rotation.x = -Math.PI / 2; under.position.y = -0.1; under.receiveShadow = true; scene.add(under);
    // tiered crowd stands on three sides with instanced spectators bobbing to the beat
    const stepM = pbr('concrete', { base: 0x2a2444, rough: 0.7, metal: 0.3 }), crowdN = Math.floor(900 * q);
    const person = new THREE.CapsuleGeometry(0.22, 0.42, 3, 8); person.translate(0, 0.45, 0);
    const pm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), tu = { time: { value: 0 } };
    pm.onBeforeCompile = (sh) => { sh.uniforms.uTime = tu.time; sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\nfloat ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 2.3;\ntransformed.y += abs(sin(uTime * 4.0 + ph)) * 0.28;\ntransformed.x += sin(uTime * 2.0 + ph) * 0.05;\n#endif'); }; pm.customProgramCacheKey = () => 'crowd';
    const crowd = new THREE.InstancedMesh(person, pm, crowdN), m4 = new THREE.Matrix4(), col = new THREE.Color(); let ci = 0;
    const cols = [0xff4d6d, 0x22d3ee, 0xffe14d, 0x7dff6b, 0xc77dff, 0xffffff, 0xff9a3c];
    const stand = (cx, cz, rot, w) => {
      const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rot; scene.add(g); g.updateMatrixWorld(true);
      for (let r = 0; r < 6; r++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(w, 0.9 + r * 0.9, 1.7), stepM); st.position.set(0, (0.9 + r * 0.9) / 2, -r * 1.7); st.castShadow = true; st.receiveShadow = true; g.add(st);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.08), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: r % 2 ? 0xff2bd6 : 0x22d3ee, emissiveIntensity: 2.4 })); strip.position.set(0, 0.9 + r * 0.9 + 0.03, -r * 1.7 + 0.8); g.add(strip);
        for (let x = -w / 2 + 0.6; x < w / 2 - 0.4 && ci < crowdN; x += 0.7) {
          if (rng.chance(0.12)) continue;
          const v = new THREE.Vector3(x + rng.range(-0.1, 0.1), 0.9 + r * 0.9, -r * 1.7 + rng.range(-0.3, 0.3)).applyMatrix4(g.matrixWorld);
          m4.compose(v, new THREE.Quaternion(), new THREE.Vector3(1, rng.range(0.9, 1.15), 1)); crowd.setMatrixAt(ci, m4); col.setHex(cols[rng.int(0, 6)]).multiplyScalar(0.9); crowd.setColorAt(ci, col); ci++;
        }
      }
      const panel = new THREE.Mesh(new THREE.BoxGeometry(w, 4, 0.5), new THREE.MeshStandardMaterial({ color: 0x0c0818, roughness: 0.3, metalness: 0.8 })); panel.position.set(0, 4, -11); g.add(panel);
    };
    stand(0, -HZ - 3.2, 0, 44); stand(-HX - 3.5, 0, Math.PI / 2, 30); stand(HX + 3.5, 0, -Math.PI / 2, 30);
    crowd.count = ci; crowd.instanceMatrix.needsUpdate = true; crowd.castShadow = true; scene.add(crowd); this.anims.push((t) => { tu.time.value = t; });
    // equaliser video wall above the far stand + scoreboard-style trusses with sweeping beams
    const eq = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 } }, fog: false, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `varying vec2 vUv; uniform float time; float h(float x){ return fract(sin(x * 91.7) * 4375.5); }
        void main(){ float bars = 34.; float id = floor(vUv.x * bars); float fx = fract(vUv.x * bars); float lvl = .2 + .7 * (.5 + .5 * sin(time * (2. + h(id) * 4.) + h(id) * 30.));
          float on = step(vUv.y, lvl) * step(.12, fx) * step(fx, .88) * step(.08, fract(vUv.y * 24.)); vec3 c = mix(vec3(.15, .9, 1.), vec3(1., .16, .8), vUv.y); c = mix(c, vec3(1., .9, .3), smoothstep(.75, 1., vUv.y));
          gl_FragColor = vec4(c * on * 1.5 + vec3(.02, .01, .05), 1.); }` });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(32, 7), eq); screen.position.set(0, 12.5, -HZ - 14.5); scene.add(screen); this.anims.push((t) => { eq.uniforms.time.value = t; });
    const beams = []; for (let i = 0; i < 6; i++) { const b = lightBeam({ color: i % 2 ? 0xff2bd6 : 0x22d3ee, len: 45, r: 2.6, opacity: 0.08 }); b.position.set(-15 + i * 6, 14, -HZ - 6); scene.add(b); beams.push([b, i]); }
    this.anims.push((t) => { for (const [b, i] of beams) { b.rotation.set(Math.PI + Math.sin(t * 0.8 + i) * 0.5, 0, Math.cos(t * 0.7 + i * 1.6) * 0.6); } });
    // neon towers in the far skyline
    const nm = [0xff2bd6, 0x22d3ee, 0xffe14d].map((c) => new THREE.MeshStandardMaterial({ color: 0x0c0818, emissive: c, emissiveIntensity: 1.6, roughness: 0.4 }));
    for (let i = 0; i < 26; i++) { const w = rng.range(3, 7), h = rng.range(10, 34), x = rng.range(-90, 90), z = rng.range(-95, -50); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshStandardMaterial({ color: 0x120a2a, roughness: 0.5, metalness: 0.6 })); m.position.set(x, h / 2 - 2, z); scene.add(m); const strip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.4, w + 0.1), nm[i % 3]); strip.position.set(x, h - 2, z); scene.add(strip); }
    const mts = mountainRing({ radius: 190, count: 26, hMin: 20, hMax: 60, color: 0x1a0836, edge: 0xff2bd6 }); mts.position.y = -6; scene.add(mts);
    // hovering neon shapes + rim glow sprites
    const mats = [0xff2bd6, 0x22d3ee, 0xffe14d].map((c) => new THREE.MeshStandardMaterial({ color: 0x120a24, emissive: c, emissiveIntensity: 1.9, roughness: 0.3, metalness: 0.5 })), geos = [new THREE.OctahedronGeometry(1.2), new THREE.TorusGeometry(1.1, 0.28, 10, 24), new THREE.IcosahedronGeometry(1.1, 0)], sh = [];
    for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(geos[i % 3], mats[i % 3]); m.position.set(rng.range(-30, 30), rng.range(9, 20), rng.range(-40, -22)); m.userData = { y0: m.position.y, ph: rng.next() * 6, s: rng.range(0.2, 0.8) }; scene.add(m); sh.push(m); }
    this.anims.push((t) => { for (const m of sh) { m.rotation.x = t * m.userData.s; m.rotation.y = t * m.userData.s * 0.7; m.position.y = m.userData.y0 + Math.sin(t + m.userData.ph) * 0.6; } });
  }

  decor_tech() {
    const { scene, rng, q } = this;
    // outer deck ring + machinery, then open space with a planet below
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(120, 80), pbr('metal', { base: 0x27334a, repeat: [30, 20], rough: 0.5, metal: 0.8 })); deck.rotation.x = -Math.PI / 2; deck.position.y = -0.06; deck.receiveShadow = true; scene.add(deck);
    const pl = planet({ radius: 110, colors: ['#0b1d3a', '#1f5fa0', '#6fb6ff', '#e6f3ff', '#1f5fa0'], atmosphere: 0x69c8ff, seed: 6, city: true }); pl.group.position.set(40, -150, -170); pl.group.rotation.set(0.3, 0, 0.2); scene.add(pl.group); this.anims.push((t) => { pl.body.rotation.y = t * 0.01; });
    for (const [c, x, y, z, s] of [[0xff2bd6, -160, 20, -240, 260], [0x2a8bff, 170, 10, -260, 300], [0x00f0c8, -230, -60, -80, 200]]) { const sp = glowSprite(c, s, 0.3); sp.position.set(x, y, z); scene.add(sp); }
    // cargo tanks, pipes, gantry
    const tankM = pbr('metal', { base: 0x8f9bb0, rough: 0.35, metal: 0.85 }), pipeM = pbr('metal', { base: 0x5a667a, rough: 0.5, metal: 0.85 }), glowM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x00f0c8, emissiveIntensity: 2.2 }), warnM = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xff6a1a, emissiveIntensity: 2.4 });
    for (let i = 0; i < 9; i++) { const x = -HX - 4 + (i % 3) * 0 + (i < 3 ? 0 : i < 6 ? (i - 3) * 9 - 9 : HX * 2 + 8), z = i < 3 ? (i - 1) * 9 : i < 6 ? -HZ - 5 - (i % 2) * 3 : (i - 7) * 8; const r = rng.range(1.4, 2.4), h = rng.range(4, 8); const tank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), tankM); tank.position.set(x, h / 2, z); tank.castShadow = true; scene.add(tank); const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.02, 0.07, 6, 28), glowM); ring.rotation.x = Math.PI / 2; ring.position.set(x, h * 0.7, z); scene.add(ring); const lamp = glowSprite(0x00f0c8, 2.6, 0.55); lamp.position.set(x, h * 0.7, z); scene.add(lamp); }
    for (let i = 0; i < 14; i++) { const x = rng.range(-40, 40), z = rng.range(-36, -HZ - 3), pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, rng.range(8, 26), 10), pipeM); pipe.rotation.z = Math.PI / 2; pipe.position.set(x, rng.range(1, 9), z); pipe.castShadow = true; scene.add(pipe); }
    const gantry = new THREE.Group(); for (const x of [-9, 9]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.8, 14, 0.8), pipeM); leg.position.set(x, 7, 0); leg.castShadow = true; gantry.add(leg); } const beam = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 1.4), pipeM); beam.position.y = 14; beam.castShadow = true; gantry.add(beam); const hook = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), warnM); hook.position.set(0, 12, 0); gantry.add(hook); gantry.position.set(0, 0, -HZ - 9); scene.add(gantry); this.anims.push((t) => { hook.position.x = Math.sin(t * 0.4) * 7; });
    // landing lights along the deck edge + blinking beacons
    const lamps = []; for (let i = 0; i < 18; i++) { const x = -HX - 1 + (i / 17) * (2 * HX + 2), s = glowSprite(i % 2 ? 0x00f0c8 : 0xff6a1a, 1.6, 0.8); s.position.set(x, 0.3, HZ + 3.0); scene.add(s); lamps.push(s); }
    this.anims.push((t) => { lamps.forEach((s, i) => { s.material.opacity = 0.35 + 0.65 * Math.max(0, Math.sin(t * 3 - i * 0.5)); }); });
    // patrol drones
    const drones = [], dm = new THREE.MeshStandardMaterial({ color: 0x9aa6ba, roughness: 0.3, metalness: 0.9 });
    for (let i = 0; i < 6; i++) { const g = new THREE.Group(), eye = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), glowM); eye.position.set(0, -0.1, 0.55); g.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.4, 1.0), dm), eye); g.userData = { a: rng.next() * TAU, R: rng.range(24, 44), y: rng.range(5, 13), sp: rng.range(0.1, 0.2) * (i % 2 ? 1 : -1) }; scene.add(g); drones.push(g); }
    this.anims.push((t) => { for (const d of drones) { const u = d.userData, a = u.a + t * u.sp; d.position.set(Math.cos(a) * u.R, u.y + Math.sin(t + u.a) * 0.5, Math.sin(a) * u.R * 0.7 - 6); d.rotation.y = -a; } });
  }

  update(t, dt) { for (const f of this.anims) f(t, dt); }
  dispose() { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose?.(); }); if (this.scene.userData.envRT) this.scene.userData.envRT.dispose(); this.engine.untuneLight(this.sun); }
}
