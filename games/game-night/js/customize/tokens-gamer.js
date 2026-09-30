// Gamer token skins: chunky faceted characters with glowing accents.
import * as THREE from 'three';
import { G, SKIN } from './token-kit.js';

const PI = Math.PI;

/** Voxel character from a small colour-keyed bitmap, merged into one vertex-coloured mesh. */
function voxelMesh(K, rows, palette, size = 0.085, pos = [0, 0, 0]) {
  const geos = [], H = rows.length, W = rows[0].length;
  const col = new THREE.Color();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x]; if (ch === '.') continue;
    const g = new THREE.BoxGeometry(size, size, size * 1.15).toNonIndexed();
    g.translate((x - (W - 1) / 2) * size, (H - 1 - y) * size, 0);
    col.set(palette[ch]);
    const arr = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < arr.length; i += 3) { arr[i] = col.r; arr[i + 1] = col.g; arr[i + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geos.push(g);
  }
  let total = 0; geos.forEach((g) => { total += g.attributes.position.count; });
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), C = new Float32Array(total * 3);
  let o = 0; geos.forEach((g) => { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('color', new THREE.BufferAttribute(C, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05, flatShading: true }));
  m.position.set(pos[0], pos[1], pos[2]); m.castShadow = true; K.root.add(m);
  return m;
}

export const gamer = {
  knight(K, col) {
    K.base();
    K.part(G.cyl(0.19, 0.25, 0.4, 8), K.mat(0xb7c0d0, { metal: 0.5, rough: 0.4 }), [0, 0.28, 0]);
    K.part(G.cyl(0.2, 0.2, 0.06, 8), K.mat(col), [0, 0.42, 0]);
    for (const s of [-1, 1]) K.part(G.sph(0.09, 8, 6), K.mat(0xc8d0de, { metal: 0.5 }), [s * 0.23, 0.55, 0]);
    const head = K.part(G.cyl(0.155, 0.165, 0.26, 8), K.mat(0xc8d0de, { metal: 0.55, rough: 0.35 }), [0, 0.76, 0]);
    K.part(G.dome(0.16, 8), K.mat(0xc8d0de, { metal: 0.55 }), [0, 0.89, 0]);
    K.part(G.box(0.24, 0.045, 0.06), K.mat(0x111826), [0, 0.78, 0.13]);
    K.part(G.box(0.045, 0.16, 0.05), K.mat(0x111826), [0, 0.74, 0.14]);
    const plume = K.group([0, 1.0, -0.04]); K.part(G.cone(0.06, 0.3, 6), K.mat(col), [0, 0.12, -0.08], [-0.6, 0, 0], null, plume); K.part(G.sph(0.05, 6, 6), K.mat(col), [0, 0.02, 0], null, null, plume);
    const shield = K.group([-0.3, 0.44, 0.07]); shield.rotation.y = 0.4;
    K.part(G.cyl(0.16, 0.02, 0.32, 5), K.mat(0xd9dee8, { metal: 0.4 }), [0, 0, 0], [PI, 0, 0], [1, 1, 0.22], shield);
    K.part(G.cyl(0.09, 0.09, 0.03, 5), K.mat(col), [0, 0.03, 0.03], [PI / 2, 0, 0], null, shield);
    const sword = K.group([0.28, 0.42, 0.08]); sword.rotation.z = -0.15;
    K.part(G.box(0.05, 0.5, 0.02), K.mat(0xe8eef8, { metal: 0.7, rough: 0.2 }), [0, 0.28, 0], null, null, sword); K.part(G.box(0.16, 0.035, 0.05), K.mat(0xffd23f), [0, 0.02, 0], null, null, sword);
    K.tick((t) => { plume.rotation.x = Math.sin(t * 4) * 0.2; plume.rotation.z = Math.sin(t * 2.7) * 0.15; sword.rotation.z = -0.15 + Math.sin(t * 2) * 0.05; });
    return 1.3;
  },

  marine(K, col) {
    K.base();
    for (const s of [-1, 1]) K.part(G.box(0.15, 0.26, 0.2), K.mat(0x4a5f86), [s * 0.11, 0.22, 0]);
    K.part(G.box(0.4, 0.34, 0.3), K.mat(0x5a74a0), [0, 0.52, 0]);
    K.part(G.box(0.24, 0.16, 0.04), K.mat(0x2a3550), [0, 0.54, 0.17]);
    for (const s of [-1, 1]) K.part(G.box(0.2, 0.15, 0.26), K.mat(col), [s * 0.29, 0.66, 0], [0, 0, s * -0.2]);
    const head = K.part(G.box(0.26, 0.24, 0.26), K.mat(0x5a74a0), [0, 0.86, 0]);
    K.part(G.box(0.2, 0.09, 0.04), K.emis(0x7dff6b, 2.2), [0, 0.87, 0.14]);
    K.part(G.box(0.1, 0.14, 0.12), K.mat(0x2a3550), [0, 0.64, -0.22]);
    const gun = K.group([0.24, 0.5, 0.16]); K.part(G.box(0.07, 0.09, 0.38), K.mat(0x2a2f3a, { metal: 0.6 }), [0, 0, 0.1], null, null, gun); K.part(G.box(0.05, 0.05, 0.14), K.mat(0x7a869a), [0, 0.02, 0.36], null, null, gun);
    K.tick((t) => { head.position.y = 0.86 + Math.sin(t * 2.4) * 0.01; gun.rotation.y = Math.sin(t * 1.5) * 0.1; });
    return 1.1;
  },

  speedrunner(K, col) {
    K.base();
    K.part(G.cap(0.14, 0.36, 5, 10), K.mat(col), [0, 0.52, 0.03], [0.35, 0, 0]);
    for (const s of [-1, 1]) { K.part(G.cap(0.055, 0.22, 4, 8), K.mat(0x22304a), [s * 0.09, 0.22, -0.02], [-0.5 * (s > 0 ? 1 : -0.4), 0, 0]); K.part(G.box(0.1, 0.05, 0.16), K.mat(0xffffff), [s * 0.09, 0.07, 0.04]); }
    const head = K.part(G.ico(0.17, 0), K.mat(0xffffff), [0, 0.9, 0.12], null, [1, 1, 1.15]);
    K.part(G.cone(0.1, 0.32, 5), K.mat(col), [0, 1.02, -0.06], [-1.15, 0, 0]);
    K.part(G.box(0.3, 0.08, 0.1), K.emis(0x4dd6ff, 2), [0, 0.92, 0.26]);
    const lines = [];
    for (let i = 0; i < 3; i++) { const l = K.part(G.box(0.02, 0.02, 0.46 - i * 0.08), K.emis(0xffee77, 1.6), [(i - 1) * 0.1, 0.5 + (i - 1) * 0.06, -0.42]); l.castShadow = false; lines.push(l); }
    for (const s of [-1, 1]) K.part(G.cone(0.04, 0.14, 4), K.mat(0xffffff), [s * 0.14, 0.13, -0.05], [-PI / 2, 0, s * 0.5]);
    K.tick((t) => { lines.forEach((l, i) => { l.scale.z = 0.7 + Math.abs(Math.sin(t * 14 + i * 2)) * 0.6; l.visible = Math.sin(t * 20 + i) > -0.6; }); head.rotation.z = Math.sin(t * 9) * 0.05; });
    return 1.15;
  },

  pixelhero(K, col) {
    K.base();
    const rows = [
      '...hhhh...', '..hhhhhh..', '..hssssh..', '..sesses..', '..ssssss..', '...tttt...', '..tttttt..', '.sttttttw.', '.sttbbttsw', '..tttttt..', '..pp..pp..', '..bb..bb..',
    ];
    const pal = { h: 0x5a3a1e, s: SKIN, e: 0x111111, t: col, b: 0x3a2a5a, p: 0x2a3a6a, w: 0xe8eef8 };
    const m = voxelMesh(K, rows, pal, 0.095, [0, 0.13, 0]);
    K.tick((t) => { m.position.y = 0.13 + Math.abs(Math.sin(t * 4)) * 0.06; m.rotation.y = Math.sin(t * 2) * 0.15; });
    return 1.3;
  },

  sniper(K, col) {
    K.base();
    K.part(G.cone(0.3, 0.6, 7), K.mat(0x556b2f), [0, 0.38, 0]);
    K.part(G.cyl(0.14, 0.2, 0.2, 7), K.mat(col), [0, 0.42, 0]);
    const head = K.part(G.sph(0.17, 8, 6), K.mat(0x3f5023), [0, 0.8, 0]);
    K.part(G.cone(0.2, 0.32, 7), K.mat(0x556b2f), [0, 0.92, -0.03], [-0.15, 0, 0]);
    K.part(G.box(0.2, 0.05, 0.04), K.emis(0xff4d4d, 1.6), [0, 0.8, 0.15]);
    const leaves = [];
    for (let i = 0; i < 8; i++) { const a = i * 0.8; const l = K.part(G.ico(0.055, 0), K.mat(i % 2 ? 0x6b8e3a : 0x3f5f2a), [Math.sin(a) * 0.2, 0.3 + (i % 4) * 0.13, Math.cos(a) * 0.2], null, [1, 0.6, 1]); leaves.push(l); }
    const rifle = K.group([0.16, 0.5, 0.14]); rifle.rotation.y = -0.1;
    K.part(G.box(0.06, 0.08, 0.7), K.mat(0x2a2f3a, { metal: 0.6 }), [0, 0, 0.2], null, null, rifle); K.part(G.cyl(0.035, 0.035, 0.22, 10), K.mat(0x1a1a1a), [0, 0.09, 0.15], [PI / 2, 0, 0], null, rifle);
    const lens = K.part(G.cyl(0.04, 0.04, 0.01, 12), K.emis(0x66ddff, 2.4), [0, 0.09, 0.27], [PI / 2, 0, 0], null, rifle);
    K.tick((t) => { leaves.forEach((l, i) => { l.rotation.z = Math.sin(t * 3 + i) * 0.4; }); lens.material.emissiveIntensity = 1.5 + Math.abs(Math.sin(t * 2.5)) * 1.5; rifle.rotation.x = Math.sin(t * 1.4) * 0.03; });
    return 1.2;
  },

  tank(K, col) {
    K.base(col, 0.38);
    for (const s of [-1, 1]) { K.part(G.box(0.16, 0.16, 0.66), K.mat(0x3a3f4a), [s * 0.27, 0.19, 0]); for (let i = 0; i < 4; i++) K.part(G.cyl(0.075, 0.075, 0.18, 8), K.mat(0x5a6070), [s * 0.27, 0.19, -0.24 + i * 0.16], [0, 0, PI / 2]); }
    K.part(G.box(0.4, 0.2, 0.6), K.mat(col), [0, 0.32, 0]);
    K.part(G.box(0.36, 0.06, 0.2), K.mat(0x2a2f3a), [0, 0.43, 0.26], [0.4, 0, 0]);
    const turret = K.group([0, 0.55, -0.02]);
    K.part(G.cyl(0.19, 0.22, 0.16, 8), K.mat(col), [0, 0, 0], null, null, turret); K.part(G.dome(0.17, 8), K.mat(col), [0, 0.08, 0], null, null, turret);
    const barrel = K.group([0, 0.06, 0.15], turret); K.part(G.cyl(0.045, 0.05, 0.5, 8), K.mat(0x2a2f3a, { metal: 0.6 }), [0, 0, 0.22], [PI / 2, 0, 0], null, barrel); K.part(G.cyl(0.065, 0.065, 0.06, 8), K.mat(0x1a1d24), [0, 0, 0.48], [PI / 2, 0, 0], null, barrel);
    K.part(G.sph(0.06, 8, 6), K.mat(SKIN), [-0.06, 0.15, -0.06], null, null, turret); K.part(G.dome(0.065, 8), K.mat(0x3f5023), [-0.06, 0.16, -0.06], null, null, turret);
    K.tick((t) => { turret.rotation.y = Math.sin(t * 0.9) * 0.6; barrel.position.z = 0.15 - Math.max(0, Math.sin(t * 1.8 - 2)) * 0.05; });
    return 1.0;
  },

  rogue(K, col) {
    K.base();
    K.part(G.cone(0.31, 0.72, 8), K.mat(col), [0, 0.42, 0]);
    const cape = K.part(G.cone(0.2, 0.55, 6), K.mat(0x2a1a4a), [0, 0.4, -0.16], [-0.35, 0, 0]);
    const head = K.part(G.sph(0.17, 8, 6), K.mat(0x1a1428), [0, 0.86, 0]);
    K.part(G.cone(0.22, 0.34, 7), K.mat(col), [0, 0.96, -0.03], [-0.25, 0, 0]);
    K.part(G.box(0.22, 0.13, 0.05), K.mat(0x0b0812), [0, 0.86, 0.13]);
    for (const s of [-1, 1]) K.part(G.box(0.05, 0.02, 0.02), K.emis(0xffdd44, 3), [s * 0.05, 0.87, 0.16]);
    const daggers = [];
    for (const s of [-1, 1]) { const d = K.group([s * 0.19, 0.5, 0.12]); d.rotation.set(0.2, 0, s * 0.35); K.part(G.box(0.05, 0.16, 0.02), K.mat(0x3a2a1a), [0, 0, 0], null, null, d); K.part(G.cone(0.032, 0.24, 4), K.mat(0xe8eef8, { metal: 0.7, rough: 0.2 }), [0, 0.2, 0], [0, PI / 4, 0], [1, 1, 0.4], d); daggers.push(d); }
    K.tick((t) => { cape.rotation.x = -0.35 + Math.sin(t * 3) * 0.1; daggers[0].rotation.x = 0.2 + Math.sin(t * 5) * 0.12; daggers[1].rotation.x = 0.2 + Math.sin(t * 5 + 2) * 0.12; });
    return 1.2;
  },

  dragon(K, col) {
    K.base();
    K.part(G.ico(0.27, 1), K.mat(col), [0, 0.4, 0], null, [1, 1.05, 1.1]);
    K.part(G.ico(0.2, 1), K.mat(0xfff0c8), [0, 0.36, 0.12], null, [1, 1.2, 0.7]);
    const head = K.part(G.ico(0.19, 1), K.mat(col), [0, 0.76, 0.06]);
    K.part(G.box(0.14, 0.09, 0.14), K.mat(col), [0, 0.7, 0.2]);
    for (const s of [-1, 1]) { K.part(G.cone(0.04, 0.16, 5), K.mat(0xffd166), [s * 0.1, 0.94, -0.02], [0, 0, s * -0.3]); K.part(G.sph(0.04, 6, 6), K.mat(0xffffff), [s * 0.09, 0.79, 0.19]); K.part(G.sph(0.02, 6, 6), K.mat(0x111111), [s * 0.09, 0.79, 0.225]); K.part(G.box(0.02, 0.02, 0.02), K.mat(0x2a1010), [s * 0.03, 0.72, 0.275]); }
    for (let i = 0; i < 4; i++) K.part(G.cone(0.045, 0.11, 4), K.mat(0xffd166), [0, 0.62 - i * 0.12, -0.24 - (i === 3 ? 0.02 : 0)], [-0.6 - i * 0.1, 0, 0]);
    const wings = [];
    for (const s of [-1, 1]) { const w = K.group([s * 0.2, 0.55, -0.12]); K.part(G.cone(0.22, 0.42, 3), K.mat(0xffd166), [s * 0.16, 0.12, 0], [0, 0, s * -PI / 2 - 0.3], [1, 1, 0.14], w); wings.push(w); }
    const tail = K.group([0, 0.22, -0.26]); const ts = [];
    for (let i = 0; i < 4; i++) ts.push(K.part(G.ico(0.09 - i * 0.017, 0), K.mat(col), [0, 0, 0], null, null, tail));
    const spark = K.part(G.oct(0.045), K.emis(0xffaa33, 3), [0, 0.7, 0.3]); spark.castShadow = false;
    K.tick((t) => { wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * (0.25 + Math.sin(t * 6) * 0.3); }); ts.forEach((m, i) => { m.position.set(Math.sin(t * 3 - i * 0.7) * 0.07 * (i + 1), i * 0.05, -i * 0.11); }); spark.scale.setScalar(0.2 + Math.max(0, Math.sin(t * 3)) * 1.1); head.rotation.y = Math.sin(t * 1.4) * 0.18; });
    return 1.1;
  },
};
