// Customize screen: live 3D preview + category / theme browser. Everything saves to localStorage and applies in every game.
import { h, clear } from '../core/ui.js';
import { ICON } from '../core/icons.js';
import { CATEGORIES, ITEMS, THEMES, profile, itemOf, themeOf } from './catalog.js';
import { AVATARS, badgeHTML } from './avatars.js';
import { audio, packById } from '../audio/audio.js';

const CAT_ICON = { skin: 'token', scene: 'scene', dice: 'dice', finisher: 'sword', dance: 'dance', trail: 'trail', sound: 'music', frame: 'frame' };
const ACTION = { skin: null, scene: null, dice: ['Throw dice', 'dice'], finisher: ['Play finisher', 'sword'], dance: ['Dance!', 'dance'], trail: ['Hop', 'trail'], sound: ['Listen', 'music'], frame: null };

export class Customize {
  constructor(app, opts = {}) { this.app = app; this.cat = opts.cat || 'skin'; this.theme = 'all'; this.color = 0; }

  async mount() {
    const { engine } = this.app;
    const { Preview } = await import('./preview.js');
    this.preview = new Preview(engine, this.app);
    await this.preview.init();
    this.ui = document.getElementById('ui');
    this.root = h('div', { class: 'cz' });
    this.tabs = h('div', { class: 'cz-tabs' });
    this.themes = h('div', { class: 'cz-themes' });
    this.blurb = h('div', { class: 'cz-blurb' });
    this.avRow = h('div', { class: 'cz-avatars' });
    this.grid = h('div', { class: 'cz-grid', id: 'cz-grid' });
    this.info = h('div', { class: 'cz-info' });
    this.title = h('div', { class: 'cz-name' });
    this.actions = h('div', { class: 'cz-actions' });
    this.root.append(
      h('div', { class: 'cz-top' },
        h('button', { class: 'btn dark', id: 'cz-back', onclick: () => this.app.go('hub') }, h('span', { class: 'ico', html: ICON.back }), 'Back'),
        h('div', { class: 'logo', style: { fontSize: 'clamp(1.1rem,3.4vw,1.8rem)', transform: 'none' }, html: 'Customize' }),
        h('button', { class: 'btn icon dark', 'aria-label': 'Mute', html: audio.muted ? ICON.mute : ICON.sound, onclick: (e) => { audio.setMuted(!audio.muted); e.currentTarget.innerHTML = audio.muted ? ICON.mute : ICON.sound; } })),
      this.title, this.actions,
      h('div', { class: 'cz-panel' }, this.tabs, this.blurb, this.themes, this.avRow, this.grid, this.info));
    this.ui.append(this.root);
    this.drawTabs(); this.drawThemes(); this.drawGrid(); this.drawInfo();
    this.preview.show(this.cat);
    audio.playMusic(itemOf('skin', profile.look.skin).theme, { game: 'hub', energy: 0.5 });
  }

  unmount() { this.preview?.dispose(); this.root?.remove(); }
  update(dt) { this.preview.update(dt); }

  drawTabs() {
    clear(this.tabs);
    for (const c of CATEGORIES) this.tabs.append(h('button', { class: 'chip' + (c.id === this.cat ? ' on' : ''), id: 'tab-' + c.id, onclick: () => { this.cat = c.id; this.drawTabs(); this.drawGrid(); this.drawInfo(); this.preview.show(this.cat); } }, h('span', { class: 'ico', style: { width: '1.1em', height: '1.1em', display: 'inline-flex' }, html: ICON[CAT_ICON[c.id]] }), c.name));
    const cat = CATEGORIES.find((c) => c.id === this.cat);
    this.blurb.textContent = cat.blurb + ` · ${ITEMS[this.cat].length} items`;
    this.tabs.querySelector('.on')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }

  drawThemes() {
    clear(this.themes);
    const opts = [{ id: 'all', name: 'All' }, ...THEMES];
    for (const t of opts) {
      const n = t.id === 'all' ? ITEMS[this.cat].length : ITEMS[this.cat].filter((i) => i.theme === t.id).length;
      if (t.id !== 'all' && !n) continue;
      this.themes.append(h('button', { class: 'chip' + (this.theme === t.id ? ' on' : ''), dataset: { theme: t.id }, onclick: () => { this.theme = t.id; this.drawThemes(); this.drawGrid(); } }, `${t.name} ${n}`));
    }
  }

  drawGrid() {
    clear(this.grid);
    this.avRow.style.display = this.cat === 'frame' ? '' : 'none';
    if (this.cat === 'frame') { clear(this.avRow); for (const a of AVATARS) this.avRow.append(h('span', { class: 'av' + (a === profile.avatar ? ' on' : ''), html: badgeHTML(a, profile.look.frame, 40), onclick: () => { profile.set({ avatar: a }); this.drawGrid(); this.preview.show(this.cat); } })); }
    const list = ITEMS[this.cat].filter((i) => this.theme === 'all' || i.theme === this.theme);
    this.drawThemes();
    for (const it of list) {
      const on = profile.look[this.cat] === it.id;
      const sw = h('div', { class: 'sw', style: { '--a': it.c[0], '--b': it.c[1] }, html: this.cat === 'frame' ? badgeHTML(profile.avatar, it.id, 54) : ICON[CAT_ICON[this.cat]] });
      const tile = h('button', { class: 'tile' + (on ? ' on' : ''), dataset: { id: it.id }, title: it.desc, onclick: () => this.pick(it) }, sw, h('span', null, it.name), h('span', { class: 'th ' + it.theme }, themeOf(it.theme).name));
      this.grid.append(tile);
    }
  }

  drawInfo() {
    const it = itemOf(this.cat, profile.look[this.cat]);
    clear(this.info);
    this.info.append(h('div', { class: 'grow' }, h('b', null, it.name), h('div', { class: 'muted' }, it.desc)), h('span', { class: 'th ' + it.theme, style: { padding: '.2em .8em', borderRadius: '999px', fontWeight: 900, fontSize: '.7rem' } }, themeOf(it.theme).name.toUpperCase()));
    clear(this.title);
    this.title.append(h('h3', null, it.name), h('p', null, it.desc));
    if (this.cat === 'frame') this.title.append(h('div', { style: { marginTop: '14px' }, html: badgeHTML(profile.avatar, it.id, 150) }));
    clear(this.actions);
    const act = ACTION[this.cat];
    if (act) this.actions.append(h('button', { class: 'btn y', id: 'cz-action', onclick: () => this.preview.action(this.cat) }, h('span', { class: 'ico', html: ICON[act[1]] }), act[0]));
    if (this.cat === 'skin') for (const [i, c] of [[0, '#ff4d5e'], [1, '#3ddc6a'], [2, '#ffd23f'], [3, '#3aa0ff']]) this.actions.append(h('button', { class: 'btn icon', style: { '--b1': c, '--b2': c, '--bs': '#0006', width: '2.4em', height: '2.4em', outline: this.color === i ? '3px solid #fff' : 'none' }, 'aria-label': 'Preview colour ' + i, onclick: () => { this.color = i; this.preview.setColor(i); this.drawInfo(); } }));
  }

  pick(it) {
    profile.setLook(this.cat, it.id);
    if (this.cat === 'sound') { audio.setPack(it.id); audio.sfx('ok'); audio.jingle('start'); } else audio.sfx('ok');
    this.drawGrid(); this.drawInfo();
    this.preview.show(this.cat, true);
  }
}
