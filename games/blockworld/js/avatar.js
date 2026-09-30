// The player's own blocky body. First-person camera never draws it (layer 1), but it casts the
// player's shadow on the ground and shows up in water reflections.
import * as THREE from 'three';
import { makeEntityMaterial } from './shaders.js';

export class Avatar {
  constructor(scene, shadows) {
    const g = this.group = new THREE.Group();
    const mat = (hex) => makeEntityMaterial(null, new THREE.Color(hex));
    const skin = mat(0xd9a877), shirt = mat(0x2f7f8f), pants = mat(0x3a3f7a), hair = mat(0x4a3320), shoe = mat(0x2a2a2e);
    const box = (w, h, d, m, x, y, z, parent) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); mesh.position.set(x, y, z); (parent || g).add(mesh); return mesh; };
    this.torso = new THREE.Group(); this.torso.position.set(0, 1.05, 0); g.add(this.torso);
    box(0.5, 0.7, 0.28, shirt, 0, 0, 0, this.torso);
    this.head = new THREE.Group(); this.head.position.set(0, 0.5, 0); this.torso.add(this.head);
    box(0.44, 0.44, 0.44, skin, 0, 0.24, 0, this.head);
    box(0.46, 0.14, 0.46, hair, 0, 0.42, 0.0, this.head);
    this.armL = new THREE.Group(); this.armL.position.set(-0.36, 0.3, 0); this.torso.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.36, 0.3, 0); this.torso.add(this.armR);
    box(0.2, 0.66, 0.22, shirt, 0, -0.3, 0, this.armL); box(0.2, 0.66, 0.22, shirt, 0, -0.3, 0, this.armR);
    this.legL = new THREE.Group(); this.legL.position.set(-0.13, 0.72, 0); g.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.13, 0.72, 0); g.add(this.legR);
    box(0.24, 0.72, 0.26, pants, 0, -0.36, 0, this.legL); box(0.24, 0.72, 0.26, pants, 0, -0.36, 0, this.legR);
    box(0.25, 0.1, 0.3, shoe, 0, -0.68, 0.02, this.legL); box(0.25, 0.1, 0.3, shoe, 0, -0.68, 0.02, this.legR);
    g.traverse(o => o.layers.set(1));
    scene.add(g);
    if (shadows) shadows.addTree(g);
    this.phase = 0; this.lean = 0;
  }

  update(player, dt) {
    const e = player.e, v = player.vel;
    const g = this.group;
    g.position.set(e.x, e.y, e.z);
    g.rotation.y = player.yaw;
    const hs = Math.hypot(v.x, v.z);
    const fly = player.flying;
    this.phase += dt * (hs > 0.5 && player.onGround ? hs * 1.6 : 0);
    const swing = Math.sin(this.phase * 1.6) * Math.min(0.9, hs * 0.16);
    const targetLean = fly ? Math.min(1.25, 0.2 + hs * 0.05) : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    this.torso.rotation.x = -this.lean;          // lean forward (-z is forward)
    this.torso.position.y = 1.05 - this.lean * 0.18;
    this.head.rotation.x = player.pitch * 0.8 + this.lean * 0.9;
    if (fly) {
      this.armL.rotation.x = 0.5 + this.lean * 0.6; this.armR.rotation.x = 0.5 + this.lean * 0.6;
      this.legL.rotation.x = 0.25; this.legR.rotation.x = 0.35;
    } else {
      this.armL.rotation.x = swing; this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing; this.legR.rotation.x = swing;
      if (!player.onGround) { this.legL.rotation.x = -0.4; this.legR.rotation.x = 0.4; this.armL.rotation.x = -0.6; this.armR.rotation.x = -0.6; }
    }
  }
}
