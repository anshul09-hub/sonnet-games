// Ludo HUD (DOM): player cards with turn/timer, dice result pop, hints, roll button, pause menu, win screen with stats.
import { h, sheet, toast as uiToast } from '../core/ui.js';
import { ICON } from '../core/icons.js';
import { badgeHTML } from '../customize/avatars.js';
import { COLOR_HEX, COLORS, ranking } from './rules.js';
import { hex } from '../core/util.js';
import { audio } from '../audio/audio.js';
import { openSettings, openHelp } from '../hub/settings.js';

export class LudoHud {
  constructor(game) { this.g = game; this.cards = []; this.timerTotal = 30; this.timerSeat = -1; this.timerLeft = 0; this.lastTick = 0; }

  mount() {
    const { cfg } = this.g.session;
    const ui = document.getElementById('ui');
    this.root = h('div', { class: 'ludo-hud' });
    this.top = h('div', { class: 'lp-row', id: 'lp-row' });
    cfg.seats.forEach((s, i) => {
      const col = hex(COLOR_HEX[this.g.seatColor(i)]);
      const pips = h('div', { class: 'lp-pips' }, [0, 1, 2, 3].map(() => h('i')));
      const bar = h('div', { class: 'lp-timer' }, h('i'));
      const card = h('div', { class: 'lp', dataset: { seat: i }, style: { '--pc': col } },
        h('span', { class: 'lp-av', html: badgeHTML(s.avatar, s.look?.frame || 'sakura', 44) }),
        h('div', { class: 'lp-info' }, h('div', { class: 'lp-name' }, s.kind === 'bot' ? (s.name || 'Bot') + ' · BOT' : s.name), pips, bar),
        h('span', { class: 'lp-away' }, 'AWAY'));
      this.top.append(card); this.cards.push({ card, pips: pips.children, bar: bar.firstChild, name: card.querySelector('.lp-name') });
    });
    this.menuBtn = h('button', { class: 'btn icon dark ludo-menu', 'aria-label': 'Menu', id: 'ludo-menu', html: ICON.pause, onclick: () => this.openMenu() });
    this.pop = h('div', { class: 'roll-pop' });
    this.hint = h('div', { class: 'ludo-hint', id: 'ludo-hint' });
    this.rollBtn = h('button', { class: 'btn y big ludo-roll', id: 'ludo-roll', onclick: () => this.g.onRollButton() }, h('span', { class: 'ico', html: ICON.dice }), 'ROLL');
    this.rollBtn.style.display = 'none';
    this.net = h('div', { class: 'ludo-net' });
    this.root.append(this.top, this.menuBtn, this.pop, this.hint, this.rollBtn, this.net);
    ui.append(this.root);
  }
  unmount() { this.root?.remove(); this.winEl?.remove(); }

  setTurn(seat) {
    this.cards.forEach((c, i) => c.card.classList.toggle('active', i === seat));
    this.activeSeat = seat;
  }
  setAway(seat, on) { this.cards[seat]?.card.classList.toggle('away', !!on); }
  setHome(seat, n) { [...this.cards[seat].pips].forEach((p, i) => p.classList.toggle('on', i < n)); }
  setNet(text, bad = false) { this.net.textContent = text; this.net.classList.toggle('bad', bad); this.net.style.display = text ? '' : 'none'; }

  /** Turn timer bar for a seat. total in seconds. */
  startTimer(seat, seconds) { this.timerSeat = seat; this.timerTotal = seconds; this.timerLeft = seconds; }
  stopTimer() { this.timerSeat = -1; this.cards.forEach((c) => { c.bar.style.transform = 'scaleX(0)'; c.card.classList.remove('urgent'); }); }
  update(dt) {
    if (this.timerSeat < 0) return;
    this.timerLeft = Math.max(0, this.timerLeft - dt);
    const f = this.timerLeft / this.timerTotal;
    this.cards.forEach((c, i) => { if (i === this.timerSeat) { c.bar.style.transform = `scaleX(${f})`; c.card.classList.toggle('urgent', this.timerLeft < 6); } else c.bar.style.transform = 'scaleX(0)'; });
    if (this.timerLeft < 6 && this.g.session.isMine(this.timerSeat)) { const s = Math.ceil(this.timerLeft); if (s !== this.lastTick) { this.lastTick = s; audio.sfx(s <= 3 ? 'warn' : 'tick'); } }
  }

  showRoll(value, seat) {
    const col = hex(COLOR_HEX[this.g.seatColor(seat)]);
    this.pop.style.setProperty('--pc', col); this.pop.textContent = value; this.pop.classList.remove('go'); void this.pop.offsetWidth; this.pop.classList.add('go');
    this.pop.classList.toggle('six', value === 6);
  }
  setHint(text) { this.hint.textContent = text || ''; this.hint.classList.toggle('on', !!text); }
  showRollButton(on) { this.rollBtn.style.display = on ? '' : 'none'; }
  toast(msg, kind = 'info') { uiToast(msg, kind, 1800); }

  openMenu() {
    const s = sheet({ title: 'Paused', body: h('div', { class: 'opts', style: { flexDirection: 'column', gap: '10px' } },
      h('button', { class: 'btn g', onclick: () => s.close() }, 'Resume'),
      h('button', { class: 'btn dark', onclick: () => openSettings(this.g.app.engine) }, 'Settings'),
      h('button', { class: 'btn dark', onclick: () => openHelp() }, 'How to play'),
      h('button', { class: 'btn r', id: 'btn-quit', onclick: () => { s.close(); this.g.quit(); } }, this.g.session.mode === 'online' ? 'Leave game' : 'Quit to menu')) });
  }

  showWin(rank, state, cfg, { onAgain, onLobby, canAgain, waitingText }) {
    const win = rank[0], seat = cfg.seats[win];
    const rows = rank.map((s, place) => {
      const st = state.stats[s], p = cfg.seats[s];
      return h('tr', { class: place === 0 ? 'w' : '' }, h('td', null, ['1st', '2nd', '3rd', '4th'][place]), h('td', { class: 'nm' }, h('span', { html: badgeHTML(p.avatar, p.look?.frame || 'sakura', 28) }), p.name || 'Bot'), h('td', null, st.home + '/4'), h('td', null, st.captures), h('td', null, st.sixes), h('td', null, st.steps));
    });
    this.winEl = h('div', { class: 'win-card', id: 'win-card' },
      h('div', { class: 'win-title', style: { '--pc': hex(COLOR_HEX[this.g.seatColor(win)]) } }, h('span', { html: ICON.crown }), (seat.name || 'Bot') + ' WINS!'),
      h('table', { class: 'stats' }, h('thead', null, h('tr', null, ['', 'Player', 'Home', 'Captures', 'Sixes', 'Steps'].map((x) => h('th', null, x)))), h('tbody', null, rows)),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '10px' } },
        canAgain ? h('button', { class: 'btn y', id: 'btn-again', onclick: onAgain }, 'Play again') : h('span', { class: 'muted' }, waitingText || 'Waiting for the host…'),
        h('button', { class: 'btn dark', id: 'btn-lobby', onclick: onLobby }, this.g.session.mode === 'online' ? 'Back to room' : 'Menu')));
    document.getElementById('ui').append(this.winEl);
    requestAnimationFrame(() => this.winEl.classList.add('in'));
  }
}
