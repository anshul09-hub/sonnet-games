// Tech worlds: circuit city (glowing traces, towers, hovering drones), orbital deck (station above a planet), data sea (matrix-green).
import * as THREE from 'three';
import { canvasTex } from '../../core/toon.js';
import { Rng, TAU, lerp } from '../../core/util.js';
import { SPRITE } from '../../core/fx.js';

const GROUND_Y = -0.61;
const PAL = {
  circuit: { a: 0x00e5ff, b: 0x39ffb0, c: 0x7a5cff, floor: 0x061424, sky: [0x020814, 0x0a2a4a], fog: 0x061a30, city: true, space: false, rain: false },
  orbital: { a: 0x7ad7ff, b: 0xffd9a0, c: 0xc77dff, floor: 0x0a1226, sky: [0x010208, 0x0a1440], fog: 0x040818, city: false, space: true, rain: false },
  datasea: { a: 0x00ff9c, b: 0xb6ffdd, c: 0x00c070, floor: 0x02120a, sky: [0x010803, 0x04210f], fog: 0x03150a, city: true, space: false, rain: true },
};
const hexs = (n) => '#' + new THREE.Color(n).getHexString();

function traceTexture(P, pulses = false) {
  return canvasTex(512, 512, (g, w, h) => {
    const r = new Rng(pulses ? 99 : 11);
    g.fillStyle = pulses ? '#000' : '#020a14'; g.fillRect(0, 0, w, h);
    g.lineCap = 'square';
    const col = hexs(P.a);
    if (!pulses) {
      g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.lineWidth = 2.5;
      for (let i = 0; i < 26; i++) { let x = Math.floor(r.next() * 16) * 32, y = Math.floor(r.next() * 16) * 32; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 5; k++) { if (r.next() < 0.5) x += (Math.floor(r.next() * 5) - 2) * 32; else y += (Math.floor(r.next() * 5) - 2) * 32; g.lineTo(x, y); } g.stroke(); g.beginPath(); g.arc(x, y, 6, 0, TAU); g.stroke(); }
      g.shadowBlur = 0; g.strokeStyle = 'rgba(0,229,255,.12)'; g.lineWidth = 1; for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    } else {
      g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14;
      for (let i = 0; i < 40; i++) { const y = Math.floor(r.next() * 16) * 32; g.fillRect(r.next() * w, y - 2, 18, 5); }
    }
  }, { repeat: true });
}
function windowTexture(P) {
  return canvasTex(128, 256, (g, w, h) => { g.fillStyle = '#04070d'; g.fillRect(0, 0, w, h); const r = new Rng(5); for (let y = 6; y < h; y += 12) for (let x = 6; x < w; x += 12) if (r.next() < 0.45) { g.fillStyle = r.next() < 0.7 ? hexs(P.a) : hexs(P.b); g.fillRect(x, y, 6, 7); } });
}

export function buildTechWorld(ctx, variantId = 'circuit') {
  const P = PAL[variantId] || PAL.circuit;
  const { scene, engine, fx } = ctx;
  const D = engine.cfg.detail, rng = new Rng(2024);
  const root = new THREE.Group(); root.name = 'tech-world'; scene.add(root);
  scene.background = new THREE.Color(P.sky[0]); scene.fog = new THREE.FogExp2(P.fog, P.space ? 0.0018 : 0.0075);
  engine.renderer.toneMappingExposure = 1.1;
  const time = { value: 0 };

  const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { a: { value: new THREE.Color(P.sky[0]) }, b: { value: new THREE.Color(P.sky[1]) } }, vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 p; uniform vec3 a,b; void main(){ float t = smoothstep(-0.1, 0.6, p.y); gl_FragColor = vec4(mix(b, a, t), 1.); }' });
  root.add(new THREE.Mesh(new THREE.SphereGeometry(420, 24, 12), skyMat));
  const N = P.space ? 900 : 260, sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { const a = rng.next() * TAU, e = rng.range(-0.15, 1.3); sp[i * 3] = Math.cos(a) * Math.cos(e) * 390; sp[i * 3 + 1] = Math.sin(e) * 390; sp[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 390; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); root.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: P.space ? 2 : 1.5, color: 0xffffff, fog: false, sizeAttenuation: false, transparent: true, opacity: 0.85 })));

  root.add(new THREE.HemisphereLight(P.a, 0x02060c, 0.9));
  const key = new THREE.DirectionalLight(0xdfefff, 2.0); key.position.set(-10, 24, 14); key.castShadow = true; const sc = key.shadow.camera; sc.left = -17; sc.right = 17; sc.top = 17; sc.bottom = -17; sc.near = 5; sc.far = 80; engine.tuneLight(key); root.add(key);
  const l1 = new THREE.PointLight(P.a, 60, 36, 1.6); l1.position.set(-13, 7, 9); root.add(l1);
  const l2 = new THREE.PointLight(P.c, 50, 36, 1.6); l2.position.set(13, 7, -9); root.add(l2);

  // floor: circuit traces + travelling data pulses
  const tex = traceTexture(P), pulse = traceTexture(P, true);
  tex.repeat.set(5, 5); pulse.repeat.set(5, 5);
  const floorMat = new THREE.MeshStandardMaterial({ color: P.floor, roughness: 0.35, metalness: 0.7, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.7 });
  const floorR = P.space ? 22 : 34;
  const floor = new THREE.Mesh(new THREE.CircleGeometry(floorR, 72), floorMat); floor.rotation.x = -Math.PI / 2; floor.position.y = GROUND_Y; floor.receiveShadow = true; root.add(floor);
  const pulseMat = new THREE.MeshBasicMaterial({ map: pulse, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(P.b).multiplyScalar(1.6) });
  const pl = new THREE.Mesh(new THREE.CircleGeometry(floorR, 72), pulseMat); pl.rotation.x = -Math.PI / 2; pl.position.y = GROUND_Y + 0.02; root.add(pl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(floorR, 0.18, 8, 128), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.a).multiplyScalar(1.6), toneMapped: false })); rim.rotation.x = Math.PI / 2; rim.position.y = GROUND_Y + 0.1; root.add(rim);
  // holographic rings around the board
  const holo = [];
  for (const [r, w, s] of [[11.5, 0.05, 0.4], [13.4, 0.04, -0.3], [15.4, 0.06, 0.2]]) { const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(P.a).multiplyScalar(1.4), transparent: true, opacity: 0.7, toneMapped: false })); m.rotation.x = Math.PI / 2; m.position.y = GROUND_Y + 0.15; m.userData.s = s; root.add(m); holo.push(m); }

  // skyline / planet / towers
  const towers = [];
  if (P.city) {
    const wt = windowTexture(P), n = Math.round(260 * D);
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x0a1220, roughness: 0.5, metalness: 0.6, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.9, map: wt });
    const inst = new THREE.InstancedMesh(geo, mat, n), d = new THREE.Object3D();
    for (let i = 0; i < n; i++) { const a = rng.next() * TAU, r = rng.range(floorR + 4, floorR + 60), h = rng.range(6, 44) * (1 + (r - floorR) * 0.006), w = rng.range(2.5, 7); d.position.set(Math.cos(a) * r, GROUND_Y, Math.sin(a) * r); d.scale.set(w, h, w); d.rotation.y = rng.next() * 3; d.updateMatrix(); inst.setMatrixAt(i, d.matrix); }
    root.add(inst);
    const far = new THREE.Mesh(new THREE.RingGeometry(floorR, 140, 64), new THREE.MeshStandardMaterial({ color: 0x030a14, roughness: 0.7, metalness: 0.4 })); far.rotation.x = -Math.PI / 2; far.position.y = GROUND_Y - 0.05; far.receiveShadow = true; root.add(far);
  }
  if (P.space) {
    const planetTex = canvasTex(512, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1b4a8a'); gr.addColorStop(0.5, '#2f8f9d'); gr.addColorStop(1, '#0b2540'); g.fillStyle = gr; g.fillRect(0, 0, w, h); const r = new Rng(3); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${r.next() * 0.25})`; g.beginPath(); g.ellipse(r.next() * w, r.next() * h, 20 + r.next() * 60, 4 + r.next() * 10, 0, 0, TAU); g.fill(); } });
    const planet = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), new THREE.MeshStandardMaterial({ map: planetTex, roughness: 0.8, emissive: 0x0a2040, emissiveIntensity: 0.5 })); planet.position.set(-60, -150, -100); root.add(planet); planet.userData.spin = 0.004; towers.push(planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(124, 48, 32), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false, fog: false })); atm.position.copy(planet.position); root.add(atm);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(30, 1.2, 8, 96), new THREE.MeshStandardMaterial({ color: 0x1a2440, metalness: 0.9, roughness: 0.3, emissive: P.a, emissiveIntensity: 0.15 })); ring.rotation.x = Math.PI / 2; ring.position.y = GROUND_Y - 0.4; root.add(ring);
    for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, s = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 1.2), new THREE.MeshStandardMaterial({ color: 0x1c3a8a, metalness: 0.7, roughness: 0.3, emissive: 0x0a2a6a, emissiveIntensity: 0.6 })); s.position.set(Math.cos(a) * 30, GROUND_Y + 1.6, Math.sin(a) * 30); s.rotation.y = -a; root.add(s); }
  }
  // matrix rain columns
  let rain = null;
  if (P.rain) {
    const cols = Math.round(90 * D) + 10, rt = canvasTex(64, 512, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.font = 'bold 22px monospace'; g.textAlign = 'center'; for (let i = 0; i < 24; i++) { g.fillStyle = `rgba(0,255,156,${1 - i / 26})`; g.fillText(Math.random() < 0.5 ? '0' : '1', 32, 22 + i * 21); } }, { repeat: true });
    rain = []; for (let i = 0; i < cols; i++) { const a = rng.next() * TAU, r = rng.range(floorR + 3, floorR + 45); const t = rt.clone(); t.needsUpdate = true; t.repeat.set(1, 1); const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 18 + rng.next() * 20), new THREE.MeshBasicMaterial({ map: t, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(P.a).multiplyScalar(1.3), side: THREE.DoubleSide })); m.position.set(Math.cos(a) * r, GROUND_Y + 10 + rng.next() * 10, Math.sin(a) * r); m.lookAt(0, m.position.y, 0); m.userData = { t, sp: rng.range(0.25, 0.8) }; root.add(m); rain.push(m); }
  }

  // hovering drones with scanning beams
  const drones = [];
  for (let i = 0; i < Math.max(3, Math.round(9 * D)); i++) {
    const g = new THREE.Group(), body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), new THREE.MeshStandardMaterial({ color: 0x1b2438, metalness: 0.8, roughness: 0.3 })); body.scale.y = 0.6; g.add(body);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(i % 3 ? P.a : P.c).multiplyScalar(2.5), toneMapped: false })); eye.position.set(0, -0.15, 0.4); g.add(eye);
    const rotors = []; for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.02, 14), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.25, depthWrite: false })); r.position.set(sx * 0.75, 0.25, sz * 0.75); g.add(r); rotors.push(r); }
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4, 9, 16, 1, true), new THREE.MeshBasicMaterial({ color: P.a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); beam.geometry.translate(0, -4.5, 0); g.add(beam);
    g.userData = { a: rng.next() * TAU, r: rng.range(17, 30), alt: rng.range(6, 15), sp: rng.range(0.07, 0.16) * rng.sign(), ph: rng.next() * 6, beam };
    root.add(g); drones.push(g);
  }
  // ---- extra dressing: env + grade, flying cars with trails, monorail, holo billboards, antenna blinkers, steam, data ocean, nebula
  engine.setEnvironment(scene, { top: P.sky[0], mid: P.sky[1], horizon: P.a, ground: P.floor, sunDir: [0.4, 0.7, 0.5], sunColor: P.a, sunPower: 3, intensity: 1.0 });
  engine.setGrade({ vig: 0.42, sat: 1.22, con: 1.1, tint: [0.98, 1.0, 1.05] });
  const glowM = (c, i = 2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(i), toneMapped: false });
  const cars = [], lanes = [{ r: floorR + 5, y: 9, sp: 0.09 }, { r: floorR + 11, y: 15, sp: -0.07 }, { r: floorR + 18, y: 22, sp: 0.05 }];
  {
    const n = Math.round(24 * D) + 4, body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.5, 0.8), new THREE.MeshStandardMaterial({ color: 0x141a28, roughness: 0.3, metalness: 0.85 }), n), lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.16, 0.9), glowM(0xffffff, 1), n * 2);
    const c = new THREE.Color(); for (let i = 0; i < n; i++) { const l = lanes[i % lanes.length]; cars.push({ a: rng.next() * TAU, l, off: rng.range(-1.5, 1.5), i }); c.set(i % 2 ? P.a : P.c).multiplyScalar(2); lights.setColorAt(i * 2, c); c.set(0xff3050).multiplyScalar(2); lights.setColorAt(i * 2 + 1, c); }
    body.castShadow = true; body.frustumCulled = lights.frustumCulled = false; root.add(body, lights); cars.body = body; cars.lights = lights;
  }
  const monorail = { cars: [], track: null };
  { const R = floorR + 8; const track = new THREE.Mesh(new THREE.TorusGeometry(R, 0.25, 8, 128), new THREE.MeshStandardMaterial({ color: 0x1a2436, metalness: 0.9, roughness: 0.3 })); track.rotation.x = Math.PI / 2; track.position.y = 7.4; root.add(track); const glowT = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 128), glowM(P.a, 1.8)); glowT.rotation.x = Math.PI / 2; glowT.position.y = 7.25; root.add(glowT);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 8, 8), new THREE.MeshStandardMaterial({ color: 0x141c2c, metalness: 0.8, roughness: 0.4 }), 28), d = new THREE.Object3D(); for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; d.position.set(Math.cos(a) * R, GROUND_Y + 3.7, Math.sin(a) * R); d.updateMatrix(); posts.setMatrixAt(i, d.matrix); } posts.castShadow = true; root.add(posts);
    const carGeo = new THREE.BoxGeometry(3.4, 1.3, 1.5), winMat = new THREE.MeshStandardMaterial({ color: 0x0a1020, emissive: P.b, emissiveIntensity: 1.2, roughness: 0.4 }), bodyM = new THREE.MeshStandardMaterial({ color: 0xdfe6f2, roughness: 0.25, metalness: 0.8 });
    for (let i = 0; i < 7; i++) { const g = new THREE.Group(); const b = new THREE.Mesh(carGeo, bodyM); b.castShadow = true; g.add(b); const w = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.5, 1.56), winMat); w.position.y = 0.15; g.add(w); root.add(g); monorail.cars.push(g); } monorail.R = R; }
  const bills = []; for (let i = 0; i < 3; i++) { const c = document.createElement('canvas'); c.width = 256; c.height = 128; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })); const a = (i / 3) * TAU + 0.9, r = floorR + 14; m.position.set(Math.cos(a) * r, 15 + i * 2, Math.sin(a) * r); m.lookAt(0, 12, 0); root.add(m); bills.push({ m, c, g: c.getContext('2d'), t }); }
  const blinkers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 8, 6), glowM(0xff3040, 2.4), 18), bt = []; { const d = new THREE.Object3D(); for (let i = 0; i < 18; i++) { const a = rng.next() * TAU, r = rng.range(floorR + 6, floorR + 45), h = rng.range(26, 52); const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, h, 6), new THREE.MeshStandardMaterial({ color: 0x1a2234, metalness: 0.8, roughness: 0.4 })); tw.position.set(Math.cos(a) * r, GROUND_Y + h / 2, Math.sin(a) * r); root.add(tw); d.position.set(tw.position.x, GROUND_Y + h + 0.3, tw.position.z); d.updateMatrix(); blinkers.setMatrixAt(i, d.matrix); bt.push(rng.next() * 6); } root.add(blinkers); }
  let ocean = null; if (P.rain) { ocean = new THREE.Mesh(new THREE.RingGeometry(floorR + 0.5, 180, 96, 8), new THREE.ShaderMaterial({ transparent: true, uniforms: { uTime: time, uA: { value: new THREE.Color(P.a) } }, vertexShader: 'varying vec3 vW; void main(){ vec3 p = position; float a = atan(p.y, p.x), r = length(p.xy); p.z += sin(r*.35 - 0.) * 0.0; vec4 w = modelMatrix*vec4(p,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }', fragmentShader: 'uniform float uTime; uniform vec3 uA; varying vec3 vW; void main(){ vec2 p = vW.xz; float w = sin(p.x*.5+uTime*.8)*.5 + sin(p.y*.4-uTime*.6)*.5; float g = smoothstep(.93,1.,sin(p.x*2.+w*2.+uTime)*.5+.5) + smoothstep(.95,1.,sin(p.y*2.2-w+uTime*1.4)*.5+.5); float d = length(p); vec3 c = uA*(0.06+g*.9) + vec3(0.,0.02,0.01); gl_FragColor = vec4(c, 0.95*smoothstep(180.,60.,d)); }' })); ocean.rotation.x = -Math.PI / 2; ocean.position.y = GROUND_Y - 0.6; root.add(ocean);
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x03150a, emissive: P.a, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3 }), Math.round(40 * D) + 6); const d = new THREE.Object3D(); cubes.userData.d = []; for (let i = 0; i < cubes.count; i++) { const a = rng.next() * TAU, r = rng.range(floorR + 3, floorR + 40), sc = rng.range(0.6, 2.2); cubes.userData.d.push({ a, r, sc, y: rng.range(2, 14), ph: rng.next() * 6 }); } root.add(cubes); ocean.userData.cubes = cubes; }
  let nebula = null; if (P.space) { const tex = canvasTex(256, 256, (g, w, h) => { const r = new Rng(9); for (let i = 0; i < 40; i++) { const x = r.next() * w, y = r.next() * h, rad = 20 + r.next() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, rad); const col = ['rgba(120,80,255,', 'rgba(255,90,200,', 'rgba(60,160,255,'][i % 3]; gr.addColorStop(0, col + '0.35)'); gr.addColorStop(1, col + '0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } }); nebula = []; for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide })); m.position.set(rng.range(-160, 160), rng.range(20, 120), rng.range(-260, -120)); m.rotation.z = rng.next() * 6; root.add(m); nebula.push(m); }
    const flare = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: 0xfff1cf, transparent: true, opacity: 0.95, fog: false })); flare.position.set(120, 90, -260); flare.lookAt(0, 0, 0); root.add(flare); const glow = new THREE.Mesh(new THREE.CircleGeometry(140, 32), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,.8)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); glow.position.copy(flare.position); glow.lookAt(0, 0, 0); root.add(glow); }
  const steam = []; if (P.city) for (let i = 0; i < 4; i++) { const a = rng.next() * TAU, r = floorR + rng.range(6, 20); steam.push(new THREE.Vector3(Math.cos(a) * r, GROUND_Y + 8, Math.sin(a) * r)); }
  const _d = new THREE.Object3D();
  // ambient data particles
  let dataT = 0, cheer = 0;
  return {
    root, groundY: GROUND_Y, key,
    cheer(s = 1) { cheer = 2.2 * s; fx?.confetti(new THREE.Vector3(0, 6, 0), Math.round(24 * D), [P.a, P.b, P.c, 0xffffff]); },
    focusVillagers() {}, release() {},
    update(dt, t) {
      time.value = t; cheer = Math.max(0, cheer - dt);
      tex.offset.x = 0; pulse.offset.x = (t * 0.06) % 1; pulse.offset.y = (t * 0.03) % 1;
      holo.forEach((m) => { m.rotation.z += dt * m.userData.s; m.material.opacity = 0.5 + Math.sin(t * 2 + m.userData.s * 5) * 0.25 + (cheer > 0 ? 0.3 : 0); });
      l1.intensity = 55 + Math.sin(t * 3) * 10; l2.intensity = 45 + Math.cos(t * 2.4) * 10;
      for (const g of drones) { const u = g.userData; u.a += u.sp * dt; g.position.set(Math.cos(u.a) * u.r, u.alt + Math.sin(t + u.ph) * 0.6, Math.sin(u.a) * u.r); g.rotation.y = -u.a + (u.sp > 0 ? 0 : Math.PI); u.beam.rotation.x = Math.sin(t * 1.3 + u.ph) * 0.5; g.children.forEach((c) => { if (c.geometry?.type === 'CylinderGeometry') c.rotation.y += dt * 30; }); }
      if (rain) for (const m of rain) { m.userData.t.offset.y = (m.userData.t.offset.y - dt * m.userData.sp) % 1; }
      for (const o of towers) if (o.userData.spin) o.rotation.y += o.userData.spin * dt;
      // flying cars + trails
      cars.forEach((c, i) => { c.a += c.l.sp * dt * (1 + (i % 3) * 0.1); const r = c.l.r + c.off; const x = Math.cos(c.a) * r, z = Math.sin(c.a) * r, y = c.l.y + Math.sin(t + i) * 0.3; const ang = -c.a + (c.l.sp > 0 ? Math.PI : 0); _d.position.set(x, GROUND_Y + y, z); _d.rotation.set(0, ang, 0); _d.updateMatrix(); cars.body.setMatrixAt(i, _d.matrix); for (let k = 0; k < 2; k++) { _d.position.set(x, GROUND_Y + y, z); _d.rotation.set(0, ang, 0); _d.translateX(k ? -0.95 : 0.95); _d.updateMatrix(); cars.lights.setMatrixAt(i * 2 + k, _d.matrix); } if (fx && Math.random() < dt * 4) fx.emit({ p: [x, GROUND_Y + y, z], n: 1, life: 1.0, size: 0.35, size1: 0.02, color: i % 2 ? P.a : P.c, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT }); });
      cars.body.instanceMatrix.needsUpdate = cars.lights.instanceMatrix.needsUpdate = true;
      monorail.cars.forEach((g, i) => { const a = t * 0.06 - i * 0.05, R = monorail.R; g.position.set(Math.cos(a) * R, 8.3, Math.sin(a) * R); g.rotation.y = -a; });
      bills.forEach((b, i) => { if (Math.floor(t * 6) !== b.last) { b.last = Math.floor(t * 6); const g = b.g; g.fillStyle = 'rgba(0,0,0,0.85)'; g.fillRect(0, 0, 256, 128); g.strokeStyle = hexs(P.a); g.lineWidth = 2; g.strokeRect(3, 3, 250, 122); for (let k = 0; k < 18; k++) { const h = 8 + (Math.sin(t * 4 + k * 0.7 + i * 2) * 0.5 + 0.5) * 70; g.fillStyle = hexs(k % 2 ? P.a : P.b); g.fillRect(12 + k * 13, 116 - h, 9, h); } g.font = '900 24px monospace'; g.fillStyle = '#fff'; g.fillText(['NEO CITY', 'DATA FLOW', 'GAME NIGHT'][i], 14, 30); b.t.needsUpdate = true; } });
      for (let i = 0; i < 18; i++) { const on = Math.sin(t * 2.2 + bt[i]) > 0.3; blinkers.getMatrixAt(i, _d.matrix); _d.matrix.decompose(_d.position, _d.quaternion, _d.scale); _d.scale.setScalar(on ? 1 : 0.001); _d.updateMatrix(); blinkers.setMatrixAt(i, _d.matrix); } blinkers.instanceMatrix.needsUpdate = true;
      if (fx) for (const st of steam) if (Math.random() < dt * 5) fx.emit({ p: st, n: 1, v: [0.5, 2.4, 0.2], vr: 0.3, life: 3, size: 0.8, size1: 3, color: 0xbfd6e8, alpha: 0.28, alpha1: 0, drag: 0.5, frame: SPRITE.SMOKE, wind: 1 });
      if (ocean && ocean.userData.cubes) { const cb = ocean.userData.cubes; cb.userData.d.forEach((c, i) => { _d.position.set(Math.cos(c.a + t * 0.01) * c.r, GROUND_Y + c.y + Math.sin(t * 0.8 + c.ph) * 0.8, Math.sin(c.a + t * 0.01) * c.r); _d.rotation.set(t * 0.3 + c.ph, t * 0.2, 0); _d.scale.setScalar(c.sc); _d.updateMatrix(); cb.setMatrixAt(i, _d.matrix); }); cb.instanceMatrix.needsUpdate = true; }
      if (nebula) nebula.forEach((n, i) => { n.rotation.z += dt * 0.004 * (i % 2 ? 1 : -1); });

      if (fx) { dataT += dt; if (dataT > 0.05) { dataT = 0; const a = Math.random() * TAU, r = 10 + Math.random() * 18; fx.emit({ p: [Math.cos(a) * r, GROUND_Y + 0.1, Math.sin(a) * r], n: 1, v: [0, 2 + Math.random() * 2, 0], life: 3, size: 0.12, size1: 0.02, color: Math.random() < 0.5 ? P.a : P.b, alpha: 1, alpha1: 0, add: true, frame: P.rain ? [SPRITE.ZERO, SPRITE.ONE] : SPRITE.SOFT, essential: false }); } }
    },
    dispose() { scene.remove(root); engine.untuneLight(key); scene.background = null; scene.fog = null; root.traverse((o) => o.geometry?.dispose?.()); },
  };
}
