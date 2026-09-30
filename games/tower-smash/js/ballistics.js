import { GRAVITY, LAUNCH } from './config.js';

export const speedFor = (power) => LAUNCH.minSpeed + (LAUNCH.maxSpeed - LAUNCH.minSpeed) * power;
export const powerFor = (speed) => (speed - LAUNCH.minSpeed) / (LAUNCH.maxSpeed - LAUNCH.minSpeed);

// point on the ideal (drag-free) trajectory
export function arcPoint(o, alpha, speed, t, out = {}) {
  out.x = o.x + Math.cos(alpha) * speed * t;
  out.y = o.y + Math.sin(alpha) * speed * t + 0.5 * GRAVITY * t * t;
  return out;
}

// launch speed needed to pass through target T from origin o at angle alpha (null if impossible)
export function solveSpeed(o, alpha, T) {
  const g = -GRAVITY, dx = T.x - o.x, dy = T.y - o.y;
  const den = 2 * Math.cos(alpha) ** 2 * (dx * Math.tan(alpha) - dy);
  if (den <= 0) return null;
  return Math.sqrt(g * dx * dx / den);
}
