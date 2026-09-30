// AI drivers: follow a precomputed racing line with a speed profile, make small mistakes,
// avoid each other, and fight back when the player passes them.
import { ROAD_HW, SPACING } from './track.js';
import { clamp, lerp, rng, smoothstep } from './util.js';

export function buildRacingLine(track) {
  const { pts, N } = track;
  const f = new Float32Array(N);
  const K = 170;
  const maxOff = ROAD_HW - 2.6;
  // local smoothed curvature -> inside offset
  const kS = new Float32Array(N);
  const W = 12;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -W; j <= W; j++) s += pts[(i + j + N) % N].k;
    kS[i] = s / (2 * W + 1);
  }
  for (let i = 0; i < N; i++) f[i] = Math.tanh(kS[i] * K);
  const off = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const ahead = f[(i + 26) % N];
    const behind = f[(i - 8 + N) % N];
    // inside at the apex, outside on the way in and on exit
    let o = 0.95 * f[i] - 0.5 * ahead * (1 - Math.abs(f[i])) - 0.25 * behind * (1 - Math.abs(f[i]));
    off[i] = clamp(o, -1, 1) * maxOff;
  }
  // smooth the offsets
  const off2 = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let j = -6; j <= 6; j++) s += off[(i + j + N) % N];
    off2[i] = s / 13;
  }
  // straighten the line through the jump so the car lands centred
  for (let i = track.rampStart - 15; i <= track.gapEnd + 25; i++) {
    const ii = ((i % N) + N) % N;
    const w = smoothstep(track.rampStart - 15, track.rampStart + 5, i) * (1 - smoothstep(track.gapEnd + 5, track.gapEnd + 25, i));
    off2[ii] = lerp(off2[ii], 0, w);
  }
  // effective curvature of the driven line
  const kEff = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 3 + N) % N, b = (i + 3) % N;
    const pa = { x: pts[a].x + pts[a].rx * off2[a], z: pts[a].z + pts[a].rz * off2[a] };
    const pm = { x: pts[i].x + pts[i].rx * off2[i], z: pts[i].z + pts[i].rz * off2[i] };
    const pb = { x: pts[b].x + pts[b].rx * off2[b], z: pts[b].z + pts[b].rz * off2[b] };
    const ax = pm.x - pa.x, az = pm.z - pa.z, bx = pb.x - pm.x, bz = pb.z - pm.z;
    const cross = ax * bz - az * bx;
    const la = Math.hypot(ax, az), lb = Math.hypot(bx, bz), lc = Math.hypot(pb.x - pa.x, pb.z - pa.z);
    kEff[i] = (2 * cross) / (la * lb * lc + 1e-6);
  }
  return { off: off2, kEff };
}

// speed profile for a given lateral acceleration / top speed
export function buildSpeedProfile(track, line, aLat, vTop, aBrake) {
  const { N } = track;
  const v = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const k = Math.abs(line.kEff[i]);
    v[i] = Math.min(vTop, k > 1e-4 ? Math.sqrt(aLat / k) : vTop);
    if (i >= track.rampStart - 20 && i <= track.gapEnd + 10) v[i] = Math.min(v[i], 50);
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let i = N * 2; i >= 0; i--) {
      const a = i % N, b = (i + 1) % N;
      const vmax = Math.sqrt(v[b] * v[b] + 2 * aBrake * SPACING);
      if (v[a] > vmax) v[a] = vmax;
    }
  }
  return v;
}

export class AIDriver {
  constructor(track, line, opts) {
    this.track = track;
    this.line = line;
    this.skill = opts.skill; // 0.9..1.0
    this.name = opts.name;
    this.lane = opts.lane || 0; // lateral bias in metres
    this.rand = rng(opts.seed || 1);
    this.vt = buildSpeedProfile(track, line, 13.2 * this.skill, 64 * this.skill, 15);
    this.steer = 0;
    this.mistake = 0; this.mistakeKind = 0; this.mistakeCooldown = 8 + this.rand() * 10;
    this.revenge = 0;
    this.playerAheadPrev = false;
    this.aggression = opts.aggression ?? 0.5;
    this.offCur = 0;
    this.launch = 0;
  }

  // ctx: { racer, others (Racer[]), player (Racer), racing (bool), time }
  update(dt, ctx) {
    const { racer } = ctx;
    const car = racer.car, track = this.track, N = track.N;
    const pts = track.pts;
    const inp = car.input;
    if (!ctx.racing) { inp.throttle = ctx.revThrottle || 0; inp.brake = 0; inp.handbrake = false; inp.steer = 0; inp.boost = false; return; }
    const speed = Math.max(car.speed, 0);
    const idx = racer.idx;

    // --- mistakes
    this.mistakeCooldown -= dt;
    if (this.mistake > 0) this.mistake -= dt;
    else if (this.mistakeCooldown <= 0) {
      let cornerAhead = 0;
      for (let j = 8; j < 30; j += 2) cornerAhead = Math.max(cornerAhead, Math.abs(this.line.kEff[(idx + j) % N]));
      if (cornerAhead > 0.012 && speed > 22) {
        this.mistake = 0.9 + this.rand() * 0.9;
        this.mistakeKind = this.rand() < 0.6 ? 1 : 2; // 1: brake too late, 2: wobble / lift
        this.mistakeCooldown = (14 + this.rand() * 26) / (1.4 - this.skill * 0.5);
      }
    }

    // --- fight-back logic vs the player
    const player = ctx.player;
    let targetOff = this.line.off[idx] + this.lane;
    let paceScale = 1;
    if (player) {
      const dP = player.dist - racer.dist; // >0: player is ahead
      if (dP > 2 && dP < 40 && !this.playerAheadPrev) this.revenge = 8 + this.aggression * 8; // just got passed
      this.playerAheadPrev = dP > 2 && dP < 40;
      if (this.revenge > 0) {
        this.revenge -= dt;
        paceScale = 1.05;
        if (dP > -4 && dP < 28) {
          // line up on the player's rear quarter / side to bump them
          const want = player.lateral - clamp(dP, 0, 8) * 0.0;
          targetOff = lerp(targetOff, clamp(want, -ROAD_HW + 1.2, ROAD_HW - 1.2), 0.85);
        }
      }
      // rubber band, gently
      if (dP < -160) paceScale *= 0.94; else if (dP > 120) paceScale *= 1.05;
    }
    // --- avoid other cars ahead of us
    for (const o of ctx.others) {
      if (o === racer) continue;
      const d = o.dist - racer.dist;
      if (d > 1.5 && d < 20) {
        const isTarget = this.revenge > 0 && o === player;
        if (isTarget) continue;
        const dl = o.lateral - (racer.lateral);
        if (Math.abs(dl) < 3.0) {
          const side = dl > 0 ? -1 : 1;
          targetOff += side * (3.2 - Math.abs(dl)) * 1.1;
        }
      }
    }
    targetOff = clamp(targetOff, -ROAD_HW + 1.6, ROAD_HW - 1.6);
    this.offCur += clamp(targetOff - this.offCur, -6 * dt, 6 * dt);

    // --- steering: pure pursuit
    const Ld = clamp(5 + speed * 0.5, 7, 40);
    const ti = (idx + Math.round(Ld / SPACING)) % N;
    const tp = pts[ti];
    const offT = lerp(this.line.off[ti] + this.lane, this.offCur, 0.7);
    const tx = tp.x + tp.rx * offT, tz = tp.z + tp.rz * offT;
    const dx = tx - car.pos.x, dz = tz - car.pos.z;
    const fx = car.fwd.x, fz = car.fwd.z, rx = car.right.x, rz = car.right.z;
    const lf = dx * fx + dz * fz, lr = dx * rx + dz * rz;
    const alpha = Math.atan2(lr, Math.max(lf, 0.5));
    const dist = Math.hypot(dx, dz);
    const omegaMax = Math.min(Math.max(speed, 2) / 5.5, car.cfg.yawRef / Math.max(speed, 2));
    let s = (Math.max(speed, 2) * 2 * Math.sin(alpha)) / (Math.max(dist, 3) * omegaMax);
    if (this.mistake > 0 && this.mistakeKind === 2) s += Math.sin(ctx.time * 9) * 0.35;
    const sLim = speed > 26 ? 0.72 : 1;
    s = clamp(s, -sLim, sLim);
    this.steer += clamp(s - this.steer, -4.5 * dt, 4.5 * dt);
    inp.steer = this.steer;

    // --- speed control
    const look = Math.min(N - 1, Math.round(clamp(speed * 0.2, 3, 12)));
    let vTarget = this.vt[(idx + look) % N] * paceScale;
    if (this.mistake > 0 && this.mistakeKind === 1) vTarget *= 1.16;
    if (this.mistake > 0 && this.mistakeKind === 2) vTarget *= 0.85;
    // slow down if steering is far off (off the line / sliding)
    vTarget *= 1 - 0.35 * smoothstep(0.25, 0.9, Math.abs(alpha));
    const err = vTarget - speed;
    inp.throttle = clamp(err * 0.45 + 0.15, 0, 1);
    inp.brake = err < -2.5 ? clamp((-err - 2.5) * 0.12, 0, 1) : 0;
    if (this.mistake > 0 && this.mistakeKind === 1) inp.brake *= 0.25;
    inp.handbrake = false;
    // launch: wheelspin control at the start is not needed, just floor it
    inp.boost = false;
  }
}
