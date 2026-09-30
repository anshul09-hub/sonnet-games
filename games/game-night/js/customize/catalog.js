// Customization catalog: metadata only (ids, names, themes, swatch colours). Builders live next to the code that uses them.
// Everything here is original: no real characters, brands or franchises.
import { SOUND_PACKS } from '../audio/audio.js';
import { store } from '../core/util.js';

export const THEMES = [
  { id: 'anime', name: 'Anime', color: '#ff7eb6', color2: '#ffc27a' },
  { id: 'gamer', name: 'Gamer', color: '#7dff6b', color2: '#4dd6ff' },
  { id: 'tech', name: 'Tech', color: '#c77dff', color2: '#00f0c8' },
];

export const CATEGORIES = [
  { id: 'skin', name: 'Tokens', blurb: 'Your playable character in every game' },
  { id: 'scene', name: 'Board Scenes', blurb: 'The world around the Ludo board' },
  { id: 'dice', name: 'Dice', blurb: 'Physics dice skins' },
  { id: 'finisher', name: 'Finishers', blurb: 'How you capture enemy tokens' },
  { id: 'dance', name: 'Victory Dances', blurb: 'Your winning celebration' },
  { id: 'trail', name: 'Move Trails', blurb: 'Particles behind your token' },
  { id: 'sound', name: 'Sound Packs', blurb: 'SFX timbre and music' },
  { id: 'frame', name: 'Avatar Frames', blurb: 'Frame around your avatar' },
];

const S = (id, theme, name, desc, c) => ({ id, theme, name, desc, c });

export const ITEMS = {
  skin: [
    S('samurai', 'anime', 'Samurai', 'Horned kabuto helm and a tiny banner', ['#ff4d6d', '#ffd23f']),
    S('ninja', 'anime', 'Shadow Ninja', 'Masked, scarf trailing in the wind', ['#2b2d42', '#ff4d6d']),
    S('fox', 'anime', 'Fox Spirit', 'Nine tails of spirit fire', ['#ff9a3c', '#fff1d6']),
    S('mecha', 'anime', 'Mecha Pilot', 'Cockpit dome, shoulder cannons', ['#4dd6ff', '#f5f5f5']),
    S('mahou', 'anime', 'Magical Girl', 'Star wand and twin ribbons', ['#ff8fd0', '#ffe66d']),
    S('oni', 'anime', 'Oni', 'Two horns, tusks and a big club', ['#e63946', '#3a2a5a']),
    S('ronincat', 'anime', 'Ronin Cat', 'Straw hat wandering swordcat', ['#f4a261', '#264653']),
    S('skypirate', 'anime', 'Sky Pirate', 'Tricorn hat and a floating balloon', ['#e9c46a', '#264653']),
    S('knight', 'gamer', 'Knight', 'Plumed helm, kite shield', ['#c0c7d4', '#e63946']),
    S('marine', 'gamer', 'Space Marine', 'Heavy armour, glowing visor', ['#4a6fa5', '#7dff6b']),
    S('speedrunner', 'gamer', 'Speedrunner', 'Streamlined, trailing speed lines', ['#ffd23f', '#4dd6ff']),
    S('pixelhero', 'gamer', 'Pixel Hero', 'Made of chunky voxels', ['#4dff88', '#ff4d6d']),
    S('sniper', 'gamer', 'Sniper', 'Hooded, giant scope', ['#556b2f', '#d4d4d4']),
    S('tank', 'gamer', 'Tank', 'Treads, turret and a cannon', ['#6b8e23', '#c2b280']),
    S('rogue', 'gamer', 'Rogue', 'Hood, twin daggers, cape', ['#6a4c93', '#ffd166']),
    S('dragon', 'gamer', 'Dragon', 'Wings, spikes, breathes sparks', ['#ef476f', '#ffd166']),
    S('robot', 'tech', 'Robo', 'Boxy bot with an antenna', ['#a8b2c1', '#ffd23f']),
    S('drone', 'tech', 'Quad Drone', 'Four spinning rotors', ['#2b2d42', '#00f0c8']),
    S('chip', 'tech', 'Microchip', 'Pins and a glowing core', ['#22223b', '#c77dff']),
    S('aiorb', 'tech', 'AI Orb', 'Floating eye inside orbiting rings', ['#7ad7ff', '#ffffff']),
    S('hologram', 'tech', 'Hologram', 'Flickering wireframe figure', ['#00f0c8', '#7ad7ff']),
    S('satellite', 'tech', 'Satellite', 'Solar panels and a dish', ['#e0e1dd', '#4dd6ff']),
    S('rocket', 'tech', 'Rocket', 'Fins, porthole, real flame', ['#f5f5f5', '#ff4d6d']),
    S('serverbot', 'tech', 'Server Bot', 'Rack of blinking lights', ['#3d405b', '#7dff6b']),
  ],
  scene: [
    S('meadow', 'anime', 'Sakura Meadow', 'Swaying grass, blossoms, villagers, snowy peaks', ['#8fe388', '#ffb7d5']),
    S('sunset', 'anime', 'Golden Hour', 'The same meadow at sunset', ['#ff9e64', '#b55fa8']),
    S('moonlit', 'anime', 'Moonlit Blossoms', 'Lanterns and fireflies under the moon', ['#3a3f9a', '#ffe08a']),
    S('neon', 'gamer', 'Neon Arena', 'Roaring crowd and sweeping stage lights', ['#ff2bd6', '#2be7ff']),
    S('synthwave', 'gamer', 'Synthwave Stadium', 'Retro sun over a glowing grid', ['#ff6ec7', '#7a2bff']),
    S('inferno', 'gamer', 'Inferno Colosseum', 'Lava glow, embers and a fiery crowd', ['#ff5a1f', '#ffd23f']),
    S('circuit', 'tech', 'Circuit City', 'Glowing traces and hovering drones', ['#00e5ff', '#0a3d62']),
    S('orbital', 'tech', 'Orbital Deck', 'A station above the planet', ['#7ad7ff', '#1b1f5e']),
    S('datasea', 'tech', 'Data Sea', 'Matrix-green streams and towers', ['#00ff9c', '#04210f']),
  ],
  dice: [
    S('sakura', 'anime', 'Sakura Ivory', 'Cream ivory with petal pips', ['#fff1e6', '#ff8fb1']),
    S('ink', 'anime', 'Ink Brush', 'Black lacquer, white ink pips', ['#1d1d2b', '#ffffff']),
    S('kitsune', 'anime', 'Kitsune Lacquer', 'Red lacquer, gold pips', ['#d62839', '#ffd166']),
    S('jade', 'anime', 'Jade Charm', 'Translucent jade', ['#3ddc97', '#0b6e4f']),
    S('tanabata', 'anime', 'Tanabata Star', 'Night blue, star pips', ['#233d8f', '#ffe66d']),
    S('koi', 'anime', 'Golden Koi', 'Gold with orange koi pips', ['#f4c542', '#e8590c']),
    S('moonrabbit', 'anime', 'Moon Rabbit', 'Soft white, gold moon pips', ['#f8f9fa', '#ffd43b']),
    S('ramen', 'anime', 'Ramen Swirl', 'Warm broth colours, naruto swirl', ['#f4a261', '#fff8e7']),
    S('lava', 'gamer', 'Lava Rock', 'Cooled rock with glowing cracks', ['#3b2a26', '#ff5a1f']),
    S('pixel', 'gamer', 'Pixel Cube', 'Green blocks, square pips', ['#2ecc71', '#0b3d20']),
    S('ice', 'gamer', 'Ice Crystal', 'Frosted glass', ['#bde7ff', '#4dabf7']),
    S('loot', 'gamer', 'Gold Loot', 'Shiny treasure', ['#ffd43b', '#7c4a03']),
    S('slime', 'gamer', 'Toxic Slime', 'Glowing green goo', ['#a6ff3d', '#2b5a00']),
    S('arcade', 'gamer', 'Arcade Neon', 'Magenta neon tubes', ['#ff2bd6', '#ffffff']),
    S('bomb', 'gamer', 'Mini Bomb', 'Black with orange fuse pips', ['#22252b', '#ff9f1c']),
    S('ruby', 'gamer', 'Ruby Red', 'Deep red gem cut', ['#c1121f', '#ffe3e3']),
    S('pcb', 'tech', 'Circuit Board', 'PCB green with copper traces', ['#0f7b4a', '#e0b44c']),
    S('holodie', 'tech', 'Hologram Glass', 'See-through cyan projection', ['#7ad7ff', '#e0fbff']),
    S('chrome', 'tech', 'Chrome Bit', 'Mirror metal', ['#d0d6de', '#20242c']),
    S('datacube', 'tech', 'Data Cube', 'Binary etched into blue', ['#1c3d99', '#7ad7ff']),
    S('plasma', 'tech', 'Plasma Core', 'Pulsing violet energy', ['#8a2be2', '#ffd1ff']),
    S('carbon', 'tech', 'Carbon Fiber', 'Woven black with red LEDs', ['#15171c', '#ff3860']),
    S('matrixdie', 'tech', 'Matrix Rain', 'Falling green glyphs', ['#02160b', '#00ff9c']),
    S('quantum', 'tech', 'Quantum Prism', 'Shifting rainbow sheen', ['#b388ff', '#64ffda']),
  ],
  finisher: [
    S('katana', 'anime', 'Katana Slice & Kick', 'Draw, slash, slice in two, then kick the halves into the grass', ['#e8f0ff', '#ff4d6d']),
    S('shuriken', 'anime', 'Shuriken Storm', 'A flurry of throwing stars dices the victim', ['#cfd8e3', '#ff9a3c']),
    S('spirit', 'anime', 'Spirit Fist', 'A giant ghost fist punts the victim into the sky', ['#8fd3ff', '#ffffff']),
    S('hammer', 'gamer', 'Hammer Smash', 'Flatten it, then launch the pancake', ['#ffd23f', '#e63946']),
    S('rocket', 'gamer', 'Rocket Strike', 'Rocket, explosion, tumbling chunks', ['#ff9f1c', '#e63946']),
    S('uppercut', 'gamer', 'K.O. Uppercut', 'A boxing glove uppercut sends stars flying', ['#e63946', '#ffd23f']),
    S('laser', 'tech', 'Laser Voxelizer', 'A laser splits the token into voxels', ['#00f0c8', '#c77dff']),
    S('orbital', 'tech', 'Orbital Strike', 'A beam from orbit vaporises it', ['#7ad7ff', '#ffffff']),
    S('glitch', 'tech', 'Glitch Shatter', 'Corrupts, tears and shatters into shards', ['#ff2bd6', '#00f0c8']),
  ],
  dance: [
    S('herospin', 'anime', 'Hero Spin', 'Spin, leap, victory pose', ['#ffd23f', '#ff7eb6']),
    S('chibi', 'anime', 'Chibi Bounce', 'Squishy happy bounces', ['#ffb3c6', '#fff']),
    S('ninjaflip', 'anime', 'Ninja Flip', 'Backflips and a landing pose', ['#2b2d42', '#ff4d6d']),
    S('sakuratwirl', 'anime', 'Sakura Twirl', 'Graceful twirl, petals spin off', ['#ffc2d1', '#ff8fab']),
    S('idolwave', 'anime', 'Idol Wave', 'Side-to-side wave with sparkles', ['#ffafcc', '#a2d2ff']),
    S('kabuki', 'anime', 'Kabuki Stomp', 'Heavy stomps and a dramatic tilt', ['#e63946', '#f1faee']),
    S('shakepose', 'anime', 'Victory Shake', 'Triumphant trembling pose', ['#ffe66d', '#ff6b6b']),
    S('bunnyhop', 'anime', 'Bunny Hop', 'Cute hopping in place', ['#fff', '#ffb3c6']),
    S('floss', 'gamer', 'Floss', 'Hip-swing left and right', ['#4dd6ff', '#ff4d6d']),
    S('moonwalk', 'gamer', 'Moonwalk', 'Smooth backwards glide', ['#7dff6b', '#2b2d42']),
    S('breakdance', 'gamer', 'Breakdance', 'Head-spin on the podium', ['#ff9f1c', '#3a86ff']),
    S('pogo', 'gamer', 'Pixel Pogo', 'Tall pogo bounces', ['#7dff6b', '#ffd23f']),
    S('robotpop', 'gamer', 'Pop & Lock', 'Snappy stepped moves', ['#c77dff', '#4dd6ff']),
    S('bossstomp', 'gamer', 'Boss Stomp', 'Stomp with camera-shaking thuds', ['#ef476f', '#ffd166']),
    S('levelup', 'gamer', 'Level Up', 'Jump, flash, level up!', ['#ffd23f', '#fff']),
    S('respawn', 'gamer', 'Respawn Blink', 'Blinks in and out with sparkle', ['#4dd6ff', '#fff']),
    S('robot', 'tech', 'The Robot', 'Stiff 90° turns and arm-less pops', ['#a8b2c1', '#00f0c8']),
    S('hoverspin', 'tech', 'Hover Spin', 'Floats up, spins like a top', ['#7ad7ff', '#fff']),
    S('stutter', 'tech', 'Glitch Stutter', 'Jittering teleport steps', ['#ff2bd6', '#00f0c8']),
    S('orbit', 'tech', 'Orbit', 'Circles the podium in the air', ['#c77dff', '#7ad7ff']),
    S('scan', 'tech', 'Scan Sweep', 'Sweeps side to side scanning', ['#00f0c8', '#0a3d62']),
    S('matrix', 'tech', 'Matrix Lean', 'Slow-motion backbend', ['#00ff9c', '#04210f']),
    S('pulse', 'tech', 'Pulse', 'Rhythmic swelling', ['#c77dff', '#fff']),
    S('levitate', 'tech', 'Levitate', 'Slowly rises, wobbling', ['#7ad7ff', '#a8b2c1']),
  ],
  trail: [
    S('petals', 'anime', 'Sakura Petals', 'Drifting pink petals', ['#ffb7d5', '#ff8fb1']),
    S('leaves', 'anime', 'Maple Leaves', 'Tumbling autumn leaves', ['#ff8a3d', '#c0392b']),
    S('fireflies', 'anime', 'Fireflies', 'Warm floating lights', ['#ffe66d', '#a6ff3d']),
    S('snow', 'anime', 'Snow Flurry', 'Glittering snowflakes', ['#ffffff', '#bde7ff']),
    S('foxfire', 'anime', 'Foxfire', 'Blue spirit flames', ['#6fe7ff', '#7a5cff']),
    S('hearts', 'anime', 'Floating Hearts', 'Little rising hearts', ['#ff6b9a', '#ffc2d1']),
    S('inksplash', 'anime', 'Ink Splash', 'Brush-ink dots', ['#2b2d42', '#8d99ae']),
    S('sparkle', 'anime', 'Star Sparkle', 'Twinkling stars', ['#fff3a3', '#ffd23f']),
    S('pixels', 'gamer', 'Pixel Dust', 'Chunky green pixels', ['#7dff6b', '#2ecc71']),
    S('coins', 'gamer', 'Coin Trail', 'Spinning gold coins', ['#ffd23f', '#ff9f1c']),
    S('chipstars', 'gamer', '8-Bit Stars', 'Blocky sparkles', ['#ffffff', '#4dd6ff']),
    S('pixelheart', 'gamer', 'Pixel Hearts', 'Red hearts for extra life', ['#ff4d6d', '#ffd1dc']),
    S('embers', 'gamer', 'Embers', 'Rising fire sparks', ['#ff9f1c', '#e63946']),
    S('confetti', 'gamer', 'Party Confetti', 'Multicolour confetti', ['#ff4d6d', '#4dd6ff']),
    S('smoke', 'gamer', 'Turbo Smoke', 'Puffs like a racing kart', ['#bdbdbd', '#666']),
    S('notes', 'gamer', 'Music Notes', 'Jaunty musical notes', ['#c77dff', '#ffd23f']),
    S('binary', 'tech', 'Binary Rain', 'Falling 0s and 1s', ['#00ff9c', '#7dffc4']),
    S('bolts', 'tech', 'Lightning', 'Crackling bolts', ['#7ad7ff', '#ffffff']),
    S('hexes', 'tech', 'Hex Bits', 'Hexagonal data bits', ['#00f0c8', '#0a3d62']),
    S('streams', 'tech', 'Data Streams', 'Streaking light lines', ['#c77dff', '#7ad7ff']),
    S('glitchpx', 'tech', 'Glitch Blocks', 'RGB glitch squares', ['#ff2bd6', '#00f0c8']),
    S('plasma', 'tech', 'Plasma Wisps', 'Soft glowing wisps', ['#b388ff', '#ff9bff']),
    S('bubbles', 'tech', 'Coolant Bubbles', 'Rising rings', ['#7ad7ff', '#e0fbff']),
    S('lightrain', 'tech', 'Light Rain', 'Neon rain drops', ['#4dd6ff', '#c77dff']),
  ],
  sound: SOUND_PACKS.map((p) => S(p.id, p.theme, p.name, p.desc, [p.color, '#2b2d42'])),
  frame: [
    S('sakura', 'anime', 'Sakura Ring', 'Blossoms around the rim', ['#ff8fb1', '#ffe0ec']),
    S('torii', 'anime', 'Torii Gate', 'Vermilion shrine gate frame', ['#e63946', '#2b2d42']),
    S('koi', 'anime', 'Koi Pond', 'Gold and orange swirl', ['#ff9f1c', '#ffd166']),
    S('lantern', 'anime', 'Paper Lantern', 'Warm glowing lantern ring', ['#ff7f50', '#ffe08a']),
    S('bamboo', 'anime', 'Bamboo', 'Green bamboo segments', ['#5aa469', '#d6f5c9']),
    S('fan', 'anime', 'Folding Fan', 'Fan-shaped scallops', ['#f7a8b8', '#fff']),
    S('wave', 'anime', 'Great Wave', 'Rolling blue wave', ['#3a86ff', '#e0f0ff']),
    S('cloud', 'anime', 'Cloud Swirl', 'Fluffy cloud frame', ['#a2d2ff', '#fff']),
    S('pixel', 'gamer', 'Pixel Frame', 'Stair-stepped 8-bit border', ['#7dff6b', '#2b2d42']),
    S('heart', 'gamer', 'Life Hearts', 'Row of extra lives', ['#ff4d6d', '#ffd1dc']),
    S('shield', 'gamer', 'Shield', 'Heraldic shield outline', ['#4dd6ff', '#e63946']),
    S('crown', 'gamer', 'Champion Crown', 'Gold with a crown', ['#ffd23f', '#ff9f1c']),
    S('neonring', 'gamer', 'Neon Ring', 'Glowing neon tube', ['#ff2bd6', '#2be7ff']),
    S('coin', 'gamer', 'Coin Border', 'Studded gold coin', ['#ffd23f', '#b8860b']),
    S('bolt', 'gamer', 'Power Bolt', 'Lightning burst', ['#ffe66d', '#ff9f1c']),
    S('badge', 'gamer', 'Rank Badge', 'Star rank badge', ['#c77dff', '#ffd23f']),
    S('hex', 'tech', 'Hex Cell', 'Hexagonal frame', ['#00f0c8', '#0a3d62']),
    S('circuit', 'tech', 'Circuit Ring', 'PCB traces', ['#7dff6b', '#0f7b4a']),
    S('radar', 'tech', 'Radar', 'Sweeping radar beam', ['#00ff9c', '#04210f']),
    S('orbitring', 'tech', 'Orbit Ring', 'Orbiting dots', ['#7ad7ff', '#1b1f5e']),
    S('glitchfr', 'tech', 'Glitch Frame', 'Offset RGB rings', ['#ff2bd6', '#00f0c8']),
    S('scanline', 'tech', 'Scanline', 'CRT bracket corners', ['#4dd6ff', '#fff']),
    S('dataring', 'tech', 'Data Ring', 'Dashed rotating ring', ['#c77dff', '#7ad7ff']),
    S('target', 'tech', 'Target Lock', 'Crosshair lock-on', ['#ff4d6d', '#fff']),
  ],
};

export const DEFAULT_LOOK = { skin: 'samurai', scene: 'meadow', dice: 'sakura', finisher: 'katana', dance: 'herospin', trail: 'petals', sound: 'koto', frame: 'sakura' };

export const itemOf = (cat, id) => ITEMS[cat].find((i) => i.id === id) || ITEMS[cat][0];
export const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

// ---------------------------------------------------------------- persistent profile
const listeners = new Set();
let state = null;
function load() {
  if (state) return state;
  const p = store.get('profile', {});
  const look = { ...DEFAULT_LOOK, ...(p.look || {}) };
  for (const cat of Object.keys(DEFAULT_LOOK)) if (!ITEMS[cat].some((i) => i.id === look[cat])) look[cat] = DEFAULT_LOOK[cat];
  state = { name: p.name || 'Player' + Math.floor(100 + Math.random() * 900), avatar: p.avatar || 'fox', look, wins: p.wins || {} };
  return state;
}
export const profile = {
  get name() { return load().name; },
  get avatar() { return load().avatar; },
  get look() { return load().look; },
  get wins() { return load().wins; },
  set(patch) { const s = load(); Object.assign(s, patch); this.save(); },
  setLook(cat, id) { load().look[cat] = id; this.save(cat); },
  addWin(game) { const s = load(); s.wins[game] = (s.wins[game] || 0) + 1; this.save(); },
  save(cat) { store.set('profile', load()); listeners.forEach((fn) => fn(cat)); },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  /** The shareable subset other players need to render you. */
  publicLook() { const s = load(); return { name: s.name, avatar: s.avatar, look: { ...s.look } }; },
};

// ---------------------------------------------------------------- bots
export const BOT_NAMES = ['Mochi', 'Zap', 'Pixel', 'Nova', 'Blip', 'Turbo', 'Kiko', 'Bolt', 'Sushi', 'Glitch', 'Ziggy', 'Comet', 'Waffle', 'Byte', 'Ember', 'Yuki'];
const rndPick = (a) => a[Math.floor(Math.random() * a.length)];
/** A random cosmetic loadout, biased to one theme so bots look coherent. `skinsUsed` avoids duplicate skins. */
export function randomLook(themeId, skinsUsed = []) {
  const theme = themeId || rndPick(THEMES).id;
  const from = (cat) => { const l = ITEMS[cat].filter((i) => i.theme === theme); return (l.length ? rndPick(l) : rndPick(ITEMS[cat])).id; };
  const skins = ITEMS.skin.filter((i) => i.theme === theme && !skinsUsed.includes(i.id));
  const skin = (skins.length ? rndPick(skins) : rndPick(ITEMS.skin.filter((i) => !skinsUsed.includes(i.id)))).id;
  return { skin, scene: from('scene'), dice: from('dice'), finisher: from('finisher'), dance: from('dance'), trail: from('trail'), sound: from('sound'), frame: from('frame') };
}
export function botSeat(level, used = []) {
  const avatars = ['cat', 'panda', 'frog', 'robot', 'alien', 'ninja', 'knight', 'astro', 'pirate', 'dragon', 'bunny', 'fox'];
  const name = rndPick(BOT_NAMES.filter((n) => !used.includes(n)));
  return { kind: 'bot', level, name, avatar: rndPick(avatars), look: randomLook(null, []) };
}
