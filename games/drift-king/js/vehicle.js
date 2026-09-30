// Arcade raycast vehicle built on Rapier's DynamicRayCastVehicleController.
// Rapier handles the chassis rigid body, wheel raycasts and the suspension springs/dampers.
// Tyre forces (drive, brake, lateral grip, drift) are applied here through a simple
// friction-circle tyre model, driven by each wheel's real suspension load. That gives real
// weight transfer, body roll and pitch while keeping full control over the arcade feel.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, damp, wrapAngle } from './util.js';

// Interaction groups: membership (high 16 bits) | filter (low 16 bits)
export const G = {
  GROUND: 0x0001, CAR: 0x0002, PROP: 0x0004, WALL: 0x0008, DEBRIS: 0x0010,
};
export const grp = (member, filter = 0xffff) => ((member << 16) | filter) >>> 0;
// Wheel rays only see the ground (road + terrain).
export const WHEEL_RAY_GROUPS = grp(0xffff, G.GROUND);

export const CAR = {
  mass: 1050,
  halfW: 0.92, halfH: 0.30, halfL: 2.1, centerY: 0.22,
  wheelX: 0.87, wheelFrontZ: 1.38, wheelRearZ: -1.32, hardY: -0.02,
  wheelR: 0.36, rest: 0.34, travel: 0.22,
  stiffness: 30, compression: 3.4, relaxation: 4.6,
  // handling
  a0: 12.5, topSpeed: 76, boostTop: 1.2, boostAccel: 14, brakeDecel: 26,
  muFront: 1.3, muRear: 1.25, muLong: 1.9, alphaPeak: 0.1, fallC: 1.3,
  yawKp: 6, yawMax: 6, betaMax: 0.55, driftK: 4.5, yawRef: 16, yawLow: 1.9,
  rollLift: 0.42, rollStab: 45, // tyre forces are applied this far above the ground: less body roll (arcade)
};

const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3(), _up = new THREE.Vector3(), _right = new THREE.Vector3();
const _n = new THREE.Vector3(), _wf = new THREE.Vector3(), _ws = new THREE.Vector3();
const _pt = new THREE.Vector3(), _v = new THREE.Vector3(), _r = new THREE.Vector3();
const _com = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3();
const _tmp = new THREE.Vector3();

// speed -> gear / rpm (for the engine sound + HUD)
const GEAR_MAX = [15, 28, 41, 54, 70];
export function gearFor(speed, prev) {
  let g = prev;
  if (g < 4 && speed > GEAR_MAX[g] * 0.97) g++;
  else if (g > 0 && speed < GEAR_MAX[g - 1] * 0.72) g--;
  return g;
}

export class Vehicle {
  constructor(RAPIER, world, opts) {
    this.R = RAPIER;
    this.world = world;
    this.name = opts.name || 'car';
    this.isPlayer = !!opts.isPlayer;
    this.input = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false };
    const c = CAR;
    this.cfg = c;

    const desc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(opts.x, opts.y, opts.z)
      .setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opts.yaw || 0))
      .setCcdEnabled(!!opts.isPlayer)
      .setLinearDamping(0.02)
      .setAngularDamping(0.9)
      .setCanSleep(false);
    this.rb = world.createRigidBody(desc);
    const cd = RAPIER.ColliderDesc.roundCuboid(c.halfW - 0.12, c.halfH - 0.12, c.halfL - 0.12, 0.12)
      .setTranslation(0, c.centerY, 0)
      .setMass(c.mass)
      .setFriction(0.05)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(0.15)
      .setCollisionGroups(grp(G.CAR, 0xffff))
      .setActiveEvents(0);
    this.col = world.createCollider(cd, this.rb);

    this.ctl = world.createVehicleController(this.rb);
    this.wheels = [];
    const defs = [
      { x: c.wheelX, z: c.wheelFrontZ, front: true }, // +x is the car's left
      { x: -c.wheelX, z: c.wheelFrontZ, front: true },
      { x: c.wheelX, z: c.wheelRearZ, front: false },
      { x: -c.wheelX, z: c.wheelRearZ, front: false },
    ];
    defs.forEach((d, i) => {
      this.ctl.addWheel({ x: d.x, y: c.hardY, z: d.z }, { x: 0, y: -1, z: 0 }, { x: -1, y: 0, z: 0 }, c.rest, c.wheelR);
      this.ctl.setWheelMaxSuspensionTravel(i, c.travel);
      this.ctl.setWheelSuspensionStiffness(i, c.stiffness);
      this.ctl.setWheelSuspensionCompression(i, c.compression);
      this.ctl.setWheelSuspensionRelaxation(i, c.relaxation);
      this.ctl.setWheelMaxSuspensionForce(i, 1e6);
      this.ctl.setWheelSideFrictionStiffness(i, 0);
      this.ctl.setWheelFrictionSlip(i, 1e4);
      this.wheels.push({
        ...d, contact: false, load: 0, susp: c.rest, spin: 0, steer: 0, slip: 0, lat: 0, skid: 0,
        point: new THREE.Vector3(), normal: new THREE.Vector3(0, 1, 0), onRoad: true,
      });
    });

    // state exposed to the rest of the game
    this.speed = 0; // signed forward speed m/s
    this.speedKmh = 0;
    this.latSpeed = 0;
    this.slip = 0; // body slip angle rad (abs)
    this.slipSigned = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.grounded = 0;
    this.airTime = 0;
    this.gear = 0;
    this.rpm = 1000;
    this.shiftTimer = 0;
    this.boostEnergy = 0.0;
    this.boosting = false;
    this.boostBlend = 0;
    this.steerAngle = 0;
    this.steerIn = 0;
    this.upDot = 1;
    this.lastVel = new THREE.Vector3();
    this.impact = 0; // impact magnitude this step (m/s of delta-v)
    this.landed = 0; // landing magnitude this step
    this.scrape = 0;
    this.scrapePoint = new THREE.Vector3();
    this.pos = new THREE.Vector3(opts.x, opts.y, opts.z);
    this.quat = new THREE.Quaternion();
    this.prevPos = this.pos.clone();
    this.prevQuat = this.quat.clone();
    this.fwd = new THREE.Vector3(0, 0, 1);
    this.right = new THREE.Vector3(1, 0, 0);
    this.up = new THREE.Vector3(0, 1, 0);
    this.vel = new THREE.Vector3();
    this.frozen = false;
    this.throttleApplied = 0;
    this.brakeApplied = 0;
    this.rearGrip = 1;
    this.psiVPrev = 0; this.omegaV = 0; this.driftAmt = 0;
    this.visYaw = 0; this.accLong = 0; this.groundPoint = new THREE.Vector3(); this.prevSpeedForAcc = 0;
    this.wasHandbrake = false;
    this.forceSpeedCap = 0;
    this.readState(0);
  }

  // Place / reset the car (used for spawn and R-reset)
  place(x, y, z, yaw) {
    this.rb.setTranslation({ x, y, z }, true);
    _q.setFromAxisAngle(_up.set(0, 1, 0), yaw);
    this.rb.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.rb.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.rb.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steerAngle = 0; this.steerIn = 0;
    this.airTime = 0;
    this.readState(0);
    this.prevPos.copy(this.pos); this.prevQuat.copy(this.quat);
    this.lastVel.set(0, 0, 0);
    this.boosting = false;
  }

  readState(dt) {
    const t = this.rb.translation(), q = this.rb.rotation(), lv = this.rb.linvel();
    this.pos.set(t.x, t.y, t.z);
    this.quat.set(q.x, q.y, q.z, q.w);
    this.vel.set(lv.x, lv.y, lv.z);
    this.fwd.set(0, 0, 1).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
    this.right.set(-1, 0, 0).applyQuaternion(this.quat);
    this.upDot = this.up.y;
  }

  savePrev() {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    for (const w of this.wheels) w.prevSusp = w.susp;
  }

  get speedFlat() { return Math.hypot(this.vel.x, this.vel.z); }

  // One fixed physics step. Call BEFORE world.step().
  step(dt) {
    const c = this.cfg, rb = this.rb, inp = this.input;
    this.readState(dt);
    this.steerIn = inp.steer;
    const vel = this.vel;
    const vf = vel.dot(this.fwd);
    const vl = vel.dot(this.right);
    this.speed = vf;
    this.latSpeed = vl;
    this.speedKmh = Math.abs(vf) * 3.6;
    const sp = vel.length();

    // impact / landing detection from the velocity change of the last step
    _tmp.copy(vel).sub(this.lastVel);
    _tmp.y += 9.81 * dt; // remove gravity contribution
    const dv = _tmp.length();
    this.impact = 0; this.landed = 0;

    // --- suspension update (Rapier)
    let steerTarget = 0;
    const maxSteer = this.maxSteerAngle(Math.abs(vf));
    // keyboard-like smoothing is done in the input layer; here follow with rate limiting
    const rate = 5.5 + 3 * (1 - smoothstep(0, 40, Math.abs(vf)));
    steerTarget = inp.steer * maxSteer;
    this.steerAngle += clamp(steerTarget - this.steerAngle, -rate * dt * 0.6, rate * dt * 0.6);
    for (let i = 0; i < 2; i++) this.ctl.setWheelSteering(i, this.steerAngle);
    this.ctl.updateVehicle(dt, undefined, WHEEL_RAY_GROUPS);

    // --- gather wheel contacts
    let grounded = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.contact = this.ctl.wheelIsInContact(i);
      w.susp = this.ctl.wheelSuspensionLength(i) ?? c.rest;
      if (w.contact) {
        grounded++;
        const p = this.ctl.wheelContactPoint(i), n = this.ctl.wheelContactNormal(i);
        w.point.set(p.x, p.y, p.z);
        w.normal.set(n.x, n.y, n.z).normalize();
        w.load = Math.max(0, this.ctl.wheelSuspensionForce(i) ?? 0)
        const go = this.ctl.wheelGroundObject(i);
        w.onRoad = true;
      } else {
        w.load = 0;
      }
    }
    this.grounded = grounded;
    if (grounded === 0) this.airTime += dt;
    else {
      if (this.airTime > 0.25) this.landed = Math.max(0, dv);
      this.airTime = 0;
    }
    if (dv > 3.2 && grounded > 0 && this.airTime === 0 && this.landed === 0) this.impact = dv;
    else if (dv > 3.2 && grounded === 0) this.impact = dv;

    // --- drive / brake targets (per car)
    const gearNow = gearFor(Math.abs(vf), this.gear);
    if (gearNow > this.gear) this.shiftTimer = 0.14;
    this.gear = gearNow;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;

    // boost
    const wantBoost = inp.boost && this.boostEnergy > 0.02 && !this.frozen;
    this.boosting = wantBoost;
    if (this.boosting) this.boostEnergy = Math.max(0, this.boostEnergy - dt * 0.4);
    this.boostBlend = damp(this.boostBlend, this.boosting ? 1 : 0, this.boosting ? 9 : 3, dt);

    const topSpeed = c.topSpeed * (1 + (c.boostTop - 1) * this.boostBlend);
    let throttle = this.frozen ? 0 : inp.throttle;
    let brake = this.frozen ? 0 : inp.brake;
    let driveA = 0, brakeA = 0;
    if (throttle > 0.01) {
      const ratio = clamp(vf / topSpeed, 0, 1);
      driveA = c.a0 * throttle * (1 - Math.pow(ratio, 2.2)) * (this.shiftTimer > 0 ? 0.35 : 1);
      if (vf < -0.5) brakeA = c.brakeDecel; // throttle while rolling backwards = brake
    }
    if (this.boosting) driveA += c.boostAccel * (1 - clamp(vf / topSpeed, 0, 1) ** 3);
    if (brake > 0.01) {
      if (vf > 1.0) brakeA = Math.max(brakeA, c.brakeDecel * brake);
      else {
        // reverse
        const ratio = clamp(-vf / 16, 0, 1);
        driveA = -9 * brake * (1 - ratio * ratio);
      }
    }
    if (this.frozen) brakeA = c.brakeDecel * 1.2;
    const hand = inp.handbrake && !this.frozen;
    this.handbrake = hand;

    // --- tyre forces
    const meffW = c.mass / 4;
    
    const com = rb.worldCom();
    _com.set(com.x, com.y, com.z);
    const av = rb.angvel();
    let totalLatLoad = 0, slipAcc = 0;
    // rear grip modifiers
    let rearMu = c.muRear;
    const hardTurn = Math.abs(this.steerIn);
    if (hand) rearMu *= 0.3;
    else if (sp > 26 && hardTurn > 0.8 && throttle > 0.4) rearMu *= 0.66; // hard cornering breaks the rear loose
    rearMu *= 1 - 0.35 * this.driftAmt;
    this.rearGrip = damp(this.rearGrip, rearMu / c.muRear, 14, dt);
    rearMu = c.muRear * this.rearGrip;

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      w.skid = 0;
      if (!w.contact || w.load <= 0) { w.spin += (vf / c.wheelR) * dt; continue; }
      const front = w.front;
      // wheel forward dir on the contact plane
      const ang = front ? this.steerAngle : 0;
      _wf.copy(this.fwd).multiplyScalar(Math.cos(ang)).addScaledVector(this.right, Math.sin(ang));
      _n.copy(w.normal);
      _wf.addScaledVector(_n, -_wf.dot(_n)).normalize();
      _ws.crossVectors(_wf, _n); // points to the car's right
      // velocity at the contact point
      _r.copy(w.point).sub(_com);
      _v.set(av.y * _r.z - av.z * _r.y, av.z * _r.x - av.x * _r.z, av.x * _r.y - av.y * _r.x).add(vel);
      const vlong = _v.dot(_wf), vlat = _v.dot(_ws);
      const N = w.load;
      const mu = front ? c.muFront : rearMu;

      // longitudinal request
      let Fx = 0;
      if (!front) Fx += (driveA * c.mass) / 2;
      if (brakeA > 0) {
        const share = front ? 0.62 : 0.38;
        const Fb = brakeA * c.mass * share / 2;
        const dirB = vlong > 0 ? -1 : 1;
        Fx += dirB * Math.min(Fb, (meffW * Math.abs(vlong) / dt) * 0.9);
      }
      if (hand && !front) {
        const dirB = vlong > 0 ? -1 : 1;
        Fx += dirB * Math.min(c.mass * 5.5 / 2, (meffW * Math.abs(vlong) / dt) * 0.9);
      }
      // engine braking + rolling resistance + parking hold
      if (driveA === 0 && brakeA === 0 && !hand) {
        const dirB = vlong > 0 ? -1 : 1;
        const hold = Math.abs(vlong) < 1.2 ? 1 : 0;
        Fx += dirB * Math.min(c.mass * (1.1 + 5 * hold) / 4, (meffW * Math.abs(vlong) / dt) * 0.9);
      }
      const FxMax = c.muLong * N;
      Fx = clamp(Fx, -FxMax, FxMax);

      // lateral (slip based, saturating)
      const den = Math.max(Math.abs(vlong), 3.0);
      const a = vlat / den;
      let avail = mu * N * Math.sqrt(Math.max(0.2, 1 - 0.55 * (Fx / FxMax) ** 2));
      const sat = Math.sin(c.fallC * Math.atan(a / c.alphaPeak));
      let Fy = -avail * sat;
      const maxJ = meffW * Math.abs(vlat) * 0.85;
      Fy = clamp(Fy, -maxJ / dt, maxJ / dt);

      // apply at a point lifted above the ground (reduces roll leverage)
      _pt.copy(w.point).addScaledVector(_n, c.rollLift);
      _f.copy(_wf).multiplyScalar(Fx).addScaledVector(_ws, Fy).multiplyScalar(dt);
      rb.applyImpulseAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _pt.x, y: _pt.y, z: _pt.z }, true);

      w.lat = vlat;
      w.slip = Math.abs(a);
      const satF = Math.abs(a) / (c.alphaPeak * 2.2);
      w.skid = Math.max(clamp((satF - 0.55) / 0.45, 0, 1) * clamp(Math.abs(vlat) / 2.2, 0, 1),
        hand && !front ? clamp(Math.abs(vlong) / 10, 0, 1) * 0.8 : 0,
        Math.abs(Fx) > 0.96 * FxMax && Math.abs(vlong) < 22 ? 0.5 : 0);
      w.spin += (vlong / c.wheelR) * dt;
      slipAcc += Math.abs(a);
    }

    // --- body forces: aero drag, downforce, air control
    const dragK = 0.00028 * c.mass;
    if (sp > 0.1) {
      const drag = dragK * sp * sp;
      rb.applyImpulse({ x: (-vel.x / sp) * drag * dt, y: (-vel.y / sp) * drag * dt * 0.3, z: (-vel.z / sp) * drag * dt }, true);
    }
    const dfk = 0.0016 * c.mass;
    if (grounded > 0) {
      const down = dfk * sp * sp * dt;
      rb.applyImpulse({ x: -this.up.x * down, y: -this.up.y * down, z: -this.up.z * down }, true);
    } else {
      // in the air: settle roll a little and damp spin so jumps land wheels-first most of the time
      const level = 1.4;
      _tmp.crossVectors(this.up, _w.set(0, 1, 0)); // axis that rotates up -> world up
      const I = c.mass * 0.6;
      rb.applyTorqueImpulse({ x: _tmp.x * level * I * dt, y: 0, z: _tmp.z * level * I * dt }, true);
      rb.applyTorqueImpulse({ x: -av.x * 0.5 * I * dt, y: -av.y * 0.6 * I * dt, z: -av.z * 0.5 * I * dt }, true);
    }

    // --- yaw-rate assist: the driver commands a turn rate; once the tail steps out the assist
    // instead holds a slip (drift) angle set by the steering input, so drifts are stable and fun.
    const flat = Math.hypot(vf, vl);
    const betaRaw = vf > 1 && flat > 6 ? -Math.atan2(vl, vf) : 0; // + = velocity is to the left of heading
    const psiV = Math.atan2(vel.x, vel.z);
    const omegaVraw = clamp(wrapAngle(psiV - this.psiVPrev) / dt, -3, 3);
    this.psiVPrev = psiV;
    this.omegaV = damp(this.omegaV, omegaVraw, 30, dt);
    if (grounded >= 2 && !this.frozen) {
      const av2 = rb.angvel();
      const yawRate = av2.x * this.up.x + av2.y * this.up.y + av2.z * this.up.z;
      const vAbs = Math.max(Math.abs(vf), 0.5);
      const omegaMax = Math.min(vAbs / 5.5, c.yawRef / vAbs);
      const dirSign = vf >= -1 ? 1 : -1;
      const sIn = this.steerIn;
      const wA = -sIn * omegaMax * dirSign * smoothstep(1, 5, vAbs);
      const dAmt = vf > 1 ? (hand && flat > 10 ? 1 : smoothstep(0.17, 0.32, Math.abs(betaRaw))) : 0;
      const wB = this.omegaV + c.driftK * (betaRaw - sIn * c.betaMax);
      const wt = lerp(wA, clamp(wB, -2.6, 2.6), dAmt);
      this.driftAmt = dAmt;
      const authority = grounded / 4;
      const alpha = clamp((wt - yawRate) * c.yawKp, -c.yawMax, c.yawMax) * authority;
      const Iyaw = c.mass * 1.8;
      rb.applyTorqueImpulse({ x: this.up.x * alpha * Iyaw * dt, y: this.up.y * alpha * Iyaw * dt, z: this.up.z * alpha * Iyaw * dt }, true);
    } else this.driftAmt = 0;

    // --- roll stabiliser (acts like an anti-roll bar; fades out when the car is really tipping over)
    if (grounded >= 2) {
      _n.set(0, 0, 0);
      for (const w of this.wheels) if (w.contact) _n.add(w.normal);
      _n.normalize();
      _tmp.crossVectors(this.up, _n); // rotation that takes up -> ground normal
      const rollErr = _tmp.dot(this.fwd);
      const roll = Math.abs(this.up.dot(this.right));
      const fade = 1 - smoothstep(0.45, 0.7, roll);
      const tq = clamp(rollErr, -0.5, 0.5) * c.rollStab * c.mass * 0.4 * fade * (grounded / 4);
      rb.applyTorqueImpulse({ x: this.fwd.x * tq * dt, y: this.fwd.y * tq * dt, z: this.fwd.z * tq * dt }, true);
    }

    // --- handbrake kick to start a drift
    if (hand && !this.wasHandbrake && sp > 14 && grounded >= 3) {
      const kick = -this.steerIn * 0.65 * sp / 40;
      rb.applyTorqueImpulse({ x: this.up.x * kick * 900, y: this.up.y * kick * 900, z: this.up.z * kick * 900 }, true);
    }
    this.wasHandbrake = hand;

    // --- slip / drift detection
    const slipAng = flat > 6 ? Math.atan2(Math.abs(vl), Math.abs(vf)) : 0;
    this.slip = damp(this.slip, slipAng, 20, dt);
    this.slipSigned = vl > 0 ? this.slip : -this.slip;
    const canDrift = grounded >= 3 && flat > 14 && vf > 0;
    const dNow = canDrift && (this.slip > 0.26 || (hand && this.slip > 0.12));
    this.drifting = dNow;
    if (dNow) {
      this.driftTime += dt;
      const gain = clamp((this.slip - 0.2) / 0.5, 0.25, 1) * clamp(flat / 40, 0.4, 1.2);
      this.boostEnergy = Math.min(1, this.boostEnergy + dt * 0.24 * gain);
    } else if (!canDrift || this.slip < 0.15) {
      this.driftTime = 0;
    }

    // smoothed values used by the visuals / camera
    const avv = rb.angvel();
    this.visYaw = damp(this.visYaw, avv.x * this.up.x + avv.y * this.up.y + avv.z * this.up.z, 10, dt);
    this.accLong = damp(this.accLong, (vf - this.prevSpeedForAcc) / dt, 6, dt);
    this.prevSpeedForAcc = vf;
    this.groundPoint.set(this.pos.x - this.up.x * 0.55, this.pos.y - this.up.y * 0.55, this.pos.z - this.up.z * 0.55);
    for (const w of this.wheels) if (w.contact) { this.groundPoint.set((this.groundPoint.x + w.point.x) * 0.5, w.point.y, (this.groundPoint.z + w.point.z) * 0.5); break; }

    // rpm
    const g = this.gear;
    const lo = g === 0 ? 0 : GEAR_MAX[g - 1] * 0.72, hi = GEAR_MAX[g];
    const gr = clamp((Math.abs(vf) - lo) / (hi - lo), 0, 1);
    const targetRpm = 1300 + gr * 6400 + (throttle > 0.1 ? 350 : 0);
    this.rpm = damp(this.rpm, this.shiftTimer > 0 ? targetRpm - 1500 : targetRpm, 12, dt);

    this.lastVel.copy(vel);
  }

  maxSteerAngle(v) {
    return 0.62 / (1 + Math.pow(v / 13, 1.55));
  }

  // After world.step(): refresh transform for rendering and sanity checks
  post() {
    this.readState(0);
  }

  dispose() {
    this.world.removeVehicleController(this.ctl);
    this.world.removeCollider(this.col, false);
    this.world.removeRigidBody(this.rb);
  }
}
