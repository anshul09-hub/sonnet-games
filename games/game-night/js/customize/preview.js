// Live 3D preview for the Customize screen (stage-1 placeholder; replaced with full previews in stage 2).
import * as THREE from 'three';

export class Preview {
  constructor(engine, app) { this.engine = engine; this.app = app; this.t = 0; }
  async init() {
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x160a3a);
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100); this.camera.position.set(0, 1.6, 6); this.camera.lookAt(0, 0.8, 0);
    this.scene.add(new THREE.HemisphereLight(0xb9a5ff, 0x1a0b45, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 6, 4); this.scene.add(d);
    this.gem = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3 })); this.gem.position.y = 1; this.scene.add(this.gem);
    this.engine.setView(this.scene, this.camera); this.engine.setBloom(0.4, 0.5, 0.85);
  }
  show() {} action() {} setColor() {}
  update(dt) { this.t += dt; this.gem.rotation.y += dt; }
  dispose() {}
}
