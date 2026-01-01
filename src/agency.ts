/**
 * NPC & PARTY AGENCY SYSTEM
 * 
 * Makes NPCs and parties act intelligently based on world state.
 * NPCs act on their memories, agendas, and relationships.
 * Parties pursue their quests and vendettas.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Faction, Settlement } from './types.ts';
import { 
  ReactiveNPC, 
  PartyState, 
  getPartyState, 
  getSettlementState, 
  getFactionState,
  processWorldEvent,
  WorldEvent,
} from './causality.ts';
import { Antagonist } from './antagonists.ts';
import { StoryThread } from './stories.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';

// ============================================================================
// NPC AGENCY - NPCs act on memories and agendas
// ============================================================================

export function tickNPCAgency(
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const npc of world.npcs) {
    if (npc.alive === false) continue;
    
    const reactiveNpc = npc as ReactiveNPC;
    if (!reactiveNpc.agendas || reactiveNpc.agendas.length === 0) continue;
    
    // Only act occasionally
    if (!rng.chance(0.05)) continue;
    
    // Act on highest priority agenda
    const agenda = reactiveNpc.agendas.sort((a, b) => b.priority - a.priority)[0];
    const actionLogs = executeNPCAgenda(reactiveNpc, agenda, world, rng, worldTime, antagonists, storyThreads);
    logs.push(...actionLogs);
  }

  // Decay memory intensity over time
  for (const npc of world.npcs) {
    const reactiveNpc = npc as ReactiveNPC;
    if (reactiveNpc.memories) {
      for (const memory of reactiveNpc.memories) {
        if (memory.intensity > 1) {
          memory.intensity -= 0.01; // Slow decay
        }
      }
      // Remove faded memories
      reactiveNpc.memories = reactiveNpc.memories.filter(m => m.intensity >= 1);
    }
  }

  return logs;
}

function executeNPCAgenda(
  npc: ReactiveNPC,
  agenda: { type: string; target?: string; priority: number; progress: number; description: string },
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];

  switch (agenda.type) {
    case 'revenge': {
      if (!agenda.target) break;
      
      // Is target nearby?
      const targetNpc = world.npcs.find(n => n.name === agenda.target);
      const targetParty = world.parties.find(p => p.name === agenda.target);
      const targetAntagonist = antagonists.find(a => a.name === agenda.target);
      
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        // Confrontation!
        if (rng.chance(0.3)) {
          const success = rng.chance(0.4);
          if (success) {
            targetNpc.alive = false;
            agenda.progress = 100;
            
            // Process death event
            const deathEvent: WorldEvent = {
              id: `npc-revenge-${Date.now()}`,
              type: 'assassination',
              timestamp: worldTime,
              location: npc.location,
              actors: [npc.name],
              victims: [targetNpc.name],
              perpetrators: [npc.name],
              magnitude: 6,
              witnessed: rng.chance(0.5),
              data: { cause: 'revenge' },
            };
            logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
            
            logs.push({
              category: 'town',
              summary: `${npc.name} exacts revenge on ${targetNpc.name}`,
              details: `The ${npc.role} finally settles the score. ${targetNpc.name} lies dead.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          } else {
            // Failed attempt
            logs.push({
              category: 'town',
              summary: `${npc.name} confronts ${targetNpc.name}`,
              details: `Harsh words are exchanged. The ${npc.role}'s vengeance must wait.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
            agenda.progress += 10;
          }
        }
      } else if (!targetNpc && !targetParty && !targetAntagonist) {
        // Target might be gone/dead
        agenda.priority -= 1;
        if (agenda.priority <= 0) {
          // Give up
          logs.push({
            category: 'town',
            summary: `${npc.name} abandons their vendetta`,
            details: `The ${npc.role} can no longer find ${agenda.target}. The grudge fades.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          npc.agendas = npc.agendas?.filter(a => a !== agenda);
        }
      } else {
        // Target exists but not here - might travel to find them
        if (rng.chance(0.1)) {
          let targetLocation = targetNpc?.location ?? targetParty?.location;
          if (targetLocation && targetLocation !== npc.location) {
            logs.push({
              category: 'road',
              summary: `${npc.name} sets out hunting ${agenda.target}`,
              details: `The ${npc.role} leaves ${npc.location}, seeking their prey.`,
              location: npc.location,
              actors: [npc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
            // Update location after a delay
            queueConsequence({
              type: 'spawn-event',
              triggerEvent: `${npc.name}'s hunt`,
              turnsUntilResolution: 12 + rng.int(24),
              data: {
                category: 'town',
                summary: `${npc.name} arrives in ${targetLocation}`,
                details: `The hunter draws closer to their quarry.`,
                location: targetLocation,
                actors: [npc.name],
              },
              priority: 3,
            });
            agenda.progress += 20;
          }
        }
      }
      break;
    }
    
    case 'ambition': {
      // NPC seeks power/influence
      const settlement = world.settlements.find(s => s.name === npc.location);
      if (settlement) {
        const state = getSettlementState(world, settlement.name);
        
        // If no ruler, might try to take control
        if (!state.rulerNpcId && npc.fame && npc.fame >= 5) {
          if (rng.chance(0.2)) {
            state.rulerNpcId = npc.id;
            agenda.progress = 100;
            
            logs.push({
              category: 'town',
              summary: `${npc.name} claims leadership of ${settlement.name}`,
              details: `Through cunning and reputation, the ${npc.role} rises to power.`,
              location: settlement.name,
              actors: [npc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        } else {
          // Build fame
          npc.fame = (npc.fame ?? 0) + 1;
          agenda.progress += 10;
        }
      }
      break;
    }
    
    case 'protection': {
      // NPC seeks to protect someone/somewhere
      if (agenda.target) {
        const faction = world.factions.find(f => f.focus === 'martial');
        if (faction && rng.chance(0.3)) {
          const reactiveNpc = npc as ReactiveNPC;
          reactiveNpc.loyalty = faction.id;
          agenda.progress += 30;
          
          logs.push({
            category: 'faction',
            summary: `${npc.name} joins ${faction.name}`,
            details: `Seeking protection for ${agenda.target}, the ${npc.role} takes up arms with the faction.`,
            location: npc.location,
            actors: [npc.name, faction.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
      break;
    }
    
    case 'greed': {
      // NPC pursues wealth
      const settlement = world.settlements.find(s => s.name === npc.location);
      if (settlement) {
        // Might steal, trade, or exploit
        if (rng.chance(0.1)) {
          const state = getSettlementState(world, settlement.name);
          if (rng.chance(0.3)) {
            // Theft
            state.unrest = Math.min(10, (state.unrest ?? 0) + 1);
            npc.reputation = Math.max(-3, npc.reputation - 1);
            agenda.progress += 20;
            
            logs.push({
              category: 'town',
              summary: `Theft reported in ${settlement.name}`,
              details: `Suspicion falls on certain individuals. The ${npc.role} ${npc.name} is among them.`,
              location: settlement.name,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
      break;
    }
  }

  return logs;
}

// ============================================================================
// PARTY AGENCY - Parties pursue quests and vendettas
// ============================================================================

export function tickPartyAgency(
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const party of world.parties) {
    if (party.status !== 'idle') continue;
    if (party.restHoursRemaining && party.restHoursRemaining > 0) continue;
    
    const state = getPartyState(world, party.id);
    
    // Check for vendetta pursuit
    if (state.vendetta) {
      const target = findTarget(state.vendetta, world, antagonists);
      if (target) {
        const targetLocation = target.location;
        if (targetLocation && targetLocation !== party.location) {
          // Travel to hunt
          if (!party.goal || party.goal.target !== targetLocation) {
            party.goal = { kind: 'travel-to', target: targetLocation };
            
            logs.push({
              category: 'road',
              summary: `${party.name} tracks ${state.vendetta}`,
              details: `Their quarry was last seen near ${targetLocation}. The hunt continues.`,
              location: party.location,
              actors: [party.name, state.vendetta],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        } else if (targetLocation === party.location) {
          // Confrontation!
          logs.push(...resolvePartyConfrontation(party, state, target, world, rng, worldTime, antagonists, storyThreads));
        }
      } else {
        // Target not found - might be dead
        if (state.killList?.includes(state.vendetta)) {
          logs.push({
            category: 'town',
            summary: `${party.name} celebrates their victory`,
            details: `${state.vendetta} is no more. The vendetta is complete.`,
            location: party.location,
            actors: [party.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          state.vendetta = undefined;
        }
      }
    }
    
    // Check quest progress
    if (state.questLog?.length > 0) {
      const quest = state.questLog[0]; // Focus on first quest
      
      if (quest.type === 'hunt') {
        const target = findTarget(quest.target, world, antagonists);
        if (target) {
          if (target.location === party.location) {
            // At the target location - engage!
            if (rng.chance(0.3)) {
              const success = rng.chance(0.5 + (party.fame ?? 0) * 0.05);
              if (success) {
                quest.progress = 100;
                state.killList = [...(state.killList ?? []), quest.target];
                party.fame = (party.fame ?? 0) + 3;
                
                // Kill the target
                if ('alive' in target) {
                  (target as any).alive = false;
                }
                
                logs.push({
                  category: 'road',
                  summary: `${party.name} slays ${quest.target}!`,
                  details: `The quest is complete. ${quest.reason} - fulfilled at last.`,
                  location: party.location,
                  actors: [party.name, quest.target],
                  worldTime,
                  realTime: new Date(),
                  seed: world.seed,
                });
                
                // Process as death event
                const deathEvent: WorldEvent = {
                  id: `quest-kill-${Date.now()}`,
                  type: 'death',
                  timestamp: worldTime,
                  location: party.location,
                  actors: [party.name],
                  victims: [quest.target],
                  perpetrators: [party.name],
                  magnitude: 7,
                  witnessed: true,
                  data: { cause: 'quest completion', killedBy: party.name },
                };
                logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
                
                // Remove completed quest
                state.questLog = state.questLog.filter(q => q.id !== quest.id);
              } else {
                // Failed engagement - retreat
                party.wounded = true;
                party.restHoursRemaining = 12 + rng.int(12);
                state.morale = Math.max(-10, (state.morale ?? 0) - 2);
                quest.progress = Math.max(0, quest.progress - 10);
                
                logs.push({
                  category: 'road',
                  summary: `${party.name} driven back by ${quest.target}`,
                  details: `The foe proves too strong. They retreat to lick their wounds.`,
                  location: party.location,
                  actors: [party.name, quest.target],
                  worldTime,
                  realTime: new Date(),
                  seed: world.seed,
                });
              }
            }
          } else if (target.location) {
            // Need to travel
            party.goal = { kind: 'travel-to', target: target.location };
          }
        }
      }
    }
    
    // React to nearby threats
    const nearbyAntagonists = antagonists.filter(a => 
      a.alive && a.territory === party.location
    );
    
    if (nearbyAntagonists.length > 0 && !state.vendetta && !party.goal) {
      const threat = rng.pick(nearbyAntagonists);
      
      // Decide: fight, flee, or ignore?
      const partyStrength = (party.fame ?? 0) + (state.morale ?? 0) / 2;
      
      if (partyStrength >= threat.threat) {
        // Confident enough to fight
        state.vendetta = threat.name;
        state.questLog = state.questLog ?? [];
        state.questLog.push({
          id: `quest-${Date.now()}`,
          type: 'hunt',
          target: threat.name,
          reason: `End the threat of ${threat.name} ${threat.epithet}`,
          progress: 0,
        });
        
        logs.push({
          category: 'road',
          summary: `${party.name} decides to confront ${threat.name}`,
          details: `${threat.name} ${threat.epithet}'s reign of terror must end. They prepare for battle.`,
          location: party.location,
          actors: [party.name, threat.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      } else if (partyStrength < threat.threat - 3) {
        // Too dangerous - flee
        const safeHavens = world.settlements.filter(s => 
          s.name !== party.location && 
          !antagonists.some(a => a.territory === s.name && a.alive)
        );
        
        if (safeHavens.length > 0) {
          const destination = rng.pick(safeHavens);
          party.goal = { kind: 'travel-to', target: destination.name };
          
          logs.push({
            category: 'road',
            summary: `${party.name} flees ${threat.name}'s territory`,
            details: `Discretion is the better part of valor. They make for ${destination.name}.`,
            location: party.location,
            actors: [party.name],
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

function findTarget(
  name: string,
  world: WorldState,
  antagonists: Antagonist[],
): { location?: string; alive?: boolean } | null {
  const npc = world.npcs.find(n => n.name === name);
  if (npc && npc.alive !== false) return { location: npc.location, alive: npc.alive };
  
  const party = world.parties.find(p => p.name === name);
  if (party) return { location: party.location, alive: true };
  
  const antagonist = antagonists.find(a => a.name === name);
  if (antagonist && antagonist.alive) return { location: antagonist.territory, alive: antagonist.alive };
  
  return null;
}

function resolvePartyConfrontation(
  party: Party,
  state: PartyState,
  target: { location?: string; alive?: boolean },
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  if (!state.vendetta) return logs;
  
  // This is a significant battle
  const partyStrength = (party.fame ?? 0) + (state.morale ?? 0) + rng.int(5);
  
  // Find the actual target
  const targetAntagonist = antagonists.find(a => a.name === state.vendetta);
  const targetNpc = world.npcs.find(n => n.name === state.vendetta);
  const targetParty = world.parties.find(p => p.name === state.vendetta);
  
  let targetStrength = 5;
  if (targetAntagonist) targetStrength = targetAntagonist.threat + rng.int(3);
  if (targetParty) targetStrength = (targetParty.fame ?? 0) + rng.int(5);
  
  const partyWins = partyStrength > targetStrength;
  
  // Create battle event
  const battleEvent: WorldEvent = {
    id: `battle-${Date.now()}`,
    type: 'battle',
    timestamp: worldTime,
    location: party.location,
    actors: [party.name, state.vendetta],
    magnitude: 6,
    witnessed: true,
    data: {
      victor: partyWins ? party.name : state.vendetta,
      loser: partyWins ? state.vendetta : party.name,
      significance: 4,
    },
  };
  logs.push(...processWorldEvent(battleEvent, world, rng, antagonists, storyThreads));
  
  if (partyWins) {
    // Victory!
    if (targetAntagonist) {
      targetAntagonist.alive = false;
      
      const deathEvent: WorldEvent = {
        id: `death-${Date.now()}`,
        type: 'death',
        timestamp: worldTime,
        location: party.location,
        actors: [party.name],
        victims: [targetAntagonist.name],
        perpetrators: [party.name],
        magnitude: 8,
        witnessed: true,
        data: { cause: 'vendetta', killedBy: party.name },
      };
      logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));
    }
    
    if (targetNpc) {
      targetNpc.alive = false;
    }
    
    state.killList = [...(state.killList ?? []), state.vendetta];
    state.vendetta = undefined;
    party.fame = (party.fame ?? 0) + 5;
    state.morale = Math.min(10, (state.morale ?? 0) + 3);
    
    logs.push({
      category: 'road',
      summary: `${party.name} triumphs over ${battleEvent.data.loser}!`,
      details: `A great victory. Their enemy lies defeated. Songs will be sung of this day.`,
      location: party.location,
      actors: [party.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  } else {
    // Defeat
    party.wounded = true;
    party.restHoursRemaining = 24 + rng.int(24);
    state.morale = Math.max(-10, (state.morale ?? 0) - 4);
    party.fame = Math.max(0, (party.fame ?? 0) - 2);
    
    // Might lose a member
    if (rng.chance(0.3) && party.members.length > 1) {
      const fallen = party.members.pop()!;
      
      logs.push({
        category: 'road',
        summary: `${fallen} falls in battle against ${state.vendetta}`,
        details: `A bitter loss. ${party.name} retreats, diminished.`,
        location: party.location,
        actors: [party.name, fallen],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    } else {
      logs.push({
        category: 'road',
        summary: `${party.name} is defeated by ${state.vendetta}`,
        details: `They flee, wounded but alive. The vendetta continues.`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// FACTION OPERATIONS - Factions execute strategic plans
// ============================================================================

export function tickFactionOperations(
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];

  for (const faction of world.factions) {
    const state = getFactionState(world, faction.id);
    
    // Check for active operations completing
    for (const op of state.activeOperations) {
      if (new Date(op.completesAt) <= worldTime) {
        logs.push(...resolveOperation(op, faction, state, world, rng, worldTime, antagonists, storyThreads));
      }
    }
    
    // Remove completed operations
    state.activeOperations = state.activeOperations.filter(op => 
      new Date(op.completesAt) > worldTime
    );
    
    // Factions at war might launch attacks
    if (state.enemies.length > 0 && state.activeOperations.length < 2) {
      if (rng.chance(0.05)) {
        const enemyId = rng.pick(state.enemies);
        const enemy = world.factions.find(f => f.id === enemyId);
        const enemyState = getFactionState(world, enemyId);
        
        if (enemy && enemyState.territory.length > 0) {
          const targetSettlement = rng.pick(enemyState.territory);
          
          // Launch raid
          const op = {
            id: `op-${Date.now()}`,
            type: 'raid' as const,
            target: targetSettlement,
            startedAt: worldTime,
            completesAt: new Date(worldTime.getTime() + (12 + rng.int(24)) * 60 * 60 * 1000),
            participants: [],
            successChance: 0.4 + state.power / 200,
          };
          state.activeOperations.push(op);
          
          logs.push({
            category: 'faction',
            summary: `${faction.name} marshals forces against ${enemy.name}`,
            details: `War continues. ${targetSettlement} is in their sights.`,
            location: targetSettlement,
            actors: [faction.name, enemy.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
    
    // Factions might expand into uncontrolled territory
    if (state.recentWins >= 3 && rng.chance(0.1)) {
      const uncontrolled = world.settlements.filter(s => {
        const sState = getSettlementState(world, s.name);
        return !sState.controlledBy && !sState.contested;
      });
      
      if (uncontrolled.length > 0) {
        const target = rng.pick(uncontrolled);
        const targetState = getSettlementState(world, target.name);
        targetState.contested = true;
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} moves on ${target.name}`,
          details: `Emboldened by success, they seek to expand their influence.`,
          location: target.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        // Queue conquest attempt
        queueConsequence({
          type: 'spawn-event',
          triggerEvent: `${faction.name} expansion`,
          turnsUntilResolution: 24 + rng.int(48),
          data: {
            category: 'faction',
            summary: `${faction.name} takes control of ${target.name}`,
            details: `Through diplomacy and shows of force, the settlement falls under their sway.`,
            location: target.name,
            actors: [faction.name],
          },
          priority: 4,
        });
        
        // Will complete later
        setTimeout(() => {
          if (!targetState.controlledBy) {
            targetState.controlledBy = faction.id;
            targetState.contested = false;
            state.territory.push(target.name);
          }
        }, 0);
        
        state.recentWins = 0;
      }
    }
  }

  return logs;
}

function resolveOperation(
  op: { id: string; type: string; target: string; successChance: number },
  faction: Faction,
  factionState: FactionDeepState,
  world: WorldState,
  rng: Random,
  worldTime: Date,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  const success = rng.chance(op.successChance);
  
  switch (op.type) {
    case 'raid': {
      const settlement = world.settlements.find(s => s.name === op.target);
      if (!settlement) break;
      
      if (success) {
        // Create raid event
        const raidEvent: WorldEvent = {
          id: `raid-${Date.now()}`,
          type: 'raid',
          timestamp: worldTime,
          location: op.target,
          actors: [faction.name],
          perpetrators: [faction.name],
          magnitude: 5,
          witnessed: true,
          data: {
            damage: 2 + rng.int(3),
            loot: ['gold', 'supplies'],
            casualties: rng.int(2),
          },
        };
        logs.push(...processWorldEvent(raidEvent, world, rng, antagonists, storyThreads));
        
        factionState.resources += 20;
        factionState.recentWins += 1;
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} raids ${op.target}`,
          details: `Swift and brutal, they strike and withdraw with plunder.`,
          location: op.target,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      } else {
        factionState.recentLosses += 1;
        factionState.power = Math.max(0, factionState.power - 5);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name}'s raid on ${op.target} fails`,
          details: `The defenders held strong. They retreat in disarray.`,
          location: op.target,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
      break;
    }
  }
  
  return logs;
}

// Import FactionDeepState for the function signature
import { FactionState as FactionDeepState } from './causality.ts';

