import { startStatic, startPeerServer, launch, newPage, report, sleep, SHOTS } from './harness.mjs';
export { startStatic, startPeerServer, launch, newPage, report, sleep, SHOTS };

/** Start a Ludo match in the page: mode 'bots' or 'local'. */
export async function startLudo(page, { players = 2, level = 'normal', mode = 'bots', scene = null, opts = {}, look = {} } = {}) {
  return page.evaluate(async ({ players, level, mode, opts, look }) => {
    const { Session } = await import('/js/net/session.js');
    const { profile, botSeat, randomLook } = await import('/js/customize/catalog.js');
    const seats = [{ kind: 'human', name: 'You', avatar: profile.avatar, look: { ...profile.look, ...look } }];
    for (let i = 1; i < players; i++) { if (mode === 'local') seats.push({ kind: 'human', name: 'P' + (i + 1), avatar: 'cat', look: randomLook(null, [profile.look.skin]) }); else { const b = botSeat(level, []); b.look = randomLook(null, [profile.look.skin]); seats.push(b); } }
    const s = Session.offline('ludo', mode, seats, { timer: true, rotate: false, ...opts });
    s.start(s.opts);
    await window.__gn.app.launch(s);
    return true;
  }, { players, level, mode, opts, look });
}

/** Start any game offline: mode 'bots' or 'local' (all seats human). */
export async function startGame(page, game, { players = 2, level = 'normal', mode = 'bots', opts = {}, look = {} } = {}) {
  return page.evaluate(async ({ game, players, level, mode, opts, look }) => {
    const { Session } = await import('/js/net/session.js');
    const { profile, botSeat, randomLook } = await import('/js/customize/catalog.js');
    const seats = [{ kind: 'human', name: 'You', avatar: profile.avatar, look: { ...profile.look, ...look } }];
    for (let i = 1; i < players; i++) { if (mode === 'local') seats.push({ kind: 'human', name: 'P' + (i + 1), avatar: 'cat', look: randomLook(null, [profile.look.skin]) }); else { const b = botSeat(level, []); b.look = randomLook(null, [profile.look.skin]); seats.push(b); } }
    const s = Session.offline(game, mode, seats, { timer: true, rotate: false, ...opts });
    s.start(s.opts);
    await window.__gn.app.launch(s);
    return true;
  }, { game, players, level, mode, opts, look });
}
