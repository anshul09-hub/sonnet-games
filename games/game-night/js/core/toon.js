// Cel-shading helpers: gradient ramp, toon materials and inverted-hull "ink" outlines.
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export const T = { outlines: true };

let _ramp3 = null, _ramp4 = null;
export function ramp(steps = 3) {
  if (steps === 3 && _ramp3) return _ramp3;
  if (steps === 4 && _ramp4) return _ramp4;
  const data = steps === 3 ? [95, 175, 255] : [80, 140, 205, 255];
  const t = new THREE.DataTexture(new Uint8Array(data), data.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
  if (steps === 3) _ramp3 = t; else _ramp4 = t;
  return t;
}

const _matCache = new Map();
/** Toon material, cached by colour + options so hundreds of meshes share a handful of materials. */
export function toon(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.emissiveIntensity || 0) + '|' + (opts.steps || 3) + '|' + (opts.transparent ? opts.opacity : 1) + '|' + (opts.side || 0) + '|' + (opts.flat ? 1 : 0) + '|' + (opts.vertexColors ? 1 : 0);
  let m = _matCache.get(key);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: ramp(opts.steps || 3), emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide, flatShading: !!opts.flat, vertexColors: !!opts.vertexColors });
    _matCache.set(key, m);
  }
  return m;
}
/** Standard (PBR-ish) material used by the gamer/tech looks. */
export function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.55, metalness: opts.metal ?? 0.1, emissive: opts.emissive || 0x000000, emissiveIntensity: opts.ei ?? 1, flatShading: !!opts.flat, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide });
}
export function glow(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: intensity, roughness: 0.5, metalness: 0 });
}
export function basic(color, opts = {}) {
  return new THREE.MeshBasicMaterial({ color, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: opts.depthWrite ?? true, fog: opts.fog ?? true });
}

// ---------------- outlines ----------------
const hullCache = new WeakMap();
function hullGeometry(geo) {
  let h = hullCache.get(geo);
  if (h) return h;
  h = geo.clone();
  h.deleteAttribute('normal'); if (h.attributes.uv) h.deleteAttribute('uv'); if (h.attributes.uv1) h.deleteAttribute('uv1');
  if (h.attributes.color) h.deleteAttribute('color');
  h = mergeVertices(h, 1e-3);
  h.computeVertexNormals();
  hullCache.set(geo, h);
  return h;
}
const _outMats = new Map();
function outlineMaterial(width, color) {
  const key = width + '|' + color;
  let m = _outMats.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { uW: { value: width }, uC: { value: new THREE.Color(color) } },
      vertexShader: 'uniform float uW; void main(){ vec3 p = position + normalize(normal) * uW; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: 'uniform vec3 uC; void main(){ gl_FragColor = vec4(uC, 1.0); }',
      side: THREE.BackSide, fog: false, toneMapped: false,
    });
    _outMats.set(key, m);
  }
  return m;
}
/** Adds an inverted-hull outline as a child of `mesh`. Skipped on low graphics. */
export function addOutline(mesh, width = 0.02, color = 0x1a1224) {
  if (!T.outlines || !mesh.geometry) return null;
  const hull = new THREE.Mesh(hullGeometry(mesh.geometry), outlineMaterial(width, color));
  hull.castShadow = false; hull.receiveShadow = false; hull.userData.outline = true; hull.raycast = () => {};
  mesh.add(hull);
  return hull;
}
/** Outline every mesh below `root` (except ones already outlined or flagged noOutline). */
export function outlineAll(root, width = 0.02, color = 0x1a1224) {
  if (!T.outlines) return;
  const list = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.outline && !o.userData.noOutline && !(o.material && o.material.isShaderMaterial)) list.push(o); });
  list.forEach((m) => addOutline(m, width / Math.max(0.2, avgScale(m)), color));
}
function avgScale(m) { m.updateWorldMatrix(true, false); const s = new THREE.Vector3(); m.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), s); return (s.x + s.y + s.z) / 3 || 1; }

export function mesh(geo, mat, { cast = true, receive = false, pos, rot, scale } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) typeof scale === 'number' ? m.scale.setScalar(scale) : m.scale.set(...scale);
  return m;
}

/** Canvas helper: returns a THREE.CanvasTexture drawn by fn(ctx,w,h). */
export function canvasTex(w, h, fn, { srgb = true, repeat = false, aniso = 4 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  fn(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}
