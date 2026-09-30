// Tiny DOM helpers: hyperscript, toasts, modal sheets, click sounds.
import { audio } from '../audio/audio.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

let toastRoot = null;
export function toast(msg, kind = 'info', ms = 2400) {
  toastRoot ||= document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + kind }, msg);
  toastRoot.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); setTimeout(() => t.remove(), 300); }, ms);
  return t;
}

/** Modal sheet. Returns {el, close}. */
export function sheet({ title, body, wide = false, onClose, cls = '', closable = true }) {
  const root = document.getElementById('ui');
  const back = h('div', { class: 'sheet-back' });
  const box = h('div', { class: 'sheet ' + cls + (wide ? ' wide' : '') },
    h('div', { class: 'sheet-head' }, h('h2', null, title || ''), closable ? h('button', { class: 'x', 'aria-label': 'Close', onclick: () => api.close() }, '✕') : null),
    h('div', { class: 'sheet-body' }, body));
  back.append(box);
  root.append(back);
  requestAnimationFrame(() => back.classList.add('in'));
  const api = {
    el: box, body: box.querySelector('.sheet-body'), setTitle: (t) => { box.querySelector('h2').textContent = t; },
    close() { if (api.closed) return; api.closed = true; back.classList.remove('in'); setTimeout(() => back.remove(), 220); onClose?.(); },
  };
  if (closable) back.addEventListener('pointerdown', (e) => { if (e.target === back) api.close(); });
  return api;
}

export function btn(label, opts = {}) {
  return h('button', { class: 'btn ' + (opts.cls || ''), onclick: opts.onClick, disabled: opts.disabled, title: opts.title }, opts.icon ? h('span', { class: 'ico' }, opts.icon) : null, label);
}

/** One global listener: any button press gets the UI click sound, and the audio context is unlocked. */
export function installGlobalUi() {
  const unlock = () => audio.unlock();
  addEventListener('pointerdown', unlock, { capture: true });
  addEventListener('keydown', unlock, { capture: true });
  addEventListener('touchend', unlock, { capture: true });
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button, .clickable, .chip, .tile');
    if (b && !b.disabled && !b.dataset.nosound) audio.sfx('click');
  }, true);
  document.addEventListener('pointerover', (e) => {
    const b = e.target.closest('button, .tile');
    if (b && !b.disabled && e.pointerType === 'mouse' && b !== installGlobalUi.last) { installGlobalUi.last = b; audio.sfx('hover'); }
  });
}

export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return s + 's'; }
export function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = h('textarea', { style: { position: 'fixed', opacity: 0 } }); ta.value = text; document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { /* */ } ta.remove(); return ok;
}
