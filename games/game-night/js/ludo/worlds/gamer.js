// Gamer worlds: a neon arena with a cheering crowd, sweeping stage lights and LED screens.
// Variants: neon (magenta/cyan), synthwave (retro sun and grid), inferno (lava ring and embers).
import * as THREE from 'three';
import { canvasTex } from '../../core/toon.js';
import { Rng, TAU, clamp, lerp } from '../../core/util.js';
import { SPRITE } from '../../core/fx.js';

const GROUND_Y = -0.61;
const PAL = {
  neon: { a: 0xff2bd6, b: 0x2be7ff, c: 0x7a2bff, floor: 0x0d0826, sky: [0x05020f, 0x1a0a3a], fog: 0x0a0520, crowd: [0xff4d6d, 0xffd23f, 0x4dd6ff, 0x7dff6b, 0xc77dff, 0xffffff], title: 'LUDO', tier: 0x1a1040, lava: false, retro: false, bpm: 128 },
  synthwave: { a: 0xff6ec7, b: 0x7a2bff, c: 0xffd23f, floor: 0x140a30, sky: [0x12043a, 0xff5a9e], fog: 0x2a0a50, crowd: [0xff6ec7, 0xffd23f, 0x7a2bff, 0x2be7ff, 0xffffff], title: 'LUDO', tier: 0x1e0c4a, lava: false, retro: true, bpm: 112 },
  inferno: { a: 0xff5a1f, b: 0xffd23f, c: 0xe63946, floor: 0x1a0805, sky: [0x120302, 0x5a1408], fog: 0x260a04, crowd: [0xff5a1f, 0xffd23f, 0xe63946, 0xffffff, 0xff9f1c], title: 'LUDO', tier: 0x2a0d08, lava: true, retro: false, bpm: 140 },
};

function gridTexture(a, b) {
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#' + new THREE.Color(a).getHexString(); g.lineWidth = 3; g.shadowColor = g.strokeStyle; g.shadowBlur = 10;
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
    g.strokeStyle = '#' + new THREE.Color(b).getHexString(); g.lineWidth = 2; g.shadowColor = g.strokeStyle;
    for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(i * 64 + 32, 0); g.lineTo(i * 64 + 32, h); g.stroke(); }
  }, { repeat: true });
}

function screenTexture(P) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const hexs = (n) => '#' + new THREE.Color(n).getHexString();
  return { tex, draw(t, beat) {
    g.fillStyle = '#05020f'; g.fillRect(0, 0, 256, 128);
    const gr = g.createLinearGradient(0, 0, 256, 0); gr.addColorStop(0, hexs(P.a)); gr.addColorStop(1, hexs(P.b));
    for (let i = 0; i < 22; i++) { const hh = 12 + (Math.sin(t * 5 + i * 0.9) * 0.5 + 0.5) * 60 * (0.5 + beat * 0.5); g.fillStyle = gr; g.fillRect(6 + i * 11, 118 - hh, 8, hh); }
    g.font = '900 30px sans-serif'; g.fillStyle = '#fff'; g.shadowColor = hexs(P.a); g.shadowBlur = 14; g.textAlign = 'center'; g.fillText(P.title, 128 + Math.sin(t * 2) * 6, 42); g.shadowBlur = 0;
    tex.needsUpdate = true;
  } };
}

export function buildGamerWorld(ctx, variantId = 'neon') {
  const P = PAL[variantId] || PAL.neon;
  const { scene, engine, fx } = ctx;
  const D = engine.cfg.detail, rng = new Rng(4242);
  const root = new THREE.Group(); root.name = 'gamer-world'; scene.add(root);
  scene.background = new THREE.Color(P.sky[0]); scene.fog = new THREE.FogExp2(P.fog, 0.0075);
  engine.renderer.toneMappingExposure = 1.05;
  const time = { value: 0 };

  // sky dome with gradient (and a retro sun for synthwave)
  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { a: { value: new THREE.Color(P.sky[0]) }, b: { value: new THREE.Color(P.sky[1]) } }, vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 p; uniform vec3 a,b; void main(){ float t = smoothstep(-0.05, 0.55, p.y); gl_FragColor = vec4(mix(b, a, t), 1.); }' });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat); root.add(sky);
  if (P.retro) {
    const sunTex = canvasTex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd23f'); gr.addColorStop(1, '#ff2b8a'); g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, 120, 0, TAU); g.fill(); g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 8; i++) g.fillRect(0, 130 + i * 15, w, 4 + i * 1.6); });
    const sun = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false })); sun.position.set(0, 30, -170); root.add(sun);
  }
  // stars
  const N = 300, sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = rng.next() * TAU, e = rng.range(0.1, 1.2); sp[i * 3] = Math.cos(a) * Math.cos(e) * 380; sp[i * 3 + 1] = Math.sin(e) * 380 + 20; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 380; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); root.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, color: 0xffffff, fog: false, sizeAttenuation: false, transparent: true, opacity: 0.8 })));

  // lights
  const hemi = new THREE.HemisphereLight(P.b, P.a, 0.85); root.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, 1.9); key.position.set(-10, 24, 14); key.castShadow = true; const sc = key.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 5; sc.far = 80; engine.tuneLight(key); root.add(key);
  const sp1 = new THREE.PointLight(P.a, 70, 40, 1.6); sp1.position.set(-14, 9, 10); root.add(sp1);
  const sp2 = new THREE.PointLight(P.b, 70, 40, 1.6); sp2.position.set(14, 9, -10); root.add(sp2);

  // arena floor: dark glossy disc + neon grid + rings
  const grid = gridTexture(P.a, P.b); grid.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(P.lava ? 27 : 26, 64), new THREE.MeshStandardMaterial({ color: P.floor, roughness: 0.35, metalness: 0.6, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 0.32, map: grid, envMapIntensity: 1.2 })); floor.rotation.x = -Math.PI / 2; floor.position.y = GROUND_Y; floor.receiveShadow = true; root.add(floor);
  const rings = [];
  for (const [r, col, i] of [[11.2, P.a, 1.6], [13.2, P.b, 1.2], [15.4, P.c, 1.0]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), toneMapped: false })); m.rotation.x = Math.PI / 2; m.position.y = GROUND_Y + 0.08; root.add(m); rings.push(m); }
  if (P.retro) { const gp = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ map: (() => { const t = gridTexture(P.a, P.b); t.repeat.set(60, 60); return t; })(), transparent: true, opacity: 0.5, fog: true })); gp.rotation.x = -Math.PI / 2; gp.position.y = GROUND_Y - 0.3; root.add(gp); }

  // lava ring (inferno)
  let lava = null;
  if (P.lava) {
    lava = new THREE.Mesh(new THREE.RingGeometry(27, 38, 96, 2), new THREE.ShaderMaterial({ uniforms: { uTime: time }, vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }', fragmentShader: 'uniform float uTime; varying vec3 vW; void main(){ float a = atan(vW.z,vW.x), r = length(vW.xz); float n = sin(a*18.+uTime*.6+sin(r*.6+uTime)*2.)*.5+.5; float m = sin(a*40.-uTime*.9+r*.8)*.5+.5; vec3 c = mix(vec3(.55,.06,.02), vec3(1.,.55,.05), n*.7+m*.3); c += vec3(1.,.8,.2)*pow(m*n,4.)*1.5; gl_FragColor = vec4(c,1.); }' })); lava.rotation.x = -Math.PI / 2; lava.position.y = GROUND_Y - 0.15; root.add(lava);
  }

  // stands + crowd
  const tiers = P.lava ? [[39, 1.0], [43, 2.9], [47, 4.9], [51, 7.0]] : [[28, 1.1], [32, 3.0], [36, 5.0], [40, 7.2]];
  const tierMat = new THREE.MeshStandardMaterial({ color: P.tier, roughness: 0.6, metalness: 0.3, emissive: P.a, emissiveIntensity: 0.07 });
  {
    // stair-stepped stands as one lathe surface (rings, not solid discs)
    const prof = [[tiers[0][0] - 2, GROUND_Y]];
    tiers.forEach(([r, h], i) => { prof.push([tiers[i][0] - 2, GROUND_Y + h]); prof.push([r + 2, GROUND_Y + h]); if (tiers[i + 1]) prof.push([r + 2, GROUND_Y + tiers[i + 1][1]]); });
    const last = tiers[tiers.length - 1]; prof.push([last[0] + 6, GROUND_Y + last[1]]); prof.push([last[0] + 6, GROUND_Y - 0.6]);
    const stands = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 96), new THREE.MeshStandardMaterial({ color: P.tier, roughness: 0.55, metalness: 0.35, emissive: P.a, emissiveIntensity: 0.06, side: THREE.DoubleSide }));
    stands.receiveShadow = true; stands.castShadow = true; root.add(stands);
    tiers.forEach(([r, h], i) => { const rim = new THREE.Mesh(new THREE.TorusGeometry(r - 2, 0.06, 6, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? P.a : P.b).multiplyScalar(1.3), toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = GROUND_Y + h + 0.06; root.add(rim); });
  }
  const crowdN = Math.round(900 * D);
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 0.7, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowdN);
  const head = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowdN);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.55, 0.14), new THREE.MeshStandardMaterial({ roughness: 0.7 }), crowdN * 2);
  const fans = [], tmp = new THREE.Color(), skin = [0xf2c9a5, 0xd9a07a, 0xa9764f, 0xf6d3b8];
  for (let i = 0; i < crowdN; i++) {
    const tier = tiers[Math.floor(rng.next() * tiers.length)], r = tier[0] + rng.range(-1.2, 1.2), a = rng.next() * TAU;
    const f = { x: Math.cos(a) * r, y: GROUND_Y + tier[1] + 0.35, z: Math.sin(a) * r, a, ph: rng.next() * 6, jump: 0, hot: rng.range(0.5, 1) };
    fans.push(f); tmp.set(P.crowd[i % P.crowd.length]); body.setColorAt(i, tmp); tmp.set(skin[i % 4]); head.setColorAt(i, tmp);
    tmp.set(skin[i % 4]); arms.setColorAt(i * 2, tmp); arms.setColorAt(i * 2 + 1, tmp);
  }
  root.add(body, head, arms); body.frustumCulled = head.frustumCulled = arms.frustumCulled = false;
  const dummy = new THREE.Object3D();

  // LED screens
  const screens = [];
  for (let i = 0; i < 4; i++) { const st = screenTexture(P); const a = (i / 4) * TAU + Math.PI / 4, r = tiers[tiers.length - 1][0] + 4; const m = new THREE.Mesh(new THREE.PlaneGeometry(15, 7.5), new THREE.MeshBasicMaterial({ map: st.tex, toneMapped: false })); m.position.set(Math.cos(a) * r, GROUND_Y + 11, Math.sin(a) * r); m.lookAt(0, 4, 0); root.add(m); const fr = new THREE.Mesh(new THREE.BoxGeometry(15.6, 8.1, 0.3), new THREE.MeshStandardMaterial({ color: 0x111122, metalness: 0.7, roughness: 0.3 })); fr.position.copy(m.position).addScaledVector(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), 0.25); fr.lookAt(0, 4, 0); root.add(fr); screens.push(st); }

  // stage lights: towers with sweeping beams
  const beams = [];
  const beamMat = (c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, r = tiers[1][0] + 3;
    const g = new THREE.Group(); g.position.set(Math.cos(a) * r, GROUND_Y + 8, Math.sin(a) * r);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0x222233, metalness: 0.8, roughness: 0.4 })); tower.position.set(g.position.x, GROUND_Y + 4, g.position.z); root.add(tower);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 26, 20, 1, true), beamMat(i % 2 ? P.a : P.b)); cone.geometry.translate(0, -13, 0); cone.renderOrder = 25; g.add(cone);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 2 ? P.a : P.b).multiplyScalar(2), toneMapped: false })); g.add(lamp);
    root.add(g); beams.push({ g, a, ph: rng.next() * 6 });
  }
  // big neon sign
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(18, 5), new THREE.MeshBasicMaterial({ map: canvasTex(512, 160, (g, w, h) => { g.clearRect(0, 0, w, h); g.font = '900 120px "Arial Rounded MT Bold",Trebuchet MS,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#' + new THREE.Color(P.a).getHexString(); g.shadowBlur = 40; g.fillStyle = '#fff'; g.fillText(P.title, w / 2, h / 2 + 6); g.strokeStyle = '#' + new THREE.Color(P.b).getHexString(); g.lineWidth = 4; g.strokeText(P.title, w / 2, h / 2 + 6); }), transparent: true, toneMapped: false, fog: false })); sign.position.set(0, GROUND_Y + 16, -tiers[tiers.length - 1][0] - 6); sign.lookAt(0, 8, 0); root.add(sign);

  // ---- stage dressing: DJ booth + speaker stacks, light-sticks, banners, spotlight drones, pyro, camera rig, barrier
  const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a26, roughness: 0.35, metalness: 0.85 });
  const trussMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b4, roughness: 0.3, metalness: 0.9 });
  const emit = (c, i = 2) => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: c, emissiveIntensity: i });
  {
    const stage = new THREE.Group(); stage.position.set(0, GROUND_Y, -tiers[0][0] + 1.5);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(14, 1.2, 5), new THREE.MeshStandardMaterial({ color: 0x14102e, roughness: 0.25, metalness: 0.8 })); deck.position.y = 0.6; deck.castShadow = true; deck.receiveShadow = true; stage.add(deck);
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14.1, 0.1, 0.1), emit(P.a, 2.4)); strip.position.set(0, 1.25, 2.5); stage.add(strip);
    for (const sx of [-1, 1]) { for (let k = 0; k < 3; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.4), metal); sp.position.set(sx * 6.3, 1.9 + k * 1.4, -0.5); sp.castShadow = true; stage.add(sp); for (const y of [0.3, -0.3]) { const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.25, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.6 })); cone.rotation.x = Math.PI / 2; cone.position.set(sx * 6.3, 1.9 + k * 1.4 + y, 0.25); stage.add(cone); } } }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.14, 8, 40, Math.PI), trussMat); arch.position.set(0, 1.2, -0.2); arch.castShadow = true; stage.add(arch);
    const dj = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 1.3), metal); dj.position.set(0, 1.75, 0); dj.castShadow = true; stage.add(dj);
    for (const sx of [-1, 1]) { const dk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 24), emit(P.b, 1.5)); dk.position.set(sx * 0.85, 2.33, 0); stage.add(dk); stage.userData['deck' + sx] = dk; }
    const led = new THREE.Mesh(new THREE.PlaneGeometry(13, 5.5), new THREE.MeshBasicMaterial({ map: screens[0].tex, toneMapped: false })); led.position.set(0, 4.2, -2.4); stage.add(led);
    stage.lookAt(0, GROUND_Y + 1, 0); stage.rotation.x = 0; root.add(stage); 
  }
  function makeLightSticks() {
    const n = Math.round(160 * D) + 10, sticks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 5), new THREE.MeshBasicMaterial({ toneMapped: false }), n), c = new THREE.Color();
    const list = []; for (let i = 0; i < n; i++) { const f = fans[Math.floor(rng.next() * fans.length)]; list.push(f); c.set(P.crowd[i % P.crowd.length]).multiplyScalar(2.2); sticks.setColorAt(i, c); }
    sticks.frustumCulled = false; root.add(sticks); return { sticks, list, n };
  }
  const ls = makeLightSticks();
  const banners = []; for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU + 0.5, r = tiers[tiers.length - 1][0] + 3.5; const b = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8, 1, 8), new THREE.MeshStandardMaterial({ color: [P.a, P.b, P.c][i % 3], roughness: 0.7, side: THREE.DoubleSide, emissive: [P.a, P.b, P.c][i % 3], emissiveIntensity: 0.25 })); b.position.set(Math.cos(a) * r, GROUND_Y + 9, Math.sin(a) * r); b.lookAt(0, GROUND_Y + 8, 0); b.userData = { ph: i }; root.add(b); banners.push(b); }
  const drones = []; for (let i = 0; i < 3; i++) { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 10), metal); body.scale.y = 0.55; g.add(body); const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), emit(i % 2 ? P.a : P.b, 3)); eye.position.set(0, -0.15, 0.36); g.add(eye); const beam = new THREE.Mesh(new THREE.ConeGeometry(1.5, 14, 20, 1, true), new THREE.MeshBasicMaterial({ color: i % 2 ? P.a : P.b, transparent: true, opacity: 0.13, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.geometry.translate(0, -7, 0); g.add(beam); g.userData = { a: i * 2.1, r: 17 + i * 2, alt: 9 + i * 1.5, sp: 0.16 + i * 0.05 }; root.add(g); drones.push(g); }
  // barrier rail around the floor with LED strip
  { const rail = new THREE.Mesh(new THREE.TorusGeometry(P.lava ? 27.4 : 26.4, 0.14, 8, 128), trussMat); rail.rotation.x = Math.PI / 2; rail.position.y = GROUND_Y + 1.1; rail.castShadow = true; root.add(rail); const led = new THREE.Mesh(new THREE.TorusGeometry(P.lava ? 27.4 : 26.4, 0.05, 6, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.b).multiplyScalar(1.6), toneMapped: false })); led.rotation.x = Math.PI / 2; led.position.y = GROUND_Y + 0.75; root.add(led); const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), trussMat, 48); const d2 = new THREE.Object3D(); for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; d2.position.set(Math.cos(a) * (P.lava ? 27.4 : 26.4), GROUND_Y + 0.55, Math.sin(a) * (P.lava ? 27.4 : 26.4)); d2.updateMatrix(); posts.setMatrixAt(i, d2.matrix); } root.add(posts); }
  // robotic camera dolly on the barrier
  const cam = new THREE.Group(); { const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.2), metal); body.castShadow = true; cam.add(body); const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.5, 12), metal); lens.rotation.x = Math.PI / 2; lens.position.z = 0.8; cam.add(lens); const rec = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), emit(0xff2020, 4)); rec.position.set(0.3, 0.38, 0); cam.add(rec); cam.userData.rec = rec; root.add(cam); }
  let pyroT = 0;
  let cheer = 0, focus = 0;
  return {
    root, groundY: GROUND_Y, key, hemi,
    cheer(strength = 1) { cheer = 2.6 * strength; for (const f of fans) f.jump = 1.6 + Math.random() * 0.8; fx?.confetti(new THREE.Vector3(0, 6, 0), Math.round(30 * D), [P.a, P.b, P.c, 0xffffff]); },
    focusVillagers() { focus = 1; }, release() { focus = 0; },
    update(dt, t) {
      time.value = t; cheer = Math.max(0, cheer - dt);
      const beat = Math.pow(Math.max(0, Math.sin(t * P.bpm / 60 * Math.PI)), 6);
      rings.forEach((m, i) => { m.material.color.copy(new THREE.Color([P.a, P.b, P.c][i])).multiplyScalar(1.0 + beat * 1.2); });
      sp1.intensity = 60 + beat * 50; sp2.intensity = 60 + beat * 50;
      banners.forEach((b) => { const pp = b.geometry.attributes.position; for (let i = 0; i < pp.count; i++) { const y = pp.getY(i); pp.setZ(i, Math.sin(t * 2 + y * 0.8 + b.userData.ph) * 0.18 * (1 - (y + 4) / 8)); } pp.needsUpdate = true; });
      drones.forEach((d) => { const u = d.userData; u.a += u.sp * dt; d.position.set(Math.cos(u.a) * u.r, GROUND_Y + u.alt + Math.sin(t + u.a) * 0.6, Math.sin(u.a) * u.r); d.rotation.y = -u.a; d.children[2].rotation.x = Math.sin(t * 1.4 + u.a) * 0.5; });
      { const ca = t * 0.12, cr = P.lava ? 27.4 : 26.4; cam.position.set(Math.cos(ca) * (cr - 1.2), GROUND_Y + 1.6, Math.sin(ca) * (cr - 1.2)); cam.lookAt(0, GROUND_Y + 1.2, 0); cam.userData.rec.visible = Math.floor(t * 2) % 2 === 0; }
      { const d = new THREE.Object3D(), mtx = ls.sticks; for (let i = 0; i < ls.n; i++) { const f = ls.list[i]; const up = cheer > 0 || f.jump > 0.1 ? 1 : 0.5; d.position.set(f.x, f.y + 0.95 + Math.abs(Math.sin(t * 4 + f.ph)) * 0.15 * up, f.z); d.rotation.set(0, 0, Math.sin(t * 5 + f.ph) * 0.6); d.updateMatrix(); mtx.setMatrixAt(i, d.matrix); } mtx.instanceMatrix.needsUpdate = true; }
      pyroT += dt; if (fx && beat > 0.85 && pyroT > 0.3) { pyroT = 0; for (const sx of [-1, 1]) for (let k = 0; k < 6; k++) fx.emit({ p: [sx * 13.5, GROUND_Y + 0.4, -13 + (sx > 0 ? 0 : 0)], n: 1, v: [0, 9 + Math.random() * 4, 0], vr: [0.7, 1.5, 0.7], life: 0.9, size: 0.7, size1: 0.1, color: P.lava ? 0xffd23f : P.b, color1: P.a, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, g: -2, essential: true }); }
      beams.forEach((b, i) => { b.g.rotation.x = Math.sin(t * 0.8 + b.ph) * 0.45 + 0.1; b.g.rotation.z = Math.cos(t * 0.6 + b.ph * 1.3) * 0.45; b.g.rotation.y = b.a + Math.PI; });
      // crowd
      for (let i = 0; i < crowdN; i++) {
        const f = fans[i]; f.jump = Math.max(0, f.jump - dt * 1.5);
        const bounce = Math.abs(Math.sin(t * P.bpm / 60 * Math.PI * 0.5 + f.ph)) * (0.06 + 0.06 * f.hot) + (cheer > 0 ? Math.abs(Math.sin(t * 9 + f.ph)) * 0.35 * Math.min(1, cheer) : 0) + f.jump * Math.abs(Math.sin(t * 7 + f.ph)) * 0.3;
        dummy.position.set(f.x, f.y + bounce, f.z); dummy.rotation.set(0, -f.a + Math.PI / 2, 0); dummy.scale.setScalar(1); dummy.updateMatrix(); body.setMatrixAt(i, dummy.matrix);
        dummy.position.y += 0.62; dummy.updateMatrix(); head.setMatrixAt(i, dummy.matrix);
        const up = cheer > 0 || f.jump > 0.2 ? 1 : 0;
        for (const s of [-1, 1]) { dummy.position.set(f.x, f.y + bounce + 0.32, f.z); dummy.rotation.set(0, -f.a + Math.PI / 2, s * (up ? 2.6 + Math.sin(t * 12 + f.ph) * 0.3 : 0.25 + Math.sin(t * 3 + f.ph) * 0.1)); dummy.translateX(s * 0.36); dummy.updateMatrix(); arms.setMatrixAt(i * 2 + (s > 0 ? 1 : 0), dummy.matrix); }
      }
      body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = arms.instanceMatrix.needsUpdate = true;
      screens.forEach((s, i) => { if (Math.floor(t * 8) !== s.last) { s.last = Math.floor(t * 8); s.draw(t + i, beat); } });
      if (fx) {
        if (Math.random() < dt * (P.lava ? 14 : 5)) fx.emit({ p: [(Math.random() - 0.5) * 50, GROUND_Y + 0.2, (Math.random() - 0.5) * 50], n: 1, v: [0, P.lava ? 2.5 : 0.8, 0], vr: 0.4, life: P.lava ? 3 : 4, size: 0.12, size1: 0.02, color: P.lava ? 0xff8a2a : Math.random() < 0.5 ? P.a : P.b, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT });
      }
    },
    dispose() { scene.remove(root); engine.untuneLight(key); scene.background = null; scene.fog = null; root.traverse((o) => o.geometry?.dispose?.()); },
  };
}
