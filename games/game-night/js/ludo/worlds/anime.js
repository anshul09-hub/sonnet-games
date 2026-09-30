// Anime meadow world: cel-shaded meadow with swaying grass, cherry-blossom trees, villagers who watch and cheer,
// birds, drifting clouds, a river and snowy mountains. Variants: day, sunset, moonlit.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { toon, addOutline, outlineAll, canvasTex } from '../../core/toon.js';
import { Rng, TAU, lerp, clamp, damp, wrapAngle, shade } from '../../core/util.js';
import { SPRITE } from '../../core/fx.js';
import { buildVillageProps } from './anime-props.js';

const GROUND_Y = -0.61;
export const ANIME_VARIANTS = {
  meadow: { top: 0x3f9bff, mid: 0x8fd0ff, horizon: 0xdff4ff, fog: 0xcdeaff, sun: 0xfff4d6, sunI: 2.6, sunDir: [-0.55, 1, 0.7], hemiSky: 0xbfe3ff, hemiGround: 0x7fb069, hemiI: 0.9, exposure: 1.0, grassA: 0x3f9d48, grassB: 0xb9ef7a, ground: 0x6fbf5a, water: [0x3aa8e8, 0x9fe4ff], cloud: 0xffffff, night: false, sunset: false },
  sunset: { top: 0x3a2a7a, mid: 0xc25fa0, horizon: 0xffb56b, fog: 0xf2a877, sun: 0xffa85a, sunI: 2.8, sunDir: [-1.1, 0.42, 0.55], hemiSky: 0xffb08a, hemiGround: 0x6a5a7a, hemiI: 0.8, exposure: 1.0, grassA: 0x3a7a48, grassB: 0xd9d97a, ground: 0x5a9a58, water: [0xd9628a, 0xffc98a], cloud: 0xffd0b0, night: false, sunset: true },
  moonlit: { top: 0x040a2a, mid: 0x1a2a6a, horizon: 0x4a5aa0, fog: 0x1a2660, sun: 0xa9c4ff, sunI: 1.9, sunDir: [0.6, 1, 0.5], hemiSky: 0x4a63c0, hemiGround: 0x1a2a4a, hemiI: 0.9, exposure: 1.1, grassA: 0x1f4a4a, grassB: 0x6ad0b0, ground: 0x24506a, water: [0x1a2a7a, 0x6a8ae0], cloud: 0x7a8ac0, night: true, sunset: false },
};

const HAIR = [0x2b2118, 0x5a3a1e, 0xe8c16a, 0x4a6fd0, 0xff8fb6, 0xa88fe0, 0xd9d9e8, 0x2fa89a];
const CLOTH = [0xe63946, 0x3a86ff, 0xffb703, 0x2a9d8f, 0xb5179e, 0xf28482, 0x6a994e, 0xfb8500, 0x9d4edd, 0x4cc9f0];
const SKINS = [0xf6d3b8, 0xf2c9a5, 0xe6b48f, 0xd9a07a];

function skyMaterial(v) {
  const c = (h) => new THREE.Color(h);
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: c(v.top) }, uMid: { value: c(v.mid) }, uHor: { value: c(v.horizon) }, uSunDir: { value: new THREE.Vector3(...v.sunDir).normalize() }, uSun: { value: c(v.sun) }, uNight: { value: v.night ? 1 : 0 }, uSet: { value: v.sunset ? 1 : 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 uTop,uMid,uHor,uSunDir,uSun; uniform float uNight,uSet;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      void main(){
        float y = clamp(vP.y, -0.1, 1.0);
        vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.28, y)); col = mix(col, uTop, smoothstep(0.25, 0.85, y));
        float sd = max(dot(normalize(vP), uSunDir), 0.0);
        col += uSun * (pow(sd, 900.0) * 3.0 + pow(sd, 18.0) * (uNight > .5 ? 0.15 : 0.34) + pow(sd, 3.0) * (uSet > .5 ? 0.38 : 0.06));
        if (uNight > .5) { vec2 g = floor(vP.xz / max(vP.y+0.2,0.15) * 60.0); float s = step(0.9972, h21(g)) * smoothstep(0.1,0.5,y); col += vec3(s); }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function bladeGeometry() {
  // 3-segment tapered blade, height 1, base width .09; y in 0..1 drives the sway
  const pos = [], col = [], idx = [];
  const segs = 3, cA = new THREE.Color(0x3a8a3c), cB = new THREE.Color(0xffffff);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, w = 0.05 * (1 - t * t) + 0.002, bend = t * t * 0.12;
    pos.push(-w, t, bend, w, t, bend);
    const c = cA.clone().lerp(cB, t * 0.9); col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

function cloudGroup(rng, color) {
  const g = new THREE.Group(), n = 5 + Math.floor(rng.next() * 4), mat = toon(color, { steps: 3 });
  for (let i = 0; i < n; i++) { const r = 2.2 + rng.next() * 2.4; const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat); m.position.set((i - n / 2) * 2.6 + rng.range(-1, 1), rng.range(-0.5, 1) + (1 - Math.abs(i - n / 2) / n) * 1.6, rng.range(-1.5, 1.5)); m.scale.y = 0.7; g.add(m); }
  return g;
}

function blossomTree(rng, detailScale) {
  const g = new THREE.Group();
  const trunkPts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(rng.range(-0.5, 0.5), 1.8, rng.range(-0.3, 0.3)), new THREE.Vector3(rng.range(-0.9, 0.9), 3.6, rng.range(-0.6, 0.6)), new THREE.Vector3(rng.range(-0.6, 0.6), 5.0, rng.range(-0.5, 0.5))];
  const curve = new THREE.CatmullRomCurve3(trunkPts);
  const trunkGeos = [new THREE.TubeGeometry(curve, 10, 0.34, 8, false)];
  const canopy = [];
  const top = trunkPts[3];
  for (let i = 0; i < 4; i++) {
    const a = rng.next() * TAU, len = rng.range(1.6, 2.6);
    const p0 = curve.getPoint(rng.range(0.45, 0.85)), p1 = p0.clone().add(new THREE.Vector3(Math.cos(a) * len * 0.5, rng.range(0.3, 0.9), Math.sin(a) * len * 0.5)), p2 = p0.clone().add(new THREE.Vector3(Math.cos(a) * len, rng.range(0.9, 1.6), Math.sin(a) * len));
    trunkGeos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([p0, p1, p2]), 6, 0.13, 6, false)); canopy.push(p2);
  }
  canopy.push(top.clone());
  const trunk = new THREE.Mesh(mergeGeometries(trunkGeos), toon(0x7a4f36)); trunk.castShadow = true; g.add(trunk);
  const cols = [0xffc2dc, 0xffa6cb, 0xffd6e8, 0xff8fbd, 0xffe2ef];
  const blobs = [];
  const blobCount = Math.max(6, Math.round(14 * detailScale));
  for (let i = 0; i < blobCount; i++) {
    const c = canopy[i % canopy.length];
    const geo = new THREE.IcosahedronGeometry(rng.range(1.0, 1.9), 1);
    geo.translate(c.x + rng.range(-1.3, 1.3), c.y + rng.range(-0.2, 1.4), c.z + rng.range(-1.3, 1.3));
    const colr = new THREE.Color(cols[Math.floor(rng.next() * cols.length)]); const arr = new Float32Array(geo.attributes.position.count * 3);
    for (let k = 0; k < arr.length; k += 3) { arr[k] = colr.r; arr[k + 1] = colr.g; arr[k + 2] = colr.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); geo.deleteAttribute('uv'); blobs.push(geo);
  }
  const foliageMat = toon(0xffffff, { vertexColors: true, flat: true }).clone(); foliageMat.transparent = true;
  const foliage = new THREE.Mesh(mergeGeometries(blobs), foliageMat); foliage.castShadow = true; g.add(foliage); g.userData.foliage = foliage;
  g.userData.canopy = canopy;
  return g;
}

/** A small anime villager: chibi proportions, hair styles, outfits, walk cycle, cheer pose. */
function makeVillager(rng) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const cloth = CLOTH[Math.floor(rng.next() * CLOTH.length)], cloth2 = CLOTH[Math.floor(rng.next() * CLOTH.length)], hair = HAIR[Math.floor(rng.next() * HAIR.length)], skin = SKINS[Math.floor(rng.next() * SKINS.length)];
  const M = (c) => toon(c);
  const add = (geo, mat, p, parent = body, r, s) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); if (s) m.scale.set(...s); m.castShadow = true; parent.add(m); return m; };
  const legs = [-1, 1].map((s) => { const l = new THREE.Group(); l.position.set(s * 0.14, 0.62, 0); body.add(l); add(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), M(0x2b2a3a), [0, -0.28, 0], l); add(new THREE.BoxGeometry(0.16, 0.08, 0.26), M(0x5a3a26), [0, -0.52, 0.04], l); return l; });
  const dressy = rng.next() < 0.5;
  add(dressy ? new THREE.ConeGeometry(0.42, 0.85, 14) : new THREE.CylinderGeometry(0.26, 0.34, 0.75, 14), M(cloth), [0, 0.98, 0]);
  add(new THREE.TorusGeometry(0.29, 0.06, 8, 18), M(cloth2), [0, 1.08, 0], body, [Math.PI / 2, 0, 0]);
  add(new THREE.BoxGeometry(0.16, 0.2, 0.06), M(cloth2), [0, 1.05, -0.3]);
  const arms = [-1, 1].map((s) => { const a = new THREE.Group(); a.position.set(s * 0.32, 1.32, 0); body.add(a); add(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), M(cloth), [0, -0.2, 0], a); add(new THREE.SphereGeometry(0.075, 10, 8), M(skin), [0, -0.42, 0], a); a.rotation.z = s * 0.25; return a; });
  const head = new THREE.Group(); head.position.set(0, 1.62, 0); body.add(head);
  add(new THREE.SphereGeometry(0.34, 22, 16), M(skin), [0, 0, 0], head);
  add(new THREE.SphereGeometry(0.365, 22, 16, 0, TAU, 0, Math.PI * 0.55), M(hair), [0, 0.03, -0.02], head, [-0.25, 0, 0]);
  const style = Math.floor(rng.next() * 4);
  if (style === 0) for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.11, 10, 8), M(hair), [s * 0.28, 0.2, -0.12], head);
  if (style === 1) add(new THREE.CapsuleGeometry(0.09, 0.4, 4, 8), M(hair), [0, -0.12, -0.34], head, [0.2, 0, 0]);
  if (style === 2) { add(new THREE.SphereGeometry(0.12, 10, 8), M(hair), [0, 0.38, -0.05], head); }
  if (style === 3) add(new THREE.ConeGeometry(0.2, 0.34, 8), M(hair), [0, 0.42, -0.02], head, [-0.4, 0, 0]);
  if (rng.next() < 0.3) { add(new THREE.CylinderGeometry(0.03, 0.5, 0.2, 18), M(0xe8cf8a), [0, 0.3, 0], head); }
  else if (rng.next() < 0.3) add(new THREE.TorusGeometry(0.34, 0.035, 6, 20), M(cloth2), [0, 0.12, 0], head, [Math.PI / 2 - 0.15, 0, 0]);
  for (const s of [-1, 1]) { add(new THREE.SphereGeometry(0.06, 10, 8), M(0x1a1224), [s * 0.12, -0.02, 0.31], head, null, [1, 1.35, 0.6]); add(new THREE.SphereGeometry(0.02, 6, 6), M(0xffffff), [s * 0.12 + 0.02, 0.02, 0.335], head); add(new THREE.CircleGeometry(0.05, 10), new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.55 }), [s * 0.2, -0.1, 0.3], head); }
  const mouth = add(new THREE.TorusGeometry(0.035, 0.008, 6, 10, Math.PI), M(0x5a2a2a), [0, -0.13, 0.32], head, [0, 0, Math.PI]);
  outlineAll(root, 0.02, 0x1c1226);
  root.userData = { legs, arms, head, body, mouth };
  root.scale.setScalar(1.0);
  return root;
}

export function buildAnimeWorld(ctx, variantId = 'meadow') {
  const V = ANIME_VARIANTS[variantId] || ANIME_VARIANTS.meadow;
  const { scene, engine, fx } = ctx;
  const D = engine.cfg.detail, rng = new Rng(7331);
  const root = new THREE.Group(); root.name = 'anime-world'; scene.add(root);
  const time = { value: 0 };
  scene.background = null;
  scene.fog = new THREE.Fog(V.fog, 70, 260);
  engine.renderer.toneMappingExposure = V.exposure;

  // sky
  const sky = new THREE.Mesh(new THREE.SphereGeometry(420, 32, 16), skyMaterial(V)); sky.renderOrder = -10; root.add(sky);
  // sun disc glow / moon
  const sunDir = new THREE.Vector3(...V.sunDir).normalize();
  const disc = new THREE.Mesh(new THREE.CircleGeometry(V.night ? 16 : 22, 32), new THREE.MeshBasicMaterial({ color: V.night ? 0xf3f0d8 : V.sun, fog: false, transparent: true, opacity: 0.98 }));
  disc.position.copy(sunDir).multiplyScalar(380); disc.lookAt(0, 0, 0); root.add(disc);
  // lights
  const hemi = new THREE.HemisphereLight(V.hemiSky, V.hemiGround, V.hemiI); root.add(hemi);
  const sun = new THREE.DirectionalLight(V.sun, V.sunI); sun.position.copy(sunDir).multiplyScalar(40); sun.castShadow = true;
  const sc = sun.shadow.camera; sc.left = -27; sc.right = 27; sc.top = 27; sc.bottom = -27; sc.near = 5; sc.far = 120; engine.tuneLight(sun); root.add(sun); root.add(sun.target);

  // ground: meadow disc, river ring, far land
  const groundMat = toon(V.ground);
  const meadow = new THREE.Mesh(new THREE.CircleGeometry(24, 72), groundMat); meadow.rotation.x = -Math.PI / 2; meadow.position.y = GROUND_Y; meadow.receiveShadow = true; root.add(meadow);
  const patches = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = new Rng(3); for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(0,80,0,${0.03 + r.next() * 0.05})`; g.beginPath(); g.arc(r.next() * w, r.next() * h, 6 + r.next() * 26, 0, TAU); g.fill(); } }, { repeat: true });
  patches.repeat.set(5, 5); groundMat.map = patches; groundMat.needsUpdate = true;
  const far = new THREE.Mesh(new THREE.RingGeometry(30, 140, 72), toon(shade(V.ground, -0.1))); far.rotation.x = -Math.PI / 2; far.position.y = GROUND_Y; far.receiveShadow = true; root.add(far);
  const bankMat = toon(0x8a6a4a, { side: THREE.DoubleSide });
  for (const [r, rot] of [[24, false], [30, true]]) { const bank = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.5, 72, 1, true), bankMat); bank.position.y = GROUND_Y - 0.25; root.add(bank); }
  const water = new THREE.Mesh(new THREE.RingGeometry(23.9, 30.1, 96, 4), new THREE.ShaderMaterial({
    uniforms: { uTime: time, uA: { value: new THREE.Color(V.water[0]) }, uB: { value: new THREE.Color(V.water[1]) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uA,uB; varying vec3 vW;
      void main(){ float a = atan(vW.z, vW.x), r = length(vW.xz);
        float s = sin(a*38.0 + uTime*1.4 + sin(r*1.7 + uTime)*1.6) * .5 + .5;
        float s2 = sin(a*70.0 - uTime*2.1 + r*2.0) * .5 + .5;
        float f = smoothstep(0.78, 0.86, s) * .55 + smoothstep(0.86, 0.9, s2) * .35;
        vec3 c = mix(uA, uB, 0.25 + 0.3*sin(r*0.9 + uTime*.6)) + f;
        gl_FragColor = vec4(c, 1.0); }`,
  })); water.rotation.x = -Math.PI / 2; water.position.y = GROUND_Y - 0.28; root.add(water);
  // little bridge
  const bridge = new THREE.Group(); const wood = toon(0x9a6a3e);
  for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.55), wood); p.position.set(0, 0, (i - 4) * 0.68); p.castShadow = true; bridge.add(p); }
  for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 6), toon(0xd9503a)); rail.position.set(s * 1.1, 0.62, 0); bridge.add(rail); for (const z of [-2.8, 0, 2.8]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.7, 8), toon(0xd9503a)); post.position.set(s * 1.1, 0.3, z); bridge.add(post); } }
  bridge.position.set(0, GROUND_Y + 0.02, 27); root.add(bridge);

  const blockers = []; // circles villagers/trees/grass stay out of (houses, tray)
  const village = buildVillageProps({ scene, engine, fx }, root, V, D, rng, GROUND_Y, blockers);
  engine.setEnvironment(scene, { top: V.top, mid: V.mid, horizon: V.horizon, ground: V.ground, sunDir: V.sunDir, sunColor: V.sun, sunPower: V.night ? 2 : 6, intensity: V.night ? 0.5 : 0.75 });
  engine.setGrade(V.night ? { vig: 0.42, sat: 1.05, con: 1.06, tint: [0.92, 0.97, 1.08] } : V.sunset ? { vig: 0.38, sat: 1.22, con: 1.08, tint: [1.07, 0.98, 0.9] } : { vig: 0.3, sat: 1.14, con: 1.06, tint: [1.02, 1.0, 0.97] });

  // grass (instanced, wind in the vertex shader)
  const grassMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toon(0xffffff).gradientMap, side: THREE.DoubleSide });
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time; sh.uniforms.uWind = { value: 1 };
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = vec3(position);
      vec4 ip = instanceMatrix * vec4(0.,0.,0.,1.);
      float hh = position.y * position.y;
      float w1 = sin(uTime*1.8 + ip.x*0.32 + ip.z*0.21) + 0.55*sin(uTime*3.3 + ip.x*0.8 - ip.z*0.4);
      transformed.x += w1 * 0.22 * hh; transformed.z += (cos(uTime*1.4 + ip.z*0.37) + 0.4*w1) * 0.14 * hh;`);
  };
  const grassCount = Math.round(30000 * D);
  const grass = new THREE.InstancedMesh(bladeGeometry(), grassMat, grassCount); grass.frustumCulled = false; grass.receiveShadow = true;
  const dummy = new THREE.Object3D(), tint = new THREE.Color(), cA = new THREE.Color(V.grassA), cB = new THREE.Color(V.grassB);
  let placed = 0;
  for (let i = 0; i < grassCount * 2 && placed < grassCount; i++) {
    const r = 8.9 + Math.pow(rng.next(), 0.75) * 15.1, a = rng.next() * TAU;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 8.7 && Math.abs(z) < 8.7) continue;
    if (blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r * 0.92)) continue;
    dummy.position.set(x, GROUND_Y, z); dummy.rotation.set(0, rng.next() * TAU, 0);
    const h = rng.range(0.35, 0.95) * (1 + Math.max(0, (r - 18)) * 0.02); dummy.scale.set(rng.range(0.8, 1.6), h, 1); dummy.updateMatrix();
    grass.setMatrixAt(placed, dummy.matrix); tint.copy(cA).lerp(cB, rng.next() * 0.6); tint.multiplyScalar(0.55 + rng.next() * 0.65); grass.setColorAt(placed, tint); placed++;
  }
  grass.count = placed; root.add(grass);
  // far grass patches beyond the river (cheap, fewer)
  const farN = Math.round(4000 * D);
  if (farN > 50) {
    const farGrass = new THREE.InstancedMesh(bladeGeometry(), grassMat, farN); farGrass.frustumCulled = false; let f = 0;
    for (let i = 0; i < farN; i++) { const r = 31 + rng.next() * 40, a = rng.next() * TAU; dummy.position.set(Math.cos(a) * r, GROUND_Y, Math.sin(a) * r); dummy.rotation.set(0, rng.next() * TAU, 0); dummy.scale.set(2, rng.range(0.6, 1.4), 1); dummy.updateMatrix(); farGrass.setMatrixAt(f, dummy.matrix); tint.copy(cA).lerp(cB, rng.next() * 0.5).multiplyScalar(0.7 + rng.next() * 0.4); farGrass.setColorAt(f, tint); f++; }
    root.add(farGrass);
  }
  // flowers
  const flowerN = Math.round(1400 * D), flowers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.075, 0), toon(0xffffff), flowerN);
  const fcols = V.night ? [0xa9d6ff, 0xd9c2ff, 0xffffff] : [0xffffff, 0xffe066, 0xff8fb6, 0xc9a2ff, 0xff7a7a];
  for (let i = 0; i < flowerN; i++) { const r = 9.2 + Math.pow(rng.next(), 0.8) * 14.5, a = rng.next() * TAU; dummy.position.set(Math.cos(a) * r, GROUND_Y + rng.range(0.15, 0.42), Math.sin(a) * r); dummy.rotation.set(0, 0, 0); dummy.scale.setScalar(rng.range(0.8, 1.6)); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix); tint.set(fcols[i % fcols.length]); flowers.setColorAt(i, tint); }
  root.add(flowers);

  // cherry-blossom trees
  const trees = [];
  const treeCount = Math.max(3, Math.round(8 * D));
  for (let i = 0; i < treeCount; i++) {
    const a = (i / treeCount) * TAU + rng.range(-0.25, 0.25), r = rng.range(12.5, 21.5);
    const aa = ((a % TAU) + TAU) % TAU; if ((aa < 0.7 || aa > Math.PI * 2 - 0.55 || (aa > 0.45 && aa < Math.PI - 0.45)) && r < 23) continue; // keep the camera side (+z), the tray side (+x) and the bridge open
    if (blockers.some((b) => Math.hypot(Math.cos(a) * r - b.x, Math.sin(a) * r - b.z) < b.r + 2.5)) continue;
    const t = blossomTree(rng, D); t.position.set(Math.cos(a) * r, GROUND_Y, Math.sin(a) * r); t.rotation.y = rng.next() * TAU; t.scale.setScalar(rng.range(0.95, 1.4)); root.add(t); trees.push(t);
  }
  // ground petals under trees
  const petalN = Math.round(500 * D), petals = new THREE.InstancedMesh(new THREE.CircleGeometry(0.09, 5), new THREE.MeshBasicMaterial({ color: 0xffb6d2, side: THREE.DoubleSide }), petalN);
  for (let i = 0; i < petalN; i++) { const t = trees[i % Math.max(1, trees.length)]; if (!t) break; dummy.position.set(t.position.x + rng.range(-3.5, 3.5), GROUND_Y + 0.3, t.position.z + rng.range(-3.5, 3.5)); dummy.rotation.set(-Math.PI / 2, 0, rng.next() * TAU); dummy.scale.setScalar(rng.range(0.7, 1.4)); dummy.updateMatrix(); petals.setMatrixAt(i, dummy.matrix); }
  root.add(petals);

  // stone lanterns at the board corners (glow at sunset / night)
  const lanterns = [];
  for (const [x, z] of [[-9.6, -9.6], [9.6, -9.6], [-9.6, 9.6], [9.6, 9.6]]) {
    const l = new THREE.Group(), stone = toon(0xb9b3a6);
    const parts = [[new THREE.CylinderGeometry(0.28, 0.34, 0.25, 8), 0.05], [new THREE.CylinderGeometry(0.13, 0.15, 0.7, 8), 0.5], [new THREE.CylinderGeometry(0.36, 0.36, 0.38, 6), 1.05], [new THREE.ConeGeometry(0.55, 0.4, 6), 1.4]];
    for (const [g, y] of parts) { const m = new THREE.Mesh(g, stone); m.position.y = y; m.castShadow = true; l.add(m); }
    const glowM = new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xffc46b, emissiveIntensity: V.night ? 3 : V.sunset ? 1.8 : 0.4 }); const gl = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), glowM); gl.position.y = 1.05; l.add(gl); l.userData.glow = glowM;
    l.position.set(x, GROUND_Y, z); root.add(l); lanterns.push(l);
  }

  // mountains
  const mountains = new THREE.Group(); root.add(mountains);
  const mN = 22;
  for (let i = 0; i < mN; i++) {
    const a = (i / mN) * TAU + rng.range(-0.08, 0.08), r = rng.range(120, 170), h = rng.range(26, 62), rad = rng.range(18, 34);
    const geo = new THREE.ConeGeometry(rad, h, 7, 5, true); geo.translate(0, h / 2, 0);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), c1 = new THREE.Color(V.night ? 0x35447a : 0x6d7fa8), c2 = new THREE.Color(V.night ? 0xb8c8ff : 0xffffff), tmp = new THREE.Color();
    for (let k = 0; k < p.count; k++) {
      const y = p.getY(k), t = y / h; if (t > 0.02 && t < 0.98) { p.setX(k, p.getX(k) + rng.range(-3.5, 3.5) * (1 - t)); p.setZ(k, p.getZ(k) + rng.range(-3.5, 3.5) * (1 - t)); p.setY(k, y + rng.range(-1, 1)); }
      tmp.copy(c1).lerp(c2, smooth(0.55, 0.72, t + rng.range(-0.05, 0.05))); if (V.sunset) tmp.lerp(new THREE.Color(0xff9ac0), 0.18 * t); col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, toon(0xffffff, { vertexColors: true, flat: true, side: THREE.DoubleSide })); m.position.set(Math.cos(a) * r, GROUND_Y - 2, Math.sin(a) * r); m.rotation.y = rng.next() * TAU; mountains.add(m);
  }
  function smooth(a, b, v) { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // clouds
  const clouds = [];
  for (let i = 0; i < Math.max(5, Math.round(12 * D)); i++) { const c = cloudGroup(rng, V.cloud); c.position.set(rng.range(-140, 140), rng.range(34, 60), rng.range(-140, 60)); c.scale.setScalar(rng.range(1.2, 2.4)); c.userData.speed = rng.range(0.8, 2.2); root.add(c); clouds.push(c); }

  // birds
  const birds = [];
  const birdMat = toon(V.night ? 0x6a7ab0 : 0xffffff), beakMat = toon(0xffb020);
  for (let i = 0; i < Math.max(4, Math.round(9 * D)); i++) {
    const b = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), birdMat); body.scale.set(1, 0.8, 1.7); b.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), birdMat); head.position.set(0, 0.08, 0.42); b.add(head); const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 6), beakMat); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.06, 0.62); b.add(beak);
    const wings = [-1, 1].map((s) => { const w = new THREE.Group(); w.position.set(s * 0.18, 0.06, 0); const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.42), birdMat); m.position.x = s * 0.42; w.add(m); b.add(w); return w; });
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.03, 0.34), birdMat); tail.position.set(0, 0, -0.5); b.add(tail);
    b.userData = { wings, a: rng.next() * TAU, r: rng.range(26, 52), alt: rng.range(11, 24), sp: rng.range(0.09, 0.16) * (rng.next() < 0.5 ? 1 : -1), ph: rng.next() * 6 };
    b.scale.setScalar(1.4); root.add(b); birds.push(b);
  }

  // villagers
  const villagers = [];
  const vN = Math.max(4, Math.round(13 * D));
  for (let i = 0; i < vN; i++) {
    const v = makeVillager(rng); const a = (i / vN) * TAU + rng.range(-0.2, 0.2), r = rng.range(11, 19);
    v.position.set(Math.cos(a) * r, GROUND_Y + 0.05, Math.sin(a) * r);
    v.userData.ai = { state: 'idle', t: rng.range(0, 3), tx: v.position.x, tz: v.position.z, speed: rng.range(0.9, 1.5), ph: rng.next() * 6, cheer: 0, mood: 0 };
    root.add(v); villagers.push(v);
  }
  const pickTarget = (v) => { const ai = v.userData.ai; for (let tries = 0; tries < 6; tries++) { const ang0 = Math.atan2(v.position.z, v.position.x) + rng.range(-1.2, 1.2) * (rng.next() < 0.5 ? 1 : -1), rr0 = rng.range(10.5, 19.5); const tx = Math.cos(ang0) * rr0, tz = Math.sin(ang0) * rr0; if (!world.blockers.some((b) => Math.hypot(tx - b.x, tz - b.z) < b.r + 0.5)) { ai.tx = tx; ai.tz = tz; return; } } const ang = Math.atan2(v.position.z, v.position.x) + rng.range(-1.2, 1.2) * (rng.next() < 0.5 ? 1 : -1), rr = rng.range(10.5, 19.5); ai.tx = Math.cos(ang) * rr; ai.tz = Math.sin(ang) * rr; if (Math.abs(ai.tz) > 22 && ai.tz > 0 && Math.abs(ai.tx) < 3.5) ai.tz = 18; };

  // fireflies / drifting light for night and dusk
  let fireflyT = 0;

  const world = {
    blockers,
    root, sun, hemi, key: sun, variant: V, villagers, time, groundY: GROUND_Y, trees,
    /** Villagers stop and look at the board at (x,z). */
    focusVillagers(x = 0, z = 0) { for (const v of villagers) { const ai = v.userData.ai; ai.state = 'watch'; ai.t = 0; const ang = Math.atan2(v.position.z, v.position.x); const rr = clamp(Math.hypot(v.position.x, v.position.z), 10.5, 12.5); ai.tx = Math.cos(ang) * rr; ai.tz = Math.sin(ang) * rr; } },
    cheer(strength = 1) { for (const v of villagers) { const ai = v.userData.ai; ai.state = 'cheer'; ai.t = 0; ai.cheer = 2.4 * strength + Math.random() * 0.8; } },
    release() { for (const v of villagers) { const ai = v.userData.ai; if (ai.state === 'watch') { ai.state = 'idle'; ai.t = 1; } } },
    update(dt, t) {
      time.value = t;
      // clouds
      for (const c of clouds) { c.position.x += c.userData.speed * dt; if (c.position.x > 170) c.position.x = -170; }
      // birds
      for (const b of birds) {
        const u = b.userData; u.a += u.sp * dt;
        const x = Math.cos(u.a) * u.r, z = Math.sin(u.a) * u.r, y = u.alt + Math.sin(t * 0.6 + u.ph) * 1.3;
        b.position.set(x, y, z); const dir = Math.sign(u.sp); b.rotation.y = Math.atan2(-z * dir, x * dir); b.rotation.z = -dir * 0.25;
        const flap = Math.sin(t * 9 + u.ph) * 0.7; u.wings[0].rotation.z = -flap; u.wings[1].rotation.z = flap;
      }
      // villagers
      for (const v of villagers) {
        const ai = v.userData.ai, { legs, arms, head, body, mouth } = v.userData;
        ai.t += dt;
        let walking = false;
        if (ai.state === 'idle') { if (ai.t > 2.5 + (ai.ph % 3)) { pickTarget(v); ai.state = 'walk'; ai.t = 0; } }
        else if (ai.state === 'walk' || ai.state === 'watch') {
          const dx = ai.tx - v.position.x, dz = ai.tz - v.position.z, d = Math.hypot(dx, dz);
          if (d > 0.2) { const sp = ai.speed * (ai.state === 'watch' ? 2.4 : 1); v.position.x += (dx / d) * sp * dt; v.position.z += (dz / d) * sp * dt; walking = true; const want = Math.atan2(dx, dz); v.rotation.y += wrapAngle(want - v.rotation.y) * Math.min(1, dt * 6); }
          else if (ai.state === 'walk') { ai.state = 'idle'; ai.t = 0; }
          if (ai.state === 'watch' && !walking) { const want = Math.atan2(-v.position.x, -v.position.z); v.rotation.y += wrapAngle(want - v.rotation.y) * Math.min(1, dt * 6); }
        } else if (ai.state === 'cheer') { ai.cheer -= dt; const want = Math.atan2(-v.position.x, -v.position.z); v.rotation.y += wrapAngle(want - v.rotation.y) * Math.min(1, dt * 6); if (ai.cheer <= 0) { ai.state = 'watch'; ai.t = 0; } }
        const cyc = t * 7.5 * ai.speed + ai.ph;
        if (ai.state === 'cheer') {
          const j = Math.abs(Math.sin(t * 8 + ai.ph)); body.position.y = j * 0.45; arms[0].rotation.z = 2.6 + Math.sin(t * 14 + ai.ph) * 0.35; arms[1].rotation.z = -2.6 - Math.sin(t * 14 + ai.ph) * 0.35; arms[0].rotation.x = arms[1].rotation.x = 0;
          legs[0].rotation.x = legs[1].rotation.x = 0; head.rotation.z = Math.sin(t * 8 + ai.ph) * 0.12; mouth.scale.set(1.5, 2.2, 1);
        } else {
          body.position.y = walking ? Math.abs(Math.sin(cyc)) * 0.07 : Math.sin(t * 1.6 + ai.ph) * 0.012;
          const sw = walking ? Math.sin(cyc) * 0.7 : 0; legs[0].rotation.x = sw; legs[1].rotation.x = -sw; arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8;
          arms[0].rotation.z = 0.25 + (ai.state === 'watch' ? 0.1 : 0); arms[1].rotation.z = -0.25; head.rotation.z = 0; mouth.scale.set(1, 1, 1);
        }
        const bad = Math.hypot(v.position.x, v.position.z); if (bad < 10.3) { v.position.x *= 10.3 / bad; v.position.z *= 10.3 / bad; }
        for (const b of blockers) { const dx = v.position.x - b.x, dz = v.position.z - b.z, d = Math.hypot(dx, dz); if (d < b.r) { v.position.x = b.x + (dx / (d || 1)) * b.r; v.position.z = b.z + (dz / (d || 1)) * b.r; if (ai.state === 'walk') pickTarget(v); } }
      }
      // blossoms + petals
      if (fx) {
        for (const tr of trees) if (Math.random() < dt * 1.6) { const c = tr.userData.canopy[Math.floor(Math.random() * tr.userData.canopy.length)]; const wp = tr.localToWorld(new THREE.Vector3(c.x + (Math.random() - 0.5) * 3, c.y + 0.4, c.z + (Math.random() - 0.5) * 3)); fx.emit({ p: wp, n: 1, v: [0.5, -0.5, 0.3], vr: [0.6, 0.2, 0.6], life: 9, size: 0.18, size1: 0.14, color: 0xffb6d2, color1: 0xff9ac0, alpha: 1, alpha1: 1, g: -0.15, drag: 0.6, wind: 1, spin: 3, frame: SPRITE.PETAL, floor: GROUND_Y + 0.25 }); }
        if (Math.random() < dt * 4) fx.emit({ p: [(Math.random() - 0.5) * 34, 3 + Math.random() * 5, -12 - Math.random() * 6], n: 1, v: [1, -0.4, 1.2], vr: [0.4, 0.2, 0.4], life: 8, size: 0.16, size1: 0.13, color: 0xffb6d2, alpha: 0.95, alpha1: 0.95, g: -0.2, drag: 0.5, spin: 3, frame: SPRITE.PETAL, floor: 0.02, wind: 1 });
        if (V.night || V.sunset) { fireflyT += dt; if (fireflyT > (V.night ? 0.06 : 0.25)) { fireflyT = 0; const a = Math.random() * TAU, r = 9 + Math.random() * 12; fx.emit({ p: [Math.cos(a) * r, GROUND_Y + 0.5 + Math.random() * 2.5, Math.sin(a) * r], n: 1, v: [0, 0.15, 0], vr: [0.5, 0.25, 0.5], life: 4, size: 0.2, size1: 0.05, color: 0xd9ff7a, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, drag: 0.5 }); } }
      }
      village.update(dt, t);
      // foliage fades when the camera flies through it (cinematic tracking shots)
      if (ctx.camera) for (const tr of trees) { const fm = tr.userData.foliage.material; const o = clamp((tr.position.distanceTo(ctx.camera.position) - 6) / 10, 0.15, 1); if (Math.abs(fm.opacity - o) > 0.01) { fm.opacity = o; fm.depthWrite = o > 0.95; } }
      for (const l of lanterns) l.userData.glow.emissiveIntensity = (V.night ? 3 : V.sunset ? 1.8 : 0.4) * (0.9 + Math.sin(t * 5 + l.position.x) * 0.1);
    },
    dispose() { scene.remove(root); engine.untuneLight(sun); root.traverse((o) => { o.geometry?.dispose?.(); }); scene.fog = null; },
  };
  fx && (fx.wind = [0.9, 0, 0.5]);
  return world;
}
