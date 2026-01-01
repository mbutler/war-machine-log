import { randomName, randomPlace } from './naming.ts';
import { Random } from './rng.ts';
import { HexTile, Party, Settlement, Terrain, WorldState, HexCoord } from './types.ts';

function uniqueId(prefix: string, counter: number): string {
  return `${prefix}-${counter}`;
}

const TERRAIN_POOL: Terrain[] = ['road', 'clear', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

const TERRAIN_WEIGHTS: Array<{ terrain: Terrain; weight: number }> = [
  { terrain: 'clear', weight: 4 },
  { terrain: 'forest', weight: 3 },
  { terrain: 'hills', weight: 3 },
  { terrain: 'mountains', weight: 2 },
  { terrain: 'swamp', weight: 2 },
  { terrain: 'desert', weight: 1 },
];

function weightedTerrain(rng: Random): Terrain {
  const total = TERRAIN_WEIGHTS.reduce((acc, t) => acc + t.weight, 0);
  let roll = rng.int(total);
  for (const entry of TERRAIN_WEIGHTS) {
    roll -= entry.weight;
    if (roll < 0) return entry.terrain;
  }
  return 'clear';
}

function generateHexMap(rng: Random, width = 6, height = 6): HexTile[] {
  const hexes: HexTile[] = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      hexes.push({
        coord: { q, r },
        terrain: weightedTerrain(rng),
      });
    }
  }
  return hexes;
}

function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

function sampleDistinctHexes(rng: Random, hexes: HexTile[], count: number): HexTile[] {
  const pool = [...hexes];
  const chosen: HexTile[] = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    const idx = rng.int(pool.length);
    chosen.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return chosen;
}

function hexDistance(a: HexCoord, b: HexCoord): number {
  // axial coordinates distance
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function worstTerrain(t1: Terrain, t2: Terrain): Terrain {
  const rank: Record<Terrain, number> = {
    road: 0,
    clear: 1,
    desert: 2,
    hills: 3,
    forest: 3,
    swamp: 4,
    mountains: 5,
  };
  return rank[t1] >= rank[t2] ? t1 : t2;
}

export function createInitialWorld(rng: Random, seed: string, start: Date): WorldState {
  const width = 6;
  const height = 6;
  const hexes = generateHexMap(rng, width, height);

  const settlementCount = 3 + rng.int(2); // 3-4 settlements
  const settlementHexes = sampleDistinctHexes(rng, hexes, settlementCount);
  const settlements: Settlement[] = settlementHexes.map((hex, i) => ({
    id: uniqueId('settlement', i),
    name: randomPlace(rng),
    population: 200 + rng.int(1800),
    type: i === 0 ? 'town' : rng.chance(0.3) ? 'town' : 'village',
    coord: hex.coord,
  }));

  const roads: Array<[string, string]> = [];
  if (settlements.length > 1) {
    // Connect all to the first settlement.
    for (let i = 1; i < settlements.length; i += 1) {
      roads.push([settlements[0].id, settlements[i].id]);
    }
    // Add one extra random road if possible.
    if (settlements.length > 2) {
      const a = rng.pick(settlements);
      let b = rng.pick(settlements);
      if (b.id === a.id) {
        b = settlements[(settlements.indexOf(a) + 1) % settlements.length];
      }
      roads.push([a.id, b.id]);
    }
  }

  const parties: Party[] = [
    {
      id: 'party-0',
      name: `${randomName(rng)}'s Company`,
      members: [randomName(rng), randomName(rng), randomName(rng)],
      location: settlements[0]?.name ?? settlements[settlements.length - 1]?.name ?? randomPlace(rng),
      status: 'idle',
    },
    {
      id: 'band-0',
      name: `${randomName(rng)}'s Band`,
      members: [randomName(rng), randomName(rng)],
      location: settlements[settlements.length - 1]?.name ?? settlements[0]?.name ?? randomPlace(rng),
      status: 'idle',
    },
  ];

  return {
    seed,
    hexes,
    width,
    height,
    settlements,
    parties,
    roads,
    startedAt: start,
  };
}

export function randomTerrain(rng: Random): Terrain {
  return rng.pick(TERRAIN_POOL);
}

function getSettlement(world: WorldState, name: string): Settlement | undefined {
  return world.settlements.find((s) => s.name === name);
}

export function distanceMiles(world: WorldState, fromName: string, toName: string): number | null {
  const a = getSettlement(world, fromName);
  const b = getSettlement(world, toName);
  if (!a || !b) return null;
  const hexesApart = hexDistance(a.coord, b.coord);
  return hexesApart * 6; // 6-mile hexes
}

export function pathTerrain(world: WorldState, fromName: string, toName: string): Terrain {
  const a = getSettlement(world, fromName);
  const b = getSettlement(world, toName);
  if (!a || !b) return 'clear';

  const hasRoad = world.roads.some(
    ([fromId, toId]) => (fromId === a.id && toId === b.id) || (fromId === b.id && toId === a.id),
  );
  if (hasRoad) return 'road';

  return worstTerrain(hexesAt(world, a.coord)?.terrain ?? 'clear', hexesAt(world, b.coord)?.terrain ?? 'clear');
}

function hexesAt(world: WorldState, coord: HexCoord): HexTile | undefined {
  return world.hexes.find((h) => h.coord.q === coord.q && h.coord.r === coord.r);
}

