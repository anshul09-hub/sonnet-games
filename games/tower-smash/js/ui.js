// DOM screens: title, level map, HUD, pause, settings, results.
import { AMMO, AMMO_ORDER } from './config.js';
import { LEVELS } from './levels.js';
import { Save } from './save.js';
import { rng } from './textures.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

// positions of the 12 level nodes on the 1000x620 map
const NODES = [[90, 545], [240, 475], [390, 545], [540, 475], [690, 545], [860, 470],
  [870, 330], [730, 275], [580, 335], [430, 275], [270, 300], [340, 120]];

function starPoints(cx, cy, R, r) {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
    p.push(`${(cx + Math.cos(a) * rad).toFixed(1)},${(cy + Math.sin(a) * rad).toFixed(1)}`);
  }
  return p.join(' ');
}

function drawAmmoIcon(canvas, type) {
  const S = 88; canvas.width = S; canvas.height = S;
  const g = canvas.getContext('2d'), cx = S / 2, cy = S / 2 + 2;
  const r = { rock: 26, boulder: 34, cluster: 28, bouncy: 28, bomb: 28 }[type];
  const sphere = (c1, c2, rr = r) => {
    const gr = g.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
    gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rr, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.stroke();
  };
  if (type === 'rock' || type === 'boulder') {
    sphere(type === 'rock' ? '#c9ccd2' : '#9a9da6', type === 'rock' ? '#70747c' : '#4d5058');
    g.fillStyle = 'rgba(40,44,50,.35)';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(cx + Math.cos(i * 2.3) * r * 0.5, cy + Math.sin(i * 1.7) * r * 0.5, 3 + i % 3, 0, 6.3); g.fill(); }
  } else if (type === 'cluster') {
    sphere('#ffd06a', '#d17f10');
    g.strokeStyle = '#4a3a2a'; g.lineWidth = 4;
    for (const dy of [-11, 0, 11]) { g.beginPath(); g.ellipse(cx, cy + dy, Math.sqrt(r * r - dy * dy) * 0.96, 4, 0, 0, 6.3); g.stroke(); }
  } else if (type === 'bouncy') {
    sphere('#ff9fd0', '#d81b7a');
    g.save(); g.beginPath(); g.arc(cx, cy, r - 1, 0, 6.3); g.clip();
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let i = -3; i < 4; i += 2) g.fillRect(cx + i * 8 - 4, cy - r, 8, r * 2);
    g.restore();
    g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, 6.3); g.stroke();
  } else if (type === 'bomb') {
    sphere('#5b5e69', '#15161a');
    g.strokeStyle = '#d8c9a0'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx + 4, cy - r + 2); g.quadraticCurveTo(cx + 14, cy - r - 12, cx + 22, cy - r - 8); g.stroke();
    g.fillStyle = '#ffb030'; g.beginPath(); g.arc(cx + 23, cy - r - 9, 6, 0, 6.3); g.fill();
    g.fillStyle = '#fff3a0'; g.beginPath(); g.arc(cx + 23, cy - r - 9, 3, 0, 6.3); g.fill();
    g.strokeStyle = '#e02a30'; g.lineWidth = 4; g.beginPath(); g.ellipse(cx, cy, r - 2, 7, 0, 0, 6.3); g.stroke();
  }
}

export class UI {
  constructor() {
    this.screens = ['loader', 'title', 'levels', 'hud', 'pause', 'settings', 'complete', 'fail', 'error'];
    this.trayKey = '';
    this.settingsFrom = 'title';
    this.levelsFrom = 'title';
    this.timers = [];
    this.aim = $('aim'); this.actx = this.aim.getContext('2d');
    window.addEventListener('resize', () => this.resizeAim());
    this.resizeAim();
  }

  attach({ game, audio, gfx, fx, arena }) {
    Object.assign(this, { game, audio, gfx, fx, arena });
    const on = (id, fn) => $(id).addEventListener('click', (e) => { this.audio.init(); this.audio.click(); fn(e); });
    on('btn-play', () => game.startLevel(Save.highestUnlocked(LEVELS.length)));
    on('btn-levels', () => this.showLevels('title'));
    on('btn-settings', () => this.showSettings('title'));
    on('levels-back', () => this.hideLevels());
    on('hud-restart', () => game.restart());
    on('hud-pause', () => game.pause());
    $('hud-mute').addEventListener('click', () => { this.audio.init(); this.toggleMute(); });
    on('pause-resume', () => game.resume());
    on('pause-restart', () => { this.hidePause(); game.restart(); });
    on('pause-levels', () => { this.hidePause(); this.enterMenu(); this.showLevels('title'); });
    on('pause-settings', () => this.showSettings('pause'));
    on('pause-quit', () => { this.hidePause(); this.enterMenu(); });
    on('settings-close', () => this.hideSettings());
    on('cmp-replay', () => { this.hide('complete'); game.restart(); });
    on('cmp-next', () => { this.hide('complete'); game.startLevel(game.levelIndex + 1); });
    on('cmp-levels', () => { this.hide('complete'); this.enterMenu(); this.showLevels('title'); });
    on('fail-retry', () => { this.hide('fail'); game.restart(); });
    on('fail-levels', () => { this.hide('fail'); this.enterMenu(); this.showLevels('title'); });
    // settings controls
    for (const b of document.querySelectorAll('#seg-quality button')) b.addEventListener('click', () => { this.audio.click(); this.setQuality(b.dataset.q, false); });
    $('rng-music').addEventListener('input', (e) => { Save.settings.music = +e.target.value; this.audio.setMusicVolume(+e.target.value); Save.save(); });
    $('rng-sfx').addEventListener('input', (e) => { Save.settings.sfx = +e.target.value; this.audio.setSfxVolume(+e.target.value); Save.save(); });
    $('rng-sfx').addEventListener('change', () => this.audio.thud(0.5));
    on('set-mute', () => this.toggleMute());
    on('set-reset', () => { if (confirm('Erase all stars and progress?')) { Save.reset(); this.refreshTitle(); this.buildMap(); } });
    this.refreshSettings();
    this.buildMap();
  }

  // ---------------------------------------------------------------- generic
  show(id) { $(id).classList.add('show'); }
  hide(id) { $(id).classList.remove('show'); }
  hideAll() { for (const s of this.screens) if (s !== 'loader') this.hide(s); this.clearTimers(); }
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; this.stopConfetti(); }
  later(fn, ms) { this.timers.push(setTimeout(fn, ms)); }

  enterMenu() {
    this.hideAll();
    this.game.enterTitle();
    this.showTitle();
  }

  showTitle() { this.hideAll(); this.refreshTitle(); this.show('title'); }
  refreshTitle() {
    const n = LEVELS.length;
    $('title-stars').textContent = `★ ${Save.totalStars()} / ${n * 3}`;
    const started = Object.keys(Save.data.stars).length > 0;
    $('btn-play').textContent = started ? 'CONTINUE' : 'PLAY';
  }

  // ---------------------------------------------------------------- level map
  showLevels(from) {
    this.levelsFrom = from;
    this.hide('title'); this.hide('settings');
    this.buildMap();
    this.show('levels');
  }
  hideLevels() { this.hide('levels'); if (this.game.mode === 'title') this.showTitle(); }

  buildMap() {
    const svg = $('map');
    const R = rng(7);
    let h = `<defs>
      <linearGradient id="mSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4ee"/><stop offset=".5" stop-color="#d4f0fa"/></linearGradient>
      <linearGradient id="mGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fdc55"/><stop offset="1" stop-color="#4fae3a"/></linearGradient>
      <linearGradient id="mGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff28a"/><stop offset="1" stop-color="#ffa800"/></linearGradient>
      <filter id="mSh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity=".35"/></filter>
    </defs>
    <rect width="1000" height="620" fill="url(#mSky)"/>`;
    // distant mountains
    h += `<path d="M0 260 L90 170 L170 240 L260 150 L360 245 L470 160 L560 235 L660 140 L760 230 L860 165 L1000 250 L1000 330 L0 330z" fill="#a9cde3"/>`;
    h += `<path d="M0 290 L110 215 L200 275 L320 200 L430 280 L540 210 L650 285 L770 205 L880 270 L1000 225 L1000 340 L0 340z" fill="#8dbbd6"/>`;
    // clouds
    for (const [x, y, s] of [[120, 60, 1], [420, 40, .8], [780, 70, 1.1], [610, 130, .6]]) {
      h += `<g transform="translate(${x} ${y}) scale(${s})" fill="#fff" opacity=".9"><ellipse cx="0" cy="0" rx="56" ry="20"/><ellipse cx="-26" cy="-12" rx="30" ry="18"/><ellipse cx="18" cy="-16" rx="36" ry="22"/></g>`;
    }
    // land
    h += `<path d="M0 330 Q140 290 300 320 T600 300 T1000 310 L1000 620 L0 620z" fill="url(#mGrass)"/>`;
    h += `<path d="M0 450 Q200 400 380 440 T760 430 T1000 450 L1000 620 L0 620z" fill="#69c447" opacity=".7"/>`;
    // river
    h += `<path d="M655 300 C640 380 690 420 660 480 S700 560 680 640" fill="none" stroke="#2f8fd0" stroke-width="58" stroke-linecap="round"/>`;
    h += `<path d="M655 300 C640 380 690 420 660 480 S700 560 680 640" fill="none" stroke="#5cc4f0" stroke-width="44" stroke-linecap="round"/>`;
    h += `<path d="M655 300 C640 380 690 420 660 480 S700 560 680 640" fill="none" stroke="#bdf0ff" stroke-width="5" stroke-dasharray="14 22" stroke-linecap="round" opacity=".8"/>`;
    // trail
    const pts = NODES;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
    }
    h += `<path d="${d}" fill="none" stroke="#8a5a2a" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`;
    h += `<path d="${d}" fill="none" stroke="#f1d79b" stroke-width="22" stroke-linecap="round"/>`;
    h += `<path d="${d}" fill="none" stroke="#c99a55" stroke-width="3" stroke-dasharray="4 16" stroke-linecap="round"/>`;
    // trees
    for (let i = 0; i < 46; i++) {
      const x = 20 + R() * 960, y = 300 + R() * 300;
      if (NODES.some((n) => Math.hypot(n[0] - x, n[1] - y) < 70)) continue;
      if (x > 610 && x < 715 && y > 290) continue;
      const s = 0.7 + R() * 0.7, pine = R() < 0.6;
      h += pine
        ? `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><rect x="-3" y="0" width="6" height="12" fill="#7b5232"/><path d="M0 -34 L16 -8 L-16 -8z M0 -22 L20 6 L-20 6z" fill="#2f9b3a" stroke="#1f6e2a" stroke-width="2" stroke-linejoin="round"/></g>`
        : `<g transform="translate(${x.toFixed(0)} ${y.toFixed(0)}) scale(${s.toFixed(2)})"><rect x="-3" y="-2" width="6" height="14" fill="#86603a"/><circle cx="0" cy="-14" r="16" fill="#58c04a" stroke="#2f8a35" stroke-width="2"/></g>`;
    }
    // nodes
    const cur = Save.highestUnlocked(LEVELS.length);
    NODES.forEach(([x, y], i) => {
      const unlocked = Save.isUnlocked(i), stars = Save.starsFor(i + 1);
      const state = !unlocked ? 'locked' : stars ? 'done' : 'open';
      const last = i === NODES.length - 1;
      const r = last ? 42 : 34;
      const fill = !unlocked ? '#9aa0a8' : stars ? 'url(#mGold)' : '#ff6a4d';
      h += `<g class="node ${state}" data-i="${i}" transform="translate(${x} ${y})" tabindex="${unlocked ? 0 : -1}" role="button" aria-label="Level ${i + 1} ${LEVELS[i].name}${unlocked ? '' : ' (locked)'}" filter="url(#mSh)">`;
      if (unlocked && !stars && i === cur) h += `<circle class="pulse" r="${r}" fill="none" stroke="#fff" stroke-width="6"/>`;
      h += `<g class="disc"><circle r="${r + 5}" fill="#4a2a0c"/><circle r="${r}" fill="${fill}"/>`;
      h += `<ellipse cx="0" cy="${-r * 0.45}" rx="${r * 0.65}" ry="${r * 0.32}" fill="#fff" opacity=".35"/>`;
      if (unlocked) h += `<text y="${last ? 13 : 11}" text-anchor="middle" font-size="${last ? 38 : 32}" fill="#fff" stroke="#3b210b" stroke-width="7" paint-order="stroke">${i + 1}</text>`;
      else h += `<g fill="#5a6068" transform="translate(-13 -14)"><rect x="0" y="12" width="26" height="20" rx="4"/><path d="M5 14 V8 a8 8 0 0 1 16 0 V14" fill="none" stroke="#5a6068" stroke-width="5"/></g>`;
      h += `</g>`;
      // stars
      for (let s = 0; s < 3; s++) {
        const sx = (s - 1) * 26, sy = r + 24 - (s === 1 ? 0 : 6);
        h += `<polygon points="${starPoints(sx, sy, 13, 5.5)}" fill="${s < stars ? '#ffc21a' : '#5b4331'}" stroke="#3b210b" stroke-width="3" stroke-linejoin="round"/>`;
      }
      h += `</g>`;
    });
    svg.innerHTML = h;
    svg.querySelectorAll('.node').forEach((n) => {
      const i = +n.dataset.i;
      const go = () => { if (!Save.isUnlocked(i)) { this.audio.thud(0.3); return; } this.audio.init(); this.audio.click(); this.game.startLevel(i); };
      n.addEventListener('click', go);
      n.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); });
    });
    $('levels-stars').textContent = `★ ${Save.totalStars()} / ${LEVELS.length * 3}`;
  }

  // ---------------------------------------------------------------- HUD
  showHud(level, index) {
    this.hideAll();
    $('hud').classList.remove('slow');
    this.show('hud');
    $('hud-level').textContent = `LEVEL ${level.id} · ${level.name}`;
    this.trayKey = '';
    this.updateMuteIcon();
  }
  hideHud() { this.hide('hud'); }

  updateHud({ flagsLeft, flagsTotal, shots, ammo, sel }) {
    const fl = $('hud-flags');
    if (fl.childElementCount !== flagsTotal) {
      fl.innerHTML = '';
      for (let i = 0; i < flagsTotal; i++) {
        fl.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 22 26"><path d="M4 2v22" stroke="#e9d9b8" stroke-width="3" stroke-linecap="round"/><path d="M5 3l15 5-15 6z" fill="#ef3b3b" stroke="#7a1010" stroke-width="1.5" stroke-linejoin="round"/></svg>`);
      }
    }
    [...fl.children].forEach((el, i) => el.classList.toggle('down', i >= flagsLeft));
    $('hud-shots').textContent = shots;
    const key = AMMO_ORDER.filter((t) => ammo[t] !== undefined).join(',');
    const tray = $('ammo-tray');
    if (key !== this.trayKey) {
      this.trayKey = key; tray.innerHTML = '';
      AMMO_ORDER.forEach((t, idx) => {
        if (ammo[t] === undefined) return;
        const b = document.createElement('button');
        b.className = 'ammo'; b.dataset.t = t; b.title = `${AMMO[t].name}: ${AMMO[t].desc}`;
        b.innerHTML = `<span class="key">${idx + 1}</span><canvas></canvas><span class="cnt"></span><span class="nm">${AMMO[t].name}</span>`;
        drawAmmoIcon(b.querySelector('canvas'), t);
        b.addEventListener('click', (e) => { e.stopPropagation(); this.game.selectAmmo(t); });
        b.addEventListener('pointerdown', (e) => e.stopPropagation());
        tray.appendChild(b);
      });
    }
    for (const b of tray.children) {
      const t = b.dataset.t;
      b.classList.toggle('sel', t === sel);
      b.classList.toggle('empty', !(ammo[t] > 0));
      b.querySelector('.cnt').textContent = `×${ammo[t] || 0}`;
    }
  }

  banner(kicker, name, tip, newAmmo) {
    const b = $('banner');
    b.querySelector('.b-level').textContent = kicker.toUpperCase();
    b.querySelector('.b-name').textContent = name;
    b.querySelector('.b-tip').textContent = tip || '';
    b.querySelector('.b-new').textContent = newAmmo ? `NEW AMMO: ${AMMO[newAmmo].name.toUpperCase()}` : '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }

  toast(text, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`; t.textContent = text;
    const c = $('toasts');
    while (c.childElementCount > 2) c.firstChild.remove();
    c.appendChild(t);
    setTimeout(() => t.remove(), 2300);
  }

  showHint(text) { const h = $('hint'); if (text) { h.textContent = text; h.classList.add('show'); } else h.classList.remove('show'); }
  hideHint() { $('hint').classList.remove('show'); }
  slowmo(on) { $('hud').classList.toggle('slow', on); }

  // ---------------------------------------------------------------- aim overlay
  resizeAim() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.aim.width = window.innerWidth * dpr; this.aim.height = window.innerHeight * dpr;
    this.dpr = dpr;
  }
  aimOverlay(a) {
    const c = this.actx, dpr = this.dpr || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (!a) return;
    const deg = Math.round(a.alpha * 180 / Math.PI), pct = Math.round(a.power * 100);
    c.lineCap = 'round'; c.font = '900 20px "Baloo 2","Trebuchet MS",sans-serif'; c.textAlign = 'center';
    if (a.dragging && a.px !== undefined) {
      const { x0, y0, px, py } = a;
      c.save();
      c.strokeStyle = 'rgba(255,255,255,.28)'; c.lineWidth = 3; c.setLineDash([6, 8]);
      c.beginPath(); c.arc(x0, y0, a.maxDrag, 0, 6.3); c.stroke();
      c.setLineDash([]);
      // power arc
      c.strokeStyle = `hsl(${120 - 120 * a.power} 95% 55%)`; c.lineWidth = 8;
      c.beginPath(); c.arc(x0, y0, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * a.power); c.stroke();
      // rubber band
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 9; c.beginPath(); c.moveTo(x0, y0); c.lineTo(px, py); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(px, py); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(px, py, 11, 0, 6.3); c.fill();
      c.strokeStyle = '#3b210b'; c.lineWidth = 3; c.stroke();
      // launch direction arrow
      const dx = Math.cos(a.alpha), dy = -Math.sin(a.alpha), len = 46 + a.power * 70;
      const ex = x0 + dx * len, ey = y0 + dy * len;
      c.strokeStyle = `hsl(${120 - 120 * a.power} 95% 60%)`; c.lineWidth = 7;
      c.beginPath(); c.moveTo(x0 + dx * 36, y0 + dy * 36); c.lineTo(ex, ey); c.stroke();
      c.beginPath(); c.moveTo(ex + dx * 12, ey + dy * 12); c.lineTo(ex - dy * 10 - dx * 6, ey + dx * 10 - dy * 6); c.lineTo(ex + dy * 10 - dx * 6, ey - dx * 10 - dy * 6); c.closePath();
      c.fillStyle = c.strokeStyle; c.fill();
      c.lineWidth = 5; c.strokeStyle = 'rgba(30,20,10,.85)'; c.fillStyle = '#fff';
      const label = `${deg}°  ${pct}%`;
      c.strokeText(label, px, py - 24); c.fillText(label, px, py - 24);
      c.restore();
    } else if (a.key) {
      const x = window.innerWidth / 2, y = window.innerHeight - 40;
      c.lineWidth = 5; c.strokeStyle = 'rgba(30,20,10,.85)'; c.fillStyle = '#fff';
      const label = `${deg}°   ${pct}%   ·   Space to fire`;
      c.strokeText(label, x, y); c.fillText(label, x, y);
    }
  }

  // ---------------------------------------------------------------- pause / settings
  showPause() { this.show('pause'); }
  hidePause() { this.hide('pause'); }
  onEscape() {
    if ($('settings').classList.contains('show')) { this.hideSettings(); return; }
    if ($('levels').classList.contains('show')) { this.hideLevels(); return; }
    if ($('complete').classList.contains('show') || $('fail').classList.contains('show')) return;
    if (this.game.mode === 'play') {
      if (this.game.paused) this.game.resume(); else this.game.pause();
    }
  }

  showSettings(from) { this.settingsFrom = from; this.refreshSettings(); this.show('settings'); }
  hideSettings() { this.hide('settings'); }
  refreshSettings() {
    const s = Save.settings;
    for (const b of document.querySelectorAll('#seg-quality button')) b.classList.toggle('on', b.dataset.q === s.quality);
    $('rng-music').value = s.music; $('rng-sfx').value = s.sfx;
    $('set-mute').textContent = s.muted ? 'OFF' : 'ON';
  }

  setQuality(q, auto) {
    Save.settings.quality = q;
    if (!auto) Save.settings.qualityManual = true;
    Save.save();
    this.gfx.setQuality(q, (cfg) => { this.fx.setQuality(cfg); this.arena.setQuality(cfg); });
    this.refreshSettings();
  }

  toggleMute() {
    const m = !this.audio.muted;
    this.audio.setMuted(m);
    Save.settings.muted = m; Save.save();
    this.refreshSettings(); this.updateMuteIcon();
    if (this.game.mode === 'play') this.toast(m ? 'Sound off' : 'Sound on', 'info');
  }
  updateMuteIcon() {
    $('mute-path').setAttribute('d', this.audio.muted
      ? 'M3 9v6h4l5 4V5L7 9H3zm12.6 3l2.4-2.4-1.4-1.4-2.4 2.4-2.4-2.4-1.4 1.4 2.4 2.4-2.4 2.4 1.4 1.4 2.4-2.4 2.4 2.4 1.4-1.4z'
      : 'M3 9v6h4l5 4V5L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z');
  }

  // ---------------------------------------------------------------- results
  showComplete({ level, stars, shots, best, newBest, unlock, hasNext }) {
    this.hideHint();
    $('cmp-title').textContent = stars === 3 ? 'PERFECT!' : 'LEVEL COMPLETE!';
    $('cmp-shots').textContent = shots;
    $('cmp-best').textContent = best;
    $('cmp-note').textContent = newBest ? 'NEW BEST!' : '';
    $('cmp-unlock').textContent = unlock ? `New ammo unlocked: ${AMMO[unlock].name}!` : '';
    $('cmp-next').style.display = hasNext ? '' : 'none';
    const els = [...$('cmp-stars').children];
    els.forEach((e) => { e.className = ''; });
    this.show('complete');
    els.forEach((e, i) => this.later(() => {
      if (i < stars) { e.classList.add('on'); this.audio.star(i); } else e.classList.add('off');
    }, 500 + i * 560));
    if (unlock) this.later(() => this.audio.unlock(), 2400);
    if (stars === 3) this.later(() => this.startConfetti(), 500);
  }

  showFail() { this.show('fail'); }

  startConfetti() {
    const cv = $('confetti'), c = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const cols = ['#ffd23d', '#ff5d5d', '#5fd35a', '#4aa8ff', '#ff8ad8', '#ffffff'];
    const ps = [];
    for (let i = 0; i < 160; i++) ps.push({ x: cv.width * (0.2 + Math.random() * 0.6), y: cv.height * 0.35, vx: (Math.random() - 0.5) * 16, vy: -8 - Math.random() * 12, r: Math.random() * 6, w: 6 + Math.random() * 8, h: 4 + Math.random() * 6, c: cols[i % cols.length], a: 0 });
    let t = 0; this.confettiOn = true;
    const loop = () => {
      if (!this.confettiOn) { c.clearRect(0, 0, cv.width, cv.height); return; }
      t++;
      c.clearRect(0, 0, cv.width, cv.height);
      for (const p of ps) {
        p.vy += 0.4; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += 0.2;
        c.save(); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.globalAlpha = Math.max(0, 1 - t / 200); c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); c.restore();
      }
      if (t < 200) requestAnimationFrame(loop); else c.clearRect(0, 0, cv.width, cv.height);
    };
    loop();
  }
  stopConfetti() { this.confettiOn = false; }
}
