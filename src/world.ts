import { randomName, randomPlace, generateFactionName, generatePartyName, generateCaravanName, generateDungeonName, FactionFocus } from './naming.ts';
import { Random } from './rng.ts';
import { HexTile, Party, Settlement, Terrain, WorldState, HexCoord, Dungeon, Good, Rumor, NPC, NPCRole, Caravan, Faction, WorldArchetype, Nexus, MercenaryCompany, Army } from './types.ts';
import { stockDungeon } from './stocking.ts';

function uniqueId(prefix: string, counter: number): string {
  return `${prefix}-${counter}`;
}

const TERRAIN_POOL: Terrain[] = ['road', 'clear', 'forest', 'hills', 'mountains', 'swamp', 'desert'];

const ARCHETYPES: WorldArchetype[] = ['Standard', 'Age of War', 'The Great Plague', 'Arcane Bloom', 'Wilderness Unbound', 'Golden Age'];

// Base weights for interior terrain (not coastal)
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

// Get hex neighbors in axial coordinates
function getNeighbors(q: number, r: number, width: number, height: number): HexCoord[] {
  const directions = [
    { q: 1, r: 0 }, { q: -1, r: 0 },
    { q: 0, r: 1 }, { q: 0, r: -1 },
    { q: 1, r: -1 }, { q: -1, r: 1 },
  ];
  return directions
    .map(d => ({ q: q + d.q, r: r + d.r }))
    .filter(c => c.q >= 0 && c.q < width && c.r >= 0 && c.r < height);
}

// Check if terrains are geographically compatible neighbors
function terrainsCompatible(t1: Terrain, t2: Terrain): boolean {
  const incompatible: Record<string, Terrain[]> = {
    'desert': ['swamp', 'ocean', 'river'],
    'swamp': ['desert', 'mountains'],
    'mountains': ['swamp', 'ocean'],
    'ocean': ['mountains', 'desert', 'forest'],
  };
  return !(incompatible[t1]?.includes(t2) || incompatible[t2]?.includes(t1));
}

// Generate coherent hex map with geographic logic
function generateHexMap(rng: Random, width = 6, height = 6, weights: Array<{ terrain: Terrain; weight: number }>): HexTile[] {
  const hexes: HexTile[] = [];
  const hexMap = new Map<string, HexTile>();
  
  // Decide which edge has the ocean (0=west, 1=south, 2=east, 3=north)
  const oceanEdge = rng.int(4);
  
  // Decide if we have a mountain spine and where
  const hasMountainSpine = rng.chance(0.6);
  const mountainSpinePos = hasMountainSpine ? 1 + rng.int(width - 2) : -1; // Interior column/row
  const mountainSpineHorizontal = rng.chance(0.5);
  
  // First pass: assign base terrain with geographic awareness
  for (let q = 0; q < width; q += 1) {
    for (let r = 0; r < height; r += 1) {
      const key = `${q},${r}`;
      let terrain: Terrain;
      
      // Check if this is an ocean edge
      const isOceanEdge = (
        (oceanEdge === 0 && q === 0) ||
        (oceanEdge === 1 && r === height - 1) ||
        (oceanEdge === 2 && q === width - 1) ||
        (oceanEdge === 3 && r === 0)
      );
      
      // Check if adjacent to ocean (coastal)
      const isCoastalEdge = (
        (oceanEdge === 0 && q === 1) ||
        (oceanEdge === 1 && r === height - 2) ||
        (oceanEdge === 2 && q === width - 2) ||
        (oceanEdge === 3 && r === 1)
      );
      
      // Check if on mountain spine
      const onMountainSpine = hasMountainSpine && (
        (mountainSpineHorizontal && r === mountainSpinePos) ||
        (!mountainSpineHorizontal && q === mountainSpinePos)
      );
      
      // Distance from mountain spine
      const distFromSpine = hasMountainSpine 
        ? (mountainSpineHorizontal ? Math.abs(r - mountainSpinePos) : Math.abs(q - mountainSpinePos))
        : 999;
      
      if (isOceanEdge) {
        terrain = 'ocean';
      } else if (isCoastalEdge) {
        terrain = rng.chance(0.8) ? 'coastal' : 'clear';
      } else if (onMountainSpine) {
        terrain = rng.chance(0.7) ? 'mountains' : 'hills';
      } else if (distFromSpine === 1) {
        // Adjacent to mountain spine - likely hills or foothills
        terrain = rng.chance(0.5) ? 'hills' : weightedTerrain(rng, weights);
      } else {
        terrain = weightedTerrain(rng, weights);
      }
      
      const hex: HexTile = { coord: { q, r }, terrain };
      hexes.push(hex);
      hexMap.set(key, hex);
    }
  }
  
  // Second pass: clustering - similar terrain spreads
  const clusteringPasses = 2;
  for (let pass = 0; pass < clusteringPasses; pass++) {
    for (const hex of hexes) {
      // Skip ocean and coastal - those are fixed
      if (hex.terrain === 'ocean' || hex.terrain === 'coastal') continue;
      
      const neighbors = getNeighbors(hex.coord.q, hex.coord.r, width, height);
      const neighborTerrains = neighbors
        .map(c => hexMap.get(`${c.q},${c.r}`)?.terrain)
        .filter((t): t is Terrain => !!t && t !== 'ocean');
      
      if (neighborTerrains.length === 0) continue;
      
      // Count terrain types among neighbors
      const counts: Record<string, number> = {};
      for (const t of neighborTerrains) {
        counts[t] = (counts[t] ?? 0) + 1;
      }
      
      // Find dominant neighbor terrain
      let dominant: Terrain | null = null;
      let maxCount = 0;
      for (const [t, count] of Object.entries(counts)) {
        if (count > maxCount && count >= 2) {
          maxCount = count;
          dominant = t as Terrain;
        }
      }
      
      // Chance to adopt dominant neighbor terrain (clustering)
      if (dominant && rng.chance(0.35) && terrainsCompatible(hex.terrain, dominant)) {
        // Don't cluster into coastal unless we're adjacent to ocean
        if (dominant === 'coastal') {
          const hasOceanNeighbor = neighborTerrains.includes('ocean');
          if (!hasOceanNeighbor) continue;
        }
        hex.terrain = dominant;
      }
    }
  }
  
  // Third pass: fix geographic incompatibilities
  for (const hex of hexes) {
    if (hex.terrain === 'ocean' || hex.terrain === 'coastal') continue;
    
    const neighbors = getNeighbors(hex.coord.q, hex.coord.r, width, height);
    const neighborTerrains = neighbors
      .map(c => hexMap.get(`${c.q},${c.r}`)?.terrain)
      .filter((t): t is Terrain => !!t);
    
    // Check for incompatibilities
    for (const nt of neighborTerrains) {
      if (!terrainsCompatible(hex.terrain, nt)) {
        // Replace with something compatible
        if (hex.terrain === 'swamp' && nt === 'mountains') {
          hex.terrain = 'hills'; // Swamp near mountains becomes foothills
        } else if (hex.terrain === 'desert' && nt === 'swamp') {
          hex.terrain = 'clear'; // Desert near swamp becomes scrubland
        } else if (hex.terrain === 'swamp' && nt === 'desert') {
          hex.terrain = 'clear';
        } else if (hex.terrain === 'mountains' && nt === 'ocean') {
          hex.terrain = 'hills'; // Mountains next to ocean become coastal hills
        } else if (hex.terrain === 'desert' && nt === 'ocean') {
          hex.terrain = 'coastal'; // Desert next to ocean becomes coastal
        } else if (hex.terrain === 'forest' && nt === 'ocean') {
          hex.terrain = 'coastal'; // Forest next to ocean becomes coastal
        }
        break;
      }
    }
  }
  
  // Fourth pass: add rivers (rare, connect mountains to coast)
  if (hasMountainSpine && rng.chance(0.5)) {
    // Find a mountain hex and trace toward coast
    const mountainHexes = hexes.filter(h => h.terrain === 'mountains');
    if (mountainHexes.length > 0) {
      const start = rng.pick(mountainHexes);
      let current = start.coord;
      const riverLength = 3 + rng.int(5); // Longer rivers for larger map
      
      for (let i = 0; i < riverLength; i++) {
        const neighbors = getNeighbors(current.q, current.r, width, height);
        // Move toward ocean edge
        const toward = neighbors.find(c => {
          if (oceanEdge === 0) return c.q < current.q;
          if (oceanEdge === 1) return c.r > current.r;
          if (oceanEdge === 2) return c.q > current.q;
          return c.r < current.r;
        });
        
        if (toward) {
          const targetHex = hexMap.get(`${toward.q},${toward.r}`);
          if (targetHex && targetHex.terrain !== 'ocean' && targetHex.terrain !== 'mountains') {
            // 50% chance to place river, otherwise leave as is (rivers are rare)
            if (rng.chance(0.5)) {
              targetHex.terrain = 'river';
            }
            current = toward;
          } else {
            break;
          }
        } else {
          break;
        }
      }
    }
  }
  
  return hexes;
}

// Check if a hex is coastal (for port placement)
export function isCoastalHex(world: WorldState, coord: HexCoord): boolean {
  const hex = world.hexes.find(h => h.coord.q === coord.q && h.coord.r === coord.r);
  return hex?.terrain === 'coastal';
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
    coastal: 1,
    river: 2,
    desert: 2,
    hills: 3,
    forest: 3,
    swamp: 4,
    mountains: 5,
    ocean: 6, // Can't really traverse ocean on foot
    reef: 6,
  };
  return (rank[t1] ?? 3) >= (rank[t2] ?? 3) ? t1 : t2;
}

export function createInitialWorld(rng: Random, seed: string, start: Date): WorldState {
  const archetype = rng.pick(ARCHETYPES);
  const width = 10;
  const height = 10;
  
  // Tweak terrain weights based on archetype
  const terrainWeights = [...TERRAIN_WEIGHTS];
  if (archetype === 'Wilderness Unbound') {
    terrainWeights.find(t => t.terrain === 'clear')!.weight = 1;
    terrainWeights.find(t => t.terrain === 'forest')!.weight = 6;
    terrainWeights.find(t => t.terrain === 'mountains')!.weight = 4;
  }

  const hexes = generateHexMap(rng, width, height, terrainWeights);

  // Scale settlements to map size (10x10 = 100 hexes)
  // Only place settlements on land (not ocean/reef)
  const landHexes = hexes.filter(h => h.terrain !== 'ocean' && h.terrain !== 'reef');
  const settlementCount = (archetype === 'Golden Age' ? 7 : archetype === 'Wilderness Unbound' ? 3 : 5) + rng.int(3); 
  const settlementHexes = sampleDistinctHexes(rng, landHexes, settlementCount);
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
    dungeons: seedDungeons(rng, settlements, archetype, width, hexes),
    activeRumors: [],
    npcs: seedNPCs(rng, settlements),
    factions,
    caravans: seedCaravans(rng, settlements, factions, roads),
    strongholds: [],
    armies: [],
    landmarks: [],
    ruins: [],
    nexuses: seedNexuses(rng, (archetype === 'Arcane Bloom' ? 8 : 4) + rng.int(4), width),
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

function seedNexuses(rng: Random, count: number, mapSize: number = 10): Nexus[] {
  const powerTypes: Array<'Arcane' | 'Divine' | 'Primal' | 'Shadow'> = ['Arcane', 'Divine', 'Primal', 'Shadow'];
  return Array.from({ length: count }, (_, i) => ({
    id: `nexus-${i}`,
    name: `${rng.pick(['Whispering', 'Eternal', 'Shattered', 'Golden', 'Deep'])} Nexus of ${rng.pick(['Stars', 'Bones', 'Life', 'Void', 'Time'])}`,
    location: { q: rng.int(mapSize), r: rng.int(mapSize) },
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

function getDungeon(world: WorldState, name: string): Dungeon | undefined {
  return world.dungeons.find((d) => d.name === name);
}

// Get location coordinates for any named place (settlement or dungeon)
function getLocationCoord(world: WorldState, name: string): HexCoord | null {
  const settlement = getSettlement(world, name);
  if (settlement) return settlement.coord;
  
  const dungeon = getDungeon(world, name);
  if (dungeon) return dungeon.coord;
  
  return null;
}

export function distanceMiles(world: WorldState, fromName: string, toName: string): number | null {
  const aCoord = getLocationCoord(world, fromName);
  const bCoord = getLocationCoord(world, toName);
  if (!aCoord || !bCoord) return null;
  const hexesApart = hexDistance(aCoord, bCoord);
  return Math.max(6, hexesApart * 6); // 6-mile hexes, minimum 6 miles
}

export function pathTerrain(world: WorldState, fromName: string, toName: string): Terrain {
  const aCoord = getLocationCoord(world, fromName);
  const bCoord = getLocationCoord(world, toName);
  if (!aCoord || !bCoord) return 'clear';

  // Check for roads between settlements
  const a = getSettlement(world, fromName);
  const b = getSettlement(world, toName);
  if (a && b) {
    const hasRoad = world.roads.some(
      ([fromId, toId]) => (fromId === a.id && toId === b.id) || (fromId === b.id && toId === a.id),
    );
    if (hasRoad) return 'road';
  }

  return worstTerrain(hexesAt(world, aCoord)?.terrain ?? 'clear', hexesAt(world, bCoord)?.terrain ?? 'clear');
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

function seedDungeons(rng: Random, settlements: Settlement[], archetype: WorldArchetype, mapSize: number = 10, hexes: HexTile[] = []): Dungeon[] {
  if (!settlements.length) return [];
  
  // Build set of invalid hexes (ocean, reef)
  const invalidHexes = new Set(
    hexes.filter(h => h.terrain === 'ocean' || h.terrain === 'reef')
      .map(h => `${h.coord.q},${h.coord.r}`)
  );
  
  // Create 2-3 dungeons for larger map
  const dungeonCount = 2 + rng.int(2);
  const dungeons: Dungeon[] = [];
  const usedCoords = new Set<string>();
  
  for (let i = 0; i < dungeonCount; i++) {
    const anchor = rng.pick(settlements);
    let coord: HexCoord;
    let attempts = 0;
    
    // Find a unique location near a settlement, not on water
    do {
      coord = { 
        q: Math.max(0, Math.min(mapSize - 1, anchor.coord.q + (rng.int(5) - 2))), 
        r: Math.max(0, Math.min(mapSize - 1, anchor.coord.r + (rng.int(5) - 2))) 
      };
      attempts++;
    } while ((usedCoords.has(`${coord.q},${coord.r}`) || invalidHexes.has(`${coord.q},${coord.r}`)) && attempts < 20);
    
    usedCoords.add(`${coord.q},${coord.r}`);
    
    const dungeon: Dungeon = {
      id: `dungeon-${i}`,
      name: generateDungeonName(rng),
      coord,
      depth: (archetype === 'Standard' ? 3 : 5) + rng.int(3),
      danger: (archetype === 'Wilderness Unbound' ? 4 : 2) + rng.int(3),
    };
    dungeon.rooms = stockDungeon(rng, dungeon);
    dungeon.explored = 0;
    dungeons.push(dungeon);
  }
  
  return dungeons;
}

function seedNPCs(rng: Random, settlements: Settlement[]): NPC[] {
  const roles: NPCRole[] = ['merchant', 'guard', 'scout', 'priest', 'bard', 'laborer'];
  const npcs: NPC[] = [];
  // Scale NPCs to settlement count: ~2-3 notable NPCs per settlement
  const count = Math.max(12, settlements.length * 2) + rng.int(6);
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

function seedCaravans(rng: Random, settlements: Settlement[], factions: Faction[], roads: Array<[string, string]>): Caravan[] {
  if (settlements.length < 2 || roads.length === 0) return [];
  const caravans: Caravan[] = [];
  
  // Caravans only travel along established roads
  const usedRoutes = new Set<string>();
  const count = Math.min(roads.length, 3 + rng.int(3)); // 3-5 caravans, limited by roads
  
  for (let i = 0; i < count; i += 1) {
    // Pick a road that hasn't been used yet
    const availableRoads = roads.filter(([a, b]) => !usedRoutes.has(`${a}-${b}`) && !usedRoutes.has(`${b}-${a}`));
    if (availableRoads.length === 0) break;
    
    const [fromId, toId] = rng.pick(availableRoads);
    usedRoutes.add(`${fromId}-${toId}`);
    
    const from = settlements.find(s => s.id === fromId);
    const to = settlements.find(s => s.id === toId);
    if (!from || !to) continue;
    
    // Assign to a random faction if available
    const sponsorFaction = rng.chance(0.6) && factions.length > 0 ? rng.pick(factions) : undefined;
    caravans.push({
      id: `caravan-${i}`,
      name: generateCaravanName(rng),
      route: [fromId, toId],
      goods: rng.pick([['grain', 'textiles'], ['ore', 'timber'], ['salt', 'fish'], ['livestock']]),
      location: from.name,
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
  const focuses: FactionFocus[] = ['trade', 'martial', 'pious', 'arcane', 'trade', 'martial'];
  const count = 4 + rng.int(3); // 4-6 factions for larger map
  
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
