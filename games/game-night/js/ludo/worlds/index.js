// World registry: scene id -> builder (loaded on demand so the hub stays light).
import { itemOf } from '../../customize/catalog.js';

export async function buildWorld(sceneId, ctx) {
  const theme = itemOf('scene', sceneId).theme;
  if (theme === 'anime') { const m = await import('./anime.js'); return m.buildAnimeWorld(ctx, sceneId); }
  if (theme === 'gamer') { const m = await import('./gamer.js'); return m.buildGamerWorld(ctx, sceneId); }
  const m = await import('./tech.js'); return m.buildTechWorld(ctx, sceneId);
}
