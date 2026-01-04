import { readFile, writeFile } from 'fs/promises';
import { WorldState, Good, Terrain } from './types.ts';

const WORLD_PATH = 'world.json';

// Schema version - increment when making breaking changes
export const WORLD_SCHEMA_VERSION = 2;

// Valid terrain types for validation
const VALID_TERRAINS: Terrain[] = [
  'road', 'clear', 'forest', 'hills', 'mountains', 'swamp', 'desert',
  'coastal', 'ocean', 'reef', 'river'
];

function normalize(world: WorldState): WorldState {
  // Add schema version if missing
  if (!world.schemaVersion) world.schemaVersion = 1;
  
  if (!world.activeRumors) world.activeRumors = [];
  if (!world.dungeons) world.dungeons = [];
  if (!world.roads) world.roads = [];
  if (!world.landmarks) world.landmarks = [];
  if (!world.ruins) world.ruins = [];
  if (!world.strongholds) world.strongholds = [];
  if (!world.armies) world.armies = [];
  if (!world.mercenaries) world.mercenaries = [];
  if (!world.nexuses) world.nexuses = [];
  
  const goods: Good[] = ['grain', 'timber', 'ore', 'textiles', 'salt', 'fish', 'livestock'];
  for (const s of world.settlements) {
    if (!s.supply) {
      s.supply = Object.fromEntries(goods.map((g) => [g, 0])) as Record<Good, number>;
    }
    if (typeof s.mood !== 'number') s.mood = 0;
    if (!s.priceTrends) {
      s.priceTrends = Object.fromEntries(goods.map((g) => [g, 'normal'])) as Record<Good, 'low' | 'normal' | 'high'>;
    }
  }
  
  if (!world.npcs) world.npcs = [];
  for (const n of world.npcs) {
    if (n.alive === undefined) n.alive = true;
    if (n.fame === undefined) n.fame = 0;
  }
  
  if (!world.caravans) world.caravans = [];
  if (!world.factions) world.factions = [];
  
  for (const d of world.dungeons) {
    if (d.explored === undefined) d.explored = 0;
  }
  
  // Validate/fix hex terrain types
  for (const hex of world.hexes) {
    if (!VALID_TERRAINS.includes(hex.terrain)) {
      console.warn(`Unknown terrain type "${hex.terrain}" at (${hex.coord.q},${hex.coord.r}), defaulting to "clear"`);
      hex.terrain = 'clear';
    }
  }
  
  // Ensure parties have required fields
  for (const party of world.parties) {
    if (party.fame === undefined) party.fame = 0;
    if (party.fatigue === undefined) party.fatigue = 0;
  }
  
  // Update schema version
  world.schemaVersion = WORLD_SCHEMA_VERSION;
  
  return world;
}

export async function loadWorld(): Promise<WorldState | null> {
  try {
    const raw = await readFile(WORLD_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    
    // Check schema version and log migration
    const loadedVersion = parsed.schemaVersion ?? 1;
    if (loadedVersion < WORLD_SCHEMA_VERSION) {
      console.log(`📦 Migrating world from schema v${loadedVersion} to v${WORLD_SCHEMA_VERSION}...`);
    }
    
    // Rehydrate dates
    parsed.startedAt = new Date(parsed.startedAt);
    if (parsed.lastTickAt) {
      parsed.lastTickAt = new Date(parsed.lastTickAt);
    } else {
      // Old world files don't have lastTickAt - use startedAt as baseline
      // This means catch-up will simulate from when the world was created
      parsed.lastTickAt = new Date(parsed.startedAt);
      console.log(`⏰ No lastTickAt found - using startedAt for catch-up baseline`);
    }
    // Rehydrate lastRealTickAt if present (for 1:1 catch-up)
    if ((parsed as any).lastRealTickAt) {
      (parsed as any).lastRealTickAt = new Date((parsed as any).lastRealTickAt);
    }
    
  // Rehydrate story thread dates and add enhanced fields
  if (parsed.storyThreads) {
    for (const story of parsed.storyThreads) {
      if (story.startedAt) story.startedAt = new Date(story.startedAt);
      if (story.lastUpdated) story.lastUpdated = new Date(story.lastUpdated);
      if (story.beats) {
        for (const beat of story.beats) {
          if (beat.timestamp) beat.timestamp = new Date(beat.timestamp);
        }
      }

      // Add enhanced context fields for richer storytelling (backwards compatible)
      if (!story.context) {
        story.context = {
          actorRelationships: [],
          keyLocations: [],
          themes: [],
          motivations: {}
        };
      }
      if (!story.branchingState) {
        story.branchingState = {
          path: undefined,
          choices: [],
          variables: {}
        };
      }
    }
  }
    
    // Rehydrate antagonist dates
    if (parsed.antagonists) {
      for (const ant of parsed.antagonists) {
        if (ant.lastSeen) ant.lastSeen = new Date(ant.lastSeen);
      }
    }
    
    const normalized = normalize(parsed as WorldState);
    console.log(`✓ World loaded successfully (schema v${WORLD_SCHEMA_VERSION})`);
    return normalized;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveWorld(world: WorldState): Promise<void> {
  const data = JSON.stringify(world, null, 2);
  await writeFile(WORLD_PATH, data, 'utf8');
}

export const worldPath = WORLD_PATH;

