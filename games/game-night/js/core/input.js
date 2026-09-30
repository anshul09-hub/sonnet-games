// Input: keyboard, gamepads and floating virtual sticks/buttons for touch.
import { h } from './ui.js';

export class Keys {
  constructor() {
    this.down = new Set(); this.hit = new Set();
    this._kd = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (!this.down.has(e.code)) this.hit.add(e.code);
      this.down.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._ku = (e) => { this.down.delete(e.code); };
    this._blur = () => this.down.clear();
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('blur', this._blur);
  }
  is(...codes) { return codes.some((c) => this.down.has(c)); }
  axis(neg, pos) { return (this.is(...[].concat(pos)) ? 1 : 0) - (this.is(...[].concat(neg)) ? 1 : 0); }
  /** true once per physical key press */
  pressed(...codes) { for (const c of codes) if (this.hit.has(c)) { return true; } return false; }
  endFrame() { this.hit.clear(); }
  dispose() { removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('blur', this._blur); }
}

/** Gamepad snapshot for pad index i: sticks with deadzone and a few buttons. */
export function readPad(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = pads[i];
  if (!p || !p.connected) return null;
  const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
  return { lx: dz(p.axes[0] || 0), ly: dz(p.axes[1] || 0), rx: dz(p.axes[2] || 0), ry: dz(p.axes[3] || 0), a: !!p.buttons[0]?.pressed, b: !!p.buttons[1]?.pressed, rt: (p.buttons[7]?.value || 0) > 0.3 || !!p.buttons[5]?.pressed, lt: (p.buttons[6]?.value || 0) > 0.3 || !!p.buttons[4]?.pressed };
}
export const padCount = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter((p) => p && p.connected).length : 0);

/**
 * Floating virtual stick. The zone is a transparent element; on touch the base appears where the finger lands.
 * `out` holds x,y in -1..1 (y down is positive), mag 0..1 and active.
 */
export class VirtualStick {
  constructor(root, { left = '0', right = '50%', top = '30%', bottom = '0', color = '#fff', radius = 58, label = '', anchor = [0.5, 0.78] } = {}) {
    this.out = { x: 0, y: 0, mag: 0, active: false, angle: 0 };
    this.radius = radius; this.id = null; this.color = color; this.anchor = anchor;
    this.zone = h('div', { class: 'vstick-zone', style: { left, right, top, bottom } });
    this.base = h('div', { class: 'vstick-base', style: { width: radius * 2 + 'px', height: radius * 2 + 'px', borderColor: color } }, label ? h('span', null, label) : null);
    this.knob = h('div', { class: 'vstick-knob', style: { background: color } });
    this.base.append(this.knob); this.zone.append(this.base);
    root.append(this.zone);
    this._rest();
    this.zone.addEventListener('pointerdown', (e) => this._down(e));
    this.zone.addEventListener('pointermove', (e) => this._move(e));
    const up = (e) => this._up(e);
    this.zone.addEventListener('pointerup', up); this.zone.addEventListener('pointercancel', up);
  }
  _pos(e) { const r = this.zone.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  _down(e) {
    if (this.id != null) return;
    this.id = e.pointerId; this.zone.setPointerCapture(e.pointerId);
    const p = this._pos(e); this.origin = p;
    this.base.style.left = p.x - this.radius + 'px'; this.base.style.top = p.y - this.radius + 'px';
    this.base.style.opacity = '.85'; this.out.active = true; this._move(e);
  }
  _move(e) {
    if (e.pointerId !== this.id) return;
    const p = this._pos(e); let dx = p.x - this.origin.x, dy = p.y - this.origin.y;
    const d = Math.hypot(dx, dy), max = this.radius;
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    this.knob.style.transform = `translate(${dx}px,${dy}px)`;
    const mag = Math.min(1, d / max);
    this.out.x = dx / max; this.out.y = dy / max; this.out.mag = mag < 0.12 ? 0 : mag; this.out.angle = Math.atan2(dy, dx);
  }
  _up(e) {
    if (e.pointerId !== this.id) return;
    this.id = null; this.out.x = this.out.y = this.out.mag = 0; this.out.active = false;
    this.knob.style.transform = 'translate(0,0)';
    this._rest();
  }
  _rest() {
    this.base.style.opacity = '.28';
    this.base.style.left = `calc(${this.anchor[0] * 100}% - ${this.radius}px)`;
    this.base.style.top = `calc(${this.anchor[1] * 100}% - ${this.radius}px)`;
  }
  show(v) { this.zone.style.display = v ? '' : 'none'; }
  dispose() { this.zone.remove(); }
}

/** Big round touch button (hold state). */
export class TouchButton {
  constructor(root, { label, color = '#ffd23f', right = '20px', bottom = '20px', size = 78 }) {
    this.down = false; this.pressedFlag = false;
    this.el = h('div', { class: 'tbtn', style: { right, bottom, width: size + 'px', height: size + 'px', background: `radial-gradient(circle at 35% 30%, #fff8, ${color} 60%)`, borderColor: color } }, label);
    const on = (e) => { e.preventDefault(); this.down = true; this.pressedFlag = true; this.el.classList.add('on'); };
    const off = (e) => { e.preventDefault(); this.down = false; this.el.classList.remove('on'); };
    this.el.addEventListener('pointerdown', on); this.el.addEventListener('pointerup', off); this.el.addEventListener('pointercancel', off); this.el.addEventListener('pointerleave', off);
    root.append(this.el);
  }
  consume() { const f = this.pressedFlag; this.pressedFlag = false; return f; }
  show(v) { this.el.style.display = v ? '' : 'none'; }
  dispose() { this.el.remove(); }
}
