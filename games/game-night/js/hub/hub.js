// The hub screen: 3D lobby + DOM menus (mode picker, online rooms, local / bot setup, rejoin, settings).
import { h, sheet, toast, copyText, clear } from '../core/ui.js';
import { ICON } from '../core/icons.js';
import { badgeHTML, AVATARS } from '../customize/avatars.js';
import { profile, ITEMS, botSeat, randomLook, itemOf, THEMES } from '../customize/catalog.js';
import { Session, GAMES } from '../net/session.js';
import { cleanCode } from '../net/net.js';
import { HubScene } from './hub-scene.js';
import { openSettings, openHelp } from './settings.js';
import { audio } from '../audio/audio.js';
import { store, params } from '../core/util.js';

const LEVELS = [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']];

function codeInput(onChange) {
  const inputs = [0, 1, 2, 3].map((i) => h('input', { maxlength: 1, inputmode: 'text', autocapitalize: 'characters', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Room code letter ' + (i + 1) }));
  const get = () => inputs.map((x) => x.value).join('');
  inputs.forEach((inp, i) => {
    inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(-1); if (inp.value && i < 3) inputs[i + 1].focus(); onChange?.(get()); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) { inputs[i - 1].focus(); inputs[i - 1].value = ''; onChange?.(get()); } if (e.key === 'Enter') onChange?.(get(), true); });
    inp.addEventListener('paste', (e) => { e.preventDefault(); const t = cleanCode((e.clipboardData || window.clipboardData).getData('text')); t.split('').forEach((ch, k) => { if (inputs[k]) inputs[k].value = ch; }); inputs[Math.min(3, t.length)].focus(); onChange?.(get()); });
    inp.addEventListener('focus', () => inp.select());
  });
  const el = h('div', { class: 'codeinput' }, inputs);
  return { el, get, set(c) { c = cleanCode(c); inputs.forEach((x, i) => { x.value = c[i] || ''; }); }, focus() { inputs[0].focus(); } };
}

function modeIcon(kind) { return ICON[kind]; }

export class Hub {
  constructor(app) { this.app = app; this.sheets = []; }

  mount() {
    const { engine } = this.app;
    this.scene = new HubScene(engine, { onSelect: (id) => this.openGame(id) });
    engine.setView(this.scene.scene, this.scene.camera);
    engine.setBloom(0.55, 0.65, 0.78);
    this.ui = document.getElementById('ui');
    this.root = h('div', { class: 'hub' });
    const av = h('span', { class: 'av', title: 'Change avatar', onclick: () => this.pickAvatar() });
    this.avEl = av; this.drawAvatar();
    const nameIn = h('input', { value: profile.name, maxlength: 14, 'aria-label': 'Player name', spellcheck: 'false', oninput: (e) => profile.set({ name: e.target.value.trim().slice(0, 14) || 'Player' }) });
    const soundBtn = h('button', { class: 'btn icon dark', 'aria-label': 'Mute', html: audio.muted ? ICON.mute : ICON.sound, onclick: () => { audio.setMuted(!audio.muted); soundBtn.innerHTML = audio.muted ? ICON.mute : ICON.sound; } });
    this.soundBtn = soundBtn;
    this.root.append(
      h('div', { class: 'hub-top' },
        h('div', { class: 'profile' }, av, nameIn),
        h('div', { class: 'top-actions' },
          h('button', { class: 'btn y', id: 'btn-customize', onclick: () => this.app.go('customize') }, h('span', { class: 'ico', html: ICON.palette }), 'Customize'),
          h('button', { class: 'btn icon dark', 'aria-label': 'How to play', html: ICON.info, onclick: () => openHelp() }),
          h('button', { class: 'btn icon dark', 'aria-label': 'Settings', html: ICON.gear, onclick: () => openSettings(this.app.engine) }),
          soundBtn)),
      h('div', { class: 'hub-title' }, h('div', { class: 'logo', html: 'Game <b>Night</b><small>3D · ONLINE · LOCAL · BOTS</small>' })),
      this.bottom = h('div', { class: 'hub-bottom' }));
    this.ui.append(this.root);
    this.buildBottom();
    this._unProfile = profile.onChange(() => this.drawAvatar());
    audio.playMusic(itemOf('skin', profile.look.skin).theme, { game: 'hub', energy: 0.5 });
    this.hint();
    // deep link: ?room=ABCD
    const room = cleanCode(params.get('room'));
    if (room.length === 4) setTimeout(() => this.joinRoom(room), 300);
  }

  drawAvatar() { if (this.avEl) this.avEl.innerHTML = badgeHTML(profile.avatar, profile.look.frame, 46); }

  buildBottom() {
    clear(this.bottom);
    const last = store.get('lastRoom');
    if (last && !last.host && Date.now() - last.ts < 30 * 60 * 1000 && !params.get('room')) {
      const b = h('div', { class: 'rejoin-banner' }, h('span', null, `Rejoin room ${last.code}?`),
        h('button', { class: 'btn g small', onclick: () => this.joinRoom(last.code, true) }, 'Rejoin'),
        h('button', { class: 'btn dark small', onclick: () => { store.del('lastRoom'); this.buildBottom(); } }, '✕'));
      this.bottom.append(b);
    }
    this.hintEl = h('div', { class: 'hub-hint' }, '');
    this.bottom.append(
      h('div', { class: 'hub-nav', id: 'hub-nav' },
        h('button', { class: 'btn icon dark', 'aria-label': 'Previous game', onclick: () => this.scene.setFocus(Math.max(0, this.scene.focus - 1)) }, '‹'),
        h('button', { class: 'btn y big', id: 'btn-play', onclick: () => this.openGame(['ludo', 'snake', 'brawl'][this.scene.focus]) }, h('span', { class: 'ico', html: ICON.play }), 'PLAY'),
        h('button', { class: 'btn icon dark', 'aria-label': 'Next game', onclick: () => this.scene.setFocus(Math.min(2, this.scene.focus + 1)) }, '›')),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn c small', id: 'btn-join', onclick: () => this.joinSheet() }, h('span', { class: 'ico', html: ICON.online }), 'Join with a code')),
      this.hintEl);
  }
  hint() { this.hintEl.textContent = this.app.engine.portrait ? 'Swipe the cards · tap PLAY' : 'Pick a game card to play'; }

  update(dt) { this.scene.update(dt); this.hint(); const nav = document.getElementById('hub-nav'); if (nav) nav.style.display = this.app.engine.portrait ? 'flex' : 'none'; }

  unmount() {
    this._unProfile?.(); this.scene.dispose(); this.root.remove();
    this.sheets.forEach((s) => s.close()); this.sheets = [];
  }

  sh(opts) { const s = sheet(opts); this.sheets.push(s); return s; }

  // ------------------------------------------------------------------ avatar picker
  pickAvatar() {
    const s = this.sh({ title: 'Choose your avatar', body: '' });
    const draw = () => {
      const tiles = AVATARS.map((a) => h('span', { class: 'av' + (a === profile.avatar ? ' on' : ''), html: badgeHTML(a, profile.look.frame, 64), onclick: () => { profile.set({ avatar: a }); draw(); } }));
      s.body.replaceChildren(h('div', { class: 'cz-avatars', style: { justifyContent: 'center', gap: '12px' } }, tiles), h('p', { class: 'muted center' }, 'Frames live in Customize → Avatar Frames.'));
    };
    draw();
  }

  // ------------------------------------------------------------------ game mode picker
  openGame(gameId) {
    const G = GAMES[gameId];
    const s = this.sh({ title: G.name, body: '', cls: 'gamesheet' });
    const show = (v) => s.body.replaceChildren(v);
    const back = (fn) => h('button', { class: 'back-link', onclick: fn }, '‹ Back');
    const modeCard = (id, title, sub, color, fn) => h('button', { class: 'mode-card', id: 'mode-' + id, style: { '--mc': color }, onclick: fn }, h('span', { html: modeIcon(id) }), h('div', null, h('b', null, title), h('br'), h('span', null, sub)));
    const modes = () => show(h('div', null,
      h('p', { class: 'muted center', style: { margin: '0 0 6px' } }, `${G.tagline} · ${G.min}-${G.max} players`),
      h('div', { class: 'mode-grid' },
        modeCard('online', 'Online', 'Room code + link', '#37e3ff', () => online()),
        modeCard('local', 'Local', 'Pass & play on one device', '#ffd23f', () => local()),
        modeCard('bot', 'vs Bots', 'Easy · Normal · Hard', '#ff5fa2', () => bots()))));
    const spin = (msg) => h('div', { class: 'center', style: { padding: '30px 0' } }, h('div', { class: 'muted' }, msg));

    const online = () => {
      const code = codeInput((c, enter) => { joinBtn.disabled = c.length < 4; if (enter && c.length === 4) doJoin(); });
      const joinBtn = h('button', { class: 'btn c', id: 'btn-join-go', disabled: true, onclick: () => doJoin() }, 'Join');
      const doJoin = () => { const c = code.get(); if (c.length === 4) { s.close(); this.joinRoom(c); } };
      show(h('div', null, back(modes),
        h('button', { class: 'btn g big', id: 'btn-create', style: { width: '100%' }, onclick: async () => { show(spin('Opening a room…')); try { const session = await Session.createHost(gameId, profile.publicLook()); s.close(); this.openLobby(session); } catch (e) { toast(e.message, 'error', 5000); online(); } } }, 'Create room'),
        h('p', { class: 'muted center', style: { margin: '14px 0 0' } }, 'Get a 4-letter code and a link to share'),
        h('label', { class: 'field center' }, 'or join a friend'), code.el, h('div', { class: 'row', style: { justifyContent: 'center' } }, joinBtn)));
      setTimeout(() => code.focus(), 60);
    };

    const local = () => {
      let n = 2, timer = store.get('timerOn', true), rotate = true;
      const names = [profile.name, 'Player 2', 'Player 3', 'Player 4'];
      const box = h('div');
      const draw = () => {
        box.replaceChildren(
          h('label', { class: 'field' }, 'Players'),
          h('div', { class: 'opts' }, [2, 3, 4].filter((k) => k <= G.max).map((k) => h('button', { class: 'chip' + (n === k ? ' on' : ''), onclick: () => { n = k; draw(); } }, k + ' players'))),
          h('label', { class: 'field' }, 'Names'),
          ...Array.from({ length: n }, (_, i) => h('input', { class: 'text', style: { marginBottom: '8px' }, value: names[i], maxlength: 14, oninput: (e) => { names[i] = e.target.value.slice(0, 14) || 'Player ' + (i + 1); } })),
          gameId === 'ludo' ? h('div', { class: 'opts', style: { marginTop: '6px' } },
            h('button', { class: 'chip' + (timer ? ' on' : ''), onclick: () => { timer = !timer; store.set('timerOn', timer); draw(); } }, '30s turn timer'),
            h('button', { class: 'chip' + (rotate ? ' on' : ''), onclick: () => { rotate = !rotate; draw(); } }, 'Rotate view to current player')) : null,
          gameId !== 'ludo' ? h('p', { class: 'muted', style: { fontSize: '.85rem' } }, gameId === 'snake' ? 'Steer: P1 A/D · P2 ←/→ · P3 J/L · P4 gamepad. Boost: W / ↑ / I. Gamepads are picked up automatically.' : 'P1 WASD + mouse (click), P2 arrow keys + Enter to fire (auto-aims where you move), gamepads supported.') : null);
      };
      draw();
      show(h('div', null, back(modes), box, h('div', { class: 'row', style: { marginTop: '12px', justifyContent: 'flex-end' } }, h('button', { class: 'btn y big', id: 'btn-start-local', onclick: () => {
        const used = [profile.look.skin]; const seats = [];
        for (let i = 0; i < n; i++) { let look = i === 0 ? profile.look : randomLook(itemOf('skin', profile.look.skin).theme, used); used.push(look.skin); seats.push({ kind: 'human', name: names[i], avatar: i === 0 ? profile.avatar : AVATARS[(i * 3 + 2) % AVATARS.length], look }); }
        s.close(); this.startOffline(gameId, 'local', seats, { timer, rotate });
      } }, 'Start'))));
    };

    const bots = () => {
      let opp = Math.min(3, G.max - 1), level = 'normal', timer = store.get('timerOn', true);
      const box = h('div');
      const draw = () => box.replaceChildren(
        h('label', { class: 'field' }, 'Opponents'),
        h('div', { class: 'opts' }, [1, 2, 3].map((k) => h('button', { class: 'chip' + (opp === k ? ' on' : ''), onclick: () => { opp = k; draw(); } }, k + (k === 1 ? ' bot' : ' bots')))),
        h('label', { class: 'field' }, 'Difficulty'),
        h('div', { class: 'opts' }, LEVELS.map(([k, n]) => h('button', { class: 'chip' + (level === k ? ' on' : ''), id: 'lvl-' + k, onclick: () => { level = k; draw(); } }, n))),
        gameId === 'ludo' ? h('div', { class: 'opts', style: { marginTop: '12px' } }, h('button', { class: 'chip' + (timer ? ' on' : ''), onclick: () => { timer = !timer; store.set('timerOn', timer); draw(); } }, '30s turn timer')) : null);
      draw();
      show(h('div', null, back(modes), box, h('div', { class: 'row', style: { marginTop: '12px', justifyContent: 'flex-end' } }, h('button', { class: 'btn y big', id: 'btn-start-bots', onclick: () => {
        const seats = [{ kind: 'human', name: profile.name, avatar: profile.avatar, look: profile.look }]; const used = [profile.look.skin], names = [];
        for (let i = 0; i < opp; i++) { const b = botSeat(level, names); names.push(b.name); b.look = randomLook(null, used); used.push(b.look.skin); seats.push(b); }
        s.close(); this.startOffline(gameId, 'bots', seats, { timer, rotate: false });
      } }, 'Start'))));
    };
    modes();
    return s;
  }

  startOffline(gameId, mode, seats, opts) {
    const session = Session.offline(gameId, mode, seats, opts);
    session.start(opts);
    this.app.launch(session);
  }

  // ------------------------------------------------------------------ joining
  joinSheet() {
    const s = this.sh({ title: 'Join a room', body: '' });
    const code = codeInput((c, enter) => { go.disabled = c.length < 4; if (enter && c.length === 4) { s.close(); this.joinRoom(c); } });
    const go = h('button', { class: 'btn c big', id: 'btn-join-code', disabled: true, onclick: () => { s.close(); this.joinRoom(code.get()); } }, 'Join');
    s.body.append(h('p', { class: 'muted center', style: { margin: '0' } }, 'Type the 4-letter code from your friend'), code.el, h('div', { class: 'row', style: { justifyContent: 'center' } }, go));
    setTimeout(() => code.focus(), 60);
  }

  async joinRoom(code, rejoin = false) {
    code = cleanCode(code);
    const wait = this.sh({ title: 'Joining ' + code, body: h('div', { class: 'center muted', style: { padding: '24px 0' } }, 'Connecting peer-to-peer…'), closable: false });
    try {
      const session = await Session.joinRoom(code, profile.publicLook(), rejoin);
      wait.close();
      if (session.phase === 'playing' && session.cfg) { toast('Rejoined ' + code, 'good'); this.app.launch(session, { rejoin: true }); }
      else this.openLobby(session);
    } catch (e) {
      wait.close(); toast(e.message || 'Could not join', 'error', 5000);
      store.del('lastRoom'); this.buildBottom();
    }
  }

  // ------------------------------------------------------------------ lobby
  openLobby(session) {
    const isHost = session.isHost;
    const s = this.sh({ title: 'Room', body: '', closable: false, cls: 'lobby' });
    const link = `${location.origin}${location.pathname}?room=${session.code}${['peerhost', 'peerport', 'peerpath', 'peersecure'].map((k) => (params.get(k) ? `&${k}=${params.get(k)}` : '')).join('')}`;
    const body = s.body;
    const statusEl = h('span', { class: 'status-pill' }, h('i'), h('span', null, 'Connected'));
    const render = () => {
      const G = GAMES[session.game]; if (!G) return;
      s.setTitle(G.name + ' room');
      const seatEls = session.seats.slice(0, G.max).map((st) => {
        const mine = session.mySeats.includes(st.i);
        const info = st.kind === 'open' ? h('div', { class: 'grow nm muted' }, 'Waiting for a player…')
          : h('div', { class: 'grow' }, h('span', { class: 'nm' }, st.kind === 'bot' ? (st.name || 'Bot') : st.name), st.i === 0 ? h('span', { class: 'tag host' }, 'HOST') : null, st.kind === 'bot' ? h('span', { class: 'tag bot' }, 'BOT · ' + st.level.toUpperCase()) : null, st.kind === 'human' && !st.online ? h('span', { class: 'tag away' }, 'AWAY') : null);
        const ctl = [];
        if (isHost && st.i > 0) {
          if (st.kind === 'open') LEVELS.forEach(([k, n]) => ctl.push(h('button', { class: 'btn small dark', onclick: () => session.setSeatBot(st.i, k) }, '+ ' + n)));
          else ctl.push(h('button', { class: 'btn small r', onclick: () => session.setSeatOpen(st.i) }, st.kind === 'bot' ? 'Remove' : 'Kick'));
        }
        return h('div', { class: 'seat' + (st.kind === 'open' ? ' open' : '') + (mine ? ' me' : '') }, st.kind === 'open' ? h('span', { class: 'badge-wrap', style: { width: '44px', height: '44px', opacity: 0.35 }, html: badgeHTML('bot', 'hex', 44) }) : h('span', { html: badgeHTML(st.avatar, st.look?.frame || 'sakura', 44) }), info, h('div', { class: 'row', style: { gap: '6px', justifyContent: 'flex-end' } }, ctl));
      });
      const gameChips = isHost ? h('div', { class: 'opts', style: { justifyContent: 'center', marginBottom: '6px' } }, Object.values(GAMES).map((g) => h('button', { class: 'chip' + (session.game === g.id ? ' on' : ''), onclick: () => session.setGame(g.id) }, g.name))) : null;
      const can = session.canStart();
      body.replaceChildren(...[
        gameChips,
        h('label', { class: 'field center', style: { margin: '2px 0' } }, 'Room code'),
        h('div', { class: 'codebox', id: 'room-code' }, session.code.split('').map((c) => h('span', null, c))),
        h('div', { class: 'linkrow' }, h('code', { id: 'room-link' }, link),
          h('button', { class: 'btn small c', onclick: async () => { const ok = await copyText(link); toast(ok ? 'Link copied!' : 'Copy failed', ok ? 'good' : 'error'); } }, 'Copy'),
          navigator.share ? h('button', { class: 'btn small g', onclick: () => navigator.share({ title: 'Game Night 3D', text: `Join my ${G.name} room: ${session.code}`, url: link }).catch(() => {}) }, 'Share') : null),
        h('div', { class: 'seats', id: 'seats' }, seatEls),
        h('div', { class: 'row', style: { justifyContent: 'space-between' } },
          h('div', { class: 'row' }, statusEl, h('button', { class: 'btn small dark', id: 'btn-leave', onclick: () => { session.close(); s.close(); this.buildBottom(); } }, 'Leave')),
          isHost ? h('button', { class: 'btn y big', id: 'btn-start', disabled: !can, onclick: () => session.start({ timer: store.get('timerOn', true), rotate: false }) }, can ? 'Start game' : 'Need 2+ players') : h('span', { class: 'muted' }, 'Waiting for the host to start…'))].filter(Boolean));
    };
    const offs = [
      session.on('room', render),
      session.on('start', () => { offs.forEach((o) => o()); s.close(); this.app.launch(session); }),
      session.on('closed', (why) => { offs.forEach((o) => o()); s.close(); toast(why || 'Room closed', 'error', 4000); session.close(); this.buildBottom(); }),
      session.on('status', (st) => { statusEl.classList.toggle('bad', st !== 'ok'); statusEl.lastChild.textContent = st === 'ok' ? 'Connected' : 'Reconnecting…'; }),
    ];
    render();
    return s;
  }
}
