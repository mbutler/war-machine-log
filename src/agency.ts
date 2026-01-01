/**
 * NPC & PARTY AGENCY SYSTEM
 * 
 * Makes NPCs and parties act intelligently based on world state.
 * NPCs act on their memories, agendas, and relationships.
 * Parties pursue their quests and vendettas.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Faction, Settlement, FactionOperation, FactionOperationType } from './types.ts';
import { 
  ReactiveNPC, 
  PartyState, 
  getPartyState, 
  getSettlementState, 
  getFactionState,
  processWorldEvent,
  WorldEvent,
  NPCMemory,
  MemoryCategory,
} from './causality.ts';
import { Antagonist } from './antagonists.ts';
import { StoryThread } from './stories.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';

// ============================================================================
// NEXUS & RESOURCE UPDATES - Power sources generate wealth and conflict
// ============================================================================

export function tickNexuses(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const nexus of world.nexuses) {
    if (nexus.currentOwnerId) {
      // Owner gets wealth and power
      const faction = world.factions.find(f => f.id === nexus.currentOwnerId);
      const npc = world.npcs.find(n => n.id === nexus.currentOwnerId);
      
      if (faction) {
        faction.wealth += nexus.intensity;
        const state = getFactionState(world, faction.id);
        state.power = Math.min(100, state.power + 1);
      } else if (npc) {
        const stronghold = world.strongholds.find(s => s.ownerId === npc.id);
        if (stronghold) stronghold.treasury += nexus.intensity * 2;
      }
    } else {
      // Unclaimed nexuses attract greed
      if (rng.chance(0.01)) {
        for (const faction of world.factions) {
          const state = getFactionState(world, faction.id);
          if (state.power >= 60 && !state.activeOperations.some(op => op.target === nexus.name)) {
            // Faction wants the nexus!
            state.activeOperations.push({
              id: `op-nexus-${Date.now()}`,
              type: 'expansion',
              target: nexus.name,
              startedAt: worldTime,
              completesAt: new Date(worldTime.getTime() + 48 * 60 * 60 * 1000),
              participants: [],
              successChance: 0.5,
              resources: 100,
              secret: false,
              reason: `Claim the ${nexus.powerType} nexus ${nexus.name}`,
            });
            
            logs.push({
              category: 'faction',
              summary: `${faction.name} moves to claim ${nexus.name}`,
              details: `The ${nexus.powerType} energy of the nexus has drawn their attention. An expedition is sent.`,
              location: `hex:${nexus.location.q},${nexus.location.r}`,
              actors: [faction.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
    }
  }

  // Monthly resource needs update
  if (worldTime.getUTCDate() === 1) {
    const allGoods: Good[] = ['grain', 'timber', 'ore', 'textiles', 'salt', 'fish', 'livestock'];
    for (const faction of world.factions) {
      const state = getFactionState(world, faction.id);
      if (rng.chance(0.3)) {
        const needed = rng.pick(allGoods);
        if (!state.resourceNeeds.includes(needed)) {
          state.resourceNeeds.push(needed);
          logs.push({
            category: 'faction',
            summary: `${faction.name} declares a shortage of ${needed}`,
            details: `Their stockpiles are low. They will seek ${needed} by any means necessary.`,
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

// ============================================================================
// ARMY RAISING - Factions and Lords gather troops
// ============================================================================

export function tickArmyRaising(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Factions raise armies if they have wealth and low army count
  for (const faction of world.factions) {
    const fState = getFactionState(world, faction.id);
    const armyCount = world.armies.filter(a => a.ownerId === faction.id).length;
    
    if (faction.wealth >= 200 && armyCount < 2 && rng.chance(0.1)) {
      const location = fState.territory.length > 0 ? rng.pick(fState.territory) : world.settlements[0].name;
      
      const newArmy: Army = {
        id: `army-${faction.id}-${Date.now()}`,
        ownerId: faction.id,
        location: location,
        strength: 50 + rng.int(100),
        quality: 1 + rng.int(3),
        morale: 7 + rng.int(3),
        status: 'idle',
        supplies: 100,
        supplyLineFrom: location,
        lastSupplied: worldTime,
      };
      
      world.armies.push(newArmy);
      faction.wealth -= 200;
      
      logs.push({
        category: 'faction',
        summary: `${faction.name} raises an army in ${location}`,
        details: `Standard-bearers and mercenaries flock to their banners. A force of ${newArmy.strength} troops is ready for war.`,
        location: location,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  // High level lords with strongholds raise personal guards
  for (const stronghold of world.strongholds) {
    if (!stronghold.constructionFinished) continue;
    
    const ownerArmy = world.armies.find(a => a.ownerId === stronghold.ownerId);
    if (!ownerArmy && stronghold.treasury >= 500 && rng.chance(0.05)) {
      const owner = world.npcs.find(n => n.id === stronghold.ownerId) || world.parties.find(p => p.id === stronghold.ownerId);
      if (!owner) continue;

      const location = world.settlements.find(s => s.coord.q === stronghold.location.q && s.coord.r === stronghold.location.r)?.name || `hex:${stronghold.location.q},${stronghold.location.r}`;
      const newArmy: Army = {
        id: `army-${stronghold.ownerId}-${Date.now()}`,
        ownerId: stronghold.ownerId,
        location,
        strength: 20 + rng.int(40),
        quality: 3 + rng.int(4),
        morale: 9 + rng.int(2),
        status: 'idle',
        supplies: 100,
        supplyLineFrom: location,
        lastSupplied: worldTime,
      };
      
      world.armies.push(newArmy);
      stronghold.treasury -= 500;
      
      logs.push({
        category: 'faction',
        summary: `${owner.name} musters a personal guard`,
        details: `Elite warriors are hired to defend ${stronghold.name}.`,
        location: newArmy.location,
        actors: [owner.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// LEVEL UPS - Characters grow in power over time
// ============================================================================

export function tickLevelUps(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const party of world.parties) {
    // Simplified BECMI XP logic: approx 2000 XP per level
    const xpPerLevel = 2000;
    const currentAvgLevel = Math.floor(party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length);
    const targetXp = currentAvgLevel * xpPerLevel;
    
    if (party.xp >= targetXp && currentAvgLevel < 36) {
      // Level up everyone!
      for (const member of party.members) {
        member.level += 1;
        member.maxHp += 1 + rng.int(8);
        member.hp = member.maxHp;
      }
      
      logs.push({
        category: 'road',
        summary: `${party.name} grows in power!`,
        details: `Through hardship and battle, the members of ${party.name} have reached level ${party.members[0].level}.`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Check if they should build a stronghold
      if (party.members[0].level === 9) {
        const state = getPartyState(world, party.id);
        if (!state.questLog.some(q => q.type === 'stronghold')) {
          state.questLog.push({
            id: `quest-stronghold-${Date.now()}`,
            type: 'stronghold',
            target: party.location,
            reason: 'Establish a permanent seat of power at name level',
            progress: 0,
          });
        }
      }
    }
  }
  
  return logs;
}

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
    
    // === AGENDA-BASED ACTIONS ===
    if (reactiveNpc.agendas && reactiveNpc.agendas.length > 0 && rng.chance(0.05)) {
      // Act on highest priority agenda
      const agenda = reactiveNpc.agendas.sort((a, b) => b.priority - a.priority)[0];
      const actionLogs = executeNPCAgenda(reactiveNpc, agenda, world, rng, worldTime, antagonists, storyThreads);
      logs.push(...actionLogs);
    }
    
    // === MEMORY SURFACING - NPCs reference their past ===
    if (reactiveNpc.memories && reactiveNpc.memories.length > 0 && rng.chance(0.02)) {
      // Pick an unacted memory with high intensity
      const significantMemories = reactiveNpc.memories.filter(m => !m.acted && m.intensity >= 5);
      if (significantMemories.length > 0) {
        const memory = rng.pick(significantMemories);
        const memoryLog = generateMemoryNarrative(reactiveNpc, memory, world, rng, worldTime);
        if (memoryLog) {
          logs.push(memoryLog);
          memory.acted = true;
        }
      }
    }
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

// Generate narrative log from NPC memory
function generateMemoryNarrative(
  npc: ReactiveNPC,
  memory: NPCMemory,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry | null {
  // Memory narratives by category
  const MEMORY_SURFACES: Partial<Record<MemoryCategory, { summaries: string[]; details: string[] }>> = {
    'was-betrayed': {
      summaries: [
        `${npc.name} speaks bitterly of ${memory.target ?? 'old treachery'}`,
        `${npc.name}'s eyes darken at mention of ${memory.target ?? 'the past'}`,
        `${npc.name} mutters about trust and betrayal`,
        `${npc.name} recalls the day ${memory.target ?? 'someone'} turned on them`,
      ],
      details: [
        'The wound has not healed. Perhaps it never will.',
        'Some betrayals cannot be forgiven, only avenged.',
        'The memory poisons every interaction.',
        'They trusted once. They will not make that mistake again.',
      ],
    },
    'lost-loved-one': {
      summaries: [
        `${npc.name} visits the grave of ${memory.target ?? 'the fallen'}`,
        `${npc.name} grows quiet when ${memory.target ?? 'the dead'} is mentioned`,
        `${npc.name} lights a candle in memory of ${memory.target ?? 'the departed'}`,
        `${npc.name} speaks of ${memory.target ?? 'those gone'} with wet eyes`,
      ],
      details: [
        'Grief does not fade; it only changes shape.',
        'The living must carry the dead with them.',
        'Some absences echo forever.',
        'They would give anything for one more conversation.',
      ],
    },
    'was-saved': {
      summaries: [
        `${npc.name} speaks warmly of ${memory.target ?? 'a savior'}`,
        `${npc.name} mentions the debt owed to ${memory.target ?? 'their rescuer'}`,
        `${npc.name} offers a toast to ${memory.target ?? 'absent friends'}`,
        `${npc.name} credits ${memory.target ?? 'another'} with their survival`,
      ],
      details: [
        'Some debts can never be repaid, only honored.',
        'Gratitude runs deeper than gold.',
        'They would die for the one who saved them.',
        'Every day since has been a gift.',
      ],
    },
    'was-attacked': {
      summaries: [
        `${npc.name} tenses at mention of ${memory.target ?? 'the attack'}`,
        `${npc.name} fingers an old scar thoughtfully`,
        `${npc.name} speaks of ${memory.target ?? 'violence past'} with cold fury`,
        `${npc.name} recalls the assault by ${memory.target ?? 'enemies'}`,
      ],
      details: [
        'The body heals. The fear lingers.',
        'They will be ready next time.',
        'Violence begets violence, they know.',
        'The memory surfaces in every shadow.',
      ],
    },
    'committed-violence': {
      summaries: [
        `${npc.name} stares at their hands, lost in thought`,
        `${npc.name} flinches at reminders of ${memory.target ?? 'past violence'}`,
        `${npc.name} drinks to forget ${memory.target ?? 'what they did'}`,
        `${npc.name} is haunted by what happened with ${memory.target ?? 'the fallen'}`,
      ],
      details: [
        'The weight of killing never lightens.',
        'Blood washes off hands, not conscience.',
        'They did what they had to do. They repeat it like a prayer.',
        'Some nights, the faces come back.',
      ],
    },
    'fell-in-love': {
      summaries: [
        `${npc.name} watches ${memory.target ?? 'someone'} from across the room`,
        `${npc.name} sighs at mention of ${memory.target ?? 'their beloved'}`,
        `${npc.name} finds excuses to be near ${memory.target ?? 'the one they love'}`,
        `${npc.name} blushes when ${memory.target ?? 'a certain name'} is spoken`,
      ],
      details: [
        'Love makes fools of the wise and cowards of the brave.',
        'Every glance speaks volumes, to those who listen.',
        'They burn with feelings they dare not name.',
        'The heart wants what the heart wants.',
      ],
    },
    'was-rejected': {
      summaries: [
        `${npc.name} averts their eyes from ${memory.target ?? 'the one who spurned them'}`,
        `${npc.name} bristles at mention of ${memory.target ?? 'past heartbreak'}`,
        `${npc.name} nurses old wounds over ale`,
        `${npc.name} pretends not to care about ${memory.target ?? 'that person'}`,
      ],
      details: [
        'Rejection leaves scars that do not show.',
        'Love unreturned curdles into something else.',
        'They have not moved on. They may never.',
        'The sting fades. The memory does not.',
      ],
    },
    'discovered-secret': {
      summaries: [
        `${npc.name} watches ${memory.target ?? 'certain people'} with knowing eyes`,
        `${npc.name} hints at knowledge they should not possess`,
        `${npc.name} speaks in riddles about ${memory.target ?? 'hidden truths'}`,
        `${npc.name} smiles when ${memory.target ?? 'that matter'} is discussed`,
      ],
      details: [
        'Knowledge is power—and danger.',
        'Some secrets are worth more than gold.',
        'They know. And soon, others might too.',
        'Information is the currency of the careful.',
      ],
    },
    'committed-betrayal': {
      summaries: [
        `${npc.name} grows tense when ${memory.target ?? 'the past'} is mentioned`,
        `${npc.name} avoids ${memory.target ?? 'certain people'}`,
        `${npc.name} justifies old decisions to anyone who will listen`,
        `${npc.name} looks over their shoulder when ${memory.target ?? 'that name'} comes up`,
      ],
      details: [
        'Guilt is a heavy companion.',
        'They had their reasons. The reasons ring hollow now.',
        'The betrayed may yet learn the truth.',
        'Sleep does not come easy to traitors.',
      ],
    },
    'witnessed-cruelty': {
      summaries: [
        `${npc.name} cannot forget what ${memory.target ?? 'the cruel'} did`,
        `${npc.name} speaks of horrors witnessed in ${memory.location}`,
        `${npc.name} refuses to discuss ${memory.target ?? 'that day'}`,
        `${npc.name} shudders at memories of ${memory.target ?? 'evil'}`,
      ],
      details: [
        'Some sights cannot be unseen.',
        'Evil has a face now. They know it well.',
        'The nightmares have not stopped.',
        'They will never be the same.',
      ],
    },
    'witnessed-heroism': {
      summaries: [
        `${npc.name} tells tales of ${memory.target ?? 'heroic deeds'}`,
        `${npc.name} recalls when ${memory.target ?? 'a hero'} saved the day`,
        `${npc.name} still speaks of ${memory.target ?? 'bravery'} with awe`,
        `${npc.name} holds ${memory.target ?? 'the brave one'} as an example`,
      ],
      details: [
        'True courage inspires for a lifetime.',
        'They saw what one person can do.',
        'Heroes are real. They witnessed one.',
        'The memory sustains them in dark times.',
      ],
    },
    'was-insulted': {
      summaries: [
        `${npc.name} seethes at the memory of ${memory.target ?? 'public humiliation'}`,
        `${npc.name} plots revenge against ${memory.target ?? 'those who mocked'}`,
        `${npc.name} cannot forget the words of ${memory.target ?? 'mockers'}`,
      ],
      details: [
        'Pride is a wound that festers.',
        'Honor demands satisfaction.',
        'They will have their day.',
      ],
    },
    'was-exiled': {
      summaries: [
        `${npc.name} dreams of ${memory.target ?? 'their lost homeland'}`,
        `${npc.name} speaks wistfully of ${memory.target ?? 'home'}`,
        `${npc.name} marks the anniversary of their exile`,
      ],
      details: [
        'Home is where they cannot return.',
        'The exile plans their return—someday.',
        'Every stranger reminds them of what was lost.',
      ],
    },
    'made-enemy': {
      summaries: [
        `${npc.name} speaks darkly of ${memory.target ?? 'an enemy'}`,
        `${npc.name} warns others about ${memory.target ?? 'a foe'}`,
        `${npc.name} keeps watch for ${memory.target ?? 'enemies'}`,
      ],
      details: [
        'They know who wishes them ill.',
        'Trust is earned. This one failed.',
        'The enmity will not be forgotten.',
      ],
    },
    'made-friend': {
      summaries: [
        `${npc.name} speaks fondly of ${memory.target ?? 'a friend'}`,
        `${npc.name} inquires after ${memory.target ?? 'an ally'}`,
        `${npc.name} credits ${memory.target ?? 'a companion'} for past support`,
      ],
      details: [
        'True friends are rare treasures.',
        'They would stand with this one through anything.',
        'Some bonds are forged in fire.',
      ],
    },
  };
  
  const narrativeSet = MEMORY_SURFACES[memory.category];
  if (!narrativeSet) return null;
  
  return {
    category: 'town',
    summary: rng.pick(narrativeSet.summaries),
    details: rng.pick(narrativeSet.details),
    location: npc.location,
    actors: memory.target ? [npc.name, memory.target] : [npc.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
  };
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

    case 'research': {
      // NPC researches new spells or seeks a nexus
      if (npc.spells && rng.chance(0.2)) {
        // High level casters want to control a Nexus
        if (npc.level && npc.level >= 7 && !npc.agendas!.some(a => a.type === 'nexus')) {
          const nearestNexus = world.nexuses?.find(n => !n.currentOwnerId);
          if (nearestNexus) {
            npc.agendas!.push({
              type: 'nexus',
              target: nearestNexus.id,
              priority: 9,
              progress: 0,
              description: `Claim control of the ${nearestNexus.name}`,
            });
          }
        }

        const arcaneSpells = ['Detect Magic', 'Shield', 'Floating Disc', 'Hold Portal', 'Web', 'Invisibility', 'Fireball', 'Lightning Bolt', 'Fly'];
        const divineSpells = ['Detect Evil', 'Hold Person', 'Bless', 'Speak with Animals', 'Continual Light', 'Striking', 'Dispel Magic'];
        const pool = (npc.class === 'Magic-User' || npc.class === 'Elf') ? arcaneSpells : divineSpells;
        const available = pool.filter(s => !npc.spells!.includes(s));
        
        if (available.length > 0) {
          const newSpell = rng.pick(available);
          npc.spells.push(newSpell);
          agenda.progress = 100;
          
          logs.push({
            category: 'town',
            summary: `${npc.name} masters a new spell: ${newSpell}`,
            details: `After weeks of intense study and meditation, the ${npc.role} has unlocked new power.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
      break;
    }
    
    case 'nexus': {
      // NPC seeks to control a magical nexus
      if (agenda.target) {
        const nexus = world.nexuses?.find(n => n.id === agenda.target);
        if (nexus) {
          // Real-time: ~5-7 days (120-168 hours) to claim a nexus ritual
          agenda.progress += 0.5 + rng.next() * 0.5;
          if (agenda.progress >= 100) {
            nexus.currentOwnerId = npc.id;
            agenda.progress = 100;
            
            logs.push({
              category: 'faction',
              summary: `${npc.name} claims the ${nexus.name}`,
              details: `Through long ritual and arcane mastery, the ${npc.role} has bound the ${nexus.powerType} power of the nexus to their own will.`,
              location: `hex:${nexus.location.q},${nexus.location.r}`,
              actors: [npc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
            
            // Controlling a nexus makes you very famous
            npc.fame = (npc.fame ?? 0) + 5;
          }
        }
      }
      break;
    }

    case 'stronghold': {
      // Level 9+ NPC building a stronghold
      if (npc.level && npc.level >= 9) {
        // Real-time: Castles take months. 
        // ~90 days = 2160 hours. 100 / 2160 = ~0.046 per hour.
        agenda.progress += 0.02 + rng.next() * 0.03;
        
        if (agenda.progress >= 100) {
          const settlement = world.settlements.find(s => s.name === npc.location);
          const location = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };
          const type = npc.class === 'Magic-User' ? 'Tower' : npc.class === 'Cleric' ? 'Temple' : npc.class === 'Thief' ? 'Hideout' : 'Keep';
          
          const stronghold = {
            id: `stronghold-${npc.id}-${Date.now()}`,
            ownerId: npc.id,
            name: `${npc.name}'s ${type}`,
            location: location,
            type: type as any,
            level: 1,
            staff: 10 + rng.int(20),
            constructionFinished: true,
            treasury: 1000 + rng.int(2000),
            unrest: 0,
            population: 50 + rng.int(100),
            taxRate: 10,
          };
          
          world.strongholds.push(stronghold);
          
          logs.push({
            category: 'faction',
            summary: `${npc.name} completes their ${type}`,
            details: `A grand monument to their power. The ${type} rises over the landscape, attracting followers and rivals alike.`,
            location: npc.location,
            actors: [npc.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // NPC becomes a ruler/lord
          npc.title = npc.class === 'Fighter' ? 'Lord' : npc.class === 'Magic-User' ? 'Wizard' : npc.class === 'Cleric' ? 'Patriarch' : 'Guildmaster';
          agenda.progress = 100;
        } else {
           if (rng.chance(0.1)) {
             logs.push({
               category: 'town',
               summary: `Construction continues on ${npc.name}'s stronghold`,
               details: `Masons and laborers work tirelessly. The foundations are deep and the walls rise.`,
               location: npc.location,
               actors: [npc.name],
               worldTime,
               realTime: new Date(),
               seed: world.seed,
             });
           }
        }
      }
      break;
    }

    case 'romance': {
      if (!agenda.target) break;
      const targetNpc = world.npcs.find(n => n.name === agenda.target) as ReactiveNPC;
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        if (rng.chance(0.2)) {
          // Real-time: ~2-4 weeks for a wedding
          agenda.progress += 2 + rng.next() * 3;
          logs.push({
            category: 'town',
            summary: `${npc.name} seeks the company of ${targetNpc.name}`,
            details: `A quiet walk in the market, a shared meal... the bond between them grows stronger.`,
            location: npc.location,
            actors: [npc.name, targetNpc.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });

          if (agenda.progress >= 100) {
            logs.push({
              category: 'town',
              summary: `${npc.name} and ${targetNpc.name} are wed`,
              details: `Against the backdrop of these uncertain times, love prevails. A celebration is held.`,
              location: npc.location,
              actors: [npc.name, targetNpc.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
      break;
    }

    case 'betrayal': {
      if (!agenda.target) break;
      const targetNpc = world.npcs.find(n => n.name === agenda.target) as ReactiveNPC;
      if (targetNpc && targetNpc.location === npc.location && targetNpc.alive !== false) {
        if (rng.chance(0.1)) {
          // Real-time: ~1-2 weeks (168-336 hours) to plot a betrayal
          agenda.progress += 0.3 + rng.next() * 0.4;
          if (agenda.progress >= 100) {
            // THE BETRAYAL
            const betrayalEvent: WorldEvent = {
              id: `betrayal-${Date.now()}`,
              type: 'betrayal',
              timestamp: worldTime,
              location: npc.location,
              actors: [npc.name],
              victims: [targetNpc.name],
              magnitude: 7,
              witnessed: rng.chance(0.4),
              data: { betrayer: npc.name, betrayed: targetNpc.name, nature: 'political' },
            };
            logs.push(...processWorldEvent(betrayalEvent, world, rng, antagonists, storyThreads));
            npc.agendas = npc.agendas?.filter(a => a !== agenda);
          } else {
            logs.push({
              category: 'town',
              summary: `${npc.name} plots in shadows`,
              details: `The ${npc.role} was seen conferring with rivals of ${targetNpc.name}.`,
              location: npc.location,
              actors: [npc.name],
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
      
      if (quest.type === 'stronghold') {
        const avgLevel = party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length;
        if (avgLevel >= 9) {
          // Real-time: ~90 days to build
          quest.progress += 0.02 + rng.next() * 0.03;
          if (quest.progress >= 100) {
            const stronghold = {
              id: `stronghold-${party.id}-${Date.now()}`,
              ownerId: party.id,
              name: `${party.name}'s Bastion`,
              location: world.settlements.find(s => s.name === party.location)?.coord ?? { q: 0, r: 0 },
              type: 'Keep' as const,
              level: 1,
              staff: 20 + rng.int(30),
              constructionFinished: true,
              treasury: 5000,
              unrest: 0,
              population: 100 + rng.int(200),
              taxRate: 10,
            };
            world.strongholds.push(stronghold);
            state.questLog = state.questLog.filter(q => q.id !== quest.id);
            party.fame = (party.fame ?? 0) + 10;
            
            logs.push({
              category: 'faction',
              summary: `${party.name} completes their stronghold!`,
              details: `The construction is finished. ${party.name} now rules from their own fortress.`,
              location: party.location,
              actors: [party.name],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          } else {
            if (rng.chance(0.1)) {
              logs.push({
                category: 'town',
                summary: `${party.name} oversees stronghold construction`,
                details: `Stone by stone, the bastion rises. Local workers are busy with the scaffolding.`,
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
          
          // Launch conquest instead of just raid if we have a Casus Belli
          const hasCB = state.casusBelli[enemyId];
          const opType = hasCB ? 'conquest' : 'raid';

          const op: FactionOperation = {
            id: `op-${Date.now()}`,
            type: opType,
            target: targetSettlement,
            startedAt: worldTime,
            completesAt: new Date(worldTime.getTime() + (12 + rng.int(24)) * 60 * 60 * 1000),
            participants: [],
            successChance: 0.4 + state.power / 200,
            resources: faction.wealth * 0.2,
            secret: false,
            reason: hasCB ? hasCB.reason : `War against ${enemy.name}`,
          };
          state.activeOperations.push(op);
          
          logs.push({
            category: 'faction',
            summary: `${faction.name} marshals forces against ${enemy.name}`,
            details: hasCB 
              ? `Driven by ${hasCB.reason}, they seek to conquer ${targetSettlement}.`
              : `War continues. ${targetSettlement} is in their sights.`,
            location: targetSettlement,
            actors: [faction.name, enemy.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });

          // Raise an army for this operation if we don't have one nearby
          if (!world.armies.some(a => a.ownerId === faction.id && a.location === targetSettlement)) {
            const homeBase = state.territory[0] || faction.name;
            const army: Army = {
              id: `army-op-${Date.now()}`,
              ownerId: faction.id,
              location: homeBase,
              strength: 40 + rng.int(60),
              quality: 2,
              morale: 8,
              status: 'marching' as const,
              target: targetSettlement,
              supplies: 100,
              supplyLineFrom: homeBase,
              lastSupplied: worldTime,
            };
            world.armies.push(army);
          }
        }
      }
    }

    // RESOURCE-DRIVEN CONFLICT
    // If a faction needs a resource, and an enemy or neutral controls it, they might attack
    if (state.resourceNeeds.length > 0 && state.activeOperations.length < 2 && rng.chance(0.1)) {
      const need = rng.pick(state.resourceNeeds);
      const targetSettlement = world.settlements.find(s => s.supply[need] > 2);
      
      if (targetSettlement) {
        const sState = getSettlementState(world, targetSettlement.name);
        const currentOwnerId = sState.controlledBy;
        
        if (currentOwnerId !== faction.id) {
          // Found a settlement with the resource we need!
          const op: FactionOperation = {
            id: `op-res-${Date.now()}`,
            type: 'resource-grab',
            target: targetSettlement.name,
            startedAt: worldTime,
            completesAt: new Date(worldTime.getTime() + (24 + rng.int(48)) * 60 * 60 * 1000),
            participants: [],
            successChance: 0.3 + state.power / 200,
            resources: faction.wealth * 0.15,
            secret: false,
            reason: `Secure ${need} supplies from ${targetSettlement.name}`,
          };
          state.activeOperations.push(op);
          
          logs.push({
            category: 'faction',
            summary: `${faction.name} eyes ${targetSettlement.name} for its ${need}`,
            details: `Desperate for ${need}, the faction has decided to take the settlement by force.`,
            location: targetSettlement.name,
            actors: [faction.name],
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
    
    // === ADDITIONAL OPERATION TYPES ===
    
    // Trade embargo against enemies (trade factions)
    if (faction.focus === 'trade' && state.enemies.length > 0 && rng.chance(0.03)) {
      const enemyId = rng.pick(state.enemies);
      const enemy = world.factions.find(f => f.id === enemyId);
      const enemyState = getFactionState(world, enemyId);
      
      if (enemy && enemyState.territory.length > 0 && !state.activeOperations.some(op => op.type === 'trade-embargo')) {
        const target = rng.pick(enemyState.territory);
        const op: FactionOperation = {
          id: `op-embargo-${Date.now()}`,
          type: 'trade-embargo',
          target,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week
          participants: [],
          successChance: 0.7,
          resources: faction.wealth * 0.1,
          secret: false,
          reason: `Economic warfare against ${enemy.name}`,
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} declares embargo on ${target}`,
          details: `Trade caravans are turned away. Merchants grumble. The economic stranglehold begins.`,
          location: target,
          actors: [faction.name, enemy.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Crusade (pious factions)
    if (faction.focus === 'pious' && state.power >= 60 && rng.chance(0.02)) {
      // Find heretical or enemy-controlled settlement
      const heretical = world.settlements.find(s => {
        const sState = getSettlementState(world, s.name);
        return sState.controlledBy && state.enemies.includes(sState.controlledBy);
      });
      
      if (heretical && !state.activeOperations.some(op => op.type === 'crusade')) {
        const op: FactionOperation = {
          id: `op-crusade-${Date.now()}`,
          type: 'crusade',
          target: heretical.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
          participants: [],
          successChance: 0.5,
          resources: faction.wealth * 0.3,
          secret: false,
          reason: `Holy war to reclaim ${heretical.name} for the faithful`,
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} declares a crusade against ${heretical.name}`,
          details: `The faithful take up arms. Temple bells ring. A holy war begins.`,
          location: heretical.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Propaganda campaign (any faction)
    if (state.morale < -3 && rng.chance(0.05)) {
      const homeTerritory = state.territory[0] ?? world.settlements[0]?.name;
      if (homeTerritory && !state.activeOperations.some(op => op.type === 'propaganda')) {
        const op: FactionOperation = {
          id: `op-prop-${Date.now()}`,
          type: 'propaganda',
          target: homeTerritory,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days
          participants: [],
          successChance: 0.8,
          resources: 50,
          secret: false,
          reason: 'Restoring morale through public messaging',
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} launches propaganda campaign`,
          details: `Heralds spread word of past glories. Bards sing of heroic deeds. The people must believe.`,
          location: homeTerritory,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Assassination of enemy leadership (any faction at war)
    if (state.enemies.length > 0 && faction.focus === 'martial' && rng.chance(0.01)) {
      const enemyId = rng.pick(state.enemies);
      const enemy = world.factions.find(f => f.id === enemyId);
      
      // Find a prominent NPC aligned with the enemy
      const enemyLeaders = world.npcs.filter(n => 
        n.alive !== false && 
        (n as ReactiveNPC).loyalty === enemyId &&
        (n.level ?? 1) >= 5
      );
      
      if (enemy && enemyLeaders.length > 0 && !state.activeOperations.some(op => op.type === 'assassination')) {
        const target = rng.pick(enemyLeaders);
        const op: FactionOperation = {
          id: `op-assassin-${Date.now()}`,
          type: 'assassination',
          target: target.name,
          secondaryTarget: enemy.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 5 * 24 * 60 * 60 * 1000), // 5 days
          participants: [],
          successChance: 0.3,
          resources: 200,
          secret: true,
          reason: `Eliminate ${target.name}, a key figure in ${enemy.name}`,
        };
        state.activeOperations.push(op);
        
        // Secret operations don't log publicly initially
      }
    }
    
    // Marriage alliance (political maneuvering)
    if (state.allies.length === 0 && world.factions.length > 2 && rng.chance(0.02)) {
      // Find a faction that isn't an enemy
      const potential = world.factions.find(f => 
        f.id !== faction.id && 
        !state.enemies.includes(f.id) &&
        !state.allies.includes(f.id)
      );
      
      if (potential && !state.activeOperations.some(op => op.type === 'marriage-alliance')) {
        const op: FactionOperation = {
          id: `op-marriage-${Date.now()}`,
          type: 'marriage-alliance',
          target: potential.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 30 * 24 * 60 * 60 * 1000), // 1 month
          participants: [],
          successChance: 0.5,
          resources: 500,
          secret: false,
          reason: `Forge alliance with ${potential.name} through marriage`,
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} proposes marriage alliance with ${potential.name}`,
          details: `Envoys are sent. Dowries discussed. A political wedding could reshape alliances.`,
          actors: [faction.name, potential.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Inquisition (pious factions against perceived threats)
    if (faction.focus === 'pious' && rng.chance(0.01)) {
      const territory = state.territory[0];
      if (territory && !state.activeOperations.some(op => op.type === 'inquisition')) {
        const op: FactionOperation = {
          id: `op-inq-${Date.now()}`,
          type: 'inquisition',
          target: territory,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 14 * 24 * 60 * 60 * 1000), // 2 weeks
          participants: [],
          successChance: 0.7,
          resources: 100,
          secret: false,
          reason: 'Root out heresy and corruption',
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} launches inquisition in ${territory}`,
          details: `Investigators arrive. Questions are asked. The faithful have nothing to fear—or so they say.`,
          location: territory,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Blockade (martial factions during war)
    if (faction.focus === 'martial' && state.enemies.length > 0 && rng.chance(0.02)) {
      const enemyId = rng.pick(state.enemies);
      const enemyState = getFactionState(world, enemyId);
      
      if (enemyState.territory.length > 0 && !state.activeOperations.some(op => op.type === 'blockade')) {
        const target = rng.pick(enemyState.territory);
        const op: FactionOperation = {
          id: `op-block-${Date.now()}`,
          type: 'blockade',
          target,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 10 * 24 * 60 * 60 * 1000), // 10 days
          participants: [],
          successChance: 0.6,
          resources: faction.wealth * 0.15,
          secret: false,
          reason: `Starve out ${target}`,
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} blockades ${target}`,
          details: `Roads are cut. Caravans turned back. Nothing enters or leaves.`,
          location: target,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Relief mission (pious or trade factions, during crises)
    const crisisSettlement = world.settlements.find(s => {
      const sState = getSettlementState(world, s.name);
      return sState.disease || sState.prosperity < -5;
    });
    
    if (crisisSettlement && (faction.focus === 'pious' || faction.focus === 'trade') && rng.chance(0.03)) {
      if (!state.activeOperations.some(op => op.type === 'relief')) {
        const op: FactionOperation = {
          id: `op-relief-${Date.now()}`,
          type: 'relief',
          target: crisisSettlement.name,
          startedAt: worldTime,
          completesAt: new Date(worldTime.getTime() + 7 * 24 * 60 * 60 * 1000), // 1 week
          participants: [],
          successChance: 0.9,
          resources: 300,
          secret: false,
          reason: `Aid the suffering of ${crisisSettlement.name}`,
        };
        state.activeOperations.push(op);
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} sends relief to ${crisisSettlement.name}`,
          details: `Wagons of grain and medicine roll toward the suffering. Compassion—or calculated politics?`,
          location: crisisSettlement.name,
          actors: [faction.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }

  return logs;
}

// ============================================================================
// SPELLCASTING - High-level casters alter the world
// ============================================================================

export function tickSpellcasting(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // High level casters might cast world-shaping spells
  const casters = world.npcs.filter(n => 
    n.alive !== false && 
    n.level && n.level >= 5 && 
    (n.class === 'Magic-User' || n.class === 'Cleric' || n.class === 'Elf')
  ) as ReactiveNPC[];
  
  for (const caster of casters) {
    if (!rng.chance(0.02)) continue; // Rare check
    
    // Choose a spell to cast
    const spells = (caster.class === 'Magic-User' || caster.class === 'Elf') 
      ? ['Control Weather', 'Cloudkill', 'Wall of Iron']
      : ['Bless', 'Cure Disease', 'Raise Dead', 'Insect Plague'];
      
    const spell = rng.pick(spells);
    
    switch (spell) {
      case 'Control Weather': {
        const newWeather = rng.pick(['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'] as const);
        if ((world as any).calendar) (world as any).calendar.weather = newWeather;
        
        logs.push({
          category: 'weather',
          summary: `${caster.name} alters the weather`,
          details: `Through ancient incantations, the ${caster.class} calls forth ${newWeather} over the region.`,
          location: caster.location,
          actors: [caster.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        break;
      }
      case 'Cloudkill': {
        const settlement = world.settlements.find(s => s.name === caster.location);
        if (settlement) {
          const state = getSettlementState(world, settlement.name);
          state.prosperity = Math.max(-10, state.prosperity - 3);
          state.populationDelta -= 50;
          
          logs.push({
            category: 'town',
            summary: `Magical mist chokes ${settlement.name}`,
            details: `A toxic green cloud, conjured by ${caster.name}, rolls through the streets. Panic ensues.`,
            location: settlement.name,
            actors: [caster.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
        break;
      }
      case 'Bless': {
        const settlement = world.settlements.find(s => s.name === caster.location);
        if (settlement) {
          const state = getSettlementState(world, settlement.name);
          state.safety = Math.min(10, state.safety + 2);
          settlement.mood = Math.min(5, settlement.mood + 1);
          
          logs.push({
            category: 'town',
            summary: `Divine blessing upon ${settlement.name}`,
            details: `${caster.name} performs a grand ritual of sanctification. A sense of peace fills the air.`,
            location: settlement.name,
            actors: [caster.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
        break;
      }
      case 'Raise Dead': {
        const deadNpcs = world.npcs.filter(n => n.alive === false && n.location === caster.location);
        if (deadNpcs.length > 0) {
          const target = rng.pick(deadNpcs);
          target.alive = true;
          target.wounded = true;
          // Note: restHoursRemaining would be in the Party structure, but for NPCs we can just set a flag if we had one
          
          logs.push({
            category: 'town',
            summary: `${caster.name} returns ${target.name} from the grave!`,
            details: `A miracle! The gates of death are pulled back. ${target.name} breathes once more, though they are weak.`,
            location: caster.location,
            actors: [caster.name, target.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
        break;
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

