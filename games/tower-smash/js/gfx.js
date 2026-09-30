// Renderer, lights, post-processing and quality presets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QUALITY } from './config.js';
import { createScenery, SKY } from './scenery.js';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.78, 0.46).normalize();

export class Gfx {
  constructor(container) {
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({
      antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'gl';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.fog, 150, 560);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1000);
    this.camera.position.set(0, 14, 70);

    // lights: warm sun with soft shadows + sky/ground bounce
    this.hemi = new THREE.HemisphereLight(0xbfe4ff, 0x77a052, 1.15);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
    sun.position.copy(SUN_DIR).multiplyScalar(140).add(new THREE.Vector3(8, 4, 0));
    sun.target.position.set(8, 4, 0);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -78; sc.right = 78; sc.top = 46; sc.bottom = -46; sc.near = 20; sc.far = 320;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.035;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);

    this.scenery = createScenery(this.scene, renderer);
    this.bloomBase = 0.34;
    this.bloomBoost = 0;
    this.quality = 'medium';
    this.qualityCfg = QUALITY.medium;
    this.composer = null;
    this.bloomPass = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name, particlesCb) {
    const q = QUALITY[name] || QUALITY.medium;
    this.quality = name;
    this.qualityCfg = q;
    const r = this.renderer;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.scenery.setDetail(q);
    this.buildComposer();
    this.resize();
    if (particlesCb) particlesCb(q);
  }

  buildComposer() {
    const q = this.qualityCfg;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    if (!q.bloom) { this.bloomPass = null; return; }
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = this.composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const k = this.quality === 'high' ? 1 : 0.5;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * k, size.y * k), this.bloomBase, 0.55, 1.0);
    composer.addPass(this.bloomPass);
    composer.addPass(new OutputPass());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      const k = this.quality === 'high' ? 1 : 0.5;
      const pr = this.renderer.getPixelRatio();
      this.bloomPass?.resolution.set(w * pr * k, h * pr * k);
    }
  }

  // brief bloom flash for explosions
  flash(amount) { this.bloomBoost = Math.min(1.2, this.bloomBoost + amount); }

  render(dt, time) {
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 1.8);
    if (this.bloomPass) this.bloomPass.strength = this.bloomBase + this.bloomBoost;
    this.scenery.update(time, this.camera);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
