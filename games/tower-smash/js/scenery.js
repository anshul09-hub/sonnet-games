// The bright stylised world: sky, hills, river, trees, grass, clouds.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE, CATAPULT_X } from './config.js';
import { terrainHeight, groundY, WATER_Y, vnoise } from './terrain.js';
import { rng } from './textures.js';

export const SKY = { top: 0x3f8fe6, mid: 0x86c9f4, horizon: 0xe4f4f4, fog: 0xcfeaf3 };

const TONE = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

function skyMaterial(sunDir) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) },
      horizon: { value: new THREE.Color(SKY.horizon) }, sunDir: { value: sunDir },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, 0.0, 1.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, top, smoothstep(0.18, 0.85, h));
        float s = max(dot(d, sunDir), 0.0);
        col += vec3(1.0,0.86,0.62) * pow(s, 24.0) * 0.28 + vec3(1.0,0.92,0.75) * pow(s, 700.0) * 2.2;
        gl_FragColor = vec4(col, 1.0);
        ${TONE}
      }`,
  });
}

export function createScenery(scene, renderer) {
  const R = rng(2024);
  const sunDir = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();
  const uTime = { value: 0 };

  // ---- sky dome + environment map for reflections ----
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const sky = new THREE.Mesh(skyGeo, skyMaterial(sunDir));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  {
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(skyGeo, skyMaterial(sunDir)));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x7fae58 }));
    ground.position.y = -20;
    envScene.add(ground);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = 0.55;
    pm.dispose();
  }

  // ---- terrain ----
  const TX = 340, TZ = 270, TCX = 0, TCZ = -35;
  const tGeo = new THREE.PlaneGeometry(TX, TZ, 240, 190).rotateX(-Math.PI / 2).translate(TCX, 0, TCZ);
  {
    const pos = tGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color(), tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const e = 0.8;
      const sl = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
      const n = vnoise(x * 0.09, z * 0.09), n2 = vnoise(x * 0.5, z * 0.5);
      c.set(0x7bc846).lerp(tmp.set(0x5ab13b), n).lerp(tmp.set(0x9ade54), n2 * 0.35);
      const far = THREE.MathUtils.smoothstep(-z, LANE + 10, LANE + 120);
      c.lerp(tmp.set(0x3f8f3a), far * 0.55);
      if (h > 16) c.lerp(tmp.set(0x8a9a6a), Math.min(1, (h - 16) / 16));
      c.lerp(tmp.set(0x8e8a7c), THREE.MathUtils.smoothstep(sl, 0.9, 1.7) * 0.8);
      if (h < 1.2 && h > -3) c.lerp(tmp.set(0xe4d090), THREE.MathUtils.smoothstep(1.2 - h, 0.0, 1.6));
      if (h <= WATER_Y) c.lerp(tmp.set(0x9b8858), 0.6);
      // worn dirt: catapult pad and castle yard
      const dCat = Math.hypot(x - CATAPULT_X, z);
      c.lerp(tmp.set(0xb9915d), (1 - THREE.MathUtils.smoothstep(dCat, 5, 9)) * 0.75);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tGeo.computeVertexNormals();
  }
  const terrain = new THREE.Mesh(tGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  // ---- water ----
  const WX0 = -60, WX1 = 60, WZ0 = -170, WZ1 = 100;
  const HW = 256, HH = 512;
  const hdata = new Uint16Array(HW * HH);
  for (let j = 0; j < HH; j++) {
    for (let i = 0; i < HW; i++) {
      const x = WX0 + (i + 0.5) / HW * (WX1 - WX0), z = WZ0 + (j + 0.5) / HH * (WZ1 - WZ0);
      hdata[j * HW + i] = THREE.DataUtils.toHalfFloat(terrainHeight(x, z));
    }
  }
  const hTex = new THREE.DataTexture(hdata, HW, HH, THREE.RedFormat, THREE.HalfFloatType);
  hTex.minFilter = hTex.magFilter = THREE.LinearFilter;
  hTex.needsUpdate = true;
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTime, uHeight: { value: hTex }, uRegion: { value: new THREE.Vector4(WX0, WZ0, WX1 - WX0, WZ1 - WZ0) },
      uWaterY: { value: WATER_Y },
      cShallow: { value: new THREE.Color(0x5fd8de) }, cDeep: { value: new THREE.Color(0x1b78c2) },
      cFoam: { value: new THREE.Color(0xf4fdff) }, cSky: { value: new THREE.Color(0xa9dcf7) },
      cFog: { value: new THREE.Color(SKY.fog) },
    },
    vertexShader: `varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float uTime; uniform sampler2D uHeight; uniform vec4 uRegion; uniform float uWaterY;
      uniform vec3 cShallow; uniform vec3 cDeep; uniform vec3 cFoam; uniform vec3 cSky; uniform vec3 cFog;
      varying vec3 vW;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 huv = (vW.xz - uRegion.xy) / uRegion.zw;
        float depth = uWaterY - texture2D(uHeight, huv).r;
        if (depth < 0.0) discard;
        vec2 p = vW.xz;
        float fl = uTime * 0.7;
        float r = vn(vec2(p.x * 0.55, p.y * 0.22 - fl)) * 0.6 + vn(vec2(p.x * 1.5 + 4.0, p.y * 0.55 - fl * 1.7)) * 0.4;
        vec3 col = mix(cShallow, cDeep, smoothstep(0.0, 2.4, depth));
        col += (r - 0.5) * 0.22;
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
        col = mix(col, cSky, fres * 0.6);
        float sp = smoothstep(0.80, 0.97, vn(p * 2.6 + vec2(0.0, -uTime * 1.1))) * smoothstep(0.45, 0.9, vn(p * 0.9 + uTime * 0.25));
        col += sp * 0.75;
        float f = smoothstep(0.5, 0.0, depth + (vn(p * 2.0 + vec2(uTime * 0.25, -uTime * 0.5)) - 0.5) * 0.4);
        col = mix(col, cFoam, f * 0.9);
        float d = distance(cameraPosition, vW);
        col = mix(col, cFog, smoothstep(150.0, 560.0, d));
        gl_FragColor = vec4(col, mix(0.72, 0.96, smoothstep(0.0, 1.4, depth)));
        ${TONE}
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WX1 - WX0, WZ1 - WZ0, 4, 4).rotateX(-Math.PI / 2)
    .translate((WX0 + WX1) / 2, WATER_Y, (WZ0 + WZ1) / 2), waterMat);
  water.renderOrder = 2;
  scene.add(water);

  // ---- distant mountains (flat, fogged silhouettes) ----
  const mtnCols = [0x7fb0c8, 0x8db9d4, 0xa2c8de];
  for (let layer = 0; layer < 3; layer++) {
    const n = 7 + layer * 2;
    for (let i = 0; i < n; i++) {
      const rad = 60 + R() * 70, hgt = 45 + R() * 55 - layer * 8;
      const m = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7 + (R() * 3 | 0), 1),
        new THREE.MeshBasicMaterial({ color: mtnCols[layer], fog: true }));
      m.position.set(-300 + i * (600 / n) + R() * 30, hgt / 2 - 12 + layer * 3, -230 - layer * 70 - R() * 30);
      m.rotation.y = R() * 6;
      scene.add(m);
    }
  }

  // ---- clouds (merged puffs, vertex-shaded, drifting) ----
  const clouds = [];
  const cTop = new THREE.Color(0xffffff), cBot = new THREE.Color(0xbfd6ec);
  for (let i = 0; i < 16; i++) {
    const parts = [];
    const puffs = 5 + (R() * 4 | 0);
    for (let k = 0; k < puffs; k++) {
      const r = 5 + R() * 6;
      const g = new THREE.SphereGeometry(r, 12, 9);
      g.scale(1.2, 0.8, 1);
      g.translate((k - puffs / 2) * 6 + (R() - 0.5) * 3, (R() - 0.3) * 3, (R() - 0.5) * 5);
      const nor = g.attributes.normal, colArr = new Float32Array(nor.count * 3), tc = new THREE.Color();
      for (let v = 0; v < nor.count; v++) {
        tc.copy(cBot).lerp(cTop, THREE.MathUtils.clamp(nor.getY(v) * 0.6 + 0.55, 0, 1));
        colArr.set([tc.r, tc.g, tc.b], v * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
      g.deleteAttribute('uv');
      parts.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts),
      new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    const s = 0.9 + R() * 1.2;
    mesh.scale.set(s, s, s);
    mesh.position.set(-260 + R() * 520, 48 + R() * 45, -260 + R() * 230);
    mesh.userData.speed = 0.6 + R() * 1.4;
    clouds.push(mesh);
    scene.add(mesh);
  }

  // ---- trees, rocks, flowers, grass ----
  const detailMeshes = [];   // { mesh, total, key }
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const euler = new THREE.Euler();

  const okTree = (x, z, h) => {
    if (h < 1.0) return false;
    if (Math.abs(z) < LANE + 3 && x > -46 && x < 88) return false;
    if (z > 16 && x > -60 && x < 100) return false;
    const e = 1.0;
    const sl = Math.hypot(terrainHeight(x + e, z) - terrainHeight(x - e, z), terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
    return sl < 0.7;
  };

  function scatter(count, tries, accept) {
    const pts = [];
    for (let t = 0; t < tries && pts.length < count; t++) {
      const x = -160 + R() * 320, z = -160 + R() * 210;
      const h = terrainHeight(x, z);
      if (accept(x, z, h)) pts.push([x, h, z]);
    }
    return pts;
  }

  // pine trees
  {
    const pts = scatter(90, 3000, okTree);
    const trunkG = new THREE.CylinderGeometry(0.25, 0.4, 2, 6).translate(0, 1, 0);
    const foliage = mergeGeometries([
      new THREE.ConeGeometry(2.2, 3.0, 8).translate(0, 3.0, 0),
      new THREE.ConeGeometry(1.7, 2.7, 8).translate(0, 4.6, 0),
      new THREE.ConeGeometry(1.15, 2.4, 8).translate(0, 6.0, 0),
    ]);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x7b5232, roughness: 1 }), pts.length);
    const leaf = new THREE.InstancedMesh(foliage, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true }), pts.length);
    const cc = new THREE.Color();
    pts.forEach((p, i) => {
      const s = 0.8 + R() * 0.9;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
      M.compose(P.set(p[0], p[1] - 0.2, p[2]), Q, S.set(s, s * (0.9 + R() * 0.4), s));
      trunk.setMatrixAt(i, M); leaf.setMatrixAt(i, M);
      leaf.setColorAt(i, cc.setHSL(0.31 + R() * 0.05, 0.55, 0.28 + R() * 0.1));
    });
    for (const m of [trunk, leaf]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    detailMeshes.push({ mesh: trunk, total: pts.length, key: 'trees' }, { mesh: leaf, total: pts.length, key: 'trees' });
  }
  // round trees
  {
    const pts = scatter(70, 3000, okTree);
    const trunkG = new THREE.CylinderGeometry(0.3, 0.45, 2.6, 6).translate(0, 1.3, 0);
    const blob = mergeGeometries([
      new THREE.IcosahedronGeometry(2.3, 1).translate(0, 4.2, 0),
      new THREE.IcosahedronGeometry(1.6, 1).translate(1.3, 3.5, 0.6),
      new THREE.IcosahedronGeometry(1.5, 1).translate(-1.2, 3.6, -0.5),
    ]);
    const trunk = new THREE.InstancedMesh(trunkG, new THREE.MeshStandardMaterial({ color: 0x86603a, roughness: 1 }), pts.length);
    const leaf = new THREE.InstancedMesh(blob, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: true }), pts.length);
    const cc = new THREE.Color();
    pts.forEach((p, i) => {
      const s = 0.8 + R() * 0.8;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
      M.compose(P.set(p[0], p[1] - 0.2, p[2]), Q, S.set(s, s, s));
      trunk.setMatrixAt(i, M); leaf.setMatrixAt(i, M);
      leaf.setColorAt(i, cc.setHSL(0.24 + R() * 0.07, 0.6, 0.38 + R() * 0.1));
    });
    for (const m of [trunk, leaf]) { m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    detailMeshes.push({ mesh: trunk, total: pts.length, key: 'trees' }, { mesh: leaf, total: pts.length, key: 'trees' });
  }
  // rocks
  {
    const pts = scatter(60, 3000, (x, z, h) => h > 1.0 && !(Math.abs(z) < LANE + 1 && x > -40 && x < 80));
    const rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), pts.length);
    const cc = new THREE.Color();
    pts.forEach((p, i) => {
      const s = 0.4 + R() * 1.4;
      Q.setFromEuler(euler.set(R() * 3, R() * 3, R() * 3));
      M.compose(P.set(p[0], p[1] + s * 0.25, p[2]), Q, S.set(s * 1.2, s * 0.7, s));
      rk.setMatrixAt(i, M);
      rk.setColorAt(i, cc.setHSL(0.1, 0.05, 0.45 + R() * 0.15));
    });
    rk.castShadow = true; rk.receiveShadow = true; rk.frustumCulled = false;
    scene.add(rk);
  }
  // flowers
  {
    const pts = scatter(420, 5000, (x, z, h) => h > 1.1 && !(Math.abs(z) < LANE + 0.5 && x > 6 && x < 80) && Math.hypot(x - CATAPULT_X, z) > 5);
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0),
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), pts.length);
    const cols = [0xffffff, 0xffe14a, 0xff7fb0, 0xff8a4a, 0xb08cff];
    const cc = new THREE.Color();
    pts.forEach((p, i) => {
      M.compose(P.set(p[0], p[1] + 0.22, p[2]), Q.identity(), S.set(1, 1, 1));
      fl.setMatrixAt(i, M); fl.setColorAt(i, cc.set(cols[(R() * cols.length) | 0]));
    });
    fl.frustumCulled = false;
    scene.add(fl);
  }
  // grass blades with wind
  {
    // a tuft = three slightly bent blades fanned around the centre
    const bp = [], bc = [], bn = [];
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1, ca = Math.cos(a), sa = Math.sin(a), lean = 0.10 + k * 0.03;
      const pts = [[-0.07, 0, 0], [0.07, 0, 0], [lean * 0.4, 0.62 - k * 0.08, lean * 0.3]];
      for (const [x, y, z] of pts) {
        bp.push(x * ca - z * sa, y, x * sa + z * ca);
        bn.push(0, 1, 0);
        if (y === 0) bc.push(0.30, 0.55, 0.18); else bc.push(0.66, 0.93, 0.36);
      }
    }
    const blade = new THREE.BufferGeometry();
    blade.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute(bn, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.21;
          transformed.x += sin(uTime * 2.1 + ph) * 0.09 * position.y;
          transformed.z += cos(uTime * 1.7 + ph) * 0.06 * position.y;`);
    };
    const pts = scatter(3600, 12000, (x, z, h) => h > 1.4 && Math.abs(z) < 70 && !(Math.abs(z) < LANE + 0.5 && x > 8 && x < 78) && Math.hypot(x - CATAPULT_X, z) > 4.5);
    const gr = new THREE.InstancedMesh(blade, mat, pts.length);
    pts.forEach((p, i) => {
      const s = 0.7 + R() * 1.2;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6);
      M.compose(P.set(p[0], p[1] - 0.02, p[2]), Q, S.set(s, s * (0.8 + R() * 0.6), s));
      gr.setMatrixAt(i, M);
    });
    gr.frustumCulled = false;
    scene.add(gr);
    detailMeshes.push({ mesh: gr, total: pts.length, key: 'grass' });
  }

  return {
    sky,
    setDetail(q) {
      for (const d of detailMeshes) d.mesh.count = Math.floor(d.total * q[d.key]);
    },
    update(t, camera) {
      uTime.value = t;
      sky.position.copy(camera.position);
      for (const c of clouds) {
        c.position.x += c.userData.speed * 0.016;
        if (c.position.x > 300) c.position.x = -300;
      }
    },
  };
}
