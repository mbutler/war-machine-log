/**
 * DEEP CAUSALITY ENGINE
 * 
 * This module creates true cause-and-effect relationships throughout the simulation.
 * Every significant event should ripple through the world in meaningful ways.
 * 
 * Key principles:
 * 1. Events modify world state, not just generate logs
 * 2. NPCs and factions remember and respond to what happens
 * 3. Chains of cause-effect create emergent narratives
 * 4. The world should feel alive and reactive
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, Settlement, NPC, Faction, Rumor } from './types.ts';
import { Antagonist } from './antagonists.ts';
import { StoryThread } from './stories.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';

// ============================================================================
// WORLD EVENT TYPES - Significant events that modify world state
// ============================================================================

export type WorldEventType =
  | 'raid'              // Attack on settlement/caravan
  | 'battle'            // Combat between parties/factions
  | 'death'             // Someone dies
  | 'robbery'           // Theft/banditry
  | 'discovery'         // Finding treasure/knowledge
  | 'alliance'          // Two groups ally
  | 'betrayal'          // Breaking of trust
  | 'conquest'          // Territory changes hands
  | 'disaster'          // Natural/magical catastrophe
  | 'miracle'           // Divine/magical blessing
  | 'assassination'     // Targeted killing
  | 'recruitment'       // Faction gains members
  | 'defection'         // Faction loses members
  | 'trade-deal'        // Economic agreement
  | 'embargo'           // Economic punishment
  | 'festival'          // Celebration
  | 'plague'            // Disease outbreak
  | 'famine'            // Food shortage
  | 'uprising'          // Popular revolt
  | 'prophecy';         // Significant omen

export interface WorldEvent {
  id: string;
  type: WorldEventType;
  timestamp: Date;
  location: string;
  actors: string[];      // Who was involved
  victims?: string[];    // Who was harmed
  perpetrators?: string[]; // Who caused it
  magnitude: number;     // 1-10 scale of significance
  witnessed: boolean;    // Was it seen by others?
  data: Record<string, unknown>;
}

// ============================================================================
// NPC MEMORY SYSTEM - NPCs remember events and act on them
// ============================================================================

export interface NPCMemory {
  eventId: string;
  eventType: WorldEventType;
  timestamp: Date;
  emotional: 'grateful' | 'angry' | 'fearful' | 'grieving' | 'inspired' | 'suspicious';
  target?: string;       // Who they associate with this memory
  intensity: number;     // 1-10, decays over time
  acted: boolean;        // Have they acted on this memory?
}

export interface NPCAgenda {
  type: 'revenge' | 'protection' | 'ambition' | 'loyalty' | 'greed' | 'fear' | 'love' | 'duty';
  target?: string;       // Person/faction/place involved
  priority: number;      // 1-10
  progress: number;      // 0-100%
  description: string;
}

// Extended NPC with memory and agenda
export interface ReactiveNPC extends NPC {
  memories: NPCMemory[];
  agendas: NPCAgenda[];
  loyalty?: string;      // Faction they're loyal to
  morale: number;        // -10 to +10
  lastActed?: Date;
}

// ============================================================================
// SETTLEMENT STATE - Deeper settlement simulation
// ============================================================================

export interface SettlementState {
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

// ============================================================================
// FACTION STATE - Deeper faction simulation
// ============================================================================

export interface FactionState {
  power: number;         // 0-100, overall strength
  territory: string[];   // Settlement IDs they control
  enemies: string[];     // Faction IDs they're at war with
  allies: string[];      // Faction IDs they're allied with
  resources: number;     // Economic power
  morale: number;        // -10 to +10
  activeOperations: FactionOperation[];
  recentLosses: number;  // Accumulated losses (triggers responses)
  recentWins: number;    // Accumulated wins (triggers expansion)
}

export interface FactionOperation {
  id: string;
  type: 'raid' | 'patrol' | 'expansion' | 'recruitment' | 'assassination' | 'sabotage' | 'diplomacy';
  target: string;        // Settlement, faction, or NPC
  startedAt: Date;
  completesAt: Date;
  participants: string[]; // NPC IDs involved
  successChance: number;
}

// ============================================================================
// PARTY STATE - Deeper party simulation
// ============================================================================

export interface PartyState {
  morale: number;        // -10 to +10
  resources: number;     // Gold/supplies
  enemies: string[];     // Antagonists/factions hunting them
  allies: string[];      // Factions/NPCs supporting them
  questLog: PartyQuest[];
  killList: string[];    // Antagonists they've defeated
  reputation: Record<string, number>; // Reputation per settlement
  vendetta?: string;     // Who they're hunting
  protectee?: string;    // Who they're protecting
}

export interface PartyQuest {
  id: string;
  type: 'hunt' | 'escort' | 'retrieve' | 'explore' | 'defend' | 'avenge';
  target: string;
  reason: string;
  progress: number;
  deadline?: Date;
}

// ============================================================================
// WORLD EVENT PROCESSING - The heart of causality
// ============================================================================

/**
 * Process a world event and generate all its consequences.
 * This is the core function that makes the world reactive.
 */
export function processWorldEvent(
  event: WorldEvent,
  world: WorldState,
  rng: Random,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];

  // Store event in world history
  if (!world.eventHistory) world.eventHistory = [];
  world.eventHistory.push(event);
  
  // Limit history size
  if (world.eventHistory.length > 200) {
    world.eventHistory = world.eventHistory.slice(-200);
  }

  // Process based on event type
  switch (event.type) {
    case 'raid':
      logs.push(...processRaid(event, world, rng, antagonists));
      break;
    case 'battle':
      logs.push(...processBattle(event, world, rng));
      break;
    case 'death':
      logs.push(...processDeath(event, world, rng, storyThreads));
      break;
    case 'robbery':
      logs.push(...processRobbery(event, world, rng));
      break;
    case 'assassination':
      logs.push(...processAssassination(event, world, rng, storyThreads));
      break;
    case 'conquest':
      logs.push(...processConquest(event, world, rng));
      break;
    case 'alliance':
      logs.push(...processAlliance(event, world, rng));
      break;
    case 'betrayal':
      logs.push(...processBetrayal(event, world, rng, storyThreads));
      break;
  }

  // Universal consequences: NPCs form memories
  logs.push(...createNPCMemories(event, world, rng));
  
  // Universal consequences: Stories might spawn or advance
  logs.push(...updateStoryThreads(event, world, rng, storyThreads));
  
  // Universal consequences: Rumors spread
  if (event.witnessed && event.magnitude >= 3) {
    spreadEventAsRumor(event, world, rng);
  }

  return logs;
}

// ============================================================================
// RAID PROCESSING - When antagonists or factions attack
// ============================================================================

function processRaid(
  event: WorldEvent,
  world: WorldState,
  rng: Random,
  antagonists: Antagonist[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  const settlement = world.settlements.find(s => s.name === event.location);
  if (!settlement) return logs;

  const { damage, loot, casualties } = event.data as { 
    damage: number; 
    loot: string[];
    casualties: number;
  };

  // 1. ECONOMIC DAMAGE - Deplete settlement supplies
  const supplyTypes = Object.keys(settlement.supply) as (keyof typeof settlement.supply)[];
  for (let i = 0; i < damage; i++) {
    const targetSupply = rng.pick(supplyTypes);
    settlement.supply[targetSupply] = Math.max(0, settlement.supply[targetSupply] - rng.int(5) - 1);
  }

  // 2. MOOD DAMAGE - Settlement becomes fearful/angry
  settlement.mood = Math.max(-5, settlement.mood - Math.ceil(damage / 2));

  // 3. SAFETY PERCEPTION
  const state = getSettlementState(world, settlement.name);
  state.safety = Math.max(-10, state.safety - damage);
  state.recentEvents.push(event.id);
  
  // 4. POPULATION FLIGHT - Some people flee
  if (damage >= 3) {
    state.populationDelta -= Math.floor(damage * 10);
    logs.push({
      category: 'town',
      summary: `Refugees flee ${settlement.name}`,
      details: `The raid drives families from their homes. The roads fill with the displaced.`,
      location: settlement.name,
      worldTime: event.timestamp,
      realTime: new Date(),
      seed: world.seed,
    });
  }

  // 5. NPC CASUALTIES - Some NPCs might die
  const npcsHere = world.npcs.filter(n => n.location === settlement.name && n.alive !== false);
  for (let i = 0; i < casualties && npcsHere.length > 0; i++) {
    const victim = rng.pick(npcsHere);
    if (rng.chance(0.3)) { // 30% chance the casualty is fatal
      victim.alive = false;
      logs.push(...processDeath({
        ...event,
        id: `${event.id}-death-${i}`,
        type: 'death',
        victims: [victim.name],
        data: { cause: 'raid', killedBy: event.perpetrators?.[0] }
      }, world, rng, []));
    } else {
      (victim as ReactiveNPC).morale = ((victim as ReactiveNPC).morale ?? 0) - 3;
      // Add memory of the attack
      addNPCMemory(victim as ReactiveNPC, {
        eventId: event.id,
        eventType: 'raid',
        timestamp: event.timestamp,
        emotional: rng.pick(['angry', 'fearful', 'grieving']),
        target: event.perpetrators?.[0],
        intensity: 5 + rng.int(5),
        acted: false,
      });
    }
  }

  // 6. FACTION RESPONSE - Local factions mobilize
  for (const faction of world.factions) {
    const attitude = faction.attitude[settlement.name] ?? 0;
    if (attitude > 0) {
      // Friendly faction responds
      const factionState = getFactionState(world, faction.id);
      factionState.recentLosses += damage;
      
      if (factionState.recentLosses >= 5) {
        // Trigger military response
        queueConsequence({
          type: 'faction-action',
          triggerEvent: `Raid on ${settlement.name}`,
          turnsUntilResolution: 6 + rng.int(12),
          data: {
            factionId: faction.id,
            action: 'retaliate',
            targetLocation: settlement.name,
          },
          priority: 5,
        });
        
        logs.push({
          category: 'faction',
          summary: `${faction.name} musters for war`,
          details: `The attacks on ${settlement.name} cannot go unanswered. ${faction.name} gathers its strength.`,
          location: settlement.name,
          actors: [faction.name],
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
        
        factionState.recentLosses = 0; // Reset counter
      }
    }
  }

  // 7. PARTY RESPONSE - Adventuring parties might get involved
  const partiesNearby = world.parties.filter(p => 
    p.location === settlement.name || 
    (p.travel && p.travel.destination === settlement.name)
  );
  
  for (const party of partiesNearby) {
    const partyState = getPartyState(world, party.id);
    
    // Add vendetta against raiders
    if (event.perpetrators?.length && rng.chance(0.5)) {
      partyState.vendetta = event.perpetrators[0];
      partyState.enemies = [...new Set([...(partyState.enemies ?? []), event.perpetrators[0]])];
      
      logs.push({
        category: 'road',
        summary: `${party.name} vows to hunt the raiders`,
        details: `Witnessing the devastation, they swear to bring ${event.perpetrators[0]} to justice.`,
        location: settlement.name,
        actors: [party.name, event.perpetrators[0]],
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Add quest to their log
      partyState.questLog = partyState.questLog ?? [];
      partyState.questLog.push({
        id: `quest-${Date.now()}`,
        type: 'hunt',
        target: event.perpetrators[0],
        reason: `Avenge the raid on ${settlement.name}`,
        progress: 0,
      });
    }
  }

  return logs;
}

// ============================================================================
// BATTLE PROCESSING - Combat between parties
// ============================================================================

function processBattle(
  event: WorldEvent,
  world: WorldState,
  rng: Random,
): LogEntry[] {
  const logs: LogEntry[] = [];
  const { victor, loser, significance } = event.data as {
    victor: string;
    loser: string;
    significance: number;
  };

  // Find the winning party/faction
  const victorParty = world.parties.find(p => p.name === victor);
  const loserParty = world.parties.find(p => p.name === loser);
  const victorFaction = world.factions.find(f => f.name === victor);
  const loserFaction = world.factions.find(f => f.name === loser);

  // Update party states
  if (victorParty) {
    const state = getPartyState(world, victorParty.id);
    state.morale = Math.min(10, (state.morale ?? 0) + significance);
    victorParty.fame = (victorParty.fame ?? 0) + significance;
    
    // Remove from kill list if they defeated an enemy
    if (state.vendetta === loser) {
      state.vendetta = undefined;
      state.killList = [...(state.killList ?? []), loser];
      logs.push({
        category: 'road',
        summary: `${victorParty.name} completes their vendetta`,
        details: `${loser} falls. The oath is fulfilled.`,
        location: event.location,
        actors: [victorParty.name],
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  if (loserParty) {
    const state = getPartyState(world, loserParty.id);
    state.morale = Math.max(-10, (state.morale ?? 0) - significance);
    loserParty.fame = Math.max(0, (loserParty.fame ?? 0) - 1);
    loserParty.wounded = true;
    loserParty.restHoursRemaining = 24 + rng.int(24);
    
    // Loser might develop vendetta against victor
    if (significance >= 3 && rng.chance(0.5)) {
      state.vendetta = victor;
      state.enemies = [...new Set([...(state.enemies ?? []), victor])];
    }
  }

  // Update faction states
  if (victorFaction) {
    const state = getFactionState(world, victorFaction.id);
    state.recentWins += significance;
    state.power = Math.min(100, state.power + significance * 2);
    
    // Consider expansion after enough wins
    if (state.recentWins >= 5) {
      logs.push({
        category: 'faction',
        summary: `${victorFaction.name} grows bold`,
        details: `Emboldened by recent victories, they eye new territories.`,
        location: event.location,
        actors: [victorFaction.name],
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
      state.recentWins = 0;
    }
  }

  if (loserFaction) {
    const state = getFactionState(world, loserFaction.id);
    state.recentLosses += significance;
    state.power = Math.max(0, state.power - significance * 2);
    state.morale = Math.max(-10, (state.morale ?? 0) - significance);
    
    // Declare war if not already enemies
    if (victorFaction && !state.enemies.includes(victorFaction.id)) {
      state.enemies.push(victorFaction.id);
      logs.push({
        category: 'faction',
        summary: `${loserFaction.name} declares ${victorFaction.name} their enemy`,
        details: `Blood demands blood. Open warfare may follow.`,
        location: event.location,
        actors: [loserFaction.name, victorFaction.name],
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }

  // Settlement witnesses battle - mood shifts
  const settlement = world.settlements.find(s => s.name === event.location);
  if (settlement) {
    settlement.mood = Math.max(-5, settlement.mood - 1);
    const state = getSettlementState(world, settlement.name);
    state.safety -= 1;
    state.recentEvents.push(event.id);
    
    // Unrest might increase
    if (significance >= 3) {
      state.unrest = Math.min(10, (state.unrest ?? 0) + 1);
    }
  }

  return logs;
}

// ============================================================================
// DEATH PROCESSING - When someone dies
// ============================================================================

function processDeath(
  event: WorldEvent,
  world: WorldState,
  rng: Random,
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  const { cause, killedBy } = event.data as { cause?: string; killedBy?: string };
  const victimName = event.victims?.[0];
  if (!victimName) return logs;

  // Find the victim
  const victim = world.npcs.find(n => n.name === victimName || n.id === victimName);
  const victimAntagonist = (world as any).antagonists?.find((a: Antagonist) => a.name === victimName);

  if (victim) {
    victim.alive = false;

    // 1. RELATIONSHIPS REACT - People who knew them respond
    const reactiveNpc = victim as ReactiveNPC;
    if (reactiveNpc.depth?.relationships) {
      for (const rel of reactiveNpc.depth.relationships) {
        const relatedNpc = world.npcs.find(n => n.id === rel.targetId) as ReactiveNPC;
        if (!relatedNpc || relatedNpc.alive === false) continue;

        // Add grief/anger memory
        addNPCMemory(relatedNpc, {
          eventId: event.id,
          eventType: 'death',
          timestamp: event.timestamp,
          emotional: rel.type === 'enemy' ? 'grateful' : 
                     (killedBy ? 'angry' : 'grieving'),
          target: killedBy,
          intensity: 5 + rel.strength,
          acted: false,
        });

        // Close relationships spawn revenge agendas
        if (['ally', 'lover', 'kin', 'mentor'].includes(rel.type) && killedBy) {
          addNPCAgenda(relatedNpc, {
            type: 'revenge',
            target: killedBy,
            priority: 7 + rng.int(3),
            progress: 0,
            description: `Avenge ${victim.name}'s death at the hands of ${killedBy}`,
          });

          logs.push({
            category: 'town',
            summary: `${relatedNpc.name} swears vengeance for ${victim.name}`,
            details: `The ${relatedNpc.role}'s grief turns to cold fury. ${killedBy} has made a powerful enemy.`,
            location: relatedNpc.location,
            actors: [relatedNpc.name, killedBy],
            worldTime: event.timestamp,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }

    // 2. FACTION IMPACT - If they belonged to a faction
    const faction = world.factions.find(f => 
      world.npcs.some(n => (n as ReactiveNPC).loyalty === f.id && n.id === victim.id)
    );
    if (faction) {
      const state = getFactionState(world, faction.id);
      state.recentLosses += 2;
      state.morale = Math.max(-10, (state.morale ?? 0) - 2);

      if (killedBy) {
        const killerFaction = world.factions.find(f => f.name === killedBy);
        if (killerFaction && !state.enemies.includes(killerFaction.id)) {
          state.enemies.push(killerFaction.id);
        }
      }
    }

    // 3. SETTLEMENT IMPACT - If they were important locally
    const settlement = world.settlements.find(s => s.name === victim.location);
    if (settlement) {
      const settState = getSettlementState(world, settlement.name);
      if (victim.fame && victim.fame >= 3) {
        settlement.mood = Math.max(-5, settlement.mood - 2);
        settState.unrest = Math.min(10, (settState.unrest ?? 0) + 1);
        
        logs.push({
          category: 'town',
          summary: `${settlement.name} mourns ${victim.name}`,
          details: `A notable figure has fallen. The settlement is shaken.`,
          location: settlement.name,
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }

  // If an antagonist died
  if (victimAntagonist) {
    victimAntagonist.alive = false;
    
    // Big news! Spread widely
    for (const settlement of world.settlements) {
      queueConsequence({
        type: 'spawn-rumor',
        triggerEvent: `Death of ${victimAntagonist.name}`,
        turnsUntilResolution: 1 + rng.int(3),
        data: {
          origin: settlement.name,
          target: event.location,
          kind: 'mystery',
          text: `${victimAntagonist.name} ${victimAntagonist.epithet} is dead! Slain near ${event.location}.`,
        },
        priority: 5,
      });
    }

    // Followers might avenge or scatter
    if (victimAntagonist.minions && victimAntagonist.minions > 0) {
      if (rng.chance(0.5)) {
        logs.push({
          category: 'faction',
          summary: `${victimAntagonist.name}'s followers scatter`,
          details: `With their leader dead, the remaining minions flee into the wilds.`,
          location: event.location,
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
      } else {
        logs.push({
          category: 'faction',
          summary: `${victimAntagonist.name}'s followers swear vengeance`,
          details: `A new leader rises from the ashes, vowing to continue the fallen master's work.`,
          location: event.location,
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
        
        // Spawn successor antagonist eventually
        queueConsequence({
          type: 'spawn-antagonist',
          triggerEvent: `Succession of ${victimAntagonist.name}`,
          turnsUntilResolution: 48 + rng.int(72),
          data: {
            location: event.location,
            threat: `A successor to ${victimAntagonist.name}`,
            origin: `The death of ${victimAntagonist.name}`,
          },
          priority: 4,
        });
      }
    }
  }

  return logs;
}

// ============================================================================
// OTHER EVENT PROCESSORS
// ============================================================================

function processRobbery(event: WorldEvent, world: WorldState, rng: Random): LogEntry[] {
  const logs: LogEntry[] = [];
  const { value, targetType } = event.data as { value: number; targetType: string };
  
  // If a caravan was robbed, affect trade
  if (targetType === 'caravan') {
    const nearestSettlement = world.settlements.find(s => s.name === event.location);
    if (nearestSettlement) {
      const state = getSettlementState(world, nearestSettlement.name);
      state.safety -= 2;
      state.prosperity -= 1;
      
      logs.push({
        category: 'town',
        summary: `Trade routes near ${nearestSettlement.name} grow dangerous`,
        details: `Merchants speak of losses. Some refuse to travel until the roads are secured.`,
        location: nearestSettlement.name,
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // Perpetrator gains resources
  if (event.perpetrators?.length) {
    const perpetrator = event.perpetrators[0];
    const party = world.parties.find(p => p.name === perpetrator);
    if (party) {
      const state = getPartyState(world, party.id);
      state.resources = (state.resources ?? 0) + value;
    }
  }
  
  return logs;
}

function processAssassination(
  event: WorldEvent, 
  world: WorldState, 
  rng: Random,
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Process the death
  logs.push(...processDeath(event, world, rng, storyThreads));
  
  // But also: political consequences
  const victim = world.npcs.find(n => n.name === event.victims?.[0]);
  if (victim) {
    const settlement = world.settlements.find(s => s.name === victim.location);
    if (settlement) {
      const state = getSettlementState(world, settlement.name);
      state.unrest = Math.min(10, (state.unrest ?? 0) + 3);
      
      // If ruler was killed, power vacuum
      if (state.rulerNpcId === victim.id) {
        state.rulerNpcId = undefined;
        state.contested = true;
        
        logs.push({
          category: 'town',
          summary: `${settlement.name} plunges into chaos`,
          details: `With their leader dead, factions vie for control. The streets grow tense.`,
          location: settlement.name,
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

function processConquest(event: WorldEvent, world: WorldState, rng: Random): LogEntry[] {
  const logs: LogEntry[] = [];
  const { conqueror, previous } = event.data as { conqueror: string; previous?: string };
  
  const settlement = world.settlements.find(s => s.name === event.location);
  if (!settlement) return logs;
  
  const state = getSettlementState(world, settlement.name);
  const conquerorFaction = world.factions.find(f => f.id === conqueror || f.name === conqueror);
  
  if (conquerorFaction) {
    // Update control
    state.controlledBy = conquerorFaction.id;
    state.contested = false;
    
    // Conqueror gains territory
    const factionState = getFactionState(world, conquerorFaction.id);
    if (!factionState.territory.includes(settlement.name)) {
      factionState.territory.push(settlement.name);
    }
    factionState.power += 10;
    
    // Previous controller loses territory
    if (previous) {
      const prevFaction = world.factions.find(f => f.id === previous || f.name === previous);
      if (prevFaction) {
        const prevState = getFactionState(world, prevFaction.id);
        prevState.territory = prevState.territory.filter(t => t !== settlement.name);
        prevState.power = Math.max(0, prevState.power - 10);
        prevState.morale -= 3;
        
        // They're now enemies
        if (!prevState.enemies.includes(conquerorFaction.id)) {
          prevState.enemies.push(conquerorFaction.id);
        }
        if (!factionState.enemies.includes(prevFaction.id)) {
          factionState.enemies.push(prevFaction.id);
        }
      }
    }
    
    // Settlement mood depends on new rulers
    const existingAttitude = conquerorFaction.attitude[settlement.name] ?? 0;
    settlement.mood = existingAttitude > 0 ? 1 : -2;
    
    logs.push({
      category: 'faction',
      summary: `${settlement.name} falls under ${conquerorFaction.name} control`,
      details: previous 
        ? `The banners of ${previous} are torn down. New masters rule.`
        : `A new power claims this settlement as their own.`,
      location: settlement.name,
      actors: [conquerorFaction.name],
      worldTime: event.timestamp,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  return logs;
}

function processAlliance(event: WorldEvent, world: WorldState, rng: Random): LogEntry[] {
  const logs: LogEntry[] = [];
  const [faction1Name, faction2Name] = event.actors;
  
  const faction1 = world.factions.find(f => f.name === faction1Name);
  const faction2 = world.factions.find(f => f.name === faction2Name);
  
  if (faction1 && faction2) {
    const state1 = getFactionState(world, faction1.id);
    const state2 = getFactionState(world, faction2.id);
    
    // Add as allies
    if (!state1.allies.includes(faction2.id)) state1.allies.push(faction2.id);
    if (!state2.allies.includes(faction1.id)) state2.allies.push(faction1.id);
    
    // Remove from enemies
    state1.enemies = state1.enemies.filter(e => e !== faction2.id);
    state2.enemies = state2.enemies.filter(e => e !== faction1.id);
    
    // Shared enemies
    const commonEnemies = state1.enemies.filter(e => state2.enemies.includes(e));
    if (commonEnemies.length > 0) {
      const enemyFaction = world.factions.find(f => f.id === commonEnemies[0]);
      if (enemyFaction) {
        logs.push({
          category: 'faction',
          summary: `${faction1.name} and ${faction2.name} unite against ${enemyFaction.name}`,
          details: `A pact is sealed. Their common enemy should be worried.`,
          location: event.location,
          actors: [faction1.name, faction2.name],
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

function processBetrayal(
  event: WorldEvent, 
  world: WorldState, 
  rng: Random,
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  const { betrayer, betrayed, nature } = event.data as { 
    betrayer: string; 
    betrayed: string;
    nature: string;
  };
  
  // Find the betrayed
  const betrayedNpc = world.npcs.find(n => n.name === betrayed) as ReactiveNPC;
  const betrayedFaction = world.factions.find(f => f.name === betrayed);
  const betrayedParty = world.parties.find(p => p.name === betrayed);
  
  // Add intense memory and revenge agenda
  if (betrayedNpc && betrayedNpc.alive !== false) {
    addNPCMemory(betrayedNpc, {
      eventId: event.id,
      eventType: 'betrayal',
      timestamp: event.timestamp,
      emotional: 'angry',
      target: betrayer,
      intensity: 10,
      acted: false,
    });
    
    addNPCAgenda(betrayedNpc, {
      type: 'revenge',
      target: betrayer,
      priority: 10,
      progress: 0,
      description: `Make ${betrayer} pay for their treachery`,
    });
    
    logs.push({
      category: 'town',
      summary: `${betrayedNpc.name} learns of ${betrayer}'s betrayal`,
      details: `Trust shattered, the ${betrayedNpc.role} speaks of nothing but revenge.`,
      location: betrayedNpc.location,
      actors: [betrayedNpc.name, betrayer],
      worldTime: event.timestamp,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  if (betrayedParty) {
    const state = getPartyState(world, betrayedParty.id);
    state.vendetta = betrayer;
    state.morale = Math.max(-10, (state.morale ?? 0) - 5);
    state.enemies = [...new Set([...(state.enemies ?? []), betrayer])];
    
    // Remove from allies
    state.allies = (state.allies ?? []).filter(a => a !== betrayer);
  }
  
  if (betrayedFaction) {
    const betrayerFaction = world.factions.find(f => f.name === betrayer);
    if (betrayerFaction) {
      const state = getFactionState(world, betrayedFaction.id);
      state.allies = state.allies.filter(a => a !== betrayerFaction.id);
      if (!state.enemies.includes(betrayerFaction.id)) {
        state.enemies.push(betrayerFaction.id);
      }
    }
  }
  
  return logs;
}

// ============================================================================
// NPC MEMORY HELPERS
// ============================================================================

function addNPCMemory(npc: ReactiveNPC, memory: NPCMemory): void {
  if (!npc.memories) npc.memories = [];
  npc.memories.push(memory);
  // Limit memory size
  if (npc.memories.length > 20) {
    npc.memories = npc.memories.slice(-20);
  }
}

function addNPCAgenda(npc: ReactiveNPC, agenda: NPCAgenda): void {
  if (!npc.agendas) npc.agendas = [];
  // Don't duplicate agendas
  if (npc.agendas.some(a => a.type === agenda.type && a.target === agenda.target)) return;
  npc.agendas.push(agenda);
}

function createNPCMemories(event: WorldEvent, world: WorldState, rng: Random): LogEntry[] {
  const logs: LogEntry[] = [];
  if (!event.witnessed) return logs;
  
  // NPCs in the location form memories
  const witnesses = world.npcs.filter(n => 
    n.location === event.location && n.alive !== false
  );
  
  for (const witness of witnesses) {
    if (rng.chance(0.3)) { // 30% chance to form strong memory
      const reactiveNpc = witness as ReactiveNPC;
      
      let emotional: NPCMemory['emotional'] = 'suspicious';
      if (event.type === 'battle' || event.type === 'raid') emotional = rng.pick(['fearful', 'angry']);
      if (event.type === 'death') emotional = 'grieving';
      if (event.type === 'miracle' || event.type === 'festival') emotional = 'inspired';
      
      addNPCMemory(reactiveNpc, {
        eventId: event.id,
        eventType: event.type,
        timestamp: event.timestamp,
        emotional,
        target: event.actors?.[0],
        intensity: event.magnitude,
        acted: false,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// STORY THREAD UPDATES
// ============================================================================

function updateStoryThreads(
  event: WorldEvent,
  world: WorldState,
  rng: Random,
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const story of storyThreads) {
    if (story.resolved) continue;
    
    // Check if event involves story actors
    const eventActors = new Set([...(event.actors ?? []), ...(event.victims ?? []), ...(event.perpetrators ?? [])]);
    const storyActors = new Set(story.actors);
    
    const overlap = [...eventActors].some(a => storyActors.has(a));
    if (!overlap) continue;
    
    // Event is relevant to this story!
    story.lastUpdated = event.timestamp;
    
    // Add beat
    story.beats.push({
      timestamp: event.timestamp,
      summary: event.type === 'death' 
        ? `A key figure falls.`
        : event.type === 'battle'
        ? `Blood is spilled.`
        : `Events unfold.`,
      tensionChange: event.magnitude > 5 ? 2 : 1,
    });
    
    // Increase tension
    story.tension = Math.min(10, story.tension + event.magnitude / 3);
    
    // Update phase based on tension
    if (story.tension >= 8 && story.phase !== 'climax') {
      story.phase = 'climax';
      logs.push({
        category: 'faction',
        summary: `${story.title} approaches its climax`,
        details: `The threads of fate draw tight. A decisive moment is at hand.`,
        location: story.location,
        actors: story.actors,
        worldTime: event.timestamp,
        realTime: new Date(),
        seed: world.seed,
      });
    } else if (story.tension >= 5 && story.phase === 'inciting') {
      story.phase = 'rising';
    }
    
    // Check for resolution
    if (event.type === 'death' && event.victims?.some(v => story.actors.includes(v))) {
      // Key actor died - might resolve story
      if (story.type === 'hunt' && story.actors[1] && event.victims.includes(story.actors[1])) {
        // The quarry was killed!
        story.resolved = true;
        story.phase = 'resolution';
        story.resolution = 'The hunt ends in blood.';
        
        logs.push({
          category: 'faction',
          summary: `"${story.title}" concludes`,
          details: story.resolution,
          location: event.location,
          actors: story.actors,
          worldTime: event.timestamp,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

// ============================================================================
// RUMOR SPREADING
// ============================================================================

function spreadEventAsRumor(event: WorldEvent, world: WorldState, rng: Random): void {
  const originSettlement = world.settlements.find(s => s.name === event.location);
  if (!originSettlement) return;
  
  // Spread to nearby settlements
  for (const settlement of world.settlements) {
    if (settlement.name === event.location) continue;
    if (rng.chance(0.3)) {
      queueConsequence({
        type: 'spawn-rumor',
        triggerEvent: event.type,
        turnsUntilResolution: 6 + rng.int(24),
        data: {
          origin: settlement.name,
          target: event.location,
          kind: 'mystery',
          text: generateRumorText(event, rng),
        },
        priority: event.magnitude,
      });
    }
  }
}

function generateRumorText(event: WorldEvent, rng: Random): string {
  const templates: Record<WorldEventType, string[]> = {
    raid: [
      `Raiders struck at ${event.location}. They say ${event.perpetrators?.[0] ?? 'bandits'} were responsible.`,
      `${event.location} was attacked! Survivors speak of ${event.perpetrators?.[0] ?? 'unknown assailants'}.`,
    ],
    battle: [
      `A battle was fought near ${event.location}. Blood stains the earth.`,
      `${event.actors?.join(' and ') ?? 'Warriors'} clashed at ${event.location}.`,
    ],
    death: [
      `${event.victims?.[0] ?? 'Someone important'} has died at ${event.location}.`,
      `They say ${event.victims?.[0] ?? 'a notable figure'} met their end. Foul play is suspected.`,
    ],
    robbery: [
      `Thieves struck near ${event.location}. The roads grow dangerous.`,
      `A valuable shipment was lost near ${event.location}.`,
    ],
    discovery: [
      `Something wondrous was found near ${event.location}!`,
      `Treasure-seekers should head to ${event.location}, they say.`,
    ],
    alliance: [
      `${event.actors?.join(' and ') ?? 'Great powers'} have joined forces.`,
      `A pact was sealed. The balance of power shifts.`,
    ],
    betrayal: [
      `Treachery most foul! ${event.actors?.[0] ?? 'Someone'} broke faith.`,
      `Trust is a currency spent in ${event.location}.`,
    ],
    conquest: [
      `${event.location} has new masters now.`,
      `The banners have changed at ${event.location}.`,
    ],
    disaster: [
      `Catastrophe struck ${event.location}. The gods must be angry.`,
      `${event.location} suffers greatly. Refugees flee.`,
    ],
    miracle: [
      `A miracle occurred at ${event.location}! The faithful rejoice.`,
      `Divine favor shines upon ${event.location}.`,
    ],
    assassination: [
      `${event.victims?.[0] ?? 'A leader'} was murdered. Intrigue thickens.`,
      `Someone paid for ${event.victims?.[0] ?? 'a death'} in ${event.location}.`,
    ],
    recruitment: [`A faction grows stronger.`],
    defection: [`Loyalties shift.`],
    'trade-deal': [`Commerce flows.`],
    embargo: [`Trade routes close.`],
    festival: [`Celebration in ${event.location}!`],
    plague: [`Sickness spreads from ${event.location}. Avoid the afflicted.`],
    famine: [`${event.location} starves. Food is worth gold.`],
    uprising: [`The people of ${event.location} rise against their masters!`],
    prophecy: [`Strange omens seen near ${event.location}.`],
  };
  
  const options = templates[event.type] ?? [`Something happened at ${event.location}.`];
  return rng.pick(options);
}

// ============================================================================
// STATE GETTERS/SETTERS - Lazy initialization of deep state
// ============================================================================

function getSettlementState(world: WorldState, settlementName: string): SettlementState {
  if (!world.settlementStates) world.settlementStates = {};
  if (!world.settlementStates[settlementName]) {
    world.settlementStates[settlementName] = {
      prosperity: 0,
      safety: 5,
      unrest: 0,
      populationDelta: 0,
      recentEvents: [],
      contested: false,
      defenseLevel: 3,
    };
  }
  return world.settlementStates[settlementName];
}

function getFactionState(world: WorldState, factionId: string): FactionState {
  if (!world.factionStates) world.factionStates = {};
  if (!world.factionStates[factionId]) {
    world.factionStates[factionId] = {
      power: 50,
      territory: [],
      enemies: [],
      allies: [],
      resources: 100,
      morale: 0,
      activeOperations: [],
      recentLosses: 0,
      recentWins: 0,
    };
  }
  return world.factionStates[factionId];
}

function getPartyState(world: WorldState, partyId: string): PartyState {
  if (!world.partyStates) world.partyStates = {};
  if (!world.partyStates[partyId]) {
    world.partyStates[partyId] = {
      morale: 5,
      resources: 50,
      enemies: [],
      allies: [],
      questLog: [],
      killList: [],
      reputation: {},
    };
  }
  return world.partyStates[partyId];
}

// Export state getters for use elsewhere
export { getSettlementState, getFactionState, getPartyState };

