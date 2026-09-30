// Tech token skins: brushed metal with emissive accents.
import * as THREE from 'three';
import { G } from './token-kit.js';

const PI = Math.PI;

export const tech = {
  robot(K, col) {
    K.base();
    for (const s of [-1, 1]) K.part(G.box(0.14, 0.2, 0.16), K.mat(0x7a869a), [s * 0.11, 0.2, 0]);
    K.part(G.box(0.38, 0.34, 0.28), K.mat(0xc2cad8), [0, 0.46, 0]);
    K.part(G.box(0.2, 0.14, 0.03), K.mat(col), [0, 0.48, 0.15]);
    for (const s of [-1, 1]) { K.part(G.cyl(0.05, 0.05, 0.3, 10), K.mat(0x7a869a), [s * 0.26, 0.44, 0], [0, 0, s * 0.3]); K.part(G.sph(0.07, 10, 8), K.mat(0xffd23f), [s * 0.31, 0.3, 0]); }
    const head = K.part(G.box(0.34, 0.26, 0.28), K.mat(0xd8dfeb), [0, 0.8, 0]);
    K.part(G.box(0.26, 0.15, 0.03), K.mat(0x0e1420), [0, 0.81, 0.145]);
    const eyes = [-1, 1].map((s) => K.part(G.box(0.07, 0.07, 0.02), K.emis(0x55ffee, 2.4), [s * 0.07, 0.82, 0.165]));
    const ant = K.group([0, 0.94, 0]); K.part(G.cyl(0.012, 0.012, 0.18, 6), K.mat(0x7a869a), [0, 0.09, 0], null, null, ant); const bulb = K.part(G.sph(0.045, 10, 8), K.emis(0xff4d5e, 2.4), [0, 0.2, 0], null, null, ant);
    K.tick((t) => { ant.rotation.z = Math.sin(t * 4) * 0.12; bulb.material.emissiveIntensity = 1.5 + Math.abs(Math.sin(t * 5)) * 2; const b = Math.sin(t * 0.9 * 2) > 0.94 ? 0.1 : 1; eyes.forEach((e) => { e.scale.y = b; }); head.rotation.y = Math.sin(t * 1.3) * 0.12; });
    return 1.2;
  },

  drone(K, col) {
    K.base();
    const body = K.group([0, 0.62, 0]);
    K.part(G.sph(0.2, 20, 14), K.mat(0x2b3242), [0, 0, 0], null, [1, 0.62, 1.1], body);
    K.part(G.sph(0.09, 14, 10), K.emis(col, 1.8), [0, -0.06, 0.16], null, null, body);
    K.part(G.sph(0.06, 12, 8), K.emis(0x66ddff, 2.4), [0, -0.1, 0.18], null, null, body);
    const rotors = [];
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      K.part(G.box(0.3, 0.035, 0.035), K.mat(0x596178), [sx * 0.15, 0.02, sz * 0.15], [0, sx * sz * PI / 4 * -1 + PI / 4 * 0, 0], null, body);
      const r = K.group([sx * 0.31, 0.06, sz * 0.31], body);
      K.part(G.cyl(0.04, 0.04, 0.05, 10), K.mat(0x1a1f2b), [0, 0, 0], null, null, r);
      const blade = K.part(G.cyl(0.19, 0.19, 0.008, 20), new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.22, depthWrite: false }), [0, 0.04, 0], null, null, r); blade.castShadow = false; blade.userData.noSlice = true;
      const bl = K.part(G.box(0.36, 0.01, 0.03), K.mat(0xc2cad8), [0, 0.035, 0], null, null, r);
      const led = K.part(G.sph(0.018, 6, 6), K.emis(sz > 0 ? 0x66ff88 : 0xff4d5e, 3), [0, 0.02, 0.05 * sz], null, null, r);
      rotors.push({ r, bl });
    }
    K.tick((t) => { rotors.forEach(({ bl }, i) => { bl.rotation.y = t * 40 * (i % 2 ? 1 : -1); }); body.position.y = 0.62 + Math.sin(t * 2.6) * 0.04; body.rotation.z = Math.sin(t * 1.6) * 0.06; body.rotation.x = Math.sin(t * 1.9) * 0.05; });
    return 0.9;
  },

  chip(K, col) {
    K.base();
    const chip = K.group([0, 0.55, 0]);
    K.part(G.box(0.5, 0.62, 0.13), K.mat(0x1b1f2e, { metal: 0.3, rough: 0.4 }), [0, 0, 0], null, null, chip);
    K.part(G.box(0.3, 0.3, 0.02), K.emis(col, 1.9), [0, 0.02, 0.075], null, null, chip);
    const eyes = [-1, 1].map((s) => K.part(G.box(0.05, 0.08, 0.02), K.mat(0x0a0c14), [s * 0.06, 0.04, 0.09], null, null, chip));
    K.part(G.box(0.1, 0.02, 0.02), K.mat(0x0a0c14), [0, -0.06, 0.09], null, null, chip);
    const pins = [];
    for (let i = 0; i < 5; i++) for (const s of [-1, 1]) { const p = K.part(G.box(0.1, 0.035, 0.03), K.mat(0xe0b44c, { metal: 0.9, rough: 0.25 }), [s * 0.3, -0.24 + i * 0.12, 0], null, null, chip); pins.push(p); }
    for (let i = 0; i < 4; i++) K.part(G.box(0.035, 0.1, 0.03), K.mat(0xe0b44c, { metal: 0.9, rough: 0.25 }), [-0.15 + i * 0.1, -0.36, 0], null, null, chip);
    K.part(G.cyl(0.03, 0.03, 0.02, 10), K.mat(0x0a0c14), [-0.19, 0.25, 0.07], [PI / 2, 0, 0], null, chip);
    const core = chip.children[1];
    K.tick((t) => { core.material.emissiveIntensity = 1.2 + Math.sin(t * 4) * 0.7; pins.forEach((p, i) => { p.position.x = (i % 2 ? 1 : -1) * (0.3 + Math.max(0, Math.sin(t * 6 + i * 0.7)) * 0.03); }); chip.position.y = 0.55 + Math.sin(t * 2.2) * 0.02; chip.rotation.y = Math.sin(t * 1.1) * 0.2; });
    return 1.0;
  },

  aiorb(K, col) {
    K.base();
    const orb = K.group([0, 0.62, 0]);
    K.part(G.sph(0.24, 26, 18), K.glass(0x7ad7ff, 0.32), [0, 0, 0], null, null, orb);
    const eye = K.group([0, 0, 0.16], orb);
    K.part(G.sph(0.11, 16, 12), K.mat(0xffffff, { metal: 0.1, rough: 0.3 }), [0, 0, 0], null, null, eye);
    const iris = K.part(G.cyl(0.062, 0.062, 0.02, 20), K.emis(col, 2.4), [0, 0, 0.09], [PI / 2, 0, 0], null, eye);
    K.part(G.cyl(0.03, 0.03, 0.025, 14), K.mat(0x05070c), [0, 0, 0.1], [PI / 2, 0, 0], null, eye);
    const rings = [];
    for (let i = 0; i < 3; i++) { const r = K.part(G.tor(0.34 + i * 0.04, 0.018, 8, 44), K.emis(i === 1 ? col : 0x9adfff, 1.4), [0, 0, 0], [i * 1.05, i * 0.7, 0], null, orb); r.castShadow = false; rings.push(r); }
    const sat = K.part(G.sph(0.03, 8, 6), K.emis(0xffffff, 3), [0.36, 0, 0], null, null, orb);
    K.tick((t) => { orb.position.y = 0.62 + Math.sin(t * 2) * 0.05; rings.forEach((r, i) => { r.rotation.x += 0.012 * (i + 1); r.rotation.y += 0.01 * (3 - i); }); eye.position.x = Math.sin(t * 1.3) * 0.05; eye.position.y = Math.sin(t * 1.9) * 0.04; iris.scale.set(1 + Math.sin(t * 5) * 0.15, 1, 1 + Math.sin(t * 5) * 0.15); sat.position.set(Math.cos(t * 3) * 0.4, Math.sin(t * 2) * 0.1, Math.sin(t * 3) * 0.4); });
    return 1.05;
  },

  hologram(K, col) {
    K.base(col);
    const holo = 0x4df0ff;
    const wire = (opacity = 0.7) => new THREE.MeshBasicMaterial({ color: new THREE.Color(holo).multiplyScalar(1.5), wireframe: true, transparent: true, opacity, depthWrite: false });
    const fig = K.group([0, 0, 0]);
    const parts = [];
    parts.push(K.part(G.cap(0.15, 0.36, 4, 10), wire(), [0, 0.52, 0], null, null, fig));
    parts.push(K.part(G.sph(0.14, 12, 8), wire(), [0, 0.95, 0], null, null, fig));
    for (const s of [-1, 1]) { parts.push(K.part(G.cap(0.045, 0.24, 3, 6), wire(), [s * 0.22, 0.56, 0], [0, 0, s * -0.2], null, fig)); parts.push(K.part(G.cap(0.055, 0.26, 3, 6), wire(), [s * 0.09, 0.16, 0], null, null, fig)); }
    const core = K.part(G.sph(0.05, 10, 8), K.emis(0xffffff, 3), [0, 0.56, 0], null, null, fig); core.castShadow = false;
    const scan = K.part(G.cyl(0.24, 0.24, 0.012, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(holo).multiplyScalar(1.5), transparent: true, opacity: 0.55, depthWrite: false }), [0, 0.3, 0], null, null, fig); scan.userData.noSlice = true; scan.castShadow = false;
    const beam = K.part(G.cone(0.34, 1.0, 20, 1, true), new THREE.MeshBasicMaterial({ color: holo, transparent: true, opacity: 0.09, depthWrite: false, side: THREE.DoubleSide }), [0, 0.55, 0], [PI, 0, 0]); beam.userData.noSlice = true; beam.castShadow = false;
    for (const p of parts) p.castShadow = false;
    K.tick((t) => { const fl = Math.sin(t * 40) > 0.85 || Math.sin(t * 7.3) > 0.97 ? 0.35 : 1; parts.forEach((p) => { p.material.opacity = 0.7 * fl; }); scan.position.y = 0.1 + ((t * 0.7) % 1) * 1.0; fig.rotation.y = Math.sin(t * 1.2) * 0.25; core.scale.setScalar(1 + Math.sin(t * 6) * 0.3); });
    return 1.15;
  },

  satellite(K, col) {
    K.base();
    K.part(G.box(0.34, 0.34, 0.34), K.mat(0xe0c060, { metal: 0.85, rough: 0.3 }), [0, 0.5, 0]);
    K.part(G.box(0.36, 0.06, 0.36), K.mat(col), [0, 0.5, 0]);
    K.part(G.box(0.2, 0.2, 0.03), K.mat(0x2a3040), [0, 0.5, 0.18]);
    K.part(G.sph(0.05, 8, 6), K.emis(0x66ff99, 2.6), [0.08, 0.5, 0.2]);
    const panels = [];
    for (const s of [-1, 1]) { const g = K.group([s * 0.19, 0.5, 0]); K.part(G.cyl(0.015, 0.015, 0.16, 6), K.mat(0xaab4c8), [s * 0.08, 0, 0], [0, 0, PI / 2], null, g); const p = K.part(G.box(0.34, 0.02, 0.24), new THREE.MeshStandardMaterial({ color: 0x1c3a8a, metalness: 0.7, roughness: 0.25, emissive: 0x0a2a6a, emissiveIntensity: 0.5 }), [s * 0.3, 0, 0], null, null, g); for (let i = 1; i < 3; i++) K.part(G.box(0.008, 0.022, 0.24), K.mat(0xaab4c8), [s * 0.3 + (i - 1.5) * 0.11, 0, 0], null, null, g); panels.push(g); }
    const dish = K.group([0, 0.72, -0.02]);
    K.part(G.cyl(0.015, 0.02, 0.14, 6), K.mat(0xaab4c8), [0, 0.03, 0], null, null, dish);
    K.part(G.dome(0.17, 18), K.mat(0xf0f2f8, { metal: 0.4 }), [0, 0.12, 0], [PI + 0.6, 0, 0], [1, 0.5, 1], dish);
    K.part(G.cyl(0.008, 0.008, 0.14, 4), K.mat(0xffffff), [0, 0.2, 0.06], [0.5, 0, 0], null, dish);
    K.part(G.cyl(0.01, 0.01, 0.26, 4), K.mat(0xaab4c8), [0.12, 0.72, -0.1]);
    K.tick((t) => { dish.rotation.y = Math.sin(t * 0.8) * 0.9; dish.rotation.x = Math.sin(t * 0.5) * 0.15; panels.forEach((g, i) => { g.rotation.x = Math.sin(t * 0.9 + i) * 0.12; }); });
    return 1.05;
  },

  rocket(K, col) {
    K.base();
    const r = K.group([0, 0.12, 0]);
    K.part(G.cyl(0.19, 0.2, 0.5, 20), K.mat(0xf2f5fb, { metal: 0.3, rough: 0.35 }), [0, 0.35, 0], null, null, r);
    K.part(G.cone(0.19, 0.34, 20), K.mat(col, { metal: 0.3 }), [0, 0.77, 0], null, null, r);
    K.part(G.cyl(0.2, 0.2, 0.06, 20), K.mat(col), [0, 0.15, 0], null, null, r);
    for (let i = 0; i < 3; i++) { const a = (i / 3) * PI * 2; K.part(G.box(0.03, 0.26, 0.2), K.mat(col), [Math.sin(a) * 0.25, 0.16, Math.cos(a) * 0.25], [0, a, 0], null, r); }
    K.part(G.cyl(0.075, 0.075, 0.04, 16), K.glass(0x66ddff, 0.7), [0, 0.5, 0.185], [PI / 2, 0, 0], null, r);
    K.part(G.tor(0.078, 0.014, 8, 20), K.mat(0xaab4c8, { metal: 0.8 }), [0, 0.5, 0.2], null, null, r);
    K.part(G.cyl(0.08, 0.11, 0.08, 14), K.mat(0x3a3f4a, { metal: 0.6 }), [0, 0.06, 0], null, null, r);
    const flame = K.part(G.cone(0.075, 0.3, 12), K.emis(0xff9a2a, 2.8), [0, -0.12, 0], [PI, 0, 0], null, r); flame.castShadow = false; flame.userData.noSlice = true;
    const flame2 = K.part(G.cone(0.04, 0.2, 10), K.emis(0xfff3a0, 3), [0, -0.08, 0], [PI, 0, 0], null, r); flame2.castShadow = false; flame2.userData.noSlice = true;
    K.tick((t) => { const f = 0.85 + Math.sin(t * 30) * 0.2 + Math.sin(t * 17) * 0.1; flame.scale.set(1, f, 1); flame2.scale.set(1, f * 1.1, 1); r.position.y = 0.12 + Math.abs(Math.sin(t * 2)) * 0.04; r.rotation.z = Math.sin(t * 25) * 0.008; });
    return 1.25;
  },

  serverbot(K, col) {
    K.base();
    for (const s of [-1, 1]) { K.part(G.box(0.12, 0.2, 0.14), K.mat(0x3a4256), [s * 0.11, 0.18, 0]); K.part(G.cyl(0.04, 0.04, 0.26, 8), K.mat(0x596178), [s * 0.28, 0.5, 0.02], [0, 0, s * 0.35]); K.part(G.sph(0.06, 8, 6), K.mat(0xaab4c8), [s * 0.33, 0.37, 0.02]); }
    K.part(G.box(0.44, 0.56, 0.3), K.mat(0x2b3246), [0, 0.5, 0]);
    K.part(G.box(0.03, 0.56, 0.31), K.mat(col), [0.215, 0.5, 0]); K.part(G.box(0.03, 0.56, 0.31), K.mat(col), [-0.215, 0.5, 0]);
    const leds = [];
    for (let r = 0; r < 4; r++) { K.part(G.box(0.36, 0.09, 0.02), K.mat(0x11151f), [0, 0.32 + r * 0.14, 0.155]); for (let c = 0; c < 4; c++) { const l = K.part(G.box(0.035, 0.035, 0.015), K.emis([0x7dff6b, 0xffd23f, 0x4dd6ff, 0xff4d5e][(r + c) % 4], 2.2), [-0.12 + c * 0.075, 0.32 + r * 0.14, 0.17]); leds.push(l); } }
    const head = K.part(G.box(0.3, 0.2, 0.24), K.mat(0x3a4256), [0, 0.9, 0]);
    K.part(G.box(0.22, 0.11, 0.02), K.mat(0x0a0d14), [0, 0.9, 0.125]);
    const eyes = [-1, 1].map((s) => K.part(G.box(0.05, 0.05, 0.02), K.emis(0x66ffcc, 2.6), [s * 0.055, 0.9, 0.135]));
    K.part(G.cyl(0.012, 0.012, 0.12, 6), K.mat(0x596178), [0.1, 1.06, 0]);
    K.tick((t) => { leds.forEach((l, i) => { l.material = leds[i].material; l.visible = Math.sin(t * (3 + (i % 5)) + i * 1.7) > -0.35; }); head.rotation.y = Math.sin(t * 1.6) * 0.15; eyes.forEach((e) => { e.scale.y = Math.sin(t * 1.1) > 0.96 ? 0.1 : 1; }); });
    return 1.1;
  },
};
