// Renderer + post-processing pipeline + graphics quality tiers + dynamic resolution.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { store, params, clamp } from './util.js';

/**
 * Quality tiers. `detail` scales scenery/particle counts everywhere so every game respects the setting.
 */
export const QUALITY = {
  low:    { dpr: 1.0, shadow: 1024, shadowType: 'pcf',     composer: false, bloom: false, msaa: 0, smaa: false, detail: 0.35, outlines: false, maxParticles: 900 },
  medium: { dpr: 1.5, shadow: 2048, shadowType: 'pcfsoft', composer: true,  bloom: true,  bloomScale: 0.5,  msaa: 0, smaa: true,  detail: 0.7,  outlines: true,  maxParticles: 2500 },
  high:   { dpr: 2.0, shadow: 2048, shadowType: 'pcfsoft', composer: true,  bloom: true,  bloomScale: 0.75, msaa: 4, smaa: true,  detail: 1.0,  outlines: true,  maxParticles: 5000 },
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
    this.renderPass = this.bloomPass = this.smaaPass = this.outputPass = null;
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

  render(dtRaw) {
    const { scene, camera } = this.view;
    if (!scene || !camera) return;
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
