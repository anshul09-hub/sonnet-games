// Block definitions and world constants. Pure data: shared by the main thread and the worker.
export const CS = 16;          // chunk width/depth
export const H = 112;          // world height
export const SEA = 34;         // sea level
export const SZ = CS * CS * H; // blocks per chunk
export const TILES = 16;       // atlas is TILES x TILES tiles
export const TILE_PX = 16;

export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4, GRAVEL: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, WATER: 9, SNOW: 10, PLANKS: 11, COBBLE: 12, GLASS: 13, TNT_SIDE: 14, TNT_TOP: 15,
  TNT_BOTTOM: 16, BEDROCK: 17, SANDSTONE_SIDE: 18, SANDSTONE_TOP: 19, COAL: 20, FLOWER_R: 21,
  FLOWER_Y: 22, TALLGRASS: 23, CACTUS_SIDE: 24, CACTUS_TOP: 25, BRICK: 26, ICE: 27,
};

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, GRAVEL: 5, LOG: 6, LEAVES: 7, WATER: 8, SNOW: 9,
  PLANKS: 10, COBBLE: 11, GLASS: 12, TNT: 13, BEDROCK: 14, SANDSTONE: 15, COAL: 16,
  FLOWER_R: 17, FLOWER_Y: 18, TALLGRASS: 19, CACTUS: 20, BRICK: 21, ICE: 22,
};

// kind: cube | leaves | water | glass | plant
// snd: footstep / break sound family.  time: seconds to break by hand.
const defs = [];
function def(id, name, kind, top, bottom, side, snd, time, extra) {
  defs[id] = Object.assign({ id, name, kind, top, bottom, side, snd, time }, extra);
}
def(B.AIR, 'Air', 'air', 0, 0, 0, 'none', 0);
def(B.GRASS, 'Grass', 'cube', T.GRASS_TOP, T.DIRT, T.GRASS_SIDE, 'grass', 0.4, { tint: true });
def(B.DIRT, 'Dirt', 'cube', T.DIRT, T.DIRT, T.DIRT, 'gravel', 0.4);
def(B.STONE, 'Stone', 'cube', T.STONE, T.STONE, T.STONE, 'stone', 1.0);
def(B.SAND, 'Sand', 'cube', T.SAND, T.SAND, T.SAND, 'sand', 0.35, { falls: true });
def(B.GRAVEL, 'Gravel', 'cube', T.GRAVEL, T.GRAVEL, T.GRAVEL, 'gravel', 0.4, { falls: true });
def(B.LOG, 'Oak Log', 'cube', T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE, 'wood', 0.7);
def(B.LEAVES, 'Leaves', 'leaves', T.LEAVES, T.LEAVES, T.LEAVES, 'grass', 0.12, { tint: true });
def(B.WATER, 'Water', 'water', T.WATER, T.WATER, T.WATER, 'water', 0);
def(B.SNOW, 'Snow', 'cube', T.SNOW, T.SNOW, T.SNOW, 'snow', 0.25);
def(B.PLANKS, 'Planks', 'cube', T.PLANKS, T.PLANKS, T.PLANKS, 'wood', 0.6);
def(B.COBBLE, 'Cobblestone', 'cube', T.COBBLE, T.COBBLE, T.COBBLE, 'stone', 1.1);
def(B.GLASS, 'Glass', 'glass', T.GLASS, T.GLASS, T.GLASS, 'glass', 0.2);
def(B.TNT, 'TNT', 'cube', T.TNT_TOP, T.TNT_BOTTOM, T.TNT_SIDE, 'grass', 0);
def(B.BEDROCK, 'Bedrock', 'cube', T.BEDROCK, T.BEDROCK, T.BEDROCK, 'stone', Infinity);
def(B.SANDSTONE, 'Sandstone', 'cube', T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE, 'stone', 0.7);
def(B.COAL, 'Coal Ore', 'cube', T.COAL, T.COAL, T.COAL, 'stone', 1.2);
def(B.FLOWER_R, 'Poppy', 'plant', T.FLOWER_R, T.FLOWER_R, T.FLOWER_R, 'grass', 0);
def(B.FLOWER_Y, 'Dandelion', 'plant', T.FLOWER_Y, T.FLOWER_Y, T.FLOWER_Y, 'grass', 0);
def(B.TALLGRASS, 'Tall Grass', 'plant', T.TALLGRASS, T.TALLGRASS, T.TALLGRASS, 'grass', 0, { tint: true });
def(B.CACTUS, 'Cactus', 'cube', T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE, 'wood', 0.4);
def(B.BRICK, 'Bricks', 'cube', T.BRICK, T.BRICK, T.BRICK, 'stone', 1.0);
def(B.ICE, 'Ice', 'glass', T.ICE, T.ICE, T.ICE, 'glass', 0.3);
export const DEFS = defs;
export const NBLOCKS = defs.length;

// Lookup tables (indexed by block id)
export const SOLID = new Uint8Array(256);   // collides with the player
export const OPAQUE = new Uint8Array(256);  // hides neighbouring faces
export const AOOCC = new Uint8Array(256);   // occludes ambient light on corners
export const TRANSP = new Uint8Array(256);  // rendered in the blended pass
export const PLANT = new Uint8Array(256);
export const FALLS = new Uint8Array(256);
export const LEAF = new Uint8Array(256);
export const WATERB = new Uint8Array(256);
for (const d of defs) {
  const k = d.kind;
  SOLID[d.id] = (k === 'cube' || k === 'leaves' || k === 'glass') ? 1 : 0;
  OPAQUE[d.id] = k === 'cube' ? 1 : 0;
  AOOCC[d.id] = (k === 'cube' || k === 'leaves') ? 1 : 0;
  TRANSP[d.id] = (k === 'glass' || k === 'water') ? 1 : 0;
  PLANT[d.id] = k === 'plant' ? 1 : 0;
  FALLS[d.id] = d.falls ? 1 : 0;
  LEAF[d.id] = k === 'leaves' ? 1 : 0;
  WATERB[d.id] = k === 'water' ? 1 : 0;
}

export const PLACEABLE = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.BRICK, B.SANDSTONE, B.SAND, B.GRAVEL,
  B.GLASS, B.ICE, B.SNOW, B.LEAVES, B.COAL, B.CACTUS, B.TNT, B.FLOWER_R, B.FLOWER_Y, B.TALLGRASS];

export const idx = (x, y, z) => (y * CS + z) * CS + x;
