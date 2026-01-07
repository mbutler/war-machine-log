/**
 * DOMAIN MANAGEMENT SYSTEM (Companion Rules)
 * 
 * Handles taxation, population growth, unrest, and upkeep for strongholds.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Stronghold, Party, NPC } from './types.ts';
import { getPartyState, getSettlementState } from './causality.ts';

export function tickDomains(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Domains tick weekly or monthly in BECMI, we'll check daily and apply monthly logic
  const dayOfMonth = worldTime.getUTCDate();
  if (dayOfMonth !== 1) return logs; // Only process on the 1st of the month

  for (const stronghold of world.strongholds) {
    if (!stronghold.constructionFinished) continue;

    // 1. TAXATION
    // Standard BECMI: 10gp per family per year, or 1gp per family per month
    const taxIncome = Math.floor(stronghold.population * (stronghold.taxRate / 10));
    stronghold.treasury += taxIncome;
    
    // 2. UPKEEP
    // Troops, staff, and maintenance
    const upkeep = stronghold.staff * 2 + Math.floor(stronghold.population / 10);
    stronghold.treasury = Math.max(0, stronghold.treasury - upkeep);
    
    // 3. UNREST
    // High taxes or low treasury increase unrest
    if (stronghold.taxRate > 15) stronghold.unrest += 1;
    if (stronghold.treasury === 0) stronghold.unrest += 2;
    if (stronghold.unrest > 0 && rng.chance(0.2)) stronghold.unrest -= 1; // Natural settling
    
    // 4. POPULATION GROWTH
    // Safe, prosperous domains attract settlers
    if (stronghold.unrest < 3 && stronghold.treasury > upkeep * 2) {
      const growth = 1 + rng.int(Math.floor(stronghold.population * 0.05) + 1);
      stronghold.population += growth;
      
      logs.push({
        category: 'town',
        summary: `Settlers arrive at ${stronghold.name}`,
        details: `Drawn by the promise of safety and fair rule, ${growth} new families have taken up residence in the domain.`,
        location: `hex:${stronghold.location.q},${stronghold.location.r}`,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }

    logs.push({
      category: 'faction',
      summary: `Monthly report for ${stronghold.name}`,
      details: `Tax collection: ${taxIncome}gp. Upkeep: ${upkeep}gp. Current Treasury: ${stronghold.treasury}gp. Population: ${stronghold.population} families.`,
      location: `hex:${stronghold.location.q},${stronghold.location.r}`,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });

    // Handle high unrest
    if (stronghold.unrest >= 8) {
      logs.push({
        category: 'faction',
        summary: `Uprising in ${stronghold.name}!`,
        details: `The peasantry has reached a breaking point. Angry mobs gather at the gates of the ${stronghold.type}.`,
        location: `hex:${stronghold.location.q},${stronghold.location.r}`,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      // Further consequences handled by causality engine
    }
  }

  return logs;
}

export function createInitialStrongholdState(
  rng: Random,
  npcId: string,
  name: string,
  location: { q: number; r: number },
  type: 'Tower' | 'Keep' | 'Temple' | 'Hideout'
): Stronghold {
  return {
    id: rng.uid(`stronghold-${npcId}`),
    ownerId: npcId,
    name: name,
    location: location,
    type: type,
    level: 1,
    staff: 5 + rng.int(10),
    constructionFinished: false,
    treasury: 1000 + rng.int(2000),
    unrest: 0,
    population: 50 + rng.int(100), // Families
    taxRate: 10, // 10% standard
  };
}

