// Anime token skins: toon shaded with ink outlines. Original designs, built from primitives.
import * as THREE from 'three';
import { G, SKIN } from './token-kit.js';

const PI = Math.PI;

export const anime = {
  samurai(K, col) {
    K.base();
    K.part(G.cyl(0.2, 0.28, 0.34, 18), K.mat(0x2a2f5e), [0, 0.25, 0]);
    K.part(G.cyl(0.19, 0.23, 0.3, 18), K.mat(col), [0, 0.56, 0]);
    K.part(G.tor(0.222, 0.02), K.mat(0xffd23f), [0, 0.45, 0], [PI / 2, 0, 0]);
    K.part(G.tor(0.2, 0.02), K.mat(0xffd23f), [0, 0.68, 0], [PI / 2, 0, 0]);
    for (const s of [-1, 1]) K.part(G.box(0.2, 0.05, 0.24), K.mat(col), [s * 0.26, 0.7, 0], [0, 0, s * -0.45]);
    const head = K.part(G.sph(0.19), K.mat(SKIN), [0, 0.88, 0]);
    K.part(G.dome(0.215), K.mat(0x8a1c2c), [0, 0.9, -0.005], [-0.12, 0, 0]);
    K.part(G.tor(0.21, 0.028), K.mat(0x8a1c2c), [0, 0.885, -0.005], [PI / 2 - 0.12, 0, 0]);
    K.part(G.cyl(0.2, 0.3, 0.09, 18), K.mat(0x6c1422), [0, 0.8, -0.07]);
    for (const s of [-1, 1]) K.part(G.tor(0.14, 0.018, 8, 18, PI * 0.85), K.mat(0xffd23f), [s * 0.02, 1.02, 0.13], [0.5, 0, s > 0 ? -0.1 : PI + 0.1]);
    K.part(G.sph(0.17, 16, 10, 0, PI * 2, PI * 0.5, PI * 0.5), K.mat(0x3a1a24), [0, 0.855, 0.03]);
    K.eyes(head, 0.9, 0.17, 0.075, 0.027);
    K.part(G.cyl(0.011, 0.011, 0.72, 6), K.mat(0xffd23f), [0.06, 0.8, -0.24]);
    const flag = K.part(G.box(0.02, 0.34, 0.24), K.mat(col), [0.06, 1.0, -0.36]);
    K.part(G.sph(0.05, 12, 8), K.mat(0xffffff), [0.075, 1.0, -0.36], null, [0.3, 1, 1]);
    K.tick((t) => { flag.rotation.y = Math.sin(t * 5) * 0.28; flag.rotation.z = Math.sin(t * 3.4) * 0.05; });
    return 1.15;
  },

  ninja(K, col) {
    K.base();
    K.part(G.cap(0.17, 0.32, 6, 14), K.mat(0x23243a), [0, 0.5, 0]);
    K.part(G.cyl(0.19, 0.19, 0.09, 18), K.mat(col), [0, 0.5, 0]);
    K.part(G.box(0.07, 0.16, 0.03), K.mat(col), [0.1, 0.36, 0.18], [0, 0, 0.1]);
    for (const s of [-1, 1]) K.part(G.cap(0.055, 0.24, 4, 8), K.mat(0x23243a), [s * 0.2, 0.52, 0.03], [0.2, 0, s * -0.55]);
    const head = K.part(G.sph(0.2, 22, 16), K.mat(0x23243a), [0, 0.86, 0]);
    K.part(G.box(0.34, 0.09, 0.14), K.mat(SKIN), [0, 0.88, 0.14]);
    K.part(G.tor(0.2, 0.03, 8, 24), K.mat(col), [0, 0.94, 0], [PI / 2 + 0.12, 0, 0]);
    for (const s of [-1, 1]) { K.part(G.sph(0.033, 10, 8), K.mat(0xffffff), [s * 0.08, 0.885, 0.205], null, [1, 1.15, 0.5]); K.part(G.sph(0.018, 8, 6), K.mat(0x111111), [s * 0.08, 0.885, 0.222]); }
    const tails = [];
    for (let i = 0; i < 4; i++) tails.push(K.part(G.box(0.1 - i * 0.012, 0.045, 0.16), K.mat(col), [0, 0.95 - i * 0.03, -0.2 - i * 0.15]));
    K.part(G.box(0.02, 0.4, 0.02), K.mat(0x9aa4b8), [-0.12, 0.62, -0.2], [0, 0, 0.5]);
    const star = K.group([0.05, 0.62, -0.2]);
    K.part(G.box(0.2, 0.02, 0.05), K.mat(0xc8d0de), null, null, null, star); K.part(G.box(0.05, 0.02, 0.2), K.mat(0xc8d0de), null, null, null, star);
    star.rotation.x = PI / 2;
    K.tick((t) => { tails.forEach((m, i) => { m.position.y = 0.95 - i * 0.03 + Math.sin(t * 6 - i) * 0.03 * (i + 1); m.rotation.x = Math.sin(t * 6 - i) * 0.25; }); head.position.y = 0.86 + Math.sin(t * 3) * 0.008; });
    return 1.1;
  },

  fox(K, col) {
    K.base();
    K.part(G.sph(0.25, 22, 16), K.mat(0xff9a3c), [0, 0.36, 0], null, [1, 1.08, 0.95]);
    K.part(G.sph(0.17, 18, 12), K.mat(0xfff1d6), [0, 0.33, 0.13], null, [1, 1.1, 0.7]);
    const head = K.part(G.sph(0.2, 22, 16), K.mat(0xff9a3c), [0, 0.7, 0.02], null, [1.15, 0.95, 1]);
    for (const s of [-1, 1]) { K.part(G.cone(0.085, 0.25, 4), K.mat(0xff9a3c), [s * 0.14, 0.93, 0], [0, PI / 4, s * -0.25]); K.part(G.cone(0.045, 0.13, 4), K.mat(0x2a1a1a), [s * 0.155, 0.99, 0.01], [0, PI / 4, s * -0.25]); K.part(G.cone(0.06, 0.16, 8), K.mat(0xfff1d6), [s * 0.2, 0.66, 0.05], [0, 0, s * -PI / 2 - 0.1]); }
    K.part(G.sph(0.08, 14, 10), K.mat(0xfff1d6), [0, 0.64, 0.18], null, [1.3, 0.8, 1]);
    K.part(G.sph(0.028, 8, 6), K.mat(0x1a1224), [0, 0.655, 0.245]);
    K.eyes(head, 0.72, 0.185, 0.085, 0.03);
    K.part(G.tor(0.17, 0.035, 8, 24), K.mat(col), [0, 0.53, 0.02], [PI / 2, 0, 0]);
    const tails = [], flames = [];
    for (let i = 0; i < 3; i++) {
      const g = K.group([0, 0.3, -0.18]); g.rotation.set(-0.5, (i - 1) * 0.55, 0);
      K.part(G.cone(0.13, 0.55, 12), K.mat(0xff9a3c), [0, 0.28, 0], [PI, 0, 0], null, g);
      K.part(G.sph(0.09, 12, 8), K.mat(0xfff1d6), [0, 0.55, 0], null, [1, 1.3, 1], g);
      const f = K.part(G.oct(0.07), K.emis(col, 2.6), [0, 0.72, 0], null, [1, 1.5, 1], g); f.castShadow = false; f.userData.noOutline = true; flames.push(f);
      tails.push(g);
    }
    K.tick((t) => { tails.forEach((g, i) => { g.rotation.z = Math.sin(t * 2.2 + i * 1.4) * 0.22; }); flames.forEach((f, i) => { f.scale.set(1, 1.4 + Math.sin(t * 9 + i * 2) * 0.35, 1); f.rotation.y = t * 3; }); head.rotation.z = Math.sin(t * 1.8) * 0.06; });
    return 1.1;
  },

  mecha(K, col) {
    K.base();
    for (const s of [-1, 1]) K.part(G.box(0.14, 0.24, 0.18), K.mat(0xdfe6f2), [s * 0.12, 0.2, 0]);
    K.part(G.box(0.4, 0.34, 0.3), K.mat(0xf2f5fb), [0, 0.5, 0]);
    K.part(G.box(0.3, 0.14, 0.03), K.mat(col), [0, 0.52, 0.16]);
    K.part(G.box(0.5, 0.06, 0.3), K.mat(0xaab4c8), [0, 0.68, 0]);
    const cannons = [];
    for (const s of [-1, 1]) { const g = K.group([s * 0.31, 0.72, 0]); K.part(G.box(0.16, 0.14, 0.2), K.mat(col), [0, 0, 0], null, null, g); K.part(G.cyl(0.04, 0.045, 0.3, 10), K.mat(0x596178), [0, 0.06, 0.12], [PI / 2 - 0.5, 0, 0], null, g); cannons.push(g); }
    const dome = K.part(G.dome(0.22, 24), K.glass(0x7fe9ff, 0.5), [0, 0.7, 0.02]);
    K.part(G.sph(0.09, 14, 10), K.mat(SKIN), [0, 0.8, 0.02]); K.part(G.dome(0.1, 14), K.mat(0x3a2a5a), [0, 0.82, 0.02]);
    K.part(G.cone(0.06, 0.22, 4), K.mat(col), [0, 1.0, -0.06], [-0.3, PI / 4, 0]);
    for (const s of [-1, 1]) K.part(G.box(0.03, 0.28, 0.05), K.mat(0xffd23f), [s * 0.1, 1.02, -0.02], [0, 0, s * -0.5]);
    K.tick((t) => { cannons.forEach((g, i) => { g.rotation.y = Math.sin(t * 1.4 + i * PI) * 0.35; }); dome.material.opacity = 0.42 + Math.sin(t * 3) * 0.08; });
    return 1.15;
  },

  mahou(K, col) {
    K.base();
    K.part(G.cone(0.3, 0.5, 20), K.mat(col), [0, 0.36, 0]);
    for (const y of [0.16, 0.3]) K.part(G.tor(0.27 - (y - 0.16) * 0.6, 0.035, 8, 24), K.mat(0xffffff), [0, y, 0], [PI / 2, 0, 0]);
    K.part(G.cyl(0.1, 0.13, 0.16, 14), K.mat(0xfff5ee), [0, 0.68, 0]);
    K.part(G.tor(0.11, 0.028, 8, 20), K.mat(0xffd23f), [0, 0.62, 0], [PI / 2, 0, 0]);
    const head = K.part(G.sph(0.2, 22, 16), K.mat(SKIN), [0, 0.9, 0]);
    K.part(G.sph(0.225, 22, 16, 0, PI * 2, 0, PI * 0.62), K.mat(0xff9fce), [0, 0.92, -0.01], [-0.2, 0, 0]);
    K.part(G.cyl(0.05, 0.02, 0.09, 8), K.mat(0xff9fce), [0, 0.98, 0.19], [0.5, 0, 0]);
    const tails = [];
    for (const s of [-1, 1]) { const g = K.group([s * 0.2, 0.95, -0.02]); K.part(G.cap(0.06, 0.28, 4, 10), K.mat(0xff9fce), [s * 0.02, -0.16, -0.03], [0, 0, s * 0.15], null, g); K.part(G.sph(0.06, 10, 8), K.mat(col), [0, 0, 0], null, [1.4, 1, 1], g); tails.push(g); }
    K.eyes(head, 0.9, 0.175, 0.075, 0.032, 0x5a2a7a);
    const wand = K.group([0.28, 0.5, 0.1]); K.part(G.cyl(0.014, 0.014, 0.5, 6), K.mat(0xffe08a), [0, 0.15, 0], null, null, wand);
    const star = K.part(G.oct(0.11), K.emis(0xffe066, 2.4), [0, 0.46, 0], null, [1, 1, 0.45], wand); star.userData.noOutline = true;
    K.tick((t) => { wand.rotation.z = -0.35 + Math.sin(t * 2.4) * 0.18; wand.rotation.x = Math.sin(t * 1.7) * 0.15; star.rotation.z = t * 2; star.scale.setScalar(1 + Math.sin(t * 6) * 0.12); tails.forEach((g, i) => { g.rotation.z = Math.sin(t * 2.6 + i * 2) * 0.16; }); });
    return 1.2;
  },

  oni(K, col) {
    K.base();
    K.part(G.sph(0.3, 24, 18), K.mat(col), [0, 0.42, 0], null, [1, 1.05, 0.95]);
    K.part(G.cyl(0.29, 0.32, 0.12, 20), K.mat(0xffd23f), [0, 0.28, 0]);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * PI * 2; K.part(G.box(0.06, 0.12, 0.02), K.mat(0x1a1224), [Math.sin(a) * 0.305, 0.28, Math.cos(a) * 0.305], [0, a, 0]); }
    const head = K.part(G.sph(0.22, 22, 16), K.mat(col), [0, 0.82, 0.02], null, [1.1, 0.95, 1]);
    for (const s of [-1, 1]) {
      K.part(G.cone(0.05, 0.2, 10), K.mat(0xfff0cf), [s * 0.11, 1.04, 0], [0, 0, s * -0.25]);
      K.part(G.box(0.12, 0.03, 0.04), K.mat(0x1a1224), [s * 0.08, 0.92, 0.2], [0, 0, s * -0.4]);
      K.part(G.cone(0.028, 0.09, 8), K.mat(0xffffff), [s * 0.07, 0.68, 0.2], [PI, 0, 0]);
      K.part(G.sph(0.07, 10, 8), K.mat(col), [s * 0.26, 0.82, 0.02]);
    }
    K.part(G.sph(0.035, 8, 6), K.mat(0x8a1c2c), [0, 0.78, 0.235], null, [1.4, 0.8, 0.8]);
    K.eyes(head, 0.86, 0.2, 0.08, 0.03, 0xffe066);
    const club = K.group([0.32, 0.5, 0.06]); club.rotation.z = -0.5;
    K.part(G.cyl(0.05, 0.11, 0.62, 10), K.mat(0x8b5a2b), [0, 0.28, 0], null, null, club);
    for (let i = 0; i < 6; i++) { const a = i * 1.05; K.part(G.cone(0.028, 0.06, 6), K.mat(0x9aa4b8), [Math.sin(a) * 0.09, 0.36 + (i % 3) * 0.1, Math.cos(a) * 0.09], [Math.cos(a) * 1.5, 0, -Math.sin(a) * 1.5], null, club); }
    K.tick((t) => { club.rotation.z = -0.5 + Math.sin(t * 2.2) * 0.08; head.rotation.y = Math.sin(t * 1.3) * 0.15; });
    return 1.12;
  },

  ronincat(K, col) {
    K.base();
    K.part(G.cap(0.19, 0.26, 6, 14), K.mat(0xf0a868), [0, 0.42, 0]);
    K.part(G.cone(0.32, 0.5, 20), K.mat(col), [0, 0.42, 0]);
    K.part(G.sph(0.11, 12, 8), K.mat(0xfff0da), [0, 0.5, 0.17], null, [1, 1.2, 0.6]);
    const head = K.part(G.sph(0.2, 22, 16), K.mat(0xf0a868), [0, 0.82, 0], null, [1.12, 0.95, 1]);
    for (const s of [-1, 1]) K.part(G.cone(0.075, 0.16, 4), K.mat(0xf0a868), [s * 0.14, 0.99, -0.02], [0, PI / 4, s * -0.3]);
    K.part(G.cyl(0.02, 0.3, 0.16, 24), K.mat(0xe8cf8a), [0, 1.03, 0]);
    K.part(G.cyl(0.3, 0.32, 0.035, 28), K.mat(0xe8cf8a), [0, 0.965, 0]);
    K.part(G.tor(0.31, 0.012, 6, 30), K.mat(0xb08a3a), [0, 0.985, 0], [PI / 2, 0, 0]);
    K.eyes(head, 0.82, 0.185, 0.08, 0.026);
    K.part(G.sph(0.03, 8, 6), K.mat(0xff8fab), [0, 0.775, 0.215]);
    for (const s of [-1, 1]) for (const k of [0, 1]) K.part(G.cyl(0.006, 0.006, 0.16, 4), K.mat(0xffffff), [s * 0.17, 0.77 - k * 0.025, 0.2], [0, 0, PI / 2 + s * (k - 0.5) * 0.3]);
    const sword = K.group([-0.24, 0.42, 0.06]); sword.rotation.set(0, 0, -1.2);
    K.part(G.box(0.04, 0.16, 0.04), K.mat(0x3a2a1a), [0, 0.02, 0], null, null, sword); K.part(G.box(0.03, 0.42, 0.012), K.mat(0xdfe6f2), [0, 0.3, 0], null, null, sword); K.part(G.box(0.1, 0.02, 0.06), K.mat(0xffd23f), [0, 0.11, 0], null, null, sword);
    const tail = K.group([0, 0.32, -0.2]); const segs = [];
    for (let i = 0; i < 5; i++) segs.push(K.part(G.sph(0.07 - i * 0.004, 10, 8), K.mat(0xf0a868), [0, 0, 0], null, null, tail));
    K.tick((t) => { segs.forEach((m, i) => { const a = Math.sin(t * 3 - i * 0.6) * 0.09 * (i + 1); m.position.set(a, i * 0.11 + 0.02, -i * 0.05); }); head.rotation.z = Math.sin(t * 1.5) * 0.05; });
    return 1.05;
  },

  skypirate(K, col) {
    K.base();
    K.part(G.cap(0.18, 0.3, 6, 14), K.mat(col), [0, 0.45, 0]);
    K.part(G.tor(0.185, 0.03, 8, 20), K.mat(0xffd23f), [0, 0.5, 0], [PI / 2, 0, 0]);
    for (const y of [0.4, 0.55]) K.part(G.sph(0.028, 8, 6), K.mat(0xffd23f), [0, y, 0.18]);
    const head = K.part(G.sph(0.19, 22, 16), K.mat(SKIN), [0, 0.86, 0]);
    K.part(G.sph(0.14, 12, 10, 0, PI * 2, PI * 0.5, PI * 0.5), K.mat(0x4a2a1a), [0, 0.82, 0.055]);
    K.part(G.cyl(0.21, 0.27, 0.06, 3), K.mat(0x22223b), [0, 0.99, 0], [0, PI / 6, 0], [1.05, 1, 0.8]);
    K.part(G.dome(0.17, 16), K.mat(0x22223b), [0, 1.0, 0]);
    K.part(G.tor(0.23, 0.014, 6, 3), K.mat(0xffd23f), [0, 0.995, 0], [PI / 2, 0, PI / 6]);
    K.part(G.sph(0.045, 10, 8), K.mat(0x111111), [0.075, 0.9, 0.17], null, [1, 1, 0.5]);
    K.part(G.box(0.2, 0.012, 0.02), K.mat(0x111111), [0.0, 0.93, 0.18], [0, 0, -0.25]);
    K.part(G.sph(0.03, 10, 8), K.mat(0xffffff), [-0.075, 0.9, 0.175]); K.part(G.sph(0.015, 6, 6), K.mat(0x111111), [-0.075, 0.9, 0.2]);
    const bal = K.group([-0.02, 1.3, -0.05]); K.part(G.sph(0.16, 22, 16), K.mat(col), [0, 0.06, 0], null, [1, 1.2, 1], bal); K.part(G.tor(0.16, 0.018, 6, 20), K.mat(0xffffff), [0, 0.06, 0], [PI / 2, 0, 0], null, bal);
    for (const s of [-1, 1]) K.part(G.cyl(0.005, 0.005, 0.26, 4), K.mat(0x3a2a1a), [s * 0.08, -0.13, 0], [0, 0, s * 0.35], null, bal);
    const prop = K.group([0, 0.55, -0.24]); K.part(G.box(0.16, 0.16, 0.08), K.mat(0x8a6a3a), [0, 0, 0], null, null, prop);
    const blades = K.group([0, 0, -0.06], prop); K.part(G.box(0.3, 0.03, 0.01), K.mat(0xc8d0de), null, null, null, blades); K.part(G.box(0.03, 0.3, 0.01), K.mat(0xc8d0de), null, null, null, blades);
    K.tick((t) => { bal.position.y = 1.3 + Math.sin(t * 2) * 0.03; bal.rotation.z = Math.sin(t * 1.4) * 0.06; blades.rotation.z = t * 22; });
    return 1.5;
  },
};
