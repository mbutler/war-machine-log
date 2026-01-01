/**
 * THE WAR MACHINE (Companion Rules)
 * 
 * Resolves large-scale battles between armies.
 * Calculates Combat Force (BR) and resolves outcomes with morale and casualties.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Army, Faction, NPC, Party, HexCoord } from './types.ts';
import { processWorldEvent, getSettlementState } from './causality.ts';

export interface BattleResult {
  winner: Army;
  loser: Army;
  winnerLosses: number;
  loserLosses: number;
  fatality: boolean; // Did a notable leader die?
}

/**
 * Calculate Battle Rating (BR) for an army.
 * Simplified BECMI logic: Strength + Quality + Morale bonuses.
 */
export function calculateBattleRating(army: Army, world: WorldState): number {
  let br = 0;
  
  // 1. Force Size
  br += Math.floor(army.strength / 10);
  
  // 2. Troop Quality
  br += army.quality * 10;
  
  // 3. Morale
  br += (army.morale - 7) * 5;
  
  // 4. Leadership bonus (if owner is a high level NPC)
  const ownerNpc = world.npcs.find(n => n.id === army.ownerId);
  if (ownerNpc && ownerNpc.level) {
    br += ownerNpc.level * 2;
  }
  
  return br;
}

export function resolveBattle(
  attacker: Army,
  defender: Army,
  world: WorldState,
  rng: Random,
  worldTime: Date
): { logs: LogEntry[], result: BattleResult } {
  const logs: LogEntry[] = [];
  
  const attackerBR = calculateBattleRating(attacker, world) + rng.int(20);
  const defenderBR = calculateBattleRating(defender, world) + rng.int(20);
  
  const diff = attackerBR - defenderBR;
  const attackerWins = diff > 0;
  
  const winner = attackerWins ? attacker : defender;
  const loser = attackerWins ? defender : attacker;
  
  // Casualties (BECMI style percentage)
  const loserLossesPct = 10 + rng.int(Math.abs(diff) / 2 + 10);
  const winnerLossesPct = rng.int(loserLossesPct / 2);
  
  const loserLossesCount = Math.floor(loser.strength * (loserLossesPct / 100));
  const winnerLossesCount = Math.floor(winner.strength * (winnerLossesPct / 100));
  
  loser.strength -= loserLossesCount;
  winner.strength -= winnerLossesCount;
  
  // Morale impact
  loser.morale = Math.max(2, loser.morale - 2);
  winner.morale = Math.min(12, winner.morale + 1);

  // Check for surrender
  if (loser.morale <= 3 && rng.chance(0.5)) {
    loser.status = 'surrendered';
    logs.push({
      category: 'faction',
      summary: `${loser.ownerId}'s forces surrender!`,
      details: `Facing total annihilation, the remaining troops throw down their arms.`,
      location: attacker.location,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });

    // Capture leader if any
    const ownerNpc = world.npcs.find(n => n.id === loser.ownerId);
    if (ownerNpc && rng.chance(0.8)) {
      if (!winner.capturedLeaders) winner.capturedLeaders = [];
      winner.capturedLeaders.push(ownerNpc.id);
      logs.push({
        category: 'faction',
        summary: `${ownerNpc.name} taken prisoner`,
        details: `The commander of the defeated forces is led away in chains.`,
        location: attacker.location,
        actors: [ownerNpc.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  const result: BattleResult = {
    winner,
    loser,
    winnerLosses: winnerLossesCount,
    loserLosses: loserLossesCount,
    fatality: rng.chance(0.05) // Chance for a leader to fall
  };

  logs.push({
    category: 'faction',
    summary: `Battle at ${attacker.location}`,
    details: `${winner.ownerId}'s forces triumph over ${loser.ownerId}! ${loser.ownerId} lost ${loserLossesCount} troops, while ${winner.ownerId} lost ${winnerLossesCount}.`,
    location: attacker.location,
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  });
  
  return { logs, result };
}

function tickSupplies(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const army of world.armies) {
    // Armies consume supplies every hour
    // A full army (100+) consumes ~1% per hour
    const consumption = 0.5 + (army.strength / 200);
    army.supplies = Math.max(0, army.supplies - consumption);

    // If supplies are low, try to resupply
    if (army.supplies < 80 && army.supplyLineFrom) {
      const isPathSafe = checkSupplyLineSafety(army, world, rng);
      
      if (isPathSafe) {
        // Resupply!
        // Distance penalty: it's harder to get full supplies far away
        const dist = 1; // Simplified for now, could use actual distance
        const resupplyAmount = Math.max(2, 10 - dist);
        army.supplies = Math.min(100, army.supplies + resupplyAmount);
        army.lastSupplied = worldTime;
        if (army.status === 'starving') army.status = 'idle';
      } else {
        // Supply line disrupted!
        if (rng.chance(0.1)) {
          logs.push({
            category: 'faction',
            summary: `Supply lines disrupted for ${army.ownerId}'s forces`,
            details: `The path to ${army.supplyLineFrom} is blocked or too dangerous. The troops are beginning to worry.`,
            location: army.location,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }

    // Handle starvation
    if (army.supplies <= 0) {
      army.status = 'starving';
      army.morale = Math.max(2, army.morale - 0.5);
      
      // Starvation kills troops
      const deaths = Math.floor(army.strength * 0.02);
      army.strength -= deaths;

      if (rng.chance(0.05)) {
        logs.push({
          category: 'faction',
          summary: `${army.ownerId}'s army is starving at ${army.location}`,
          details: `With no supplies reaching the camp, ${deaths} troops have perished or deserted. Morale is at a breaking point.`,
          location: army.location,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }

  return logs;
}

function checkSupplyLineSafety(army: Army, world: WorldState, rng: Random): boolean {
  if (!army.supplyLineFrom) return false;

  // 1. Distance check
  // (Simplified: if in the same location, it's always safe)
  if (army.location === army.supplyLineFrom) return true;

  // 2. Enemy presence check
  // Are there enemy armies between the army and its supply source?
  // For now, let's just check if there's an enemy army in the supply source settlement
  const enemyArmiesAtSource = world.armies.filter(a => 
    a.location === army.supplyLineFrom && 
    areEnemies(a.ownerId, army.ownerId, world)
  );

  if (enemyArmiesAtSource.length > 0) return false;

  // 3. Raids on the supply source
  const sState = getSettlementState(world, army.supplyLineFrom);
  if (sState && sState.unrest > 7) return false; // Riots block supplies

  return true;
}

export function tickArmies(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // 1. SUPPLY TICK
  logs.push(...tickSupplies(world, rng, worldTime));

  for (const army of world.armies) {
    if (army.status === 'marching' && army.target) {
      // Real-time marching: base it on actual hex distance
      const currentLoc = world.settlements.find(s => s.name === army.location);
      const targetLoc = world.settlements.find(s => s.name === army.target);
      
      // If we don't have settlement data (e.g. hex location), use a flat chance
      if (!currentLoc || !targetLoc) {
        if (rng.chance(0.1)) { // ~10 hours
          army.location = army.target;
          army.status = 'idle';
          army.target = undefined;
          // ... rest of log logic ...
        }
      } else {
        // We could track distance, but for now let's just make it slower
        // Real-time: ~2-3 days (48-72 hours) to march between settlements
        if (rng.chance(0.015)) { 
          army.location = army.target;
          army.status = 'idle';
          army.target = undefined;
          
          logs.push({
            category: 'faction',
            summary: `Army arrives at ${army.location}`,
            details: `The forces of ${army.ownerId} have completed their march.`,
            location: army.location,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
  }
  
  // Check for battles (armies in same location belonging to enemies)
  const locations = new Set(world.armies.map(a => a.location));
  for (const loc of locations) {
    const armiesHere = world.armies.filter(a => a.location === loc && a.strength > 0);
    if (armiesHere.length >= 2) {
      // Check if they are enemies
      for (let i = 0; i < armiesHere.length; i++) {
        for (let j = i + 1; j < armiesHere.length; j++) {
          const a1 = armiesHere[i];
          const a2 = armiesHere[j];
          
          if (areEnemies(a1.ownerId, a2.ownerId, world)) {
            const { logs: battleLogs } = resolveBattle(a1, a2, world, rng, worldTime);
            logs.push(...battleLogs);
          }
        }
      }
    }
  }
  
  // Remove destroyed armies
  world.armies = world.armies.filter(a => a.strength > 0);
  
  return logs;
}

function areEnemies(id1: string, id2: string, world: WorldState): boolean {
  if (id1 === id2) return false;

  // 1. Check factions
  const f1 = world.factions.find(f => f.id === id1 || f.name === id1);
  const f2 = world.factions.find(f => f.id === id2 || f.name === id2);
  
  if (f1 && f2) {
    if (world.factionStates?.[f1.id]?.enemies.includes(f2.id)) return true;
    if (world.factionStates?.[f2.id]?.enemies.includes(f1.id)) return true;
  }

  // 2. Check parties vs factions
  const p1 = world.parties.find(p => p.id === id1 || p.name === id1);
  const p2 = world.parties.find(p => p.id === id2 || p.name === id2);

  if (p1 && f2) {
    if (world.partyStates?.[p1.id]?.enemies.includes(f2.id)) return true;
  }
  if (p2 && f1) {
    if (world.partyStates?.[p2.id]?.enemies.includes(f1.id)) return true;
  }

  // 3. Check NPCs vs each other or factions
  const n1 = world.npcs.find(n => n.id === id1 || n.name === id1);
  const n2 = world.npcs.find(n => n.id === id2 || n.name === id2);

  if (n1 && n2) {
    // Check if they are in each other's vendettas/enemies list
    const n1Agendas = (n1 as any).agendas || [];
    if (n1Agendas.some((a: any) => a.type === 'revenge' && a.target === n2.name)) return true;
  }

  return false;
}

