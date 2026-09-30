// Graphics presets and persisted settings.
export const QUALITY = {
  low: {
    id: 'low', label: 'Low', dpr: 1, shadows: false, shadowMap: 1024, shadowRange: 70, terrainShadows: false,
    bloom: false, bloomRes: 0.5, smaa: false, grade: false, headlights: false, vegetation: 0.35, clouds: false, particles: 0.55, skids: 2500,
  },
  medium: {
    id: 'medium', label: 'Medium', dpr: 1.5, shadows: true, shadowMap: 2048, shadowRange: 78, terrainShadows: false,
    bloom: true, bloomRes: 0.5, smaa: false, grade: true, headlights: true, vegetation: 0.7, clouds: true, particles: 0.85, skids: 5000,
  },
  high: {
    id: 'high', label: 'High', dpr: 2, shadows: true, shadowMap: 4096, shadowRange: 100, terrainShadows: true,
    bloom: true, bloomRes: 1, smaa: true, grade: true, headlights: true, vegetation: 1, clouds: true, particles: 1, skids: 8000,
  },
};

const KEY = 'driftKing.settings.v1';
export function loadSettings() {
  const d = { quality: 'medium', muted: false, volume: 0.8 };
  try { Object.assign(d, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  if (!QUALITY[d.quality]) d.quality = 'medium';
  return d;
}
export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
}
const BEST = 'driftKing.bestLap';
export function loadBest() {
  try { const v = parseFloat(localStorage.getItem(BEST)); return isFinite(v) && v > 0 ? v : null; } catch (e) { return null; }
}
export function saveBest(t) { try { localStorage.setItem(BEST, String(t)); } catch (e) { /* ignore */ } }
const BEST_RACE = 'driftKing.bestRace';
export function loadBestRace() {
  try { const v = parseFloat(localStorage.getItem(BEST_RACE)); return isFinite(v) && v > 0 ? v : null; } catch (e) { return null; }
}
export function saveBestRace(t) { try { localStorage.setItem(BEST_RACE, String(t)); } catch (e) { /* ignore */ } }
