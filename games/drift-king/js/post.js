// Final grade: teal shadows / warm highlights, vignette, film grain and a touch of chromatic aberration.
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAmount: { value: 1 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uAmount; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = dot(c, c);
      vec2 off = c * d * 0.012 * uAmount;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // split toning
      col = mix(col, col * vec3(0.86, 0.98, 1.16), (1.0 - smoothstep(0.0, 0.55, l)) * 0.6 * uAmount);
      col += vec3(0.07, 0.03, -0.02) * smoothstep(0.45, 1.0, l) * uAmount;
      // contrast S-curve
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.32 * uAmount);
      // vignette
      col *= 1.0 - smoothstep(0.14, 0.66, d) * 0.5 * uAmount;
      // grain
      col += (hash(vUv * 1400.0) - 0.5) * 0.045 * uAmount;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

// Volumetric-looking headlight beam: additive cone that fades along its length and at the silhouette.
export const beamVert = /* glsl */ `
varying float vT; varying vec3 vN; varying vec3 vV;
uniform float uLen;
void main(){
  vT = clamp(position.z / uLen, 0.0, 1.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
export const beamFrag = /* glsl */ `
varying float vT; varying vec3 vN; varying vec3 vV;
uniform vec3 uColor; uniform float uAlpha;
void main(){
  float f = pow(abs(dot(normalize(vN), normalize(vV))), 1.6);
  float a = pow(1.0 - vT, 1.7) * smoothstep(0.0, 0.05, vT) * f * uAlpha;
  gl_FragColor = vec4(uColor * a, a);
}`;
