// Renderer, lights, post-processing (AO, god rays, bloom, grading) and quality presets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { QUALITY } from './config.js';
import { createScenery, SKY, SUN_DIR, VIS_SUN } from './scenery.js';

export { SUN_DIR };

const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

function godRayShader(samples) {
  return {
    uniforms: { tDiffuse: { value: null }, sun: { value: new THREE.Vector2(0.3, 0.7) }, strength: { value: 0 }, aspect: { value: 1.78 } },
    vertexShader: VERT,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 sun; uniform float strength; uniform float aspect; varying vec2 vUv;
      float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
      void main(){
        vec4 base = texture2D(tDiffuse, vUv);
        if (strength <= 0.001) { gl_FragColor = base; return; }
        vec2 step = (sun - vUv) / ${samples}.0 * 0.9;
        float j = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
        vec2 uv = vUv + step * j;
        float decay = 1.0; vec3 acc = vec3(0.0);
        for (int i = 0; i < ${samples}; i++) {
          uv += step;
          vec3 s = texture2D(tDiffuse, uv).rgb;
          float l = max(lum(s) - 1.3, 0.0);
          acc += s * l * decay; decay *= 0.92;
        }
        acc /= ${samples}.0;
        vec3 col = base.rgb + acc * vec3(1.0, 0.82, 0.55) * strength * 0.75;
        // screen-space lens flare, hidden when the sun is covered
        float vis = smoothstep(0.85, 2.2, lum(texture2D(tDiffuse, clamp(sun, 0.001, 0.999)).rgb)) * strength;
        if (vis > 0.01) {
          vec2 dir = vec2(0.5) - sun; vec2 q = (vUv - sun) * vec2(aspect, 1.0);
          float d0 = length(q);
          col += vec3(1.0, 0.8, 0.55) * smoothstep(0.09, 0.0, abs(d0 - 0.13)) * 0.05 * vis;       // halo ring
          for (int k = 0; k < 4; k++) {
            float f = 0.32 + float(k) * 0.34;
            vec2 gp = sun + dir * f * 1.6;
            float d = length((vUv - gp) * vec2(aspect, 1.0));
            float r = 0.035 + float(k) * 0.02;
            vec3 tint = k == 0 ? vec3(0.5, 0.8, 1.0) : k == 1 ? vec3(1.0, 0.7, 0.4) : k == 2 ? vec3(0.6, 1.0, 0.7) : vec3(1.0, 0.6, 0.85);
            col += tint * smoothstep(r, r * 0.2, d) * 0.07 * vis;
          }
        }
        gl_FragColor = vec4(col, base.a);
      }`,
  };
}

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, aberr: { value: 0.004 }, grain: { value: 0.01 }, res: { value: new THREE.Vector2(1280, 720) } },
  vertexShader: VERT,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float aberr; uniform float grain; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * aberr * r2).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * aberr * r2).b;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col *= mix(vec3(0.93, 0.98, 1.07), vec3(1.07, 1.0, 0.90), smoothstep(0.08, 1.1, l));      // cool shadows, warm highlights
      col = mix(vec3(l), col, 1.06);                                                             // saturation
      col = max((col - 0.18) * 1.06 + 0.18, 0.0);                                                // contrast
      col *= 1.0 - 0.30 * smoothstep(0.10, 0.62, r2);                                            // vignette
      col += (hash(vUv * res + time) - 0.5) * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Gfx {
  constructor(container) {
    this.container = container;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'gl';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.fog, 150, 560);
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 1000);
    this.camera.position.set(0, 14, 70);

    // lights: warm key sun with soft shadows, sky/ground bounce, cool rim from behind
    this.hemi = new THREE.HemisphereLight(0xb8dcff, 0x7a9a50, 1.05);
    this.scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffe6bd, 3.5);
    sun.position.copy(SUN_DIR).multiplyScalar(150).add(new THREE.Vector3(8, 4, 0));
    sun.target.position.set(8, 4, 0);
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -78; sc.right = 78; sc.top = 48; sc.bottom = -48; sc.near = 20; sc.far = 340;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 3;
    this.scene.add(sun, sun.target);
    const rim = this.rim = new THREE.DirectionalLight(0x9cc4ff, 0.8);
    rim.position.set(60, 40, -90);
    this.scene.add(rim);

    this.scenery = createScenery(this.scene, renderer);
    this.bloomBase = 0.36;
    this.bloomBoost = 0;
    this.quality = 'medium';
    this.qualityCfg = QUALITY.medium;
    this.composer = null; this.bloomPass = null; this.rayPass = null; this.gradePass = null; this.gtao = null;

    this._v = new THREE.Vector3();

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
    this.rim.visible = q.bloom;
    this.scenery.setDetail(q);
    this.buildComposer();
    this.resize();
    if (particlesCb) particlesCb(q);
  }

  buildComposer() {
    const q = this.qualityCfg;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    this.gtao = this.rayPass = this.gradePass = this.bloomPass = null;
    if (!q.bloom) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
    const composer = this.composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (q.ao) {
      const gtao = this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 1.0;
      gtao.updateGtaoMaterial({ radius: 1.6, distanceExponent: 1.4, thickness: 1.5, scale: 1.2, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      const orig = gtao.render.bind(gtao);
      const scene = this.scene;
      gtao.render = (...a) => {           // keep sky, water, particles, glass out of the AO depth/normal pass
        const hidden = [];
        scene.traverse((o) => {
          if (!o.visible) return;
          if (o.userData.noAO || o.isSprite || o.isPoints || (o.material && !Array.isArray(o.material) && o.material.transparent)) { o.visible = false; hidden.push(o); }
        });
        orig(...a);
        for (const o of hidden) o.visible = true;
      };
      composer.addPass(gtao);
    }
    if (q.rays) {
      const rp = this.rayPass = new ShaderPass(new THREE.ShaderMaterial(godRayShader(q.rays)));
      composer.addPass(rp);
    }
    const k = this.quality === 'high' ? 1 : 0.5;
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x * k, size.y * k), this.bloomBase, 0.6, 1.3);
    composer.addPass(this.bloomPass);
    if (q.grade) {
      this.gradePass = new ShaderPass(GradeShader);
      this.gradePass.uniforms.aberr.value = this.quality === 'high' ? 0.006 : 0.0;
      this.gradePass.uniforms.grain.value = this.quality === 'high' ? 0.006 : 0.003;
      composer.addPass(this.gradePass);
    }
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
      if (this.gradePass) this.gradePass.uniforms.res.value.set(w * pr, h * pr);
    }
  }

  // brief bloom flash for explosions
  flash(amount) { this.bloomBoost = Math.min(1.2, this.bloomBoost + amount); }

  render(dt, time) {
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 1.8);
    if (this.bloomPass) this.bloomPass.strength = this.bloomBase + this.bloomBoost;
    this.scenery.update(time, this.camera, dt);
    if (this.rayPass) {
      const v = this._v.copy(VIS_SUN).multiplyScalar(480).add(this.camera.position).project(this.camera);
      const behind = this._v.z > 1;
      const off = Math.max(Math.abs(v.x), Math.abs(v.y));
      this.rayPass.material.uniforms.sun.value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5);
      this.rayPass.material.uniforms.aspect.value = this.camera.aspect;
      this.rayPass.material.uniforms.strength.value = behind ? 0 : THREE.MathUtils.clamp(1.25 - off * 0.55, 0, 1) * (1 + this.bloomBoost * 0.4);
    }
    if (this.gradePass) this.gradePass.uniforms.time.value = time % 100;
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
