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
  | 'desert';

export type Good = 'grain' | 'timber' | 'ore' | 'textiles' | 'salt' | 'fish' | 'livestock';
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

export interface Party {
  id: string;
  name: string;
  members: string[];
  location: string;
  status: 'idle' | 'travel';
  travel?: TravelPlan;
  fatigue?: number; // rough penalty tracking; higher means slower next hop
  wounded?: boolean;
  restHoursRemaining?: number; // if set, party will not start travel
  goal?: Goal;
  fame?: number;
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
}

export interface WorldState {
  seed: string;
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
  startedAt: Date;
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
export interface SettlementDeepState {
  prosperity: number;    // -10 to +10 (affects trade, population)
  safety: number;        // -10 to +10 (affects travel, morale)
  unrest: number;        // 0 to 10 (can trigger uprising)
  populationDelta: number; // People arriving/leaving
  recentEvents: string[]; // Event IDs affecting this place
  controlledBy?: string;  // Faction ID if under faction control
  contested: boolean;     // Multiple factions fighting over it
  rulerNpcId?: string;    // Who rules here
  defenseLevel: number;   // 0-10 (affects raid success)
}

export interface FactionDeepState {
  power: number;         // 0-100, overall strength
  territory: string[];   // Settlement names they control
  enemies: string[];     // Faction IDs they're at war with
  allies: string[];      // Faction IDs they're allied with
  resources: number;     // Economic power
  morale: number;        // -10 to +10
  activeOperations: Array<{
    id: string;
    type: string;
    target: string;
    startedAt: Date;
    completesAt: Date;
    participants: string[];
    successChance: number;
  }>;
  recentLosses: number;  // Accumulated losses (triggers responses)
  recentWins: number;    // Accumulated wins (triggers expansion)
}

export interface PartyDeepState {
  morale: number;        // -10 to +10
  resources: number;     // Gold/supplies
  enemies: string[];     // Antagonists/factions hunting them
  allies: string[];      // Factions/NPCs supporting them
  questLog: Array<{
    id: string;
    type: 'hunt' | 'escort' | 'retrieve' | 'explore' | 'defend' | 'avenge';
    target: string;
    reason: string;
    progress: number;
    deadline?: Date;
  }>;
  killList: string[];    // Antagonists they've defeated
  reputation: Record<string, number>; // Reputation per settlement
  vendetta?: string;     // Who they're hunting
  protectee?: string;    // Who they're protecting
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
  settlementStates?: Record<string, SettlementDeepState>;
  factionStates?: Record<string, FactionDeepState>;
  partyStates?: Record<string, PartyDeepState>;
  eventHistory?: WorldEvent[];
}

