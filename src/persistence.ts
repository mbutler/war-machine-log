import fs from 'fs/promises';
import { WorldState } from './types.ts';

const WORLD_PATH = 'world.json';

export async function loadWorld(): Promise<WorldState | null> {
  try {
    const raw = await fs.readFile(WORLD_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    // Rehydrate dates
    parsed.startedAt = new Date(parsed.startedAt);
    return parsed as WorldState;
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

