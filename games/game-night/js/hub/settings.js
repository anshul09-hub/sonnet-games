// Settings (graphics, volume) and How-to-play sheets. Reused from the hub and from in-game pause menus.
import { h, sheet } from '../core/ui.js';
import { audio } from '../audio/audio.js';
import { QUALITY } from '../core/engine.js';
import { store } from '../core/util.js';

export function openSettings(engine, { extra = [] } = {}) {
  const q = h('div', { class: 'opts' });
  const drawQ = () => { q.replaceChildren(...['low', 'medium', 'high'].map((k) => h('button', { class: 'chip' + (engine.level === k ? ' on' : ''), onclick: () => { engine.setQuality(k); drawQ(); } }, k[0].toUpperCase() + k.slice(1)))); };
  drawQ();
  const slider = (label, kind) => h('div', null, h('label', { class: 'field' }, label), h('input', { type: 'range', min: 0, max: 1, step: 0.01, value: audio.vol[kind], oninput: (e) => audio.setVolume(kind, +e.target.value) }));
  const desc = h('p', { class: 'muted', style: { fontSize: '.85rem', margin: '6px 0 0' } }, 'Low: no bloom, small shadows, sparse scenery. Medium: bloom + SMAA. High: 4x MSAA + bloom + SMAA + full scenery. Resolution adapts automatically to hold 60 fps.');
  const timerOn = store.get('timerOn', true);
  return sheet({
    title: 'Settings',
    body: [
      h('label', { class: 'field' }, 'Graphics'), q, desc,
      slider('Master volume', 'master'), slider('Music', 'music'), slider('Sound effects', 'sfx'),
      h('div', { class: 'row', style: { marginTop: '14px' } }, h('button', { class: 'btn small dark', onclick: () => { audio.setMuted(!audio.muted); } }, 'Toggle mute')),
      ...extra,
    ],
  });
}

export function openHelp() {
  const body = h('div', { class: 'helpbox', html: `
  <h3>Ludo</h3>
  <ul><li>Roll a <b>6</b> to bring a token out of base. Tokens race clockwise around the board, then up their coloured lane to the centre.</li>
  <li>Three 6s in a row lose the turn. A 6, a capture, or reaching home earns an extra turn.</li>
  <li>Land on an enemy token to <b>capture</b> it and send it home. <b>Star</b> and start squares are safe.</li>
  <li>You need the <b>exact</b> roll to reach home. You have 30 seconds per turn or the game plays for you.</li>
  <li><b>Throw the dice:</b> flick or drag the die and release, or just click it. <b>Move:</b> click a glowing token.</li></ul>
  <h3>Snake Arena</h3>
  <ul><li>Steer with <kbd>A</kbd>/<kbd>D</kbd> or <kbd>←</kbd>/<kbd>→</kbd>, hold <kbd>Space</kbd> to boost (costs length). On a phone drag the left side and tap BOOST.</li>
  <li>Eat orbs to grow. Hit another snake (or fall off the edge) and you burst into orbs. Last snake alive wins the round. Best of 3.</li></ul>
  <h3>Blaster Brawl</h3>
  <ul><li><kbd>WASD</kbd> move, mouse aim, click to shoot, <kbd>Shift</kbd> dash. Twin sticks on a phone.</li>
  <li>Shoot crates and walls, blow up red barrels, grab power-ups (shotgun, rocket, shield, speed). First to 10 knockouts wins.</li></ul>
  <h3>Playing online</h3>
  <ul><li>Create a room to get a 4-letter code and a share link. Friends open the link (works on phones) or type the code.</li>
  <li>If someone disconnects, a bot takes their seat. They can rejoin with the same code and the same device.</li></ul>` });
  return sheet({ title: 'How to play', body, wide: false });
}
