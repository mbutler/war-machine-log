import { randomName, randomPlace, generateFactionName, generatePartyName, generateCaravanName, generateDungeonName, FactionFocus } from './naming.ts';
import { Random } from './rng.ts';
import { HexTile, Party, Settlement, Terrain, WorldState, HexCoord, Dungeon, Good, Rumor, NPC, NPCRole, Caravan, Faction, WorldArchetype, Nexus, MercenaryCompany, Army } from './types.ts';
import { stockDungeon } from './stocking.ts';

function uniqueId(prefix: string, counter: number): string {
  return `${prefix}-${counter}`;
}

const TERRAIN_POOL: Terrain[] = ['road', 'clear', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

const ARCHETYPES: WorldArchetype[] = ['Standard', 'Age of War', 'The Great Plague', 'Arcane Bloom', 'Wilderness Unbound', 'Golden Age'];

const TERRAIN_WEIGHTS: Array<{ terrain: Terrain; weight: number }> = [
  { terrain: 'clear', weight: 4 },
  { terrain: 'forest', weight: 3 },
  { terrain: 'hills', weight: 3 },
  { terrain: 'mountains', weight: 2 },
  { terrain: 'swamp', weight: 2 },
  { terrain: 'desert', weight: 1 },
];

function weightedTerrain(rng: Random, weights: Array<{ terrain: Terrain; weight: number }>): Terrain {
  const total = weights.reduce((acc, t) => acc + t.weight, 0);
  let roll = rng.int(total);
  for (const entry of weights) {
    roll -= entry.weight;
    if (roll < 0) return entry.terrain;
  }
  return 'clear';
}

function generateHexMap(rng: Random, width = 6, height = 6, weights: Array<{ terrain: Terrain; weight: number }>): HexTile[] {
  const hexes: HexTile[] = [];
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      hexes.push({
        coord: { q, r },
        terrain: weightedTerrain(rng, weights),
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
  const archetype = rng.pick(ARCHETYPES);
  const width = 6;
  const height = 6;
  
  // Tweak terrain weights based on archetype
  const terrainWeights = [...TERRAIN_WEIGHTS];
  if (archetype === 'Wilderness Unbound') {
    terrainWeights.find(t => t.terrain === 'clear')!.weight = 1;
    terrainWeights.find(t => t.terrain === 'forest')!.weight = 6;
    terrainWeights.find(t => t.terrain === 'mountains')!.weight = 4;
  }

  const hexes = generateHexMap(rng, width, height, terrainWeights);

  const settlementCount = (archetype === 'Golden Age' ? 5 : archetype === 'Wilderness Unbound' ? 2 : 3) + rng.int(2); 
  const settlementHexes = sampleDistinctHexes(rng, hexes, settlementCount);
  const goods: Good[] = ['grain', 'timber', 'ore', 'textiles', 'salt', 'fish', 'livestock'];
  const settlements: Settlement[] = settlementHexes.map((hex, i) => {
    const supply: Record<Good, number> = Object.fromEntries(
      goods.map((g) => [g, rng.int(5) - 2]), // -2..2
    ) as Record<Good, number>;
    
    // Archetype tweaks
    if (archetype === 'Golden Age') supply.grain += 2;
    if (archetype === 'The Great Plague') supply.livestock -= 2;

    const priceTrends = Object.fromEntries(goods.map((g) => [g, 'normal'])) as Record<Good, 'low' | 'normal' | 'high'>;
    return {
      id: uniqueId('settlement', i),
      name: randomPlace(rng),
      population: (archetype === 'Golden Age' ? 1000 : 200) + rng.int(1800),
      type: i === 0 ? 'town' : rng.chance(0.3) ? 'town' : 'village',
      coord: hex.coord,
      supply,
      mood: archetype === 'Golden Age' ? 2 : archetype === 'Age of War' ? -2 : rng.int(5) - 2,
      priceTrends,
    };
  });

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
      name: generatePartyName(rng),
      members: [
        { name: randomName(rng), class: 'Fighter', level: 1 + rng.int(3), hp: 20, maxHp: 20 },
        { name: randomName(rng), class: 'Cleric', level: 1 + rng.int(3), hp: 15, maxHp: 15 },
        { name: randomName(rng), class: 'Magic-User', level: 1 + rng.int(3), hp: 10, maxHp: 10 },
      ],
      location: settlements[0]?.name ?? settlements[settlements.length - 1]?.name ?? randomPlace(rng),
      status: 'idle',
      xp: 0,
    },
    {
      id: 'band-0',
      name: generatePartyName(rng),
      members: [
        { name: randomName(rng), class: 'Thief', level: 1 + rng.int(2), hp: 12, maxHp: 12 },
        { name: randomName(rng), class: 'Elf', level: 1 + rng.int(2), hp: 14, maxHp: 14 },
      ],
      location: settlements[settlements.length - 1]?.name ?? settlements[0]?.name ?? randomPlace(rng),
      status: 'idle',
      xp: 0,
    },
  ];

  const factions = seedFactions(rng, archetype);
  
  return {
    seed,
    archetype,
    hexes,
    width,
    height,
    settlements,
    parties,
    roads,
    dungeons: seedDungeons(rng, settlements, archetype),
    activeRumors: [],
    npcs: seedNPCs(rng, settlements),
    factions,
    caravans: seedCaravans(rng, settlements, factions),
    strongholds: [],
    armies: [],
    landmarks: [],
    ruins: [],
    nexuses: seedNexuses(rng, (archetype === 'Arcane Bloom' ? 6 : 3) + rng.int(3)),
    mercenaries: seedMercenaries(rng, settlements),
    startedAt: start,
  };
}

function seedMercenaries(rng: Random, settlements: Settlement[]): MercenaryCompany[] {
  const companyNames = ['The Iron Brotherhood', 'Silver Shields', 'The Golden Lions', 'Black Boars', 'Red Ravagers', 'The Free Company'];
  return companyNames.map((name, i) => {
    const settlement = rng.pick(settlements);
    return {
      id: `merc-${i}`,
      name,
      captainId: `npc-merc-captain-${i}`, // Ideally would link to a real NPC
      location: settlement.name,
      size: 50 + rng.int(150),
      quality: 2 + rng.int(5),
      monthlyRate: 100 + rng.int(400),
      loyalty: 7 + rng.int(3),
    };
  });
}

function seedNexuses(rng: Random, count: number): Nexus[] {
  const powerTypes: Array<'Arcane' | 'Divine' | 'Primal' | 'Shadow'> = ['Arcane', 'Divine', 'Primal', 'Shadow'];
  return Array.from({ length: count }, (_, i) => ({
    id: `nexus-${i}`,
    name: `${rng.pick(['Whispering', 'Eternal', 'Shattered', 'Golden', 'Deep'])} Nexus of ${rng.pick(['Stars', 'Bones', 'Life', 'Void', 'Time'])}`,
    location: { q: rng.int(6), r: rng.int(6) },
    powerType: rng.pick(powerTypes),
    intensity: 5 + rng.int(5),
  }));
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

export function settlementById(world: WorldState, id: string) {
  return world.settlements.find((s) => s.id === id);
}

export function updateFactionWealth(world: WorldState, factionId: string, delta: number) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f) return;
  f.wealth = Math.max(0, f.wealth + delta);
}

export function updateFactionAttitude(world: WorldState, factionId: string, targetSettlement: string, delta: number) {
  const f = world.factions.find((x) => x.id === factionId);
  if (!f) return;
  if (!f.attitude[targetSettlement]) f.attitude[targetSettlement] = 0;
  f.attitude[targetSettlement] = Math.max(-3, Math.min(3, f.attitude[targetSettlement] + delta));
}

function seedDungeons(rng: Random, settlements: Settlement[], archetype: WorldArchetype): Dungeon[] {
  if (!settlements.length) return [];
  const anchor = rng.pick(settlements);
  const offset: HexCoord = { q: Math.max(0, anchor.coord.q + (rng.int(3) - 1)), r: Math.max(0, anchor.coord.r + (rng.int(3) - 1)) };
  const dungeon: Dungeon = {
    id: 'dungeon-0',
    name: generateDungeonName(rng),
    coord: offset,
    depth: (archetype === 'Standard' ? 3 : 5) + rng.int(3),
    danger: (archetype === 'Wilderness Unbound' ? 4 : 2) + rng.int(3),
  };
  dungeon.rooms = stockDungeon(rng, dungeon);
  dungeon.explored = 0;
  return [dungeon];
}

function seedNPCs(rng: Random, settlements: Settlement[]): NPC[] {
  const roles: NPCRole[] = ['merchant', 'guard', 'scout', 'priest', 'bard', 'laborer'];
  const npcs: NPC[] = [];
  const count = 8 + rng.int(6); // 8-13 notable NPCs for richer simulation
  for (let i = 0; i < count; i += 1) {
    const home = rng.pick(settlements);
    npcs.push({
      id: `npc-${i}`,
      name: randomName(rng),
      role: rng.pick(roles),
      home: home.id,
      location: home.name,
      reputation: rng.int(7) - 3,
      fame: 0,
      alive: true,
    });
  }
  return npcs;
}

function seedCaravans(rng: Random, settlements: Settlement[], factions: Faction[]): Caravan[] {
  if (settlements.length < 2) return [];
  const caravans: Caravan[] = [];
  const count = 2 + rng.int(2); // 2-3 caravans
  for (let i = 0; i < count; i += 1) {
    const a = rng.pick(settlements);
    let b = rng.pick(settlements);
    if (b.id === a.id) {
      b = settlements[(settlements.indexOf(a) + 1) % settlements.length];
    }
    // Assign to a random faction if available
    const sponsorFaction = rng.chance(0.6) && factions.length > 0 ? rng.pick(factions) : undefined;
    caravans.push({
      id: `caravan-${i}`,
      name: generateCaravanName(rng),
      route: [a.id, b.id],
      goods: rng.pick([['grain', 'textiles'], ['ore', 'timber'], ['salt', 'fish'], ['livestock']]),
      location: a.name,
      progressHours: 0,
      direction: 'outbound',
      escorts: [],
      factionId: sponsorFaction?.id,
      merchantId: undefined,
    });
  }
  return caravans;
}

function seedFactions(rng: Random, archetype: WorldArchetype): Faction[] {
  const focuses: FactionFocus[] = ['trade', 'martial', 'pious', 'trade'];
  const count = 3 + rng.int(2); // 3-4 factions
  
  return Array.from({ length: count }, (_, i) => {
    let focus = focuses[i % focuses.length];
    
    // Archetype tweaks
    if (archetype === 'Age of War' && rng.chance(0.5)) focus = 'martial';
    if (archetype === 'Arcane Bloom' && i === 0) focus = 'arcane';

    return {
      id: `faction-${i}`,
      name: generateFactionName(rng, focus),
      attitude: {},
      wealth: (archetype === 'Golden Age' ? 200 : 50) + rng.int(100),
      focus,
    };
  });
}
