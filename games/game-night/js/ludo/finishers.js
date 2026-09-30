// The nine capture finishers (3 per theme). Each is an async choreography built on Stage helpers:
// anime: katana slice & kick, shuriken storm, spirit fist. gamer: hammer smash, rocket strike, K.O. uppercut.
// tech: laser voxelizer, orbital strike, glitch shatter.
import * as THREE from 'three';
import { voxelize, shatter } from '../core/slicer.js';
import { RAPIER, G as PG } from '../core/physics.js';
import { SPRITE } from '../core/fx.js';
import { audio } from '../audio/audio.js';
import { ease, lerp, clamp } from '../core/util.js';

const V3 = THREE.Vector3;
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.35, metalness: o.metal ?? 0.6, emissive: o.emissive ?? 0x000000, emissiveIntensity: o.ei ?? 1, flatShading: !!o.flat });
const glowM = (c, op = 0.85) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const mk = (geo, mat, parent, pos, rot, scale) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scale) m.scale.set(...scale); parent?.add(m); return m; };

const victimCentre = (s) => s.V.group.position.clone().setY(0.08 + s.V.tok.height * 0.5);
/** Plane containing the on-screen slash line at `deg` (0 = horizontal, negative = down to the right) through point `c`. */
function slashPlane(s, deg, c) {
  const a = (deg * Math.PI) / 180, dir = s.right.clone().multiplyScalar(Math.cos(a)).addScaledVector(s.ups, Math.sin(a));
  const n = new V3().crossVectors(dir, s.fwdH).normalize();
  return { plane: new THREE.Plane(n, -n.dot(c)), dir };
}
/** Long thin additive line showing the slash. */
function slashFlash(s, deg, c, len = 4.2, w = 0.22) {
  const a = (deg * Math.PI) / 180, dir = s.right.clone().multiplyScalar(Math.cos(a)).addScaledVector(s.ups, Math.sin(a));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), glowM(0xffffff, 1)); m.renderOrder = 30;
  const z = s.fwdH.clone().negate(), y = new V3().crossVectors(z, dir).normalize();
  m.matrix.makeBasis(dir, y, z).setPosition(c); m.matrixAutoUpdate = false; s.add(m);
  s.tween(0.35, (e) => { m.scale.set(1 + e * 0.15, Math.max(0.01, 1 - e * 0.9), 1); m.material.opacity = 1 - e; m.matrix.makeBasis(dir.clone().multiplyScalar(1 + e * 0.15), y.clone().multiplyScalar(Math.max(0.01, 1 - e * 0.9)), z).setPosition(c); }, ease.linear).then(() => s.remove(m));
}
const centroid = (pieces) => { const c = new V3(); pieces.forEach((p) => c.add(p.group.position)); return c.multiplyScalar(1 / Math.max(1, pieces.length)); };

/** Flying clone of the victim's visible body (physics needs its own group). */
function cloneVictim(s, scale = null) {
  const g = new THREE.Group(); const body = s.V.tok.group.clone(true);
  body.position.set(0, 0, 0); body.rotation.set(0, 0, 0); body.scale.set(...(scale || [1, 1, 1]));
  g.add(body); g.position.copy(s.V.group.position); g.rotation.y = s.V.group.rotation.y;
  s.V.group.visible = false; s.scene.add(g);
  return g;
}

/** Shared tail: the attacker stomps the pieces, then kicks them off the board and into the grass. */
async function smashAndKick(s, pieces, { stomp = true } = {}) {
  const A = s.A;
  await s.wait(0.55);
  const c = centroid(pieces); c.y = 0.1;
  s.slow(0.6);
  s.closeUp(4.4, 1.7, 0.3, 32, 4, c.clone().setY(0.4));
  if (stomp) {
    const target = c.clone().addScaledVector(s.right, -0.6);
    await s.attackerJump(target, { h: 1.5, dur: 0.42 });
    audio.sfx('smash'); s.shake(0.55); s.flash('#fff', 0.16, 0.5); s.impact(c.clone().setY(0.3), { size: 2.2, sparks: 18, ring: 3 });
    for (const p of pieces) s.impulse(p, new V3((Math.random() - 0.5) * 0.6, -1.2, (Math.random() - 0.5) * 0.6).multiplyScalar(s.massOf(p)));
    await s.attackerSettle();
  }
  // the kick: wind back, whip forward, pieces fly off the board
  A.face = Math.atan2(s.dirOut.x, s.dirOut.z);
  s.slow(0.5);
  await s.tween(0.16, (e) => { A.tok.group.rotation.x = -0.55 * e; A.squash = -0.15 * e; }, ease.outQuad);
  await s.tween(0.1, (e) => { A.tok.group.rotation.x = -0.55 + 1.7 * e; A.squash = 0.2 * e; }, ease.linear);
  s.kickOff(pieces, 1.1); s.phase('kick'); s.impact(c.clone().setY(0.4), { size: 3, sparks: 28 }); s.speedLines(1.4, '#fff'); s.shake(0.7); s.flash('#fff', 0.12, 0.5);
  A.tok.group.rotation.x = 0; A.squash = 0;
  s.slow(0.55);
  const follow = s.follow(pieces[0], 2.0, 5.5, 34);
  await s.wait(0.9); s.slow(1);
  await Promise.all([follow, s.settle(3.5)]);
}

// ================================================================================== ANIME
function makeKatana() {
  const g = new THREE.Group();
  mk(new THREE.BoxGeometry(0.05, 1.15, 0.014), std(0xf4f8ff, { rough: 0.12, metal: 1, emissive: 0x9fb8ff, ei: 0.25 }), g, [0, 0.75, 0]);
  mk(new THREE.BoxGeometry(0.014, 1.12, 0.018), new THREE.MeshBasicMaterial({ color: 0xffffff }), g, [0.024, 0.75, 0]);
  mk(new THREE.ConeGeometry(0.03, 0.14, 4), std(0xf4f8ff, { rough: 0.12, metal: 1 }), g, [0, 1.38, 0], [0, Math.PI / 4, 0], [1, 1, 0.3]);
  mk(new THREE.CylinderGeometry(0.11, 0.11, 0.025, 6), std(0xffd23f, { metal: 0.9, rough: 0.3 }), g, [0, 0.16, 0]);
  const hd = mk(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), std(0x2a1a2a, { metal: 0.1, rough: 0.7 }), g, [0, -0.02, 0]);
  for (let i = 0; i < 5; i++) mk(new THREE.TorusGeometry(0.037, 0.008, 4, 8), std(0xd94a5a, { metal: 0 }), g, [0, -0.13 + i * 0.07, 0], [Math.PI / 2, 0, 0]);
  mk(new THREE.SphereGeometry(0.045, 8, 6), std(0xffd23f, { metal: 0.9 }), g, [0, -0.2, 0]);
  const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), glowM(0xffffff, 0)); glint.position.set(0, 0.5, 0.03); g.add(glint); g.userData.glint = glint;
  return g;
}

async function katana(s) {
  const { A, V } = s;
  const pivot = new THREE.Group(); A.group.add(pivot); pivot.position.set(0, 0.62, 0.02); pivot.rotation.order = 'XYZ';
  const blade = makeKatana(); blade.position.set(0, 0, 0); pivot.add(blade); blade.scale.setScalar(0.001); blade.rotation.z = 0;
  pivot.rotation.x = 0.25; blade.position.x = 0.28; blade.position.z = 0.02;
  audio.sfx('draw'); s.banner('CAPTURE!', s.g.seatName(A.seat) + ' slashes ' + s.g.seatName(V.seat), '#ff4d5e');
  // draw the blade with a glint
  await s.tween(0.4, (e, p) => { blade.scale.setScalar(Math.max(0.001, e)); A.squash = -0.2 * Math.sin(p * Math.PI); blade.userData.glint.material.opacity = Math.sin(p * Math.PI) * 0.9; blade.userData.glint.position.y = 0.2 + p * 1.0; }, ease.outBack);
  s.fx.sparks(blade.localToWorld(new V3(0, 1, 0)), 14, 0xdfeaff, 3); s.phase('draw');
  // wind-up: blade raised behind, victim trembles
  const wobble = s.addUpdater(() => { V.group.position.x = s.vPos.x + Math.sin(performance.now() * 0.06) * 0.03; });
  await s.tween(0.4, (e) => { pivot.rotation.x = 0.25 - 2.55 * e; A.group.position.x += 0; A.squash = 0.12 * e; A.tok.group.rotation.x = -0.25 * e; }, ease.outQuad);
  wobble(); V.group.position.copy(s.vPos); s.phase('windup');
  s.closeUp(5.0, 1.7, 0.3, 30, 5, s.C.clone().addScaledVector(s.right, 0.4).setY(0.75));
  await s.wait(0.25);
  // the strike: time slows, A lunges while the blade sweeps a diagonal arc through the victim
  s.slow(0.18); audio.sfx('whoosh');
  const centre = victimCentre(s), { plane, dir } = slashPlane(s, -32, centre);
  let cut = null, tipPrev = null;
  const from = A.group.position.clone(), to = s.aPos.clone().addScaledVector(s.right, 0.9);
  await s.tween(0.34, (e, p) => {
    A.group.position.lerpVectors(from, to, ease.outQuad(p)); A.group.position.y = 0.08 + Math.sin(p * Math.PI) * 0.25;
    pivot.rotation.x = -2.3 + 3.3 * ease.inOutQuad(p); A.tok.group.rotation.x = -0.25 + 0.6 * p; A.squash = 0.1;
    const tip = blade.localToWorld(new V3(0, 1.3, 0));
    s.fx.emit({ p: tip, n: 1, v: [0, 0, 0], life: 0.3, size: 0.5, size1: 0.05, color: 0xdfeaff, alpha: 0.9, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true });
    if (tipPrev) for (let k = 1; k < 3; k++) s.fx.emit({ p: tipPrev.clone().lerp(tip, k / 3), n: 1, life: 0.3, size: 0.4, size1: 0.04, color: 0xffffff, alpha: 0.8, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true });
    tipPrev = tip;
    if (!cut && p > 0.72) {
      cut = s.sliceVictim(plane); s.phase('slice');
      audio.sfx('slash'); s.flash('#ffffff', 0.28, 0.95); s.shake(0.8); s.speedLines(1.6, '#ffffff');
      slashFlash(s, -32, centre, 4.6, 0.26);
      s.impact(centre, { size: 3.6, sparks: 40, ring: 4.5, color: 0xdfeaff });
      for (let i = -6; i <= 6; i++) s.fx.sparks(centre.clone().addScaledVector(dir, i * 0.14), 4, 0xffffff, 4);
      const n = plane.normal;
      cut.forEach((pc, i) => { const sgn = i === 0 ? 1 : -1; s.impulse(pc, new V3(n.x * sgn * 1.4, 0.6 + Math.random() * 0.5, n.z * sgn * 1.4).multiplyScalar(s.massOf(pc))); s.spin(pc, new V3(-n.z * sgn * 3, 0, n.x * sgn * 3)); });
    }
  }, ease.linear);
  if (!cut) cut = s.sliceVictim(plane);
  // follow-through: A slides through the space where the victim stood
  await s.tween(0.3, (e) => { A.group.position.lerpVectors(to, to.clone().addScaledVector(s.right, 0.55), e); pivot.rotation.x = 1.0 + 0.6 * e; A.squash = 0.1 * (1 - e); A.tok.group.rotation.x = 0.35 * (1 - e); }, ease.outQuad);
  to.addScaledVector(s.right, 0.55);
  s.slow(0.5); await s.wait(0.25);
  await s.tween(0.35, (e) => { blade.scale.setScalar(Math.max(0.001, 1 - e)); }, ease.inQuad); pivot.remove(blade);
  await smashAndKick(s, cut);
  A.group.remove(pivot);
}

async function shuriken(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Shuriken Storm', '#ff9a3c');
  const starShape = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.1 : 0.34; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); } starShape.closePath();
  const sgeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.03, bevelEnabled: false });
  await s.tween(0.35, (e, p) => { A.squash = -0.25 * Math.sin(p * Math.PI); A.group.rotation.y += 0.7; }, ease.linear);
  audio.sfx('draw');
  const centre = victimCentre(s);
  const stars = [];
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(sgeo, std(0xdfe6f3, { metal: 1, rough: 0.15, emissive: 0x7a8bb8, ei: 0.3 })); m.castShadow = true; m.scale.setScalar(0.85); s.add(m); stars.push(m); }
  s.slow(0.32);
  let pieces = null, hits = 0;
  await Promise.all(stars.map(async (m, i) => {
    await s.wait(i * 0.09);
    const a0 = s.aPos.clone().add(new V3(0, 0.6, 0)), side = i % 2 ? 1 : -1;
    const ctrl = a0.clone().lerp(centre, 0.5).addScaledVector(s.ups, 0.9 + i * 0.2).addScaledVector(s.fwdH, side * (0.8 + i * 0.15));
    const target = centre.clone().add(new V3((i - 2) * 0.02, (i - 2) * 0.16, 0));
    audio.sfx('whoosh');
    await s.tween(0.32, (e) => { const a = a0.clone().lerp(ctrl, e), b = ctrl.clone().lerp(target, e); m.position.copy(a.lerp(b, e)); m.rotation.set(Math.PI / 2 + e * 0.6, 0, e * 30); s.fx.emit({ p: m.position, n: 1, life: 0.25, size: 0.18, size1: 0.02, color: 0xdfeaff, alpha: 0.8, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true }); }, ease.linear);
    s.remove(m); hits++;
    audio.sfx('slash'); s.shake(0.3); s.fx.sparks(target, 12, 0xffffff, 4);
    if (hits === 3) { const { plane } = slashPlane(s, -28, centre); pieces = s.sliceVictim(plane); s.phase('slice'); pieces.forEach((pc, k) => { const n = plane.normal; const sg = k ? -1 : 1; s.impulse(pc, new V3(n.x * sg, 0.5, n.z * sg).multiplyScalar(s.massOf(pc))); }); s.flash('#fff', 0.2, 0.7); slashFlash(s, -28, centre); }
    if (hits === 5 && pieces) { const big = pieces.reduce((a, b) => (s.massOf(a) > s.massOf(b) ? a : b)); const { plane } = slashPlane(s, 35, big.group.position.clone()); const parts = s.slicePiece(big, plane); pieces = pieces.filter((p) => p !== big).concat(parts); parts.forEach((pc, k) => s.impulse(pc, new V3((k ? 1 : -1) * 0.8, 0.8, 0).multiplyScalar(s.massOf(pc)))); s.flash('#fff', 0.2, 0.7); slashFlash(s, 35, big.group.position.clone()); s.speedLines(1.2); }
  }));
  s.pieces = pieces;
  await smashAndKick(s, pieces);
}

async function spirit(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Spirit Fist', '#8fd3ff');
  const aura = s.addUpdater(() => { const p = A.group.position; for (let i = 0; i < 2; i++) { const a = Math.random() * 6.283, r = 1.4; s.fx.emit({ p: [p.x + Math.cos(a) * r, 0.5 + Math.random(), p.z + Math.sin(a) * r], n: 1, v: [-Math.cos(a) * 3, 0.5, -Math.sin(a) * 3], life: 0.45, size: 0.22, size1: 0.02, color: 0x8fd3ff, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true }); } });
  audio.sfx('draw'); audio.sfx('whoosh');
  await s.tween(0.7, (e) => { A.squash = -0.25 * Math.sin(e * Math.PI); A.tok.group.rotation.x = -0.4 * e; }, ease.inOutQuad);
  aura();
  // the ghost fist
  const fist = new THREE.Group(); const gm = () => new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
  mk(new THREE.SphereGeometry(0.5, 16, 12), gm(), fist, [0, 0, 0], null, [1.25, 1, 1]);
  for (let i = 0; i < 4; i++) mk(new THREE.CapsuleGeometry(0.16, 0.22, 4, 8), gm(), fist, [0.5, 0.36 - i * 0.24, 0], [0, 0, Math.PI / 2]);
  mk(new THREE.CapsuleGeometry(0.2, 0.3, 4, 8), gm(), fist, [0.2, 0.55, 0.15], [0.3, 0, 0.6]);
  mk(new THREE.CylinderGeometry(0.42, 0.55, 2.2, 14), gm(), fist, [-1.5, 0, 0], [0, 0, Math.PI / 2]);
  fist.scale.setScalar(0.5); fist.position.copy(s.aPos).addScaledVector(s.right, -1.4).setY(2.6); fist.rotation.set(0, 0, 0.5); s.add(fist);
  fist.children.forEach((c) => (c.castShadow = false));
  audio.sfx('laser');
  await s.tween(0.5, (e) => { fist.scale.setScalar(0.5 + e * 1.6); fist.position.y = 2.6 - e * 1.1; fist.rotation.z = 0.5 - e * 0.5; }, ease.outBack);
  s.closeUp(5.5, 1.7, 0.2, 30, 5, s.C.clone().setY(0.8));
  s.slow(0.2);
  const flyer = cloneVictim(s); const inner = flyer.children[0];
  const from = fist.position.clone(), to = s.vPos.clone().setY(0.85).addScaledVector(s.right, -0.9);
  await s.tween(0.3, (e) => { fist.position.lerpVectors(from, to, e); fist.scale.x = 1.9 + e * 0.5; }, ease.inQuad);
  s.phase('slice'); audio.sfx('smash'); s.flash('#fff', 0.3, 0.95); s.shake(0.95); s.speedLines(1.8, '#bfe6ff'); s.impact(to, { size: 4.5, sparks: 45, ring: 5, color: 0xbfe6ff });
  const pc = s.makePiece(flyer, { restitution: 0.3, density: 1.2, outline: false });
  const m = s.massOf(pc);
  s.velocity(pc, new V3(s.dirOut.x * 12, 13, s.dirOut.z * 12)); s.spin(pc, new V3(6, 9, 4));
  s.g.rig.shake(0.5);
  await s.tween(0.3, (e) => { fist.position.addScaledVector(s.right, 0.03); fist.children.forEach((c) => (c.material.opacity = 0.7 * (1 - e))); }, ease.linear); s.remove(fist);
  s.slow(0.5); const f = s.follow(pc, 2.6, 6, 38);
  // twinkle at the apex
  s.wait(0.8).then(() => { const p = pc.group.position.clone(); s.fx.emit({ p, n: 1, life: 0.6, size: 3, size1: 6, color: 0xffffff, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, essential: true }); audio.sfx('pickup'); });
  await s.wait(1.2); s.slow(1);
  await Promise.all([f, s.settle(4)]);
}

// ================================================================================== GAMER
function makeHammer() {
  const g = new THREE.Group();
  mk(new THREE.CylinderGeometry(0.06, 0.06, 1.7, 8), std(0x8a5a2b, { metal: 0.05, rough: 0.8, flat: true }), g, [0, 0.85, 0]);
  mk(new THREE.BoxGeometry(1.15, 0.7, 0.7), std(0xe63946, { metal: 0.2, rough: 0.5, flat: true }), g, [0, 1.75, 0]);
  for (const x of [-0.6, 0.6]) mk(new THREE.BoxGeometry(0.12, 0.76, 0.76), std(0xffd23f, { metal: 0.6, rough: 0.35 }), g, [x, 1.75, 0]);
  mk(new THREE.SphereGeometry(0.08, 8, 6), std(0xffd23f, { metal: 0.6 }), g, [0, 0, 0]);
  return g;
}

async function hammer(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Hammer Smash', '#ffd23f');
  const pivot = new THREE.Group(); A.group.add(pivot); pivot.position.set(0, 0.4, 0);
  const h = makeHammer(); pivot.add(h); h.scale.setScalar(0.01);
  audio.sfx('spawn');
  await s.tween(0.4, (e, p) => { h.scale.setScalar(Math.max(0.01, e * 0.7)); A.squash = -0.2 * Math.sin(p * Math.PI); }, ease.outBack);
  // raise overhead
  await s.tween(0.5, (e) => { pivot.rotation.x = -0.5 - 1.9 * e; A.squash = 0.15 * e; A.tok.group.rotation.x = -0.3 * e; pivot.position.y = 0.4 + e * 0.3; }, ease.outQuad);
  s.closeUp(4.6, 1.3, 0.3, 30, 5, s.C.clone().setY(0.7));
  s.slow(0.3); await s.wait(0.2);
  audio.sfx('whoosh');
  await s.attackerJump(s.vPos.clone().addScaledVector(s.right, -0.9), { h: 1.2, dur: 0.3, land: false });
  await s.tween(0.14, (e) => { pivot.rotation.x = -2.4 + 3.1 * e; }, ease.inQuad);
  // SMASH: flatten
  s.phase('slice'); audio.sfx('smash'); s.flash('#fff', 0.25, 0.9); s.shake(1.0); s.speedLines(1.4, '#ffd23f');
  const hitP = s.vPos.clone().setY(0.1);
  s.fx.dust(hitP, 24, 0xe8e0c8); s.fx.ring(hitP.clone().setY(0.12), 5.5, 0xffd23f, 0.6); s.fx.sparks(hitP.clone().setY(0.3), 30, 0xffd23f, 6);
  for (let i = 0; i < 6; i++) s.fx.emit({ p: hitP, n: 1, v: [Math.cos(i) * 5, 2, Math.sin(i) * 5], life: 0.5, size: 0.3, size1: 0.9, color: 0xe8e0c8, alpha: 0.7, alpha1: 0, drag: 3, frame: SPRITE.SMOKE });
  const body = V.tok.group;
  await s.tween(0.12, (e) => { body.scale.set(1 + 0.75 * e, 1 - 0.88 * e, 1 + 0.75 * e); }, ease.outQuad);
  await s.wait(0.5); s.slow(0.5);
  // pull the hammer back and swing it sideways: launch the pancake like a frisbee
  await s.tween(0.35, (e) => { pivot.rotation.x = 0.7 - 2.0 * e; pivot.rotation.z = -0.1; pivot.position.y = 0.4 + e * 0.1; A.tok.group.rotation.x = -0.3 + 0.3 * e; }, ease.outQuad);
  s.slow(0.25);
  const flyer = cloneVictim(s, [1.75, 0.12, 1.75]);
  await s.tween(0.2, (e) => { pivot.rotation.x = -1.3 + 1.6 * e; pivot.rotation.z = -0.1 - e * 0.5; }, ease.inQuad);
  audio.sfx('smash'); audio.sfx('boom'); s.flash('#fff', 0.2, 0.7); s.shake(0.8); s.impact(hitP.clone().setY(0.4), { size: 3.5, color: 0xffd23f, sparks: 35, ring: 4 });
  const pc = s.makePiece(flyer, { density: 1.4, restitution: 0.4, outline: false });
  s.velocity(pc, new V3(s.dirOut.x * 17, 8, s.dirOut.z * 17)); s.spin(pc, new V3(0, 22, 0));
  body.scale.set(1, 1, 1);
  await s.tween(0.25, (e) => { pivot.rotation.z += 0.05; h.scale.setScalar(Math.max(0.01, 0.7 * (1 - e))); }, ease.linear); A.group.remove(pivot);
  A.tok.group.rotation.x = 0; A.squash = 0;
  s.slow(0.6); const f = s.follow(pc, 2.4, 6, 34); await s.wait(1.0); s.slow(1);
  await Promise.all([f, s.settle(4)]);
}

async function rocket(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Rocket Strike', '#ff9f1c');
  const launcher = new THREE.Group(); A.group.add(launcher); launcher.position.set(-0.05, 0.75, 0.05);
  mk(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 12), std(0x4a5a4a, { metal: 0.4, rough: 0.6, flat: true }), launcher, [0, 0, 0.35], [Math.PI / 2, 0, 0]);
  mk(new THREE.CylinderGeometry(0.17, 0.14, 0.2, 12), std(0x2a2f3a), launcher, [0, 0, 0.9], [Math.PI / 2, 0, 0]);
  mk(new THREE.BoxGeometry(0.1, 0.12, 0.3), std(0x2a2f3a), launcher, [0, 0.17, 0.3]);
  mk(new THREE.BoxGeometry(0.08, 0.3, 0.1), std(0x2a2f3a), launcher, [0, -0.2, 0.15]);
  launcher.rotation.y = 0; launcher.scale.setScalar(0.01);
  audio.sfx('spawn');
  await s.tween(0.4, (e, p) => { launcher.scale.setScalar(Math.max(0.01, e)); A.squash = -0.15 * Math.sin(p * Math.PI); }, ease.outBack);
  s.closeUp(5.2, 1.5, 0.3, 30, 4, s.C.clone().setY(0.7));
  await s.wait(0.5);
  const muzzle = () => launcher.localToWorld(new V3(0, 0, 1.05));
  s.slow(0.4); audio.sfx('rocket');
  const from = muzzle(), centre = victimCentre(s);
  const rk = new THREE.Group(); mk(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 10), std(0xdfe6f3, { metal: 0.6 }), rk, [0, 0, 0], [Math.PI / 2, 0, 0]); mk(new THREE.ConeGeometry(0.08, 0.2, 10), std(0xe63946), rk, [0, 0, 0.34], [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 3; i++) mk(new THREE.BoxGeometry(0.02, 0.16, 0.14), std(0xe63946), rk, [Math.cos(i * 2.09) * 0.1, Math.sin(i * 2.09) * 0.1, -0.2], [0, 0, i * 2.09]);
  s.add(rk); rk.position.copy(from); rk.lookAt(centre);
  s.fx.smoke(from, 14, 0xdddddd, 0.6); s.fx.flash(from, 2, 0xffc060); s.shake(0.35);
  await s.tween(0.3, (e) => { rk.position.lerpVectors(from, centre, e); s.fx.emit({ p: rk.position, n: 2, v: [0, 0, 0], vr: 0.3, life: 0.5, size: 0.3, size1: 0.9, color: 0xdddddd, alpha: 0.6, alpha1: 0, frame: SPRITE.SMOKE, essential: true }); s.fx.emit({ p: rk.position, n: 1, life: 0.2, size: 0.4, size1: 0.05, color: 0xffb040, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true }); }, ease.inQuad);
  s.remove(rk);
  // boom
  s.phase('slice'); audio.sfx('boom'); s.flash('#ffb060', 0.4, 1); s.shake(1.0); s.speedLines(1.5, '#ffd080');
  for (let i = 0; i < 9; i++) s.fx.emit({ p: [centre.x + (Math.random() - 0.5) * 0.6, centre.y + (Math.random() - 0.3) * 0.6, centre.z + (Math.random() - 0.5) * 0.6], n: 1, v: [(Math.random() - 0.5) * 3, 2, (Math.random() - 0.5) * 3], life: 0.7, size: 1, size1: 3.2, color: 0xffb040, color1: 0xff3a10, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true, drag: 1.5 });
  s.fx.ring(centre.clone().setY(0.12), 8, 0xffd080, 0.6); s.fx.sparks(centre, 60, 0xffc060, 9); s.fx.smoke(centre, 16, 0x333333, 1.0);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.7, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(centre.x, 0.09, centre.z); s.add(scorch);
  V.group.updateMatrixWorld(true);
  const shards = shatter(V.tok.group, 6, Math.random, 0xffa050); V.group.visible = false;
  const pieces = shards.map((g) => s.makePiece(g));
  pieces.forEach((pc) => { const d = pc.group.position.clone().sub(centre); d.y = 0; if (d.lengthSq() < 0.01) d.copy(s.dirOut); d.normalize(); const m = s.massOf(pc); s.impulse(pc, new V3(d.x * 9 + s.dirOut.x * 5, 6 + Math.random() * 6, d.z * 9 + s.dirOut.z * 5).multiplyScalar(m)); s.spin(pc, new V3(Math.random() * 20 - 10, Math.random() * 20 - 10, Math.random() * 20 - 10)); });
  A.group.remove(launcher);
  await s.tween(0.2, (e) => { A.squash = -0.1 * (1 - e); }, ease.linear);
  s.slow(0.55); const f = s.follow(pieces[0], 2.2, 6, 34); await s.wait(0.9); s.slow(1);
  await Promise.all([f, s.settle(4)]);
}

async function uppercut(s) {
  const { A, V } = s;
  s.banner('K.O.!', 'Uppercut', '#ff4d5e');
  const glove = new THREE.Group();
  const rm = std(0xe63946, { metal: 0.05, rough: 0.45, flat: false });
  mk(new THREE.SphereGeometry(0.42, 18, 14), rm, glove, [0, 0.1, 0], null, [1, 0.95, 1.1]); mk(new THREE.SphereGeometry(0.2, 12, 10), rm, glove, [0.3, 0.02, 0.25]);
  mk(new THREE.CylinderGeometry(0.3, 0.32, 0.26, 14), std(0xffffff, { metal: 0, rough: 0.6 }), glove, [0, -0.32, 0]);
  mk(new THREE.CylinderGeometry(0.2, 0.2, 0.8, 10), std(0x333a55, { metal: 0.1, rough: 0.7 }), glove, [0, -0.85, 0]);
  const pivot = new THREE.Group(); A.group.add(pivot); pivot.position.set(0, 0.3, 0.05); pivot.add(glove); glove.scale.setScalar(0.01); glove.position.set(0.3, -0.15, 0.1);
  audio.sfx('spawn'); await s.tween(0.4, (e, p) => { glove.scale.setScalar(Math.max(0.01, e * 0.75)); A.squash = -0.25 * Math.sin(p * Math.PI); }, ease.outBack);
  // wind-up low, then explode upward
  await s.tween(0.45, (e) => { pivot.rotation.x = 0.4 * e; A.squash = -0.3 * e; glove.position.y = -0.15 - 0.4 * e; }, ease.outQuad);
  s.closeUp(4.4, 1.2, 0.5, 30, 5, s.C.clone().setY(0.7));
  s.slow(0.22);
  const flyer = cloneVictim(s);
  const from = A.group.position.clone(), to = s.vPos.clone().addScaledVector(s.right, -0.85);
  await s.tween(0.18, (e) => { A.group.position.lerpVectors(from, to, e); }, ease.inQuad);
  await s.tween(0.14, (e) => { pivot.rotation.x = 0.4 - 2.3 * e; glove.position.y = -0.55 + 1.2 * e; A.squash = -0.3 + 0.55 * e; }, ease.inQuad);
  s.phase('slice'); audio.sfx('smash'); s.flash('#fff', 0.3, 1); s.shake(1.0); s.speedLines(2, '#ffd23f');
  s.impact(s.vPos.clone().setY(0.6), { size: 4, sparks: 40, ring: 5, color: 0xffd23f });
  const pc = s.makePiece(flyer, { restitution: 0.35, density: 1.1, outline: false });
  s.velocity(pc, new V3(s.dirOut.x * 5, 20, s.dirOut.z * 5)); s.spin(pc, new V3(8, 5, 12));
  // KO stars orbiting the victim
  const stars = s.addUpdater(() => { const p = pc.group.position; const t = performance.now() * 0.01; for (let i = 0; i < 2; i++) s.fx.emit({ p: [p.x + Math.cos(t + i * 3) * 0.7, p.y + 0.9, p.z + Math.sin(t + i * 3) * 0.7], n: 1, life: 0.4, size: 0.34, size1: 0.1, color: 0xffe066, alpha: 1, alpha1: 0, add: true, frame: SPRITE.STAR, spin: 6, essential: true }); });
  await s.tween(0.3, (e) => { pivot.rotation.x = -1.9; }, ease.linear);
  s.slow(0.6);
  const t0 = s.clock.t;
  while (s.clock.t - t0 < 1.7 && !s.aborted) { const p = pc.group.position; s.rig.goTo(new V3(p.x - s.fwdH.x * 8, Math.max(2, p.y * 0.6 + 1.5), p.z - s.fwdH.z * 8), p.clone(), 36, 4); await s.wait(0.05); }
  stars(); s.slow(1); A.group.remove(pivot); A.squash = 0;
  await s.settle(4);
}

// ================================================================================== TECH
/** Voxel bodies rendered with one InstancedMesh (fast) and simulated by Rapier. */
function voxelSwarm(s, voxels, size, { gravityScale = 1 } = {}) {
  const geo = new THREE.BoxGeometry(size * 0.94, size * 0.94, size * 0.94);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2, emissive: 0xffffff, emissiveIntensity: 0.5, vertexColors: false });
  const mesh = new THREE.InstancedMesh(geo, mat, voxels.length); mesh.castShadow = true; mesh.frustumCulled = false; s.add(mesh);
  const bodies = [], dummy = new THREE.Object3D(), R = RAPIER;
  voxels.forEach((v, i) => {
    mesh.setColorAt(i, v.color);
    const b = s.phys.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(v.pos.x, v.pos.y, v.pos.z).setGravityScale(0).setLinearDamping(0.2).setAngularDamping(0.3).setCcdEnabled(false));
    s.phys.world.createCollider(R.ColliderDesc.cuboid(size / 2, size / 2, size / 2).setRestitution(0.4).setFriction(0.6).setCollisionGroups(((PG.DEBRIS) << 16) | PG.STATIC), b);
    bodies.push(b);
  });
  let scale = 1;
  const upd = s.addUpdater(() => { bodies.forEach((b, i) => { const t = b.translation(), r = b.rotation(); dummy.position.set(t.x, t.y, t.z); dummy.quaternion.set(r.x, r.y, r.z, r.w); dummy.scale.setScalar(scale); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); }); mesh.instanceMatrix.needsUpdate = true; });
  upd();
  const swarm = { mesh, bodies, size, setScale(v) { scale = v; }, update: upd, release(i, vel, spin) { const b = bodies[i]; b.setGravityScale(gravityScale, true); b.setLinvel(vel, true); b.setAngvel(spin, true); }, dispose() { bodies.forEach((b) => s.phys.world.removeRigidBody(b)); s.remove(mesh); } };
  const loop = s.addUpdater(() => upd());
  swarm.stop = loop;
  s.swarms = (s.swarms || []).concat(swarm);
  return swarm;
}

async function laser(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Laser Voxelizer', '#00f0c8');
  // emitter drone above the attacker
  const em = new THREE.Group(); mk(new THREE.BoxGeometry(0.4, 0.2, 0.4), std(0x2b3242, { metal: 0.8, rough: 0.3 }), em); mk(new THREE.SphereGeometry(0.1, 12, 10), std(0x000000, { emissive: 0x00f0c8, ei: 3 }), em, [0, -0.14, 0]);
  for (const sx of [-1, 1]) mk(new THREE.BoxGeometry(0.4, 0.04, 0.1), std(0x596178, { metal: 0.8 }), em, [sx * 0.3, 0.05, 0]);
  em.position.copy(s.aPos).setY(2.1); em.scale.setScalar(0.01); s.add(em);
  audio.sfx('spawn'); await s.tween(0.45, (e) => { em.scale.setScalar(Math.max(0.01, e * 1.2)); em.position.y = 2.1 + Math.sin(e * 6) * 0.05; }, ease.outBack);
  s.closeUp(4.8, 1.8, 0.3, 30, 4, s.C.clone().setY(0.8));
  const centre = victimCentre(s), top = V.tok.height + 0.15;
  // pre-compute voxels of the victim, then swap the token for its voxel twin
  const { voxels, size } = voxelize(V.tok.group, 0.105, 300);
  const swarm = voxelSwarm(s, voxels, size);
  V.group.visible = false;
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 8, 1, true), glowM(0x00ffd0, 0.95)); beam.renderOrder = 30; s.add(beam);
  const halo = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1, 8, 1, true), glowM(0x00f0c8, 0.35)); halo.renderOrder = 29; s.add(halo);
  const hitGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.05), glowM(0xffffff, 0.9)); hitGlow.renderOrder = 31; s.add(hitGlow);
  s.slow(0.5); audio.sfx('laser');
  const released = new Array(voxels.length).fill(false);
  const y0 = 0.08 + top, y1 = 0.02;
  await s.tween(0.85, (e) => {
    const y = lerp(y0, y1, e); const src = em.position, tgt = new V3(s.vPos.x, y, s.vPos.z);
    const mid = src.clone().lerp(tgt, 0.5), len = src.distanceTo(tgt);
    beam.position.copy(mid); beam.scale.set(1, len, 1); beam.quaternion.setFromUnitVectors(new V3(0, 1, 0), tgt.clone().sub(src).normalize()); halo.position.copy(mid); halo.scale.set(1, len, 1); halo.quaternion.copy(beam.quaternion);
    hitGlow.position.copy(tgt); hitGlow.quaternion.copy(s.g.camera.quaternion);
    s.fx.emit({ p: tgt, n: 2, v: [0, 1, 0], vr: [2, 1, 2], life: 0.4, size: 0.18, size1: 0.02, color: 0x00ffd0, alpha: 1, alpha1: 0, add: true, frame: SPRITE.SOFT, essential: true });
    voxels.forEach((v, i) => { if (!released[i] && v.pos.y >= y) { released[i] = true; const d = new V3(v.pos.x - s.vPos.x, 0, v.pos.z - s.vPos.z); if (d.lengthSq() < 0.001) d.copy(s.right); d.normalize(); swarm.release(i, { x: d.x * (1.5 + Math.random() * 2.5) + s.dirOut.x * 1.2, y: 2 + Math.random() * 3, z: d.z * (1.5 + Math.random() * 2.5) + s.dirOut.z * 1.2 }, { x: Math.random() * 12 - 6, y: Math.random() * 12 - 6, z: Math.random() * 12 - 6 }); } });
    if (Math.random() < 0.3) audio.sfx('voxel');
    s.shake(0.12);
  }, ease.linear);
  s.remove(beam); s.remove(halo); s.remove(hitGlow); s.phase('slice');
  audio.sfx('boom'); s.flash('#00ffd0', 0.3, 0.6); s.shake(0.8); s.speedLines(1.2, '#00ffd0'); s.impact(centre, { size: 3, color: 0x00ffd0, sparks: 30, ring: 4 });
  for (let i = 0; i < voxels.length; i++) if (!released[i]) swarm.release(i, { x: (Math.random() - 0.5) * 4, y: 3, z: (Math.random() - 0.5) * 4 }, { x: Math.random() * 8, y: Math.random() * 8, z: 0 });
  await s.tween(0.3, (e) => { em.scale.setScalar(Math.max(0.01, 1.2 * (1 - e))); }, ease.inQuad); s.remove(em);
  // the attacker sweeps them off the board with a shove
  s.slow(0.6); await s.wait(0.7);
  A.face = Math.atan2(s.dirOut.x, s.dirOut.z);
  await s.attackerJump(s.C.clone().addScaledVector(s.dirOut, -0.9), { h: 1.0, dur: 0.35 });
  s.shake(0.5); audio.sfx('kick');
  swarm.bodies.forEach((b) => { b.applyImpulse({ x: s.dirOut.x * 0.05 + (Math.random() - 0.5) * 0.02, y: 0.05, z: s.dirOut.z * 0.05 + (Math.random() - 0.5) * 0.02 }, true); });
  s.speedLines(1, '#00f0c8'); s.slow(0.7);
  const anchor = { group: { position: new V3() } };
  const c0 = s.clock.t; const f = (async () => { while (s.clock.t - c0 < 2.0 && !s.aborted) { const c = swarm.bodies[0].translation(); anchor.group.position.set(c.x, c.y, c.z); s.rig.goTo(new V3(c.x - s.fwdH.x * 5, Math.max(2.2, c.y + 2.5), c.z - s.fwdH.z * 5), new V3(c.x, Math.max(0.3, c.y), c.z), 34, 3); await s.wait(0.05); } })();
  await f; s.slow(1); await s.wait(0.8);
  // shrink and dispose the voxels
  await s.tween(0.6, (e) => swarm.setScale(1 - e), ease.inQuad);
  swarm.dispose(); s.swarms = [];
}

async function orbital(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Orbital Strike', '#7ad7ff');
  const c = s.vPos.clone().setY(0.1);
  const ret = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.9, 40), glowM(0xff4d5e, 0.9)); ret.rotation.x = -Math.PI / 2; ret.position.copy(c).setY(0.14); s.add(ret);
  const ret2 = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 4), glowM(0xff4d5e, 0.9)); ret2.rotation.x = -Math.PI / 2; ret2.position.copy(ret.position); s.add(ret2);
  s.closeUp(5, 2.2, 0.3, 32, 4, s.C.clone().setY(0.6));
  audio.sfx('warn');
  await s.tween(1.0, (e) => { ret.scale.setScalar(2.2 - e * 1.4); ret.rotation.z = e * 5; ret2.rotation.z = -e * 6; ret.material.opacity = 0.4 + Math.abs(Math.sin(e * 22)) * 0.55; A.squash = 0.1 * Math.sin(e * 6); V.group.position.x = s.vPos.x + Math.sin(e * 90) * 0.02; }, ease.linear);
  V.group.position.copy(s.vPos);
  s.slow(0.35); audio.sfx('laser');
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 60, 20, 1, true), glowM(0xbfefff, 0.95)); col.renderOrder = 30; col.position.set(c.x, 30, c.z); s.add(col);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 60, 12, 1, true), glowM(0xffffff, 1)); core.renderOrder = 31; core.position.copy(col.position); s.add(core);
  await s.tween(0.18, (e) => { col.scale.set(e, 1, e); core.scale.set(e, 1, e); }, ease.outQuad);
  s.phase('slice'); audio.sfx('boom'); s.flash('#ffffff', 0.5, 1); s.shake(1.0); s.speedLines(1.8, '#bfefff');
  // vaporise: victim -> rising bright voxels
  const { voxels, size } = voxelize(V.tok.group, 0.09, 260); V.group.visible = false;
  voxels.forEach((v) => s.fx.emit({ p: v.pos, n: 1, v: [(Math.random() - 0.5) * 2, 3 + Math.random() * 6, (Math.random() - 0.5) * 2], vr: 0.5, life: 0.9 + Math.random() * 0.8, size: size * 1.4, size1: 0.01, color: v.color, color1: 0xbfefff, alpha: 1, alpha1: 0, drag: 0.6, frame: SPRITE.SQUARE, spin: 6, add: true, essential: true }));
  s.fx.ring(c.clone().setY(0.12), 9, 0xbfefff, 0.7); s.fx.sparks(c.clone().setY(0.6), 60, 0xffffff, 8); s.fx.smoke(c, 12, 0x555555, 0.8);
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.85, 24), new THREE.MeshBasicMaterial({ color: 0x0c1218, transparent: true, opacity: 0.75, depthWrite: false })); scorch.rotation.x = -Math.PI / 2; scorch.position.set(c.x, 0.09, c.z); s.add(scorch);
  await s.tween(0.5, (e) => { col.scale.set(1 - e * 0.7, 1, 1 - e * 0.7); core.scale.set(1 - e, 1, 1 - e); col.material.opacity = 0.95 * (1 - e); }, ease.linear);
  s.remove(col); s.remove(core); s.remove(ret); s.remove(ret2);
  s.slow(0.6); await s.attackerJump(s.C.clone().addScaledVector(s.right, -0.6), { h: 1.4, dur: 0.5 }); await s.attackerSettle();
  s.fx.confetti(s.C.clone().setY(1), 20, [0x7ad7ff, 0xffffff]);
  s.slow(1); await s.wait(1.0);
}

async function glitch(s) {
  const { A, V } = s;
  s.banner('CAPTURE!', 'Glitch Shatter', '#ff2bd6');
  s.closeUp(4.4, 1.6, 0.3, 30, 4, s.C.clone().setY(0.7));
  await s.tween(0.4, (e) => { A.squash = -0.15 * Math.sin(e * Math.PI); }, ease.linear);
  // RGB-split ghosts of the victim flicker while it corrupts
  const ghosts = [0xff2bd6, 0x00f0c8].map((c) => { const g = V.tok.group.clone(true); g.traverse((o) => { if (o.isMesh) { o.material = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); o.castShadow = false; } }); s.scene.add(g); return g; });
  const bars = []; for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.06 + Math.random() * 0.1), glowM(i % 2 ? 0xff2bd6 : 0x00f0c8, 0.7)); b.quaternion.copy(s.g.camera.quaternion); s.add(b); bars.push(b); }
  audio.sfx('voxel'); audio.sfx('laser');
  s.slow(0.6);
  const body = V.tok.group;
  await s.tween(0.95, (e) => {
    const j = e * e;
    V.group.position.set(s.vPos.x + (Math.random() - 0.5) * 0.28 * j, 0.08 + (Math.random() < 0.3 ? Math.random() * 0.25 * j : 0), s.vPos.z + (Math.random() - 0.5) * 0.1 * j);
    body.scale.set(1 + (Math.random() - 0.5) * 0.5 * j, 1 + (Math.random() - 0.5) * 0.4 * j, 1); body.visible = Math.random() > 0.15 * j;
    ghosts.forEach((g, k) => { g.position.copy(V.group.position); g.position.x += (k ? 1 : -1) * (0.05 + Math.random() * 0.2 * j); g.position.y += 0.02; g.rotation.y = V.group.rotation.y; g.scale.copy(body.scale); g.visible = Math.random() > 0.3; });
    bars.forEach((b, i) => { b.position.set(s.vPos.x + (Math.random() - 0.5) * 0.4, 0.2 + Math.random() * V.tok.height, s.vPos.z + 0.3); b.visible = Math.random() > 0.4; });
    if (Math.random() < 0.25) s.fx.emit({ p: [s.vPos.x + (Math.random() - 0.5), 0.3 + Math.random(), s.vPos.z], n: 3, life: 0.35, size: 0.12, size1: 0.12, color: Math.random() < 0.5 ? 0xff2bd6 : 0x00f0c8, alpha: 1, alpha1: 1, frame: SPRITE.SQUARE, add: true, essential: true, vr: 1.5 });
    s.shake(0.1 + j * 0.2);
  }, ease.linear);
  body.visible = true; body.scale.set(1, 1, 1); ghosts.forEach((g) => s.scene.remove(g)); bars.forEach((b) => s.remove(b));
  // shatter into shards, then freeze for a beat
  V.group.position.copy(s.vPos);
  s.phase('slice'); audio.sfx('smash'); s.flash('#ff2bd6', 0.3, 0.8); s.shake(0.9); s.speedLines(1.5, '#00f0c8');
  V.group.updateMatrixWorld(true);
  const shards = shatter(V.tok.group, 8, Math.random, 0xff7ad9); V.group.visible = false;
  const pieces = shards.map((g) => s.makePiece(g, { restitution: 0.4 }));
  const c = victimCentre(s);
  pieces.forEach((pc) => { const d = pc.group.position.clone().sub(c); d.y += 0.15; if (d.lengthSq() < 0.001) d.set(0, 1, 0); d.normalize(); const m = s.massOf(pc); s.impulse(pc, new V3(d.x * 6 + s.dirOut.x * 3, d.y * 5 + 4, d.z * 6 + s.dirOut.z * 3).multiplyScalar(m)); s.spin(pc, new V3(Math.random() * 16 - 8, Math.random() * 16 - 8, Math.random() * 16 - 8)); });
  for (let i = 0; i < 40; i++) s.fx.emit({ p: c, n: 1, v: [0, 2, 0], vr: [5, 4, 5], life: 0.9, size: 0.14, size1: 0.14, color: i % 2 ? 0xff2bd6 : 0x00f0c8, alpha: 1, alpha1: 0, frame: SPRITE.SQUARE, add: true, g: -3, essential: true });
  s.slow(0.02); await s.wait(0.006 * 60 * 0.6 + 0.3); // time-stop: shards hang in the air for a beat
  s.g.slowmo = 0.5; audio.sfx('boom');
  const f = s.follow(pieces[0], 2.0, 5.5, 34); await s.wait(0.8); s.slow(1);
  s.kickOff(pieces.slice(0, 3), 0.7, 0.3);
  await Promise.all([f, s.settle(4)]);
}

export const FINISHERS = { katana, shuriken, spirit, hammer, rocket, uppercut, laser, orbital, glitch };
