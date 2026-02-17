/**
 * DIPLOMACY & RANSOM SYSTEM
 * 
 * Handles peace treaties, prisoner ransoms, and the end of wars.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Army, NPC, Faction } from './types.ts';
import { getFactionState, getSettlementState, processWorldEvent } from './causality.ts';
import { queueConsequence } from './consequences.ts';

export function tickDiplomacy(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  // 1. RANSOM NEGOTIATIONS
  for (const army of world.armies) {
    if (army.capturedLeaders && army.capturedLeaders.length > 0) {
      for (const prisonerId of army.capturedLeaders) {
        if (rng.chance(0.05)) { // Chance to initiate ransom per hour
          const prisoner = world.npcs.find(n => n.id === prisonerId);
          if (!prisoner) continue;

          const captorFaction = world.factions.find(f => f.id === army.ownerId);
          const prisonerFaction = world.factions.find(f => f.id === (prisoner as any).loyalty);

          if (captorFaction && prisonerFaction) {
            const ransomAmount = (prisoner.level ?? 1) * 100;
            
            if (prisonerFaction.wealth >= ransomAmount) {
              // Faction pays the ransom
              prisonerFaction.wealth -= ransomAmount;
              captorFaction.wealth += ransomAmount;
              army.capturedLeaders = army.capturedLeaders.filter(id => id !== prisonerId);
              
              logs.push({
                category: 'faction',
                summary: `${prisoner.name} is ransomed`,
                details: `${prisonerFaction.name} has paid ${ransomAmount}gp to ${captorFaction.name} for the release of their leader.`,
                location: army.location,
                actors: [prisoner.name, captorFaction.name],
                worldTime,
                realTime: new Date(),
                seed: world.seed,
              });

              // Possible peace consequence
              if (rng.chance(0.3)) {
                queueConsequence({
                  type: 'spawn-event',
                  triggerEvent: `Ransom of ${prisoner.name}`,
                  turnsUntilResolution: 24 + rng.int(48),
                  data: {
                    category: 'faction',
                    summary: `Peace talks begin between ${captorFaction.name} and ${prisonerFaction.name}`,
                    details: `The return of ${prisoner.name} has opened a window for diplomacy.`,
                    actors: [captorFaction.name, prisonerFaction.name],
                  },
                  priority: 5,
                });
              }
            }
          }
        }
      }
    }
  }

  // 2. PEACE TREATIES (Rare spontaneous)
  for (const faction of world.factions) {
    const fState = getFactionState(world, faction.id);
    for (const enemyId of fState.enemies) {
      const enemyState = getFactionState(world, enemyId);
      
      // If both sides are exhausted or one is dominant
      if ((fState.recentLosses > 5 && enemyState.recentLosses > 5) || (fState.power > 80 && enemyState.power < 20)) {
        if (rng.chance(0.01)) {
          fState.enemies = fState.enemies.filter(id => id !== enemyId);
          enemyState.enemies = enemyState.enemies.filter(id => id !== faction.id);
          
          const enemy = world.factions.find(f => f.id === enemyId);
          logs.push({
            category: 'faction',
            summary: `Peace treaty signed: ${faction.name} and ${enemy?.name}`,
            details: `After long conflict, both sides have agreed to lay down their arms. The borders are recognized once more.`,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
  }

  return logs;
}

