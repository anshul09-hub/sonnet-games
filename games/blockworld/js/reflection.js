// Planar reflection of the world in the sea: the scene is rendered again from a camera mirrored
// in the water plane (with an oblique near plane so nothing below the surface leaks in).
import * as THREE from 'three';
import { U, DUMMY_TEX } from './shaders.js';
import { SEA } from './blocks.js';

export const WATER_Y = SEA + 14 / 16;

export class Reflection {
  constructor(renderer, scene, mainCamera, sky, hideList) {
    this.renderer = renderer; this.scene = scene; this.main = mainCamera; this.sky = sky;
    this.hide = hideList;                 // objects that must not appear in the mirror image
    this.rt = null; this.scale = 0.5; this.enabled = false; this.active = false;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.enable(1);            // layer 1: the player's own body (visible only in reflections)
    this.clip = new THREE.Vector4(); this.q = new THREE.Vector4(); this.plane = new THREE.Plane();
    this.pos = new THREE.Vector3(); this.tgt = new THREE.Vector3(); this.up = new THREE.Vector3(); this.fwd = new THREE.Vector3();
    this.bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
  }
  configure(enabled, scale) {
    this.enabled = enabled; this.scale = scale;
    if (this.rt) { this.rt.dispose(); this.rt = null; }
    if (!enabled) U.uReflOn.value = 0;
  }
  ensure() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.round(size.x * this.scale)), h = Math.max(64, Math.round(size.y * this.scale));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    }
  }
  // returns true when a reflection was rendered this frame
  render(fogFar, transMat) {
    const mc = this.main, h = WATER_Y;
    if (!this.enabled || mc.position.y < h + 0.15) { U.uReflOn.value = 0; return false; }
    this.ensure();
    const cam = this.cam;
    mc.updateMatrixWorld();
    const me = mc.matrixWorld.elements;
    this.fwd.set(-me[8], -me[9], -me[10]).normalize();
    this.up.set(me[4], me[5], me[6]).normalize();
    this.pos.copy(mc.position);
    this.tgt.copy(this.pos).add(this.fwd);
    // mirror position, look target and up vector in the plane y = h
    cam.position.set(this.pos.x, 2 * h - this.pos.y, this.pos.z);
    cam.up.set(this.up.x, -this.up.y, this.up.z);
    cam.lookAt(this.tgt.x, 2 * h - this.tgt.y, this.tgt.z);
    cam.fov = mc.fov; cam.aspect = mc.aspect; cam.near = mc.near; cam.far = Math.max(60, fogFar + 20);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    // texture matrix: world -> reflection uv (before the oblique tweak)
    U.uReflMat.value.copy(this.bias).multiply(cam.projectionMatrix).multiply(cam.matrixWorldInverse);
    // oblique near plane clipping (keeps everything below the water out of the picture)
    this.plane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, h, 0)).applyMatrix4(cam.matrixWorldInverse);
    const clip = this.clip.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const pm = cam.projectionMatrix, q = this.q;
    q.x = (Math.sign(clip.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip.multiplyScalar(2.0 / clip.dot(q));
    pm.elements[2] = clip.x; pm.elements[6] = clip.y; pm.elements[10] = clip.z + 1.0 - 0.003; pm.elements[14] = clip.w;

    const r = this.renderer, prevRT = r.getRenderTarget();
    const saved = this.hide.map(o => o.visible);
    this.hide.forEach(o => { o.visible = false; });
    const transVis = transMat.visible; transMat.visible = false;
    const prevMap = U.uReflMap.value; U.uReflMap.value = DUMMY_TEX; U.uReflOn.value = 0;
    this.sky.place(cam.position);
    r.setRenderTarget(this.rt);
    r.autoClear = true; r.clear();
    r.render(this.scene, cam);
    r.setRenderTarget(prevRT);
    this.sky.place(mc.position);
    this.hide.forEach((o, i) => { o.visible = saved[i]; });
    transMat.visible = transVis;
    U.uReflMap.value = this.rt.texture; U.uReflOn.value = 1;
    return true;
  }
}
