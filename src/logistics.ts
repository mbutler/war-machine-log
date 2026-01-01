/**
 * LOGISTICS & DISEASE SYSTEM
 * 
 * Handles mercenary contracts, troop maintenance, and the spread of disease.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Army, Settlement, MercenaryCompany } from './types.ts';
import { getSettlementState, getFactionState } from './causality.ts';

/**
 * Tick for disease spread and effects.
 */
export function tickDisease(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  // 1. SETTLEMENT DISEASE
  for (const settlement of world.settlements) {
    const sState = getSettlementState(world, settlement.name);
    
    // Spontaneous outbreak (rare, more likely if prosperity is low)
    if (!sState.disease && rng.chance(0.001 - (sState.prosperity / 10000))) {
      sState.disease = {
        type: rng.pick(['Camp Fever', 'The Red Ache', 'Gripsha', 'Yellow Plague']),
        intensity: 2 + rng.int(3),
        spreadRate: 0.1 + rng.next() * 0.2,
        discovered: false,
      };
    }

    if (sState.disease) {
      const d = sState.disease;
      
      // Discovery
      if (!d.discovered && rng.chance(0.1)) {
        d.discovered = true;
        logs.push({
          category: 'town',
          summary: `Disease outbreak in ${settlement.name}!`,
          details: `Local healers have identified ${d.type} among the populace. Fear spreads as quickly as the sickness.`,
          location: settlement.name,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        sState.safety -= 2;
        sState.unrest += 1;
      }

      // Progression
      if (rng.chance(0.1)) {
        d.intensity += (rng.next() > 0.6 ? 1 : -1);
        if (d.intensity <= 0) {
          logs.push({
            category: 'town',
            summary: `${d.type} fades in ${settlement.name}`,
            details: `The worst of the sickness has passed. The bells ring in celebration.`,
            location: settlement.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          sState.disease = undefined;
          continue;
        }
      }

      // Spread to nearby armies
      const armiesHere = world.armies.filter(a => a.location === settlement.name);
      for (const army of armiesHere) {
        if (army.status !== 'diseased' && rng.chance(d.spreadRate)) {
          army.status = 'diseased';
          if (d.discovered) {
            logs.push({
              category: 'faction',
              summary: `${army.ownerId}'s forces infected with ${d.type}`,
              details: `While stationed at ${settlement.name}, the troops have fallen ill.`,
              location: settlement.name,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }

      // Spread to traveling parties in this settlement
      const partiesHere = world.parties.filter(p => p.location === settlement.name);
      for (const party of partiesHere) {
        if (!party.wounded && rng.chance(d.spreadRate / 2)) {
          party.wounded = true; // Use wounded as a proxy for 'infected' for now
          party.restHoursRemaining = 48;
          if (d.discovered) {
            logs.push({
              category: 'road',
              summary: `${party.name} falls ill in ${settlement.name}`,
              details: `The ${d.type} has claimed members of the company. They must rest to recover.`,
              location: settlement.name,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
    }
  }

  // 2. SPREAD VIA TRAVELERS (Caravans and Armies)
  // Diseased armies spread it to their current location
  for (const army of world.armies) {
    if (army.status === 'diseased') {
      const sState = getSettlementState(world, army.location);
      if (sState && !sState.disease && rng.chance(0.1)) {
        sState.disease = {
          type: 'Camp Fever', // Armies usually carry this
          intensity: 3,
          spreadRate: 0.15,
          discovered: false,
        };
      }
    }
  }

  // Spread via Caravans
  for (const caravan of world.caravans) {
    const fromState = getSettlementState(world, caravan.location);
    if (fromState.disease && rng.chance(fromState.disease.spreadRate)) {
      // Caravan is now carrying the disease to its destination
      const toSettlement = world.settlements.find(s => 
        (caravan.route[0] === caravan.location ? caravan.route[1] : caravan.route[0]) === s.id
      );
      if (toSettlement) {
        const toState = getSettlementState(world, toSettlement.name);
        if (!toState.disease && rng.chance(0.3)) {
          toState.disease = { ...fromState.disease, discovered: false, intensity: 1 };
        }
      }
    }
  }

  // 3. ARMY DISEASE EFFECTS
  for (const army of world.armies) {
    if (army.status === 'diseased') {
      // Disease kills troops and breaks morale
      const deaths = Math.floor(army.strength * 0.01);
      army.strength -= deaths;
      army.morale = Math.max(2, army.morale - 0.1);
      
      if (rng.chance(0.05)) {
        logs.push({
          category: 'faction',
          summary: `Sickness ravages ${army.ownerId}'s army`,
          details: `Fever spreads through the camp. ${deaths} soldiers are unfit for duty or dead.`,
          location: army.location,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }

      // Recovery
      if (rng.chance(0.05)) {
        army.status = 'idle';
      }
    }
  }

  return logs;
}

/**
 * Handles mercenary hiring and contract renewals.
 */
export function tickMercenaries(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  // Mercenaries move between settlements looking for work
  for (const merc of world.mercenaries) {
    if (!merc.hiredById && rng.chance(0.02)) {
      const nextSettlement = rng.pick(world.settlements);
      merc.location = nextSettlement.name;
    }

    // Factions with high wealth but low power hire mercenaries
    if (!merc.hiredById) {
      for (const faction of world.factions) {
        const fState = getFactionState(world, faction.id);
        if (faction.wealth > merc.monthlyRate * 3 && fState.power < 40 && rng.chance(0.05)) {
          merc.hiredById = faction.id;
          faction.wealth -= merc.monthlyRate;
          
          // Spawn the mercenary army
          const army: Army = {
            id: `army-merc-${merc.id}`,
            ownerId: faction.id,
            location: merc.location,
            strength: merc.size,
            quality: merc.quality,
            morale: merc.loyalty,
            status: 'idle',
            supplies: 100,
            supplyLineFrom: merc.location,
            lastSupplied: worldTime,
            isMercenary: true,
            costPerMonth: merc.monthlyRate,
          };
          world.armies.push(army);

          logs.push({
            category: 'faction',
            summary: `${faction.name} hires ${merc.name}`,
            details: `The mercenary company has signed a contract for ${merc.monthlyRate}gp per month. Their spears are now at the faction's disposal.`,
            location: merc.location,
            actors: [faction.name, merc.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          break;
        }
      }
    }
  }

  return logs;
}

