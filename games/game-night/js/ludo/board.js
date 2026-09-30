// The 3D Ludo board. Cell (c,r) of the 15x15 grid maps to world x = c - 7, z = r - 7 (cell centres), top surface at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { toon, std, mesh, canvasTex } from '../core/toon.js';
import { TRACK, LANE, BASE_ORIGIN, BASE_SLOTS, HOME_CENTER, STAR_ABS, START_ABS, COLOR_HEX, cellOf, HOME } from './rules.js';
import { shade } from '../core/util.js';

// Look of the board per world theme.
export const BOARD_STYLES = {
  anime: { toon: true, slab: 0xd9b98a, border: 0x9a3b2b, tile: 0xfff6e2, tileSide: 0xe7cfa6, baseInner: 0xfff6e2, glow: false, tint: 0.0, ring: 0xffffff },
  gamer: { toon: false, slab: 0x120d2e, border: 0x2a2470, tile: 0x201a52, tileSide: 0x120d2e, baseInner: 0x181245, glow: true, tint: 0.0, ring: 0x9fa6ff },
  tech: { toon: false, slab: 0x071420, border: 0x0d3a5c, tile: 0x0f2740, tileSide: 0x071420, baseInner: 0x0b1f33, glow: true, tint: 0.0, ring: 0x6fefff },
};

export const cw = (c, r) => new THREE.Vector3(c - 7, 0, r - 7); // world position of cell (c,r) centre (integer cell coords)
export const gridToWorld = ([gx, gy]) => new THREE.Vector3(gx - 7.5, 0, gy - 7.5); // from grid units (cell centres at .5)

function starShape(r = 0.34, ri = 0.15) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? ri : r; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  s.closePath(); return s;
}

export class Board {
  constructor(styleId = 'anime') {
    this.style = BOARD_STYLES[styleId] || BOARD_STYLES.anime;
    this.styleId = styleId;
    this.group = new THREE.Group(); this.group.name = 'board';
    this.tiles = new Map();
    this.mats = {};
    this.glowMats = [];
    this._build();
  }

  m(color, o = {}) { return this.style.toon ? toon(color, o) : std(color, { rough: 0.45, metal: 0.25, ...o }); }
  emissiveTile(color, i = 0.55) { const m = std(shade(color, -0.6), { rough: 0.4, metal: 0.3, emissive: color, ei: i }); this.glowMats.push(m); return m; }

  _build() {
    const S = this.style, g = this.group;
    // slab + frame
    const slab = mesh(new RoundedBoxGeometry(16.6, 0.6, 16.6, 4, 0.16), this.m(S.slab), { cast: true, receive: true, pos: [0, -0.31, 0] }); g.add(slab);
    const frame = new THREE.Group();
    for (const [w, d, x, z] of [[16.9, 0.55, 0, -8.18], [16.9, 0.55, 0, 8.18], [0.55, 16.9, -8.18, 0], [0.55, 16.9, 8.18, 0]]) frame.add(mesh(new RoundedBoxGeometry(w, 0.32, d, 3, 0.1), S.glow ? this.emissiveTile(S.ring, 0.9) : this.m(S.border), { pos: [x, -0.04, z], receive: true }));
    g.add(frame);
    this.slab = slab;
    // bases
    for (let c = 0; c < 4; c++) {
      const [ox, oy] = BASE_ORIGIN[c], col = COLOR_HEX[c];
      const centre = gridToWorld([ox + 3.5, oy + 3.5]); // base is cols ox..ox+5 -> centre grid coord ox+3
      const bx = ox + 3, by = oy + 3;
      const bw = gridToWorld([bx, by]);
      g.add(mesh(new RoundedBoxGeometry(5.9, 0.16, 5.9, 3, 0.12), S.glow ? this.emissiveTile(col, 0.5) : this.m(col), { pos: [bw.x, 0.02, bw.z], receive: true }));
      const inner = mesh(new RoundedBoxGeometry(4.4, 0.12, 4.4, 3, 0.1), this.m(S.baseInner), { pos: [bw.x, 0.1, bw.z], receive: true }); g.add(inner);
      for (let k = 0; k < 4; k++) {
        const [sx, sy] = BASE_SLOTS[c][k], w = gridToWorld([sx, sy]);
        g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 32), this.m(col), { pos: [w.x, 0.17, w.z], receive: true }));
        g.add(mesh(new THREE.TorusGeometry(0.5, 0.045, 8, 32), this.m(shade(col, -0.2)), { pos: [w.x, 0.2, w.z], rot: [Math.PI / 2, 0, 0], cast: false }));
      }
    }
    // track tiles
    const tileGeo = new RoundedBoxGeometry(0.94, 0.14, 0.94, 3, 0.05);
    TRACK.forEach(([c, r], abs) => {
      const start = START_ABS.indexOf(abs);
      const col = start >= 0 ? COLOR_HEX[start] : 0;
      const mat = start >= 0 ? (S.glow ? this.emissiveTile(col, 0.9) : this.m(col)) : (S.glow ? this.emissiveTile(S.tile === 0x201a52 ? 0x6f6cff : 0x2fa8ff, 0.16) : this.m(S.tile));
      const t = mesh(tileGeo, mat, { pos: [c - 7, 0.0, r - 7], receive: true });
      g.add(t); this.tiles.set('t' + abs, t);
    });
    // home lanes
    LANE.forEach((cells, colorIdx) => {
      cells.forEach(([c, r], i) => { const col = COLOR_HEX[colorIdx]; g.add(mesh(tileGeo, S.glow ? this.emissiveTile(col, 0.7) : this.m(col), { pos: [c - 7, 0, r - 7], receive: true })); });
    });
    // star squares + start markers
    const starGeo = new THREE.ExtrudeGeometry(starShape(), { depth: 0.03, bevelEnabled: false });
    STAR_ABS.forEach((abs) => {
      const [c, r] = TRACK[abs];
      const st = mesh(starGeo, S.glow ? this.emissiveTile(0xffd23f, 1.4) : this.m(0xffb020), { pos: [c - 7, 0.075, r - 7], rot: [-Math.PI / 2, 0, 0], cast: false });
      g.add(st);
    });
    START_ABS.forEach((abs, colorIdx) => {
      const [c, r] = TRACK[abs];
      g.add(mesh(new THREE.TorusGeometry(0.28, 0.045, 8, 24), this.m(0xffffff), { pos: [c - 7, 0.09, r - 7], rot: [Math.PI / 2, 0, 0], cast: false }));
    });
    // centre: four triangles meeting in a point
    const cz = gridToWorld(HOME_CENTER);
    const tri = (pts, col) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); return mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), S.glow ? this.emissiveTile(col, 0.75) : this.m(col), { pos: [cz.x, 0, cz.z], rot: [-Math.PI / 2, 0, 0], receive: true }); };
    // shape +y becomes world -z after the -90deg rotation: red = left, green = top, yellow = right, blue = bottom
    g.add(tri([[-1.5, 1.5], [-1.5, -1.5], [0, 0]], COLOR_HEX[0]));  // left  -> red
    g.add(tri([[-1.5, 1.5], [1.5, 1.5], [0, 0]], COLOR_HEX[1]));    // shape +y is world -z: this is the top edge -> green
    g.add(tri([[1.5, 1.5], [1.5, -1.5], [0, 0]], COLOR_HEX[2]));    // right -> yellow
    g.add(tri([[-1.5, -1.5], [1.5, -1.5], [0, 0]], COLOR_HEX[3]));  // bottom -> blue
    const hub = mesh(new THREE.CylinderGeometry(0.42, 0.5, 0.2, 24), this.m(0xffffff), { pos: [cz.x, 0.1, cz.z] }); g.add(hub);
    const gem = mesh(new THREE.OctahedronGeometry(0.3), S.glow ? this.emissiveTile(0xffffff, 1.2) : this.m(0xffd23f), { pos: [cz.x, 0.42, cz.z], scale: [1, 1.3, 1] }); g.add(gem); this.gem = gem;
    // target marker used to preview a token's destination
    this.marker = mesh(new THREE.TorusGeometry(0.4, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), { rot: [Math.PI / 2, 0, 0], cast: false });
    this.marker.visible = false; g.add(this.marker);
  }

  /** World position (board-local) of a token. `stack` = {index, count} spreads tokens sharing a cell. */
  tokenPos(colorIdx, rel, tokIdx, stack = null) {
    const [gx, gy] = cellOf(colorIdx, rel, tokIdx);
    const p = gridToWorld([gx, gy]);
    p.y = rel < 0 ? 0.2 : rel === HOME ? 0.12 : 0.08;
    if (stack && stack.count > 1) {
      const a = (stack.index / stack.count) * Math.PI * 2 + 0.6, r = stack.count === 2 ? 0.2 : 0.24;
      p.x += Math.cos(a) * r; p.z += Math.sin(a) * r;
    }
    return p;
  }

  update(t) { if (this.gem) { this.gem.rotation.y = t * 1.2; this.gem.position.y = 0.42 + Math.sin(t * 2) * 0.05; } }
  setMarker(pos, color = 0xffffff) { if (!pos) { this.marker.visible = false; return; } this.marker.visible = true; this.marker.position.set(pos.x, 0.14, pos.z); this.marker.material.color.setHex(color); }
}
