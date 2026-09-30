// Renderer + post-processing pipeline + graphics quality tiers + dynamic resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { store, params, clamp } from './util.js';

/**
 * Quality tiers. `detail` scales scenery/particle counts everywhere so every game respects the setting.
 */
export const QUALITY = {
  low:    { dpr: 1.0, shadow: 1024, shadowType: 'pcf',     composer: false, bloom: false, msaa: 0, smaa: false, detail: 0.35, outlines: false, maxParticles: 900,  env: false, grade: false, shafts: false },
  medium: { dpr: 1.5, shadow: 2048, shadowType: 'pcfsoft', composer: true,  bloom: true,  bloomScale: 0.5,  msaa: 0, smaa: true,  detail: 0.7,  outlines: true,  maxParticles: 2500, env: true,  grade: true,  shafts: true },
  high:   { dpr: 2.0, shadow: 4096, shadowType: 'pcfsoft', composer: true,  bloom: true,  bloomScale: 0.75, msaa: 4, smaa: true,  detail: 1.0,  outlines: true,  maxParticles: 5000, env: true,  grade: true,  shafts: true },
};

export function defaultQuality() {
  const q = params.get('q');
  if (q && QUALITY[q]) return q;
  const saved = store.get('quality');
  if (saved && QUALITY[saved]) return saved;
  const mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (mobile) return cores >= 6 && mem >= 4 ? 'medium' : 'low';
  return cores >= 4 ? 'high' : 'medium';
}

const GRADE = {
  uniforms: { tDiffuse: { value: null }, uVig: { value: 0.32 }, uSat: { value: 1.08 }, uCon: { value: 1.05 }, uAb: { value: 0 }, uTime: { value: 0 }, uGrain: { value: 0.018 }, uTint: { value: new THREE.Vector3(1, 1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVig,uSat,uCon,uAb,uTime,uGrain; uniform vec3 uTint; varying vec2 vUv;
    float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = length(c);
      vec2 off = c * uAb * (0.4 + d);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, uSat);
      col = (col - 0.5) * uCon + 0.5;
      col *= uTint;
      col *= 1.0 - uVig * smoothstep(0.32, 0.95, d * 1.3);
      col += (h21(vUv * 900.0 + uTime) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.level = defaultQuality();
    this.cfg = QUALITY[this.level];
    this.view = { scene: null, camera: null };
    this.bloomParams = { strength: 0.35, radius: 0.55, threshold: 0.85 };
    this.dynRes = params.get('dyn') !== '0';
    this.dprScale = 1;
    this.fps = 60;
    this._acc = 0; this._n = 0; this._lowFor = 0; this._highFor = 0;
    this.listeners = new Set();
    this.lights = new Set();
    this.composer = null;
    this.w = 1; this.h = 1;
    this._build();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    this.resize();
  }

  get maxDpr() { return Math.min(devicePixelRatio || 1, this.cfg.dpr); }
  get pixelRatio() { return Math.max(0.5, this.maxDpr * this.dprScale); }

  _build() {
    const r = this.renderer;
    r.shadowMap.type = this.cfg.shadowType === 'pcfsoft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    this.renderPass = this.bloomPass = this.smaaPass = this.outputPass = this.gradePass = null; this.gradeU = null;
    if (this.cfg.composer) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x || 2, size.y || 2, { type: THREE.HalfFloatType, samples: this.cfg.msaa, colorSpace: THREE.LinearSRGBColorSpace });
      this.composer = new EffectComposer(r, rt);
      this.renderPass = new RenderPass(this.view.scene || new THREE.Scene(), this.view.camera || new THREE.PerspectiveCamera());
      this.composer.addPass(this.renderPass);
      if (this.cfg.bloom) {
        this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), this.bloomParams.strength, this.bloomParams.radius, this.bloomParams.threshold);
        this.composer.addPass(this.bloomPass);
      }
      this.outputPass = new OutputPass();
      this.composer.addPass(this.outputPass);
      if (this.cfg.grade) { this.gradePass = new ShaderPass(GRADE); this.composer.addPass(this.gradePass); this.gradeU = this.gradePass.uniforms; }
      if (this.cfg.smaa) {
        this.smaaPass = new SMAAPass(2, 2);
        this.composer.addPass(this.smaaPass);
      }
    }
    for (const l of this.lights) this._tuneLight(l);
    this._applySize();
  }

  setQuality(level) {
    if (!QUALITY[level]) return;
    this.level = level; this.cfg = QUALITY[level];
    this.dprScale = 1;
    store.set('quality', level);
    this._build();
    this.listeners.forEach((fn) => fn(level, this.cfg));
  }
  onQuality(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  /** Register a shadow-casting light so it follows the quality tier. */
  tuneLight(light) { this.lights.add(light); this._tuneLight(light); return light; }
  untuneLight(light) { this.lights.delete(light); }
  _tuneLight(light) {
    if (!light.shadow) return;
    const size = clamp(this.cfg.shadow, 512, this.renderer.capabilities.maxTextureSize);
    if (light.shadow.mapSize.x !== size) {
      light.shadow.mapSize.set(size, size);
      if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
    }
    light.shadow.radius = this.cfg.shadowType === 'pcfsoft' ? 3 : 1;
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.03;
  }

  setView(scene, camera) {
    this.view.scene = scene; this.view.camera = camera;
    if (this.renderPass) { this.renderPass.scene = scene; this.renderPass.camera = camera; }
    if (camera && camera.isPerspectiveCamera) { camera.aspect = this.w / this.h; camera.updateProjectionMatrix(); }
  }
  setBloom(strength, radius = 0.55, threshold = 0.85) {
    Object.assign(this.bloomParams, { strength, radius, threshold });
    if (this.bloomPass) { this.bloomPass.strength = strength; this.bloomPass.radius = radius; this.bloomPass.threshold = threshold; }
  }

  resize() {
    this.w = Math.max(1, innerWidth); this.h = Math.max(1, innerHeight);
    this._applySize();
  }
  _applySize() {
    const r = this.renderer, pr = this.pixelRatio;
    r.setPixelRatio(pr);
    r.setSize(this.w, this.h, false);
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(this.w, this.h);
      if (this.bloomPass) this.bloomPass.resolution.set(this.w * pr * (this.cfg.bloomScale || 0.5), this.h * pr * (this.cfg.bloomScale || 0.5));
    }
    const cam = this.view.camera;
    if (cam && cam.isPerspectiveCamera) { cam.aspect = this.w / this.h; cam.updateProjectionMatrix(); }
    this.aspect = this.w / this.h;
    this.portrait = this.aspect < 1;
  }

  /** Colour grading: vignette, saturation, contrast, tint, film grain. */
  setGrade({ vig = 0.32, sat = 1.08, con = 1.05, grain = 0.018, tint = [1, 1, 1] } = {}) { this.gradeTarget = { vig, sat, con, grain, tint }; const u = this.gradeU; if (u) { u.uVig.value = vig; u.uSat.value = sat; u.uCon.value = con; u.uGrain.value = grain; u.uTint.value.set(...tint); } }
  /** Brief chromatic-aberration pulse (impacts, big hits). */
  punch(v = 1) { this.ab = Math.min(1.5, (this.ab || 0) + v); }

  /**
   * Image-based lighting: bake a gradient sky (+ sun) into a PMREM environment so metals, glass and glossy floors
   * pick up realistic reflections. No-op on Low.
   */
  setEnvironment(scene, { top = 0x6aa8ff, mid = 0xbfe0ff, horizon = 0xffffff, ground = 0x404040, sunDir = [0.5, 0.8, 0.4], sunColor = 0xffffff, sunPower = 6, intensity = 1 } = {}) {
    if (!this.cfg.env) { scene.environment = null; return null; }
    const env = new THREE.Scene();
    const mat = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { a: { value: new THREE.Color(top) }, b: { value: new THREE.Color(mid) }, c: { value: new THREE.Color(horizon) }, g: { value: new THREE.Color(ground) }, sd: { value: new THREE.Vector3(...sunDir).normalize() }, sc: { value: new THREE.Color(sunColor).multiplyScalar(sunPower) } }, vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }', fragmentShader: 'varying vec3 p; uniform vec3 a,b,c,g,sd,sc; void main(){ float y = p.y; vec3 col = y > 0. ? mix(c, mix(b, a, smoothstep(.25,.9,y)), smoothstep(0.,.3,y)) : mix(c, g, smoothstep(0.,-.35,y)); float s = max(dot(normalize(p), sd), 0.); col += sc * (pow(s, 220.) + pow(s, 14.) * 0.12); gl_FragColor = vec4(col, 1.); }' });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat));
    this._pmrem ||= new THREE.PMREMGenerator(this.renderer);
    const rt = this._pmrem.fromScene(env, 0.02);
    if (scene.environment && scene.userData.envRT) scene.userData.envRT.dispose();
    scene.environment = rt.texture; scene.userData.envRT = rt; scene.environmentIntensity = intensity;
    mat.dispose(); env.children[0].geometry.dispose();
    return rt.texture;
  }

  render(dtRaw) {
    const { scene, camera } = this.view;
    if (!scene || !camera) return;
    if (this.gradeU) { this.ab = Math.max(0, (this.ab || 0) - dtRaw * 2.2); this.gradeU.uAb.value = this.ab * 0.012; this.gradeU.uTime.value = (this.gradeU.uTime.value + dtRaw * 37) % 1000; }
    if (this.composer) this.composer.render(dtRaw); else this.renderer.render(scene, camera);
    this._track(dtRaw);
  }

  _track(dt) {
    if (dt <= 0 || dt > 0.5) return;
    this._acc += dt; this._n++;
    if (this._n < 30) return;
    const avg = this._acc / this._n; this._acc = 0; this._n = 0;
    this.fps = this.fps * 0.5 + (1 / avg) * 0.5;
    if (!this.dynRes) return;
    if (this.fps < 46) { this._lowFor++; this._highFor = 0; } else if (this.fps > 57) { this._highFor++; this._lowFor = 0; } else { this._lowFor = 0; this._highFor = 0; }
    if (this._lowFor >= 2 && this.dprScale > 0.55) { this.dprScale = Math.max(0.55, this.dprScale - 0.15); this._lowFor = 0; this._applySize(); }
    else if (this._highFor >= 8 && this.dprScale < 1) { this.dprScale = Math.min(1, this.dprScale + 0.1); this._highFor = 0; this._applySize(); }
  }
}
