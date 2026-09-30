// Physics props: cones, barrels and fence panels. Instanced meshes driven by dynamic rigid bodies.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EDGE, ROAD_HW, WALL_OFF } from './track.js';
import { G, grp } from './vehicle.js';
import { rng } from './util.js';

function paint(geo, color) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), cc = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = cc.r; c[i * 3 + 1] = cc.g; c[i * 3 + 2] = cc.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
const strip = (g) => { g.deleteAttribute('uv'); return g.index ? g.toNonIndexed() : g; };

const KINDS = {
  cone: {
    geo: () => mergeGeometries([
      paint(strip(new THREE.BoxGeometry(0.5, 0.05, 0.5).translate(0, 0.025, 0)), 0xff7a1c),
      paint(strip(new THREE.ConeGeometry(0.2, 0.72, 8).translate(0, 0.41, 0)), 0xff6a14),
      paint(strip(new THREE.CylinderGeometry(0.135, 0.165, 0.16, 8).translate(0, 0.33, 0)), 0xf7f5ee),
    ]),
    cy: 0.38, mass: 2.6,
    shape: (R) => R.ColliderDesc.cylinder(0.36, 0.21),
  },
  barrel: {
    geo: () => mergeGeometries([
      paint(strip(new THREE.CylinderGeometry(0.33, 0.33, 0.95, 10).translate(0, 0.475, 0)), 0xffffff),
      paint(strip(new THREE.CylinderGeometry(0.345, 0.345, 0.07, 10).translate(0, 0.25, 0)), 0x303038),
      paint(strip(new THREE.CylinderGeometry(0.345, 0.345, 0.07, 10).translate(0, 0.7, 0)), 0x303038),
    ]),
    cy: 0.475, mass: 22,
    shape: (R) => R.ColliderDesc.cylinder(0.475, 0.335),
  },
  fence: {
    geo: () => mergeGeometries([
      paint(strip(new THREE.BoxGeometry(0.11, 1.05, 0.11).translate(-1.18, 0.525, 0)), 0x3a3a42),
      paint(strip(new THREE.BoxGeometry(0.11, 1.05, 0.11).translate(1.18, 0.525, 0)), 0x3a3a42),
      paint(strip(new THREE.BoxGeometry(2.5, 0.17, 0.05).translate(0, 0.9, 0.04)), 0xf1efe8),
      paint(strip(new THREE.BoxGeometry(2.5, 0.17, 0.05).translate(0, 0.62, 0.04)), 0xd3262a),
      paint(strip(new THREE.BoxGeometry(2.5, 0.17, 0.05).translate(0, 0.34, 0.04)), 0xf1efe8),
    ]),
    cy: 0.525, mass: 9,
    shape: (R) => R.ColliderDesc.cuboid(1.25, 0.52, 0.07),
  },
};

export class Props {
  constructor(scene, RAPIER, world, track, terrain) {
    this.scene = scene; this.R = RAPIER; this.world = world; this.track = track; this.terrain = terrain;
    this.sets = {};
    this.kinds = {};
    this.count = 0;
    this.handleMap = new Map(); // collider handle -> {kind, index}
    this.spawn();
  }

  spawn() {
    const { track, terrain: T } = this;
    const N = track.N, pts = track.pts;
    const list = { cone: [], barrel: [], fence: [] };
    const at = (i, lat, extraY = 0) => {
      const p = pts[((i % N) + N) % N];
      const x = p.x + p.rx * lat, z = p.z + p.rz * lat;
      // on the road surface use the road height, in the run-off use the terrain
      const y = Math.abs(lat) <= EDGE + 0.3 ? p.y : T.heightAt(x, z);
      return { x, z, y: y + extraY, yaw: Math.atan2(p.fx, p.fz), p };
    };
    // --- cones on the inside kerb of every corner + a few funnel lines
    let i = 0;
    while (i < N) {
      if (Math.abs(pts[i].k) > 0.013) {
        let j = i, ks = 0;
        while (j < N && Math.abs(pts[j].k) > 0.013) { ks += pts[j].k; j++; }
        if (j - i > 8) {
          const side = ks > 0 ? 1 : -1;
          const a = i + Math.floor((j - i) * 0.12), b = j - Math.floor((j - i) * 0.12);
          for (let m = a; m <= b; m += 3) list.cone.push(at(m, side * (ROAD_HW + 0.55)));
        }
        i = j;
      } else i++;
    }
    for (const side of [-1, 1]) for (let m = track.rampStart - 16; m < track.rampStart + 2; m += 4) list.cone.push(at(m, side * (ROAD_HW + 0.5)));
    // cone chicane after the start
    for (let k = 0; k < 4; k++) {
      const side = k % 2 ? 1 : -1;
      list.cone.push(at(70 + k * 26, side * 3.6), at(71 + k * 26, side * 4.4));
    }
    // --- barrel stacks against the walls
    const stack = (idx, side) => {
      const lat = side * (track.wallOff(idx, side) - 0.55 - 0.36 - 0.02);
      const rows = [3, 2, 1];
      rows.forEach((cnt, r) => {
        for (let c = 0; c < cnt; c++) {
          const o = (c - (cnt - 1) / 2) * 0.78;
          const q = at(idx, lat);
          const p = q.p;
          list.barrel.push({ x: q.x + p.fx * o, z: q.z + p.fz * o, y: q.y + r * 0.95, yaw: q.yaw, p });
        }
      });
    };
    const findApex = (from, to) => { let best = from, bk = 0; for (let m = from; m < to; m++) if (Math.abs(pts[m % N].k) > bk) { bk = Math.abs(pts[m % N].k); best = m; } return best; };
    // outside of the hairpin and the big corners, both sides of the landing, before the gantry
    let seen = 0;
    i = 0;
    while (i < N) {
      if (Math.abs(pts[i].k) > 0.02) {
        let j = i, ks = 0;
        while (j < N && Math.abs(pts[j].k) > 0.02) { ks += pts[j].k; j++; }
        if (j - i > 8) {
          const ap = findApex(i, j);
          const side = ks > 0 ? -1 : 1; // outside
          stack(ap, side); stack(ap + 6, side);
          seen++;
        }
        i = j;
      } else i++;
    }
    stack(track.landEnd - 10, -1); stack(track.landEnd - 10, 1);
    stack(track.gapEnd + 12, 1);
    stack(N - 36, 1); stack(N - 36, -1);
    // --- fence panels in the run-off zones
    for (const side of [-1, 1]) {
      const f = track.fence[side < 0 ? 0 : 1];
      let acc = 0;
      for (let m = 0; m < N; m++) {
        if (f[m] < 0.92) { acc = 0; continue; }
        acc += 2;
        if (acc >= 2.6) {
          acc -= 2.6;
          const lat = side * (track.wallOff(m, side) - 2.3);
          const q = at(m, lat);
          list.fence.push({ ...q });
        }
      }
    }

    // --- build meshes + bodies
    const R = this.R;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true });
    const barrelCols = [0xd23b2d, 0x2d78d2, 0xf0b81f, 0xe9e6de, 0x2cae5c];
    for (const [kind, items] of Object.entries(list)) {
      const K = KINDS[kind];
      const geo = K.geo();
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = true; mesh.receiveShadow = true;
      const set = { mesh, items: [], K };
      const rr = rng(kind.length * 31);
      items.forEach((it, idx) => {
        const y = it.y + K.cy + 0.005;
        const body = this.world.createRigidBody(
          R.RigidBodyDesc.dynamic().setTranslation(it.x, y, it.z)
            .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw + (kind === 'cone' || kind === 'barrel' ? rr() * 6 : 0)))
            .setLinearDamping(0.25).setAngularDamping(0.35).setCcdEnabled(false).setCanSleep(true));
        const cd = K.shape(R).setMass(K.mass).setFriction(0.7).setRestitution(0.25).setCollisionGroups(grp(G.PROP, 0xffff));
        const col = this.world.createCollider(cd, body);
        body.sleep();
        const r0 = body.rotation();
        const rec = { body, col, awake: false, moved: false, active: true, home: { x: it.x, y, z: it.z }, homeRot: { x: r0.x, y: r0.y, z: r0.z, w: r0.w } };
        set.items.push(rec);
        this.handleMap.set(col.handle, { kind, index: idx });
        mesh.setColorAt(idx, new THREE.Color(kind === 'barrel' ? barrelCols[(idx * 7 + Math.floor(rr() * 5)) % 5] : 0xffffff));
      });
      mesh.instanceColor && (mesh.instanceColor.needsUpdate = true);
      mesh.count = items.length;
      this.scene.add(mesh);
      this.sets[kind] = set;
      this.count += items.length;
    }
    this.tmpM = new THREE.Matrix4(); this.tmpQ = new THREE.Quaternion(); this.tmpP = new THREE.Vector3(); this.tmpS = new THREE.Vector3(1, 1, 1);
    this.syncVisuals(true);
  }

  // Only props near a car take part in the simulation; far, sleeping ones are switched off.
  updateActivation(carPositions, force = false) {
    const ON = 95 * 95, OFF = 140 * 140;
    for (const set of Object.values(this.sets)) {
      for (const it of set.items) {
        let d2 = 1e12;
        const h = it.home;
        for (const p of carPositions) { const dx = p.x - h.x, dz = p.z - h.z; const d = dx * dx + dz * dz; if (d < d2) d2 = d; }
        if (!it.active) {
          if (d2 < ON) { it.col.setEnabled(true); if (!it.moved) it.body.sleep(); it.active = true; }
        } else if (!it.moved && d2 > OFF) {
          it.col.setEnabled(false); it.body.sleep(); it.active = false; // untouched and far away
        }
      }
    }
  }

  // Put every prop back where it started (used on race restart).
  resetAll() {
    const q0 = new THREE.Quaternion();
    for (const set of Object.values(this.sets)) {
      for (const it of set.items) {
        if (!it.moved && it.body.isSleeping()) continue;
        it.body.setTranslation(it.home, false);
        it.body.setRotation(it.homeRot, false);
        it.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        it.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        it.body.sleep();
        it.moved = false; it.awake = true;
      }
    }
    this.syncVisuals(true);
  }

  // Copy transforms of moving bodies to the instance buffers.
  syncVisuals(force = false) {
    const m = this.tmpM, q = this.tmpQ, p = this.tmpP, s = this.tmpS;
    for (const set of Object.values(this.sets)) {
      let dirty = force;
      const cy = set.K.cy;
      set.items.forEach((it, i) => {
        if (!force && !it.active) return;
        const sleeping = it.body.isSleeping();
        if (force || !sleeping || it.awake) {
          const t = it.body.translation(), r = it.body.rotation();
          q.set(r.x, r.y, r.z, r.w);
          // local offset: mesh origin is at the base, body origin at the centre
          p.set(0, -cy, 0).applyQuaternion(q).add(t);
          m.compose(p, q, s);
          set.mesh.setMatrixAt(i, m);
          dirty = true;
        }
        if (!sleeping) it.moved = true;
        it.awake = !sleeping;
      });
      if (dirty) set.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
