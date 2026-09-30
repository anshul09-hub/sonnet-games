// Dusk sky dome (gradient + sun + procedural clouds) and an environment map made from it.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.17, 0.55).normalize();
export const FOG_COLOR = 0x4b3a52;
export const SKY = {
  zenith: new THREE.Color(0x070d24),
  mid: new THREE.Color(0x2b2650),
  horizon: new THREE.Color(0x6b3f55),
  sun: new THREE.Color(0xff8a3c),
};

const vert = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w * 0.99999; // always at the far plane
}`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vDir;
uniform vec3 uZenith, uMid, uHorizon, uSun, uSunDir, uFog;
uniform float uTime, uClouds;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y);
}
float fbm(vec2 p){
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
  col = mix(col, uZenith, smoothstep(0.12, 0.8, h));
  // burning glow around the low sun and a hot band along the horizon towards it
  float lowBand = 1.0 - smoothstep(0.0, 0.32, h);
  col += uSun * (pow(sd, 3.0) * 0.28 * lowBand + pow(sd, 10.0) * 0.55 + pow(sd, 60.0) * 0.9);
  col += vec3(0.55, 0.16, 0.05) * pow(sd, 2.0) * lowBand * 0.5;
  col = mix(col, uHorizon * 1.1, (1.0 - smoothstep(0.0, 0.1, abs(h))) * 0.5);
  // stars in the dark half of the sky
  if (h > 0.08) {
    vec2 sp = d.xz / (h + 0.35) * 260.0;
    vec2 id = floor(sp);
    float r = hash(id);
    float star = step(0.9965, r) * smoothstep(0.12, 0.5, h) * (0.55 + 0.45 * hash(id + 7.0));
    vec2 f = fract(sp) - 0.5;
    star *= smoothstep(0.5, 0.0, length(f) * 2.2);
    col += vec3(0.75, 0.82, 1.0) * star * (1.0 - smoothstep(0.0, 0.5, sd)) * 1.6;
  }
  // sun disc (HDR so bloom picks it up)
  float disc = smoothstep(0.9994, 0.9998, sd);
  col += uSun * disc * 12.0;
  // heavy clouds, lit from below by the sun
  if (uClouds > 0.5 && h > 0.004) {
    vec2 uv = d.xz / (h + 0.2) * 1.15 + vec2(uTime * 0.003, 0.0);
    float n = fbm(uv * 1.3);
    float c = smoothstep(0.46, 0.75, n);
    float rim = smoothstep(0.46, 0.6, n) - smoothstep(0.6, 0.85, n);
    vec3 dark = mix(uMid * 0.55, uZenith * 1.4, 0.5);
    vec3 cc = mix(dark, vec3(0.75, 0.32, 0.18), sd * 0.7 * (1.0 - smoothstep(0.0, 0.7, h)));
    cc += uSun * rim * (0.25 + sd * 1.4);
    float fade = smoothstep(0.0, 0.14, h);
    col = mix(col, cc, c * 0.9 * fade);
  }
  col = mix(col, uFog, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;


export function makeSky(cloudsOn = true) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith }, uMid: { value: SKY.mid }, uHorizon: { value: SKY.horizon }, uSun: { value: SKY.sun },
      uSunDir: { value: SUN_DIR }, uFog: { value: new THREE.Color(FOG_COLOR) }, uTime: { value: 0 }, uClouds: { value: cloudsOn ? 1 : 0 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.scale.setScalar(3000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

// Environment map for reflections on car paint and glass.
export function makeEnvironment(renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const sky = makeSky(false);
  s.add(sky);
  // a warm ground bounce
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2500, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2a2028 }));
  ground.position.y = -2; s.add(ground);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  sky.material.dispose();
  return rt.texture;
}
