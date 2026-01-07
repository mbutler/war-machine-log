import { Random } from './rng.ts';
import { Rumor, WorldState } from './types.ts';
import { randomName, randomPlace } from './naming.ts';

const THEMES = ['treasure', 'missing', 'omen', 'threat', 'plot', 'mystery'] as const;
const TONES = ['whispered', 'urgent', 'conflicting', 'cryptic', 'official', 'boastful'] as const;
const HOOKS = [
  'an old map fragment',
  'a wounded messenger',
  'a frantic merchant',
  'a border scout',
  'a drunken soldier',
  'a frightened child',
  'a wandering priest',
  'a caravan guard',
  'a bard fresh from the road',
] as const;

function pickTarget(world: WorldState, rng: Random): { target: string; kind: Rumor['kind'] } {
  if (world.dungeons.length && rng.chance(0.4)) {
    return { target: rng.pick(world.dungeons).name, kind: 'dungeon' };
  }
  if (rng.chance(0.3)) {
    return { target: rng.pick(world.settlements).name, kind: 'caravan' };
  }
  if (rng.chance(0.2)) {
    return { target: randomPlace(rng), kind: 'monster-sign' };
  }
  return { target: rng.pick(world.settlements).name, kind: 'feud' };
}

function makeText(world: WorldState, rng: Random, origin: string, target: string): string {
  const theme = rng.pick(THEMES);
  const tone = rng.pick(TONES);
  const hook = rng.pick(HOOKS);
  const person = randomName(rng);
  const dungeon = world.dungeons.find((d) => d.name === target);
  const detailPool = [
    `strange lights near ${target}`,
    `missing heirlooms traced toward ${target}`,
    `bandits offering odd coins`,
    `beasts refusing to cross the old road`,
    `a sealed door that hums at night`,
    `villagers hearing chanting at dusk`,
    `fresh graves disturbed`,
    `a caravan late by two days`,
    `guards buying lamp oil in bulk`,
  ];
  if (dungeon) {
    detailPool.push(
      `whispers of depth ${dungeon.depth} halls`,
      `signs of danger tier ${dungeon.danger}`,
      `old map showing ${dungeon.depth} levels and barred doors`,
    );
  }
  const detail = rng.pick(detailPool);
  return `${tone} ${theme}: ${hook} says ${person} heard of ${detail} (from ${origin}).`;
}

export function spawnRumor(world: WorldState, rng: Random, origin: string): Rumor {
  const { target, kind } = pickTarget(world, rng);
  return {
    id: rng.uid('rumor'),
    kind,
    text: makeText(world, rng, origin, target),
    target,
    origin,
    freshness: 5 + rng.int(4), // 5-8 days
  };
}

export function decayRumors(world: WorldState): void {
  world.activeRumors = world.activeRumors
    .map((r) => ({ ...r, freshness: r.freshness - 1 }))
    .filter((r) => r.freshness > 0);
}

export function createRumor(
  world: WorldState,
  rng: Random,
  origin: string,
  target: string,
  kind: Rumor['kind'],
  text: string,
  freshness = 5 + rng.int(4),
): Rumor {
  return {
    id: rng.uid('rumor'),
    kind,
    text,
    target,
    origin,
    freshness,
  };
}

export function logRumor(rumor: Rumor, worldTime: Date, seed: string): import('./types.ts').LogEntry {
  return {
    category: 'town',
    summary: `Rumor in ${rumor.origin}`,
    details: rumor.text,
    location: rumor.origin,
    worldTime,
    realTime: new Date(),
    seed,
  };
}

// ============================================================================
// TREASURE RUMORS - Rare items attract attention
// ============================================================================

const TREASURE_RUMOR_SOURCES = [
  'a loose-tongued innkeeper',
  'a boastful adventurer',
  'a merchant counting coins',
  'a wounded survivor',
  'a jealous rival',
  'a temple acolyte',
  'a fence with nervous eyes',
  'a bard embellishing tales',
  'a spy in the shadows',
  'a drunk celebrating too loudly',
];

const TREASURE_RUMOR_REACTIONS = [
  'Collectors take note.',
  'Thieves sharpen their knives.',
  'Rivals grow envious.',
  'Old enemies remember.',
  'Dragons stir in their lairs.',
  'Dark forces take interest.',
  'Noble houses dispatch agents.',
  'The greedy make plans.',
  'Fortune-seekers gather.',
  'The underworld whispers.',
];

export type TreasureRumorType = 
  | 'legendary-item'      // A legendary magic item was found
  | 'rare-item'           // A rare magic item was found
  | 'massive-hoard'       // A huge treasure hoard discovered
  | 'ongoing-extraction'  // Party slowly removing a hoard
  | 'unguarded-treasure'  // Abandoned extraction or discovered location
  | 'magic-weapon'        // Powerful weapon found
  | 'artifact';           // True artifact discovered

export interface TreasureRumor extends Rumor {
  treasureType: TreasureRumorType;
  itemId?: string;        // Magic item ID if applicable
  itemName?: string;
  estimatedValue?: number;
  discoveredBy?: string;
  attractsTypes: string[]; // What types of entities this attracts
}

export function createTreasureRumor(
  rng: Random,
  world: WorldState,
  type: TreasureRumorType,
  itemName: string | undefined,
  location: string,
  discoveredBy: string,
  estimatedValue: number,
  itemId?: string,
): TreasureRumor {
  const source = rng.pick(TREASURE_RUMOR_SOURCES);
  const reaction = rng.pick(TREASURE_RUMOR_REACTIONS);
  
  // Determine what this attracts based on type
  let attractsTypes: string[] = [];
  let text: string;
  
  switch (type) {
    case 'legendary-item':
      attractsTypes = ['thieves-guild', 'rival-party', 'collector', 'dragon', 'antagonist', 'faction'];
      text = `whispered treasure: ${source} tells of ${discoveredBy} finding ${itemName ?? 'a legendary artifact'}. ${reaction}`;
      break;
    case 'artifact':
      attractsTypes = ['antagonist', 'faction', 'dragon', 'collector', 'dark-cult'];
      text = `urgent treasure: ${source} speaks of ${discoveredBy} possessing ${itemName ?? 'an artifact of immense power'}. ${reaction}`;
      break;
    case 'rare-item':
      attractsTypes = ['thieves-guild', 'rival-party', 'collector'];
      text = `boastful treasure: ${source} mentions ${discoveredBy} carrying ${itemName ?? 'a rare magic item'}. ${reaction}`;
      break;
    case 'magic-weapon':
      attractsTypes = ['rival-party', 'faction', 'warlord'];
      text = `conflicting treasure: ${source} describes ${itemName ?? 'a powerful enchanted weapon'} now wielded by ${discoveredBy}. ${reaction}`;
      break;
    case 'massive-hoard':
      attractsTypes = ['thieves-guild', 'rival-party', 'dragon', 'faction', 'bandit'];
      text = `urgent treasure: ${source} whispers of ${discoveredBy} discovering a hoard worth ${estimatedValue.toLocaleString()} gold. ${reaction}`;
      break;
    case 'ongoing-extraction':
      attractsTypes = ['thieves-guild', 'rival-party', 'bandit', 'monster'];
      text = `cryptic treasure: ${source} notes ${discoveredBy} making repeated trips to ${location}, laden with gold each time. ${reaction}`;
      break;
    case 'unguarded-treasure':
      attractsTypes = ['rival-party', 'monster', 'bandit', 'faction'];
      text = `whispered treasure: ${source} claims a fortune lies abandoned in ${location}, left behind by ${discoveredBy}. ${reaction}`;
      break;
  }
  
  // Find nearest settlement for origin
  const settlements = world.settlements.filter(s => s.name !== location);
  const origin = settlements.length > 0 ? rng.pick(settlements).name : location;
  
  // Freshness based on type - legendary rumors last longer
  const freshness = type === 'legendary-item' || type === 'artifact' 
    ? 14 + rng.int(14)  // 2-4 weeks
    : type === 'massive-hoard'
    ? 10 + rng.int(10)  // 10-20 days
    : 5 + rng.int(7);   // 5-12 days
  
  return {
    id: rng.uid('treasure-rumor'),
    kind: 'mystery',
    text,
    target: location,
    origin,
    freshness,
    treasureType: type,
    itemId,
    itemName,
    estimatedValue,
    discoveredBy,
    attractsTypes,
  };
}

// Spread treasure rumor to multiple settlements
export function spreadTreasureRumor(
  rng: Random,
  world: WorldState,
  baseRumor: TreasureRumor,
): TreasureRumor[] {
  const rumors: TreasureRumor[] = [baseRumor];
  
  // Legendary items spread to many settlements
  const spreadCount = 
    baseRumor.treasureType === 'legendary-item' || baseRumor.treasureType === 'artifact' ? 2 + rng.int(3) :
    baseRumor.treasureType === 'massive-hoard' ? 1 + rng.int(2) :
    rng.chance(0.5) ? 1 : 0;
  
  const otherSettlements = world.settlements.filter(s => s.name !== baseRumor.origin);
  
  for (let i = 0; i < Math.min(spreadCount, otherSettlements.length); i++) {
    const settlement = otherSettlements[i];
    const variant = { ...baseRumor };
    variant.id = rng.uid('treasure-rumor');
    variant.origin = settlement.name;
    variant.freshness = baseRumor.freshness - 1 - rng.int(3); // Slightly stale
    
    // Rumors get distorted as they spread
    if (rng.chance(0.3)) {
      variant.estimatedValue = Math.floor((variant.estimatedValue ?? 0) * (1.2 + rng.next())); // Exaggerated!
      variant.text = variant.text.replace('whispered', 'exaggerated');
    }
    
    if (variant.freshness > 0) {
      rumors.push(variant);
    }
  }
  
  return rumors;
}

