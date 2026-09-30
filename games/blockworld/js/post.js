// Screen-space finish: speed blur while flying, chromatic fringe, vignette, teal/orange grade, film grain.
export const GradeShader = {
  name: 'GradeShader',
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVig: { value: 0.55 },
    uSpeed: { value: 0 },
    uAberr: { value: 0.0015 },
    uGrain: { value: 0.035 },
    uMood: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uSpeed, uAberr, uGrain, uMood;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec3 col;
      if (uSpeed > 0.002) {
        col = vec3(0.0);
        for (int i = 0; i < 10; i++) col += texture2D(tDiffuse, vUv - d * uSpeed * (float(i) / 9.0)).rgb;
        col /= 10.0;
      } else {
        vec2 ab = d * uAberr * (0.4 + r2 * 6.0);
        col = vec3(texture2D(tDiffuse, vUv + ab).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - ab).b);
      }
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      // moody grade: cool shadows, warm highlights, a little extra contrast
      vec3 shadowTint = vec3(0.86, 0.98, 1.10);
      vec3 highTint = vec3(1.08, 1.02, 0.92);
      col *= mix(vec3(1.0), mix(shadowTint, highTint, smoothstep(0.05, 1.1, lum)), uMood * 0.75);
      col = mix(vec3(lum), col, 0.92 + 0.06 * uMood);
      col = pow(max(col, 0.0), vec3(1.0 + 0.06 * uMood));
      col *= 1.0 - uVig * smoothstep(0.10, 0.62, r2);
      col += (hash(vUv * 1024.0) - 0.5) * uGrain * (1.0 - clamp(lum, 0.0, 1.0) * 0.6);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
