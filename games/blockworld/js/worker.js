// Web Worker: terrain generation + chunk meshing. Stateless; the main thread owns chunk data.
import { getTerrain } from './gen.js';
import { meshChunk } from './mesher.js';

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'gen') {
    const t0 = performance.now();
    const data = getTerrain(m.seed).generate(m.cx, m.cz, m.edits);
    self.postMessage({ type: 'gen', cx: m.cx, cz: m.cz, epoch: m.epoch, data, ms: performance.now() - t0 }, [data.buffer]);
  } else if (m.type === 'mesh') {
    const t0 = performance.now();
    const r = meshChunk(m.cx, m.cz, m.chunks, getTerrain(m.seed), m.ao);
    r.type = 'mesh'; r.ver = m.ver; r.epoch = m.epoch; r.ms = performance.now() - t0;
    self.postMessage(r, [r.pos.buffer, r.uv.buffer, r.col.buffer, r.idx.buffer]);
  }
};
