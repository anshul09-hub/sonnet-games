// The player's catapult: built from boxes and cylinders, with a swinging arm.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATAPULT_X } from './config.js';
import { groundY } from './terrain.js';
import { blockMaterial } from './blocks.js';
import { applyBoxUV } from './textures.js';
import { makeProjectileMesh } from './parts.js';

export const ARM = { L: 3.4, px: 0.3, py: 2.7, offset: 0.5 };
const D2R = Math.PI / 180;

const iron = () => new THREE.MeshStandardMaterial({ color: 0x3d434b, metalness: 0.7, roughness: 0.45 });

function beam(sx, sy, sz, x, y, z, mat, parent) {
  const g = new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(0.05, Math.min(sx, sy, sz) * 0.2));
  applyBoxUV(g, [sx, sy, sz], 2);
  const m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
}

export class Catapult {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.position.set(CATAPULT_X, groundY(CATAPULT_X), 0);
    scene.add(this.root);
    const wood = blockMaterial('swood');
    const dark = new THREE.MeshStandardMaterial({ color: 0x6b4526, roughness: 0.85 });
    const fe = iron();

    // frame
    for (const z of [-1.05, 1.05]) beam(5.4, 0.36, 0.38, 0, 0.95, z, wood, this.root);
    for (const x of [-2.4, 0.2, 2.5]) beam(0.36, 0.32, 2.5, x, 0.95, 0, wood, this.root);
    // uprights + braces
    for (const z of [-0.95, 0.95]) {
      beam(0.42, 2.0, 0.4, ARM.px, 1.95, z, wood, this.root);
      for (const s of [-1, 1]) {
        const b = beam(0.26, 2.15, 0.3, ARM.px + s * 0.85, 1.75, z, dark, this.root);
        b.rotation.z = -s * 0.42;
      }
    }
    beam(0.3, 0.3, 2.35, ARM.px, 3.05, 0, wood, this.root);
    // axle
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.7, 12), fe);
    axle.rotation.x = Math.PI / 2; axle.position.set(ARM.px, ARM.py, 0); axle.castShadow = true;
    this.root.add(axle);
    // wheels
    for (const x of [-1.9, 1.9]) for (const z of [-1.5, 1.5]) {
      const wg = new THREE.Group();
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.28, 20), dark);
      disc.rotation.x = Math.PI / 2; disc.castShadow = true; wg.add(disc);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.07, 8, 24), fe);
      wg.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), fe);
      hub.rotation.x = Math.PI / 2; wg.add(hub);
      for (let k = 0; k < 4; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.32), wood);
        sp.rotation.z = k * Math.PI / 4; wg.add(sp);
      }
      wg.position.set(x, 0.85, z);
      this.root.add(wg);
    }
    // windlass at the back
    this.windlass = new THREE.Group();
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 1.6, 12), wood);
    drum.rotation.x = Math.PI / 2; this.windlass.add(drum);
    for (let k = 0; k < 4; k++) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), dark);
      h.rotation.z = k * Math.PI / 2; h.position.z = 0.95; this.windlass.add(h);
    }
    this.windlass.position.set(-2.1, 1.55, 0);
    this.root.add(this.windlass);
    for (const z of [-0.9, 0.9]) beam(0.25, 0.9, 0.25, -2.1, 1.2, z, wood, this.root);

    // arm
    this.arm = new THREE.Group();
    this.arm.position.set(ARM.px, ARM.py, 0);
    beam(ARM.L + 1.0, 0.34, 0.42, (ARM.L - 1.0) / 2, 0, 0, wood, this.arm);
    // bucket (half cylinder, solid on local +y, opening toward local -y)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 1.2, 20, 1, true, Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.8, side: THREE.DoubleSide, map: wood.map }));
    bucket.rotation.x = Math.PI / 2; bucket.position.set(ARM.L, -0.1, 0); bucket.castShadow = true;
    this.arm.add(bucket);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.05, 6, 16, Math.PI), fe);
    band.position.set(ARM.L, -0.1, 0.6); band.rotation.z = Math.PI / 2 * 3; this.arm.add(band);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.7), fe);
    counter.position.set(-0.85, 0, 0); counter.castShadow = true; this.arm.add(counter);
    this.root.add(this.arm);

    // rope from arm to windlass
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshStandardMaterial({ color: 0xd8c08a, roughness: 1 }));
    this.rope2 = this.rope.clone();
    this.root.add(this.rope, this.rope2);

    // banner
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.2, 8), dark);
    pole.position.set(-2.4, 2.5, 1.2); this.root.add(pole);
    const cg = new THREE.PlaneGeometry(1.5, 0.9, 10, 4); cg.translate(0.75, 0, 0);
    this.banner = new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x2f7fe0, side: THREE.DoubleSide, roughness: 0.8 }));
    this.banner.position.set(-2.4, 3.6, 1.2); this.banner.castShadow = true;
    this.banner.userData.base = cg.attributes.position.array.slice();
    this.root.add(this.banner);

    // ammo pile
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x8b8f96, roughness: 0.95, flatShading: true });
    [[-3.6, 0.45, 0.8], [-4.2, 0.45, -0.4], [-3.7, 0.45, -1.3], [-3.9, 1.15, 0.1]].forEach(([x, y, z]) => {
      const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), rockMat);
      r.position.set(x, y, z); r.castShadow = true; this.root.add(r);
    });

    this.armAngle = 0; this.armTarget = 0;
    this.alpha = 48 * D2R; this.power = 0;
    this.state = 'idle'; this.t = 0; this.onLaunch = null;
    this.ball = null; this.ballType = null;
    this.kick = 0;
    this.setAim(this.alpha, 0, true);
  }

  get pivotWorld() { return new THREE.Vector3(this.root.position.x + ARM.px, this.root.position.y + ARM.py, 0); }

  stopAngle(alpha) { return alpha + Math.PI / 2; }
  idleAngle(alpha, power) { return this.stopAngle(alpha) + (35 + 75 * power) * D2R; }

  originFor(alpha) {
    const p = this.pivotWorld, fs = this.stopAngle(alpha);
    return {
      x: p.x + ARM.L * Math.cos(fs) + ARM.offset * Math.cos(alpha),
      y: p.y + ARM.L * Math.sin(fs) + ARM.offset * Math.sin(alpha),
      z: 0,
    };
  }

  reset() { this.state = 'idle'; this.t = 0; this.onLaunch = null; this.kick = 0; }

  setLoaded(type) {
    if (this.ball) { this.root.remove(this.ball); this.ball = null; }
    this.ballType = type;
    if (type) {
      this.ball = makeProjectileMesh(type === 'bit' ? 'rock' : type);
      this.root.add(this.ball);
      this.placeBall();
    }
  }

  setAim(alpha, power, snap = false) {
    this.alpha = alpha; this.power = power;
    if (this.state === 'idle' || this.state === 'aim') {
      this.armTarget = this.idleAngle(alpha, power);
      if (snap) this.armAngle = this.armTarget;
    }
  }

  fire(alpha, onLaunch) {
    this.state = 'release'; this.t = 0; this.fromAngle = this.armAngle;
    this.toAngle = this.stopAngle(alpha); this.onLaunch = onLaunch; this.launched = false;
    this.alphaFire = alpha;
  }

  placeBall() {
    if (!this.ball) return;
    const f = this.armAngle, r = this.ballType ? 0.55 : 0.55;
    this.ball.position.set(ARM.px + ARM.L * Math.cos(f) + ARM.offset * Math.sin(f),
      ARM.py + ARM.L * Math.sin(f) - ARM.offset * Math.cos(f), 0);
    this.ball.rotation.z = f;
  }

  update(dt, time) {
    if (this.state === 'release') {
      this.t += dt;
      const k = Math.min(1, this.t / 0.11);
      const e = k * k;
      this.armAngle = this.fromAngle + (this.toAngle - this.fromAngle) * e;
      if (k >= 1 && !this.launched) {
        this.launched = true; this.kick = 1;
        this.onLaunch && this.onLaunch();
        this.setLoaded(null);
        this.state = 'recoil'; this.t = 0;
      }
    } else if (this.state === 'recoil') {
      this.t += dt;
      this.armAngle = this.toAngle + 7 * D2R * Math.exp(-7 * this.t) * Math.cos(26 * this.t);
      if (this.t > 0.9) { this.state = 'idle'; this.armTarget = this.armAngle; }
    } else {
      const k = 1 - Math.exp(-dt * 9);
      this.armAngle += (this.armTarget - this.armAngle) * k;
    }
    this.arm.rotation.z = this.armAngle;
    this.placeBall();
    this.kick = Math.max(0, this.kick - dt * 3);
    this.root.rotation.z = -this.kick * 0.03 * Math.cos(this.kick * 9);
    this.windlass.rotation.z = -this.armAngle * 2.5;
    // ropes
    const a = this.armAngle;
    const ax = ARM.px + Math.cos(a) * 1.6, ay = ARM.py + Math.sin(a) * 1.6;
    for (const [rope, z] of [[this.rope, 0.5], [this.rope2, -0.5]]) {
      const bx = -2.1, by = 1.55;
      const dx = ax - bx, dy = ay - by, len = Math.hypot(dx, dy);
      rope.position.set((ax + bx) / 2, (ay + by) / 2, z);
      rope.scale.set(1, len, 1);
      rope.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    }
    // banner wave
    const pos = this.banner.geometry.attributes.position, b = this.banner.userData.base;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], k2 = x / 1.5;
      pos.setZ(i, Math.sin(x * 3.6 - time * 5) * 0.12 * k2);
    }
    pos.needsUpdate = true;
    this.banner.geometry.computeVertexNormals();
  }
}
