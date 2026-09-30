// Low-poly car built from simple shapes. Follows the physics body (interpolated) and the real
// suspension travel, with a little extra visual lean/pitch on top.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR } from './vehicle.js';
import { clamp, damp } from './util.js';
import { makeCarNumber } from './textures.js';
import { beamVert, beamFrag } from './post.js';

function extrudeProfile(pts, width, bevel = 0.05) {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  });
  g.rotateY(-Math.PI / 2); // shape x -> car z, extrusion -> -x
  g.translate((width - bevel * 2) / 2 + 0.0, 0, 0);
  g.computeVertexNormals();
  return g;
}

const shared = {};
const BODY_DY = -0.66; // profile y -> car-local y (origin is the centre of mass)

// Geometry helpers: everything is baked non-indexed so parts can be merged per material.
function T(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)));
  return g;
}
function colored(geo, color) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), cc = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function sharedGeos() {
  if (shared.ready) return shared;
  const bodyG = extrudeProfile([
    [-2.1, 0.24], [2.0, 0.22], [2.15, 0.36], [2.16, 0.52], [1.5, 0.67], [0.75, 0.79], [-0.8, 0.81], [-1.7, 0.79], [-2.12, 0.67], [-2.18, 0.44],
  ], 1.74, 0.06);
  const roofG = extrudeProfile([[-0.8, 1.19], [0.26, 1.21], [0.29, 1.28], [-0.83, 1.26]], 1.46, 0.03);
  const mirror = new THREE.BoxGeometry(0.16, 0.1, 0.12);
  const arch = new THREE.CylinderGeometry(0.47, 0.47, 0.36, 10, 1, true, -Math.PI / 2 + 0.25, Math.PI - 0.5).rotateZ(Math.PI / 2);
  const parts = [T(bodyG), T(roofG), T(mirror, 0.9, 0.9, 0.62), T(mirror, -0.9, 0.9, 0.62)];
  for (const [x, z] of [[CAR.wheelX, CAR.wheelFrontZ], [-CAR.wheelX, CAR.wheelFrontZ], [CAR.wheelX, CAR.wheelRearZ], [-CAR.wheelX, CAR.wheelRearZ]]) parts.push(T(arch, x, 0.44, z));
  shared.paint = mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; }));
  shared.glass = extrudeProfile([[-1.28, 0.8], [-0.78, 1.19], [0.24, 1.21], [0.86, 0.81]], 1.5, 0.03);
  const post = new THREE.BoxGeometry(0.06, 0.34, 0.1);
  shared.dark = mergeGeometries([
    T(new THREE.BoxGeometry(1.9, 0.05, 0.42), 0, 0.23, 2.13), T(new THREE.BoxGeometry(0.05, 0.1, 2.2), 0.93, 0.27, -0.1), T(new THREE.BoxGeometry(0.05, 0.1, 2.2), -0.93, 0.27, -0.1),
    T(post, 0.55, 0.86, -1.98), T(post, -0.55, 0.86, -1.98),
  ]);
  shared.accent = mergeGeometries([
    T(new THREE.BoxGeometry(1.7, 0.05, 0.42), 0, 1.02, -2.02, 0.12, 0, 0),
    T(new THREE.BoxGeometry(0.34, 0.012, 1.3), 0, 0.745, 1.45, 0.17, 0, 0),
  ]);
  shared.tail = new THREE.BoxGeometry(1.42, 0.09, 0.05).translate(0, 0.66, -2.2);
  shared.head = mergeGeometries([T(new THREE.BoxGeometry(0.4, 0.09, 0.05), 0.62, 0.55, 2.16), T(new THREE.BoxGeometry(0.4, 0.09, 0.05), -0.62, 0.55, 2.16)]);
  const num = new THREE.PlaneGeometry(0.4, 0.4);
  shared.numbers = mergeGeometries([T(num, 0.955, 0.54, 0.2, 0, Math.PI / 2, 0), T(num, -0.955, 0.54, 0.2, 0, -Math.PI / 2, 0)]);
  // wheel: tyre + rim + hub + spokes in one vertex-coloured mesh
  const R = CAR.wheelR;
  shared.wheel = mergeGeometries([
    colored(T(new THREE.CylinderGeometry(R, R, 0.27, 14).rotateZ(Math.PI / 2)), 0x18181b),
    colored(T(new THREE.CylinderGeometry(0.235, 0.235, 0.29, 8).rotateZ(Math.PI / 2)), 0xc9ccd4),
    colored(T(new THREE.CylinderGeometry(0.08, 0.08, 0.31, 6).rotateZ(Math.PI / 2)), 0x33363d),
    colored(T(new THREE.BoxGeometry(0.3, 0.06, 0.46)), 0x2a2c33),
    colored(T(new THREE.BoxGeometry(0.3, 0.06, 0.46), 0, 0, 0, Math.PI / 2, 0, 0), 0x2a2c33),
  ].map((g) => { g.deleteAttribute('uv'); return g; }));
  shared.wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, flatShading: true });
  shared.glassMat = new THREE.MeshStandardMaterial({ color: 0x0e141e, roughness: 0.08, metalness: 0.9, flatShading: true });
  shared.darkMat = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7, metalness: 0.2, flatShading: true });
  shared.headMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe6a8, emissiveIntensity: 3.2, roughness: 0.3 });
  shared.flameGeo = new THREE.ConeGeometry(0.15, 1.1, 7).rotateX(-Math.PI / 2).translate(0, 0, -0.55);
  shared.flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a1e, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  shared.ready = true;
  return shared;
}

export function buildCar({ color = 0xff3b30, accent = 0xffffff, number = 1, shadowsOn = true } = {}) {
  const S = sharedGeos();
  const root = new THREE.Group();
  const pivot = new THREE.Group(); // extra roll/pitch about a low roll centre
  pivot.position.y = -0.36;
  root.add(pivot);
  const inner = new THREE.Group();
  inner.position.set(0, BODY_DY + 0.36, 0);
  pivot.add(inner);

  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.12, flatShading: true });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.3, flatShading: true });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.2, roughness: 0.4 });
  const numMat = new THREE.MeshBasicMaterial({ map: makeCarNumber(number), transparent: true });
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; inner.add(m); return m; };
  add(S.paint, paint); add(S.glass, S.glassMat); add(S.dark, S.darkMat); add(S.accent, accentMat);
  add(S.tail, tailMat, false); add(S.head, S.headMat, false); add(S.numbers, numMat, false);

  // wheels (children of root, driven by suspension)
  const wheels = [];
  const wp = [[CAR.wheelX, CAR.wheelFrontZ], [-CAR.wheelX, CAR.wheelFrontZ], [CAR.wheelX, CAR.wheelRearZ], [-CAR.wheelX, CAR.wheelRearZ]];
  wp.forEach(([x, z]) => {
    const holder = new THREE.Group();
    holder.position.set(x, -0.3, z);
    const spin = new THREE.Mesh(S.wheel, S.wheelMat);
    spin.castShadow = true;
    holder.add(spin);
    root.add(holder);
    wheels.push({ holder, spin, angle: 0 });
  });

  // exhaust flames
  const flames = [];
  for (const sx of [-1, 1]) {
    const f = new THREE.Mesh(S.flameGeo, S.flameMat);
    f.position.set(sx * 0.5, 0.35, -2.2);
    f.visible = false;
    inner.add(f);
    flames.push(f);
  }

  // headlight beams (fake volumetrics)
  const beams = [];
  const beamGeo = new THREE.ConeGeometry(3.0, 26, 18, 1, true).translate(0, -13, 0).rotateX(-Math.PI / 2);
  for (const sx of [-1, 1]) {
    const bm = new THREE.Mesh(beamGeo, new THREE.ShaderMaterial({
      vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { uLen: { value: 26 }, uColor: { value: new THREE.Color(1.0, 0.86, 0.6) }, uAlpha: { value: 0.016 } },
    }));
    bm.position.set(sx * 0.62, -0.02, 2.2);
    bm.rotation.x = 0.06;
    bm.renderOrder = 4;
    root.add(bm);
    beams.push(bm);
  }

  // fake blob shadow (contact darkening under the car)
  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(2.9, 5.2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  );
  blob.material.opacity = shadowsOn ? 0.38 : 0.7;
  blob.renderOrder = 1;

  const _q = new THREE.Quaternion(), _p = new THREE.Vector3();
  const vis = {
    root, blob, tailMat, flames, wheels, paint, beams, leanZ: 0, leanX: 0, flick: 0,
    setShadows(on) { blob.material.opacity = on ? 0.38 : 0.7; },
    update(car, alpha, dt) {
      _p.lerpVectors(car.prevPos, car.pos, alpha);
      _q.slerpQuaternions(car.prevQuat, car.quat, alpha);
      root.position.copy(_p);
      root.quaternion.copy(_q);
      for (let i = 0; i < 4; i++) {
        const w = car.wheels[i];
        const susp = w.prevSusp !== undefined ? w.prevSusp + (w.susp - w.prevSusp) * alpha : w.susp;
        wheels[i].holder.position.y = CAR.hardY - susp;
        wheels[i].spin.rotation.x = w.spin;
        wheels[i].holder.rotation.y = i < 2 ? -car.steerAngle : 0;
      }
      // visual lean from yaw rate x speed and longitudinal accel
      const targetRoll = clamp(car.visYaw * car.speed * 0.0055, -0.14, 0.14);
      const targetPitch = clamp(-car.accLong * 0.0032, -0.07, 0.07);
      this.leanZ = damp(this.leanZ, targetRoll, 8, dt);
      this.leanX = damp(this.leanX, targetPitch, 8, dt);
      pivot.rotation.z = this.leanZ;
      pivot.rotation.x = this.leanX;
      const braking = (car.input.brake > 0.1 && car.speed > 1) || car.handbrake;
      tailMat.emissiveIntensity = braking ? 5.5 : 1.3;
      const b = car.boostBlend;
      this.flick += dt * 40;
      for (const f of flames) {
        f.visible = b > 0.05;
        const s = b * (0.85 + 0.35 * Math.sin(this.flick + f.position.x * 9) * Math.sin(this.flick * 1.7));
        f.scale.set(1, 1, Math.max(0.01, s * 1.8));
      }
      {
        const ground = car.groundPoint;
        if (ground) {
          blob.position.set(ground.x, ground.y + 0.04, ground.z);
          blob.rotation.y = Math.atan2(car.fwd.x, car.fwd.z);
        }
      }
    },
  };
  return vis;
}

let _blobTex;
function blobTexture() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 128, 8, 64, 128, 120);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(64, 128); g.scale(0.6, 1); g.translate(-64, -128);
  g.fillStyle = grd; g.fillRect(-60, 0, 250, 256);
  g.restore();
  _blobTex = new THREE.CanvasTexture(c);
  return _blobTex;
}
