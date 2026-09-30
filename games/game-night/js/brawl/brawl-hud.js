// Blaster Brawl HUD (DOM): player cards with HP + KO count, weapon/ammo + dash for local players, kill feed,
// respawn countdown, pause menu and results.
import { h, sheet } from '../core/ui.js';
import { ICON } from '../core/icons.js';
import { badgeHTML } from '../customize/avatars.js';
import { hex } from '../core/util.js';
import { openSettings, openHelp } from '../hub/settings.js';
import { CFG } from './brawl-sim.js';
import { PLAYER_COLORS } from './brawl-view.js';

const WNAME = ['BLASTER', 'SHOTGUN', 'ROCKETS'];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class BrawlHud {
  constructor(game) { this.g = game; this.cards = []; }

  mount() {
    const { cfg } = this.g.session, ui = document.getElementById('ui');
    this.root = h('div', { class: 'ludo-hud sn-hud bb-hud' });
    this.top = h('div', { class: 'lp-row' });
    cfg.seats.forEach((s, i) => {
      const col = hex(PLAYER_COLORS[i % 4]);
      const kos = h('div', { class: 'lp-len' }, '0 KO'), hp = h('div', { class: 'lp-timer bb-hp' }, h('i'));
      const card = h('div', { class: 'lp', dataset: { seat: i }, style: { '--pc': col } },
        h('span', { class: 'lp-av', html: badgeHTML(s.avatar, s.look?.frame || 'sakura', 44) }),
        h('div', { class: 'lp-info' }, h('div', { class: 'lp-name' }, s.kind === 'bot' ? (s.name || 'Bot') + ' · BOT' : s.name), kos, hp),
        h('span', { class: 'lp-away' }, 'AWAY'));
      this.top.append(card); this.cards.push({ card, kos, hp: hp.firstChild });
    });
    this.menuBtn = h('button', { class: 'btn icon dark ludo-menu', 'aria-label': 'Menu', id: 'brawl-menu', html: ICON.pause, onclick: () => this.openMenu() });
    this.chip = h('div', { class: 'sn-chip', id: 'sn-chip' });
    this.feedEl = h('div', { class: 'sn-feed' });
    this.weapon = h('div', { class: 'bb-weapon' }, h('b', { class: 'bb-wname' }), h('span', { class: 'bb-ammo' }), h('div', { class: 'bb-dash' }, h('i')), h('div', { class: 'bb-buffs' }));
    this.respawn = h('div', { class: 'bb-respawn' });
    this.hint = h('div', { class: 'sn-hint' }); this.net = h('div', { class: 'ludo-net' });
    this.root.append(this.top, this.menuBtn, this.chip, this.feedEl, this.weapon, this.respawn, this.hint, this.net); ui.append(this.root); this.setNet('');
  }
  unmount() { this.root?.remove(); this.winEl?.remove(); }
  setNet(text, bad = false) { this.net.textContent = text; this.net.classList.toggle('bad', bad); this.net.style.display = text ? '' : 'none'; }
  setAway(seat, on) { this.cards[seat]?.card.classList.toggle('away', !!on); }
  setHint(html, ms = 8000) { this.hint.innerHTML = html; this.hint.classList.add('on'); clearTimeout(this._ht); if (ms) this._ht = setTimeout(() => this.hint.classList.remove('on'), ms); }

  update(rs) {
    if (!rs) return;
    rs.p.forEach((p, i) => {
      const c = this.cards[i]; if (!c) return;
      if (c.k !== p.kos) { c.k = p.kos; c.kos.textContent = `${p.kos} / ${CFG.KO_TARGET} KO`; }
      c.hp.style.transform = `scaleX(${Math.max(0, Math.min(1, p.hp / CFG.HP))})`; c.hp.style.background = p.hp > 60 ? 'var(--pc)' : p.hp > 30 ? '#ffd23f' : '#ff4d4d';
      c.card.classList.toggle('dead', !p.alive && rs.ph === 'play');
    });
    const t = `FIRST TO ${CFG.KO_TARGET} KOs · ${fmtTime(rs.tm)}`; if (this._chip !== t) { this._chip = t; this.chip.textContent = t; }
    // local weapon panel (first local seat)
    const me = this.g.session.mySeats[0], p = rs.p[me];
    this.weapon.style.display = p ? '' : 'none';
    if (p) {
      const w = this.weapon.children;
      w[0].textContent = WNAME[p.wid] || 'BLASTER'; w[1].textContent = p.ammo < 0 ? '∞' : `× ${p.ammo}`;
      w[2].firstChild.style.transform = `scaleX(${1 - Math.min(1, p.dashCd / (CFG.DASH_CD * 10) * 10)})`;
      const buffs = (p.shield ? '<span class="bf s">SHIELD</span>' : '') + (p.speed ? '<span class="bf v">SPEED</span>' : '');
      if (this._buffs !== buffs) { this._buffs = buffs; w[3].innerHTML = buffs; }
      const rsp = !p.alive && rs.ph === 'play' ? `RESPAWNING ${Math.max(1, Math.ceil(p.respawn))}` : ''; if (this._rsp !== rsp) { this._rsp = rsp; this.respawn.textContent = rsp; this.respawn.classList.toggle('on', !!rsp); }
    }
  }
  feed(html) { const e = h('div', { class: 'sn-feed-item', html }); this.feedEl.prepend(e); while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove(); setTimeout(() => e.classList.add('out'), 3600); setTimeout(() => e.remove(), 4200); }

  openMenu() {
    const g = this.g; if (g.session.mode !== 'online') g.paused = true;
    const s = sheet({ title: 'Paused', onClose: () => { g.paused = false; }, body: h('div', { class: 'opts', style: { flexDirection: 'column', gap: '10px' } },
      h('button', { class: 'btn g', onclick: () => s.close() }, 'Resume'), h('button', { class: 'btn dark', onclick: () => openSettings(g.app.engine) }, 'Settings'), h('button', { class: 'btn dark', onclick: () => openHelp() }, 'How to play'),
      h('button', { class: 'btn r', id: 'btn-quit', onclick: () => { s.close(); g.quit(); } }, g.session.mode === 'online' ? 'Leave game' : 'Quit to menu')) });
  }

  showWin(rows, winnerSeat, { onAgain, onLobby, canAgain, waitingText }) {
    const cfg = this.g.cfg, w = cfg.seats[winnerSeat];
    const trs = rows.map((r, place) => { const p = cfg.seats[r.seat]; return h('tr', { class: place === 0 ? 'w' : '' }, h('td', null, ['1st', '2nd', '3rd', '4th'][place]), h('td', { class: 'nm' }, h('span', { html: badgeHTML(p.avatar, p.look?.frame || 'sakura', 28) }), p.name || 'Bot'), h('td', null, r.kos), h('td', null, r.deaths), h('td', null, r.deaths ? (r.kos / r.deaths).toFixed(1) : r.kos.toFixed(1))); });
    this.winEl = h('div', { class: 'win-card', id: 'win-card' },
      h('div', { class: 'win-title', style: { '--pc': hex(PLAYER_COLORS[winnerSeat % 4]) } }, h('span', { html: ICON.crown }), (w.name || 'Bot') + ' WINS!'),
      h('table', { class: 'stats' }, h('thead', null, h('tr', null, ['', 'Player', 'KOs', 'Deaths', 'K/D'].map((x) => h('th', null, x)))), h('tbody', null, trs)),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
        canAgain ? h('button', { class: 'btn y', id: 'btn-again', onclick: onAgain }, 'Play again') : h('span', { class: 'muted' }, waitingText || 'Waiting for the host…'),
        h('button', { class: 'btn dark', id: 'btn-lobby', onclick: onLobby }, this.g.session.mode === 'online' ? 'Back to room' : 'Menu')));
    document.getElementById('ui').append(this.winEl); requestAnimationFrame(() => this.winEl.classList.add('in'));
  }
}
