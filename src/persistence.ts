import fs from 'fs/promises';
import { WorldState, Good } from './types.ts';

const WORLD_PATH = 'world.json';

function normalize(world: WorldState): WorldState {
  if (!world.activeRumors) world.activeRumors = [];
  if (!world.dungeons) world.dungeons = [];
  if (!world.roads) world.roads = [];
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
  return world;
}

export async function loadWorld(): Promise<WorldState | null> {
  try {
    const raw = await fs.readFile(WORLD_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Rehydrate dates
    parsed.startedAt = new Date(parsed.startedAt);
    
    // Rehydrate story thread dates
    if (parsed.storyThreads) {
      for (const story of parsed.storyThreads) {
        if (story.startedAt) story.startedAt = new Date(story.startedAt);
        if (story.lastUpdated) story.lastUpdated = new Date(story.lastUpdated);
        if (story.beats) {
          for (const beat of story.beats) {
            if (beat.timestamp) beat.timestamp = new Date(beat.timestamp);
          }
        }
      }
    }
    
    // Rehydrate antagonist dates
    if (parsed.antagonists) {
      for (const ant of parsed.antagonists) {
        if (ant.lastSeen) ant.lastSeen = new Date(ant.lastSeen);
      }
    }
    
    return normalize(parsed as WorldState);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveWorld(world: WorldState): Promise<void> {
  const data = JSON.stringify(world, null, 2);
  await fs.writeFile(WORLD_PATH, data, 'utf8');
}

export const worldPath = WORLD_PATH;

