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

export interface TravelPlan {
  destination: string;
  terrain: Terrain;
  milesRemaining: number;
  milesPerHour: number;
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
}

export interface Settlement {
  id: string;
  name: string;
  population: number;
  type: 'village' | 'town' | 'city';
  coord: HexCoord;
}

export interface WorldState {
  seed: string;
  hexes: HexTile[];
  width: number;
  height: number;
  settlements: Settlement[];
  parties: Party[];
  roads: Array<[string, string]>; // settlement id pairs indicating road connections
  startedAt: Date;
}

