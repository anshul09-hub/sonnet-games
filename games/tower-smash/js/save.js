// Progress + settings persisted in localStorage (fails gracefully if unavailable).
const KEY = 'towerSmash.v1';

const defaults = () => ({
  stars: {}, shots: {},
  settings: { quality: 'medium', qualityManual: false, muted: false, music: 0.6, sfx: 0.85 },
});

export const Save = {
  data: defaults(),
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw), base = defaults();
        this.data = { ...base, ...d, settings: { ...base.settings, ...(d.settings || {}) } };
      }
    } catch (e) { this.data = defaults(); }
    return this.data;
  },
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ } },
  get settings() { return this.data.settings; },
  starsFor(id) { return this.data.stars[id] || 0; },
  shotsFor(id) { return this.data.shots[id] || 0; },
  totalStars() { return Object.values(this.data.stars).reduce((a, b) => a + b, 0); },
  isUnlocked(index) { return index === 0 || this.starsFor(index) > 0; },       // index is 0-based; id = index + 1
  highestUnlocked(total) { let i = 0; while (i + 1 < total && this.isUnlocked(i + 1)) i++; return i; },
  record(id, stars, shots) {
    const prevStars = this.starsFor(id), prevShots = this.shotsFor(id);
    const newBest = stars > prevStars || (stars === prevStars && (!prevShots || shots < prevShots));
    if (stars > prevStars) this.data.stars[id] = stars;
    if (!prevShots || shots < prevShots) this.data.shots[id] = shots;
    this.save();
    return { newBest, prevStars };
  },
  reset() { this.data = defaults(); this.save(); },
};
