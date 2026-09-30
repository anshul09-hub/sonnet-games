// Golden-hour sky dome (gradient + sun + procedural clouds) and an environment map made from it.
import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.62, 0.3, 0.55).normalize();
export const FOG_COLOR = 0xeab48d;
export const SKY = {
  zenith: new THREE.Color(0x2f4f9c),
  mid: new THREE.Color(0xb58bb0),
  horizon: new THREE.Color(0xf6bd8f),
  sun: new THREE.Color(0xffd08a),
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
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
  col = mix(col, uZenith, smoothstep(0.16, 0.85, h));
  // warm glow around the sun
  col += uSun * (pow(sd, 6.0) * 0.55 + pow(sd, 32.0) * 0.6);
  col = mix(col, uHorizon * 1.05, (1.0 - smoothstep(0.0, 0.12, abs(h))) * 0.55);
  // sun disc (HDR so bloom picks it up)
  float disc = smoothstep(0.9993, 0.9998, sd);
  col += uSun * disc * 9.0;
  // clouds on a virtual plane
  if (uClouds > 0.5 && h > 0.005) {
    vec2 uv = d.xz / (h + 0.22) * 1.25 + vec2(uTime * 0.004, 0.0);
    float n = fbm(uv * 1.3);
    float c = smoothstep(0.5, 0.78, n);
    float edge = smoothstep(0.5, 0.62, n) - smoothstep(0.66, 0.9, n);
    vec3 cc = mix(uMid * 1.05 + vec3(0.12, 0.05, 0.05), vec3(1.0, 0.86, 0.72), sd * 0.9 + 0.1);
    cc = mix(cc, uSun * 1.25, edge * (0.35 + sd));
    float fade = smoothstep(0.0, 0.16, h);
    col = mix(col, cc, c * 0.82 * fade);
  }
  // below the horizon: fog colour
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
  const ground = new THREE.Mesh(new THREE.CircleGeometry(2500, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a6a4e }));
  ground.position.y = -2; s.add(ground);
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  sky.material.dispose();
  return rt.texture;
}
