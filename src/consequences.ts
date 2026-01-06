/**
 * CONSEQUENCE CHAIN SYSTEM
 * 
 * Events spawn follow-up events, creating emergent narrative arcs.
 * A bandit attack might lead to:
 *   - A merchant hiring guards (economy impact)
 *   - A faction sending patrols (faction action)
 *   - Rumors spreading (information)
 *   - Survivors seeking revenge (quest hook)
 * 
 * These chains give the world a sense of cause-and-effect that 
 * makes stories feel connected rather than random.
 */

import { Random, makeRandom } from './rng.ts';
import { WorldState, LogEntry, LogCategory, Party, Settlement, Faction, NPC, Rumor } from './types.ts';
import { createRumor } from './rumors.ts';
import { randomName } from './naming.ts';

export type ConsequenceType =
  | 'spawn-rumor'
  | 'spawn-quest'
  | 'faction-action'
  | 'npc-reaction'
  | 'settlement-change'
  | 'spawn-antagonist'
  | 'economic-shift'
  | 'spawn-event'
  | 'supply-disruption';

export interface PendingConsequence {
  id: string;
  type: ConsequenceType;
  triggerEvent: string; // Summary of what caused this
  turnsUntilResolution: number; // Delayed consequences
  data: Record<string, unknown>;
  priority: number; // Higher = more likely to fire
}

export interface ConsequenceQueue {
  pending: PendingConsequence[];
}

// Global consequence queue (would be persisted with world state in production)
let consequenceQueue: ConsequenceQueue = { pending: [] };

export function getConsequenceQueue(): ConsequenceQueue {
  return consequenceQueue;
}

export function setConsequenceQueue(queue: ConsequenceQueue): void {
  consequenceQueue = queue;
}

// Add a consequence to the queue
export function queueConsequence(consequence: Omit<PendingConsequence, 'id'>): void {
  // Use seeded randomness for deterministic IDs
  const rng = makeRandom('consequence-seed');
  const id = `conseq-${rng.int(1000000)}-${rng.int(1000000)}`;
  consequenceQueue.pending.push({ ...consequence, id });
}

// Process pending consequences - called each tick
export function processConsequences(
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  const stillPending: PendingConsequence[] = [];

  for (const consequence of consequenceQueue.pending) {
    consequence.turnsUntilResolution -= 1;

    if (consequence.turnsUntilResolution <= 0) {
      // Time to resolve this consequence
      const result = resolveConsequence(consequence, world, rng, worldTime);
      if (result) logs.push(...result);
    } else {
      stillPending.push(consequence);
    }
  }

  consequenceQueue.pending = stillPending;
  return logs;
}

// Resolve a single consequence
function resolveConsequence(
  consequence: PendingConsequence,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  switch (consequence.type) {
    case 'spawn-rumor': {
      const { origin, target, kind, text } = consequence.data as {
        origin: string;
        target: string;
        kind: Rumor['kind'];
        text: string;
      };
      const rumor = createRumor(world, rng, origin, target, kind, text);
      world.activeRumors.push(rumor);
      logs.push({
        category: 'town',
        summary: `Word spreads in ${origin}`,
        details: rumor.text,
        location: origin,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      break;
    }

    case 'faction-action': {
      const { factionId, action, targetLocation } = consequence.data as {
        factionId: string;
        action: 'patrol' | 'retaliate' | 'trade-embargo' | 'recruit' | 'expand';
        targetLocation?: string;
      };
      const faction = world.factions.find((f) => f.id === factionId);
      if (!faction) break;

      const actionResults = resolveFactionAction(faction, action, targetLocation, world, rng, worldTime);
      logs.push(...actionResults);
      break;
    }

    case 'npc-reaction': {
      const { npcId, reaction, cause } = consequence.data as {
        npcId: string;
        reaction: 'seek-revenge' | 'flee' | 'seek-protection' | 'spread-rumors';
        cause: string;
      };
      const npc = world.npcs.find((n) => n.id === npcId);
      if (!npc || npc.alive === false) break;

      const reactionLogs = resolveNPCReaction(npc, reaction, cause, world, rng, worldTime);
      logs.push(...reactionLogs);
      break;
    }

    case 'settlement-change': {
      const { settlementName, change, magnitude } = consequence.data as {
        settlementName: string;
        change: 'mood-shift' | 'supply-disruption' | 'population-change';
        magnitude: number;
      };
      const settlement = world.settlements.find((s) => s.name === settlementName);
      if (!settlement) break;

      if (change === 'mood-shift') {
        const oldMood = settlement.mood;
        settlement.mood = Math.max(-3, Math.min(3, settlement.mood + magnitude));
        if (settlement.mood !== oldMood) {
          const moodWord = magnitude > 0 ? 'improves' : 'darkens';
          logs.push({
            category: 'town',
            summary: `Mood ${moodWord} in ${settlement.name}`,
            details: `Following recent events, the people's spirit ${moodWord === 'improves' ? 'lifts' : 'sinks'}.`,
            location: settlement.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
      break;
    }

    case 'spawn-antagonist': {
      const { location, threat, origin } = consequence.data as {
        location: string;
        threat: string;
        origin: string;
      };
      // Create a new threatening presence (could be expanded to proper antagonist system)
      logs.push({
        category: 'road',
        summary: `A new threat emerges near ${location}`,
        details: `${threat}. This is a consequence of ${origin}.`,
        location,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Spawn related rumors
      // Real-time: ~12-24 hours for rumors to reach the town (72-144 turns)
      queueConsequence({
        type: 'spawn-rumor',
        triggerEvent: `New threat: ${threat}`,
        turnsUntilResolution: 72 + rng.int(72),
        data: {
          origin: location,
          target: location,
          kind: 'monster-sign',
          text: `Travelers speak of ${threat.toLowerCase()} on the roads near ${location}.`,
        },
        priority: 3,
      });
      break;
    }

    case 'spawn-event': {
      const { category, summary, details, location, actors } = consequence.data as {
        category: LogCategory;
        summary: string;
        details: string;
        location?: string;
        actors?: string[];
      };
      logs.push({
        category,
        summary,
        details,
        location,
        actors,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      break;
    }

    case 'supply-disruption': {
      const { armyId, duration } = consequence.data as { armyId: string; duration: number };
      const army = world.armies.find(a => a.id === armyId);
      if (army) {
        army.supplies = Math.max(0, army.supplies - 30);
        logs.push({
          category: 'faction',
          summary: `Sudden supply shortage for ${army.ownerId}'s forces`,
          details: `A critical supply caravan was lost or delayed. The army at ${army.location} is feeling the pinch.`,
          location: army.location,
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

// Faction takes action in response to events
function resolveFactionAction(
  faction: Faction,
  action: string,
  targetLocation: string | undefined,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  switch (action) {
    case 'patrol': {
      const patrolPhrases = {
        martial: [
          `Armed members of ${faction.name} now patrol the roads${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} deploys additional troops to secure trade routes${targetLocation ? ` around ${targetLocation}` : ''}.`,
          `Warriors from ${faction.name} stand guard along the highways${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} establishes checkpoints to deter bandits${targetLocation ? ` around ${targetLocation}` : ''}.`,
        ],
        pious: [
          `Devout members of ${faction.name} now walk the roads in prayer${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} blesses travelers and watches for signs of corruption${targetLocation ? ` around ${targetLocation}` : ''}.`,
          `Pilgrims from ${faction.name} patrol the sacred paths${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} sends holy warriors to protect the faithful${targetLocation ? ` around ${targetLocation}` : ''}.`,
        ],
        trade: [
          `Mercantile guards from ${faction.name} now protect the roads${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} hires additional caravan escorts for safety${targetLocation ? ` around ${targetLocation}` : ''}.`,
          `Traders from ${faction.name} organize mutual protection pacts${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} establishes toll stations to fund road security${targetLocation ? ` around ${targetLocation}` : ''}.`,
        ],
        arcane: [
          `Mystical wards from ${faction.name} now protect the roads${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} summons guardians to watch over travelers${targetLocation ? ` around ${targetLocation}` : ''}.`,
          `Arcane sentinels from ${faction.name} patrol the pathways${targetLocation ? ` near ${targetLocation}` : ''}.`,
          `${faction.name} enchants the roads against unlawful passage${targetLocation ? ` around ${targetLocation}` : ''}.`,
        ],
      };

      logs.push({
        category: 'faction',
        summary: `${faction.name} increases patrols`,
        details: rng.pick(patrolPhrases[faction.focus] || patrolPhrases.martial),
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Improve attitude where they patrol
      if (targetLocation) {
        const prevAttitude = faction.attitude[targetLocation] ?? 0;
        faction.attitude[targetLocation] = Math.min(3, prevAttitude + 1);
      }
      break;
    }

    case 'retaliate': {
      const targetName = targetLocation ?? 'their enemies';
      const retributionPhrases = {
        martial: [
          `${faction.name} marshals troops for vengeance against ${targetName}.`,
          `Warriors of ${faction.name} prepare a punitive expedition against ${targetName}.`,
          `${faction.name} declares a blood feud against ${targetName}.`,
          `The ${faction.focus} faction raises arms for retribution against ${targetName}.`,
        ],
        pious: [
          `${faction.name} calls for divine justice against ${targetName}.`,
          `Holy warriors of ${faction.name} prepare to smite ${targetName}.`,
          `${faction.name} declares a crusade against the wickedness of ${targetName}.`,
          `The ${faction.focus} faction marshals the faithful against ${targetName}.`,
        ],
        trade: [
          `${faction.name} organizes a trade embargo against ${targetName}.`,
          `Mercantile houses of ${faction.name} cut ties with ${targetName}.`,
          `${faction.name} hires bounty hunters to pursue ${targetName}.`,
          `The ${faction.focus} faction marshals economic power against ${targetName}.`,
        ],
        arcane: [
          `${faction.name} weaves curses against ${targetName}.`,
          `Mages of ${faction.name} prepare mystical vengeance on ${targetName}.`,
          `${faction.name} summons otherworldly allies against ${targetName}.`,
          `The ${faction.focus} faction marshals arcane forces against ${targetName}.`,
        ],
      };

      logs.push({
        category: 'faction',
        summary: `${faction.name} seeks retribution`,
        details: rng.pick(retributionPhrases[faction.focus] || retributionPhrases.martial),
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Spawn a follow-up conflict event
      // Real-time: ~2-3 days to retaliate (288-432 turns)
      queueConsequence({
        type: 'spawn-event',
        triggerEvent: `${faction.name} retaliation`,
        turnsUntilResolution: 288 + rng.int(144), 
        data: {
          category: 'faction',
          summary: `${faction.name} strikes back`,
          details: `Agents of ${faction.name} carry out their vengeance. The repercussions will be felt.`,
          location: targetLocation,
          actors: [faction.name],
        },
        priority: 4,
      });
      break;
    }

    case 'recruit': {
      const settlement = targetLocation ? world.settlements.find((s) => s.name === targetLocation) : rng.pick(world.settlements);
      if (!settlement) break;

      logs.push({
        category: 'faction',
        summary: `${faction.name} recruiting in ${settlement.name}`,
        details: `Agents seek new members, promising coin and purpose.`,
        location: settlement.name,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      break;
    }

    case 'trade-embargo': {
      if (!targetLocation) break;
      const settlement = world.settlements.find((s) => s.name === targetLocation);
      if (!settlement) break;

      // Worsen faction attitude and disrupt supply
      faction.attitude[targetLocation] = Math.max(-3, (faction.attitude[targetLocation] ?? 0) - 2);

      logs.push({
        category: 'faction',
        summary: `${faction.name} cuts ties with ${targetLocation}`,
        details: `Caravans flying the ${faction.name} banner no longer enter ${settlement.name}.`,
        location: targetLocation,
        actors: [faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Economic consequence
      queueConsequence({
        type: 'settlement-change',
        triggerEvent: `Trade embargo by ${faction.name}`,
        turnsUntilResolution: 3,
        data: {
          settlementName: targetLocation,
          change: 'mood-shift',
          magnitude: -1,
        },
        priority: 2,
      });
      break;
    }
  }

  return logs;
}

// NPC reacts to events
function resolveNPCReaction(
  npc: NPC,
  reaction: string,
  cause: string,
  world: WorldState,
  rng: Random,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];

  switch (reaction) {
    case 'seek-revenge': {
      logs.push({
        category: 'town',
        summary: `${npc.name} vows vengeance`,
        details: `Following ${cause}, the ${npc.role} swears an oath that cannot go unanswered.`,
        location: npc.location,
        actors: [npc.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Future revenge event
      queueConsequence({
        type: 'spawn-event',
        triggerEvent: `${npc.name}'s revenge`,
        turnsUntilResolution: 24 + rng.int(48), // Days
        data: {
          category: 'town',
          summary: `${npc.name} makes their move`,
          details: `The vengeance long promised by the ${npc.role} comes to pass.`,
          location: npc.location,
          actors: [npc.name],
        },
        priority: 3,
      });
      break;
    }

    case 'flee': {
      const destinations = world.settlements.filter((s) => s.name !== npc.location);
      if (destinations.length === 0) break;

      const destination = rng.pick(destinations);
      logs.push({
        category: 'road',
        summary: `${npc.name} flees ${npc.location}`,
        details: `Driven by ${cause}, they take to the road toward ${destination.name}.`,
        location: npc.location,
        actors: [npc.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Update NPC location later
      queueConsequence({
        type: 'spawn-event',
        triggerEvent: `${npc.name}'s flight`,
        turnsUntilResolution: 12 + rng.int(24),
        data: {
          category: 'town',
          summary: `${npc.name} arrives in ${destination.name}`,
          details: `The refugee finds uncertain welcome in their new home.`,
          location: destination.name,
          actors: [npc.name],
        },
        priority: 2,
      });
      npc.location = destination.name; // Update immediately for consistency
      break;
    }

    case 'spread-rumors': {
      const targetLocation = npc.location;
      logs.push({
        category: 'town',
        summary: `${npc.name} spreads tales`,
        details: `The ${npc.role} speaks openly of ${cause}. The story grows in the telling.`,
        location: targetLocation,
        actors: [npc.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      queueConsequence({
        type: 'spawn-rumor',
        triggerEvent: `${npc.name} gossip`,
        turnsUntilResolution: 1,
        data: {
          origin: targetLocation,
          target: targetLocation,
          kind: 'mystery',
          text: `${npc.name} tells all who will listen: "${cause}." The tale spreads.`,
        },
        priority: 2,
      });
      break;
    }

    case 'seek-protection': {
      // Find a faction to appeal to
      const applicableFactions = world.factions.filter((f) => f.focus === 'martial' || f.focus === 'pious');
      if (applicableFactions.length === 0) break;

      const faction = rng.pick(applicableFactions);
      logs.push({
        category: 'faction',
        summary: `${npc.name} seeks ${faction.name}'s protection`,
        details: `Frightened by ${cause}, the ${npc.role} appeals to the ${faction.focus} faction.`,
        location: npc.location,
        actors: [npc.name, faction.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });

      // Faction might respond
      if (rng.chance(0.5)) {
        queueConsequence({
          type: 'faction-action',
          triggerEvent: `${npc.name}'s appeal`,
          turnsUntilResolution: 6 + rng.int(12),
          data: {
            factionId: faction.id,
            action: 'patrol',
            targetLocation: npc.location,
          },
          priority: 2,
        });
      }
      break;
    }
  }

  return logs;
}

// Event analysis - determine what consequences an event should spawn
export function analyzeEventForConsequences(
  event: LogEntry,
  world: WorldState,
  rng: Random,
): void {
  const summary = event.summary.toLowerCase();
  const location = event.location ?? '';

  // Combat/violence events
  if (
    summary.includes('clash') ||
    summary.includes('ambush') ||
    summary.includes('battle') ||
    summary.includes('falls') ||
    summary.includes('driven back')
  ) {
    // NPCs might react
    const npcsInLocation = world.npcs.filter((n) => n.location === location && n.alive !== false);
    for (const npc of npcsInLocation) {
      if (rng.chance(0.2)) {
        const reactions: ('seek-revenge' | 'flee' | 'spread-rumors' | 'seek-protection')[] =
          ['seek-revenge', 'flee', 'spread-rumors', 'seek-protection'];
        queueConsequence({
          type: 'npc-reaction',
          triggerEvent: event.summary,
          // Real-time: 1-6 hours (6-36 turns)
          turnsUntilResolution: 6 + rng.int(30),
          data: {
            npcId: npc.id,
            reaction: rng.pick(reactions),
            cause: event.summary,
          },
          priority: 2,
        });
      }
    }

    // Factions might respond
    for (const faction of world.factions) {
      if (rng.chance(0.15)) {
        queueConsequence({
          type: 'faction-action',
          triggerEvent: event.summary,
          // Real-time: 12-24 hours (72-144 turns)
          turnsUntilResolution: 72 + rng.int(72),
          data: {
            factionId: faction.id,
            action: rng.chance(0.5) ? 'patrol' : 'retaliate',
            targetLocation: location,
          },
          priority: 3,
        });
      }
    }

    // Mood shift in settlement
    if (location && world.settlements.some((s) => s.name === location)) {
      queueConsequence({
        type: 'settlement-change',
        triggerEvent: event.summary,
        turnsUntilResolution: 2,
        data: {
          settlementName: location,
          change: 'mood-shift',
          magnitude: -1,
        },
        priority: 1,
      });
    }
  }

  // Caravan events
  if (summary.includes('caravan') && (summary.includes('loss') || summary.includes('raid'))) {
    const relevantFaction = world.factions.find((f) => summary.includes(f.name.toLowerCase()));
    if (relevantFaction) {
      // 1. Retaliation
      queueConsequence({
        type: 'faction-action',
        triggerEvent: event.summary,
        // Real-time: 2-3 days (288-432 turns)
        turnsUntilResolution: 288 + rng.int(144),
        data: {
          factionId: relevantFaction.id,
          action: 'retaliate',
          targetLocation: location,
        },
        priority: 4,
      });

      // 2. Supply disruption if an army was relying on this route
      const armyNear = world.armies.find(a => a.ownerId === relevantFaction.id && a.supplyLineFrom === location);
      if (armyNear) {
        queueConsequence({
          type: 'supply-disruption',
          triggerEvent: event.summary,
          turnsUntilResolution: 6 + rng.int(12),
          data: { armyId: armyNear.id },
          priority: 5,
        });
      }
    }
  }

  // Famous party events spawn rumors
  if (event.actors?.length && summary.includes('gain renown')) {
    const partyName = event.actors[0];
    queueConsequence({
      type: 'spawn-rumor',
      triggerEvent: event.summary,
      // Real-time: 6-12 hours (36-72 turns)
      turnsUntilResolution: 36 + rng.int(36),
      data: {
        origin: location,
        target: location,
        kind: 'mystery',
        text: `Tales of ${partyName}'s deeds spread across the region. Some say they ${rng.pick(['slew a beast of legend', 'recovered ancient treasures', 'survived impossible odds', 'earned the gratitude of the common folk'])}.`,
      },
      priority: 2,
    });
  }

  // Dungeon events
  if (summary.includes('dungeon') || summary.includes('ruin')) {
    if (summary.includes('artifact') || summary.includes('relic') || summary.includes('treasure')) {
      // Treasure discoveries attract attention
      queueConsequence({
        type: 'spawn-antagonist',
        triggerEvent: event.summary,
        turnsUntilResolution: 24 + rng.int(48),
        data: {
          location: location,
          threat: 'Rivals drawn by tales of treasure',
          origin: event.summary,
        },
        priority: 3,
      });
    }
  }
}

