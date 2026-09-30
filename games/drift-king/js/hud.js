// DOM HUD: speedometer, position, laps, minimap, speed lines, toasts, countdown, screens.
import { clamp, fmtTime, ordinal, lerp } from './util.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor(track, colors) {
    this.track = track;
    this.colors = colors; // per racer index
    this.el = {
      hud: $('hud'), posNum: $('posNum'), posSuf: $('posSuf'), posTotal: $('posTotal'),
      lapNum: $('lapNum'), lapTotal: $('lapTotal'), tCur: $('tCur'), tLast: $('tLast'), tBest: $('tBest'),
      speedNum: $('speedNum'), gear: $('gear'), boostBar: $('boostBar'), boostFill: $('boostFill'),
      toast: $('toast'), countdown: $('countdown'), wrong: $('wrong'), driftBox: $('driftBox'), driftTime: $('driftTime'), driftBonus: $('driftBonus'),
      vignette: $('vignette'), flash: $('flash'), hint: $('hint'), muteInd: $('muteInd'),
    };
    this.gauge = $('gauge'); this.gctx = this.gauge.getContext('2d');
    this.mini = $('minimap'); this.mctx = this.mini.getContext('2d');
    this.sl = $('speedlines'); this.slctx = this.sl.getContext('2d');
    this.lines = Array.from({ length: 70 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), s: 0.6 + Math.random() * 0.8, l: 0.4 + Math.random() * 0.6 }));
    this.last = {};
    this.toastTimer = 0;
    this.buildMinimap();
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    for (const c of [this.gauge, this.mini]) {
      const r = c.getBoundingClientRect();
      const w = Math.max(64, Math.round(r.width * dpr)), h = Math.max(64, Math.round(r.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    }
    this.sl.width = Math.round(innerWidth * Math.min(devicePixelRatio || 1, 1.5));
    this.sl.height = Math.round(innerHeight * Math.min(devicePixelRatio || 1, 1.5));
    this.buildMinimap();
  }

  show(v) { this.el.hud.classList.toggle('hidden', !v); }
  showHint() { this.el.hint.classList.add('show'); setTimeout(() => this.el.hint.classList.remove('show'), 9000); }

  // ---- minimap
  buildMinimap() {
    const { pts, N, bounds: b } = this.track;
    const W = this.mini.width, H = this.mini.height, pad = W * 0.09;
    const sx = (W - pad * 2) / (b.maxX - b.minX), sz = (H - pad * 2) / (b.maxZ - b.minZ);
    const s = Math.min(sx, sz);
    const ox = (W - (b.maxX - b.minX) * s) / 2, oz = (H - (b.maxZ - b.minZ) * s) / 2;
    this.mm = { s, ox, oz, b };
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    g.lineJoin = 'round'; g.lineCap = 'round';
    const path = () => {
      g.beginPath();
      let pen = false;
      for (let i = 0; i <= N; i++) {
        const p = pts[i % N];
        if (!p.hasRoad) { pen = false; continue; }
        const x = this.mx(p.x), y = this.mz(p.z);
        if (!pen) { g.moveTo(x, y); pen = true; } else g.lineTo(x, y);
      }
    };
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = W * 0.055; path(); g.stroke();
    g.strokeStyle = 'rgba(255,220,170,0.95)'; g.lineWidth = W * 0.03; path(); g.stroke();
    g.strokeStyle = '#3a2f4a'; g.lineWidth = W * 0.018; path(); g.stroke();
    // start line
    const p0 = pts[0], nx = -p0.fz, nz = p0.fx;
    g.strokeStyle = '#fff'; g.lineWidth = W * 0.014;
    g.beginPath(); g.moveTo(this.mx(p0.x - nx * 11), this.mz(p0.z - nz * 11)); g.lineTo(this.mx(p0.x + nx * 11), this.mz(p0.z + nz * 11)); g.stroke();
    // jump marker
    const jp = pts[Math.round((this.track.gapStart + this.track.gapEnd) / 2)];
    g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(this.mx(jp.x), this.mz(jp.z), W * 0.028, 0, 6.3); g.fill();
    g.fillStyle = '#111'; g.font = `900 ${W * 0.05}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('J', this.mx(jp.x), this.mz(jp.z) + 1);
    this.mmBase = c;
  }
  mx(x) { return this.mm.ox + (x - this.mm.b.minX) * this.mm.s; }
  mz(z) { return this.mm.oz + (z - this.mm.b.minZ) * this.mm.s; }

  drawMinimap(racers, player) {
    const g = this.mctx, W = this.mini.width, H = this.mini.height;
    g.clearRect(0, 0, W, H);
    g.drawImage(this.mmBase, 0, 0, W, H);
    // draw the player last so it's on top
    const order = racers.filter((r) => r !== player).concat(player ? [player] : []);
    for (const r of order) {
      const x = this.mx(r.car.pos.x), y = this.mz(r.car.pos.z);
      const me = r === player;
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x, y, W * (me ? 0.052 : 0.04), 0, 6.3); g.fill();
      g.fillStyle = r.color; g.beginPath(); g.arc(x, y, W * (me ? 0.042 : 0.03), 0, 6.3); g.fill();
      if (me) {
        const a = Math.atan2(r.car.fwd.x, r.car.fwd.z);
        g.fillStyle = '#fff';
        g.beginPath();
        g.moveTo(x + Math.sin(a) * W * 0.075, y + Math.cos(a) * W * 0.075);
        g.lineTo(x + Math.sin(a + 2.5) * W * 0.04, y + Math.cos(a + 2.5) * W * 0.04);
        g.lineTo(x + Math.sin(a - 2.5) * W * 0.04, y + Math.cos(a - 2.5) * W * 0.04);
        g.fill();
      }
    }
  }

  // ---- speedometer
  drawGauge(kmh, boostE, boosting) {
    const g = this.gctx, W = this.gauge.width, H = this.gauge.height, cx = W / 2, cy = H / 2;
    g.clearRect(0, 0, W, H);
    const R = W * 0.46, a0 = Math.PI * 0.75, sweep = Math.PI * 1.5, MAX = 300;
    // plate
    const grd = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.05);
    grd.addColorStop(0, 'rgba(20,12,34,0.72)'); grd.addColorStop(1, 'rgba(20,12,34,0.35)');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, R * 1.04, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(255,210,140,0.3)'; g.lineWidth = W * 0.006; g.beginPath(); g.arc(cx, cy, R * 1.04, 0, 6.3); g.stroke();
    // track
    g.lineCap = 'butt';
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = W * 0.05;
    g.beginPath(); g.arc(cx, cy, R * 0.9, a0, a0 + sweep); g.stroke();
    // fill
    const f = clamp(kmh / MAX, 0, 1);
    if (f > 0.002) {
      const gr = g.createConicGradient ? g.createConicGradient(a0, cx, cy) : null;
      if (gr) {
        gr.addColorStop(0, '#39d0ff'); gr.addColorStop(0.35, '#ffe14a'); gr.addColorStop(0.62, '#ff8a2f'); gr.addColorStop(0.75, '#ff3b30'); gr.addColorStop(1, '#ff3b30');
        g.strokeStyle = gr;
      } else g.strokeStyle = '#ff9a2f';
      g.lineWidth = W * 0.05;
      g.shadowColor = 'rgba(255,140,40,0.7)'; g.shadowBlur = W * 0.03;
      g.beginPath(); g.arc(cx, cy, R * 0.9, a0, a0 + sweep * f); g.stroke();
      g.shadowBlur = 0;
    }
    // ticks
    g.lineWidth = W * 0.008;
    for (let v = 0; v <= MAX; v += 20) {
      const a = a0 + (v / MAX) * sweep, major = v % 60 === 0;
      const r1 = R * (major ? 0.72 : 0.78), r2 = R * 0.83;
      g.strokeStyle = major ? 'rgba(255,240,220,0.9)' : 'rgba(255,240,220,0.4)';
      g.beginPath(); g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2); g.stroke();
      if (major) {
        g.fillStyle = 'rgba(255,240,220,0.75)'; g.font = `800 italic ${W * 0.045}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(String(v), cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62);
      }
    }
    // needle
    const na = a0 + f * sweep;
    g.strokeStyle = '#fff'; g.lineWidth = W * 0.014; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + Math.cos(na) * R * 0.5, cy + Math.sin(na) * R * 0.5); g.lineTo(cx + Math.cos(na) * R * 0.98, cy + Math.sin(na) * R * 0.98); g.stroke();
    // boost arc
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = W * 0.016;
    g.beginPath(); g.arc(cx, cy, R * 0.98 + W * 0.012, a0, a0 + sweep); g.stroke();
    if (boostE > 0.005) {
      g.strokeStyle = boosting || boostE > 0.995 ? '#9fe8ff' : '#ffb347'; g.lineWidth = W * 0.016;
      g.shadowColor = boosting ? 'rgba(120,220,255,1)' : 'rgba(255,170,60,0.8)'; g.shadowBlur = W * 0.02;
      g.beginPath(); g.arc(cx, cy, R * 0.98 + W * 0.012, a0, a0 + sweep * boostE); g.stroke(); g.shadowBlur = 0;
    }
  }

  // ---- speed lines overlay
  drawSpeedLines(intensity, boost, dt, t) {
    const g = this.slctx, W = this.sl.width, H = this.sl.height;
    g.clearRect(0, 0, W, H);
    if (intensity < 0.02) return;
    const cx = W / 2, cy = H * 0.52, maxR = Math.hypot(W, H) * 0.56;
    g.lineCap = 'round';
    for (const l of this.lines) {
      l.r += dt * (0.5 + intensity * 2.6 + boost * 2.5) * l.s;
      if (l.r > 1) { l.r = Math.random() * 0.15; l.a = Math.random() * Math.PI * 2; l.s = 0.6 + Math.random() * 0.8; l.l = 0.4 + Math.random() * 0.6; }
      const r0 = maxR * (0.36 + l.r * 0.64);
      const len = maxR * 0.06 * (0.5 + intensity * 2 + boost * 3) * l.l * (0.3 + l.r);
      const ca = Math.cos(l.a), sa = Math.sin(l.a);
      const alpha = clamp(intensity * 0.55 + boost * 0.4, 0, 0.75) * Math.min(1, l.r * 3) * (1 - l.r * 0.4);
      g.strokeStyle = boost > 0.1 ? `rgba(190,235,255,${alpha})` : `rgba(255,236,210,${alpha})`;
      g.lineWidth = (1 + l.l * 2.2 + boost * 1.5) * (W / 1400 + 0.4);
      g.beginPath(); g.moveTo(cx + ca * r0, cy + sa * r0 * 0.85); g.lineTo(cx + ca * (r0 + len), cy + sa * (r0 + len) * 0.85); g.stroke();
    }
  }

  // ---- text bits
  setPosition(pos, total) {
    if (this.last.pos !== pos) {
      const o = ordinal(pos);
      this.el.posNum.textContent = pos; this.el.posSuf.textContent = o.slice(String(pos).length).toUpperCase();
      this.el.posNum.classList.toggle('first', pos === 1);
      this.last.pos = pos;
    }
    if (this.last.total !== total) { this.el.posTotal.textContent = total; this.last.total = total; }
  }
  setLap(lap, total) {
    if (this.last.lap !== lap) { this.el.lapNum.textContent = lap; this.last.lap = lap; }
    if (this.last.ltotal !== total) { this.el.lapTotal.textContent = total; this.last.ltotal = total; }
  }
  setTimes(cur, last, best) {
    const c = fmtTime(cur);
    if (this.last.cur !== c) { this.el.tCur.textContent = c; this.last.cur = c; }
    const l = fmtTime(last);
    if (this.last.tl !== l) { this.el.tLast.textContent = l; this.last.tl = l; }
    const b = fmtTime(best);
    if (this.last.tb !== b) { this.el.tBest.textContent = b; this.last.tb = b; }
  }
  setSpeed(kmh, gear, boostE, boosting) {
    const s = Math.round(kmh);
    if (this.last.spd !== s) { this.el.speedNum.textContent = s; this.last.spd = s; }
    const g = gear;
    if (this.last.gear !== g) { this.el.gear.textContent = g; this.last.gear = g; }
    const w = Math.round(boostE * 100);
    if (this.last.bw !== w) { this.el.boostFill.style.width = w + '%'; this.last.bw = w; }
    this.el.boostBar.classList.toggle('full', boostE > 0.995 && !boosting);
    this.el.boostBar.classList.toggle('active', boosting);
    this.drawGauge(kmh, boostE, boosting);
  }
  setDrift(active, time, bonus) {
    this.el.driftBox.classList.toggle('hidden', !active);
    if (active) {
      this.el.driftTime.textContent = time.toFixed(1) + 's';
      this.el.driftBonus.textContent = bonus > 0 ? '+' + Math.round(bonus * 100) + '% BOOST' : '';
    }
  }
  setBoostFx(b) {
    this.el.vignette.style.opacity = String(clamp(b, 0, 1));
  }
  wrongWay(v) { this.el.wrong.classList.toggle('hidden', !v); }
  toast(msg, kind = '') {
    const t = this.el.toast;
    t.className = '';
    void t.offsetWidth;
    t.textContent = msg;
    t.className = 'show ' + kind;
  }
  countdown(text, go = false) {
    const c = this.el.countdown;
    c.className = '';
    void c.offsetWidth;
    c.textContent = text;
    c.className = 'pop' + (go ? ' go' : '');
  }
  flash(a = 0.5) {
    const f = this.el.flash; f.style.transition = 'none'; f.style.opacity = String(a);
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.5s ease-out'; f.style.opacity = '0'; });
  }
  mute(m) { this.el.muteInd.classList.toggle('hidden', !m); }
}

export function setSeg(seg, attr, value) {
  seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset[attr] === value));
}
export function fillResults(rows, meIdx) {
  const tb = document.querySelector('#resTable tbody');
  tb.innerHTML = '';
  rows.forEach((r, i) => {
    const tr = document.createElement('tr');
    if (r.me) tr.className = 'me';
    tr.innerHTML = `<td>${i + 1}</td><td><span class="dot" style="background:${r.color}"></span>${r.name}</td><td>${r.time}</td><td>${r.best}</td>`;
    tb.appendChild(tr);
  });
}
