/**
 * NAVAL SYSTEM - BECMI-Inspired Maritime Content
 * 
 * A "naval lite" system that adds maritime flavor without full ship tracking:
 * - Port towns that receive exotic goods by sea
 * - Ships making voyages (abstracted travel)
 * - Pirates and sea raiders
 * - Sea monsters in coastal/ocean hexes
 * - Maritime weather events
 * - Shipwrecks and salvage
 * 
 * Based on BECMI Expert/Companion naval rules as loose guidelines.
 * All events happen in 1:1 real time.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, HexCoord, Good } from './types.ts';
import { WeatherCondition, Season } from './calendar.ts';

// ============================================================================
// TYPES
// ============================================================================

export type ShipType = 
  | 'fishing-boat'    // Small, coastal only
  | 'merchant-cog'    // Medium cargo vessel
  | 'longship'        // Fast raiding vessel
  | 'galley'          // Large warship
  | 'carrack'         // Large cargo vessel
  | 'warship';        // Military vessel

export type ShipStatus = 
  | 'docked'          // In port
  | 'at-sea'          // Sailing
  | 'damaged'         // Needs repair
  | 'shipwrecked'     // Lost at sea
  | 'becalmed';       // No wind

export interface Ship {
  id: string;
  name: string;
  type: ShipType;
  ownerId: string;         // Faction, NPC, or Party
  ownerName: string;
  status: ShipStatus;
  homePort: string;        // Settlement name
  currentLocation: string; // Settlement name or "at-sea"
  destination?: string;    // If traveling
  departedAt?: Date;       // When voyage started
  arrivesAt?: Date;        // When voyage completes
  cargo: Partial<Record<Good, number>>;
  crew: number;
  marines: number;         // Fighting men aboard
  condition: number;       // 0-100, health of the ship
}

export interface SeaRoute {
  id: string;
  from: string;            // Port name
  to: string;              // Port name
  distanceDays: number;    // Voyage time in fair weather
  dangerLevel: number;     // 1-5
  primaryGoods: Good[];    // What typically travels this route
}

export interface PirateFleet {
  id: string;
  name: string;
  captain: string;
  ships: number;
  crew: number;
  basedAt: string;         // Hidden cove or island
  territory: string[];     // Sea routes they prey upon
  notoriety: number;       // 0-100
  lastRaid?: Date;
  bounty: number;          // Price on their head
}

// Distant lands and figures - procedurally generated, tracked entities
export interface DistantLand {
  id: string;
  name: string;
  epithet: string;         // "of the Burning Sands", "across the Jade Sea"
  culture: 'eastern' | 'southern' | 'northern' | 'western' | 'island' | 'desert' | 'jungle';
  knownFor: string[];      // What they're famous for
  rulerTitle: string;      // "Emperor", "Sultan", "High King"
  lastMentioned?: Date;
  mentionCount: number;
}

export interface DistantFigure {
  id: string;
  name: string;
  title: string;           // "the Jade Emperor", "Storm Caliph"
  landId: string;          // Which distant land they're from
  role: 'ruler' | 'warlord' | 'merchant-prince' | 'prophet' | 'archmage' | 'pirate-lord' | 'beast-master';
  reputation: string;      // Brief descriptor
  alive: boolean;
  lastMentioned?: Date;
  mentionCount: number;
}

export interface NavalState {
  ships: Ship[];
  seaRoutes: SeaRoute[];
  pirates: PirateFleet[];
  recentShipwrecks: Array<{
    shipName: string;
    location: string;
    date: Date;
    cargo: Partial<Record<Good, number>>;
    salvaged: boolean;
  }>;
  portActivity: Record<string, {
    shipsInPort: number;
    lastArrival?: Date;
    lastDeparture?: Date;
    exoticGoodsAvailable: Good[];
  }>;
  // Emergent distant world
  distantLands: DistantLand[];
  distantFigures: DistantFigure[];
}

// ============================================================================
// SHIP CONFIGURATION - BECMI-inspired
// ============================================================================

const SHIP_CONFIG: Record<ShipType, {
  crew: number;
  cargo: number;      // Cargo capacity in "units"
  speed: number;      // Miles per day in good weather
  seaworthiness: number; // Storm survival modifier
  cost: number;       // Gold to purchase
  marines: number;    // Max fighting crew
}> = {
  'fishing-boat': { crew: 4, cargo: 2, speed: 24, seaworthiness: 0.3, cost: 100, marines: 0 },
  'merchant-cog': { crew: 12, cargo: 20, speed: 48, seaworthiness: 0.6, cost: 2000, marines: 5 },
  'longship': { crew: 60, cargo: 10, speed: 90, seaworthiness: 0.5, cost: 3000, marines: 40 },
  'galley': { crew: 150, cargo: 30, speed: 72, seaworthiness: 0.4, cost: 10000, marines: 75 },
  'carrack': { crew: 30, cargo: 50, speed: 60, seaworthiness: 0.8, cost: 8000, marines: 20 },
  'warship': { crew: 100, cargo: 15, speed: 72, seaworthiness: 0.7, cost: 15000, marines: 60 },
};

// Exotic goods that primarily come by sea
const EXOTIC_GOODS: Good[] = ['spices', 'silk', 'gems', 'ivory', 'wine', 'dyes'];

// Sea monster types for ecology integration
export const SEA_MONSTERS = [
  'sea-serpent',
  'giant-octopus', 
  'dragon-turtle',
  'kraken',
  'merfolk',
  'sahuagin',
  'sea-hag',
  'water-elemental',
  'laceddon',       // Aquatic ghoul
  'nixie',
  'sea-giant',
  'giant-crab',
  'giant-shark',
  'whale',
  'morkoth',
] as const;

export type SeaMonster = typeof SEA_MONSTERS[number];

// ============================================================================
// INITIALIZATION
// ============================================================================

export function seedNavalState(
  world: WorldState,
  rng: Random,
): NavalState {
  const state: NavalState = {
    ships: [],
    seaRoutes: [],
    pirates: [],
    recentShipwrecks: [],
    portActivity: {},
    distantLands: [],
    distantFigures: [],
  };
  
  // Identify port towns (coastal settlements)
  const ports = world.settlements.filter(s => s.isPort);
  
  // Create sea routes between ports
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const from = ports[i];
      const to = ports[j];
      
      // Calculate approximate distance based on hex coords
      const dx = Math.abs(from.coord.q - to.coord.q);
      const dy = Math.abs(from.coord.r - to.coord.r);
      const hexDistance = Math.max(dx, dy, Math.abs(dx - dy));
      
      // Sea travel: roughly 48 miles per day in good weather
      // Each hex is ~6 miles, so days = hexes * 6 / 48 = hexes / 8
      const distanceDays = Math.max(1, Math.ceil(hexDistance / 4));
      
      state.seaRoutes.push({
        id: `route-${from.id}-${to.id}`,
        from: from.name,
        to: to.name,
        distanceDays,
        dangerLevel: 1 + rng.int(4),
        primaryGoods: rng.shuffle([...EXOTIC_GOODS]).slice(0, 2 + rng.int(3)),
      });
    }
  }
  
  // Seed initial ships at ports
  for (const port of ports) {
    const shipCount = port.portSize === 'great' ? 3 + rng.int(5) : 
                      port.portSize === 'major' ? 2 + rng.int(3) : 
                      1 + rng.int(2);
    
    for (let i = 0; i < shipCount; i++) {
      const shipType = rng.pick(['fishing-boat', 'merchant-cog', 'carrack'] as ShipType[]);
      const config = SHIP_CONFIG[shipType];
      
      state.ships.push({
        id: `ship-${port.id}-${i}`,
        name: generateShipName(rng),
        type: shipType,
        ownerId: port.id,
        ownerName: `Merchants of ${port.name}`,
        status: 'docked',
        homePort: port.name,
        currentLocation: port.name,
        cargo: {},
        crew: config.crew,
        marines: Math.floor(config.marines * 0.5),
        condition: 80 + rng.int(20),
      });
    }
    
    // Initialize port activity
    state.portActivity[port.name] = {
      shipsInPort: shipCount,
      exoticGoodsAvailable: rng.shuffle([...EXOTIC_GOODS]).slice(0, 1 + rng.int(3)),
    };
  }
  
  // Seed pirate fleets
  if (ports.length >= 2 && rng.chance(0.7)) {
    const pirateCount = 1 + rng.int(2);
    for (let i = 0; i < pirateCount; i++) {
      state.pirates.push({
        id: `pirates-${i}`,
        name: generatePirateName(rng),
        captain: generatePirateCaptainName(rng),
        ships: 1 + rng.int(3),
        crew: 30 + rng.int(70),
        basedAt: 'Unknown Cove',
        territory: state.seaRoutes.slice(0, 1 + rng.int(state.seaRoutes.length)).map(r => r.id),
        notoriety: 20 + rng.int(60),
        bounty: 100 + rng.int(900),
      });
    }
  }
  
  return state;
}

// ============================================================================
// SHIP NAME GENERATION
// ============================================================================

function generateShipName(rng: Random): string {
  const adjectives = [
    'Swift', 'Gallant', 'Golden', 'Silver', 'Crimson', 'Azure', 'Iron',
    'Proud', 'Lucky', 'Bold', 'Faithful', 'Northern', 'Southern', 'Royal',
    'Ancient', 'Blessed', 'Storm', 'Sea', 'Wind', 'Star',
  ];
  
  const nouns = [
    'Maiden', 'Lady', 'Queen', 'Spirit', 'Dragon', 'Serpent', 'Lion',
    'Eagle', 'Rose', 'Star', 'Wave', 'Tide', 'Wind', 'Merchant', 'Voyager',
    'Fortune', 'Destiny', 'Dawn', 'Dusk', 'Horizon', 'Wanderer',
  ];
  
  return `The ${rng.pick(adjectives)} ${rng.pick(nouns)}`;
}

function generatePirateName(rng: Random): string {
  const adjectives = [
    'Black', 'Red', 'Crimson', 'Dread', 'Shadow', 'Storm', 'Blood',
    'Skull', 'Death', 'Iron', 'Ghost', 'Howling', 'Raging',
  ];
  
  const nouns = [
    'Brotherhood', 'Corsairs', 'Raiders', 'Reavers', 'Wolves', 'Serpents',
    'Tide', 'Fleet', 'Scourge', 'Terror', 'Plague', 'Hunters',
  ];
  
  return `The ${rng.pick(adjectives)} ${rng.pick(nouns)}`;
}

function generatePirateCaptainName(rng: Random): string {
  const titles = [
    'Captain', 'Admiral', 'Dread Captain', 'Black', 'Red', 'One-Eyed',
    'Bloody', 'Iron', 'Storm', 'Mad',
  ];
  
  const names = [
    'Morgan', 'Blackbeard', 'Redhand', 'Silverfin', 'Darkwater', 'Stormborn',
    'Daggertooth', 'Ironhook', 'Saltblood', 'Wavecrest', 'Deepscar',
    'Krakensbane', 'Tidewraith', 'Vortex', 'Maelstrom',
  ];
  
  return `${rng.pick(titles)} ${rng.pick(names)}`;
}

// ============================================================================
// PROCEDURAL DISTANT LANDS & FIGURES
// ============================================================================

// Name generation parts for distant lands
const LAND_PREFIXES = [
  'Jade', 'Sapphire', 'Golden', 'Silver', 'Obsidian', 'Crystal', 'Amber',
  'Crimson', 'Azure', 'Ivory', 'Ebony', 'Pearl', 'Coral', 'Opal', 'Onyx',
  'Scarlet', 'Verdant', 'Twilight', 'Dawn', 'Dusk', 'Storm', 'Sun', 'Moon',
];

const LAND_SUFFIXES: Record<DistantLand['culture'], string[]> = {
  eastern: ['Empire', 'Dynasty', 'Dominion', 'Celestial Realm', 'Kingdom of Ten Thousand'],
  southern: ['Kingdoms', 'Confederacy', 'Tribal Lands', 'Coast', 'Shore'],
  northern: ['Reaches', 'Tundra', 'Wastes', 'Fjords', 'Holdfast'],
  western: ['Republic', 'Principalities', 'Duchies', 'Marches', 'Frontier'],
  island: ['Isles', 'Archipelago', 'Atoll', 'Chain', 'Sea Kingdom'],
  desert: ['Sands', 'Dunes', 'Sultanate', 'Caliphate', 'Oasis Kingdoms'],
  jungle: ['Jungles', 'Rainlands', 'Serpent Kingdoms', 'Vine Realm', 'Green Hell'],
};

const LAND_EPITHETS: Record<DistantLand['culture'], string[]> = {
  eastern: ['across the Jade Sea', 'beyond the Dragon Gate', 'where the sun rises', 'of the silk roads'],
  southern: ['beyond the burning straits', 'where the monsoons blow', 'of endless summer', 'past the spice routes'],
  northern: ['beyond the ice', 'where winter never ends', 'of the aurora', 'past the frozen sea'],
  western: ['across the sunset waters', 'beyond the horizon', 'where the old gods sleep', 'of the dying light'],
  island: ['in the endless sea', 'beyond the last lighthouse', 'where maps end', 'of a thousand isles'],
  desert: ['beyond the burning sands', 'where the oases bloom', 'of the shifting dunes', 'past the great waste'],
  jungle: ['in the green darkness', 'where the serpents rule', 'of the endless canopy', 'past the fever swamps'],
};

const LAND_KNOWN_FOR: Record<DistantLand['culture'], string[][]> = {
  eastern: [['silk', 'jade'], ['martial arts', 'paper'], ['fireworks', 'tea'], ['porcelain', 'philosophy']],
  southern: [['spices', 'elephants'], ['gold', 'ivory'], ['drums', 'masks'], ['exotic beasts', 'tribal magic']],
  northern: [['furs', 'whale oil'], ['berserkers', 'rune magic'], ['ice ships', 'sea monsters'], ['legendary smiths', 'mead']],
  western: [['banking', 'mercenaries'], ['wine', 'olive oil'], ['ancient ruins', 'lost magic'], ['clockwork', 'alchemy']],
  island: [['pearls', 'coral'], ['navigation', 'sea-craft'], ['unique creatures', 'volcanic glass'], ['cannibals', 'hidden temples']],
  desert: [['glass', 'astronomy'], ['horses', 'falconry'], ['djinn-binding', 'oasis magic'], ['geometric art', 'mathematics']],
  jungle: [['poisons', 'healing herbs'], ['feathered serpents', 'step pyramids'], ['blood magic', 'obsidian'], ['rubber', 'cacao']],
};

const RULER_TITLES: Record<DistantLand['culture'], string[]> = {
  eastern: ['Emperor', 'Heavenly Sovereign', 'Dragon Throne', 'Celestial Majesty', 'Divine Ruler'],
  southern: ['High King', 'Paramount Chief', 'Lion Lord', 'Sun King', 'Great Chief'],
  northern: ['High Jarl', 'Storm King', 'Frost Monarch', 'All-Father', 'Ice Throne'],
  western: ['Doge', 'Prince-Elector', 'Grand Duke', 'Oligarch', 'First Citizen'],
  island: ['Sea King', 'Island Lord', 'Tide Master', 'Coral Throne', 'Wave Monarch'],
  desert: ['Sultan', 'Caliph', 'Shah', 'Vizier Supreme', 'Sand King'],
  jungle: ['Serpent King', 'Jaguar Lord', 'Green Emperor', 'Vine Throne', 'Blood King'],
};

const FIGURE_NAMES_BY_CULTURE: Record<DistantLand['culture'], string[]> = {
  eastern: ['Xian', 'Zhao', 'Ming', 'Liu', 'Wei', 'Chen', 'Huang', 'Jin', 'Long', 'Feng'],
  southern: ['Mansa', 'Shaka', 'Kwame', 'Amara', 'Zuri', 'Kofi', 'Nia', 'Sekou', 'Imani', 'Jabari'],
  northern: ['Bjorn', 'Ragnar', 'Sigrid', 'Freya', 'Thorin', 'Helga', 'Orm', 'Astrid', 'Leif', 'Ingrid'],
  western: ['Lorenzo', 'Isabella', 'Marcus', 'Helena', 'Cassius', 'Octavia', 'Nero', 'Livia', 'Titus', 'Claudia'],
  island: ['Kai', 'Moana', 'Tane', 'Leilani', 'Koa', 'Malia', 'Nalu', 'Keoni', 'Ailani', 'Makoa'],
  desert: ['Rashid', 'Fatima', 'Harun', 'Layla', 'Omar', 'Yasmin', 'Khalid', 'Amira', 'Saladin', 'Soraya'],
  jungle: ['Itzamna', 'Ixchel', 'Kukulkan', 'Xochitl', 'Tlaloc', 'Quetzal', 'Cipactli', 'Coatl', 'Yaotl', 'Citlali'],
};

const FIGURE_EPITHETS = [
  'the Magnificent', 'the Terrible', 'the Wise', 'the Cruel', 'the Golden',
  'the Undying', 'the Conqueror', 'the Dreamer', 'the Mad', 'the Blessed',
  'the Accursed', 'the Beloved', 'the Feared', 'the Forgotten', 'the Returned',
  'Worldbreaker', 'Stormcaller', 'Sunbringer', 'Nightwalker', 'Deathless',
];

const FIGURE_ROLES: DistantFigure['role'][] = [
  'ruler', 'warlord', 'merchant-prince', 'prophet', 'archmage', 'pirate-lord', 'beast-master',
];

const FIGURE_REPUTATIONS: Record<DistantFigure['role'], string[]> = {
  'ruler': ['commands absolute loyalty', 'rules with an iron fist', 'beloved by the common folk', 'whispered to be a god incarnate'],
  'warlord': ['has never lost a battle', 'commands armies beyond counting', 'leaves only ashes', 'seeks worthy opponents'],
  'merchant-prince': ['owns half the world\'s trade', 'knows every secret', 'can buy nations', 'trades in the forbidden'],
  'prophet': ['speaks with the voice of gods', 'sees the future', 'commands fanatical followers', 'performs miracles'],
  'archmage': ['bends reality to their will', 'has transcended mortality', 'seeks forbidden knowledge', 'guards ancient secrets'],
  'pirate-lord': ['rules the sea lanes', 'has sunk a hundred ships', 'answers to no crown', 'knows every hidden cove'],
  'beast-master': ['commands terrible creatures', 'speaks to monsters', 'rides a dragon', 'has tamed the untameable'],
};

export function generateDistantLand(rng: Random): DistantLand {
  const culture = rng.pick(['eastern', 'southern', 'northern', 'western', 'island', 'desert', 'jungle'] as DistantLand['culture'][]);
  const prefix = rng.pick(LAND_PREFIXES);
  const suffix = rng.pick(LAND_SUFFIXES[culture]);
  
  return {
    id: rng.uid('distant-land'),
    name: `the ${prefix} ${suffix}`,
    epithet: rng.pick(LAND_EPITHETS[culture]),
    culture,
    knownFor: rng.pick(LAND_KNOWN_FOR[culture]),
    rulerTitle: rng.pick(RULER_TITLES[culture]),
    mentionCount: 0,
  };
}

export function generateDistantFigure(rng: Random, land: DistantLand): DistantFigure {
  const role = rng.pick(FIGURE_ROLES);
  const baseName = rng.pick(FIGURE_NAMES_BY_CULTURE[land.culture]);
  const epithet = rng.pick(FIGURE_EPITHETS);
  
  // Rulers get the land's ruler title
  const title = role === 'ruler' 
    ? `${land.rulerTitle} ${baseName}` 
    : `${baseName} ${epithet}`;
  
  return {
    id: rng.uid('distant-figure'),
    name: baseName,
    title,
    landId: land.id,
    role,
    reputation: rng.pick(FIGURE_REPUTATIONS[role]),
    alive: true,
    mentionCount: 0,
  };
}

// Get or create a distant land (reuses existing with some probability)
function getOrCreateDistantLand(rng: Random, state: NavalState): DistantLand {
  // 70% chance to reuse an existing land if we have some
  if (state.distantLands.length > 0 && rng.chance(0.7)) {
    const land = rng.pick(state.distantLands);
    land.mentionCount++;
    land.lastMentioned = new Date();
    return land;
  }
  
  // Create a new land
  const newLand = generateDistantLand(rng);
  newLand.mentionCount = 1;
  newLand.lastMentioned = new Date();
  state.distantLands.push(newLand);
  return newLand;
}

// Get or create a distant figure (reuses existing with some probability)
function getOrCreateDistantFigure(rng: Random, state: NavalState, land: DistantLand): DistantFigure {
  // Find existing figures from this land
  const landFigures = state.distantFigures.filter(f => f.landId === land.id && f.alive);
  
  // 60% chance to reuse an existing figure from this land
  if (landFigures.length > 0 && rng.chance(0.6)) {
    const figure = rng.pick(landFigures);
    figure.mentionCount++;
    figure.lastMentioned = new Date();
    return figure;
  }
  
  // Create a new figure
  const newFigure = generateDistantFigure(rng, land);
  newFigure.mentionCount = 1;
  newFigure.lastMentioned = new Date();
  state.distantFigures.push(newFigure);
  return newFigure;
}

// ============================================================================
// EXOTIC RUMORS FROM DISTANT LANDS
// ============================================================================

interface ExoticRumor {
  text: string;
  kind: 'distant-war' | 'distant-treasure' | 'distant-monster' | 'distant-plague' | 'distant-magic' | 'distant-trade';
  landId: string;
  figureId?: string;
}

export function generateExoticRumor(rng: Random, state: NavalState): ExoticRumor {
  const land = getOrCreateDistantLand(rng, state);
  const figure = getOrCreateDistantFigure(rng, state, land);
  
  const RUMORS = [
    // Wars and politics
    { 
      kind: 'distant-war' as const,
      texts: [
        `War has broken out in ${land.name}. ${figure.title} marshals armies beyond counting.`,
        `${figure.title} has been overthrown in ${land.name}. Chaos spreads across the realm.`,
        `A great battle was fought in ${land.name}. The dead number in the thousands.`,
        `${land.name} has fallen to invaders from ${land.epithet}.`,
        `Civil war tears ${land.name} apart. Refugees flee by the shipload.`,
        `${figure.title} demands tribute from all neighboring kingdoms.`,
      ],
    },
    // Treasure and riches
    {
      kind: 'distant-treasure' as const,
      texts: [
        `${figure.title} has discovered a treasure vault beneath ${land.name}. Gold beyond measure.`,
        `A merchant from ${land.name} arrived with ${rng.pick(land.knownFor)} worth a king's ransom.`,
        `The lost fleet of ${land.name} has been found—holds still full of ancient gold.`,
        `${figure.title} offers a fortune for adventurers willing to sail ${land.epithet}.`,
        `The mines of ${land.name} have struck a new vein. ${figure.title} grows richer by the day.`,
        `A dying sailor spoke of a map to the treasure of ${land.name}.`,
      ],
    },
    // Monsters and beasts
    {
      kind: 'distant-monster' as const,
      texts: [
        `A great sea beast has destroyed three ships bound for ${land.name}.`,
        `${figure.title} battles a dragon that has made its lair in ${land.name}.`,
        `The sailors speak of leviathans stirring in the waters ${land.epithet}.`,
        `Something ancient has awakened beneath ${land.name}. Ships flee the coast.`,
        `${land.name} is overrun with creatures from the deep places.`,
        `A kraken was sighted in waters ${land.epithet}. Trade routes are abandoned.`,
      ],
    },
    // Plagues and disasters
    {
      kind: 'distant-plague' as const,
      texts: [
        `A terrible plague sweeps ${land.name}. The dead walk in the streets.`,
        `${land.name} has been struck by a great earthquake. Cities crumble.`,
        `Famine grips ${land.name}. They say people resort to terrible things.`,
        `A cursed fog has descended on ${land.name}. None who enter return.`,
        `The waters around ${land.name} have turned to blood. Fish die in heaps.`,
        `${figure.title} has sealed the borders of ${land.name}. No one knows why.`,
      ],
    },
    // Magic and wonders
    {
      kind: 'distant-magic' as const,
      texts: [
        `The wizards of ${land.name} have opened a gate to another world.`,
        `${figure.title} has achieved immortality through forbidden rites.`,
        `A new moon appeared over ${land.name} last month. It still hangs there.`,
        `${land.name} is said to possess a weapon that can sink entire fleets.`,
        `The oracles of ${land.name} have seen a vision of the world's ending.`,
        `Strange lights in the sky over ${land.name}. The stars themselves move.`,
      ],
    },
    // Trade and goods
    {
      kind: 'distant-trade' as const,
      texts: [
        `${land.name} seeks new trading partners. Their ${rng.pick(land.knownFor)} are beyond compare.`,
        `${figure.title} has cornered the ${rng.pick(land.knownFor)} market. Prices will triple.`,
        `A new sea route ${land.epithet} has been discovered. Fortunes to be made.`,
        `The guilds of ${land.name} craft wonders unknown in these lands.`,
        `${land.name} exports substances that grant visions of the future.`,
        `${figure.title} seeks rare components. Pays in rubies.`,
      ],
    },
  ];
  
  const category = rng.pick(RUMORS);
  const text = rng.pick(category.texts);
  
  return {
    text,
    kind: category.kind,
    landId: land.id,
    figureId: figure.id,
  };
}

// ============================================================================
// HOURLY TICK - Ship voyages progress
// ============================================================================

export function tickNavalHourly(
  state: NavalState,
  world: WorldState,
  rng: Random,
  worldTime: Date,
  weather: WeatherCondition,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const ship of state.ships) {
    if (ship.status !== 'at-sea' || !ship.arrivesAt) continue;
    
    const arrivesAt = new Date(ship.arrivesAt);
    
    // Check for arrival
    if (worldTime >= arrivesAt) {
      ship.status = 'docked';
      ship.currentLocation = ship.destination!;
      
      const port = world.settlements.find(s => s.name === ship.destination);
      if (port) {
        // Deliver exotic goods
        const deliveredGoods = Object.keys(ship.cargo) as Good[];
        const exoticDelivered = deliveredGoods.filter(g => EXOTIC_GOODS.includes(g));
        
        if (exoticDelivered.length > 0) {
          logs.push({
            category: 'town',
            summary: `${ship.name} arrives in ${port.name} with exotic cargo`,
            details: `The ship brings ${exoticDelivered.join(', ')} from distant shores. Merchants rush to bid.`,
            location: port.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // Update port's exotic goods availability
          const portActivity = state.portActivity[port.name] ?? { shipsInPort: 0, exoticGoodsAvailable: [] };
          for (const good of exoticDelivered) {
            if (!portActivity.exoticGoodsAvailable.includes(good)) {
              portActivity.exoticGoodsAvailable.push(good);
            }
          }
          portActivity.shipsInPort++;
          portActivity.lastArrival = worldTime;
          state.portActivity[port.name] = portActivity;
          // Sailors sometimes bring tales from distant lands (~25% chance)
          if (rng.chance(0.25)) {
            const exoticRumor = generateExoticRumor(rng, state);
            const rumorLand = state.distantLands.find(l => l.id === exoticRumor.landId);
            logs.push({
              category: 'town',
              summary: `Sailors bring tales from ${rumorLand?.name ?? 'distant lands'}`,
              details: `The crew of ${ship.name} shares news from across the sea: "${exoticRumor.text}"`,
              location: port.name,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        } else {
          logs.push({
            category: 'town',
            summary: `${ship.name} makes port in ${port.name}`,
            details: `Another vessel completes its voyage safely.`,
            location: port.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // Even ships without exotic cargo sometimes bring tales (~15% chance)
          if (rng.chance(0.15)) {
            const exoticRumor = generateExoticRumor(rng, state);
            const rumorLand = state.distantLands.find(l => l.id === exoticRumor.landId);
            logs.push({
              category: 'town',
              summary: `Sailors bring tales from ${rumorLand?.name ?? 'distant lands'}`,
              details: `The crew of ${ship.name} shares news from across the sea: "${exoticRumor.text}"`,
              location: port.name,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
      
      // Clear voyage data
      ship.destination = undefined;
      ship.departedAt = undefined;
      ship.arrivesAt = undefined;
      ship.cargo = {};
    }
  }
  
  return logs;
}

// ============================================================================
// DAILY TICK - Voyages start, pirates raid, maritime events
// ============================================================================

export function tickNavalDaily(
  state: NavalState,
  world: WorldState,
  rng: Random,
  worldTime: Date,
  weather: WeatherCondition,
  season: Season,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // === SHIPS DEPARTING ===
  // Docked merchant ships may set sail
  const dockedMerchants = state.ships.filter(s => 
    s.status === 'docked' && 
    (s.type === 'merchant-cog' || s.type === 'carrack')
  );
  
  for (const ship of dockedMerchants) {
    // Ships are less likely to depart in bad weather or winter
    let departChance = 0.15;
    if (weather === 'storm') departChance = 0.02;
    else if (weather === 'rain') departChance = 0.08;
    if (season === 'winter') departChance *= 0.5;
    
    if (rng.chance(departChance)) {
      // Find a sea route from this port
      const routes = state.seaRoutes.filter(r => 
        r.from === ship.currentLocation || r.to === ship.currentLocation
      );
      
      if (routes.length > 0) {
        const route = rng.pick(routes);
        const destination = route.from === ship.currentLocation ? route.to : route.from;
        
        // Calculate voyage time
        // Weather affects travel: storms double time, rain +50%
        let voyageDays = route.distanceDays;
        if (weather === 'storm') voyageDays *= 2;
        else if (weather === 'rain') voyageDays = Math.ceil(voyageDays * 1.5);
        if (season === 'winter') voyageDays = Math.ceil(voyageDays * 1.3);
        
        const voyageHours = voyageDays * 24;
        
        ship.status = 'at-sea';
        ship.destination = destination;
        ship.departedAt = worldTime;
        ship.arrivesAt = new Date(worldTime.getTime() + voyageHours * 60 * 60 * 1000);
        
        // Load cargo
        const cargo: Partial<Record<Good, number>> = {};
        for (const good of route.primaryGoods) {
          if (rng.chance(0.5)) {
            cargo[good] = 1 + rng.int(5);
          }
        }
        ship.cargo = cargo;
        
        // Update port activity
        const portActivity = state.portActivity[ship.currentLocation];
        if (portActivity) {
          portActivity.shipsInPort = Math.max(0, portActivity.shipsInPort - 1);
          portActivity.lastDeparture = worldTime;
        }
        
        const cargoDesc = Object.keys(cargo).length > 0 
          ? `carrying ${Object.keys(cargo).join(', ')}`
          : 'with empty holds seeking cargo';
        
        logs.push({
          category: 'town',
          summary: `${ship.name} sets sail from ${ship.currentLocation}`,
          details: `The ${ship.type} departs for ${destination}, ${cargoDesc}. Expected voyage: ${voyageDays} days.`,
          location: ship.currentLocation,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  // === PIRATE RAIDS ===
  for (const pirates of state.pirates) {
    // Pirates raid more in good weather
    let raidChance = 0.08;
    if (weather === 'storm') raidChance = 0.01;
    if (season === 'summer') raidChance *= 1.5;
    
    // Don't raid too frequently
    if (pirates.lastRaid) {
      const daysSinceRaid = (worldTime.getTime() - new Date(pirates.lastRaid).getTime()) / (24 * 60 * 60 * 1000);
      if (daysSinceRaid < 3) raidChance = 0;
    }
    
    if (rng.chance(raidChance)) {
      // Find ships at sea on routes we prey upon
      const targets = state.ships.filter(s => 
        s.status === 'at-sea' && 
        s.type !== 'warship' &&
        state.seaRoutes.some(r => 
          pirates.territory.includes(r.id) &&
          (r.from === s.homePort || r.to === s.destination)
        )
      );
      
      if (targets.length > 0) {
        const target = rng.pick(targets);
        pirates.lastRaid = worldTime;
        
        // Combat resolution (simplified)
        const pirateStrength = pirates.crew * 0.8;
        const targetStrength = target.marines * 1.0 + target.crew * 0.3;
        
        const pirateRoll = pirateStrength * (0.5 + rng.next());
        const targetRoll = targetStrength * (0.5 + rng.next());
        
        if (pirateRoll > targetRoll * 1.5) {
          // Pirates win decisively - capture
          logs.push({
            category: 'road',
            summary: `${pirates.name} capture ${target.name}!`,
            details: `${pirates.captain} and their crew overwhelm the ${target.type}. The cargo is seized, the crew ransomed or pressed into service.`,
            location: 'the high seas',
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // Ship captured - remove from active fleet
          target.status = 'shipwrecked';
          target.currentLocation = 'captured';
          pirates.notoriety = Math.min(100, pirates.notoriety + 10);
          pirates.bounty += 100 + rng.int(200);
          
        } else if (pirateRoll > targetRoll) {
          // Pirates win - plunder but ship escapes damaged
          logs.push({
            category: 'road',
            summary: `${pirates.name} raid ${target.name}`,
            details: `${pirates.captain}'s corsairs board and plunder the vessel, but it limps away with survivors.`,
            location: 'the high seas',
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          target.condition = Math.max(20, target.condition - 30);
          target.cargo = {};
          pirates.notoriety = Math.min(100, pirates.notoriety + 5);
          
        } else {
          // Ship fights off pirates
          logs.push({
            category: 'road',
            summary: `${target.name} repels pirate attack`,
            details: `${pirates.name} attempt to take the ${target.type}, but the crew fights them off. The corsairs withdraw with casualties.`,
            location: 'the high seas',
            actors: [pirates.captain, target.ownerName],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          pirates.crew = Math.max(10, pirates.crew - 5 - rng.int(10));
          target.condition = Math.max(40, target.condition - 15);
        }
      }
    }
  }
  
  // === STORMS AT SEA ===
  if (weather === 'storm') {
    const shipsAtSea = state.ships.filter(s => s.status === 'at-sea');
    
    for (const ship of shipsAtSea) {
      const config = SHIP_CONFIG[ship.type];
      const survivalChance = config.seaworthiness * (ship.condition / 100);
      
      if (rng.chance(0.2)) { // 20% chance storm affects this ship
        if (rng.chance(survivalChance)) {
          // Survives but damaged
          logs.push({
            category: 'weather',
            summary: `${ship.name} weathers the storm`,
            details: `The ${ship.type} is battered but stays afloat. Repairs will be needed.`,
            location: 'the high seas',
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          ship.condition = Math.max(30, ship.condition - 20 - rng.int(20));
          
          // Delay arrival
          if (ship.arrivesAt) {
            ship.arrivesAt = new Date(ship.arrivesAt.getTime() + 12 * 60 * 60 * 1000);
          }
        } else {
          // Shipwreck!
          logs.push({
            category: 'weather',
            summary: `${ship.name} lost in the storm!`,
            details: `The ${ship.type} founders in the tempest. Wreckage may wash ashore. ${ship.crew} souls aboard.`,
            location: 'the high seas',
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          ship.status = 'shipwrecked';
          
          state.recentShipwrecks.push({
            shipName: ship.name,
            location: ship.destination ?? 'unknown waters',
            date: worldTime,
            cargo: { ...ship.cargo },
            salvaged: false,
          });
        }
      }
    }
  }
  
  // === SEA MONSTER SIGHTINGS ===
  if (rng.chance(0.03)) {
    const ports = world.settlements.filter(s => s.isPort);
    if (ports.length > 0) {
      const port = rng.pick(ports);
      const monster = rng.pick([...SEA_MONSTERS]);
      
      const MONSTER_DESCRIPTIONS: Record<string, { summary: string; details: string }> = {
        'sea-serpent': {
          summary: `Sea serpent spotted near ${port.name}`,
          details: 'Fishermen report a massive scaled form in the waves. Several boats refuse to leave harbor.',
        },
        'giant-octopus': {
          summary: `Giant octopus attacks boat near ${port.name}`,
          details: 'Tentacles the size of masts drag a fishing vessel under. One survivor babbles of eyes like cartwheels.',
        },
        'dragon-turtle': {
          summary: `Dragon turtle surfaces off ${port.name}`,
          details: 'The ancient creature rises from the deep. Its shell is an island. Its breath is steam. Offerings are prepared.',
        },
        'kraken': {
          summary: `The kraken stirs in waters near ${port.name}`,
          details: 'Sailors whisper the dread name. Ships are kept in harbor. The sea itself seems to hold its breath.',
        },
        'merfolk': {
          summary: `Merfolk seen near ${port.name}`,
          details: 'The sea folk have been spotted watching the harbor. Their intentions are unknown.',
        },
        'sahuagin': {
          summary: `Sahuagin raid coast near ${port.name}`,
          details: 'The fish-men emerge from the waves at night. A fishing hamlet is found empty, blood on the sand.',
        },
        'sea-hag': {
          summary: `Sea hag's curse afflicts ${port.name}`,
          details: 'Nets come up empty. Hulls rot overnight. Someone has angered the old woman of the waves.',
        },
        'water-elemental': {
          summary: `Water elemental rampages near ${port.name}`,
          details: 'A living wave tears through the harbor. Some wizard\'s summoning gone wrong, perhaps.',
        },
        'laceddon': {
          summary: `Drowned dead walk near ${port.name}`,
          details: 'Corpses of the drowned claw up from the sea. The beach becomes a battlefield.',
        },
        'nixie': {
          summary: `Nixies enchant sailors near ${port.name}`,
          details: 'Men walk into the sea in a trance. Some do not return.',
        },
        'sea-giant': {
          summary: `Sea giant demands tribute from ${port.name}`,
          details: 'The giant wades in the shallows, demanding gold and cattle. The harbor master negotiates.',
        },
        'giant-crab': {
          summary: `Giant crabs emerge near ${port.name}`,
          details: 'Monstrous crustaceans scuttle onto the beach. Their claws can sever a man in two.',
        },
        'giant-shark': {
          summary: `Giant shark terrorizes waters near ${port.name}`,
          details: 'A fin the size of a sail circles the harbor. Swimming is forbidden.',
        },
        'whale': {
          summary: `Great whale sighted off ${port.name}`,
          details: 'A leviathan surfaces, spraying water high. An omen, say the old sailors. But of what?',
        },
        'morkoth': {
          summary: `Strange disappearances near ${port.name}`,
          details: 'Ships vanish in calm seas. Survivors speak of hypnotic lights in the deep.',
        },
      };
      
      const desc = MONSTER_DESCRIPTIONS[monster] ?? {
        summary: `Sea creature spotted near ${port.name}`,
        details: 'Something lurks in the waters. Sailors are wary.',
      };
      
      logs.push({
        category: 'road',
        summary: desc.summary,
        details: desc.details,
        location: port.name,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // === SALVAGE OPPORTUNITIES ===
  const unsalvaged = state.recentShipwrecks.filter(w => !w.salvaged);
  if (unsalvaged.length > 0 && rng.chance(0.1)) {
    const wreck = rng.pick(unsalvaged);
    const ports = world.settlements.filter(s => s.isPort);
    if (ports.length > 0) {
      const port = rng.pick(ports);
      
      logs.push({
        category: 'town',
        summary: `Wreckage of ${wreck.shipName} washes ashore near ${port.name}`,
        details: `Salvagers rush to the beach. Cargo may be recoverable.`,
        location: port.name,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      wreck.salvaged = true;
    }
  }
  
  // === EXOTIC GOODS DECAY ===
  // Exotic goods don't last forever at ports
  for (const [portName, activity] of Object.entries(state.portActivity)) {
    if (rng.chance(0.1) && activity.exoticGoodsAvailable.length > 0) {
      const sold = activity.exoticGoodsAvailable.pop();
      // Goods sell or spoil
    }
  }
  
  return logs;
}

// ============================================================================
// PORT UTILITIES
// ============================================================================

export function markSettlementAsPort(
  settlement: Settlement,
  rng: Random,
): void {
  settlement.isPort = true;
  
  // Determine port size based on settlement type
  if (settlement.type === 'city') {
    settlement.portSize = rng.chance(0.3) ? 'great' : 'major';
  } else if (settlement.type === 'town') {
    settlement.portSize = rng.chance(0.5) ? 'major' : 'minor';
  } else {
    settlement.portSize = 'minor';
  }
  
  // Cities might have shipyards
  settlement.shipyard = settlement.type === 'city' || 
    (settlement.type === 'town' && rng.chance(0.3));
    
  // Major ports might have lighthouses
  settlement.lighthouse = settlement.portSize === 'great' || 
    (settlement.portSize === 'major' && rng.chance(0.5));
}

export function getExoticGoodsAtPort(
  state: NavalState,
  portName: string,
): Good[] {
  return state.portActivity[portName]?.exoticGoodsAvailable ?? [];
}

export function getShipsInPort(
  state: NavalState,
  portName: string,
): Ship[] {
  return state.ships.filter(s => s.currentLocation === portName && s.status === 'docked');
}

export function getPiratesInArea(
  state: NavalState,
  portName: string,
): PirateFleet[] {
  const routes = state.seaRoutes.filter(r => r.from === portName || r.to === portName);
  const routeIds = routes.map(r => r.id);
  return state.pirates.filter(p => p.territory.some(t => routeIds.includes(t)));
}

// ============================================================================
// CROSS-SYSTEM INTEGRATION
// ============================================================================

import { Antagonist, generateAntagonist } from './antagonists.ts';

/**
 * Check if a pirate fleet has become notorious enough to become a full antagonist.
 * Returns an antagonist if one should be created.
 */
export function checkPiratePromotion(
  pirate: PirateFleet,
  rng: Random,
  world: WorldState,
): Antagonist | null {
  // Pirates with 80+ notoriety become full antagonists
  if (pirate.notoriety >= 80) {
    const port = world.settlements.find(s => s.isPort);
    return generateAntagonist(
      rng,
      'pirate-captain',
      port?.name ?? 'the high seas',
      Math.floor(pirate.notoriety / 20) + 3, // threat 7-8 at high notoriety
    );
  }
  return null;
}

/**
 * Generate a rumor about naval events
 */
export function generateNavalRumor(
  rng: Random,
  state: NavalState,
  world: WorldState,
): { text: string; location: string } | null {
  const options: { text: string; location: string }[] = [];
  
  // Rumors about notorious pirates
  const notoriousPirates = state.pirates.filter(p => p.notoriety >= 50);
  for (const pirate of notoriousPirates) {
    const port = world.settlements.find(s => s.isPort);
    if (port) {
      options.push({
        text: `${pirate.captain} and ${pirate.name} have a bounty of ${pirate.bounty} gold. They prey on ships ${pirate.territory.length > 0 ? 'along the trade routes' : 'across the seas'}.`,
        location: port.name,
      });
    }
  }
  
  // Rumors about shipwrecks
  for (const wreck of state.recentShipwrecks.filter(w => !w.salvaged)) {
    const port = world.settlements.find(s => s.isPort);
    if (port && Object.keys(wreck.cargo).length > 0) {
      options.push({
        text: `The wreck of ${wreck.shipName} lies somewhere near ${wreck.location}. Cargo may still be aboard.`,
        location: port.name,
      });
    }
  }
  
  // Rumors about distant lands
  for (const land of state.distantLands) {
    if (land.mentionCount >= 2) {
      const port = world.settlements.find(s => s.isPort);
      if (port) {
        options.push({
          text: `Sailors speak often of ${land.name}, ${land.epithet}. They are known for their ${land.knownFor.join(' and ')}.`,
          location: port.name,
        });
      }
    }
  }
  
  // Rumors about distant figures
  for (const figure of state.distantFigures) {
    if (figure.mentionCount >= 2) {
      const land = state.distantLands.find(l => l.id === figure.landId);
      const port = world.settlements.find(s => s.isPort);
      if (port && land) {
        options.push({
          text: `${figure.title} of ${land.name} is said to be a ${figure.role} who ${figure.reputation}.`,
          location: port.name,
        });
      }
    }
  }
  
  if (options.length === 0) return null;
  return rng.pick(options);
}

