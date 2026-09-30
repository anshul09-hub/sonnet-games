// Day/night cycle: gradient sky dome, blocky sun + moon, stars, drifting pixel clouds.
import * as THREE from 'three';
import { U } from './shaders.js';
import { makeSunTexture, makeMoonTexture } from './textures.js';

const srgb = (r, g, b) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);
const C = {
  zDay: srgb(0.16, 0.40, 0.82), hDay: srgb(0.60, 0.76, 0.94),
  zNight: srgb(0.012, 0.02, 0.07), hNight: srgb(0.035, 0.055, 0.13),
  duskZ: srgb(0.26, 0.30, 0.58), duskSet: srgb(1.0, 0.50, 0.24), duskRise: srgb(1.0, 0.62, 0.52),
  lightDay: new THREE.Color(1.0, 1.0, 1.0), lightNight: new THREE.Color(0.075, 0.105, 0.26),
  lightDusk: new THREE.Color(1.0, 0.5, 0.26), sunDusk: new THREE.Color(1.0, 0.52, 0.22),
};
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const SKY_VS = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const SKY_FS = `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uGlow; uniform float uGlowAmt;
varying vec3 vDir;
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(t, 0.5));
  if (h < 0.0) col = mix(uHorizon, uHorizon * 0.8, clamp(-h * 5.0, 0.0, 1.0));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uGlow * (pow(sd, 5.0) * 0.30 + pow(sd, 36.0) * 0.55) * uGlowAmt * (1.0 - t * 0.6);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const STAR_VS = `attribute float aSize; attribute float aPh; uniform float uTime; uniform float uPx; varying float vA;
void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vec4 p = projectionMatrix * mv; gl_Position = p.xyww;
  gl_PointSize = aSize * uPx; vA = 0.65 + 0.35 * sin(uTime * 1.7 + aPh * 30.0); }`;
const STAR_FS = `uniform float uNight; varying float vA;
void main(){
  gl_FragColor = vec4(vec3(0.85,0.9,1.0) * 1.3, uNight * vA);
  #include <colorspace_fragment>
}`;

const CLOUD_VS = `varying vec3 vWorld; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWorld = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`;
const CLOUD_FS = `
uniform float uTime; uniform vec3 uColor; uniform vec3 uFog; uniform float uBright; uniform float uCover; uniform float uAlpha;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
void main(){
  vec2 p = (vWorld.xz + vec2(uTime * 2.2, uTime * 0.5)) / 14.0;
  vec2 cell = floor(p);
  float n = vn(cell * 0.085) * 0.58 + vn(cell * 0.21 + 7.0) * 0.28 + vn(cell * 0.55 + 3.0) * 0.14;
  float a = step(uCover, n);
  if (a < 0.5) discard;
  float dist = length(vWorld.xz - cameraPosition.xz);
  float fade = 1.0 - smoothstep(260.0, 800.0, dist);
  float shade = 0.94 + 0.06 * hash(cell);
  vec3 col = uColor * uBright * shade;
  col = mix(col, uFog, smoothstep(150.0, 800.0, dist) * 0.75);
  gl_FragColor = vec4(col, uAlpha * fade);
  #include <colorspace_fragment>
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.time = 0.3;               // 0 midnight, .25 sunrise, .5 noon, .75 sunset
    this.dayLength = 420;          // seconds for a full day
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this.dayF = 1; this.dusk = 0; this.night = 0;
    this.zenith = new THREE.Color(); this.horizon = new THREE.Color();
    this.glow = new THREE.Color(); this.tmp = new THREE.Color(); this.tmp2 = new THREE.Color(); this.tmp3 = new THREE.Color();
    this.lightColor = new THREE.Color();
    this.frozen = false;

    const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
      uniforms: { uZenith: { value: this.zenith }, uHorizon: { value: this.horizon }, uSunDir: { value: this.sunDir }, uGlow: { value: this.glow }, uGlowAmt: { value: 1 } },
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false,
    }));
    dome.renderOrder = -10; dome.frustumCulled = false;
    this.dome = dome; scene.add(dome);

    // stars
    const N = 1400, pos = new Float32Array(N * 3), size = new Float32Array(N), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      pos[i * 3] = Math.cos(a) * r * 450; pos[i * 3 + 1] = u * 450; pos[i * 3 + 2] = Math.sin(a) * r * 450;
      size[i] = 1 + Math.random() * Math.random() * 2.4; ph[i] = Math.random();
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uNight: { value: 0 }, uPx: { value: 1 } }, vertexShader: STAR_VS, fragmentShader: STAR_FS,
      transparent: true, depthWrite: false, depthTest: true,
    });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9; this.stars.frustumCulled = false;
    scene.add(this.stars);

    // sun + moon
    const mk = (tex, size, mult) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
      m.material.color.setScalar(mult); m.renderOrder = -8; m.frustumCulled = false; scene.add(m); return m;
    };
    this.sun = mk(makeSunTexture(), 78, 2.2);
    this.moon = mk(makeMoonTexture(), 56, 1.5);

    // clouds: three offset layers of the same procedural mask
    this.cloudMats = [];
    const cg = new THREE.PlaneGeometry(3200, 3200); cg.rotateX(-Math.PI / 2);
    this.clouds = [];
    [[0, 0.74, 3], [2.4, 0.88, 2], [4.8, 1.0, 1]].forEach(([dy, br, ro]) => {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uTime: U.uTime, uColor: { value: new THREE.Color(1, 1, 1) }, uFog: U.uFogColor, uBright: { value: br }, uCover: { value: 0.545 }, uAlpha: { value: 0.93 } },
        vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(cg, mat); m.renderOrder = ro; m.frustumCulled = false; m.userData.dy = dy;
      scene.add(m); this.clouds.push(m); this.cloudMats.push(mat);
    });
    this.cloudY = 122;
    this.applyState();
  }

  setTime(t) { this.time = ((t % 1) + 1) % 1; this.applyState(); }
  get hours() { return (this.time * 24 + 0) % 24; }

  applyState() {
    const a = (this.time - 0.25) * Math.PI * 2;
    this.sunDir.set(Math.cos(a), Math.sin(a), 0.28).normalize();
    const e = this.sunDir.y;
    this.dayF = smooth(-0.10, 0.28, e);
    this.dusk = Math.exp(-Math.pow(e / 0.2, 2));
    this.night = 1 - smooth(-0.22, 0.02, e);
    this.zenith.copy(C.zNight).lerp(C.zDay, this.dayF).lerp(C.duskZ, this.dusk * 0.55);
    const duskC = this.time < 0.5 ? C.duskRise : C.duskSet;
    this.horizon.copy(C.hNight).lerp(C.hDay, this.dayF).lerp(duskC, this.dusk * 0.88);
    this.glow.copy(duskC).lerp(new THREE.Color(1, 0.95, 0.8), this.dayF * (1 - this.dusk));
    this.dome.material.uniforms.uGlowAmt.value = 0.35 + this.dusk * 1.1 + this.dayF * 0.2 - this.night * 0.3;
    // ---- directional light: sun by day, moon by night ----
    const sunI = smooth(-0.04, 0.16, e);
    const moonI = smooth(-0.02, -0.25, e) * 0.36;
    const useSun = e > -0.03;
    U.uSunDir.value.copy(this.sunDir); if (!useSun) U.uSunDir.value.negate();
    U.uSunView.value.copy(this.sunDir);
    const sunCol = this.tmp.setRGB(1.0, 0.94, 0.82).lerp(C.sunDusk, Math.min(1, this.dusk * 1.2));
    U.uSunColor.value.copy(sunCol).multiplyScalar(1.4 * sunI);
    if (!useSun) U.uSunColor.value.setRGB(0.55, 0.68, 1.0).multiplyScalar(moonI * 1.6);
    // ambient sky light: desaturated mix of zenith and horizon, dim at night
    const lum = (c) => c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    const ac = this.tmp2.copy(this.zenith).lerp(this.horizon, 0.5);
    const l = lum(ac);
    ac.multiplyScalar(0.55).r += l * 0.45; ac.g += l * 0.45; ac.b += l * 0.45;
    const ambK = 0.16 + 0.78 * this.dayF;
    U.uAmbSky.value.copy(ac).multiplyScalar(ambK).add(this.tmp3.setRGB(0.02, 0.034, 0.085).multiplyScalar(this.night));
    U.uAmbGround.value.copy(U.uAmbSky.value).multiplyScalar(0.32).add(this.tmp3.setRGB(0.10, 0.085, 0.06).multiplyScalar(this.dayF * 0.6));
    U.uSunGlow.value.copy(this.glow).multiplyScalar(0.55 * Math.max(0, this.dayF * 0.6 + this.dusk * 0.9) * (1 - this.night));
    // world light
    this.lightColor.copy(C.lightNight).lerp(C.lightDay, this.dayF).lerp(C.lightDusk, this.dusk * 0.8 * this.dayF);
    U.uSkyLight.value.copy(this.lightColor);
    U.uCave.value.setRGB(0.05, 0.055, 0.07);
    U.uFogColor.value.copy(this.horizon);
    U.uWaterTint.value.setRGB(0.03, 0.2, 0.46);
    this.starMat.uniforms.uNight.value = Math.max(0, this.night - 0.15) / 0.85;
    // clouds tint
    const cc = this.tmp.setRGB(1, 1, 1).multiplyScalar(0.25 + this.dayF * 0.8);
    cc.lerp(new THREE.Color(1.0, 0.62, 0.44), this.dusk * 0.5 * this.dayF);
    cc.lerp(new THREE.Color(0.018, 0.026, 0.06), this.night * 0.92);
    for (const m of this.cloudMats) m.uniforms.uColor.value.copy(cc);
  }

  update(dt, camera, pixelRatio) {
    if (!this.frozen) { this.time = (this.time + dt / this.dayLength) % 1; }
    this.applyState();
    this.starMat.uniforms.uPx.value = pixelRatio;
    this.place(camera.position);
  }

  // position the sky objects around a viewpoint (the reflection pass calls this with its mirrored camera)
  place(cp) {
    this.dome.position.copy(cp);
    this.stars.position.copy(cp);
    this.stars.rotation.z = (this.time - 0.25) * Math.PI * 2 - Math.PI / 2;
    this.sun.position.copy(cp).addScaledVector(this.sunDir, 380);
    this.sun.lookAt(cp); this.sun.visible = this.sunDir.y > -0.25;
    this.moon.position.copy(cp).addScaledVector(this.sunDir, -380);
    this.moon.lookAt(cp); this.moon.visible = this.sunDir.y < 0.25;
    this.moon.material.opacity = 1;
    for (const c of this.clouds) c.position.set(cp.x, this.cloudY + c.userData.dy, cp.z);
  }
}
