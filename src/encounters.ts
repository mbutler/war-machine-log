import { Random } from './rng.ts';
import { LogEntry, Terrain } from './types.ts';

interface EncounterResult {
  summary: string;
  details: string;
  delayMiles?: number;
  fatigueDelta?: number;
  injured?: boolean;
  death?: boolean;
}

const ENCOUNTER_ODDS_DAY: Record<Terrain, number> = {
  road: 1 / 12, // slightly safer
  clear: 1 / 6,
  forest: 2 / 6,
  hills: 2 / 6,
  mountains: 3 / 6,
  swamp: 3 / 6,
  desert: 2 / 6,
  coastal: 1 / 6,
  ocean: 0, // Can't walk on ocean
  reef: 0,
  river: 1 / 8,
};

const ENCOUNTER_ODDS_NIGHT: Record<Terrain, number> = {
  road: 1 / 10,
  clear: 1 / 12,
  forest: 2 / 12,
  hills: 2 / 12,
  mountains: 3 / 12,
  swamp: 3 / 12,
  desert: 2 / 12,
  coastal: 1 / 8,
  ocean: 0,
  reef: 0,
  river: 1 / 10,
};

const FOES_BY_TERRAIN: Record<Terrain, readonly string[]> = {
  road: ['bandits', 'brigands', 'patrolling guards', 'merchants'],
  clear: ['bandits', 'wolves', 'goblins', 'orc raiders'],
  forest: ['wolves', 'goblins', 'brigands', 'giant spiders'],
  hills: ['orc raiders', 'goblins', 'brigands', 'ogre'],
  mountains: ['orc raiders', 'giant bats', 'goblins', 'ogre'],
  swamp: ['lizardfolk', 'giant leeches', 'goblins', 'brigands'],
  desert: ['bandits', 'giant scorpions', 'orc raiders', 'gnolls'],
  coastal: ['smugglers', 'pirates', 'giant crabs', 'fishermen', 'sahuagin'],
  ocean: ['sea serpent', 'pirates', 'merfolk'],  // Only for ship encounters
  reef: ['sharks', 'merfolk', 'giant octopus'],
  river: ['bandits', 'fishermen', 'nixies', 'giant pike'],
};

function reaction(rng: Random): 'friendly' | 'cautious' | 'hostile' {
  const roll = 2 + rng.int(6) + rng.int(6); // 2d6
  if (roll >= 10) return 'friendly';
  if (roll >= 7) return 'cautious';
  return 'hostile';
}

function resolveEncounter(rng: Random, terrain: Terrain, actors: string[]): EncounterResult {
  const foes = FOES_BY_TERRAIN[terrain] ?? FOES_BY_TERRAIN.clear;
  const foe = rng.pick(foes);
  const react = reaction(rng);

  if (react === 'friendly') {
    return {
      summary: `${actors[0]} parley with ${foe}`,
      details: 'Trade news and share a quick meal before parting ways.',
    };
  }
  if (react === 'cautious') {
    const avoided = rng.chance(0.5);
    if (avoided) {
      return {
        summary: `${actors[0]} spot ${foe} and avoid notice`,
        details: 'They detour carefully, leaving only faint tracks.',
        delayMiles: rng.chance(0.5) ? 3 : 0,
        fatigueDelta: rng.chance(0.3) ? 1 : 0,
      };
    }
    return {
      summary: `${actors[0]} shadowed by ${foe}`,
      details: 'Tense standoff; both sides withdraw before blades are drawn.',
      delayMiles: rng.chance(0.5) ? 2 : 0,
      fatigueDelta: rng.chance(0.3) ? 1 : 0,
    };
  }

  // hostile
  const won = rng.chance(0.65);
  if (won) {
    return {
      summary: `${actors[0]} clash with ${foe}`,
      details: 'Brief skirmish; foes driven off with minor bruises.',
      fatigueDelta: rng.chance(0.2) ? 1 : 0,
      injured: rng.chance(0.15),
    };
  }
  const death = rng.chance(0.2); // OSR-ish lethality on bad ambush
  return {
    summary: `${actors[0]} ambushed by ${foe}`,
    details: death ? 'Casualties suffered in the rout.' : 'Forced retreat; they fall back to regroup.',
    delayMiles: 6 + rng.int(6),
    fatigueDelta: 1 + rng.int(2),
    injured: !death && rng.chance(0.4),
    death,
  };
}

export function maybeEncounter(
  rng: Random,
  terrain: Terrain,
  worldTime: Date,
  location: string,
  actors: string[],
  seed: string,
): (LogEntry & { delayMiles?: number; injured?: boolean }) | undefined {
  const hour = worldTime.getUTCHours();
  const isDay = hour >= 6 && hour < 18;
  const odds = isDay ? ENCOUNTER_ODDS_DAY[terrain] ?? 0 : ENCOUNTER_ODDS_NIGHT[terrain] ?? 0;
  if (!rng.chance(odds)) return undefined;

  const result = resolveEncounter(rng, terrain, actors);
  return {
    category: 'road',
    summary: result.summary,
    details: result.details,
    location,
    actors,
    worldTime,
    realTime: new Date(),
    seed,
    delayMiles: result.delayMiles,
  };
}

