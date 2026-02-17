import { Random } from './rng.ts';
import { LogEntry, WorldState, Good, Rumor, PriceTrend } from './types.ts';
import { spawnRumor, decayRumors, createRumor, logRumor } from './rumors.ts';
import { settlementById } from './world.ts';
import { factionTownBeat } from './factions.ts';
import { npcMarketBeat } from './npc.ts';

const GOODS: Good[] = ['grain', 'timber', 'ore', 'textiles', 'salt', 'fish', 'livestock'];

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function pulseSupply(settlementSupply: Record<Good, number>, rng: Random) {
  const g = rng.pick(GOODS);
  const delta = rng.chance(0.5) ? 1 : -1;
  settlementSupply[g] = Math.max(-3, Math.min(3, settlementSupply[g] + delta));
}

export function applyCaravanTrade(world: WorldState, settlementName: string, goods: Good[]) {
  const s = world.settlements.find((x) => x.name === settlementName);
  if (!s) return;
  for (const g of goods) {
    s.supply[g] = Math.min(4, (s.supply[g] ?? 0) + 1);
  }
  updatePriceTrends(s);
}

function updatePriceTrends(s: WorldState['settlements'][number]) {
  s.priceTrends ??= {} as Record<Good, PriceTrend>;
  for (const g of GOODS) {
    const level = s.supply[g] ?? 0;
    s.priceTrends[g] = level >= 2 ? 'low' : level <= -2 ? 'high' : 'normal';
  }
}

function supplySummary(supply: Record<Good, number>): string {
  const highs = GOODS.filter((g) => supply[g] >= 2);
  const lows = GOODS.filter((g) => supply[g] <= -2);
  if (highs.length && lows.length) {
    return `Surplus ${highs.join('/')} and shortages in ${lows.join('/')}.`;
  }
  if (highs.length) return `Surplus ${highs.join('/')}.`;
  if (lows.length) return `Shortages in ${lows.join('/')}.`;
  return 'Markets steady.';
}

function rumorFromSupply(rng: Random, s: WorldState['settlements'][number]): string | null {
  const lows = GOODS.filter((g) => s.supply[g] <= -2);
  const highs = GOODS.filter((g) => s.supply[g] >= 2);
  if (lows.length && rng.chance(0.5)) {
    const g = rng.pick(lows);
    return `Levies rumored to secure ${g}; officials say caravans delayed.`;
  }
  if (highs.length && rng.chance(0.3)) {
    const g = rng.pick(highs);
    return `Bargain prices on ${g}; traders racing to ${s.name}.`;
  }
  return null;
}

function maybeRumor(world: WorldState, rng: Random, origin: string, logs: LogEntry[], worldTime: Date) {
  if (rng.chance(0.35)) {
    const rumor = spawnRumor(world, rng, origin);
    world.activeRumors.push(rumor);
    logs.push({
      category: 'town',
      summary: `Rumor in ${origin}`,
      details: rumor.text,
      location: origin,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
}

export function dailyTownTick(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  decayRumors(world);
  for (const s of world.settlements) {
    const day = dayKey(worldTime);
    if (s.lastTownLogDay === day && rng.chance(0.5) === false) continue;

    // Pulse supply and mood
    pulseSupply(s.supply, rng);
    s.mood = Math.max(-3, Math.min(3, s.mood + (rng.chance(0.3) ? 1 : -1)));

    updatePriceTrends(s);
    const supplyText = supplySummary(s.supply);
    const moodText =
      s.mood >= 2 ? 'spirits high' : s.mood <= -2 ? 'tempers frayed' : 'folk watchful';
    // Market beat featuring resident NPCs present in this town.
    const npcsHere = world.npcs.filter((n) => n.location === s.name && n.alive !== false);
    if (npcsHere.length && rng.chance(0.4)) {
      logs.push(...npcMarketBeat(npcsHere.slice(0, 2), s.name, worldTime, world.seed));
    }
    // Hero spotlight for famous parties in town
    const partiesHere = world.parties.filter((p) => p.location === s.name && (p.fame ?? 0) >= 5);
    if (partiesHere.length && rng.chance(0.5)) {
      for (const p of partiesHere.slice(0, 1)) {
        logs.push({
          category: 'town',
          summary: `${p.name} hailed in ${s.name}`,
          details: 'Locals toast their exploits.',
          location: s.name,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    logs.push({
      category: 'town',
      summary: `${s.name} ${moodText}`,
      details: supplyText,
      location: s.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    const econRumor = rumorFromSupply(rng, s);
    if (econRumor) {
      const rumor = createRumor(world, rng, s.name, s.name, 'mystery', econRumor);
      world.activeRumors.push(rumor);
      logs.push(logRumor(rumor, worldTime, world.seed));
    } else {
      maybeRumor(world, rng, s.name, logs, worldTime);
    }
    logs.push(...factionTownBeat(world, rng, s.name, worldTime));
    s.lastTownLogDay = day;
  }
  return logs;
}

export function chooseRumorGoal(world: WorldState, rng: Random, partyId: string): Rumor | null {
  if (!world.activeRumors.length) return null;
  // Weight toward fresher rumors
  const sorted = [...world.activeRumors].sort((a, b) => b.freshness - a.freshness);
  const choice = sorted[Math.min(sorted.length - 1, rng.int(sorted.length))];
  return choice;
}

