// Visual world: terrain, road, barriers, scenery, gantry, lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EDGE, ROAD_HW, WALL_OFF, CELL, RAMP_LEN } from './track.js';
import { roadGeometryData, wallGeometryData, WALL_H } from './trackphysics.js';
import { makeSky, makeEnvironment, SUN_DIR, FOG_COLOR } from './sky.js';
import { makeRoadTexture, makeTerrainDetail, makeCheckerTexture, makeBannerTexture } from './textures.js';
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
    scene.fog = new THREE.FogExp2(FOG_COLOR, 0.00135);

    // lights
    this.hemi = new THREE.HemisphereLight(0xa9bff2, 0x9a7458, 1.7);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffb469, 3.6);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);
    // cool fill from the opposite side so shaded slopes keep colour
    this.fill = new THREE.DirectionalLight(0x9db4ff, 0.85);
    this.fill.position.set(-SUN_DIR.x * 100, 60, -SUN_DIR.z * 100);
    scene.add(this.fill);

    this.sky = makeSky(this.quality.clouds);
    scene.add(this.sky);
    scene.environment = makeEnvironment(this.renderer);
    scene.environmentIntensity = 0.55;

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
    const palGrassA = col(0x6f8f34), palGrassB = col(0xb5a24a), palGrassC = col(0x4f7a3a), palRock = col(0x7d6a5d), palRock2 = col(0x9c8574);
    const palGravel = col(0xc0a37a), palPit = col(0x6b4636), palPeak = col(0xb59a86);
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
    const mat = new THREE.MeshStandardMaterial({ map: makeRoadTexture(this.aniso), roughness: 0.88, metalness: 0.0 });
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
    const slotMat = new THREE.MeshBasicMaterial({ color: 0xf0f0e8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
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
      rock: new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }),
    };
    // --- tree geometries
    const trunkC = 0x5a4030;
    const pine = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.22, 0.34, 2.2, 5).translate(0, 1.1, 0), trunkC),
      paintGeometry(new THREE.ConeGeometry(2.5, 3.6, 7).translate(0, 3.6, 0), 0xffffff),
      paintGeometry(new THREE.ConeGeometry(1.95, 3.2, 7).translate(0, 5.5, 0), 0xf2f2f2),
      paintGeometry(new THREE.ConeGeometry(1.35, 2.8, 7).translate(0, 7.2, 0), 0xe6e6e6),
    ]);
    const round = mergeGeometries([
      paintGeometry(new THREE.CylinderGeometry(0.26, 0.4, 2.8, 5).translate(0, 1.4, 0), trunkC),
      paintGeometry(new THREE.IcosahedronGeometry(2.3, 0).scale(1, 0.85, 1).translate(0, 4.2, 0), 0xffffff),
      paintGeometry(new THREE.IcosahedronGeometry(1.5, 0).translate(1.2, 5.5, 0.4), 0xf0f0f0),
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
    // candidates
    const trees = [], rocks = [];
    const B = { x0: T.x0 + 12, x1: T.x0 + T.sizeX - 12, z0: T.z0 + 12, z1: T.z0 + T.sizeZ - 12 };
    const distAt = (x, z) => {
      const cx = clamp(Math.round((x - T.x0) / CELL), 0, T.nx - 1), cz = clamp(Math.round((z - T.z0) / CELL), 0, T.nz - 1);
      return T.dist[cz * T.nx + cx];
    };
    for (let k = 0; k < 9000 && trees.length < 3200; k++) {
      const x = lerp(B.x0, B.x1, r()), z = lerp(B.z0, B.z1, r());
      const d = distAt(x, z);
      if (d < EDGE + 9) continue;
      const density = fbm(x * 0.011 + 7, z * 0.011 - 2, 3);
      const near = 1 - smoothstep(30, 120, d);
      if (r() > smoothstep(0.38, 0.62, density) * (0.35 + 0.65 * near) + 0.03) continue;
      const y = T.heightAt(x, z);
      const hx = T.heightAt(x + 2, z) - T.heightAt(x - 2, z), hz = T.heightAt(x, z + 2) - T.heightAt(x, z - 2);
      if (Math.hypot(hx, hz) / 4 > 0.75) continue;
      if (y > 52) continue;
      trees.push({ x, y: y - 0.15, z, s: 0.75 + r() * 1.1, ry: r() * 6.28, kind: r() < 0.62 ? 0 : 1, c: r() });
    }
    for (let k = 0; k < 4000 && rocks.length < 520; k++) {
      // most rocks hug the road sides, a few on the hills
      let x, z;
      if (r() < 0.6) {
        const p = track.idx(Math.floor(r() * track.N));
        const side = r() < 0.5 ? -1 : 1;
        const off = WALL_OFF + 3 + r() * 30;
        x = p.x + p.rx * off * side; z = p.z + p.rz * off * side;
      } else { x = lerp(B.x0, B.x1, r()); z = lerp(B.z0, B.z1, r()); }
      const d = distAt(x, z);
      if (d < EDGE + 5) continue;
      rocks.push({ x, y: T.heightAt(x, z) - 0.2, z, s: 0.7 + Math.pow(r(), 2) * 3.2, ry: r() * 6.28, c: r() });
    }
    this.treeChunks = [];
    const CH = 150;
    const makeChunks = (list, geoFn, mat, colorFn, shadow) => {
      const groups = new Map();
      for (const it of list) {
        const key = `${Math.floor(it.x / CH)},${Math.floor(it.z / CH)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
      for (const items of groups.values()) {
        const geo = geoFn(items);
        const mesh = new THREE.InstancedMesh(geo, mat, items.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
        items.forEach((it, i) => {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry);
          const sc = it.s;
          s.set(sc * (0.9 + (it.c * 7 % 1) * 0.3), sc * (0.85 + (it.c * 13 % 1) * 0.45), sc * (0.9 + (it.c * 3 % 1) * 0.3));
          p.set(it.x, it.y, it.z);
          m.compose(p, q, s);
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
    const pineCols = [0x3f6d2f, 0x557a2e, 0x2f5b3a, 0x6b7f2c];
    const roundCols = [0xd9822b, 0xe3a63a, 0xb5532a, 0x8fa136, 0xd66a36];
    makeChunks(trees.filter((t) => t.kind === 0), () => pine, mats.tree, (it, c) => c.setHex(pineCols[Math.floor(it.c * 4) % 4]).multiplyScalar(0.85 + it.c * 0.3), true);
    // (pine geometry carries a white foliage colour which the instance colour tints; trunk brown is baked)
    makeChunks(trees.filter((t) => t.kind === 1), () => round, mats.tree, (it, c) => c.setHex(roundCols[Math.floor(it.c * 5) % 5]).multiplyScalar(0.85 + it.c * 0.3), true);
    makeChunks(rocks, () => rock1, mats.rock, (it, c) => c.setHex(0x8b7867).lerp(new THREE.Color(0xa08f7d), it.c).multiplyScalar(0.8 + it.c * 0.3), true);
    // some grass tufts / bushes near the road for speed sensation: small green icospheres
    const bushGeo = paintGeometry(new THREE.IcosahedronGeometry(0.7, 0).scale(1, 0.7, 1), 0xffffff);
    const bushes = [];
    for (let k = 0; k < 2500 && bushes.length < 700; k++) {
      const p = track.idx(Math.floor(r() * track.N));
      const side = r() < 0.5 ? -1 : 1;
      const off = WALL_OFF + 2.2 + r() * 9;
      const x = p.x + p.rx * off * side, z = p.z + p.rz * off * side;
      if (distAt(x, z) < EDGE + 1.6) continue;
      bushes.push({ x, y: T.heightAt(x, z) - 0.1, z, s: 0.7 + r() * 1.3, ry: r() * 6, c: r() });
    }
    makeChunks(bushes, () => bushGeo, mats.tree, (it, c) => c.setHex([0x6a8a30, 0x8ba03a, 0xc4913a, 0x557a35][Math.floor(it.c * 4) % 4]), false);
  }

  // ---------------------------------------------------------------- distant mountains
  buildMountains() {
    const r = rng(77);
    const b = this.track.bounds;
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const geos = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0x8b6f8f, flatShading: true, roughness: 1 });
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
