// Helpers shared by all 24 token builders: geometry shortcuts, style-aware materials, base plinth, tiny animation registry.
import * as THREE from 'three';
import { toon, std, outlineAll } from '../core/toon.js';

export const G = {
  sph: (r, w = 22, h = 16) => new THREE.SphereGeometry(r, w, h),
  cyl: (rt, rb, h, s = 20) => new THREE.CylinderGeometry(rt, rb, h, s),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  cone: (r, h, s = 20) => new THREE.ConeGeometry(r, h, s),
  tor: (R, r, a = 12, b = 28, arc = Math.PI * 2) => new THREE.TorusGeometry(R, r, a, b, arc),
  cap: (r, len, a = 6, b = 14) => new THREE.CapsuleGeometry(r, len, a, b),
  ico: (r, d = 0) => new THREE.IcosahedronGeometry(r, d),
  oct: (r) => new THREE.OctahedronGeometry(r),
  dome: (r, s = 22) => new THREE.SphereGeometry(r, s, 12, 0, Math.PI * 2, 0, Math.PI / 2), // open at bottom
  lathe: (pts, s = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), s),
};

const cache = new Map();
/** Material factory for a visual style: anime = toon + ink outlines, gamer = faceted, tech = metal + emissive accents. */
export function kit(style, playerColor) {
  const mk = (key, fn) => { const k = style + key; let m = cache.get(k); if (!m) { m = fn(); cache.set(k, m); } return m; };
  const K = {
    style, col: playerColor, anim: [], root: new THREE.Group(),
    mat(color, o = {}) {
      if (style === 'anime') return toon(color, { steps: o.steps || 3 });
      if (style === 'gamer') return mk('m' + color + (o.rough ?? '') + (o.metal ?? ''), () => std(color, { rough: o.rough ?? 0.72, metal: o.metal ?? 0.05, flat: true }));
      return mk('m' + color + (o.rough ?? '') + (o.metal ?? ''), () => std(color, { rough: o.rough ?? 0.32, metal: o.metal ?? 0.7 }));
    },
    /** emissive accent (works for all styles) */
    emis(color, i = 1.8) { return mk('e' + color + i, () => new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: i, roughness: 0.5, metalness: 0 })); },
    /** additive glow material */
    add(color, opacity = 0.6) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }); },
    glass(color, opacity = 0.45) { return mk('g' + color + opacity, () => new THREE.MeshStandardMaterial({ color, roughness: 0.1, metalness: 0.1, transparent: true, opacity, emissive: color, emissiveIntensity: 0.25 })); },
    part(geo, mat, pos, rot, scale, parent) {
      const m = new THREE.Mesh(geo, mat);
      if (pos) m.position.set(pos[0], pos[1], pos[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(scale[0], scale[1], scale[2]);
      m.castShadow = true; m.receiveShadow = false;
      (parent || K.root).add(m);
      return m;
    },
    group(pos, parent, rot) { const g = new THREE.Group(); if (pos) g.position.set(pos[0], pos[1], pos[2]); if (rot) g.rotation.set(rot[0], rot[1], rot[2]); (parent || K.root).add(g); return g; },
    /** coloured plinth: every token stands on a disc in its player colour so ownership is always readable */
    base(col = playerColor, r = 0.34) {
      const g = K.group([0, 0, 0]);
      K.part(G.cyl(r, r + 0.03, 0.075, 28), K.mat(col), [0, 0.0375, 0], null, null, g);
      K.part(G.tor(r * 0.98, 0.022, 8, 32), K.mat(0xffffff), [0, 0.076, 0], [Math.PI / 2, 0, 0], null, g);
      g.userData.plinth = true;
      return g;
    },
    tick(fn) { K.anim.push(fn); },
    /** Eyes given in token space; converted into the head's local space so they follow head animation. */
    eyes(parent, y, z, spread = 0.08, r = 0.03, color = 0x1a1224) {
      const m = K.mat(color), out = [];
      const px = parent && parent.position ? parent.position : { x: 0, y: 0, z: 0 }, sc = parent && parent.scale ? parent.scale : { x: 1, y: 1, z: 1 };
      const L = (wx, wy, wz) => [(wx - px.x) / sc.x, (wy - px.y) / sc.y, (wz - px.z) / sc.z];
      for (const sgn of [-1, 1]) {
        const e = K.part(G.sph(r, 10, 8), m, L(sgn * spread, y, z), null, [1 / sc.x, 1 / sc.y, 1 / sc.z], parent); out.push(e);
        const hl = K.part(G.sph(r * 0.35, 6, 6), K.mat(0xffffff), L(sgn * spread + r * 0.3, y + r * 0.35, z + r * 0.75), null, [1 / sc.x, 1 / sc.y, 1 / sc.z], parent); hl.userData.noOutline = true;
      }
      return out;
    },
  };
  return K;
}

/** Finish a token: outline (anime), record height, return the public token object. */
export function finish(K, height, radius = 0.36, meta = {}) {
  if (K.style === 'anime') outlineAll(K.root, 0.017, 0x1c1226);
  K.root.userData.height = height; K.root.userData.radius = radius;
  return { group: K.root, height, radius, tick: (t, dt) => { for (const f of K.anim) f(t, dt); }, ...meta };
}

export const SKIN = 0xf2c9a5;
