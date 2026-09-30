// Keyboard + gamepad input, with smoothed steering.
import { clamp } from './util.js';

const KEYS = {
  left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'],
  hand: ['ShiftLeft', 'ShiftRight', 'Space'], boost: ['KeyB'], reset: ['KeyR'],
};

export class Input {
  constructor() {
    this.down = new Set();
    this.pressed = new Set(); // edge-triggered until consumed
    this.steer = 0;
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    this.touch = { left: false, right: false, gas: false, brake: false, hand: false, boost: false };
  }
  held(name) { return KEYS[name].some((k) => this.down.has(k)); }
  wasPressed(code) { const p = this.pressed.has(code); return p; }
  consume(code) { this.pressed.delete(code); }
  endFrame() { this.pressed.clear(); }

  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  // returns {steer, throttle, brake, handbrake, boost, reset}
  read(dt, speed = 0) {
    const out = { steer: 0, throttle: 0, brake: 0, handbrake: false, boost: false, reset: false };
    if (!this.enabled) { this.steer = 0; return out; }
    const t = this.touch;
    let target = (this.held('right') || t.right ? 1 : 0) - (this.held('left') || t.left ? 1 : 0);
    let analog = null;
    const pad = this.pad();
    if (pad) {
      const ax = pad.axes[0] || 0;
      if (Math.abs(ax) > 0.12) analog = clamp((Math.abs(ax) - 0.12) / 0.88, 0, 1) * Math.sign(ax);
      const rt = pad.buttons[7]?.value || 0, lt = pad.buttons[6]?.value || 0;
      out.throttle = Math.max(out.throttle, rt); out.brake = Math.max(out.brake, lt);
      if (pad.buttons[0]?.pressed || pad.buttons[5]?.pressed) out.handbrake = true;
      if (pad.buttons[2]?.pressed || pad.buttons[1]?.pressed) out.boost = true;
      if (pad.buttons[3]?.pressed) out.reset = true;
    }
    if (analog !== null) this.steer = analog;
    else {
      // steering ramps slower at high speed so a keyboard can feather it
      const k = 1 - 0.5 * Math.min(1, Math.max(0, (speed - 20) / 40));
      const rate = (target === 0 ? 7 : Math.sign(target) !== Math.sign(this.steer) && this.steer !== 0 ? 9 : 4.2) * k;
      const d = target - this.steer;
      this.steer += clamp(d, -rate * dt, rate * dt);
    }
    out.steer = this.steer;
    if (this.held('up') || t.gas) out.throttle = 1;
    if (this.held('down') || t.brake) out.brake = 1;
    if (this.held('hand') || t.hand) out.handbrake = true;
    if (this.held('boost') || t.boost) out.boost = true;
    if (this.pressed.has('KeyR')) out.reset = true;
    return out;
  }
}
