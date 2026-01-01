/**
 * ANCIENT RUINS SYSTEM
 * 
 * Generates persistent, multi-room ruins that can be explored and cleared.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Ruin, HexCoord, Terrain } from './types.ts';
import { stockDungeon } from './stocking.ts';

const RUIN_NAMES = ['Citadel', 'Catacombs', 'Sanctum', 'Archives', 'Forge', 'Bastion', 'Ossuary', 'Vault'];
const RUIN_ADJECTIVES = ['Shattered', 'Forgotten', 'Buried', 'Nameless', 'Sunken', 'Cursed', 'Ashen', 'Silver'];

export function generateProceduralRuin(
  rng: Random,
  location: HexCoord,
  terrain: Terrain,
  world: WorldState
): Ruin {
  const name = `${rng.pick(RUIN_ADJECTIVES)} ${rng.pick(RUIN_NAMES)}`;
  const depth = 2 + rng.int(4);
  const danger = 2 + rng.int(5);
  
  const ruin: Ruin = {
    id: `ruin-${Date.now()}-${rng.int(1000)}`,
    name,
    description: `An ancient ${name.toLowerCase()} from the ${rng.pick(['Age of Wonders', 'First Age', 'Empire of Dust'])}.`,
    location,
    rooms: [], // Will be stocked like a dungeon
    cleared: false,
    danger,
    history: `${name} was once a center of ${rng.pick(['magic', 'trade', 'war', 'faith'])} before its fall.`,
  };

  // Stock the ruin using existing dungeon stocking logic
  ruin.rooms = stockDungeon(rng, { 
    depth, 
    danger, 
    id: ruin.id, 
    name: ruin.name, 
    coord: ruin.location 
  });

  return ruin;
}

export function tickRuins(
  world: WorldState,
  rng: Random,
  worldTime: Date
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Factions might try to re-occupy cleared ruins
  for (const ruin of world.ruins) {
    if (ruin.cleared && !ruin.occupiedBy && rng.chance(0.01)) {
      const faction = rng.pick(world.factions);
      ruin.occupiedBy = faction.name;
      ruin.cleared = false;
      ruin.danger += 2;
      
      logs.push({
        category: 'faction',
        summary: `${faction.name} occupies ${ruin.name}`,
        details: `Seeking a strategic base, the faction has moved into the cleared ruins.`,
        location: `hex:${ruin.location.q},${ruin.location.r}`,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  return logs;
}

