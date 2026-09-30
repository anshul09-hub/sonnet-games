// Set dressing: village, windmill, dock and boat, camp, birds, butterflies, pollen.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATAPULT_X } from './config.js';
import { terrainHeight, groundY, WATER_Y } from './terrain.js';
import { rng, plasterTexture, roofTexture, woodTexture, rockTexture } from './textures.js';

const softDot = (() => {
  let t = null;
  return () => {
    if (t) return t;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
})();

export function createProps(scene, ctx) {
  const { R } = ctx;
  const root = new THREE.Group(); scene.add(root);
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
  const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.9, color: 0x8a6a4a });
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTexture(), roughness: 0.95 });
  const roofTex = roofTexture(); roofTex.repeat.set(3, 2);
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.8, side: THREE.DoubleSide });
  const stone = new THREE.MeshStandardMaterial({ map: rockTexture(), roughness: 0.95 });
  const glow = new THREE.MeshStandardMaterial({ color: 0x2a3a50, emissive: 0xffc46a, emissiveIntensity: 0.9, roughness: 0.4 });
  const put = (mesh, x, y, z, ry = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = ry; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
  const box = (w, h, d, mat) => new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(0.06, h * 0.2)), mat);
  const smokers = [];

  // ---------------------------------------------------------------- village
  function cottage(x, z, ry = 0, s = 1) {
    const y = terrainHeight(x, z) - 0.4;
    const g = new THREE.Group();
    const base = box(4.6, 0.7, 3.8, stone); base.position.y = 0.35; g.add(base);
    const walls = box(4.2, 2.5, 3.4, plaster); walls.position.y = 1.95; g.add(walls);
    let rg = new THREE.CylinderGeometry(2.95, 2.95, 5.2, 3, 1); rg.rotateZ(Math.PI / 2); rg.rotateX(-Math.PI / 2); rg.scale(1, 0.62, 1.12);
    const roof = new THREE.Mesh(rg, roofMat); roof.position.set(0, 3.55, 0); g.add(roof);
    const chim = box(0.6, 1.8, 0.6, stone); chim.position.set(1.3, 4.2, -0.5); g.add(chim);
    const door = box(0.85, 1.6, 0.12, darkWood); door.position.set(-0.7, 1.5, 1.72); g.add(door);
    const w2 = box(0.7, 0.7, 0.1, glow); w2.position.set(1.3, 2.2, 1.72); g.add(w2);
    const w3 = box(0.1, 0.7, 0.7, glow); w3.position.set(-2.12, 2.2, 0); g.add(w3);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s);
    root.add(g);
    smokers.push({ x: x + 1.3 * s, y: y + 5.2 * s, z: z - 0.5 * s, s, sprites: [] });
  }
  function haystack(x, z, s = 1) {
    const y = terrainHeight(x, z);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9b24a, roughness: 1 });
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.2, 1.3, 14), mat); c.position.y = 0.65; g.add(c);
    const t = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.1, 14), mat); t.position.y = 1.85; g.add(t);
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.position.set(x, y - 0.05, z); g.scale.setScalar(s); root.add(g);
  }
  function fence(x0, z0, x1, z1) {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.8));
    const posts = [], rails = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, y = terrainHeight(x, z);
      const p = new THREE.BoxGeometry(0.16, 1.15, 0.16); p.translate(x, y + 0.5, z); posts.push(p);
      if (i < n) {
        const t2 = (i + 1) / n, xa = x, za = z, xb = x0 + (x1 - x0) * t2, zb = z0 + (z1 - z0) * t2;
        const len = Math.hypot(xb - xa, zb - za), ang = Math.atan2(zb - za, xb - xa);
        for (const dy of [0.45, 0.85]) {
          const r = new THREE.BoxGeometry(len, 0.09, 0.07); r.rotateY(-ang); r.translate((xa + xb) / 2, (y + terrainHeight(xb, zb)) / 2 + dy, (za + zb) / 2); rails.push(r);
        }
      }
    }
    const m = new THREE.Mesh(mergeGeometries([...posts, ...rails]), wood);
    m.castShadow = true; m.receiveShadow = true; root.add(m);
  }
  [[64, -36, 0.1, 1.1], [71, -41, -0.25, 1.0], [78, -35, 0.3, 1.15], [86, -43, -0.1, 1.0]].forEach(([x, z, r, s]) => cottage(x, z, r, s));
  [[-64, -38, 0.2, 1.1], [-71, -33, -0.1, 1.0], [-58, -44, 0.35, 0.95]].forEach(([x, z, r, s]) => cottage(x, z, r, s));
  [[68, -32], [76, -31], [82, -39], [-66, -30], [-60, -37]].forEach(([x, z]) => haystack(x, z, 0.9 + R() * 0.4));
  fence(60, -30, 82, -28); fence(-72, -27, -56, -30);

  // ---------------------------------------------------------------- windmill
  const windmill = new THREE.Group();
  {
    const wx = 98, wz = -30, wy = terrainHeight(wx, wz);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 2.4, 8.5, 14), plaster); tower.position.y = 4.25;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.3, 14), darkWood); band.position.y = 5.5;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.4, 14), roofMat); cap.position.y = 9.7;
    const door = box(0.9, 1.7, 0.2, darkWood); door.position.set(0, 0.85, 2.3);
    const hub = new THREE.Group(); hub.position.set(0, 8.6, 2.0);
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xf2ead2, roughness: 0.9, side: THREE.DoubleSide });
    for (let k = 0; k < 4; k++) {
      const arm = new THREE.Group(); arm.rotation.z = k * Math.PI / 2;
      const beam = box(0.3, 9.6, 0.16, wood); beam.position.y = 4.4;
      const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 6.4), sailMat); sail.position.set(1.15, 5.2, 0.05);
      arm.add(beam, sail); hub.add(arm);
    }
    const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10), darkWood); axle.rotation.x = Math.PI / 2; hub.add(axle);
    windmill.add(tower, band, cap, door, hub);
    windmill.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    windmill.position.set(wx, wy - 0.3, wz); windmill.rotation.y = -0.35; root.add(windmill);
    windmill.userData.hub = hub;
  }

  // ---------------------------------------------------------------- dock + boat
  const boat = new THREE.Group();
  {
    const dz = 27;
    let xb = -30; for (let x = -30; x < 30; x += 0.25) { if (terrainHeight(x, dz) < WATER_Y - 0.1) { xb = x; break; } }
    const dockY = WATER_Y + 0.55, planks = [], legs = [];
    for (let i = 0; i < 24; i++) { const p = new THREE.BoxGeometry(0.42, 0.14, 2.3); p.translate(xb - 1.6 + i * 0.46, dockY, dz); planks.push(p); }
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) { const l = new THREE.CylinderGeometry(0.11, 0.13, 2.6, 8); l.translate(xb - 1.2 + i * 2, dockY - 1.2, dz + s * 1.05); legs.push(l); }
    const dm = new THREE.Mesh(mergeGeometries(planks.map((g) => g.toNonIndexed())), wood); dm.castShadow = dm.receiveShadow = true; root.add(dm);
    const lm = new THREE.Mesh(mergeGeometries(legs.map((g) => g.toNonIndexed())), darkWood); lm.castShadow = true; root.add(lm);
    // rowboat
    const sh = new THREE.Shape();
    sh.moveTo(-2.1, 0.35); sh.quadraticCurveTo(-1.5, -0.3, 0, -0.35); sh.quadraticCurveTo(1.5, -0.3, 2.2, 0.55); sh.lineTo(1.9, 0.55); sh.quadraticCurveTo(1.3, -0.1, 0, -0.15); sh.quadraticCurveTo(-1.3, -0.1, -1.8, 0.35); sh.closePath();
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 1.15, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 }), new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xc8553d, roughness: 0.6 }));
    hull.position.z = -0.57; boat.add(hull);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.08, 0.95), wood); inner.position.set(0.1, 0.02, 0); boat.add(inner);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 1.05), wood); bench.position.set(0.2, 0.32, 0); boat.add(bench);
    boat.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    boat.userData.base = new THREE.Vector3(xb + 2.6, WATER_Y + 0.12, dz + 2.6);
    boat.rotation.y = -0.25; boat.position.copy(boat.userData.base); root.add(boat);
  }

  // ---------------------------------------------------------------- catapult camp
  const fire = { sprites: [], light: null };
  {
    const cy = 6;
    // crates and barrels by the catapult
    const crate = (x, y, z, s, ry) => { const m = box(s, s, s, wood); m.position.set(x, cy + y + s / 2, z); m.rotation.y = ry; m.castShadow = m.receiveShadow = true; root.add(m); };
    crate(-36.5, 0, 4.3, 1.2, 0.2); crate(-35.1, 0, 4.8, 1.0, -0.3); crate(-36.1, 1.2, 4.4, 0.9, 0.5);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 1.15, 14), new THREE.MeshStandardMaterial({ map: woodTexture(), color: 0xb89a6c, roughness: 0.8 }));
    barrel.position.set(-34.2, cy + 0.575, 5.4); barrel.castShadow = true; root.add(barrel);
    // tent
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.6, 4, 1, true), new THREE.MeshStandardMaterial({ color: 0xe6d9b4, roughness: 0.95, side: THREE.DoubleSide }));
    tent.position.set(-29.5, cy + 1.3, 8.6); tent.rotation.y = Math.PI / 4 + 0.3; tent.castShadow = true; root.add(tent);
    const flap = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.7), new THREE.MeshStandardMaterial({ color: 0x3b2a20, side: THREE.DoubleSide }));
    flap.position.set(-28.75, cy + 0.85, 9.9); flap.rotation.y = 0.3 + Math.PI / 4 - 0.05; flap.rotation.x = -0.15; root.add(flap);
    // campfire
    const fx = -30.5, fz = 5.6;
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * 6.28, r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stone);
      r.position.set(fx + Math.cos(a) * 0.62, cy + 0.12, fz + Math.sin(a) * 0.62); r.castShadow = true; root.add(r);
    }
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 6), darkWood);
      l.position.set(fx, cy + 0.2, fz); l.rotation.z = Math.PI / 2 - 0.3; l.rotation.y = i * 1.57; l.castShadow = true; root.add(l);
    }
    const flameTex = softDot();
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, color: i < 2 ? 0xffe08a : 0xff8a30, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.position.set(fx, cy + 0.6, fz); m.renderOrder = 8; m.userData.noAO = true; root.add(m); fire.sprites.push(m);
    }
    fire.light = new THREE.PointLight(0xff9a3c, 0, 16, 1.7); fire.light.position.set(fx, cy + 1.2, fz); root.add(fire.light);
    fire.x = fx; fire.y = cy; fire.z = fz;
  }

  // ---------------------------------------------------------------- birds
  const birdN = 14;
  const birds = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.45, 0, 0, -0.35, 1.5, 0.05, 0, /*R wing*/ 0, 0, 0.45, -1.5, 0.05, 0, 0, 0, -0.35, /*L wing*/ 0.0, 0.05, 0.6, 0.12, 0, 0.1, -0.12, 0, 0.1], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color: 0x2b3038, side: THREE.DoubleSide, fog: true });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = ctx.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fph = instanceMatrix[3].x * 0.7;\ntransformed.y += sin(uTime * 9.0 + fph) * 0.55 * abs(position.x);');
    };
    const m = new THREE.InstancedMesh(g, mat, birdN); m.frustumCulled = false; m.userData.noAO = true; scene.add(m);
    const data = [];
    for (let i = 0; i < birdN; i++) data.push({ a: R() * 6.28, r: 30 + R() * 45, y: 34 + R() * 26, sp: 0.09 + R() * 0.07, ph: R() * 6.28, cx: 10 + R() * 30, cz: -80 - R() * 40 });
    return { m, data };
  })();

  // ---------------------------------------------------------------- butterflies
  const flyN = 12;
  const flies = (() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.05, 0.22, 0.34, 0.05, -0.18, 0, 0, 0, -0.32, 0.05, 0.22, -0.34, 0.05, -0.18], 3));
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = ctx.uTime;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat fph2 = instanceMatrix[3].x * 1.3;\ntransformed.y += sin(uTime * 22.0 + fph2) * 0.22 * abs(position.x) / 0.34;');
    };
    const m = new THREE.InstancedMesh(g, mat, flyN); m.frustumCulled = false; m.userData.noAO = true; scene.add(m);
    const c = new THREE.Color();
    const data = [];
    for (let i = 0; i < flyN; i++) {
      m.setColorAt(i, c.setHSL([0.08, 0.14, 0.58, 0.92][i % 4], 0.9, 0.58));
      data.push({ cx: -30 + R() * 22, cz: 6 + R() * 22, r: 2 + R() * 4, a: R() * 6.28, sp: 0.5 + R() * 0.7, y: 1.3 + R() * 1.5 });
    }
    return { m, data };
  })();

  // ---------------------------------------------------------------- pollen / dust motes
  const motes = (() => {
    const n = 260, pos = new Float32Array(n * 3), seed = [];
    for (let i = 0; i < n; i++) { seed.push([R() * 6.28, R() * 6.28, 0.3 + R()]); pos[i * 3] = -60 + R() * 130; pos[i * 3 + 1] = 3 + R() * 24; pos[i * 3 + 2] = -14 + R() * 42; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.28, map: softDot(), color: 0xfff0c0, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false });
    const p = new THREE.Points(g, mat); p.frustumCulled = false; p.userData.noAO = true; p.renderOrder = 6; scene.add(p);
    return { p, seed, base: pos.slice() };
  })();

  // chimney smoke
  const smokeTex = softDot();
  for (const s of smokers) {
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: 0xe8e8ea, transparent: true, depthWrite: false, opacity: 0, fog: true }));
      sp.userData.noAO = true; sp.renderOrder = 4; root.add(sp); s.sprites.push(sp);
    }
  }

  return {
    setDetail(q) {
      birds.m.count = q.bloom ? birdN : 6; flies.m.count = q.bloom ? flyN : 5; motes.p.visible = q.bloom;
    },
    update(t, dt, camera) {
      // windmill sails
      windmill.userData.hub.rotation.z -= dt * 0.55;
      // boat bobbing
      boat.position.y = boat.userData.base.y + Math.sin(t * 1.4) * 0.05;
      boat.rotation.z = Math.sin(t * 1.1) * 0.03; boat.rotation.x = Math.sin(t * 0.9 + 1) * 0.025;
      // campfire
      fire.sprites.forEach((s, i) => {
        const k = (t * (1.8 + i * 0.4) + i * 1.7) % 1;
        s.position.set(fire.x + Math.sin(t * 5 + i * 2) * 0.09, fire.y + 0.35 + k * (0.9 + i * 0.15), fire.z + Math.cos(t * 4 + i) * 0.09);
        const sc = (i < 2 ? 1.2 : 0.8) * (1 - k * 0.7); s.scale.set(sc, sc * 1.3, 1);
        s.material.opacity = 0.9 * (1 - k);
      });
      fire.light.intensity = 26 + Math.sin(t * 17) * 5 + Math.sin(t * 31) * 3;
      // birds
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sc = new THREE.Vector3(1, 1, 1), E = new THREE.Euler();
      for (let i = 0; i < birds.m.count; i++) {
        const b = birds.data[i]; b.a += b.sp * dt;
        const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r * 0.6, y = b.y + Math.sin(t * 0.6 + b.ph) * 2;
        E.set(0, -b.a + Math.PI, Math.sin(t * 0.7 + b.ph) * 0.25);
        M.compose(P.set(x, y, z), Q.setFromEuler(E), Sc.set(1.4, 1.4, 1.4)); birds.m.setMatrixAt(i, M);
      }
      birds.m.instanceMatrix.needsUpdate = true;
      // butterflies
      for (let i = 0; i < flies.m.count; i++) {
        const f = flies.data[i]; f.a += f.sp * dt;
        const x = f.cx + Math.cos(f.a) * f.r, z = f.cz + Math.sin(f.a * 1.3) * f.r;
        const y = terrainHeight(x, z) + f.y + Math.sin(t * 2.1 + i) * 0.4;
        E.set(0, -f.a, 0); M.compose(P.set(x, y, z), Q.setFromEuler(E), Sc.set(1, 1, 1)); flies.m.setMatrixAt(i, M);
      }
      flies.m.instanceMatrix.needsUpdate = true;
      // pollen
      if (motes.p.visible) {
        const a = motes.p.geometry.attributes.position;
        for (let i = 0; i < a.count; i++) {
          const s = motes.seed[i];
          a.setXYZ(i, motes.base[i * 3] + Math.sin(t * 0.3 * s[2] + s[0]) * 3, motes.base[i * 3 + 1] + Math.sin(t * 0.25 * s[2] + s[1]) * 1.5 + ((t * 0.3 * s[2]) % 6), motes.base[i * 3 + 2] + Math.cos(t * 0.2 * s[2] + s[0]) * 2);
        }
        a.needsUpdate = true;
      }
      // chimney smoke
      for (const s of smokers) {
        s.sprites.forEach((sp, i) => {
          const k = ((t * 0.16 + i / s.sprites.length) % 1);
          sp.position.set(s.x + k * 2.4 + Math.sin(k * 6 + i) * 0.3, s.y + k * 6, s.z);
          const sc = (0.7 + k * 2.6) * s.s; sp.scale.set(sc, sc, 1);
          sp.material.opacity = Math.sin(Math.min(1, k) * Math.PI) * 0.42;
        });
      }
    },
  };
}
