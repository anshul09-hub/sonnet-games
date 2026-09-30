// The bright stylised world: sky, hills, river, mountains. Vegetation and props live in
// vegetation.js and props.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LANE, CATAPULT_X } from './config.js';
import { terrainHeight, WATER_Y, vnoise } from './terrain.js';
import { rng, grassDetailTexture } from './textures.js';
import { createVegetation } from './vegetation.js';
import { createProps } from './props.js';

export const SKY = { top: 0x2f7fe0, mid: 0x7fc4f2, horizon: 0xf3ecd8, fog: 0xd9e9ee };
// the light that actually shines (front-left, fairly high) and the low sun painted in the sky
export const SUN_DIR = new THREE.Vector3(-0.62, 0.58, 0.52).normalize();
export const VIS_SUN = new THREE.Vector3(-0.36, 0.15, -0.92).normalize();

const TONE = '#include <tonemapping_fragment>\n#include <colorspace_fragment>\n';

// shared GLSL: procedural sky with fbm clouds
export const SKY_GLSL = `
uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 visSun; uniform float uTime; uniform float uOct;
float sh21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float svn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(sh21(i), sh21(i+vec2(1,0)), f.x), mix(sh21(i+vec2(0,1)), sh21(i+vec2(1,1)), f.x), f.y); }
float sfbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { if (float(i) >= uOct) break; s += a * svn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 skyBase(vec3 d){
  float h = clamp(d.y, 0.0, 1.0);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.2, h));
  col = mix(col, top, smoothstep(0.15, 0.8, h));
  float s = max(dot(d, visSun), 0.0);
  col += vec3(1.0,0.66,0.36) * pow(s, 5.0) * 0.28 + vec3(1.0,0.82,0.55) * pow(s, 36.0) * 0.5 + vec3(1.0,0.96,0.85) * pow(s, 1200.0) * 6.0;
  return col;
}
vec3 skyClouds(vec3 d, vec3 base){
  if (d.y < 0.015) return base;
  vec2 uv = d.xz / (d.y + 0.16) * 0.85 + vec2(uTime * 0.012, uTime * 0.004);
  float n = sfbm(uv * 1.5);
  float cov = smoothstep(0.46, 0.76, n);
  float thick = smoothstep(0.52, 0.92, sfbm(uv * 1.5 + 3.7));
  vec2 hd = normalize(vec2(d.x, d.z) + 1e-4), sd = normalize(vec2(visSun.x, visSun.z));
  float side = pow(max(dot(hd, sd), 0.0), 2.0) * (1.0 - smoothstep(0.0, 0.5, d.y - visSun.y * 0.5));
  vec3 lit = vec3(1.0, 0.97, 0.92) * (0.92 + 0.5 * side);
  vec3 shade = mix(vec3(0.60, 0.68, 0.82), vec3(0.86, 0.78, 0.74), side);
  vec3 cc = mix(lit, shade, thick * 0.78);
  cc += vec3(1.0, 0.72, 0.4) * side * 0.35 * (1.0 - thick);
  return mix(base, cc, cov * smoothstep(0.015, 0.2, d.y) * 0.94);
}`;

function skyMaterial(uniforms, withClouds = true) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `${SKY_GLSL}
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = skyBase(d);
        ${withClouds ? 'col = skyClouds(d, col);' : ''}
        gl_FragColor = vec4(col, 1.0);
        ${TONE}
      }`,
  });
}

export function createScenery(scene, renderer) {
  const R = rng(2024);
  const uTime = { value: 0 };
  const skyUniforms = {
    top: { value: new THREE.Color(SKY.top) }, mid: { value: new THREE.Color(SKY.mid) }, horizon: { value: new THREE.Color(SKY.horizon) },
    visSun: { value: VIS_SUN.clone() }, uTime, uOct: { value: 5 },
  };

  // ---- sky dome + environment map for reflections ----
  const skyGeo = new THREE.SphereGeometry(600, 40, 20);
  const sky = new THREE.Mesh(skyGeo, skyMaterial(skyUniforms));
  sky.renderOrder = -10; sky.frustumCulled = false; sky.userData.noAO = true;
  scene.add(sky);
  {
    const envScene = new THREE.Scene();
    const envUniforms = { ...skyUniforms, uOct: { value: 3 } };
    envScene.add(new THREE.Mesh(skyGeo, skyMaterial(envUniforms)));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(400, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fae58 }));
    ground.position.y = -20;
    envScene.add(ground);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(envScene, 0.03).texture;
    scene.environmentIntensity = 0.6;
    pm.dispose();
  }

  // ---- terrain ----
  const TX = 340, TZ = 270, TCX = 0, TCZ = -35;
  const tGeo = new THREE.PlaneGeometry(TX, TZ, 220, 180).rotateX(-Math.PI / 2).translate(TCX, 0, TCZ);
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
      const n = vnoise(x * 0.09, z * 0.09), n2 = vnoise(x * 0.5, z * 0.5), n3 = vnoise(x * 0.03 + 9, z * 0.03);
      c.set(0x7bc846).lerp(tmp.set(0x5ab13b), n).lerp(tmp.set(0x9ade54), n2 * 0.3).lerp(tmp.set(0xb8c95a), Math.max(0, n3 - 0.55) * 1.3);
      const far = THREE.MathUtils.smoothstep(-z, LANE + 10, LANE + 120);
      c.lerp(tmp.set(0x3f8f3a), far * 0.55);
      if (h > 16) c.lerp(tmp.set(0x8a9a6a), Math.min(1, (h - 16) / 16));
      c.lerp(tmp.set(0x8e8a7c), THREE.MathUtils.smoothstep(sl, 0.9, 1.7) * 0.8);
      if (h < 1.2 && h > -3) c.lerp(tmp.set(0xe4d090), THREE.MathUtils.smoothstep(1.2 - h, 0.0, 1.6));
      if (h <= WATER_Y) c.lerp(tmp.set(0x9b8858), 0.6);
      const dCat = Math.hypot(x - CATAPULT_X, z);
      c.lerp(tmp.set(0xb9915d), (1 - THREE.MathUtils.smoothstep(dCat, 5, 9)) * 0.75);
      c.multiplyScalar(1.2);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    tGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    tGeo.computeVertexNormals();
  }
  const grassTex = grassDetailTexture();
  grassTex.repeat.set(TX / 5, TZ / 5);
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, map: grassTex, bumpMap: grassTex, bumpScale: 1.1 });
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp; uniform float uTime;
        float th21(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float tvn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(th21(i), th21(i+vec2(1,0)), f.x), mix(th21(i+vec2(0,1)), th21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 q = vWp.xz * 0.011 + vec2(uTime * 0.018, uTime * 0.007);
          float cs = tvn(q) * 0.55 + tvn(q * 2.1 + 7.0) * 0.3 + tvn(q * 4.3) * 0.15;
          diffuseColor.rgb *= mix(0.70, 1.07, smoothstep(0.38, 0.62, cs));
          // patchy meadow colour variation
          float pv = tvn(vWp.xz * 0.35);
          diffuseColor.rgb *= 0.92 + pv * 0.16;
        }`);
  };
  const terrain = new THREE.Mesh(tGeo, terrainMat);
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
      ...skyUniforms, uOct: { value: 3 },
      uHeight: { value: hTex }, uRegion: { value: new THREE.Vector4(WX0, WZ0, WX1 - WX0, WZ1 - WZ0) }, uWaterY: { value: WATER_Y },
      cShallow: { value: new THREE.Color(0x63d9d2) }, cDeep: { value: new THREE.Color(0x0f5fae) },
      cFoam: { value: new THREE.Color(0xf6fdff) }, cFog: { value: new THREE.Color(SKY.fog) },
    },
    vertexShader: `varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `${SKY_GLSL}
      uniform sampler2D uHeight; uniform vec4 uRegion; uniform float uWaterY;
      uniform vec3 cShallow; uniform vec3 cDeep; uniform vec3 cFoam; uniform vec3 cFog;
      varying vec3 vW;
      float hgt(vec2 p){ return svn(p); }
      void main(){
        vec2 huv = (vW.xz - uRegion.xy) / uRegion.zw;
        float depth = uWaterY - texture2D(uHeight, huv).r;
        if (depth < 0.0) discard;
        vec2 p = vW.xz;
        float fl = uTime * 0.7;
        // ripple height field -> normal
        vec2 a = vec2(p.x * 0.6, p.y * 0.24 - fl), b = vec2(p.x * 1.7 + 4.0, p.y * 0.6 - fl * 1.7), c2 = vec2(p.x * 3.9, p.y * 1.5 - fl * 2.6);
        float e = 0.12;
        float h0 = svn(a) * 0.5 + svn(b) * 0.3 + svn(c2) * 0.2;
        float hx = svn(a + vec2(e, 0.)) * 0.5 + svn(b + vec2(e, 0.)) * 0.3 + svn(c2 + vec2(e, 0.)) * 0.2;
        float hz = svn(a + vec2(0., e)) * 0.5 + svn(b + vec2(0., e)) * 0.3 + svn(c2 + vec2(0., e)) * 0.2;
        vec3 N = normalize(vec3(-(hx - h0) * 2.4, 1.0, -(hz - h0) * 2.4));
        vec3 V = normalize(cameraPosition - vW);
        vec3 col = mix(cShallow, cDeep, smoothstep(0.0, 2.6, depth));
        col += (h0 - 0.5) * 0.18;
        // sky reflection along the ripple normal
        vec3 R = reflect(-V, N); R.y = abs(R.y);
        float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
        vec3 refl = skyClouds(R, skyBase(R));
        col = mix(col, refl, clamp(fres * 1.15, 0.0, 0.9));
        // sun glitter path
        vec3 H = normalize(V + visSun);
        float spec = pow(max(dot(N, H), 0.0), 220.0) * 3.0 + pow(max(dot(N, H), 0.0), 40.0) * 0.35;
        col += vec3(1.0, 0.9, 0.7) * spec;
        // shore foam and wet edge
        float nz = svn(p * 2.0 + vec2(uTime * 0.25, -uTime * 0.5));
        float f = smoothstep(0.55, 0.0, depth + (nz - 0.5) * 0.45);
        float lines = smoothstep(0.42, 0.5, svn(p * 5.0 + vec2(0., -uTime * 0.6))) * smoothstep(1.1, 0.1, depth) * 0.5;
        col = mix(col, cFoam, clamp(f * 0.9 + lines, 0.0, 1.0));
        float d = distance(cameraPosition, vW);
        col = mix(col, cFog, smoothstep(150.0, 560.0, d));
        gl_FragColor = vec4(col, mix(0.7, 0.97, smoothstep(0.0, 1.5, depth)));
        ${TONE}
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WX1 - WX0, WZ1 - WZ0, 4, 4).rotateX(-Math.PI / 2)
    .translate((WX0 + WX1) / 2, WATER_Y, (WZ0 + WZ1) / 2), waterMat);
  water.renderOrder = 2; water.userData.noAO = true;
  scene.add(water);

  // ---- ridged, snow-capped mountain ranges ----
  const mountains = [];
  for (let layer = 0; layer < 3; layer++) {
    const W = 1500, D = 140, sx = 170, sz = 22;
    const g = new THREE.PlaneGeometry(W, D, sx, sz).rotateX(-Math.PI / 2);
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), t2 = new THREE.Color();
    const hi = 70 + layer * 22, base = [0x6f8fa8, 0x86a4bb, 0x9db7cb][layer];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const u = (z + D / 2) / D;                                    // 0 front .. 1 back
      const ridge = 1 - Math.abs(vnoise(x * 0.008 + layer * 13, layer * 5) * 2 - 1);
      const ridge2 = 1 - Math.abs(vnoise(x * 0.02 + 7, z * 0.03 + layer) * 2 - 1);
      const env = Math.sin(Math.PI * Math.min(1, u * 1.15));
      const valley = 0.55 + 0.45 * Math.min(1, Math.abs(x + 20) / 160);          // open valley behind the castle
      const h = (Math.pow(ridge, 1.6) * hi + ridge2 * 16) * env * valley + 2;
      pos.setY(i, h - 14);
      c.set(base);
      c.lerp(t2.set(0x5c5a5c), THREE.MathUtils.smoothstep(h, 20, 60) * 0.5);
      c.lerp(t2.set(0xffffff), THREE.MathUtils.smoothstep(h, hi * 0.5, hi * 0.78));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, fog: true }));
    m.position.set(0, 0, -250 - layer * 90);
    m.userData.noAO = true;
    scene.add(m); mountains.push(m);
  }

  // ---- puffy clouds (nearer, lit-looking) ----
  const clouds = [];
  const cTop = new THREE.Color(0xffffff), cBot = new THREE.Color(0xb9cfe6);
  for (let i = 0; i < 12; i++) {
    const parts = [];
    const puffs = 6 + (R() * 4 | 0);
    for (let k = 0; k < puffs; k++) {
      const r = 5 + R() * 6;
      const g = new THREE.SphereGeometry(r, 14, 10);
      g.scale(1.25, 0.75, 1);
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
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }));
    const s = 0.9 + R() * 1.2;
    mesh.scale.set(s, s, s);
    mesh.position.set(-260 + R() * 520, 60 + R() * 45, -260 + R() * 200);
    mesh.userData.speed = 0.6 + R() * 1.4; mesh.userData.noAO = true;
    clouds.push(mesh);
    scene.add(mesh);
  }

  // ---- vegetation and props ----
  const ctx = { R, uTime, detail: [], scatter(count, tries, accept) {
    const pts = [];
    for (let t = 0; t < tries && pts.length < count; t++) {
      const x = -170 + R() * 340, z = -165 + R() * 215;
      const h = terrainHeight(x, z);
      if (accept(x, z, h)) pts.push([x, h, z]);
    }
    return pts;
  } };
  const veg = createVegetation(scene, ctx);
  const props = createProps(scene, ctx);

  return {
    sky, visSun: VIS_SUN,
    setDetail(q) {
      skyUniforms.uOct.value = q.bloom ? 5 : 3;
      for (const d of ctx.detail) d.mesh.count = Math.floor(d.total * q[d.key]);
      props.setDetail?.(q);
    },
    update(t, camera, dt = 0.016) {
      uTime.value = t;
      sky.position.copy(camera.position);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 300) c.position.x = -300;
      }
      props.update(t, dt, camera);
    },
  };
}
