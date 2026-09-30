// Blockworld: glue between the renderer, world streaming, player, physics, sky, audio and UI.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

import { B, DEFS, PLACEABLE, SOLID, PLANT, WATERB, SEA, CS, H } from './blocks.js';
import { buildAtlas, blockIcon, makeCrackTextures } from './textures.js';
import { U, makeTerrainMaterials, makeInstMaterial, makeCubeGeometry } from './shaders.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Sky } from './sky.js';
import { GameAudio } from './audio.js';
import { Particles } from './particles.js';
import { SheepManager } from './sheep.js';
import { Dynamics } from './dynamics.js';
import { Shadows } from './shadows.js';
import { Reflection } from './reflection.js';
import { Avatar } from './avatar.js';
import { GradeShader } from './post.js';
import { getTerrain, BIOME_NAMES } from './gen.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
};
const SAVE = 'blockworld.v1.';

// shadows: [cascades, map size, near half-extent, far half-extent]   reflect: water mirror resolution scale
const GFX = {
  low: { view: 8, pr: 0.8, ao: false, bloom: false, post: false, bump: false, clouds: 1, msaa: 0, shadows: [0, 0, 0, 0], reflect: 0 },
  medium: { view: 10, pr: 1, ao: true, bloom: true, post: true, bump: true, clouds: 3, msaa: 2, shadows: [1, 2048, 56, 0], reflect: 0.5 },
  high: { view: 12, pr: Math.min(window.devicePixelRatio || 1, 1.5), ao: true, bloom: true, post: true, bump: true, clouds: 3, msaa: 4, shadows: [2, 2048, 26, 110], reflect: 0.7 },
};

// ---------------------------------------------------------------- renderer
(function checkWebGL() {
  let ok = false;
  try { ok = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { ok = false; }
  if (!ok) { $('bootmsg').textContent = 'Blockworld needs WebGL 2, which this browser or device does not provide.'; $('play').textContent = 'WebGL 2 unavailable'; throw new Error('WebGL 2 unavailable'); }
})();
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setClearColor(0x87b5f0);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb0d0f8, 60, 120);
const camera = new THREE.PerspectiveCamera(72, 1, 0.08, 1800);
scene.add(camera);

const atlas = buildAtlas();
U.uAtlas.value = atlas.texture;
const mats = makeTerrainMaterials(atlas.texture);
const world = new World(scene, mats);
const sky = new Sky(scene);
const audio = new GameAudio();
const player = new Player(world);
const bits = new Particles(scene, world, 3000, false);
const fx = new Particles(scene, world, 2500, true);
const shadows = new Shadows(renderer, scene);
world.shadowHook = shadows;
const sheep = new SheepManager(scene, world, audio, shadows);
const avatar = new Avatar(scene, shadows);
avatar.group.visible = false;

const G = { scene, camera, world, sky, audio, player, sheep, bits, fx, shadows, shake: 0, flash: 0, bloomKick: 0 };
let dyn = null;

// ---------------------------------------------------------------- state
let state = 'title';          // title | playing | paused
let invOpen = false;
let gfxName = store.get('blockworld.gfx') || 'medium';
if (!GFX[gfxName]) gfxName = 'medium';
let seed = '';
let terrain = null;
let spawn = { x: 8.5, z: 8.5 };
let pendingSpawn = null;
let hotbar = [B.GRASS, B.STONE, B.PLANKS, B.GLASS, B.SAND, B.GRAVEL, B.TNT, B.COBBLE, B.BRICK];
let sel = 0;
let debugOn = false;
let hasLocked = false;
const keys = { f: 0, b: 0, l: 0, r: 0, jump: 0, sprint: 0, down: 0 };
const mouse = { l: false, r: false };
let composer = null, bloomPass = null, gradePass = null, bloomStrength = 0;
let flyFx = 0, flyBlur = 0, lastSpace = 0, waterCheck = 0, haveWater = false;
let graphics = GFX[gfxName];
let fpsAvg = 60, fpsFrames = 0, fpsT = 0, frameMs = 0;
let lastSave = 0;
const prof = { world: 0, worldMax: 0, frame: 0, frameMax: 0, render: 0 };

// ---------------------------------------------------------------- helpers
let toastT = 0;
function toast(msg, ms = 1600) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms);
}
function randomSeed() { return String((Math.random() * 1e9) | 0); }

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(graphics.pr);
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(graphics.pr); composer.setSize(w, h); }
  const drawH = h * graphics.pr;
  bits.setScale(drawH, camera.fov * Math.PI / 180); fx.setScale(drawH, camera.fov * Math.PI / 180);
}
window.addEventListener('resize', resize);

function applyGraphics(name, quiet) {
  if (!GFX[name]) return;
  gfxName = name; graphics = GFX[name];
  store.set('blockworld.gfx', name);
  const vd = parseInt(params.get('vd'));
  world.viewDist = vd > 1 ? vd : graphics.view;
  const aoChanged = world.useAO !== graphics.ao;
  world.useAO = graphics.ao;
  if (aoChanged) world.remeshAll();
  sky.clouds.forEach((c, i) => { c.visible = i < graphics.clouds || (graphics.clouds === 1 && i === 2); });
  if (composer) { composer.dispose && composer.dispose(); composer = null; bloomPass = null; gradePass = null; }
  shadows.configure(...graphics.shadows);
  if (typeof reflection !== 'undefined') reflection.configure(graphics.reflect > 0, graphics.reflect);
  U.uBump.value = graphics.bump ? 1 : 0;
  $('gfx').value = name; $('gfx2').value = name;
  resize();
  if (!quiet) toast('Graphics: ' + name[0].toUpperCase() + name.slice(1) + ' (view distance ' + world.viewDist + ' chunks)');
}

function ensureComposer() {
  if (composer || !graphics.post) return;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: graphics.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(size.x, size.y);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.2, 0.55, 0.92);
  composer.addPass(bloomPass);
  gradePass = new ShaderPass(GradeShader);
  composer.addPass(gradePass);
  composer.addPass(new OutputPass());
}

// ---------------------------------------------------------------- held block, outline, crack
const heldGeo = makeCubeGeometry();
const heldTiles = new THREE.InstancedBufferAttribute(new Float32Array(3), 3);
heldGeo.setAttribute('aTiles', heldTiles);
heldGeo.setAttribute('aFlash', new THREE.InstancedBufferAttribute(new Float32Array(1), 1));
const heldMat = makeInstMaterial(true); heldMat.depthTest = false;
const held = new THREE.InstancedMesh(heldGeo, heldMat, 1);
held.frustumCulled = false; held.renderOrder = 100;
camera.add(held);
let swing = 0, heldBob = 0;
function updateHeld() {
  const d = DEFS[hotbar[sel]];
  heldTiles.array[0] = d.top; heldTiles.array[1] = d.bottom; heldTiles.array[2] = d.side; heldTiles.needsUpdate = true;
}
const outline = new THREE.Group();
outline.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.006, 1.006, 1.006)), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.85 })));
outline.add(new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.09, depthWrite: false, fog: false })));
outline.visible = false; scene.add(outline);
const crackTex = makeCrackTextures();
const crack = new THREE.Mesh(new THREE.BoxGeometry(1.008, 1.008, 1.008), new THREE.MeshBasicMaterial({ map: crackTex[0], transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, fog: false }));
crack.visible = false; crack.renderOrder = 3; scene.add(crack);

const reflection = new Reflection(renderer, scene, camera, sky, [held, outline, crack]);   // the player's body (layer 1) is only seen by the mirror camera
reflection.configure(graphics.reflect > 0, graphics.reflect);

// ---------------------------------------------------------------- hotbar / inventory UI
const icons = {};
function iconFor(id) { return icons[id] || (icons[id] = blockIcon(atlas.canvas, id, 48)); }
function buildHotbar() {
  const hb = $('hotbar'); hb.innerHTML = '';
  hotbar.forEach((id, i) => {
    const s = document.createElement('div'); s.className = 'slot' + (i === sel ? ' sel' : '');
    const c = document.createElement('canvas'); c.width = c.height = 48; c.getContext('2d').drawImage(iconFor(id), 0, 0);
    const n = document.createElement('b'); n.textContent = i + 1;
    s.append(c, n); s.addEventListener('mousedown', (e) => { e.stopPropagation(); e.preventDefault(); select(i); });
    hb.append(s);
  });
}
let nameT = 0;
function select(i) {
  sel = (i + 9) % 9;
  [...$('hotbar').children].forEach((el, k) => el.classList.toggle('sel', k === sel));
  const bn = $('blockname'); bn.textContent = DEFS[hotbar[sel]].name; bn.classList.add('show');
  clearTimeout(nameT); nameT = setTimeout(() => bn.classList.remove('show'), 1400);
  updateHeld(); swing = Math.max(swing, 0.0);
}
function buildInventory() {
  const g = $('invgrid'); g.innerHTML = '';
  for (const id of PLACEABLE) {
    const c = document.createElement('div'); c.className = 'cell';
    const cv = document.createElement('canvas'); cv.width = cv.height = 48; cv.getContext('2d').drawImage(iconFor(id), 0, 0);
    const n = document.createElement('span'); n.textContent = DEFS[id].name;
    c.append(cv, n);
    c.addEventListener('click', () => { hotbar[sel] = id; buildHotbar(); select(sel); });
    g.append(c);
  }
}
function setInventory(open) {
  invOpen = open;
  $('inventory').classList.toggle('hidden', !open);
  if (open) { if (document.pointerLockElement) document.exitPointerLock(); }
  else if (state === 'playing') requestLock();
}

// ---------------------------------------------------------------- saving
function saveGame(quiet) {
  if (!seed) return;
  const data = {
    v: 1, seed, edits: world.exportEdits(),
    player: { x: player.e.x, y: player.e.y, z: player.e.z, yaw: player.yaw, pitch: player.pitch, fly: player.flying },
    time: sky.time, hotbar, sel, t: Date.now(),
  };
  const ok = store.set(SAVE + seed, JSON.stringify(data));
  if (ok) { store.set(SAVE + 'last', seed); world.unsaved = false; }
  else if (!quiet) toast('Could not save (browser storage is full)');
  lastSave = performance.now();
}
function loadSave(sd) {
  const raw = store.get(SAVE + sd);
  if (!raw) return null;
  try { const d = JSON.parse(raw); return d && d.v === 1 ? d : null; } catch (e) { return null; }
}

// ---------------------------------------------------------------- world loading / spawn
function findSpawn(t) {
  // nearest gentle grassland (plains/forest) near the origin; falls back to any land
  const o = {}, o2 = {};
  let fallback = null;
  for (let r = 0; r < 900; r += 10) {
    const n = Math.max(1, (r / 5) | 0);
    for (let i = 0; i < n * 4; i++) {
      const a = (i / (n * 4)) * Math.PI * 2, x = Math.round(Math.cos(a) * r) + 8, z = Math.round(Math.sin(a) * r) + 8;
      t.column(x, z, o);
      if (o.h <= SEA + 2 || o.h >= 60 || o.top !== B.GRASS || o.biome !== 0 || o.wF > 0.35) continue;
      if (!fallback) fallback = { x: x + 0.5, z: z + 0.5 };
      let flat = true;
      for (const [dx, dz] of [[6, 0], [-6, 0], [0, 6], [0, -6], [12, 12], [-12, -12]]) {
        t.column(x + dx, z + dz, o2);
        if (Math.abs(o2.h - o.h) > 3 || o2.h <= SEA + 1 || o2.wS > 0.1 || o2.wD > 0.15) { flat = false; break; }
      }
      if (flat) return { x: x + 0.5, z: z + 0.5 };
    }
  }
  return fallback || { x: 8.5, z: 8.5 };
}

let fly = { x: 0, z: 0, y: 90, heading: 0, t: 0 };
function loadWorld(sd) {
  seed = sd;
  const save = loadSave(sd);
  world.setSeed(sd, save ? save.edits : null);
  terrain = getTerrain(sd);
  spawn = findSpawn(terrain);
  fly = { x: spawn.x - 36, z: spawn.z - 20, y: 90, heading: Math.PI * 0.72, t: 0 };
  sheep.clear(); if (dyn) dyn.reset(); bits.n = 0; fx.n = 0;
  if (save) { sky.setTime(save.time); } else sky.setTime(0.3);
  updateSaveHint();
  world.update(fly.x, fly.z, 0);
  return save;
}
function updateSaveHint() {
  const has = !!store.get(SAVE + ($('seed').value.trim() || '\u0000'));
  $('savehint').textContent = has ? 'Saved world found — you will continue where you left off.' : ($('seed').value.trim() ? 'New world with this seed.' : 'A random world will be created.');
  $('delsave').classList.toggle('hidden', !has);
  $('play').textContent = has ? 'Continue World' : 'Play';
}

function startGame() {
  audio.init(); audio.resume();
  let sd = $('seed').value.trim();
  if (!sd) sd = randomSeed();
  let save;
  if (sd !== seed || !world.chunks.size) save = loadWorld(sd); else save = loadSave(sd);
  $('seed').value = sd; updateSaveHint();
  audio.setVolumes(parseInt($('vol').value) / 100, parseInt($('mus').value) / 100);
  if (save) {
    hotbar = save.hotbar || hotbar; sel = save.sel || 0;
    player.yaw = save.player.yaw; player.pitch = save.player.pitch; player.flying = !!save.player.fly;
    player.teleport(save.player.x, save.player.y, save.player.z);
    pendingSpawn = null;
    sky.setTime(save.time);
  } else {
    player.yaw = Math.PI * 0.75; player.pitch = -0.1; player.flying = false;
    player.teleport(spawn.x, 120, spawn.z);
    pendingSpawn = { x: spawn.x, z: spawn.z };
    hotbar = [B.GRASS, B.STONE, B.PLANKS, B.GLASS, B.SAND, B.GRAVEL, B.TNT, B.COBBLE, B.BRICK]; sel = 0;
  }
  buildHotbar(); select(sel);
  world.update(player.e.x, player.e.z, 0);
  $('title').classList.add('hidden'); $('hud').classList.remove('hidden');
  $('flychip').classList.toggle('hidden', !player.flying);
  state = 'playing'; hasLocked = false;
  requestLock();
  saveGame(true);
  if (!store.get('blockworld.tipshown')) { store.set('blockworld.tipshown', '1'); toast('Left-click a TNT block to light it. Press F to fly.', 5000); }
}

function goTitle() {
  saveGame(true);
  state = 'title'; invOpen = false;
  if (document.pointerLockElement) document.exitPointerLock();
  $('pause').classList.add('hidden'); $('inventory').classList.add('hidden'); $('hud').classList.add('hidden');
  $('title').classList.remove('hidden');
  const cx = player.e.x, cz = player.e.z;
  fly.x = cx - 30; fly.z = cz; fly.heading = player.yaw + Math.PI;
  $('seed').value = seed; updateSaveHint();
}

function requestLock() {
  try { const p = canvas.requestPointerLock && canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not available */ }
}
function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  if (document.pointerLockElement) document.exitPointerLock();
  $('pause').classList.remove('hidden');
  $('seedinfo').textContent = 'Seed: ' + seed + ' · Physics: ' + (dyn ? dyn.engine : '—');
  Object.assign(keys, { f: 0, b: 0, l: 0, r: 0, jump: 0, sprint: 0, down: 0 }); mouse.l = mouse.r = false;
  saveGame(true);
}
function resume() {
  if (state !== 'paused') return;
  state = 'playing'; $('pause').classList.add('hidden');
  requestLock();
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === canvas) { hasLocked = true; return; }
  if (state === 'playing' && !invOpen && hasLocked) pause();
});
document.addEventListener('pointerlockerror', () => { hasLocked = false; });
window.addEventListener('blur', () => { if (state === 'playing') { Object.assign(keys, { f: 0, b: 0, l: 0, r: 0, jump: 0, sprint: 0, down: 0 }); mouse.l = mouse.r = false; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { saveGame(true); if (state === 'playing') pause(); } });
window.addEventListener('pagehide', () => saveGame(true));

// ---------------------------------------------------------------- input
document.addEventListener('mousemove', (e) => {
  if (state !== 'playing' || document.pointerLockElement !== canvas) return;
  const s = 0.0022;
  player.yaw -= e.movementX * s;
  player.pitch = Math.max(-1.5533, Math.min(1.5533, player.pitch - e.movementY * s));
});
canvas.addEventListener('mousedown', (e) => {
  if (state !== 'playing' || invOpen) return;
  if (document.pointerLockElement !== canvas && !params.has('nolock')) { requestLock(); }
  if (e.button === 0) { mouse.l = true; punch(); }
  else if (e.button === 2) { mouse.r = true; placeCool = 0; }
  else if (e.button === 1) { pickBlock(); e.preventDefault(); }
});
document.addEventListener('mouseup', (e) => { if (e.button === 0) { mouse.l = false; } else if (e.button === 2) mouse.r = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('wheel', (e) => { if (state === 'playing' && !invOpen) { select(sel + (e.deltaY > 0 ? 1 : -1)); } }, { passive: true });

function setFlying(on) {
  if (player.flying === on) return;
  player.flying = on;
  $('flychip').classList.toggle('hidden', !on);
  if (on) {
    player.vel.y = Math.max(player.vel.y, 7.5); player.onGround = false;
    fx.burst(player.e.x, player.e.y + 0.2, player.e.z, 46, { colors: [[0.55, 0.5, 0.42], [0.8, 0.8, 0.85], [0.4, 0.38, 0.34]], speed: 5.5, up: 0.25, life: 0.9, size: 1.5, alpha: 0.6, grav: -0.5, drag: 2.2, grow: 1.2, spread: 0.6 });
    bits.blockBits(Math.floor(player.e.x), Math.floor(player.e.y) - 1, Math.floor(player.e.z), DEFS[B.GRASS].top, 10, 1.2);
    audio.whoosh && audio.whoosh(1);
    toast('Flying. Double-tap Space to land · Space up · C down · Shift = fast', 3600);
  } else { audio.whoosh && audio.whoosh(0.5); toast('Landing'); }
}
const KEYMAP = { KeyW: 'f', KeyS: 'b', KeyA: 'l', KeyD: 'r', ArrowUp: 'f', ArrowDown: 'b', ArrowLeft: 'l', ArrowRight: 'r', Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'down', ControlLeft: 'down' };
window.addEventListener('keydown', (e) => {
  if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'text') { if (e.code === 'Enter' && state === 'title') startIfReady(); return; }
  if (e.code === 'KeyM' && !e.repeat) { audio.init(); const m = !audio.muted; audio.setMuted(m); toast(m ? 'Sound muted (M)' : 'Sound on'); return; }
  if (state === 'title') { if (e.code === 'Enter') startIfReady(); return; }
  if (e.code === 'Escape') { if (invOpen) setInventory(false); else if (state === 'playing') pause(); else if (state === 'paused') resume(); return; }
  if (state !== 'playing') return;
  if (KEYMAP[e.code]) { keys[KEYMAP[e.code]] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code >= 'Digit1' && e.code <= 'Digit9') select(parseInt(e.code.slice(5)) - 1);
  else if (e.code === 'KeyE') setInventory(!invOpen);
  else if (e.code === 'KeyF') setFlying(!player.flying);
  else if (e.code === 'F3') { debugOn = !debugOn; $('debug').classList.toggle('hidden', !debugOn); e.preventDefault(); }
  else if (e.code === 'KeyT') { sky.setTime(sky.time + 0.125); toast('Time: ' + String(Math.floor(sky.hours)).padStart(2, '0') + ':00'); }
  if (e.code === 'Space') {
    // double-tap Space: take off / land
    const t = performance.now();
    if (t - lastSpace < 320) { setFlying(!player.flying); lastSpace = 0; } else lastSpace = t;
  }
  if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
});
window.addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = 0; });

// ---------------------------------------------------------------- interaction
let target = null, placeCool = 0;
const brk = { x: 0, y: 0, z: 0, id: 0, prog: 0, cool: 0, hit: 0 };
const _eye = new THREE.Vector3(), _dir = new THREE.Vector3();

function punch() {
  swing = 1;
  if (target && target.id === B.TNT && dyn) {
    if (dyn.ignite(target.x, target.y, target.z, 2.6)) audio.pop();
    mouse.l = false;
  }
}
function pickBlock() {
  if (!target) return;
  const id = target.id;
  const i = hotbar.indexOf(id);
  if (i >= 0) select(i); else if (PLACEABLE.includes(id)) { hotbar[sel] = id; buildHotbar(); select(sel); }
}
function tryPlace() {
  if (!target) return;
  const id = hotbar[sel];
  let x = target.x + target.nx, y = target.y + target.ny, z = target.z + target.nz;
  if (PLANT[target.id]) { x = target.x; y = target.y; z = target.z; }
  if (y < 0 || y >= H) return;
  const cur = world.getBlock(x, y, z);
  if (!(cur === B.AIR || WATERB[cur] || PLANT[cur])) return;
  if (SOLID[id] && (player.intersectsCell(x, y, z))) return;
  if (PLANT[id] && !SOLID[world.getBlock(x, y - 1, z)]) return;
  if (!world.setBlock(x, y, z, id)) return;
  audio.placeBlock(id, x + 0.5, y + 0.5, z + 0.5);
  swing = 1;
}
function updateInteraction(dt) {
  player.eyePos(_eye); player.lookDir(_dir);
  target = world.raycast(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, 6);
  if (target) { outline.visible = true; outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5); }
  else outline.visible = false;

  brk.cool -= dt;
  if (mouse.l && target && target.id !== B.TNT && brk.cool <= 0) {
    const same = brk.prog > 0 && brk.x === target.x && brk.y === target.y && brk.z === target.z;
    if (!same) { brk.x = target.x; brk.y = target.y; brk.z = target.z; brk.id = target.id; brk.prog = 0; brk.hit = 0; }
    const time = DEFS[target.id].time;
    if (isFinite(time)) {
      brk.prog += dt / Math.max(0.03, time);
      brk.hit -= dt;
      if (brk.hit <= 0 && time > 0.15) { brk.hit = 0.2; audio.material(DEFS[target.id].snd, 'step', { g: 0.9, p: 0 }); bits.blockBits(target.x, target.y, target.z, DEFS[target.id].top, 2, 0.5); }
      swing = Math.max(swing, 0.6 + 0.4 * Math.abs(Math.sin(performance.now() * 0.016)));
      if (brk.prog >= 1) {
        const id = target.id, tx = target.x, ty = target.y, tz = target.z;
        world.setBlock(tx, ty, tz, B.AIR);
        bits.blockBits(tx, ty, tz, DEFS[id].top, 16);
        audio.breakBlock(id, tx + 0.5, ty + 0.5, tz + 0.5);
        brk.prog = 0; brk.cool = 0.16;
      }
    }
  } else if (!mouse.l || !target || (brk.prog > 0 && (brk.x !== target.x || brk.y !== target.y || brk.z !== target.z))) {
    brk.prog = 0;
  }
  if (brk.prog > 0.02 && mouse.l && target) {
    crack.visible = true; crack.position.set(brk.x + 0.5, brk.y + 0.5, brk.z + 0.5);
    crack.material.map = crackTex[Math.min(9, Math.floor(brk.prog * 10))];
  } else crack.visible = false;

  placeCool -= dt;
  if (mouse.r && placeCool <= 0) { placeCool = 0.24; tryPlace(); }
}

// ---------------------------------------------------------------- player events
const events = {
  step: (id) => audio.step(id, player.sprinting),
  land: (v) => { audio.land(v); },
  splash: (v) => { audio.splash(v); fx.burst(player.e.x, player.e.y + 0.5, player.e.z, 14, { colors: [[0.6, 0.75, 0.95]], speed: 2.5, up: 1.4, life: 0.6, size: 0.6, alpha: 0.8, grav: 9, drag: 0.4, spread: 0.6 }); },
  swim: () => audio.swim(),
  fell: () => { player.teleport(spawn.x, 120, spawn.z); pendingSpawn = { x: spawn.x, z: spawn.z }; toast('You fell out of the world'); },
};

// ---------------------------------------------------------------- flyover (title screen)
const _o = {};
function groundAt(x, z) { terrain.column(x, z, _o); return Math.max(_o.h, SEA); }
function updateFlyover(dt) {
  fly.t += dt;
  fly.heading += Math.sin(fly.t * 0.11) * 0.06 * dt + 0.012 * dt;
  const sp = 7.5, dx = -Math.sin(fly.heading), dz = -Math.cos(fly.heading);
  fly.x += dx * sp * dt; fly.z += dz * sp * dt;
  const g = Math.max(groundAt(fly.x, fly.z), groundAt(fly.x + dx * 24, fly.z + dz * 24), groundAt(fly.x + dx * 55, fly.z + dz * 55), groundAt(fly.x + dx * 90, fly.z + dz * 90) - 6);
  const ty = g + 24 + Math.sin(fly.t * 0.2) * 5;
  fly.y += (ty - fly.y) * Math.min(1, dt * (ty > fly.y ? 1.4 : 0.6));
  camera.position.set(fly.x, fly.y, fly.z);
  camera.rotation.set(-0.3 + Math.sin(fly.t * 0.17) * 0.05, fly.heading, Math.sin(fly.t * 0.23) * 0.02, 'YXZ');
  camera.fov += (66 - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------- frame
function stepSim(dt) {
  if (dyn) dyn.update(dt);
  sky.update(dt, camera, graphics.pr);
  sheep.update(dt, player.e.x, player.e.z, U.uTime.value);
  bits.update(dt); fx.update(dt);
  world.update(player.e.x, player.e.z, 3);
}
let last = performance.now();
const _cam = new THREE.Vector3(), _feet = new THREE.Vector3(), _fwd = new THREE.Vector3();
let camFov = 72;
let bobT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const rawDt = Math.min(0.1, (now - last) / 1000); last = now;
  const dt = Math.min(0.05, rawDt);
  frameMs += (rawDt * 1000 - frameMs) * 0.05;
  fpsFrames++; fpsT += rawDt;
  if (fpsT >= 0.5) { fpsAvg = fpsFrames / fpsT; fpsFrames = 0; fpsT = 0; }

  U.uTime.value += dt;
  const simulate = state !== 'paused' && !invOpen;
  const t0 = performance.now();

  if (state === 'title') {
    updateFlyover(dt);
    world.update(camera.position.x, camera.position.z, 3);
    sky.update(dt, camera, graphics.pr);
    sheep.update(dt, fly.x, fly.z, U.uTime.value);
    if (dyn) dyn.update(dt);
    bits.update(dt); fx.update(dt);
    audio.setListener(camera.position.x, camera.position.y, camera.position.z, fly.heading);
    if (audio.ctx) audio.setWind(0.4);
  } else {
    if (state === 'playing' && !invOpen) {
      // deferred spawn: drop the player on the actual surface once chunk data exists
      if (pendingSpawn && world.hasData(Math.floor(pendingSpawn.x), Math.floor(pendingSpawn.z))) {
        const p = findSurfaceSpot(pendingSpawn.x, pendingSpawn.z);
        if (p) { player.teleport(p.x, p.y, p.z); pendingSpawn = null; }
      }
      const pk = pendingSpawn ? { f: 0, b: 0, l: 0, r: 0, jump: 0, sprint: 0, down: 0 } : keys;
      if (!pendingSpawn) player.update(dt, pk, events);
      updateInteraction(dt);
    }
    if (simulate) stepSim(dt);
    const tw = performance.now();
    world.update(player.e.x, player.e.z, 3);
    { const d = performance.now() - tw; prof.world += (d - prof.world) * 0.05; if (d > prof.worldMax) prof.worldMax = d; }
    placeCameraAtPlayer(dt);
  }

  // lighting, fog, water tint
  const R = world.viewDist;
  const uw = state !== 'title' && player.headInWater;
  const fogFar = uw ? 24 : R * CS - 5, fogNear = uw ? 1 : R * CS * 0.52;
  U.uFogNear.value = fogNear; U.uFogFar.value = fogFar;
  if (uw) U.uFogColor.value.setRGB(0.03, 0.14, 0.28).multiply(sky.lightColor).addScalar(0.02);
  scene.fog.near = fogNear; scene.fog.far = fogFar; scene.fog.color.copy(U.uFogColor.value);
  renderer.setClearColor(U.uFogColor.value);
  $('underwater').style.opacity = uw ? 1 : 0;

  // ---- flight feel: FOV, streaks, post-processing intensity ----
  const spd = state === 'playing' ? player.vel.length() : 0;
  flyFx += ((state === 'playing' && player.flying ? 1 : 0) - flyFx) * Math.min(1, dt * 3);
  const spdN = Math.min(1, spd / 30);
  flyBlur += ((player.flying && state === 'playing' ? 0.012 + 0.06 * spdN : (player.sprinting ? 0.012 : 0)) - flyBlur) * Math.min(1, dt * 5);
  if (state === 'playing' && player.flying && spd > 6 && simulate) {
    const n = Math.min(6, 2 + Math.floor(spd * dt * 0.4));
    const fx0 = -Math.sin(player.yaw), fz0 = -Math.cos(player.yaw);
    for (let i = 0; i < n; i++) {
      const dist = 6 + Math.random() * 26, a = Math.random() * 6.283, rr = 2 + Math.random() * 9;
      fx.add(camera.position.x + fx0 * dist + Math.cos(a) * rr, camera.position.y + (Math.random() - 0.5) * 9, camera.position.z + fz0 * dist + Math.sin(a) * rr,
        0, 0, 0, 0.7, 0.16 + Math.random() * 0.12, -2, 0, 0, 1.6, 1.6, 1.8, 0.45, 0, 0.3, 0);
    }
  }

  // ---- lighting quality, shadows, water mirror ----
  const usePost = graphics.post;
  U.uLightScale.value = usePost ? 1.0 : 0.62;
  avatar.group.visible = state !== 'title';
  if (state !== 'title') avatar.update(player, dt);
  if (shadows.enabled) {
    const fpos = state === 'title' ? camera.position : _feet.set(player.e.x, player.e.y + 1, player.e.z);
    _fwd.set(-Math.sin(state === 'title' ? fly.heading : player.yaw), 0, -Math.cos(state === 'title' ? fly.heading : player.yaw));
    shadows.update(fpos, _fwd);
  }
  if (graphics.reflect > 0 && !uw) {
    if (--waterCheck <= 0) { waterCheck = 20; haveWater = world.waterNear(camera.position.x, camera.position.z, Math.min(R, 8)); }
    if (haveWater) reflection.render(fogFar, mats.trans); else U.uReflOn.value = 0;
  } else U.uReflOn.value = 0;

  // explosion flash + bloom
  G.shake *= Math.exp(-3.2 * dt);
  G.flash *= Math.exp(-4.5 * dt);
  G.bloomKick *= Math.exp(-2.6 * dt);
  $('flash').style.opacity = Math.min(0.5, G.flash * 0.5).toFixed(3);
  bloomStrength = graphics.bloom ? G.bloomKick * 0.85 : 0;
  if (state === 'title' || !graphics.post) { /* keep default */ }

  audio.setListener(camera.position.x, camera.position.y, camera.position.z, state === 'title' ? fly.heading : player.yaw);
  if (audio.ctx && state !== 'title') audio.setWind(Math.min(1, Math.max(0, (player.e.y - SEA) / 60)) * 0.8 + (player.sprinting ? 0.2 : 0));

  const tr = performance.now();
  if (usePost) {
    ensureComposer();
    bloomPass.strength = 0.2 + bloomStrength + flyFx * 0.14 + sky.dusk * 0.12;
    const gu = gradePass.uniforms;
    gu.uTime.value = U.uTime.value % 100; gu.uSpeed.value = flyBlur;
    gu.uVig.value = 0.52 + flyFx * 0.16 + sky.night * 0.1; gu.uAberr.value = 0.0012 + flyFx * 0.0035 + G.bloomKick * 0.004;
    gu.uMood.value = 1;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.66 + sky.night * 0.3;
    composer.render();
    renderer.toneMapping = THREE.NoToneMapping;
  } else renderer.render(scene, camera);
  prof.render += (performance.now() - tr - prof.render) * 0.05;

  // autosave
  if (state === 'playing' && now - lastSave > 20000) saveGame(true);
  { const d = performance.now() - t0; prof.frame += (d - prof.frame) * 0.05; if (d > prof.frameMax) prof.frameMax = d; }

  if (debugOn) updateDebug(performance.now() - t0);
  // loading tip
  if (state === 'playing') {
    const ready = !pendingSpawn && world.hasData(Math.floor(player.e.x), Math.floor(player.e.z)) && world.meshedCount(Math.floor(player.e.x / CS), Math.floor(player.e.z / CS), 1) > 0.8;
    $('loadingtip').classList.toggle('hidden', ready);
  }
}

function findSurfaceSpot(x, z) {
  // prefer a grass column without a tree on it, spiralling out from the spawn column
  for (let r = 0; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const bx = Math.floor(x) + dx, bz = Math.floor(z) + dz;
    if (!world.hasData(bx, bz)) continue;
    const ty = world.topY(bx, bz);
    if (ty < SEA) continue;
    const b = world.getBlock(bx, ty, bz);
    if (b !== B.GRASS && b !== B.SAND && b !== B.SNOW) continue;
    let open = true;
    for (let k = 1; k <= 8 && open; k++) if (world.solidAt(bx, ty + k, bz)) open = false;
    if (open) return { x: bx + 0.5, y: ty + 1.001, z: bz + 0.5 };
  }
  const ty = world.topY(Math.floor(x), Math.floor(z));
  return ty >= 0 ? { x: Math.floor(x) + 0.5, y: ty + 3, z: Math.floor(z) + 0.5 } : null;
}

function placeCameraAtPlayer(dt) {
  player.eyePos(_cam);
  const speed = Math.hypot(player.vel.x, player.vel.z);
  if (player.onGround && speed > 0.5 && !player.flying) bobT = player.bob;
  const bobAmt = player.onGround && !player.flying ? Math.min(1, speed / 6) : 0;
  const by = Math.sin(bobT * 2) * 0.035 * bobAmt, bx = Math.cos(bobT) * 0.03 * bobAmt;
  const s = G.shake * 0.35;
  camera.position.set(_cam.x + (Math.random() - 0.5) * s, _cam.y + by + (Math.random() - 0.5) * s, _cam.z + (Math.random() - 0.5) * s);
  const sx = Math.sin(player.yaw), cx = Math.cos(player.yaw);
  camera.position.x += cx * bx; camera.position.z += -sx * bx;
  const latV = player.vel.x * Math.cos(player.yaw) - player.vel.z * Math.sin(player.yaw);
  const roll = -(keys.r - keys.l) * 0.012 - (player.flying ? Math.max(-0.16, Math.min(0.16, latV * 0.006)) : 0) + (Math.random() - 0.5) * G.shake * 0.05;
  camera.rotation.set(player.pitch + (Math.random() - 0.5) * G.shake * 0.04, player.yaw, roll, 'YXZ');
  const targetFov = 72 + (player.sprinting && speed > 4 ? 9 : 0) + (player.flying ? 5 + 20 * Math.min(1, player.vel.length() / 34) : 0);
  camFov += (targetFov - camFov) * Math.min(1, dt * 8);
  if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); bits.setScale(window.innerHeight * graphics.pr, camFov * Math.PI / 180); fx.setScale(window.innerHeight * graphics.pr, camFov * Math.PI / 180); }
  // held block
  swing = Math.max(0, swing - dt * 4.2);
  heldBob += dt * (speed > 0.5 && player.onGround ? speed * 1.6 : 0);
  const sw = Math.sin((1 - swing) * Math.PI) * (swing > 0 ? 1 : 0);
  held.position.set(0, 0, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25 - sw * 0.9, -0.55 + sw * 0.3, 0.05));
  m.compose(new THREE.Vector3(0.46 - sw * 0.16, -0.42 - sw * 0.1 + Math.sin(heldBob * 2) * 0.012 * bobAmt, -0.82 + sw * 0.08), q, new THREE.Vector3(0.3, 0.3, 0.3));
  held.setMatrixAt(0, m); held.instanceMatrix.needsUpdate = true;
  held.visible = !player.flying || true;
}

function updateDebug(ms) {
  const e = player.e, info = renderer.info, c = dyn ? dyn.counts : {};
  const biome = terrain ? BIOME_NAMES[terrain.column(Math.floor(e.x), Math.floor(e.z), _o).biome] : '';
  $('debug').textContent =
    `Blockworld  ${fpsAvg.toFixed(0)} fps  (${frameMs.toFixed(1)} ms)  ${gfxName}\n` +
    `xyz ${e.x.toFixed(1)} ${e.y.toFixed(1)} ${e.z.toFixed(1)}   biome: ${biome}\n` +
    `chunks ${world.chunks.size} loaded / ${world.meshCount} meshed · view ${world.viewDist}\n` +
    `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
    `worker: gen ${(world.stats.genMs / Math.max(1, world.stats.gens)).toFixed(1)}ms  mesh ${(world.stats.meshMs / Math.max(1, world.stats.meshes)).toFixed(1)}ms\n` +
    `physics: ${dyn ? dyn.engine : '-'}  debris ${c.debris | 0}  primed ${c.primed | 0}  falling ${c.falling | 0}  colliders ${c.colliders | 0}\n` +
    `time ${String(Math.floor(sky.hours)).padStart(2, '0')}:${String(Math.floor((sky.hours % 1) * 60)).padStart(2, '0')}  seed ${seed}` +
    (target ? `\nlooking at ${DEFS[target.id].name} (${target.x},${target.y},${target.z})` : '');
}

// ---------------------------------------------------------------- title / boot
let ready = false;
function startIfReady() { if (ready && state === 'title') startGame(); }

$('play').addEventListener('click', startIfReady);
$('seed').addEventListener('input', updateSaveHint);
$('seed').addEventListener('change', () => { const s = $('seed').value.trim(); if (s && s !== seed) loadWorld(s); });
$('delsave').addEventListener('click', () => {
  const s = $('seed').value.trim(); if (!s) return;
  store.del(SAVE + s); if (store.get(SAVE + 'last') === s) store.del(SAVE + 'last');
  updateSaveHint(); if (s === seed) loadWorld(s); toast('Saved world deleted');
});
$('gfx').addEventListener('change', (e) => applyGraphics(e.target.value));
$('gfx2').addEventListener('change', (e) => applyGraphics(e.target.value));
$('resume').addEventListener('click', resume);
$('quit').addEventListener('click', goTitle);
$('vol').addEventListener('input', () => audio.setVolumes(parseInt($('vol').value) / 100, parseInt($('mus').value) / 100));
$('mus').addEventListener('input', () => audio.setVolumes(parseInt($('vol').value) / 100, parseInt($('mus').value) / 100));

async function boot() {
  applyGraphics(gfxName, true);
  buildHotbar(); buildInventory(); updateHeld();
  const last = store.get(SAVE + 'last');
  const initial = params.get('seed') || last || 'blockworld';
  $('seed').value = params.get('seed') || last || '';
  loadWorld(initial);
  requestAnimationFrame(frame);
  // physics engine (Rapier, WASM) - fall back to a tiny built-in solver if the CDN is unreachable
  let RAPIER = null;
  const bar = $('bootbar').firstElementChild;
  bar.style.width = '15%';
  try {
    const mod = await Promise.race([import('rapier'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))]);
    RAPIER = mod.default || mod;
    await RAPIER.init();
  } catch (err) { console.warn('Rapier unavailable, using built-in debris physics:', err); RAPIER = null; }
  dyn = new Dynamics(G, RAPIER);
  G.dyn = dyn;
  bar.style.width = '55%';
  // wait until the terrain in front of the camera has streamed in
  const wait = setInterval(() => {
    const pcx = Math.floor(camera.position.x / CS), pcz = Math.floor(camera.position.z / CS);
    const p = world.meshedCount(pcx, pcz, 3);
    bar.style.width = (55 + Math.min(1, p / 0.9) * 45) + '%';
    if (p > 0.85 || performance.now() > 20000) {
      clearInterval(wait); ready = true;
      $('play').disabled = false; updateSaveHint();
      $('bootbar').classList.add('hidden');
      if (params.has('autoplay')) startGame();
    }
  }, 150);
}
// debugging / test hook
window.__bw = { G, THREE, world, player, sky, audio, sheep, bits, fx, camera, renderer, scene, B, DEFS, keys, mouse, events,
  get dyn() { return dyn; }, get state() { return state; }, get target() { return target; }, get ready() { return ready; },
  stepSim, startGame, pause, resume, goTitle, saveGame, loadWorld, select, applyGraphics, tryPlace, punch,
  get fps() { return fpsAvg; }, prof, get seed() { return seed; }, setMouse(l, r) { mouse.l = l; mouse.r = r; } };
boot();
