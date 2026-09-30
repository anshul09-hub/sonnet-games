// Victory dances: 24 motion functions (8 per theme). Each drives a token's transform from time t (seconds).
// fn(t, o) where o = {pos:{x,y,z}, rot:{y,x,z}, scale:{x,y,z}, fx(kind)}: mutate o to pose the token. Base pose is identity.
const S = Math.sin, C = Math.cos, PI = Math.PI;
const hop = (t, f, h) => Math.abs(S(t * f)) * h;
const squash = (o, k) => { o.scale.y = 1 - k * 0.28; o.scale.x = o.scale.z = 1 + k * 0.16; };

export const DANCES = {
  // ---- anime
  herospin(t, o) { const p = (t % 3.2) / 3.2; o.rot.y = p < 0.55 ? (p / 0.55) * PI * 4 : 0; o.pos.y = p < 0.55 ? S((p / 0.55) * PI) * 0.7 : (p < 0.75 ? 0 : hop(t, 9, 0.05)); o.rot.z = p > 0.6 ? S(t * 6) * 0.08 : 0; if (p > 0.55 && p < 0.6) o.fx?.('burst'); },
  chibi(t, o) { const k = S(t * 7); o.pos.y = Math.abs(k) * 0.55; squash(o, k < 0 ? 0 : 0); o.scale.y = 1 + Math.cos(t * 7) * 0.12; o.scale.x = o.scale.z = 1 - Math.cos(t * 7) * 0.07; o.rot.y = S(t * 3) * 0.5; },
  ninjaflip(t, o) { const p = (t % 2.4) / 2.4; if (p < 0.5) { const q = p / 0.5; o.rot.x = -q * PI * 2; o.pos.y = S(q * PI) * 0.9; } else { o.rot.x = 0; o.pos.y = 0; o.rot.y = S(t * 3) * 0.3; o.scale.y = 0.9; o.scale.x = o.scale.z = 1.05; } },
  sakuratwirl(t, o) { o.rot.y = t * 3.2; o.pos.y = 0.25 + S(t * 2.2) * 0.2; o.rot.z = S(t * 2.2) * 0.12; if (Math.random() < 0.3) o.fx?.('petal'); },
  idolwave(t, o) { o.rot.z = S(t * 4) * 0.28; o.pos.x = S(t * 4) * 0.18; o.pos.y = hop(t, 4, 0.12); o.rot.y = S(t * 2) * 0.4; if (Math.random() < 0.15) o.fx?.('sparkle'); },
  kabuki(t, o) { const p = (t % 1.6) / 1.6; o.pos.y = p < 0.25 ? S((p / 0.25) * PI) * 0.35 : 0; if (p > 0.25 && p < 0.3) o.fx?.('stomp'); o.rot.z = p > 0.25 ? -0.32 * Math.exp(-(p - 0.25) * 4) : 0; o.rot.y = S(t * 1.2) * 0.4; o.scale.y = p > 0.25 && p < 0.4 ? 0.85 : 1; },
  shakepose(t, o) { o.pos.y = 0.2 + hop(t, 3, 0.1); o.pos.x = S(t * 40) * 0.03; o.rot.z = S(t * 34) * 0.06; o.rot.y = S(t * 1.5) * 0.3; },
  bunnyhop(t, o) { const p = (t * 2.6) % 1; o.pos.y = S(p * PI) * 0.6; o.scale.y = p < 0.15 || p > 0.85 ? 0.8 : 1.08; o.scale.x = o.scale.z = p < 0.15 || p > 0.85 ? 1.15 : 0.95; o.rot.y = Math.floor(t * 2.6 / 2) * PI * 0.5; },
  // ---- gamer
  floss(t, o) { const k = S(t * 6); o.pos.x = k * 0.22; o.rot.z = -k * 0.32; o.rot.y = C(t * 6) * 0.35; o.pos.y = hop(t, 6, 0.06); },
  moonwalk(t, o) { o.pos.x = S(t * 1.6) * 0.5; o.rot.y = PI / 2 * (C(t * 1.6) > 0 ? 1 : -1) * 0.8; o.rot.z = -0.14 * (C(t * 1.6) > 0 ? 1 : -1); o.pos.y = Math.abs(S(t * 6.4)) * 0.05; },
  breakdance(t, o) { o.rot.z = PI; o.pos.y = 0.72 + Math.abs(S(t * 3)) * 0.04; o.rot.y = t * 9; o.pos.x = 0; },
  pogo(t, o) { const p = (t * 2.2) % 1; o.pos.y = S(p * PI) * 1.0; o.scale.y = p < 0.12 ? 0.75 : 1 + S(p * PI) * 0.15; o.scale.x = o.scale.z = p < 0.12 ? 1.2 : 1 - S(p * PI) * 0.08; },
  robotpop(t, o) { const q = Math.floor(t * 4); o.rot.y = (q % 4) * PI / 2 * 0.5; o.pos.x = ((q % 3) - 1) * 0.16; o.rot.z = q % 2 ? 0.16 : -0.16; o.pos.y = q % 2 ? 0.08 : 0; },
  bossstomp(t, o) { const p = (t % 1.4) / 1.4; o.pos.y = p < 0.4 ? S((p / 0.4) * PI / 1) * 0.5 : 0; if (p > 0.4 && p < 0.44) o.fx?.('stomp'); o.scale.y = p > 0.4 && p < 0.55 ? 0.7 : 1; o.scale.x = o.scale.z = p > 0.4 && p < 0.55 ? 1.3 : 1; },
  levelup(t, o) { const p = (t % 2.2) / 2.2; if (p < 0.4) { o.pos.y = S((p / 0.4) * PI) * 1.2; o.rot.y = (p / 0.4) * PI * 2; } else { o.pos.y = 0; } if (p > 0.38 && p < 0.42) o.fx?.('levelup'); const flash = p > 0.4 && p < 0.55 ? 1 : 0; o.flash = flash; },
  respawn(t, o) { const p = (t % 1.8) / 1.8; o.scale.x = o.scale.y = o.scale.z = p < 0.25 ? p / 0.25 : p > 0.8 ? Math.max(0.01, (1 - p) / 0.2) : 1; o.pos.y = p < 0.25 ? (1 - p / 0.25) * 0.5 : 0; o.rot.y = p * PI * 6; if (p < 0.03) o.fx?.('sparkle'); },
  // ---- tech
  robot(t, o) { const q = Math.floor(t * 2.4); o.rot.y = (q % 4) * PI / 2; const s = (t * 2.4) % 1; o.rot.y += s > 0.85 ? (s - 0.85) / 0.15 * PI / 2 : 0; o.pos.y = s < 0.1 ? 0.12 : 0; o.rot.z = q % 2 ? 0.05 : -0.05; },
  hoverspin(t, o) { const up = Math.min(1, t / 1.2); o.pos.y = 0.55 * up + S(t * 2) * 0.06 * up; o.rot.y = t * (2 + up * 8); o.rot.z = 0.12 * S(t * 2); },
  stutter(t, o) { const q = Math.floor(t * 12); const r = (Math.sin(q * 91.7) * 43758.5453) % 1; o.pos.x = Math.abs(r) > 0.6 ? (r - 0.3) * 0.5 : 0; o.pos.y = Math.abs(r * 7 % 1) > 0.7 ? 0.25 : 0; o.rot.y = q % 5 === 0 ? PI * r : 0; o.scale.x = q % 7 === 0 ? 1.5 : 1; o.glitch = q % 4 === 0 ? 1 : 0; },
  orbit(t, o) { o.pos.x = C(t * 2.2) * 0.6; o.pos.z = S(t * 2.2) * 0.6; o.pos.y = 0.4 + S(t * 4.4) * 0.12; o.rot.y = -t * 2.2 + PI / 2; },
  scan(t, o) { o.rot.y = S(t * 1.8) * 1.2; o.pos.x = S(t * 1.8) * 0.5; o.pos.y = hop(t, 3.6, 0.05); },
  matrix(t, o) { const k = (S(t * 0.9) + 1) / 2; o.rot.x = -k * 0.7; o.pos.z = k * -0.1; o.pos.y = k * -0.02; o.rot.y = S(t * 0.45) * 0.4; },
  pulse(t, o) { const k = (S(t * 5) + 1) / 2; const s = 1 + k * 0.28; o.scale.x = o.scale.y = o.scale.z = s; o.pos.y = k * 0.1; o.rot.y = t * 0.8; },
  levitate(t, o) { const k = Math.min(1, t / 2.5); o.pos.y = 0.15 + k * 0.9 + S(t * 1.6) * 0.06; o.rot.z = S(t * 1.3) * 0.14; o.rot.x = S(t * 1.1) * 0.1; o.rot.y = t * 0.6; },
};
