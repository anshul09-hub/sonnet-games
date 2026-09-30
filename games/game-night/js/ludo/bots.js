// Ludo bot brains (pure). Three difficulty levels choosing among the legal token moves.
import { absOf, SAFE_ABS, HOME, TRACK_LEN } from './rules.js';

/** How many enemy tokens could hit the square `abs` next turn (they sit 1..6 squares behind it on the shared track). */
function threats(state, seat, abs) {
  let n = 0;
  for (let s = 0; s < state.n; s++) {
    if (s === seat) continue;
    const c = state.colors[s];
    for (const p of state.tokens[s]) {
      if (p < 0 || p > 50) continue;
      const d = (abs - absOf(c, p) + TRACK_LEN) % TRACK_LEN;
      if (d >= 1 && d <= 6) n += 1 + (d === 6 ? 0.3 : 0);
    }
    // enemies waiting in base threaten their own start square when a 6 comes
    if (abs === absOf(c, 0) && state.tokens[s].some((p) => p < 0)) n += 0.25;
  }
  return n;
}

function simulateLanding(state, seat, tok, roll) {
  const color = state.colors[seat], from = state.tokens[seat][tok];
  const to = from < 0 ? 0 : from + roll;
  let captures = 0, victimProgress = 0;
  if (to >= 0 && to <= 50 && !SAFE_ABS.has(absOf(color, to))) {
    const abs = absOf(color, to);
    for (let s = 0; s < state.n; s++) {
      if (s === seat) continue;
      for (const p of state.tokens[s]) if (p >= 0 && p <= 50 && absOf(state.colors[s], p) === abs) { captures++; victimProgress += p; }
    }
  }
  return { from, to, captures, victimProgress };
}

export function chooseMove(state, seat, level, rnd = Math.random) {
  const moves = state.legal;
  if (moves.length === 1) return moves[0];
  const color = state.colors[seat], roll = state.roll;
  const scored = moves.map((tok) => {
    const { from, to, captures, victimProgress } = simulateLanding(state, seat, tok, roll);
    const onTrack = to >= 0 && to <= 50;
    const safeSquare = onTrack && SAFE_ABS.has(absOf(color, to));
    let sc = 0;
    if (level === 'easy') {
      sc = rnd() * 10 + (captures ? 6 : 0) + (to === HOME ? 4 : 0);
    } else {
      sc += captures * (60 + victimProgress * 0.6);
      if (to === HOME) sc += 70;
      if (from < 0) sc += 42;
      if (to >= 51) sc += 24; // entering the home lane is permanently safe
      if (safeSquare) sc += 18;
      sc += (to / HOME) * 12; // advance
      sc += from >= 0 ? from * 0.08 : 0; // prefer pushing the leader slightly
      if (level === 'hard') {
        const dangerNow = onTrackPos(from) && !isSafeNow(color, from) ? threats(state, seat, absOf(color, from)) : 0;
        const dangerThen = onTrack && !safeSquare ? threats(state, seat, absOf(color, to)) : 0;
        sc += dangerNow * 22; // escaping is good
        sc -= dangerThen * 30; // landing in danger is bad
        // stepping right in front of an enemy start with waiting tokens is risky, but capturing options dominate above
      } else sc += rnd() * 6;
    }
    return { tok, sc };
  });
  scored.sort((a, b) => b.sc - a.sc);
  return scored[0].tok;
}
const onTrackPos = (p) => p >= 0 && p <= 50;
const isSafeNow = (color, p) => p === 0 || SAFE_ABS.has(absOf(color, p));
