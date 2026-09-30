// TEMPORARY: exercises the session plumbing until the real games land.
import * as THREE from 'three';
import { h } from './core/ui.js';
export async function createGame({ app, session, rejoin }) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x160a3a);
  const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 50); cam.position.set(0, 2, 6); cam.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222266, 2));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xffd23f })); scene.add(cube);
  let root, txt, tick = 0, inputs = 0, iv;
  return {
    mount() {
      app.engine.setView(scene, cam);
      root = h('div', { style: { position: 'absolute', top: '10px', left: '10px', background: '#000a', padding: '10px', borderRadius: '10px', font: '14px monospace' }, id: 'stub' }, txt = h('pre', { id: 'stub-txt' }));
      document.getElementById('ui').append(root);
      session.attachGame((m, seat) => {
        if (session.isHost) { if (m.t === 'input') inputs++; if (m.t === 'sync?') session.sendToSeat(seat, { t: 'tick', n: tick }); }
        else if (m.t === 'tick') tick = m.n;
      });
      if (session.isHost) iv = setInterval(() => { tick++; session.broadcast({ t: 'tick', n: tick }); }, 200);
      else { session.input(session.mySeats[0], { t: 'sync?' }); iv = setInterval(() => session.input(session.mySeats[0], { t: 'input', n: tick }), 500); }
      session.on('seat', (i, on) => { window.__seatEvents = (window.__seatEvents || []).concat([[i, on]]); });
      session.on('status', (s) => { window.__status = s; });
      window.__stub = { session, get tick() { return tick; }, get inputs() { return inputs; } };
    },
    unmount() { clearInterval(iv); root?.remove(); },
    update(dt) { cube.rotation.y += dt; txt.textContent = `${session.isHost ? 'HOST' : 'GUEST'} game=${session.cfg.game} code=${session.code}\nmySeats=${session.mySeats}\nseats=${session.cfg.seats.map((s) => s.name + ':' + s.kind).join(', ')}\ntick=${tick} inputs=${inputs} status=${session.status} rejoin=${!!rejoin}\nbotControlled=${session.isHost ? [0, 1, 2, 3].map((k) => session.playSeats[k] ? session.botControlled(k) : '-').join(',') : ''}`; },
  };
}
