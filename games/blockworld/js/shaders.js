// Shared uniforms + custom materials (terrain, debris/entities). Everything is fogged to match the sky.
import * as THREE from 'three';

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
};

const TERRAIN_VS = /* glsl */`
attribute vec2 a_uv;
attribute vec4 a_col;
uniform float uTime;
varying vec2 vUv;
varying vec3 vCol;
varying float vSky;
varying float vDist;
varying vec3 vWorld;
varying float vFlag;
void main() {
  vec3 p = position * (1.0 / 16.0) - 1.0;
  float pk = a_col.a * 255.0;
  float flag = floor(pk / 64.0 + 0.01);
  float sky = (pk - flag * 64.0) / 63.0;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  if (flag > 0.5 && flag < 1.5) {
    wp.x += sin(uTime * 1.6 + wp.x * 0.8 + wp.z * 0.6) * 0.06;
    wp.z += cos(uTime * 1.3 + wp.z * 0.7 + wp.x * 0.3) * 0.05;
  } else if (flag > 1.5 && flag < 2.5) {
    wp.y += (sin(uTime * 1.4 + wp.x * 1.1 + wp.z * 0.7) + sin(uTime * 1.1 - wp.z * 1.3 + wp.x * 0.4)) * 0.02 - 0.02;
  }
  vec4 mv = viewMatrix * wp;
  gl_Position = projectionMatrix * mv;
  vDist = length(mv.xyz);
  vUv = a_uv; vCol = a_col.rgb; vSky = sky; vWorld = wp.xyz; vFlag = flag;
}`;

const TERRAIN_FS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uSkyLight;
uniform vec3 uCave;
uniform vec3 uFogColor;
uniform vec3 uWaterTint;
uniform vec3 uLamp;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uTransp;
varying vec2 vUv;
varying vec3 vCol;
varying float vSky;
varying float vDist;
varying vec3 vWorld;
varying float vFlag;
void main() {
  float lampF = max(0.0, 1.0 - vDist / 20.0);
  vec3 lit = vCol * (uCave + vSky * uSkyLight + uLamp * (1.0 - vSky) * lampF * lampF);
  vec4 c;
  if (vFlag > 1.5) {
    vec2 q = floor(vWorld.xz * 16.0) / 16.0;
    float w = sin(q.x * 1.9 + uTime * 0.9) * sin(q.y * 1.5 - uTime * 0.7)
            + 0.6 * sin((q.x + q.y) * 1.1 + uTime * 1.4) + 0.4 * sin(q.x * 3.7 - q.y * 2.9 + uTime * 1.9);
    vec3 base = uWaterTint * (0.72 + 0.16 * w);
    base += vec3(0.30, 0.36, 0.40) * smoothstep(1.55, 2.0, w);
    vec3 vdir = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(abs(vdir.y), 0.0, 1.0), 4.0);
    vec3 col = base * lit;
    col = mix(col, uFogColor * (uCave + vSky * uSkyLight) * 0.85, fres * 0.4);
    c = vec4(col, clamp(0.72 + fres * 0.22 + 0.04 * w, 0.0, 0.96));
  } else {
    vec4 tex = texture2D(uAtlas, vUv);
    if (uTransp < 0.5 && tex.a < 0.5) discard;
    c = vec4(tex.rgb * lit, uTransp > 0.5 ? tex.a : 1.0);
  }
  float f = smoothstep(uFogNear, uFogFar, vDist);
  c.rgb = mix(c.rgb, uFogColor, f);
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

// ---- instanced textured cubes: debris, falling sand, primed TNT ----
const INST_VS = /* glsl */`
attribute vec3 aTiles;   // top, bottom, side tile ids
attribute float aFlash;  // 0..1 white flash
attribute float aFace;   // 0 top, 1 bottom, 2 side
uniform float uTime;
varying vec2 vUv;
varying float vFlash;
varying float vShade;
varying float vDist;
varying vec3 vNormalW;
void main() {
  float tile = aFace < 0.5 ? aTiles.x : (aFace < 1.5 ? aTiles.y : aTiles.z);
  float col = mod(tile, 16.0), row = floor(tile / 16.0);
  vUv = vec2((col + uv.x * 0.985 + 0.0075) / 16.0, (row + (1.0 - uv.y) * 0.985 + 0.0075) / 16.0);
  vFlash = aFlash;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vec3 n = normalize(mat3(modelMatrix * instanceMatrix) * normal);
  vShade = 0.62 + 0.38 * (n.y * 0.5 + 0.5) - 0.06 * abs(n.x);
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const INST_FS = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uSkyLight;
uniform vec3 uCave;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vUv;
varying float vFlash;
varying float vShade;
varying float vDist;
void main() {
  vec4 tex = texture2D(uAtlas, vUv);
  if (tex.a < 0.5) discard;
  vec3 col = tex.rgb * vShade * (uCave * 0.6 + uSkyLight * 0.92);
  col = mix(col, vec3(2.4, 2.2, 2.0), vFlash);
  float f = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, uFogColor, f);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export function makeInstMaterial() {
  return new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: INST_VS, fragmentShader: INST_FS });
}

// Unit cube geometry with per-vertex face type (top/bottom/side)
export function makeCubeGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const face = new Float32Array(24);
  // BoxGeometry face order: +x,-x,+y,-y,+z,-z, 4 verts each
  const kind = [2, 2, 0, 1, 2, 2];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) face[f * 4 + v] = kind[f];
  g.setAttribute('aFace', new THREE.BufferAttribute(face, 1));
  return g;
}
