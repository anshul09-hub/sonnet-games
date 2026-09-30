// Thin wrapper around Rapier (@dimforge/rapier3d-compat): bodies bound to three.js meshes, convex hulls, collision events.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

let _init = null;
export function initPhysics() { return (_init ||= RAPIER.init().then(() => RAPIER)); }
export { RAPIER };

/** collision group helper: membership bits (which groups I am in) and filter bits (which groups I hit) */
export const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const G = { STATIC: 1, PIECE: 2, PLAYER: 4, BULLET: 8, CRATE: 16, DEBRIS: 32, ALL: 0xffff };

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export class Physics {
  constructor({ gravity = 22, step = 1 / 60, events = false } = {}) {
    this.world = new RAPIER.World({ x: 0, y: -gravity, z: 0 });
    this.world.timestep = step; this.step_ = step; this.acc = 0;
    this.items = new Set();
    this.byCollider = new Map();
    this.events = events ? new RAPIER.EventQueue(true) : null;
    this.onContact = null;
    this.timeScale = 1;
  }

  /** Create a body (+collider) and optionally bind a mesh. Returns an item {body, collider(s), mesh}. */
  add(mesh, o = {}) {
    const R = RAPIER;
    const type = o.type || 'dynamic';
    let desc = type === 'fixed' ? R.RigidBodyDesc.fixed() : type === 'kinematic' ? R.RigidBodyDesc.kinematicPositionBased() : R.RigidBodyDesc.dynamic();
    const p = o.pos || (mesh ? mesh.position : { x: 0, y: 0, z: 0 });
    const q = o.quat || (mesh ? mesh.quaternion : { x: 0, y: 0, z: 0, w: 1 });
    desc.setTranslation(vx(p, 0), vx(p, 1), vx(p, 2)).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    if (o.vel) desc.setLinvel(o.vel.x, o.vel.y, o.vel.z);
    if (o.angVel) desc.setAngvel(o.angVel);
    if (o.linDamp != null) desc.setLinearDamping(o.linDamp);
    if (o.angDamp != null) desc.setAngularDamping(o.angDamp);
    if (o.ccd) desc.setCcdEnabled(true);
    if (o.gravityScale != null) desc.setGravityScale(o.gravityScale);
    const body = this.world.createRigidBody(desc);
    if (o.lockRot) body.setEnabledRotations(false, false, false, true);
    if (o.lockY) body.setEnabledTranslations(true, false, true, true);
    const item = { body, mesh, colliders: [], userData: o.userData || {}, hull: null };
    const shape = o.shape || 'box';
    if (shape === 'compound') { this._compound(item, mesh, o); }
    else { const cd = this._shape(shape, o, mesh); if (cd) this._collider(item, cd, o); }
    this.items.add(item);
    return item;
  }

  _shape(shape, o, mesh) {
    const R = RAPIER, s = o.size || [0.5, 0.5, 0.5];
    if (shape === 'box') return R.ColliderDesc.cuboid(s[0], s[1], s[2]);
    if (shape === 'ball') return R.ColliderDesc.ball(s[0]);
    if (shape === 'capsule') return R.ColliderDesc.capsule(s[0], s[1]);
    if (shape === 'cyl') return R.ColliderDesc.cylinder(s[0], s[1]);
    if (shape === 'hull') return this.hullDesc(mesh, o) || R.ColliderDesc.cuboid(s[0], s[1], s[2]);
    return null;
  }

  _collider(item, cd, o) {
    if (o.restitution != null) cd.setRestitution(o.restitution);
    if (o.friction != null) cd.setFriction(o.friction);
    if (o.density != null) cd.setDensity(o.density);
    if (o.groups != null) cd.setCollisionGroups(o.groups);
    if (o.sensor) cd.setSensor(true);
    if (this.events) cd.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    const c = this.world.createCollider(cd, item.body);
    item.colliders.push(c);
    this.byCollider.set(c.handle, item);
    return c;
  }

  /** Convex hull from a mesh's vertices in its own local space (with its scale applied). */
  hullDesc(mesh, o = {}) {
    const pts = meshPoints(mesh, null, o.maxPoints || 160);
    if (!pts || pts.length < 12) return null;
    return RAPIER.ColliderDesc.convexHull(pts);
  }

  /** One body, one convex hull per child mesh (positions expressed relative to the root's transform). */
  _compound(item, root, o) {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    let n = 0;
    root.traverse((c) => {
      if (!c.isMesh || c.userData.outline) return;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, c.matrixWorld);
      const pts = meshPoints(c, rel, o.maxPoints || 96);
      if (!pts || pts.length < 12) return;
      let cd = RAPIER.ColliderDesc.convexHull(pts);
      if (!cd) { const bb = new THREE.Box3().setFromBufferAttribute(c.geometry.attributes.position); const sz = bb.getSize(new THREE.Vector3()).multiply(c.getWorldScale(new THREE.Vector3())); const ce = bb.getCenter(new THREE.Vector3()).applyMatrix4(rel); cd = RAPIER.ColliderDesc.cuboid(Math.max(sz.x / 2, 0.02), Math.max(sz.y / 2, 0.02), Math.max(sz.z / 2, 0.02)).setTranslation(ce.x, ce.y, ce.z); }
      this._collider(item, cd, o); n++;
    });
    if (!n) { const cd = RAPIER.ColliderDesc.cuboid(0.15, 0.15, 0.15); this._collider(item, cd, o); }
  }

  remove(item) {
    if (!this.items.has(item)) return;
    for (const c of item.colliders) this.byCollider.delete(c.handle);
    this.world.removeRigidBody(item.body);
    this.items.delete(item);
  }

  /** Static ground / wall boxes. */
  fixedBox(cx, cy, cz, hx, hy, hz, o = {}) { return this.add(null, { ...o, type: 'fixed', shape: 'box', size: [hx, hy, hz], pos: { x: cx, y: cy, z: cz } }); }

  update(dt) {
    dt = Math.min(dt, 0.1) * this.timeScale;
    this.acc += dt;
    let n = 0;
    while (this.acc >= this.step_ && n < 6) {
      this.world.step(this.events || undefined);
      this.acc -= this.step_; n++;
      if (this.events && this.onContact) {
        this.events.drainCollisionEvents((h1, h2, started) => {
          if (!started) return;
          this.onContact(this.byCollider.get(h1), this.byCollider.get(h2), h1, h2);
        });
      }
    }
    if (n === 6) this.acc = 0;
    this.sync();
  }

  sync() {
    for (const it of this.items) {
      if (!it.mesh || it.body.bodyType() === RAPIER.RigidBodyType.Fixed) continue;
      const t = it.body.translation(), r = it.body.rotation();
      it.mesh.position.set(t.x, t.y, t.z);
      it.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  ray(ox, oy, oz, dx, dy, dz, maxToi = 100, groups) {
    const ray = new RAPIER.Ray({ x: ox, y: oy, z: oz }, { x: dx, y: dy, z: dz });
    const hit = this.world.castRay(ray, maxToi, true, undefined, groups);
    if (!hit) return null;
    return { toi: hit.timeOfImpact ?? hit.toi, item: this.byCollider.get(hit.collider.handle), collider: hit.collider };
  }

  dispose() { try { this.world.free(); } catch { /* */ } this.items.clear(); this.byCollider.clear(); }
}

const vx = (v, i) => (i === 0 ? v.x : i === 1 ? v.y : v.z);

/** Sample up to `max` vertices (deduplicated) of a mesh, optionally transformed by `matrix` (else mesh scale only). */
export function meshPoints(mesh, matrix, max = 120) {
  const pos = mesh.geometry && mesh.geometry.attributes.position;
  if (!pos) return null;
  const local = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion(), _s.copy(mesh.scale));
  const use = matrix ? matrix : local;
  const seen = new Map();
  const step = Math.max(1, Math.floor(pos.count / (max * 3)));
  const out = [];
  for (let i = 0; i < pos.count; i += step) {
    _v.fromBufferAttribute(pos, i).applyMatrix4(use);
    const k = Math.round(_v.x * 200) + ',' + Math.round(_v.y * 200) + ',' + Math.round(_v.z * 200);
    if (seen.has(k)) continue; seen.set(k, 1);
    out.push(_v.x, _v.y, _v.z);
  }
  // thin out when we still have too many
  if (out.length / 3 > max) { const f = Math.ceil(out.length / 3 / max); const o2 = []; for (let i = 0; i < out.length / 3; i += f) o2.push(out[i * 3], out[i * 3 + 1], out[i * 3 + 2]); return new Float32Array(o2); }
  return new Float32Array(out);
}
