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
    id: `rumor-${Date.now()}-${rng.int(1e6)}`,
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
    id: `rumor-${Date.now()}-${rng.int(1e6)}`,
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

