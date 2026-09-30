// Cascaded sun/moon shadow maps. Terrain chunks share their geometry with a depth-only twin mesh;
// sheep, the player's body and tumbling debris get depth proxies that follow the real objects.
import * as THREE from 'three';
import { U } from './shaders.js';

const DEPTH_VS = `
attribute vec2 a_uv;
attribute vec4 a_col;
varying vec2 vUv;
flat varying float vFlag;
void main() {
  vec3 p = position * (1.0 / 16.0) - 1.0;
  float pk = a_col.a * 255.0;
  vFlag = floor(pk / 32.0 + 0.01);
  vUv = a_uv;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
}`;
const DEPTH_FS = `
uniform sampler2D uAtlas;
varying vec2 vUv;
flat varying float vFlag;
void main() {
  if (vFlag > 0.5) discard;                    // plants and water do not cast shadows
  if (texture2D(uAtlas, vUv).a < 0.5) discard; // leaves cast dappled shadows
  gl_FragColor = vec4(1.0);
}`;
const INST_DEPTH_VS = `
void main() { gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const INST_DEPTH_FS = `void main() { gl_FragColor = vec4(1.0); }`;

export class Shadows {
  constructor(renderer, scene) {
    this.renderer = renderer; this.mainScene = scene;
    this.scene = new THREE.Scene();
    this.enabled = false; this.cascades = 0; this.size = 2048;
    this.extents = [56, 90];
    this.cams = [new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500), new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 500)];
    this.rts = [null, null];
    this.terrainDepth = new THREE.ShaderMaterial({ uniforms: { uAtlas: U.uAtlas }, vertexShader: DEPTH_VS, fragmentShader: DEPTH_FS, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    this.instDepth = new THREE.ShaderMaterial({ vertexShader: INST_DEPTH_VS, fragmentShader: INST_DEPTH_FS });
    this.proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false });
    this.chunkMeshes = new Map();
    this.proxies = new Map();
    this.instProxies = [];
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
    this.dir = new THREE.Vector3(0, 1, 0);
  }

  // cascades: 0 = off, 1 or 2. extents in blocks (half-width of each cascade).
  configure(cascades, size, ext0, ext1) {
    this.cascades = cascades; this.enabled = cascades > 0;
    this.extents = [ext0, ext1 || ext0 * 2];
    if (size !== this.size) this.disposeTargets();
    this.size = size;
    for (let i = 0; i < 2; i++) {
      if (i < cascades && !this.rts[i]) {
        const dt = new THREE.DepthTexture(size, size); dt.type = THREE.UnsignedIntType; dt.minFilter = dt.magFilter = THREE.NearestFilter;
        this.rts[i] = new THREE.WebGLRenderTarget(size, size, { depthTexture: dt, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
      }
      if (i >= cascades && this.rts[i]) { this.rts[i].dispose(); this.rts[i] = null; }
    }
    U.uShadowOn.value = this.enabled ? 1 : 0;
    U.uCascades.value = cascades;
    U.uShadowTexel.value.set(1 / size, 1 / size);
    if (!this.enabled) { U.uShadowMap0.value = U.uShadowMap1.value = null; }
  }
  disposeTargets() { for (let i = 0; i < 2; i++) if (this.rts[i]) { this.rts[i].dispose(); this.rts[i] = null; } }

  // ---- registration of casters ----
  chunkUpdated(c) {
    if (!c.mesh) return;
    let s = this.chunkMeshes.get(c);
    if (!s) {
      s = new THREE.Mesh(c.mesh.geometry, [this.terrainDepth]);
      s.matrixAutoUpdate = false; s.position.copy(c.mesh.position); s.updateMatrix();
      this.scene.add(s); this.chunkMeshes.set(c, s);
    } else s.geometry = c.mesh.geometry;
  }
  chunkRemoved(c) {
    const s = this.chunkMeshes.get(c);
    if (s) { this.scene.remove(s); this.chunkMeshes.delete(c); }
  }
  addProxy(src) {
    if (this.proxies.has(src)) return;
    const p = new THREE.Mesh(src.geometry, this.proxyMat);
    p.matrixAutoUpdate = false; p.frustumCulled = false;
    this.scene.add(p); this.proxies.set(src, p);
  }
  removeProxy(src) {
    const p = this.proxies.get(src);
    if (p) { this.scene.remove(p); this.proxies.delete(src); }
  }
  addTree(root) { root.traverse(o => { if (o.isMesh) this.addProxy(o); }); }
  removeTree(root) { root.traverse(o => { if (o.isMesh) this.removeProxy(o); }); }
  addInstanced(src) {
    const p = new THREE.InstancedMesh(src.geometry, this.instDepth, src.instanceMatrix.count);
    p.instanceMatrix = src.instanceMatrix; p.frustumCulled = false;
    this.scene.add(p); this.instProxies.push([src, p]);
  }

  // ---- per frame ----
  update(focus, forward) {
    if (!this.enabled) return;
    const r = this.renderer;
    const prevRT = r.getRenderTarget();
    const prevAuto = r.autoClear;
    for (const [src, p] of this.proxies) { src.updateWorldMatrix(true, false); p.matrix.copy(src.matrixWorld); p.matrixWorldNeedsUpdate = true; p.visible = src.visible; }
    for (const [src, p] of this.instProxies) p.count = src.count;
    // never let the light lie too flat: shadows would stretch beyond the map
    const L = this.dir.copy(U.uSunDir.value);
    if (L.y < 0.2) { L.y = 0.2; L.normalize(); }
    for (let i = 0; i < this.cascades; i++) {
      const ext = this.extents[i], cam = this.cams[i], rt = this.rts[i];
      const center = this.tmp.copy(focus);
      if (i === 1) center.addScaledVector(forward, ext * 0.25);
      cam.left = -ext; cam.right = ext; cam.top = ext; cam.bottom = -ext; cam.near = 1; cam.far = 460; cam.updateProjectionMatrix();
      cam.position.copy(center).addScaledVector(L, 230);
      cam.lookAt(center); cam.updateMatrixWorld();
      // snap the light-space centre to whole texels so shadows do not shimmer while moving
      const texel = (2 * ext) / this.size;
      const lc = this.tmp2.copy(center).applyMatrix4(cam.matrixWorldInverse);
      const sx = Math.round(lc.x / texel) * texel - lc.x, sy = Math.round(lc.y / texel) * texel - lc.y;
      const e = cam.matrixWorld.elements;
      center.x += e[0] * sx + e[4] * sy; center.y += e[1] * sx + e[5] * sy; center.z += e[2] * sx + e[6] * sy;
      cam.position.copy(center).addScaledVector(L, 230);
      cam.lookAt(center); cam.updateMatrixWorld();
      r.setRenderTarget(rt);
      r.autoClear = true;
      r.clear();
      r.render(this.scene, cam);
      const m = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      if (i === 0) { U.uShadowMat0.value.copy(m); U.uShadowMap0.value = rt.depthTexture; }
      else { U.uShadowMat1.value.copy(m); U.uShadowMap1.value = rt.depthTexture; }
    }
    r.setRenderTarget(prevRT);
    r.autoClear = prevAuto;
  }
}
