// Race bookkeeping: progress along the track, laps, positions, respawn points.
import { ROAD_HW, EDGE } from './track.js';

export const TOTAL_LAPS = 3;

export class Racer {
  constructor(car, name, color, isPlayer = false) {
    this.car = car;
    this.name = name;
    this.color = color;
    this.isPlayer = isPlayer;
    this.idx = 0; // nearest centreline sample
    this.dist = 0; // unwrapped distance along the track (m). negative before the line
    this.lap = 0; // completed laps
    this.lapStart = 0; // race time when the current lap started
    this.lapTimes = [];
    this.bestLap = Infinity;
    this.finished = false;
    this.finishTime = 0;
    this.position = 1;
    this.lateral = 0;
    this.offTrack = 0; // seconds spent far from the road
    this.safe = null; // last safe respawn {idx}
    this.safeTimer = 0;
    this.stuck = 0;
    this.newBest = false;
    this.lapJustDone = null;
  }
}

export class Race {
  constructor(track) {
    this.track = track;
    this.racers = [];
    this.time = 0;
    this.started = false;
    this.playerFinished = false;
  }

  add(racer, startDist) {
    racer.dist = startDist; // negative: behind the line
    racer.idx = ((Math.round(startDist / this.track.spacing) % this.track.N) + this.track.N) % this.track.N;
    racer.lap = 0;
    racer.safe = { idx: racer.idx };
    this.racers.push(racer);
  }

  begin() {
    this.time = 0;
    this.started = true;
    for (const r of this.racers) r.lapStart = 0;
  }

  update(dt) {
    const { track } = this;
    const N = track.N, L = track.L;
    if (this.started) this.time += dt;
    for (const r of this.racers) {
      const c = r.car;
      const near = track.nearest(c.pos.x, c.pos.z, r.idx, 40);
      let ni = near.i;
      let di = ni - r.idx;
      if (di > N / 2) di -= N; else if (di < -N / 2) di += N;
      r.idx = ni;
      if (!r.finished || true) r.dist += di * track.spacing;
      r.lateral = track.lateral(c.pos.x, c.pos.z, ni);
      r.distToLine = near.d;
      // laps
      const laps = Math.floor(r.dist / L);
      if (r.dist >= 0 && laps > r.lap && !r.finished) {
        const lapTime = this.time - r.lapStart;
        r.lapStart = this.time;
        r.lapTimes.push(lapTime);
        r.lapJustDone = { lap: r.lap + 1, time: lapTime };
        r.newBest = false;
        if (lapTime < r.bestLap) { r.bestLap = lapTime; r.newBest = true; }
        r.lap = laps;
        if (r.lap >= TOTAL_LAPS) {
          r.finished = true;
          r.finishTime = this.time;
          if (r.isPlayer) this.playerFinished = true;
        }
      }
      // safe respawn point: on the road, wheels down, upright, not in the jump gap
      const onRoad = near.d < ROAD_HW + 1 && c.grounded >= 3 && c.upDot > 0.7 && track.pts[ni].hasRoad;
      if (onRoad) {
        r.safeTimer += dt;
        if (r.safeTimer > 0.6) { r.safe = { idx: ni }; r.safeTimer = 0; }
      } else r.safeTimer = 0;
      // off track / fallen in the pit / stuck upside down
      const roadY = track.pts[ni].y;
      const fell = c.pos.y < roadY - 6;
      const far = near.d > EDGE + 22;
      if (fell || far) r.offTrack += dt; else r.offTrack = Math.max(0, r.offTrack - dt);
      const slow = c.speedFlat < 1.5 && (c.upDot < 0.25 || (r.isPlayer ? false : true));
      if (slow && this.started) r.stuck += dt; else r.stuck = 0;
    }
    // positions
    const order = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.dist - a.dist;
    });
    order.forEach((r, i) => (r.position = i + 1));
    this.order = order;
  }

  // Where to put a racer that needs a reset: {x,y,z,yaw}
  respawnPose(r) {
    const p = this.track.idx(r.safe.idx - 2);
    return { x: p.x, y: p.y + 1.1, z: p.z, yaw: Math.atan2(p.fx, p.fz) };
  }
}
