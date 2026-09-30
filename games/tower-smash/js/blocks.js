// Instanced rendering of every physics block, with per-instance damage cracks.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { woodTexture, stoneTexture, glassTexture, tntTexture, crackTexture, applyBoxUV } from './textures.js';

let TEX = null;
export function textures() {
  if (!TEX) TEX = { wood: woodTexture(), stone: stoneTexture(), glass: glassTexture(), tnt: tntTexture(), crack: crackTexture() };
  return TEX;
}

const _mats = {};
export function blockMaterial(kind) {
  if (_mats[kind]) return _mats[kind];
  const T = textures();
  const opts = {
    wood: { map: T.wood, roughness: 0.82, metalness: 0 },
    stone: { map: T.stone, roughness: 0.93, metalness: 0 },
    glass: { map: T.glass, roughness: 0.05, metalness: 0.05, transparent: true, opacity: 0.42, envMapIntensity: 2.4, depthWrite: false },
    sstone: { map: T.stone, roughness: 0.93, metalness: 0, color: 0xc9c2b8 },   // static (indestructible) stone
    swood: { map: T.wood, roughness: 0.85, metalness: 0, color: 0xa07f5a },     // static timber
  }[kind];
  const m = new THREE.MeshStandardMaterial(opts);
  const glass = kind === 'glass';
  m.customProgramCacheKey = () => 'blk-' + kind;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.crackMap = { value: T.crack };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aDamage;\nattribute float aSeed;\nvarying float vDamage;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvDamage = aDamage;\n#ifdef USE_MAP\nvMapUv += vec2(aSeed, fract(aSeed * 7.31));\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D crackMap;\nvarying float vDamage;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          float ck = texture2D(crackMap, vMapUv * 0.8).r;
          float dm = smoothstep(0.10, 0.85, vDamage);
          ${glass
            ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ck * dm); diffuseColor.a = min(1.0, diffuseColor.a + ck * dm * 0.7);'
            : 'diffuseColor.rgb *= 1.0 - ck * dm * 0.8;'}
        }`);
  };
  return (_mats[kind] = m);
}

let _tntMats = null;
function tntMaterials() {
  if (!_tntMats) {
    const T = textures();
    _tntMats = [
      new THREE.MeshStandardMaterial({ map: T.tnt, roughness: 0.6, metalness: 0.1 }),
      new THREE.MeshStandardMaterial({ color: 0x8a1c20, roughness: 0.7, metalness: 0.2 }),
      new THREE.MeshStandardMaterial({ color: 0x8a1c20, roughness: 0.7, metalness: 0.2 }),
    ];
  }
  return _tntMats;
}

const M4 = new THREE.Matrix4(), V3 = new THREE.Vector3(), Q4 = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function blockKey(spec) {
  return spec.mat === 'tnt' ? 'tnt' : `${spec.mat}|${spec.sx}|${spec.sy}|${spec.sz}`;
}

export class BlockVisuals {
  constructor(scene) {
    this.scene = scene;
    this.meshes = new Map();
    this.group = new THREE.Group();
    scene.add(this.group);
  }

  // create the instanced meshes needed for a list of specs
  prepare(specs) {
    const counts = new Map();
    for (const s of specs) counts.set(blockKey(s), (counts.get(blockKey(s)) || 0) + 1);
    for (const [key, n] of counts) {
      const ex = specs.find((s) => blockKey(s) === key);
      let geo, mat;
      if (ex.mat === 'tnt') {
        geo = new THREE.CylinderGeometry(0.45, 0.45, 1.0, 20, 1);
        mat = tntMaterials();
      } else {
        const size = [ex.sx, ex.sy, ex.sz];
        const r = Math.min(0.07, Math.min(...size) * 0.16);
        geo = new RoundedBoxGeometry(ex.sx, ex.sy, ex.sz, 2, r);
        applyBoxUV(geo, size, 2);
        mat = blockMaterial(ex.mat);
      }
      const mesh = new THREE.InstancedMesh(geo, mat, n);
      mesh.frustumCulled = false;
      mesh.castShadow = ex.mat !== 'glass';
      mesh.receiveShadow = true;
      if (ex.mat === 'glass') mesh.renderOrder = 3;
      geo.setAttribute('aDamage', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      const seeds = new Float32Array(n);
      for (let i = 0; i < n; i++) seeds[i] = Math.random();
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      const col = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const v = 0.9 + Math.random() * 0.18;
        mesh.setColorAt(i, col.setRGB(v, v * (0.97 + Math.random() * 0.06), v));
        mesh.setMatrixAt(i, ZERO);
      }
      mesh.userData = { next: 0 };
      this.meshes.set(key, mesh);
      this.group.add(mesh);
    }
  }

  alloc(spec) {
    const mesh = this.meshes.get(blockKey(spec));
    return { mesh, i: mesh.userData.next++ };
  }

  set(h, p, q) {
    M4.compose(V3.set(p.x, p.y, p.z), Q4.set(q.x, q.y, q.z, q.w), ONE);
    h.mesh.setMatrixAt(h.i, M4);
    h.mesh.instanceMatrix.needsUpdate = true;
  }

  setScale(h, p, q, s) {
    M4.compose(V3.set(p.x, p.y, p.z), Q4.set(q.x, q.y, q.z, q.w), V3.set(s, s, s));
    h.mesh.setMatrixAt(h.i, M4);
    h.mesh.instanceMatrix.needsUpdate = true;
  }

  damage(h, d) {
    const a = h.mesh.geometry.attributes.aDamage;
    a.array[h.i] = d; a.needsUpdate = true;
  }

  hide(h) {
    h.mesh.setMatrixAt(h.i, ZERO);
    h.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const m of this.meshes.values()) { this.group.remove(m); m.geometry.dispose(); m.dispose(); }
    this.meshes.clear();
  }
}
