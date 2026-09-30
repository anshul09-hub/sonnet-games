// Pure Ludo rules engine. No DOM, no three.js: runs in the host, in the bots, and in Node tests.
//
// Board model: a 15x15 grid. 52 shared track squares (clockwise), each colour has a 5-square home lane and a centre home.
// Token position `p` (relative to its own colour):  -1 = in base, 0 = start square, 1..50 = shared track,
// 51..55 = home lane, 56 = home (finished). A token needs an exact roll to reach 56.

export const COLORS = ['red', 'green', 'yellow', 'blue']; // clockwise: top-left, top-right, bottom-right, bottom-left
export const COLOR_HEX = [0xff4d5e, 0x3ddc6a, 0xffd23f, 0x3aa0ff];
export const START_ABS = [0, 13, 26, 39];
export const TRACK_LEN = 52;
export const HOME = 56;
export const SAFE_ABS = new Set([0, 13, 26, 39, 8, 21, 34, 47]); // start squares + star squares
export const STAR_ABS = [8, 21, 34, 47];

/** (col,row) of each of the 52 track squares, clockwise starting at red's start square. */
export const TRACK = (() => {
  const t = [];
  for (let c = 1; c <= 5; c++) t.push([c, 6]);
  for (let r = 5; r >= 0; r--) t.push([6, r]);
  t.push([7, 0], [8, 0]);
  for (let r = 1; r <= 5; r++) t.push([8, r]);
  for (let c = 9; c <= 14; c++) t.push([c, 6]);
  t.push([14, 7], [14, 8]);
  for (let c = 13; c >= 9; c--) t.push([c, 8]);
  for (let r = 9; r <= 14; r++) t.push([8, r]);
  t.push([7, 14], [6, 14]);
  for (let r = 13; r >= 9; r--) t.push([6, r]);
  for (let c = 5; c >= 0; c--) t.push([c, 8]);
  t.push([0, 7], [0, 6]);
  return t;
})();

/** home lane squares (5 each) per colour */
export const LANE = [
  [1, 2, 3, 4, 5].map((c) => [c, 7]),
  [1, 2, 3, 4, 5].map((r) => [7, r]),
  [13, 12, 11, 10, 9].map((c) => [c, 7]),
  [13, 12, 11, 10, 9].map((r) => [7, r]),
];
/** base origin (top-left cell) and the 4 token parking slots (cell centres) per colour */
export const BASE_ORIGIN = [[0, 0], [9, 0], [9, 9], [0, 9]];
export const BASE_SLOTS = BASE_ORIGIN.map(([ox, oy]) => [[1.5, 1.5], [3.5, 1.5], [1.5, 3.5], [3.5, 3.5]].map(([x, y]) => [ox + x + 0.5, oy + y + 0.5]));
export const HOME_CENTER = [7.5, 7.5];

export const absOf = (colorIdx, rel) => (START_ABS[colorIdx] + rel) % TRACK_LEN;
export const isSafeRel = (colorIdx, rel) => rel === 0 || (rel >= 1 && rel <= 50 && SAFE_ABS.has(absOf(colorIdx, rel)));

/** Cell centre (grid units, cell centres at .5) for a token, ignoring stacking offsets. */
export function cellOf(colorIdx, rel, tokIdx = 0) {
  if (rel < 0) return BASE_SLOTS[colorIdx][tokIdx];
  if (rel <= 50) { const [c, r] = TRACK[absOf(colorIdx, rel)]; return [c + 0.5, r + 0.5]; }
  if (rel <= 55) { const [c, r] = LANE[colorIdx][rel - 51]; return [c + 0.5, r + 0.5]; }
  // home: sit in the triangle belonging to the colour
  const d = [[-0.9, 0], [0, -0.9], [0.9, 0], [0, 0.9]][colorIdx];
  return [HOME_CENTER[0] + d[0], HOME_CENTER[1] + d[1]];
}

/** Which colours play: 2 players sit opposite each other. */
export function colorsFor(n) { return n === 2 ? [0, 2] : n === 3 ? [0, 1, 2] : [0, 1, 2, 3]; }

// ------------------------------------------------------------------------------------------------ state
export function newGame(n, opts = {}) {
  const colors = colorsFor(n);
  return {
    n, colors,
    tokens: colors.map(() => [-1, -1, -1, -1]),
    turn: 0, phase: 'roll', roll: null, sixes: 0, legal: [], winner: null, turnNo: 1, rolls: 0,
    stats: colors.map(() => ({ captures: 0, captured: 0, sixes: 0, rolls: 0, steps: 0, home: 0, forfeits: 0 })),
    order: [],
    opts,
  };
}
export const cloneState = (s) => JSON.parse(JSON.stringify(s));

export function legalMoves(state, seat, roll) {
  const out = [];
  const t = state.tokens[seat];
  for (let i = 0; i < 4; i++) {
    const p = t[i];
    if (p === HOME) continue;
    if (p < 0) { if (roll === 6) out.push(i); }
    else if (p + roll <= HOME) out.push(i);
  }
  return out;
}

/** Progress of a seat: sum of positions (base counts 0), used for podium ranking. */
export function progress(state, seat) { return state.tokens[seat].reduce((a, p) => a + Math.max(0, p + (p >= 0 ? 1 : 0)), 0); }

/**
 * Apply a dice result to the player whose turn it is. Returns the events to animate.
 * Third consecutive 6 forfeits the turn; otherwise the roll either has legal moves (phase 'move') or is skipped.
 */
export function applyRoll(state, value) {
  const ev = [];
  const seat = state.turn, st = state.stats[seat];
  st.rolls++; state.rolls++;
  state.roll = value;
  if (value === 6) { state.sixes++; st.sixes++; } else state.sixes = 0;
  ev.push({ t: 'roll', seat, v: value, sixes: state.sixes });
  if (state.sixes >= 3) {
    st.forfeits++;
    ev.push({ t: 'triple6', seat });
    nextTurn(state, ev);
    return ev;
  }
  const legal = legalMoves(state, seat, value);
  state.legal = legal;
  if (!legal.length) {
    ev.push({ t: 'nomove', seat });
    if (value === 6) { ev.push({ t: 'extra', seat, why: 'six' }); state.phase = 'roll'; state.roll = null; state.legal = []; }
    else nextTurn(state, ev);
    return ev;
  }
  state.phase = 'move';
  return ev;
}

/** Move one token by the current roll. */
export function applyMove(state, tok) {
  const ev = [];
  const seat = state.turn, color = state.colors[seat], roll = state.roll;
  if (state.phase !== 'move' || !state.legal.includes(tok)) throw new Error('illegal move');
  const from = state.tokens[seat][tok];
  const leave = from < 0;
  const to = leave ? 0 : from + roll;
  const path = leave ? [0] : Array.from({ length: roll }, (_, i) => from + 1 + i);
  state.tokens[seat][tok] = to;
  state.stats[seat].steps += leave ? 1 : roll;
  ev.push({ t: 'hop', seat, tok, from, to, path, leave });
  let extra = roll === 6 ? 'six' : null;
  // captures only on shared, non-safe track squares
  if (to >= 0 && to <= 50 && !SAFE_ABS.has(absOf(color, to))) {
    const abs = absOf(color, to);
    const victims = [];
    for (let s = 0; s < state.n; s++) {
      if (s === seat) continue;
      for (let k = 0; k < 4; k++) {
        const p = state.tokens[s][k];
        if (p >= 0 && p <= 50 && absOf(state.colors[s], p) === abs) victims.push({ seat: s, tok: k, from: p });
      }
    }
    if (victims.length) {
      for (const v of victims) { state.tokens[v.seat][v.tok] = -1; state.stats[v.seat].captured++; }
      state.stats[seat].captures += victims.length;
      ev.push({ t: 'capture', seat, tok, at: to, abs, victims });
      extra = extra || 'capture';
    }
  }
  if (to === HOME) {
    state.stats[seat].home++;
    ev.push({ t: 'home', seat, tok });
    extra = extra || 'home';
    if (state.tokens[seat].every((p) => p === HOME)) {
      state.winner = seat; state.phase = 'over'; state.legal = []; state.roll = null;
      ev.push({ t: 'win', seat });
      return ev;
    }
  }
  state.legal = []; state.roll = null;
  if (extra) { ev.push({ t: 'extra', seat, why: extra }); state.phase = 'roll'; }
  else nextTurn(state, ev);
  return ev;
}

function nextTurn(state, ev) {
  state.turn = (state.turn + 1) % state.n; state.sixes = 0; state.phase = 'roll'; state.roll = null; state.legal = []; state.turnNo++;
  ev.push({ t: 'turn', seat: state.turn });
}

/** Ranking for the podium: winner first, then by progress. */
export function ranking(state) {
  const seats = [...Array(state.n).keys()];
  return seats.sort((a, b) => (b === state.winner) - (a === state.winner) || progress(state, b) - progress(state, a));
}

// invariants used by tests
export function checkInvariants(state) {
  for (let s = 0; s < state.n; s++) for (const p of state.tokens[s]) if (!(p >= -1 && p <= HOME)) throw new Error('token out of range ' + p);
  return true;
}
