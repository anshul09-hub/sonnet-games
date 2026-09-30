// Visual world: terrain, road, barriers, scenery, gantry, lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EDGE, ROAD_HW, WALL_OFF, CELL, RAMP_LEN } from './track.js';
import { roadGeometryData, wallGeometryData, WALL_H } from './trackphysics.js';
import { makeSky, makeEnvironment, SUN_DIR, FOG_COLOR } from './sky.js';
import { makeRoadTexture, makeRoadRoughness, makeTerrainDetail, makeCheckerTexture, makeBannerTexture, makeSoftCircle } from './textures.js';
import { rng, fbm, clamp, lerp, smoothstep } from './util.js';

const col = (hex) => new THREE.Color(hex);

function paintGeometry(geo, color) {
  if (geo.index) geo = geo.toNonIndexed();
  const n = geo.attributes.position.count;
  const c = new Float32Array(n * 3);
  const cc = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

export class World {
  constructor(scene, renderer, track, terrain, quality) {
    this.scene = scene;
    this.renderer = renderer;
    this.track = track;
    this.terrain = terrain;
    this.quality = quality;
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.chunks = [];
    this.treeChunks = [];
    this.gantry = null;
    this.lightMats = [];
    this.build();
  }

  build() {
    const { scene } = this;
    scene.background = new THREE.Color(FOG_COLOR);
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0021);

    // lights
    this.hemi = new THREE.HemisphereLight(0x6e84c8, 0x3a2a36, 0.95);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xff8f45, 3.1);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.05;
    this.sun.shadow.radius = 3;
    scene.add(this.sun, this.sun.target);
    // cool fill from the opposite side so shaded slopes keep colour
    this.fill = new THREE.DirectionalLight(0x5a78e0, 0.55);
    this.fill.position.set(-SUN_DIR.x * 100, 60, -SUN_DIR.z * 100);
    scene.add(this.fill);

    this.sky = makeSky(this.quality.clouds);
    scene.add(this.sky);
    scene.environment = makeEnvironment(this.renderer);
    scene.environmentIntensity = 0.7;

    this.buildTerrain();
    this.buildRoad();
    this.buildWalls();
    this.buildGap();
    this.buildScenery();
    this.buildGantry();
    this.buildMountains();
    this.applyQuality(this.quality);
  }

  // ---------------------------------------------------------------- terrain
  buildTerrain() {
    const T = this.terrain, { nx, nz, heights, dist, inGap } = T;
    const n = nx * nz;
    const colors = new Float32Array(n * 3);
    const palGrassA = col(0x3e5626), palGrassB = col(0x77632c), palGrassC = col(0x263f2c), palRock = col(0x504644), palRock2 = col(0x6c5d58);
    const palGravel = col(0x6f5d4a), palPit = col(0x40282a), palPeak = col(0x77665f);
    const tmp = new THREE.Color();
    for (let cz = 0; cz < nz; cz++) {
      for (let cx = 0; cx < nx; cx++) {
        const i = cz * nx + cx;
        const x = T.x0 + cx * CELL, z = T.z0 + cz * CELL;
        const hx = heights[cz * nx + Math.min(nx - 1, cx + 1)] - heights[cz * nx + Math.max(0, cx - 1)];
        const hz = heights[Math.min(nz - 1, cz + 1) * nx + cx] - heights[Math.max(0, cz - 1) * nx + cx];
        const slope = Math.hypot(hx, hz) / (2 * CELL);
        const n1 = fbm(x * 0.012 + 3, z * 0.012 - 9, 3), n2 = fbm(x * 0.05, z * 0.05, 2);
        tmp.copy(palGrassA).lerp(palGrassB, smoothstep(0.35, 0.7, n1)).lerp(palGrassC, smoothstep(0.55, 0.85, fbm(x * 0.02 + 50, z * 0.02, 2)) * 0.6);
        tmp.multiplyScalar(0.86 + n2 * 0.3);
        tmp.lerp(palRock, smoothstep(0.65, 1.15, slope) * 0.8);
        tmp.lerp(palPeak, smoothstep(34, 58, heights[i]) * 0.7);
        const d = dist[i];
        tmp.lerp(palGravel, (1 - smoothstep(EDGE + 0.5, EDGE + 7.5, d)) * (inGap[i] ? 0 : 1));
        if (inGap[i]) tmp.lerp(palPit, 0.85 - smoothstep(0, 18, heights[i]) * 0.2);
        colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0, map: makeTerrainDetail(this.aniso) });
    this.terrainMat = mat;
    const CS = 32; // cells per chunk
    for (let cz0 = 0; cz0 < nz - 1; cz0 += CS) {
      for (let cx0 = 0; cx0 < nx - 1; cx0 += CS) {
        const cx1 = Math.min(nx - 1, cx0 + CS), cz1 = Math.min(nz - 1, cz0 + CS);
        const w = cx1 - cx0 + 1, h = cz1 - cz0 + 1;
        const pos = new Float32Array(w * h * 3), colA = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2);
        let k = 0;
        for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
          const i = cz * nx + cx;
          const x = T.x0 + cx * CELL, z = T.z0 + cz * CELL;
          pos[k * 3] = x; pos[k * 3 + 1] = heights[i]; pos[k * 3 + 2] = z;
          colA[k * 3] = colors[i * 3]; colA[k * 3 + 1] = colors[i * 3 + 1]; colA[k * 3 + 2] = colors[i * 3 + 2];
          uv[k * 2] = x / 9; uv[k * 2 + 1] = z / 9;
          k++;
        }
        const idx = new Uint32Array((w - 1) * (h - 1) * 6);
        let q = 0;
        for (let j = 0; j < h - 1; j++) for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
          idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
        g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        g.setIndex(new THREE.BufferAttribute(idx, 1));
        g.computeBoundingSphere(); g.computeBoundingBox();
        const m = new THREE.Mesh(g, mat);
        m.receiveShadow = true;
        this.scene.add(m);
        this.chunks.push(m);
      }
    }
    // giant skirt so the world never ends in a void
    const skirt = new THREE.Mesh(new THREE.CircleGeometry(6000, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: FOG_COLOR }));
    skirt.position.y = -25;
    this.scene.add(skirt);
  }

  // ---------------------------------------------------------------- road
  buildRoad() {
    const rd = roadGeometryData(this.track);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(rd.positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(rd.uvs, 2));
    g.setIndex(rd.indices);
    g.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ map: makeRoadTexture(this.aniso), roughnessMap: makeRoadRoughness(this.aniso), roughness: 1, metalness: 0.0, clearcoat: 0.55, clearcoatRoughness: 0.3, envMapIntensity: 1.6 });
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    m.renderOrder = 1;
    this.scene.add(m);
    this.roadMesh = m;

    // checkered start line + grid slots
    const p = this.track.idx(0);
    const yaw = Math.atan2(p.fx, p.fz);
    const checker = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HW * 2, 2.4).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: makeCheckerTexture(20, 3, this.aniso), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    checker.position.set(p.x, p.y + 0.02, p.z);
    checker.rotation.y = yaw;
    checker.receiveShadow = true;
    this.scene.add(checker);
    // slot markings
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x8d8d92, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (let row = 0; row < 3; row++) {
      for (const side of [-1, 1]) {
        const dist = -8 - row * 9;
        const q = this.track.idx(Math.round(dist / 2));
        const lat = side * 2.6;
        const box = new THREE.Group();
        const l1 = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 4.2).rotateX(-Math.PI / 2), slotMat); l1.position.x = -1.5;
        const l2 = l1.clone(); l2.position.x = 1.5;
        const l3 = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 0.14).rotateX(-Math.PI / 2), slotMat); l3.position.z = 2.1;
        box.add(l1, l2, l3);
        box.position.set(q.x + q.rx * lat, q.y + 0.03, q.z + q.rz * lat);
        box.rotation.y = Math.atan2(q.fx, q.fz);
        this.scene.add(box);
      }
    }
  }

  // ---------------------------------------------------------------- walls
  buildWalls() {
    // striped barrier texture (red/white)
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g2 = c.getContext('2d');
    g2.fillStyle = '#e9e6de'; g2.fillRect(0, 0, 128, 64);
    g2.fillStyle = '#cf2b2f'; g2.fillRect(128, 0, 128, 64);
    const grd = g2.createLinearGradient(0, 0, 0, 64);
    grd.addColorStop(0, 'rgba(255,255,255,0.18)'); grd.addColorStop(0.5, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,0.35)');
    g2.fillStyle = grd; g2.fillRect(0, 0, 256, 64);
    const wt = new THREE.CanvasTexture(c);
    wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = THREE.RepeatWrapping; wt.anisotropy = this.aniso;
    const mat = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.75, flatShading: true });
    this.wallMeshes = [];
    for (const side of [-1, 1]) {
      const wd = wallGeometryData(this.track, side);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(wd.positions, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(wd.uvs, 2));
      g.setIndex(wd.indices);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true; m.receiveShadow = true;
      m.material.side = THREE.DoubleSide;
      this.scene.add(m);
      this.wallMeshes.push(m);
    }
  }

  // ---------------------------------------------------------------- jump gap dressing
  buildGap() {
    const { track } = this;
    const concrete = new THREE.MeshStandardMaterial({ color: 0x8f8a84, roughness: 0.9, flatShading: true });
    // hazard stripes texture
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#f5c518'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#16161a';
    for (let x = -64; x < 300; x += 48) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x + 24, 64); g.lineTo(x + 24 + 32, 0); g.lineTo(x + 32, 0); g.fill(); }
    const ht = new THREE.CanvasTexture(c); ht.colorSpace = THREE.SRGBColorSpace; ht.wrapS = ht.wrapT = THREE.RepeatWrapping; ht.repeat.set(3, 1);
    const hazard = new THREE.MeshStandardMaterial({ map: ht, roughness: 0.7 });
    const ends = [
      { i: track.gapStart, dir: 1 }, // lip of the ramp (faces the gap = +tangent)
      { i: track.gapEnd, dir: -1 }, // start of the landing (faces the gap = -tangent)
    ];
    for (const { i, dir } of ends) {
      const p = track.idx(i);
      const yaw = Math.atan2(p.fx, p.fz);
      const grp = new THREE.Group();
      grp.position.set(p.x, p.y, p.z);
      grp.rotation.y = yaw;
      const depth = 1.4, height = 4.0;
      const block = new THREE.Mesh(new THREE.BoxGeometry(EDGE * 2, height, depth), concrete);
      block.position.set(0, -height / 2 - 0.1, -dir * depth / 2);
      block.castShadow = true; block.receiveShadow = true;
      grp.add(block);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(EDGE * 2, 1.0), hazard);
      stripe.position.set(0, -0.55, dir * 0.03);
      if (dir < 0) stripe.rotation.y = Math.PI;
      grp.add(stripe);
      // a deeper pier so the lip doesn't look like it floats
      const pier = new THREE.Mesh(new THREE.BoxGeometry(EDGE * 1.4, 22, 2.4), concrete);
      pier.position.set(0, -height - 10.5, -dir * 1.6);
      pier.castShadow = true;
      grp.add(pier);
      this.scene.add(grp);
    }
    // warning chevrons on the ramp
    const chev = document.createElement('canvas'); chev.width = 256; chev.height = 256;
    const cg = chev.getContext('2d');
    cg.clearRect(0, 0, 256, 256);
    cg.strokeStyle = '#ffd23a'; cg.lineWidth = 34; cg.lineJoin = 'miter';
    cg.beginPath(); cg.moveTo(30, 200); cg.lineTo(128, 90); cg.lineTo(226, 200); cg.stroke();
    const ct = new THREE.CanvasTexture(chev); ct.colorSpace = THREE.SRGBColorSpace;
    const cm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    for (let k = 0; k < 5; k++) {
      const i = track.rampStart + 2 + k * 5;
      const p = track.idx(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5).rotateX(-Math.PI / 2), cm);
      // tilt with the road slope
      const q = track.idx(i + 1);
      const slope = Math.atan2(q.y - p.y, 2);
      m.position.set(p.x, p.y + 0.04, p.z);
      m.rotation.order = 'YXZ';
      m.rotation.y = Math.atan2(p.fx, p.fz);
      m.rotation.x = -slope;
      this.scene.add(m);
    }
    // big warning sign ahead of the ramp
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: makeBannerTexture('JUMP  AHEAD', { w: 1024, h: 250, bg: '#f5c518', fg: '#111', accent: '#111', check: false }) }));
    const sp = track.idx(track.rampStart - 26);
    const sg = new THREE.Group();
    sg.position.set(sp.x, sp.y, sp.z); sg.rotation.y = Math.atan2(sp.fx, sp.fz) + Math.PI;
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.25, 4.6, 0.25), new THREE.MeshStandardMaterial({ color: 0x333 }));
      post.position.set(s * 5.2, 2.3 + 0.5, 0); post.castShadow = true; sg.add(post);
    }
    sign.position.set(0, 4.3, 0);
    sg.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = -0.05; sg.add(back);
    sg.position.set(sp.x + sp.rx * (WALL_OFF + 3.4), sp.y, sp.z + sp.rz * (WALL_OFF + 3.4));
    this.scene.add(sg);
  }

  // ---------------------------------------------------------------- scenery
  buildScenery() {
    const { terrain: T, track } = this;
    const r = rng(2024);
    const mats = {
      tree: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 }),
    };
    // --- tree geometries: tall layered pines, round autumn trees and dead snags
    const trunkC = 0x3a2b24;
    const tier = (rad, h, y, c) => paintGeometry(new THREE.ConeGeometry(rad, h, 7).translate(0, y, 0), c);
    const pine = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.24, 0.38, 2.6, 5).translate(0, 1.3, 0), trunkC),
      tier(2.9, 3.4, 3.2, 0xdddddd), tier(2.4, 3.2, 5.0, 0xe8e8e8), tier(1.9, 3.0, 6.8, 0xf0f0f0), tier(1.4, 2.8, 8.5, 0xf6f6f6), tier(0.9, 2.4, 10.1, 0xffffff),
    ]);
    const fir = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.18, 0.3, 2.0, 5).translate(0, 1.0, 0), trunkC),
      tier(1.9, 5.5, 4.0, 0xe4e4e4), tier(1.4, 5.0, 6.8, 0xf0f0f0), tier(0.85, 4.2, 9.4, 0xffffff),
    ]);
    const round = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.28, 0.44, 3.0, 5).translate(0, 1.5, 0), trunkC),
      paintGeometry(new THREE.IcosahedronGeometry(2.5, 0).scale(1, 0.85, 1).translate(0, 4.5, 0), 0xffffff),
      paintGeometry(new THREE.IcosahedronGeometry(1.7, 0).translate(1.4, 5.9, 0.5), 0xe8e8e8),
      paintGeometry(new THREE.IcosahedronGeometry(1.4, 0).translate(-1.3, 5.4, -0.6), 0xf2f2f2),
    ]);
    const snag = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.1, 0.32, 6.5, 5).translate(0, 3.25, 0), 0x5a4a44),
      paintGeometry(new THREE.CylinderGeometry(0.05, 0.12, 2.6, 4).rotateZ(0.9).translate(0.9, 4.6, 0), 0x5a4a44),
      paintGeometry(new THREE.CylinderGeometry(0.04, 0.1, 2.2, 4).rotateZ(-1.0).translate(-0.8, 3.7, 0.2), 0x5a4a44),
    ]);
    const rock1 = new THREE.IcosahedronGeometry(1, 1);
    {
      const p = rock1.attributes.position; const rr = rng(9);
      const seen = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        if (!seen.has(key)) seen.set(key, 0.72 + rr() * 0.55);
        const k = seen.get(key);
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75, p.getZ(i) * k);
      }
      rock1.computeVertexNormals();
      paintGeometry(rock1, 0xffffff);
    }
    const trees = [], rocks = [];
    const B = { x0: T.x0 + 12, x1: T.x0 + T.sizeX - 12, z0: T.z0 + 12, z1: T.z0 + T.sizeZ - 12 };
    const distAt = (x, z) => {
      const cx = clamp(Math.round((x - T.x0) / CELL), 0, T.nx - 1), cz = clamp(Math.round((z - T.z0) / CELL), 0, T.nz - 1);
      return T.dist[cz * T.nx + cx];
    };
    const slopeAt = (x, z) => Math.hypot(T.heightAt(x + 2, z) - T.heightAt(x - 2, z), T.heightAt(x, z + 2) - T.heightAt(x, z - 2)) / 4;
    const kindFor = (rv) => (rv < 0.5 ? 0 : rv < 0.72 ? 1 : rv < 0.9 ? 2 : 3);
    const pushTree = (x, z, mind = EDGE + 6) => {
      const d = distAt(x, z);
      if (d < mind) return false;
      const y = T.heightAt(x, z);
      if (y > 56 || slopeAt(x, z) > 0.85) return false;
      trees.push({ x, y: y - 0.2, z, s: 0.8 + r() * 1.25, ry: r() * 6.28, kind: kindFor(r()), c: r() });
      return true;
    };
    // (1) dense forest belts hugging both sides of the road, thicker than the rest of the world
    for (let i = 0; i < track.N; i += 1) {
      const p = track.pts[i];
      if (i >= track.gapStart - 3 && i <= track.gapEnd + 3) continue;
      for (const side of [-1, 1]) {
        const n = r() < 0.55 ? 2 : 1;
        for (let k = 0; k < n; k++) {
          const off = track.wallOff(i, side) + 3.5 + Math.pow(r(), 1.6) * 46;
          const j = (r() - 0.5) * 4;
          const x = p.x + p.rx * off * side + p.fx * j, z = p.z + p.rz * off * side + p.fz * j;
          if (fbm(x * 0.03 + 4, z * 0.03 - 8, 2) < 0.28 && r() < 0.6) continue;
          pushTree(x, z, EDGE + 3.6);
        }
      }
    }
    // (2) the interior of the loop and the outer hills: clustered woodland
    for (let k = 0; k < 26000 && trees.length < 9800; k++) {
      const x = lerp(B.x0, B.x1, r()), z = lerp(B.z0, B.z1, r());
      const d = distAt(x, z);
      const density = fbm(x * 0.011 + 7, z * 0.011 - 2, 3);
      const near = 1 - smoothstep(30, 160, d);
      if (r() > smoothstep(0.34, 0.6, density) * (0.45 + 0.55 * near) + 0.05) continue;
      pushTree(x, z, EDGE + 8);
    }
    for (let k = 0; k < 6000 && rocks.length < 700; k++) {
      let x, z;
      if (r() < 0.62) {
        const p = track.idx(Math.floor(r() * track.N));
        const side = r() < 0.5 ? -1 : 1;
        const off = WALL_OFF + 3 + r() * 34;
        x = p.x + p.rx * off * side; z = p.z + p.rz * off * side;
      } else { x = lerp(B.x0, B.x1, r()); z = lerp(B.z0, B.z1, r()); }
      if (distAt(x, z) < EDGE + 5) continue;
      rocks.push({ x, y: T.heightAt(x, z) - 0.2, z, s: 0.7 + Math.pow(r(), 2) * 3.4, ry: r() * 6.28, c: r() });
    }
    this.treeChunks = [];
    const CH = 130;
    const makeChunks = (list, geo, mat, colorFn, shadow) => {
      const groups = new Map();
      for (const it of list) {
        const key = `${Math.floor(it.x / CH)},${Math.floor(it.z / CH)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
      for (const items of groups.values()) {
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pp = new THREE.Vector3(), cc = new THREE.Color();
        items.forEach((it, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry);
          const k = it.s;
          sc.set(k * (0.9 + (it.c * 7 % 1) * 0.3), k * (0.85 + (it.c * 13 % 1) * 0.5), k * (0.9 + (it.c * 3 % 1) * 0.3));
          pp.set(it.x, it.y, it.z);
          m.compose(pp, q, sc);
          mesh.setMatrixAt(i, m);
          mesh.setColorAt(i, colorFn(it, cc));
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.instanceColor.needsUpdate = true;
        mesh.computeBoundingSphere();
        mesh.castShadow = shadow; mesh.receiveShadow = true;
        mesh.userData.total = items.length;
        this.scene.add(mesh);
        this.treeChunks.push(mesh);
      }
    };
    const pineCols = [0x1f3a2a, 0x2a4a2c, 0x1a3330, 0x3c4a26];
    const roundCols = [0xa8571f, 0xc27a2a, 0x7d3a22, 0x60702c, 0x9a4a2a];
    const by = (k) => trees.filter((t) => t.kind === k);
    makeChunks(by(0), pine, mats.tree, (it, c) => c.setHex(pineCols[Math.floor(it.c * 4) % 4]).multiplyScalar(0.8 + it.c * 0.35), true);
    makeChunks(by(1), fir, mats.tree, (it, c) => c.setHex(pineCols[Math.floor(it.c * 4 + 1) % 4]).multiplyScalar(0.7 + it.c * 0.35), true);
    makeChunks(by(2), round, mats.tree, (it, c) => c.setHex(roundCols[Math.floor(it.c * 5) % 5]).multiplyScalar(0.7 + it.c * 0.35), true);
    makeChunks(by(3), snag, mats.tree, (it, c) => c.setHex(0xffffff).multiplyScalar(0.7 + it.c * 0.3), true);
    makeChunks(rocks, rock1, mats.rock, (it, c) => c.setHex(0x5e504a).lerp(new THREE.Color(0x7d6d64), it.c).multiplyScalar(0.8 + it.c * 0.3), true);
    // undergrowth along the road for speed sensation
    const bushGeo = paintGeometry(new THREE.IcosahedronGeometry(0.75, 0).scale(1, 0.7, 1), 0xffffff);
    const bushes = [];
    for (let k = 0; k < 6000 && bushes.length < 1600; k++) {
      const p = track.idx(Math.floor(r() * track.N));
      const side = r() < 0.5 ? -1 : 1;
      const off = track.wallOff(Math.floor(r() * track.N), side) + 1.6 + r() * 12;
      const x = p.x + p.rx * off * side, z = p.z + p.rz * off * side;
      if (distAt(x, z) < EDGE + 1.6) continue;
      bushes.push({ x, y: T.heightAt(x, z) - 0.1, z, s: 0.7 + r() * 1.5, ry: r() * 6, c: r() });
    }
    makeChunks(bushes, bushGeo, mats.tree, (it, c) => c.setHex([0x2f4a24, 0x4a5a26, 0x6a4a22, 0x22402c][Math.floor(it.c * 4) % 4]), false);
    this.buildLamps();
    this.buildDust();
  }

  // ---------------------------------------------------------------- lamp posts, glow and pools of light
  buildLamps() {
    const { track, terrain: T } = this;
    const list = [];
    let i = 12;
    while (i < track.N) {
      if (!(i >= track.gapStart - 8 && i <= track.gapEnd + 8)) {
        for (const side of [-1, 1]) {
          if (side === 1 && (Math.floor(i / 26) % 2)) continue; // stagger the two sides
          const p = track.pts[i];
          const off = track.wallOff(i, side) + 1.3;
          const x = p.x + p.rx * off * side, z = p.z + p.rz * off * side;
          list.push({ x, z, y: Math.max(T.heightAt(x, z), p.y - 0.3), side, p });
        }
      }
      i += 24;
    }
    const poleGeo = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.12, 0.2, 9.2, 6).translate(0, 4.6, 0), 0x2a2d36),
      paintGeometry(new THREE.BoxGeometry(0.16, 0.16, 2.6).translate(0, 9.1, 1.3), 0x2a2d36),
      paintGeometry(new THREE.BoxGeometry(0.5, 0.14, 0.9).translate(0, 9.0, 2.5), 0x1c1e25),
    ]);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5, flatShading: true }), list.length);
    const heads = new THREE.InstancedMesh(new THREE.BoxGeometry(0.44, 0.06, 0.8).translate(0, 8.93, 2.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.38).multiplyScalar(6) }), list.length);
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: makeSoftCircle(128, 0, '255,170,80'), transparent: true, opacity: 0.36, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5, fog: true,
    }), list.length);
    pools.renderOrder = 3;
    const glowPos = new Float32Array(list.length * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), pp = new THREE.Vector3();
    list.forEach((l, k) => {
      // arm reaches over the road: rotate so +z points at the road centre
      const yaw = Math.atan2(-l.p.rx * l.side, -l.p.rz * l.side);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      m.compose(pp.set(l.x, l.y, l.z), q, one);
      poles.setMatrixAt(k, m); heads.setMatrixAt(k, m);
      const hx = l.x + Math.sin(yaw) * 2.5, hz = l.z + Math.cos(yaw) * 2.5;
      glowPos.set([hx, l.y + 8.9, hz], k * 3);
      const py = Math.max(l.p.y, T.heightAt(hx, hz)) + 0.06;
      m.compose(pp.set(hx, py, hz), new THREE.Quaternion(), new THREE.Vector3(30, 1, 30));
      pools.setMatrixAt(k, m);
    });
    for (const o of [poles, heads, pools]) { o.instanceMatrix.needsUpdate = true; o.frustumCulled = false; this.scene.add(o); }
    poles.castShadow = true;
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
    const glow = new THREE.Points(gg, new THREE.PointsMaterial({ map: makeSoftCircle(64, 0, '255,176,96'), color: 0xffffff, size: 6.5, sizeAttenuation: true, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.frustumCulled = false; glow.renderOrder = 8;
    this.scene.add(glow);
    this.lampObjects = [pools, glow];
  }

  // ---------------------------------------------------------------- drifting dust / embers around the camera
  buildDust() {
    const N = 420, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    const rr = rng(4);
    for (let i = 0; i < N; i++) { pos.set([(rr() - 0.5) * 90, rr() * 24, (rr() - 0.5) * 90], i * 3); seed[i] = rr(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uScale: { value: 500 }, uMap: { value: makeSoftCircle(32, 0, '255,190,120') } },
      vertexShader: `attribute float aSeed; uniform vec3 uCam; uniform float uTime, uScale; varying float vA;
        void main(){ vec3 p = position; p.x += sin(uTime * 0.3 + aSeed * 40.0) * 2.0; p.y += sin(uTime * 0.2 + aSeed * 17.0) * 1.5; p.z += uTime * (0.4 + aSeed) * 1.2;
          vec3 w = mod(p - uCam + vec3(45.0, 0.0, 45.0), vec3(90.0, 40.0, 90.0)) - vec3(45.0, 0.0, 45.0) + uCam;
          w.y = uCam.y - 4.0 + mod(p.y + uTime * 0.15 * aSeed, 26.0);
          vec4 mv = viewMatrix * vec4(w, 1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp((0.09 + aSeed * 0.14) * uScale / max(-mv.z, 0.5), 1.0, 9.0);
          vA = smoothstep(60.0, 8.0, -mv.z) * (0.4 + 0.6 * aSeed); }`,
      fragmentShader: `uniform sampler2D uMap; varying float vA; void main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(1.0, 0.72, 0.4, 1.0) * t.a * vA * 0.9; }`,
    });
    this.dust = new THREE.Points(g, mat);
    this.dust.frustumCulled = false; this.dust.renderOrder = 9;
    this.scene.add(this.dust);
  }

  // ---------------------------------------------------------------- distant mountains
  buildMountains() {
    const r = rng(77);
    const b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const geos = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a3c5a, flatShading: true, roughness: 1 });
    const count = 34;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.15;
      const rad = 1050 + r() * 500;
      const h = 130 + r() * 260, w = 190 + r() * 260;
      const g = new THREE.ConeGeometry(w, h, 6 + Math.floor(r() * 3), 1).translate(0, h / 2, 0);
      g.rotateY(r() * 6);
      g.translate(cx + Math.cos(a) * rad * 1.15, -25, cz + Math.sin(a) * rad * 0.9);
      geos.push(g);
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.receiveShadow = false;
    this.scene.add(mesh);
    this.mountains = mesh;
  }

  // ---------------------------------------------------------------- start gantry
  buildGantry() {
    const track = this.track;
    const p = track.idx(0);
    const g = new THREE.Group();
    g.position.set(p.x, p.y, p.z);
    g.rotation.y = Math.atan2(p.fx, p.fz);
    const steel = new THREE.MeshStandardMaterial({ color: 0x6b7385, roughness: 0.55, metalness: 0.25, flatShading: true });
    const accent = new THREE.MeshStandardMaterial({ color: 0xd3262a, roughness: 0.5, flatShading: true });
    const span = WALL_OFF + 1.6;
    for (const s of [-1, 1]) {
      const pylon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 9.5, 1.6), steel);
      pylon.position.set(s * span, 4.75, 0); pylon.castShadow = true; g.add(pylon);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.7, 2.4), accent);
      foot.position.set(s * span, 0.35, 0); g.add(foot);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 1.1, 1.6, 1.3), steel);
    beam.position.set(0, 9.1, 0); beam.castShadow = true; g.add(beam);
    const banner = new THREE.MeshBasicMaterial({ map: makeBannerTexture('DRIFT KING', { w: 1024, h: 128 }) });
    for (const dz of [-0.68, 0.68]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(span * 2 - 1.5, 1.35), banner);
      b.position.set(0, 9.1, dz); if (dz > 0) b.rotation.y = 0; else b.rotation.y = Math.PI;
      g.add(b);
    }
    // start lights: 3 lamps on each face
    this.lightMats = [[], [], []];
    const lampGeo = new THREE.CircleGeometry(0.5, 16);
    const housing = new THREE.BoxGeometry(1.25, 1.25, 0.25);
    for (const dz of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * 2.4;
        const h = new THREE.Mesh(housing, steel); h.position.set(x, 7.6, dz * 0.75); g.add(h);
        const mat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x000000, emissiveIntensity: 0, roughness: 0.3 });
        const lamp = new THREE.Mesh(lampGeo, mat);
        lamp.position.set(x, 7.6, dz * 0.88);
        if (dz < 0) lamp.rotation.y = Math.PI;
        g.add(lamp);
        this.lightMats[i].push(mat);
      }
    }
    this.scene.add(g);
    this.gantry = g;
    this.setStartLights(0, false);
    this.gantryPos = { x: p.x, y: p.y, z: p.z, span, yaw: g.rotation.y };
  }

  // n lamps red (0..3); green turns everything green
  setStartLights(n, green) {
    for (let i = 0; i < 3; i++) {
      for (const m of this.lightMats[i]) {
        if (green) { m.color.setHex(0x002a08); m.emissive.setHex(0x18e040); m.emissiveIntensity = 2.4; }
        else if (i < n) { m.color.setHex(0x330000); m.emissive.setHex(0xff0500); m.emissiveIntensity = 3.2; }
        else { m.color.setHex(0x160404); m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      }
    }
  }

  // ---------------------------------------------------------------- quality + per-frame
  applyQuality(q) {
    this.quality = q;
    const shadows = q.shadows;
    this.renderer.shadowMap.enabled = shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sun.castShadow = shadows;
    if (shadows) {
      const S = q.shadowRange;
      const cam = this.sun.shadow.camera;
      cam.left = -S; cam.right = S; cam.top = S; cam.bottom = -S; cam.near = 1; cam.far = 500;
      cam.updateProjectionMatrix();
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    for (const c of this.chunks) c.castShadow = shadows && q.terrainShadows;
    for (const t of this.treeChunks) {
      t.count = Math.max(1, Math.floor(t.userData.total * q.vegetation));
      t.castShadow = shadows && !t.userData.noShadow;
    }
    this.sky.material.uniforms.uClouds.value = q.clouds ? 1 : 0;
    // scene materials need recompiling when shadows toggle
    this.scene.traverse((o) => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => (m.needsUpdate = true)); } });
  }

  update(dt, focus, time) {
    // sky follows the camera
    this.sky.position.copy(focus.cameraPos);
    this.sky.material.uniforms.uTime.value = time;
    if (this.dust) { const u = this.dust.material.uniforms; u.uCam.value.copy(focus.cameraPos); u.uTime.value = time; u.uScale.value = (focus.viewH || 720) * 0.9; this.dust.visible = this.quality.particles > 0.6; }
    if (this.lampObjects) for (const o of this.lampObjects) o.visible = true;
    // sun shadow camera follows the target, snapped to texel size to avoid shimmering
    if (this.quality.shadows) {
      const S = this.quality.shadowRange, texel = (2 * S) / this.quality.shadowMap;
      const t = focus.target;
      const snap = (v) => Math.round(v / texel) * texel;
      const tx = snap(t.x), ty = snap(t.y), tz = snap(t.z);
      this.sun.target.position.set(tx, ty, tz);
      this.sun.position.set(tx + SUN_DIR.x * 250, ty + SUN_DIR.y * 250, tz + SUN_DIR.z * 250);
    } else {
      this.sun.position.set(SUN_DIR.x * 250, SUN_DIR.y * 250, SUN_DIR.z * 250).add(focus.target);
      this.sun.target.position.copy(focus.target);
    }
    this.sun.target.updateMatrixWorld();
  }
}
