// Token registry: buildToken(skinId, playerColor) -> {group, height, radius, tick(t,dt)}
import { kit, finish } from './token-kit.js';
import { anime } from './tokens-anime.js';
import { gamer } from './tokens-gamer.js';
import { tech } from './tokens-tech.js';
import { ITEMS } from './catalog.js';

const BUILDERS = { anime, gamer, tech };
export function skinTheme(id) { return (ITEMS.skin.find((s) => s.id === id) || ITEMS.skin[0]).theme; }

export function buildToken(id, playerColor = 0xff4d5e) {
  let theme = skinTheme(id);
  let fn = BUILDERS[theme][id];
  if (!fn) { theme = 'anime'; id = 'samurai'; fn = anime.samurai; }
  const K = kit(theme, playerColor);
  const height = fn(K, playerColor);
  const tok = finish(K, height, 0.36, { id, theme });
  return tok;
}
