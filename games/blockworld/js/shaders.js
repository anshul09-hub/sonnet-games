// Shared uniforms + custom materials. One lighting model everywhere: sun/moon N.L + soft sky ambient,
// cascaded shadow maps, bump-mapped pixel textures, planar water reflection, fog matched to the sky.
import * as THREE from 'three';

const dummyDepth = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
dummyDepth.needsUpdate = true;
export const DUMMY_TEX = dummyDepth;

export const U = {
  uTime: { value: 0 },
  uAtlas: { value: null },
  uSkyLight: { value: new THREE.Color(1, 1, 1) },
  uCave: { value: new THREE.Color(0.1, 0.1, 0.12) },
  uFogColor: { value: new THREE.Color(0.7, 0.85, 1) },
  uFogNear: { value: 100 },
  uFogFar: { value: 200 },
  uWaterTint: { value: new THREE.Color(0.1, 0.33, 0.62) },
  uLamp: { value: new THREE.Color(0.5, 0.4, 0.26) },
  // lighting
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },     // direction towards the light (sun by day, moon by night)
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  uAmbSky: { value: new THREE.Color(0.3, 0.4, 0.6) },
  uAmbGround: { value: new THREE.Color(0.1, 0.1, 0.1) },
  uSunView: { value: new THREE.Vector3(0, 1, 0) },    // real sun direction (for the sun-side haze)
  uSunGlow: { value: new THREE.Color(0, 0, 0) },
  uLightScale: { value: 1 },
  uBump: { value: 1 },
  // shadows
  uShadowOn: { value: 0 },
  uCascades: { value: 1 },
  uShadowMap0: { value: DUMMY_TEX }, uShadowMap1: { value: DUMMY_TEX },
  uShadowMat0: { value: new THREE.Matrix4() }, uShadowMat1: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector2(1 / 2048, 1 / 2048) },
  // planar water reflection
  uReflOn: { value: 0 },
  uReflMap: { value: DUMMY_TEX },
  uReflMat: { value: new THREE.Matrix4() },
};

// GLSL shared by all lit materials
const LIGHT_GLSL = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uAmbSky;
uniform vec3 uAmbGround;
uniform vec3 uSunView;
uniform vec3 uSunGlow;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uLightScale;
uniform float uShadowOn;
uniform float uCascades;
uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform mat4 uShadowMat0;
uniform mat4 uShadowMat1;
uniform vec2 uShadowTexel;

float pcf(sampler2D m, vec3 c, float texel, float bias) {
  float s = 0.0;
  float z = c.z - bias;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) {
    s += (texture2D(m, c.xy + vec2(float(i), float(j)) * texel).r < z) ? 0.0 : 1.0;
  }
  return s / 9.0;
}
float sunShadow(vec3 wp, vec3 n, float ndl) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = wp + n * (0.05 + 0.08 * (1.0 - ndl));
  vec4 a = uShadowMat0 * vec4(p, 1.0);
  vec3 c0 = a.xyz * 0.5 + 0.5;
  float e0 = max(abs(c0.x - 0.5), abs(c0.y - 0.5));
  float bias = 0.0006 + 0.0014 * (1.0 - ndl);
  float s0 = 1.0;
  float w0 = 1.0 - smoothstep(0.36, 0.47, e0);
  if (w0 > 0.001 && c0.z < 1.0) s0 = pcf(uShadowMap0, c0, uShadowTexel.x, bias);
  if (uCascades < 1.5) return mix(1.0, s0, w0);
  if (w0 >= 0.999) return s0;
  vec4 b = uShadowMat1 * vec4(p, 1.0);
  vec3 c1 = b.xyz * 0.5 + 0.5;
  float e1 = max(abs(c1.x - 0.5), abs(c1.y - 0.5));
  float w1 = 1.0 - smoothstep(0.38, 0.48, e1);
  float s1 = 1.0;
  if (w1 > 0.001 && c1.z < 1.0) s1 = pcf(uShadowMap1, c1, uShadowTexel.y, bias * 0.7);
  s1 = mix(1.0, s1, w1);
  return mix(s1, s0, w0);
}
vec3 skyAmbient(vec3 n) { return mix(uAmbGround, uAmbSky, n.y * 0.5 + 0.5); }
vec3 applyFog(vec3 col, float dist, vec3 vdir) {
  float f = smoothstep(uFogNear, uFogFar, dist);
  float g = pow(max(dot(vdir, uSunView), 0.0), 4.0);
  vec3 fc = uFogColor + uSunGlow * g;
  return mix(col, fc, f);
}
`;

const TERRAIN_VS = /* glsl */`
attribute vec2 a_uv;
attribute vec4 a_col;
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vSky;
varying float vDist;
varying vec3 vWorld;
flat varying float vKind;
void main() {
  vec3 p = position * (1.0 / 16.0) - 1.0;
  float pk = a_col.a * 255.0;
  float flag = floor(pk / 32.0 + 0.01);
  float sky = (pk - flag * 32.0) / 31.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float kind = 0.0;
  if (flag > 0.5 && flag < 1.5) {
    kind = 1.0;
    wp.x += sin(uTime * 1.6 + wp.x * 0.8 + wp.z * 0.6) * 0.06;
    wp.z += cos(uTime * 1.3 + wp.z * 0.7 + wp.x * 0.3) * 0.05;
  } else if (flag > 3.5) {
    kind = 1.0;
  } else if (flag > 1.5) {
    kind = 2.0;
    if (flag < 2.5) wp.y += (sin(uTime * 1.4 + wp.x * 1.1 + wp.z * 0.7) + sin(uTime * 1.1 - wp.z * 1.3 + wp.x * 0.4)) * 0.02 - 0.02;
  }
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vDist = length(mv.xyz);
  vUv = a_uv; vCol = a_col.rgb; vSky = sky; vWorld = wp.xyz; vKind = kind;
}`;

const TERRAIN_FS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uSkyLight;
uniform vec3 uCave;
uniform vec3 uWaterTint;
uniform vec3 uLamp;
uniform float uTime;
uniform float uTransp;
uniform float uBump;
uniform float uReflOn;
uniform sampler2D uReflMap;
uniform mat4 uReflMat;
varying vec2 vUv;
varying vec3 vCol;
varying float vSky;
varying float vDist;
varying vec3 vWorld;
flat varying float vKind;
${LIGHT_GLSL}

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
float waveH(vec2 q) {
  return sin(q.x * 1.9 + uTime * 0.9) * sin(q.y * 1.5 - uTime * 0.7)
       + 0.6 * sin((q.x + q.y) * 1.1 + uTime * 1.4) + 0.4 * sin(q.x * 3.7 - q.y * 2.9 + uTime * 1.9);
}
void main() {
  vec3 dpx = dFdx(vWorld), dpy = dFdy(vWorld);
  vec3 Ng = normalize(cross(dpx, dpy));
  vec2 dux = dFdx(vUv), duy = dFdy(vUv);
  vec3 vdir = normalize(vWorld - cameraPosition);
  vec4 c;
  float lampF = max(0.0, 1.0 - vDist / 20.0);
  vec3 lampL = uLamp * (1.0 - vSky) * lampF * lampF;

  if (vKind > 1.5) {
    // ---- water: waves, planar reflection, sun glitter ----
    vec2 q = floor(vWorld.xz * 16.0) / 16.0;
    float w = waveH(q);
    float e = 0.35;
    float gx = waveH(q + vec2(e, 0.0)) - waveH(q - vec2(e, 0.0));
    float gz = waveH(q + vec2(0.0, e)) - waveH(q - vec2(0.0, e));
    vec3 wN = normalize(vec3(-gx * 0.07, 1.0, -gz * 0.07));
    vec3 V = -vdir;
    float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(V, wN), 0.0, 1.0), 5.0);
    float sh = sunShadow(vWorld, vec3(0.0, 1.0, 0.0), 1.0);
    vec3 amb = skyAmbient(vec3(0.0, 1.0, 0.0)) * vSky;
    vec3 body = uWaterTint * (0.75 + 0.14 * w) * (amb + uSunColor * max(uSunDir.y, 0.0) * 0.5 * sh + uCave * 0.5) * uLightScale * 1.4;
    vec3 refl;
    if (uReflOn > 0.5) {
      vec4 rc = uReflMat * vec4(vWorld + vec3(wN.x, 0.0, wN.z) * 0.6, 1.0);
      vec2 ruv = clamp(rc.xy / rc.w, 0.002, 0.998);
      refl = texture2D(uReflMap, ruv).rgb;
    } else {
      refl = uFogColor * (amb + 0.15);
    }
    vec3 R = reflect(vdir, wN);
    float spec = pow(max(dot(R, uSunView), 0.0), 140.0) * 6.0 + pow(max(dot(R, uSunView), 0.0), 12.0) * 0.25;
    vec3 col = mix(body, refl, clamp(fres * 0.95 + 0.10, 0.0, 1.0));
    col += uSunColor * spec * sh * step(0.02, uSunView.y);
    c = vec4(col, clamp(0.70 + fres * 0.28, 0.0, 0.97));
    vec3 g = applyFog(c.rgb, vDist, vdir);
    gl_FragColor = vec4(g, c.a);
    #include <colorspace_fragment>
    return;
  }

  vec4 tex = texture2D(uAtlas, vUv);
  if (uTransp < 0.5 && tex.a < 0.5) discard;

  // face normal (plants use a soft upward normal)
  vec3 N = Ng;
  if (vKind > 0.5) N = normalize(vec3(0.0, 1.0, 0.0) + Ng * 0.35);
  else if (uBump > 0.5) {
    // pixel-relief bump from the texture's own brightness
    float k = 2.6 * (1.0 - smoothstep(14.0, 42.0, vDist));
    if (k > 0.01) {
      vec2 tile = floor(vUv * 16.0) / 16.0;
      vec2 lo = tile + 0.5 / 256.0, hi = tile + 1.0 / 16.0 - 0.5 / 256.0;
      float ex = 1.0 / 256.0;
      float hl = lum(texture2D(uAtlas, clamp(vUv - vec2(ex, 0.0), lo, hi)).rgb);
      float hr = lum(texture2D(uAtlas, clamp(vUv + vec2(ex, 0.0), lo, hi)).rgb);
      float hd = lum(texture2D(uAtlas, clamp(vUv - vec2(0.0, ex), lo, hi)).rgb);
      float hu = lum(texture2D(uAtlas, clamp(vUv + vec2(0.0, ex), lo, hi)).rgb);
      vec3 dp2perp = cross(dpy, Ng), dp1perp = cross(Ng, dpx);
      vec3 T = dp2perp * dux.x + dp1perp * duy.x;
      vec3 Bt = dp2perp * dux.y + dp1perp * duy.y;
      float invmax = inversesqrt(max(max(dot(T, T), dot(Bt, Bt)), 1e-12));
      N = normalize(T * invmax * (-(hr - hl) * k) + Bt * invmax * (-(hu - hd) * k) + Ng);
    }
  }
  float ndl = max(dot(N, uSunDir), 0.0);
  float ndlG = max(dot(Ng, uSunDir), 0.0);
  float sh = sunShadow(vWorld, Ng, ndlG);
  vec3 direct = uSunColor * ndl * sh * smoothstep(0.05, 0.9, vSky);
  vec3 amb = skyAmbient(N) * vSky;
  vec3 lit = vCol * ((direct + amb + uCave + lampL) * uLightScale);
  c = vec4(tex.rgb * lit, uTransp > 0.5 ? tex.a : 1.0);
  // subtle sun glint on glass / ice
  if (uTransp > 0.5) c.rgb += uSunColor * pow(max(dot(reflect(vdir, N), uSunView), 0.0), 60.0) * 0.8 * sh;
  c.rgb = applyFog(c.rgb, vDist, vdir);
  gl_FragColor = c;
  #include <colorspace_fragment>
}`;

export function makeTerrainMaterials(atlasTex) {
  U.uAtlas.value = atlasTex;
  const opaque = new THREE.ShaderMaterial({
    uniforms: { ...U, uTransp: { value: 0 } }, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
  });
  const trans = new THREE.ShaderMaterial({
    uniforms: { ...U, uTransp: { value: 1 } }, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  return { opaque, trans };
}

// ---- instanced textured cubes: debris, falling sand, primed TNT, held block ----
const INST_VS = /* glsl */`
attribute vec3 aTiles;   // top, bottom, side tile ids
attribute float aFlash;  // 0..1 white flash
attribute float aFace;   // 0 top, 1 bottom, 2 side
varying vec2 vUv;
varying float vFlash;
varying float vDist;
varying vec3 vNormalW;
varying vec3 vWorld;
void main() {
  float tile = aFace < 0.5 ? aTiles.x : (aFace < 1.5 ? aTiles.y : aTiles.z);
  float col = mod(tile, 16.0), row = floor(tile / 16.0);
  vUv = vec2((col + uv.x * 0.985 + 0.0075) / 16.0, (row + (1.0 - uv.y) * 0.985 + 0.0075) / 16.0);
  vFlash = aFlash;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const INST_FS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uCave;
varying vec2 vUv;
varying float vFlash;
varying float vDist;
varying vec3 vNormalW;
varying vec3 vWorld;
${LIGHT_GLSL}
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < 0.5) discard;
  vec3 N = normalize(vNormalW);
  float ndl = max(dot(N, uSunDir), 0.0);
  float sh = sunShadow(vWorld, N, ndl);
  vec3 lit = (uSunColor * ndl * sh + skyAmbient(N) + uCave * 0.5) * uLightScale;
  vec3 col = tex.rgb * lit;
  col = mix(col, vec3(2.6, 2.3, 2.0), vFlash);
  vec3 vdir = normalize(vWorld - cameraPosition);
  gl_FragColor = vec4(applyFog(col, vDist, vdir), 1.0);
  #include <colorspace_fragment>
}`;

export function makeInstMaterial(noShadow) {
  const u = { ...U };
  if (noShadow) u.uShadowOn = { value: 0 };
  return new THREE.ShaderMaterial({ uniforms: u, vertexShader: INST_VS, fragmentShader: INST_FS });
}

// Unit cube geometry with per-vertex face type (top/bottom/side)
export function makeCubeGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const face = new Float32Array(24);
  const kind = [2, 2, 0, 1, 2, 2];   // BoxGeometry face order: +x,-x,+y,-y,+z,-z
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) face[f * 4 + v] = kind[f];
  g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  return g;
}

// ---- sheep / player body: textured meshes with the same lighting + shadows ----
const ENT_VS = /* glsl */`
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vDist;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ENT_FS = /* glsl */`
uniform sampler2D uMap;
uniform vec3 uTint;
uniform float uHasMap;
varying vec2 vUv;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vDist;
${LIGHT_GLSL}
void main() {
  vec3 base = uTint;
  if (uHasMap > 0.5) base *= texture2D(uMap, vUv).rgb;
  vec3 N = normalize(vNormalW);
  float ndl = max(dot(N, uSunDir), 0.0);
  float sh = sunShadow(vWorld, N, ndl);
  vec3 lit = (uSunColor * ndl * sh + skyAmbient(N) + vec3(0.03)) * uLightScale;
  vec3 vdir = normalize(vWorld - cameraPosition);
  gl_FragColor = vec4(applyFog(base * lit, vDist, vdir), 1.0);
  #include <colorspace_fragment>
}`;
export function makeEntityMaterial(map, tint) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uMap: { value: map || DUMMY_TEX }, uHasMap: { value: map ? 1 : 0 }, uTint: { value: tint ? tint.clone() : new THREE.Color(1, 1, 1) } },
    vertexShader: ENT_VS, fragmentShader: ENT_FS,
  });
}
