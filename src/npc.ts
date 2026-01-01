import { LogEntry, WorldState, NPC } from './types.ts';

// Helper to get settlement name from ID
export function getSettlementName(world: WorldState, settlementId: string): string {
  const settlement = world.settlements.find((s) => s.id === settlementId);
  return settlement?.name ?? settlementId;
}

export function moveEscortsIntoTown(world: WorldState, npcIds: string[], townName: string): NPC[] {
  const moved: NPC[] = [];
  for (const id of npcIds) {
    const npc = world.npcs.find((n) => n.id === id);
    if (npc && npc.alive !== false) {
      npc.location = townName;
      moved.push(npc);
    }
  }
  return moved;
}

export function npcArrivalLogs(npcs: NPC[], townName: string, worldTime: Date, seed: string, world: WorldState): LogEntry[] {
  return npcs.map((npc) => ({
    category: 'town',
    summary: `${npc.name} arrives in ${townName}`,
    details: `${npc.role} from ${getSettlementName(world, npc.home)}`,
    location: townName,
    worldTime,
    realTime: new Date(),
    seed,
  }));
}


export function npcMarketBeat(npcs: NPC[], townName: string, worldTime: Date, seed: string): LogEntry[] {
  return npcs.map((npc) => ({
    category: 'town',
    summary: `${npc.name} seen in ${townName} markets`,
    details: `${npc.role} haggles and swaps news.`,
    location: townName,
    worldTime,
    realTime: new Date(),
    seed,
  }));
}



