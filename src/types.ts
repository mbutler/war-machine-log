export type TickKind = 'turn' | 'hour' | 'day';

export interface TickEvent {
  kind: TickKind;
  worldTime: Date;
  turnIndex: number;
}

export type BusEvent = TickEvent;

export type LogCategory = 'town' | 'road' | 'dungeon' | 'faction' | 'weather' | 'system';

export interface LogEntry {
  category: LogCategory;
  summary: string;
  details?: string;
  location?: string;
  actors?: string[];
  worldTime: Date;
  realTime: Date;
  seed?: string;
}

export interface SimContext {
  seed: string;
  startWorldTime: Date;
}

export interface HexCoord {
  q: number; // column
  r: number; // row
}

export interface HexTile {
  coord: HexCoord;
  terrain: Terrain;
}

export type Terrain =
  | 'road'
  | 'clear'
  | 'forest'
  | 'hills'
  | 'mountains'
  | 'swamp'
  | 'desert'
  | 'coastal'    // Land adjacent to sea - can have ports
  | 'ocean'      // Open sea - ships only
  | 'reef'       // Dangerous waters
  | 'river';     // Navigable river

export type Good = 
  | 'grain' | 'timber' | 'ore' | 'textiles' | 'salt' | 'fish' | 'livestock'
  // Exotic goods (primarily arrive by sea)
  | 'spices' | 'silk' | 'gems' | 'ivory' | 'wine' | 'dyes';
export type PriceTrend = 'low' | 'normal' | 'high';
export type RareFind = 'artifact' | 'relic' | 'ancient-map';

export interface TravelPlan {
  destination: string;
  terrain: Terrain;
  milesRemaining: number;
  milesPerHour: number;
}

export interface Goal {
  kind: 'travel-to';
  target: string; // settlement or dungeon name
  sourceRumorId?: string;
}

export type CharacterClass =
  | 'Cleric'
  | 'Fighter'
  | 'Magic-User'
  | 'Thief'
  | 'Dwarf'
  | 'Elf'
  | 'Halfling'
  | 'Druid'
  | 'Mystic';

export interface Spell {
  name: string;
  level: number;
  type: 'arcane' | 'divine';
  effect: string; // Narrative description of what it does to the world
}

export interface PartyMember {
  name: string;
  class: CharacterClass;
  level: number;
  hp: number;
  maxHp: number;
}

export interface Party {
  id: string;
  name: string;
  members: PartyMember[];
  location: string;
  status: 'idle' | 'travel';
  travel?: TravelPlan;
  fatigue?: number; // rough penalty tracking; higher means slower next hop
  wounded?: boolean;
  restHoursRemaining?: number; // if set, party will not start travel
  goal?: Goal;
  fame?: number;
  xp: number;
}

export interface Settlement {
  id: string;
  name: string;
  population: number;
  type: 'village' | 'town' | 'city';
  coord: HexCoord;
  supply: Record<Good, number>;
  mood: number; // -3..3
  lastTownLogDay?: string;
  priceTrends?: Record<Good, PriceTrend>;
  // Naval properties
  isPort?: boolean;           // Can receive ships
  portSize?: 'minor' | 'major' | 'great'; // Determines ship capacity
  shipyard?: boolean;         // Can build/repair ships
  lighthouse?: boolean;       // Reduces shipwreck chance
}

export interface Stronghold {
  id: string;
  ownerId: string; // NPC or Party ID
  name: string;
  location: HexCoord;
  type: 'Tower' | 'Keep' | 'Temple' | 'Hideout';
  level: number; // 1-3
  staff: number;
  constructionFinished: boolean;
  treasury: number;
  unrest: number; // 0-10
  population: number; // Number of families in the domain
  taxRate: number; // Percentage
  lastTaxCollection?: Date;
}

export interface Army {
  id: string;
  ownerId: string; // Faction, NPC, or Party
  location: string; // Settlement name or "hex:q,r"
  strength: number; // Number of troops
  quality: number; // 1-10 (training/equipment)
  morale: number; // 2-12
  status: 'idle' | 'marching' | 'besieging' | 'battling' | 'starving' | 'diseased' | 'surrendered';
  target?: string;
  supplies: number;       // 0-100%
  supplyLineFrom?: string; // Settlement ID or Stronghold ID providing food
  lastSupplied: Date;
  isMercenary?: boolean;
  costPerMonth?: number;
  capturedLeaders: string[]; // NPC IDs held as prisoners
}

export interface MercenaryCompany {
  id: string;
  name: string;
  captainId: string; // NPC ID
  location: string;
  size: number;
  quality: number;
  hiredById?: string; // Faction or NPC ID
  monthlyRate: number;
  loyalty: number; // 2-12
}

export interface Landmark {
  id: string;
  name: string;
  description: string;
  location: HexCoord;
  terrain: Terrain;
  discoveryDate: Date;
  discoveredBy: string; // Party or NPC name
  effect?: string;
  knownBy: string[]; // Names of people/factions who know about it
}

export interface Ruin {
  id: string;
  name: string;
  description: string;
  location: HexCoord;
  rooms: StockedRoom[];
  cleared: boolean;
  occupiedBy?: string; // Faction or Monster name
  danger: number; // 1-10
  history: string;
}

export interface Nexus {
  id: string;
  name: string;
  location: HexCoord;
  powerType: 'Arcane' | 'Divine' | 'Primal' | 'Shadow';
  intensity: number; // 1-10
  currentOwnerId?: string; // Faction or NPC ID
}

export type WorldArchetype = 'Standard' | 'Age of War' | 'The Great Plague' | 'Arcane Bloom' | 'Wilderness Unbound' | 'Golden Age';

export interface WorldState {
  seed: string;
  archetype: WorldArchetype;
  hexes: HexTile[];
  width: number;
  height: number;
  settlements: Settlement[];
  parties: Party[];
  roads: Array<[string, string]>; // settlement id pairs indicating road connections
  dungeons: Dungeon[];
  activeRumors: Rumor[];
  npcs: NPC[];
  caravans: Caravan[];
  factions: Faction[];
  strongholds: Stronghold[];
  armies: Army[];
  landmarks: Landmark[];
  ruins: Ruin[];
  nexuses: Nexus[];
  mercenaries: MercenaryCompany[];
  startedAt: Date;
  lastTickAt?: Date; // When the simulation last ran (for catch-up)
}

export interface StockedRoom {
  type: 'lair' | 'trap' | 'treasure' | 'empty' | 'shrine' | 'laboratory';
  threat: number;
  loot: boolean;
  rare?: RareFind;
}

export interface Dungeon {
  id: string;
  name: string;
  coord: HexCoord;
  depth: number;
  danger: number; // 1-5
  rooms?: StockedRoom[];
  explored?: number;
}

export interface Rumor {
  id: string;
  kind: 'dungeon' | 'caravan' | 'monster-sign' | 'omen' | 'feud' | 'mystery';
  text: string;
  target: string; // settlement or dungeon name or hex label
  origin: string; // settlement name where heard
  freshness: number; // days remaining
}

export type NPCRole = 'merchant' | 'guard' | 'scout' | 'priest' | 'bard' | 'laborer';

export interface NPC {
  id: string;
  name: string;
  role: NPCRole;
  class?: CharacterClass;
  level?: number;
  xp?: number;
  spells?: string[]; // Spell names
  home: string; // settlement id
  location: string; // settlement name for now
  reputation: number; // -3..3
  fame?: number;
  alive?: boolean;
  wounded?: boolean;
}

export interface Caravan {
  id: string;
  name: string;
  route: [string, string]; // settlement ids
  goods: Good[];
  location: string;
  progressHours: number;
  direction: 'outbound' | 'inbound';
  escorts?: string[]; // npc ids
  factionId?: string;
  merchantId?: string;
}

export interface Faction {
  id: string;
  name: string;
  attitude: Record<string, number>; // other faction id -> -3..3
  wealth: number;
  focus: 'trade' | 'martial' | 'pious' | 'arcane';
  lastNoted?: string;
}

// Deep state types for causality engine
export interface FactionState {
  power: number;         // 0-100, overall strength
  territory: string[];   // Settlement IDs they control
  enemies: string[];     // Faction IDs they're at war with
  allies: string[];      // Faction IDs they're allied with
  resources: number;     // Economic power
  morale: number;        // -10 to +10
  resourceNeeds: Good[]; // Specific goods they are aggressively seeking
  casusBelli: Record<string, { reason: string; magnitude: number }>; // Target ID -> Why they want war
  activeOperations: FactionOperation[];
  recentLosses: number;  // Accumulated losses (triggers responses)
  recentWins: number;    // Accumulated wins (triggers expansion)
}

export type FactionOperationType =
  // === MILITARY OPERATIONS ===
  | 'raid'              // Quick strike for plunder
  | 'patrol'            // Defensive presence
  | 'conquest'          // Taking territory
  | 'siege'             // Prolonged military action
  | 'defense'           // Reinforcing a location
  | 'escort'            // Protecting a caravan or person
  | 'punitive-expedition'  // Retaliatory strike
  | 'mercenary-hire'    // Hiring sellswords
  
  // === ECONOMIC OPERATIONS ===
  | 'trade-embargo'     // Blocking commerce
  | 'smuggling'         // Illegal trade routes
  | 'price-fixing'      // Market manipulation
  | 'resource-grab'     // Securing materials
  | 'blockade'          // Cutting off supplies
  | 'investment'        // Growing wealth in a region
  
  // === POLITICAL OPERATIONS ===
  | 'diplomacy'         // Negotiation and alliance
  | 'marriage-alliance' // Political wedding
  | 'bribery'           // Corruption and payoffs
  | 'blackmail'         // Using secrets as leverage
  | 'propaganda'        // Shaping public opinion
  | 'infiltration'      // Placing spies
  | 'coup'              // Overthrowing leadership
  
  // === COVERT OPERATIONS ===
  | 'assassination'     // Targeted killing
  | 'sabotage'          // Destroying resources
  | 'theft'             // Stealing specific items
  | 'arson'             // Burning structures
  | 'poisoning'         // Contaminating supplies
  | 'kidnapping'        // Taking hostages
  
  // === RELIGIOUS OPERATIONS ===
  | 'crusade'           // Holy war
  | 'pilgrimage'        // Sacred journey
  | 'conversion'        // Spreading faith
  | 'inquisition'       // Hunting heretics
  | 'sanctuary'         // Offering protection
  | 'excommunication'   // Casting out the faithless
  
  // === EXPANSION OPERATIONS ===
  | 'colonization'      // Settling new territory
  | 'recruitment'       // Growing membership
  | 'expansion'         // General growth
  | 'fortification'     // Building defenses
  | 'exploration'       // Scouting new areas
  
  // === SUPPORT OPERATIONS ===
  | 'relief'            // Humanitarian aid
  | 'healing-mission'   // Medical support
  | 'festival'          // Public celebration
  | 'monument'          // Building legacy
  | 'education';        // Training and knowledge

export interface FactionOperation {
  id: string;
  type: FactionOperationType;
  target: string;        // Settlement, faction, or NPC
  secondaryTarget?: string;
  startedAt: Date;
  completesAt: Date;
  participants: string[]; // NPC IDs involved
  successChance: number;
  resources: number;     // Gold/resources committed
  secret: boolean;       // Is this a covert operation?
  reason?: string;       // Why this operation was launched
}

export interface WorldEvent {
  id: string;
  type: string;
  timestamp: Date;
  location: string;
  actors: string[];
  victims?: string[];
  perpetrators?: string[];
  magnitude: number;
  witnessed: boolean;
  data: Record<string, unknown>;
}

export interface SettlementState {
  prosperity: number;    // -10 to +10 (affects trade, population)
  safety: number;        // -10 to +10 (affects travel, morale)
  unrest: number;        // 0 to 10 (can trigger uprising)
  populationDelta: number; // People arriving/leaving
  recentEvents: string[]; // Event IDs affecting this place
  controlledBy?: string;  // Faction ID if under faction control
  contested: boolean;     // Multiple factions fighting over it
  rulerNpcId?: string;    // Who rules here
  defenseLevel: number;   // 0-10 (affects raid success)
  disease?: {
    type: string;
    intensity: number; // 1-10
    spreadRate: number;
    discovered: boolean;
  };
  quarantined: boolean;
}

export interface PartyState {
  morale: number;        // -10 to +10
  resources: number;     // Gold/supplies
  enemies: string[];     // Antagonists/factions hunting them
  allies: string[];      // Factions/NPCs supporting them
  questLog: PartyQuest[];
  killList: string[];    // Antagonists they've defeated
  reputation: Record<string, number>; // Reputation per settlement
  vendetta?: string;     // Who they're hunting
  protectee?: string;    // Who they're protecting
}

export interface PartyQuest {
  id: string;
  type: 'hunt' | 'escort' | 'retrieve' | 'explore' | 'defend' | 'avenge' | 'stronghold';
  target: string;
  reason: string;
  progress: number;
  deadline?: Date;
}

// Extended world state for the enhanced simulation
export interface EnhancedWorldState extends WorldState {
  calendar?: {
    year: number;
    month: number;
    day: number;
    weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'snow' | 'fog';
    weatherDuration: number;
    moonPhase: 'new' | 'waxing' | 'full' | 'waning';
  };
  antagonists?: Array<{
    id: string;
    name: string;
    epithet: string;
    type: string;
    threat: number;
    territory: string;
    notoriety: number;
    alive: boolean;
    lastSeen?: string;
    minions?: number;
  }>;
  storyThreads?: Array<{
    id: string;
    type: string;
    title: string;
    summary: string;
    phase: string;
    actors: string[];
    location: string;
    tension: number;
    resolved: boolean;
    startedAt: Date;
    lastUpdated: Date;
    beats: Array<{
      timestamp: Date;
      summary: string;
      tensionChange: number;
    }>;
  }>;
  consequenceQueue?: {
    pending: Array<{
      id: string;
      type: string;
      turnsUntilResolution: number;
      data: Record<string, unknown>;
    }>;
  };
  // Deep causality state
  settlementStates?: Record<string, SettlementState>;
  factionStates?: Record<string, FactionState>;
  partyStates?: Record<string, PartyState>;
  eventHistory?: WorldEvent[];
  
  // New systems state
  retainerRoster?: import('./retainers.ts').RetainerRoster;
  guildState?: import('./guilds.ts').GuildState;
  ecologyState?: import('./ecology.ts').EcologyState;
  dynastyState?: import('./dynasty.ts').DynastyState;
  treasureState?: import('./treasure.ts').TreasureState;
  navalState?: import('./naval.ts').NavalState;
}

