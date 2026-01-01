import { Random } from './rng.ts';
import { LogEntry, WorldState, Dungeon, Terrain, RareFind } from './types.ts';
import { createRumor, logRumor } from './rumors.ts';
import { StockedRoom } from './stocking.ts';
import { TreasureType, discoverTreasure, TreasureState, createTreasureState } from './treasure.ts';

const WANDER_ODDS_BY_TERRAIN: Record<Terrain, number> = {
  road: 1 / 12,
  clear: 1 / 10,
  forest: 1 / 8,
  hills: 1 / 8,
  mountains: 1 / 6,
  swamp: 1 / 6,
  desert: 1 / 8,
  coastal: 1 / 8,
  ocean: 1 / 6,
  reef: 1 / 6,
  river: 1 / 10,
};

const DUNGEON_WANDER_ODDS = 1 / 6; // per hour inside

const DUNGEON_FOES = ['giant rats', 'skeletons', 'kobolds', 'goblins', 'stirges', 'spiders'] as const;
const DUNGEON_TREASURE = ['tarnished coins', 'old tapestries', 'silver candlesticks', 'uncut gems', 'ancient scrolls'] as const;

function wanderOutcome(rng: Random, actors: string[]): { summary: string; details: string } {
  const foe = rng.pick(DUNGEON_FOES);
  const hostile = rng.chance(0.6);
  if (!hostile) {
    if (rng.chance(0.2)) {
      const loot = rng.pick(DUNGEON_TREASURE);
      return {
        summary: `${actors[0]} notice ${loot}`,
        details: 'They mark the cache for later.',
      };
    }
    return {
      summary: `${actors[0]} hear ${foe} nearby`,
      details: 'Footsteps fade into the dark.',
    };
  }
  const win = rng.chance(0.65);
  if (win) {
    return {
      summary: `${actors[0]} fend off ${foe}`,
      details: 'Short clash in the corridors.',
    };
  }
  return {
    summary: `${actors[0]} driven back by ${foe}`,
    details: 'They fall back to safer halls.',
  };
}

// Map dungeon danger to treasure type
function getDungeonTreasureType(danger: number, roomType: string, rng: Random): TreasureType {
  if (roomType === 'lair') {
    // Lair treasures based on danger level
    if (danger >= 5) return rng.pick(['E', 'F', 'D'] as TreasureType[]);
    if (danger >= 3) return rng.pick(['C', 'D', 'B'] as TreasureType[]);
    return rng.pick(['C', 'J', 'K'] as TreasureType[]);
  }
  // Regular treasure rooms
  if (danger >= 5) return rng.pick(['D', 'E'] as TreasureType[]);
  if (danger >= 3) return rng.pick(['C', 'D'] as TreasureType[]);
  return rng.pick(['J', 'K', 'L', 'M'] as TreasureType[]);
}

function applyRoomOutcome(
  rng: Random,
  dungeon: Dungeon,
  room: StockedRoom,
  actors: string[],
  world: WorldState | undefined,
  treasureState?: TreasureState,
  worldTime?: Date,
): { summary: string; details: string; fameDelta?: number; injury?: boolean; death?: boolean; rare?: RareFind; treasureLogs?: LogEntry[] } {
  switch (room.type) {
    case 'treasure': {
      // Use BECMI treasure types!
      const treasureType = getDungeonTreasureType(dungeon.danger, 'treasure', rng);
      const treasureLogs: LogEntry[] = [];
      
      if (treasureState && world && worldTime) {
        const logs = discoverTreasure(rng, treasureType, dungeon.name, actors[0], treasureState, world, worldTime);
        treasureLogs.push(...logs);
      }
      
      return {
        summary: `${actors[0]} discover a treasure cache`,
        details: `Type ${treasureType} treasure found in the depths.`,
        fameDelta: 1,
        rare: room.rare,
        treasureLogs,
      };
    }
    case 'trap': {
      const death = rng.chance(0.2);
      return {
        summary: `${actors[0]} trigger a trap`,
        details: death ? 'A lethal fall in the dark.' : 'Bruised and shaken, they press on.',
        fameDelta: death ? -1 : 0,
        death,
        injury: !death,
      };
    }
    case 'lair': {
      const death = rng.chance(0.15);
      const treasureLogs: LogEntry[] = [];
      
      // Monsters have treasure!
      if (!death && treasureState && world && worldTime) {
        const treasureType = getDungeonTreasureType(dungeon.danger, 'lair', rng);
        const logs = discoverTreasure(rng, treasureType, dungeon.name, actors[0], treasureState, world, worldTime);
        treasureLogs.push(...logs);
      }
      
      return {
        summary: `${actors[0]} battle lair denizens`,
        details: death ? 'They withdraw, leaving fallen behind.' : 'Beasts broken after a grim melee. Their hoard is claimed.',
        fameDelta: death ? -1 : 1,
        death,
        injury: !death && rng.chance(0.3),
        treasureLogs,
      };
    }
    case 'shrine':
    case 'laboratory':
      return {
        summary: `${actors[0]} uncover a ${room.type}`,
        details: 'Strange glyphs and relics hint at deeper secrets.',
        fameDelta: 1,
      };
    case 'empty':
    default:
      return {
        summary: `${actors[0]} comb dusty halls`,
        details: 'Old bones and silence.',
      };
  }
}

export function exploreDungeonTick(
  rng: Random,
  dungeon: Dungeon,
  actors: string[],
  worldTime: Date,
  seed: string,
  world: WorldState,
  treasureState?: TreasureState,
): LogEntry[] {
  const logs: LogEntry[] = [];
  if (!dungeon.rooms || dungeon.rooms.length === 0) {
    logs.push({
      category: 'dungeon',
      summary: `${dungeon.name} shows no new clues`,
      details: 'Explorers retrace old steps.',
      location: dungeon.name,
      actors,
      worldTime,
      realTime: new Date(),
      seed,
    });
    return logs;
  }
  const room = dungeon.rooms.shift()!;
  dungeon.explored = (dungeon.explored ?? 0) + 1;
  const outcome = applyRoomOutcome(rng, dungeon, room, actors, world, treasureState, worldTime);

  // Fame adjustments
  const party = world.parties.find((p) => p.name === actors[0]);
  if (party && outcome.fameDelta) {
    party.fame = Math.max(0, (party.fame ?? 0) + outcome.fameDelta);
  }
  
  // XP rewards for dungeon exploration
  if (party) {
    party.xp += 200 + rng.int(800);
  }

  // Rare find ripple: affect economy/factions via rumors.
  if (outcome.rare && world) {
    const rumor = createRumor(
      world,
      rng,
      dungeon.name,
      dungeon.name,
      'mystery',
      `${actors[0]} emerge with a ${outcome.rare}; traders whisper of shifting prices.`,
    );
    world.activeRumors.push(rumor);
    logs.push(logRumor(rumor, worldTime, seed));
  }
  // Injury/death flags
  if (party && outcome.injury) {
    party.wounded = true;
    party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
  }
  if (party && outcome.death) {
    // abstract: fame drop
    party.fame = Math.max(0, (party.fame ?? 0) - 1);
  }

  logs.push({
    category: 'dungeon',
    summary: `${dungeon.name}: ${outcome.summary}`,
    details: outcome.details,
    location: dungeon.name,
    actors,
    worldTime,
    realTime: new Date(),
    seed,
  });
  
  // Add treasure discovery logs
  if (outcome.treasureLogs) {
    logs.push(...outcome.treasureLogs);
  }
  
  return logs;
}

export function dungeonWanders(
  rng: Random,
  dungeon: Dungeon,
  actors: string[],
  worldTime: Date,
  seed: string,
  world?: WorldState,
): LogEntry | undefined {
  if (!rng.chance(DUNGEON_WANDER_ODDS)) return undefined;
  const outcome = wanderOutcome(rng, actors);
  // Fame tweak for dungeon delves
  if (world && rng.chance(0.2)) {
    const partyName = actors[0];
    const party = world.parties.find((p) => p.name === partyName);
    if (party) {
      party.fame = (party.fame ?? 0) + 1;
    }
  }
  if (world && rng.chance(0.1)) {
    const rumor = createRumor(
      world,
      rng,
      dungeon.name,
      dungeon.name,
      'dungeon',
      `${actors[0]} whisper about ${dungeon.name}: ${outcome.summary}`,
    );
    world.activeRumors.push(rumor);
    return logRumor(rumor, worldTime, seed);
  }
  return {
    category: 'dungeon',
    summary: `${dungeon.name}: ${outcome.summary}`,
    details: outcome.details,
    location: dungeon.name,
    actors,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

