// Snake Arena HUD (DOM): player cards with round wins + length, round/sudden-death chip, kill feed, control hints,
// pause menu and the results card.
import { h, sheet } from '../core/ui.js';
import { ICON } from '../core/icons.js';
import { badgeHTML } from '../customize/avatars.js';
import { hex } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { openSettings, openHelp } from '../hub/settings.js';
import { CFG } from './snake-sim.js';
import { SNAKE_COLORS } from './snake-view.js';

export class SnakeHud {
  constructor(game) { this.g = game; this.cards = []; this.count = -1; this.feedEl = null; }

  mount() {
    const { cfg } = this.g.session;
    const ui = document.getElementById('ui');
    this.root = h('div', { class: 'ludo-hud sn-hud' });
    this.top = h('div', { class: 'lp-row' });
    cfg.seats.forEach((s, i) => {
      const col = hex(SNAKE_COLORS[i % 4]);
      const pips = h('div', { class: 'lp-pips' }, Array.from({ length: CFG.WINS_NEEDED }, () => h('i')));
      const len = h('div', { class: 'lp-len' }, '9');
      const card = h('div', { class: 'lp', dataset: { seat: i }, style: { '--pc': col } },
        h('span', { class: 'lp-av', html: badgeHTML(s.avatar, s.look?.frame || 'sakura', 44) }),
        h('div', { class: 'lp-info' }, h('div', { class: 'lp-name' }, s.kind === 'bot' ? (s.name || 'Bot') + ' · BOT' : s.name), pips, len),
        h('span', { class: 'lp-away' }, 'AWAY'));
      this.top.append(card); this.cards.push({ card, pips: pips.children, len, name: card.querySelector('.lp-name') });
    });
    this.menuBtn = h('button', { class: 'btn icon dark ludo-menu', 'aria-label': 'Menu', id: 'snake-menu', html: ICON.pause, onclick: () => this.openMenu() });
    this.chip = h('div', { class: 'sn-chip', id: 'sn-chip' });
    this.feedEl = h('div', { class: 'sn-feed' });
    this.hint = h('div', { class: 'sn-hint' });
    this.net = h('div', { class: 'ludo-net' });
    this.root.append(this.top, this.menuBtn, this.chip, this.feedEl, this.hint, this.net);
    ui.append(this.root);
    this.setNet('');
  }
  unmount() { this.root?.remove(); this.winEl?.remove(); }

  setNet(text, bad = false) { this.net.textContent = text; this.net.classList.toggle('bad', bad); this.net.style.display = text ? '' : 'none'; }
  setAway(seat, on) { this.cards[seat]?.card.classList.toggle('away', !!on); }
  setHint(html, ms = 7000) { this.hint.innerHTML = html; this.hint.classList.add('on'); clearTimeout(this._ht); if (ms) this._ht = setTimeout(() => this.hint.classList.remove('on'), ms); }

  update(rs) {
    if (!rs) return;
    rs.s.forEach((s, i) => {
      const c = this.cards[i]; if (!c) return;
      const len = Math.round(s.len);
      if (c.lastLen !== len) { c.lastLen = len; c.len.textContent = `${len} long · ${s.kills} KO`; }
      if (c.lastWins !== s.wins) { c.lastWins = s.wins; [...c.pips].forEach((p, k) => p.classList.toggle('on', k < s.wins)); }
      c.card.classList.toggle('dead', !s.alive && (rs.ph === 'play' || rs.ph === 'roundend'));
      c.card.classList.toggle('active', s.alive && rs.ph === 'play' && s.boost);
    });
    let text = `ROUND ${rs.rd}`;
    const sudden = rs.ph === 'play' && rs.R < CFG.R0 - 0.3;
    if (sudden) text = 'SUDDEN DEATH · ARENA SHRINKING'; else if (rs.ph === 'play') text += ` · first to ${CFG.WINS_NEEDED}`;
    if (this._chip !== text) { this._chip = text; this.chip.textContent = text; }
    this.chip.classList.toggle('danger', sudden);
  }

  /** Kill feed line: a coloured "A > B" entry that fades after a few seconds. */
  feed(html) {
    const e = h('div', { class: 'sn-feed-item', html });
    this.feedEl.prepend(e); while (this.feedEl.children.length > 4) this.feedEl.lastChild.remove();
    setTimeout(() => e.classList.add('out'), 3600); setTimeout(() => e.remove(), 4200);
  }

  openMenu() {
    const g = this.g;
    if (g.session.mode !== 'online') g.paused = true;
    const s = sheet({ title: 'Paused', onClose: () => { g.paused = false; }, body: h('div', { class: 'opts', style: { flexDirection: 'column', gap: '10px' } },
      h('button', { class: 'btn g', onclick: () => s.close() }, 'Resume'),
      h('button', { class: 'btn dark', onclick: () => openSettings(g.app.engine) }, 'Settings'),
      h('button', { class: 'btn dark', onclick: () => openHelp() }, 'How to play'),
      h('button', { class: 'btn r', id: 'btn-quit', onclick: () => { s.close(); g.quit(); } }, g.session.mode === 'online' ? 'Leave game' : 'Quit to menu')) });
  }

  showWin(rows, winnerSeat, { onAgain, onLobby, canAgain, waitingText }) {
    const cfg = this.g.cfg, w = cfg.seats[winnerSeat];
    const trs = rows.map((r, place) => {
      const p = cfg.seats[r.seat];
      return h('tr', { class: place === 0 ? 'w' : '' }, h('td', null, ['1st', '2nd', '3rd', '4th'][place]), h('td', { class: 'nm' }, h('span', { html: badgeHTML(p.avatar, p.look?.frame || 'sakura', 28) }), p.name || 'Bot'), h('td', null, r.wins), h('td', null, r.kills), h('td', null, Math.round(r.peak)));
    });
    this.winEl = h('div', { class: 'win-card', id: 'win-card' },
      h('div', { class: 'win-title', style: { '--pc': hex(SNAKE_COLORS[winnerSeat % 4]) } }, h('span', { html: ICON.crown }), (w.name || 'Bot') + ' WINS!'),
      h('table', { class: 'stats' }, h('thead', null, h('tr', null, ['', 'Player', 'Rounds', 'KOs', 'Best length'].map((x) => h('th', null, x)))), h('tbody', null, trs)),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
        canAgain ? h('button', { class: 'btn y', id: 'btn-again', onclick: onAgain }, 'Play again') : h('span', { class: 'muted' }, waitingText || 'Waiting for the host…'),
        h('button', { class: 'btn dark', id: 'btn-lobby', onclick: onLobby }, this.g.session.mode === 'online' ? 'Back to room' : 'Menu')));
    document.getElementById('ui').append(this.winEl);
    requestAnimationFrame(() => this.winEl.classList.add('in'));
  }
}
