/**
 * BECMI Real-Time Simulator - Main Entry Point
 * 
 * A rich emergent narrative engine that simulates a fantasy world
 * in real-time, generating story logs from deep simulation systems.
 */

import { config } from './config.ts';
import { EventBus } from './events.ts';
import { Logger } from './logging.ts';
import { makeRandom } from './rng.ts';
import { Scheduler } from './scheduler.ts';
import { LogEntry, TickEvent, EnhancedWorldState } from './types.ts';
import { createInitialWorld, isCoastalHex } from './world.ts';
import { updateTravel, maybeStartTravel } from './travel.ts';
import { loadWorld, saveWorld } from './persistence.ts';
import { dailyTownTick } from './town.ts';
import { advanceCaravans } from './trade.ts';

// Enhanced systems
import { processConsequences, setConsequenceQueue, getConsequenceQueue, analyzeEventForConsequences } from './consequences.ts';
import { CalendarState, getCalendarFromDate, dailyCalendarTick, generateWeather, getSeason, formatDate } from './calendar.ts';
import { Antagonist, seedAntagonists, antagonistAct, introduceAntagonist } from './antagonists.ts';
import { enhancedEncounter, encounterSign } from './encounters-enhanced.ts';
import { StoryThread, tickStories, checkForStorySpawn } from './stories.ts';
import { DeepNPC, deepenNPC, seedRelationships, relationshipEvent } from './character.ts';
import { settlementScene, marketBeat, arrivalScene, departureScene } from './prose.ts';

// Deep causality systems
import { tickNPCAgency, tickPartyAgency, tickFactionOperations, tickSpellcasting, tickLevelUps, tickArmyRaising, tickNexuses } from './agency.ts';
import { processWorldEvent, WorldEvent, getSettlementState, getFactionState, getPartyState } from './causality.ts';
import { tickDomains } from './domain.ts';
import { tickArmies } from './war-machine.ts';
import { tickRuins } from './ruins.ts';
import { tickDisease, tickMercenaries } from './logistics.ts';
import { tickDiplomacy } from './diplomacy.ts';

// Legendary spikes
import { LegendaryState, createLegendaryState, maybeLegendarySpike, checkLegendaryEncounter } from './legendary.ts';

// New systems
import { RetainerRoster, createRetainerRoster, tickRetainers } from './retainers.ts';
import { GuildState, createGuildState, seedGuilds, tickGuilds } from './guilds.ts';
import { EcologyState, createEcologyState, seedEcology, tickEcology } from './ecology.ts';
import { DynastyState, createDynastyState, seedDynasty, tickDynasty } from './dynasty.ts';
import { TreasureState, createTreasureState, tickTreasure } from './treasure.ts';
import { NavalState, seedNavalState, tickNavalHourly, tickNavalDaily, markSettlementAsPort } from './naval.ts';
import { exploreDungeonTick } from './dungeon.ts';

const bus = new EventBus();
const rng = makeRandom(config.seed);
const logger = new Logger(config.logDir);

// Enhanced world state
let world: EnhancedWorldState;
let calendar: CalendarState;
let antagonists: Antagonist[] = [];
let storyThreads: StoryThread[] = [];
let legendaryState: LegendaryState = createLegendaryState();

// New systems state
let retainerRoster: RetainerRoster = createRetainerRoster();
let guildState: GuildState = createGuildState();
let ecologyState: EcologyState = createEcologyState();
let dynastyState: DynastyState = createDynastyState();
let treasureState: TreasureState = createTreasureState();
let navalState: NavalState = { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };

let initialized = false;

// Global error handling for production stability
process.on('uncaughtException', (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', error);
  console.error('Stack trace:', error.stack);
  // Save state before exit
  if (world) {
    saveWorld(world).catch(saveError => {
      console.error('Failed to save world on crash:', saveError);
    }).finally(() => {
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  // Don't exit - let the process continue
});

process.on('SIGTERM', () => {
  console.log('📡 Received SIGTERM, shutting down gracefully...');
  if (world) {
    saveWorld(world).then(() => {
      console.log('💾 World saved successfully');
      process.exit(0);
    }).catch(error => {
      console.error('Failed to save world on shutdown:', error);
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('📡 Received SIGINT, shutting down gracefully...');
  if (world) {
    saveWorld(world).then(() => {
      console.log('💾 World saved successfully');
      process.exit(0);
    }).catch(error => {
      console.error('Failed to save world on shutdown:', error);
      process.exit(1);
    });
  } else {
    process.exit(0);
  }
});

// Log helper with consequence analysis
async function log(entry: Omit<LogEntry, 'realTime'>) {
  const fullEntry = { ...entry, realTime: new Date() };
  await logger.log(fullEntry);

  // Analyze significant events for story spawns
  if (entry.category !== 'weather' && entry.category !== 'system') {
    const newStory = checkForStorySpawn(fullEntry, world, rng, storyThreads);
    if (newStory) {
      storyThreads.push(newStory);
      await log({
        category: 'faction',
        summary: `A new tale begins: "${newStory.title}"`,
        details: newStory.summary,
        location: newStory.location,
        actors: newStory.actors,
        worldTime: entry.worldTime,
        seed: config.seed,
      });
    }

    // Queue consequences for significant events
    analyzeEventForConsequences(fullEntry, world, rng);
  }
}

async function initWorld(): Promise<void> {
  const loaded = await loadWorld();
  if (loaded) {
    world = loaded as EnhancedWorldState;

    // Restore enhanced state if present
    if (world.consequenceQueue) {
      setConsequenceQueue(world.consequenceQueue);
    }

    // Deepen existing NPCs if needed
    for (let i = 0; i < world.npcs.length; i++) {
      const npc = world.npcs[i];
      if (!(npc as DeepNPC).depth) {
        world.npcs[i] = deepenNPC(rng, npc);
      }
    }

    // Initialize calendar from world time
    calendar = getCalendarFromDate(config.startWorldTime, world.calendar?.weather);
    if (world.calendar) {
      calendar = { ...calendar, ...world.calendar };
    }

    // Restore antagonists
    antagonists = (world.antagonists as Antagonist[]) ?? [];

    // Restore story threads
    storyThreads = (world.storyThreads as StoryThread[]) ?? [];
    
    // Restore legendary state
    legendaryState = (world as any).legendaryState ?? createLegendaryState();
    
    // Restore new systems state
    retainerRoster = world.retainerRoster ?? createRetainerRoster();
    guildState = world.guildState ?? createGuildState();
    ecologyState = world.ecologyState ?? createEcologyState();
    dynastyState = world.dynastyState ?? createDynastyState();
    treasureState = world.treasureState ?? createTreasureState();
    navalState = world.navalState ?? { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };
  } else {
    // Fresh world
    world = createInitialWorld(rng, config.seed, config.startWorldTime) as EnhancedWorldState;

    // Deepen all NPCs with rich character details
    world.npcs = world.npcs.map((npc) => deepenNPC(rng, npc));
    seedRelationships(rng, world.npcs as DeepNPC[], world);

    // Initialize calendar
    calendar = getCalendarFromDate(config.startWorldTime);
    calendar.weather = generateWeather(rng, getSeason(calendar.month));

    // Seed initial antagonists
    antagonists = seedAntagonists(rng, world);

    // Seed new systems
    guildState = seedGuilds(rng, world, config.startWorldTime);
    ecologyState = seedEcology(rng, world, config.startWorldTime);
    dynastyState = seedDynasty(rng, world, config.startWorldTime);
    
    // Mark only coastal settlements as ports (geographic coherence)
    for (const settlement of world.settlements) {
      if (isCoastalHex(world, settlement.coord)) {
        markSettlementAsPort(settlement, rng);
      }
    }
    navalState = seedNavalState(world, rng);

    // Log world creation
    await log({
      category: 'system',
      summary: `The chronicle begins: ${world.archetype}`,
      details: `${formatDate(calendar)}. The simulation awakens in an era known as the ${world.archetype}.`,
      worldTime: config.startWorldTime,
      seed: config.seed,
    });

    // Introduce initial settlements
    for (const settlement of world.settlements) {
      const scene = settlementScene(rng, settlement, config.startWorldTime);
      await log({
        category: 'town',
        summary: `${settlement.name} stirs to life`,
        details: scene,
        location: settlement.name,
        worldTime: config.startWorldTime,
        seed: config.seed,
      });
    }

    // Introduce antagonists with delay
    for (const ant of antagonists) {
      const introLogs = introduceAntagonist(ant, world, rng, config.startWorldTime);
      for (const l of introLogs) await log(l);
    }

    await saveWorld(world);
  }

  initialized = true;
}

// Hourly tick - travel, encounters, caravans
function onHourTick(event: TickEvent): void {
  if (!initialized) return;

  void (async () => {
    // Heartbeat - ensures at least one log per hour for health monitoring
    // Only log every 6 hours to avoid spam (at 00:00, 06:00, 12:00, 18:00)
    const hour = event.worldTime.getUTCHours();
    if (hour % 6 === 0) {
      const activeParties = world.parties.filter(p => p.status === 'travel').length;
      const idleParties = world.parties.filter(p => p.status === 'idle').length;
      await logger.log({
        category: 'system',
        summary: `The world turns (${formatDate(calendar)})`,
        details: `${activeParties} parties traveling, ${idleParties} resting. ${antagonists.filter(a => a.alive).length} threats lurk.`,
        worldTime: event.worldTime,
        realTime: new Date(),
        seed: config.seed,
      });
    }

    // Update travel with enhanced encounters
    for (const party of world.parties) {
      if (party.status === 'travel' && party.travel) {
        // Chance for sign/track encounter
        const sign = encounterSign(rng, party.travel.terrain, event.worldTime, party.location, party.name, world.seed);
        if (sign) await log(sign);

        // Full encounter check with rich prose
        const enc = enhancedEncounter(rng, party.travel.terrain, event.worldTime, party.location, party, world, calendar);
        if (enc) {
          if (enc.delayMiles) party.travel.milesRemaining += enc.delayMiles;
          if (enc.fatigueDelta) party.fatigue = (party.fatigue ?? 0) + enc.fatigueDelta;
          if (enc.injured) {
            party.wounded = true;
            party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
          }
          if (enc.death) {
            party.fame = Math.max(0, (party.fame ?? 0) - 1);
          } else if (enc.category === 'road') {
            party.fame = (party.fame ?? 0) + 1;
          }
          await log(enc);
        }
        
        // Check for legendary encounters (unique monsters, weapon discoveries)
        const legendaryEncs = checkLegendaryEncounter(rng, party, party.location, legendaryState, event.worldTime, world.seed, world, antagonists, storyThreads);
        for (const lEnc of legendaryEncs) {
          await log(lEnc);
          party.fame = (party.fame ?? 0) + 5; // Major fame boost for legendary encounters
        }
      }
    }

    // Standard travel updates (arrivals, departures)
    const travelLogs = updateTravel(world, rng, event.worldTime);
    for (const entry of travelLogs) await log(entry);

    // Caravan advancement
    const caravanLogs = advanceCaravans(world, rng, event.worldTime);
    for (const entry of caravanLogs) await log(entry);

    // Process pending consequences
    const conseqLogs = processConsequences(world, rng, event.worldTime);
    for (const entry of conseqLogs) await log(entry);

    // NPC relationship events (rare)
    if (rng.chance(0.05)) {
      const npc = rng.pick(world.npcs) as DeepNPC;
      if (npc.depth && npc.alive !== false) {
        const relEvent = relationshipEvent(rng, npc, world, event.worldTime);
        if (relEvent) await log(relEvent);
      }
    }

    // Antagonist activity (rare)
    if (rng.chance(0.03)) {
      const activeAntagonists = antagonists.filter((a) => a.alive);
      if (activeAntagonists.length) {
        const ant = rng.pick(activeAntagonists);
        const antLogs = antagonistAct(ant, world, rng, event.worldTime);
        for (const l of antLogs) await log(l);
      }
    }

    // Progress story threads
    if (rng.chance(0.1)) {
      const storyLogs = tickStories(rng, storyThreads, world, event.worldTime);
      for (const l of storyLogs) await log(l);
    }

    // === DEEP CAUSALITY: Agency systems ===
    
    // NPC agency - NPCs act on memories, grudges, and agendas
    const npcAgencyLogs = tickNPCAgency(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of npcAgencyLogs) await log(l);
    
    // Party agency - Parties pursue quests and vendettas
    const partyAgencyLogs = tickPartyAgency(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of partyAgencyLogs) await log(l);
    
    // Faction operations - Strategic faction actions
    const factionOpLogs = tickFactionOperations(world, rng, event.worldTime, antagonists, storyThreads);
    for (const l of factionOpLogs) await log(l);

    // Spellcasting - High level magic effects
    const spellLogs = tickSpellcasting(world, rng, event.worldTime);
    for (const l of spellLogs) await log(l);

    // Nexus updates - Power sources and resource needs
    const nexusLogs = tickNexuses(world, rng, event.worldTime);
    for (const l of nexusLogs) await log(l);

    // Level ups - Progress characters
    const levelLogs = tickLevelUps(world, rng, event.worldTime);
    for (const l of levelLogs) await log(l);

    // Army Raising - Factions and Lords recruit troops
    const raisingLogs = tickArmyRaising(world, rng, event.worldTime);
    for (const l of raisingLogs) await log(l);

    // Ruins tick - Factions re-occupy cleared areas
    const ruinLogs = tickRuins(world, rng, event.worldTime);
    for (const entry of ruinLogs) await log(entry);

    // Mass Combat - Move armies and resolve battles
    const armyLogs = tickArmies(world, rng, event.worldTime);
    for (const l of armyLogs) await log(l);

    // Logistics - Mercenaries and Disease
    const diseaseLogs = tickDisease(world, rng, event.worldTime);
    for (const l of diseaseLogs) await log(l);

    const mercLogs = tickMercenaries(world, rng, event.worldTime);
    for (const l of mercLogs) await log(l);

    const diplomacyLogs = tickDiplomacy(world, rng, event.worldTime);
    for (const l of diplomacyLogs) await log(l);

    // === NEW SYSTEMS ===
    
    // Retainers - Hiring, loyalty, monthly pay
    const retainerLogs = tickRetainers(rng, retainerRoster, world, event.worldTime);
    for (const l of retainerLogs) await log(l);
    
    // Thieves' Guild - Heists, fencing, turf wars
    const guildLogs = tickGuilds(rng, guildState, world, event.worldTime);
    for (const l of guildLogs) await log(l);
    
    // Monster Ecology - Breeding, migration, apex predators
    const ecologyLogs = tickEcology(rng, ecologyState, world, antagonists, event.worldTime);
    for (const l of ecologyLogs) await log(l);
    
    // Dynasty - Aging, births, marriages, succession
    const dynastyLogs = tickDynasty(rng, dynastyState, world, event.worldTime);
    for (const l of dynastyLogs) await log(l);
    
    // Treasure - Magic item tracking, economic effects
    const treasureLogs = tickTreasure(rng, treasureState, world, event.worldTime);
    for (const l of treasureLogs) await log(l);
    
    // Naval - Ship voyages, arrivals
    const navalHourlyLogs = tickNavalHourly(navalState, world, rng, event.worldTime, calendar.weather);
    for (const l of navalHourlyLogs) await log(l);

    // Save enhanced state
    world.calendar = calendar;
    world.antagonists = antagonists as EnhancedWorldState['antagonists'];
    world.storyThreads = storyThreads as EnhancedWorldState['storyThreads'];
    world.consequenceQueue = getConsequenceQueue();
    world.retainerRoster = retainerRoster;
    world.guildState = guildState;
    world.ecologyState = ecologyState;
    world.dynastyState = dynastyState;
    world.treasureState = treasureState;
    world.navalState = navalState;
    world.lastTickAt = event.worldTime; // Track for catch-up
    await saveWorld(world);
  })();
}

// Cleanup old data to prevent memory growth
function pruneOldData(worldTime: Date): void {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const now = worldTime.getTime();
  
  // Prune resolved stories older than 30 days
  storyThreads = storyThreads.filter(s => {
    if (!s.resolved) return true; // Keep active stories
    const resolvedTime = s.lastUpdated?.getTime() ?? s.startedAt.getTime();
    return now - resolvedTime < THIRTY_DAYS_MS;
  });
  
  // Prune dead antagonists older than 90 days
  antagonists = antagonists.filter(a => {
    if (a.alive) return true; // Keep living antagonists
    const lastSeen = a.lastSeen?.getTime() ?? 0;
    return now - lastSeen < NINETY_DAYS_MS;
  });
  
  // Prune dead NPCs with no significant history (older than 90 days, no memories, low fame)
  world.npcs = world.npcs.filter(n => {
    if (n.alive !== false) return true; // Keep living NPCs
    const npcAny = n as any;
    const hasMeaningfulHistory = (npcAny.memories?.length > 5) || (n.fame ?? 0) > 10;
    if (hasMeaningfulHistory) return true; // Keep historically significant NPCs
    // For dead NPCs without history, check if they died recently
    const deathTime = npcAny.diedAt?.getTime() ?? 0;
    return now - deathTime < NINETY_DAYS_MS;
  });
  
  // Cap distant lands/figures to prevent unbounded growth
  if (navalState.distantLands.length > 50) {
    navalState.distantLands = navalState.distantLands
      .sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))
      .slice(0, 50);
  }
  if (navalState.distantFigures.length > 100) {
    navalState.distantFigures = navalState.distantFigures
      .filter(f => f.alive)
      .sort((a, b) => (b.mentionCount ?? 0) - (a.mentionCount ?? 0))
      .slice(0, 100);
  }
}

// Daily tick - weather, town events, calendar progression
function onDayTick(event: TickEvent): void {
  if (!initialized) return;

  void (async () => {
    // Periodic cleanup to prevent memory growth (runs daily)
    pruneOldData(event.worldTime);
    
    // Daily calendar update (weather, festivals, moon phases)
    const { logs: calendarLogs, newCalendar } = dailyCalendarTick(world, rng, event.worldTime, calendar);
    calendar = newCalendar;
    for (const entry of calendarLogs) await log(entry);

    // Maybe start new travel plans
    const startLogs = maybeStartTravel(world, rng, event.worldTime);
    for (const entry of startLogs) await log(entry);

    // Rich town events with prose
    for (const settlement of world.settlements) {
      // Get notable NPCs and parties in this town
      const npcsHere = world.npcs.filter((n) => n.location === settlement.name && n.alive !== false);
      const partiesHere = world.parties.filter((p) => p.location === settlement.name);

      const beat = marketBeat(rng, settlement, event.worldTime, {
        npcs: npcsHere,
        parties: partiesHere,
        tension: settlement.mood,
      });

      if (beat) {
        await log({
          category: 'town',
          summary: beat.summary,
          details: beat.details,
          location: settlement.name,
          worldTime: event.worldTime,
          seed: config.seed,
        });
      }
    }

    // Standard town tick (rumors, supply/demand)
    const townLogs = dailyTownTick(world, rng, event.worldTime);
    for (const entry of townLogs) await log(entry);

    // Domain management - Taxation, growth, unrest (monthly)
    const domainLogs = tickDomains(world, rng, event.worldTime);
    for (const entry of domainLogs) await log(entry);

    // === LEGENDARY SPIKES: Inject rare, unique elements ===
    const legendaryLogs = maybeLegendarySpike(rng, world, event.worldTime, legendaryState);
    for (const entry of legendaryLogs) await log(entry);
    
    // Naval daily - Ship departures, pirate raids, sea monsters
    const navalDailyLogs = tickNavalDaily(navalState, world, rng, event.worldTime, calendar.weather, getSeason(calendar.month));
    for (const l of navalDailyLogs) await log(l);

    // Save state (including legendary state)
    world.calendar = calendar;
    world.antagonists = antagonists as EnhancedWorldState['antagonists'];
    world.storyThreads = storyThreads as EnhancedWorldState['storyThreads'];
    world.consequenceQueue = getConsequenceQueue();
    world.retainerRoster = retainerRoster;
    world.guildState = guildState;
    world.ecologyState = ecologyState;
    world.dynastyState = dynastyState;
    world.treasureState = treasureState;
    world.navalState = navalState;
    world.lastTickAt = event.worldTime; // Track for catch-up
    (world as any).legendaryState = legendaryState; // Persist legendary elements
    await saveWorld(world);
  })();
}

// Turn tick - dungeon exploration level granularity
function onTurnTick(event: TickEvent): void {
  void (async () => {
    // Dungeon exploration happens on the 10-minute turn
    for (const party of world.parties) {
      if (party.status === 'idle') {
        const dungeon = world.dungeons.find((d) => d.name === party.location);
        if (dungeon && dungeon.rooms && dungeon.rooms.length > 0) {
          // If in a dungeon, explore 1 room per turn
          const delveLogs = exploreDungeonTick(rng, dungeon, [party.name], event.worldTime, world.seed, world, treasureState);
          for (const entry of delveLogs) await log(entry);
        }
      }
    }
  })();
}

// Helper to simulate a single turn during catch-up (faster, no delays)
async function simulateTurn(worldTime: Date, turnIndex: number): Promise<void> {
  const tick: TickEvent = { kind: 'turn', worldTime, turnIndex };
  
  // Process turn events synchronously for catch-up
  onTurnTick(tick);
  
  // Check if it's an hour tick
  if (turnIndex % config.hourTurns === 0) {
    onHourTick({ ...tick, kind: 'hour' });
  }
  
  // Check if it's a day tick
  if (turnIndex % (config.hourTurns * config.dayHours) === 0) {
    onDayTick({ ...tick, kind: 'day' });
  }
}

// Catch up missed time when resuming after a pause
async function catchUpMissedTime(): Promise<void> {
  if (!config.catchUp) {
    console.log(`⏰ Catch-up disabled (SIM_CATCH_UP=false)`);
    return;
  }
  
  if (!world.lastTickAt) {
    console.log(`⏰ No lastTickAt in world - starting fresh (no catch-up needed)`);
    return;
  }
  
  const lastTick = new Date(world.lastTickAt);
  const now = new Date();
  const missedMs = now.getTime() - lastTick.getTime();
  const turnMs = config.turnMinutes * 60 * 1000;
  const missedTurns = Math.floor(missedMs / turnMs);
  
  if (missedTurns <= 0) {
    console.log(`⏰ World is current (lastTickAt: ${lastTick.toISOString()})`);
    return;
  }
  
  // Cap catch-up at 7 days (1008 turns) to prevent very long waits
  const maxCatchUp = 7 * 24 * 6; // 7 days of turns
  const turnsToSimulate = Math.min(missedTurns, maxCatchUp);
  const missedDays = Math.floor(missedTurns / (config.hourTurns * config.dayHours));
  const missedHours = Math.floor((missedTurns % (config.hourTurns * config.dayHours)) / config.hourTurns);
  
  console.log(`\n⏰ Catching up ${missedDays}d ${missedHours}h of missed time (${turnsToSimulate} turns)...`);
  
  const catchUpDelayMs = 1000 / config.catchUpSpeed; // ms between turns
  let simulatedTurns = 0;
  
  for (let i = 0; i < turnsToSimulate; i++) {
    const turnWorldTime = new Date(lastTick.getTime() + (i + 1) * turnMs);
    await simulateTurn(turnWorldTime, i + 1);
    simulatedTurns++;
    
    // Progress update every 100 turns
    if (simulatedTurns % 100 === 0) {
      const pct = Math.floor((simulatedTurns / turnsToSimulate) * 100);
      process.stdout.write(`\r⏰ Catch-up progress: ${pct}% (${simulatedTurns}/${turnsToSimulate} turns)`);
    }
    
    // Small delay to prevent CPU overload and allow logs to flush
    await new Promise(r => setTimeout(r, catchUpDelayMs));
  }
  
  console.log(`\n✓ Caught up! World time is now synchronized.`);
  
  // Update world time to now
  world.lastTickAt = now;
  await saveWorld(world);
}

// Batch mode: run N days at max speed then exit
async function runBatchMode(days: number): Promise<void> {
  const TICKS_PER_DAY = config.hourTurns * config.dayHours; // 144 turns per day
  const TOTAL_TICKS = days * TICKS_PER_DAY;
  
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  BATCH MODE: ${days} days (${TOTAL_TICKS} turns)`);
  console.log(`  Seed: ${config.seed}`);
  console.log(`═══════════════════════════════════════════\n`);
  
  let eventCount = 0;
  let lastDayPrinted = 0;
  const originalLog = log;
  
  // Wrap log to count events
  const countingLog = async (entry: Omit<LogEntry, 'realTime'>) => {
    await originalLog(entry);
    eventCount++;
  };
  
  // Temporarily replace global log for counting
  const startTime = Date.now();
  
  for (let t = 0; t <= TOTAL_TICKS; t++) {
    const worldTime = new Date(config.startWorldTime.getTime() + t * config.turnMinutes * 60_000);
    const tick: TickEvent = { kind: 'turn', worldTime, turnIndex: t };
    
    // TURN TICK - dungeon exploration
    for (const party of world.parties) {
      if (party.status === 'idle') {
        const dungeon = world.dungeons.find((d) => d.name === party.location);
        if (dungeon && dungeon.rooms && dungeon.rooms.length > 0) {
          const delveLogs = exploreDungeonTick(rng, dungeon, [party.name], worldTime, world.seed, world, treasureState);
          for (const entry of delveLogs) await countingLog(entry);
        }
      }
    }
    
    // HOURLY TICK
    if (t % config.hourTurns === 0) {
      // Travel encounters
      for (const party of world.parties) {
        if (party.status === 'travel' && party.travel) {
          const sign = encounterSign(rng, party.travel.terrain, worldTime, party.location, party.name, world.seed);
          if (sign) await countingLog(sign);
          
          const enc = enhancedEncounter(rng, party.travel.terrain, worldTime, party.location, party, world, calendar);
          if (enc) {
            if (enc.delayMiles) party.travel.milesRemaining += enc.delayMiles;
            if (enc.fatigueDelta) party.fatigue = (party.fatigue ?? 0) + enc.fatigueDelta;
            if (enc.injured) {
              party.wounded = true;
              party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
            }
            if (enc.death) {
              party.fame = Math.max(0, (party.fame ?? 0) - 1);
            } else if (enc.category === 'road') {
              party.fame = (party.fame ?? 0) + 1;
            }
            await countingLog(enc);
          }
          
          const legendaryEncs = checkLegendaryEncounter(rng, party, party.location, legendaryState, worldTime, world.seed, world, antagonists, storyThreads);
          for (const lEnc of legendaryEncs) {
            await countingLog(lEnc);
            party.fame = (party.fame ?? 0) + 5;
          }
        }
      }
      
      const travelLogs = updateTravel(world, rng, worldTime);
      for (const entry of travelLogs) await countingLog(entry);
      
      const caravanLogs = advanceCaravans(world, rng, worldTime);
      for (const entry of caravanLogs) await countingLog(entry);
      
      const conseqLogs = processConsequences(world, rng, worldTime);
      for (const entry of conseqLogs) await countingLog(entry);
      
      if (rng.chance(0.05)) {
        const npc = rng.pick(world.npcs) as DeepNPC;
        if (npc.depth && npc.alive !== false) {
          const relEvent = relationshipEvent(rng, npc, world, worldTime);
          if (relEvent) await countingLog(relEvent);
        }
      }
      
      if (rng.chance(0.03)) {
        const activeAntagonists = antagonists.filter((a) => a.alive);
        if (activeAntagonists.length) {
          const ant = rng.pick(activeAntagonists);
          const antLogs = antagonistAct(ant, world, rng, worldTime);
          for (const l of antLogs) await countingLog(l);
        }
      }
      
      if (rng.chance(0.1)) {
        const storyLogs = tickStories(rng, storyThreads, world, worldTime);
        for (const l of storyLogs) await countingLog(l);
      }
      
      const npcAgencyLogs = tickNPCAgency(world, rng, worldTime, antagonists, storyThreads);
      for (const l of npcAgencyLogs) await countingLog(l);
      
      const partyAgencyLogs = tickPartyAgency(world, rng, worldTime, antagonists, storyThreads);
      for (const l of partyAgencyLogs) await countingLog(l);
      
      const factionOpLogs = tickFactionOperations(world, rng, worldTime, antagonists, storyThreads);
      for (const l of factionOpLogs) await countingLog(l);
      
      const spellLogs = tickSpellcasting(world, rng, worldTime);
      for (const l of spellLogs) await countingLog(l);
      
      const nexusLogs = tickNexuses(world, rng, worldTime);
      for (const l of nexusLogs) await countingLog(l);
      
      const levelLogs = tickLevelUps(world, rng, worldTime);
      for (const l of levelLogs) await countingLog(l);
      
      const raisingLogs = tickArmyRaising(world, rng, worldTime);
      for (const l of raisingLogs) await countingLog(l);
      
      const ruinLogs = tickRuins(world, rng, worldTime);
      for (const entry of ruinLogs) await countingLog(entry);
      
      const armyLogs = tickArmies(world, rng, worldTime);
      for (const l of armyLogs) await countingLog(l);
      
      const diseaseLogs = tickDisease(world, rng, worldTime);
      for (const l of diseaseLogs) await countingLog(l);
      
      const mercLogs = tickMercenaries(world, rng, worldTime);
      for (const l of mercLogs) await countingLog(l);
      
      const diplomacyLogs = tickDiplomacy(world, rng, worldTime);
      for (const l of diplomacyLogs) await countingLog(l);
      
      const retainerLogs = tickRetainers(rng, retainerRoster, world, worldTime);
      for (const l of retainerLogs) await countingLog(l);
      
      const guildLogs = tickGuilds(rng, guildState, world, worldTime);
      for (const l of guildLogs) await countingLog(l);
      
      const ecologyLogs = tickEcology(rng, ecologyState, world, antagonists, worldTime);
      for (const l of ecologyLogs) await countingLog(l);
      
      const dynastyLogs = tickDynasty(rng, dynastyState, world, worldTime);
      for (const l of dynastyLogs) await countingLog(l);
      
      const treasureLogs = tickTreasure(rng, treasureState, world, worldTime);
      for (const l of treasureLogs) await countingLog(l);
      
      const navalHourlyLogs = tickNavalHourly(navalState, world, rng, worldTime, calendar.weather);
      for (const l of navalHourlyLogs) await countingLog(l);
    }
    
    // DAILY TICK
    if (t % TICKS_PER_DAY === 0) {
      const dayNum = t / TICKS_PER_DAY;
      
      pruneOldData(worldTime);
      
      const { logs: calendarLogs, newCalendar } = dailyCalendarTick(world, rng, worldTime, calendar);
      calendar = newCalendar;
      for (const entry of calendarLogs) await countingLog(entry);
      
      const startLogs = maybeStartTravel(world, rng, worldTime);
      for (const entry of startLogs) await countingLog(entry);
      
      for (const settlement of world.settlements) {
        const npcsHere = world.npcs.filter((n) => n.location === settlement.name && n.alive !== false);
        const partiesHere = world.parties.filter((p) => p.location === settlement.name);
        const beat = marketBeat(rng, settlement, worldTime, {
          npcs: npcsHere,
          parties: partiesHere,
          tension: settlement.mood,
        });
        if (beat) {
          await countingLog({
            category: 'town',
            summary: beat.summary,
            details: beat.details,
            location: settlement.name,
            worldTime,
            seed: config.seed,
          });
        }
      }
      
      const townLogs = dailyTownTick(world, rng, worldTime);
      for (const entry of townLogs) await countingLog(entry);
      
      const domainLogs = tickDomains(world, rng, worldTime);
      for (const entry of domainLogs) await countingLog(entry);
      
      const legendaryLogs = maybeLegendarySpike(rng, world, worldTime, legendaryState);
      for (const entry of legendaryLogs) await countingLog(entry);
      
      const navalDailyLogs = tickNavalDaily(navalState, world, rng, worldTime, calendar.weather, getSeason(calendar.month));
      for (const l of navalDailyLogs) await countingLog(l);
      
      // Progress indicator every 30 days
      if (dayNum > lastDayPrinted + 30) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  Day ${dayNum}/${days}: ${eventCount} events (${elapsed}s elapsed)`);
        lastDayPrinted = dayNum;
      }
    }
  }
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`  BATCH COMPLETE in ${elapsed}s`);
  console.log(`═══════════════════════════════════════════`);
  console.log(`  Total events: ${eventCount}`);
  console.log(`  Final parties: ${world.parties.length}`);
  console.log(`  Living NPCs: ${world.npcs.filter(n => n.alive !== false).length}`);
  console.log(`  Active antagonists: ${antagonists.filter(a => a.alive).length}`);
  console.log(`  Resolved stories: ${storyThreads.filter(s => s.resolved).length}`);
  console.log(`  Active stories: ${storyThreads.filter(s => !s.resolved).length}`);
  console.log(`\nOutput: ${config.logDir}/events.log\n`);
  
  // Save final state
  world.lastTickAt = new Date(config.startWorldTime.getTime() + days * 24 * 60 * 60 * 1000);
  world.storyThreads = storyThreads as EnhancedWorldState['storyThreads'];
  world.antagonists = antagonists as EnhancedWorldState['antagonists'];
  await saveWorld(world);
  
  process.exit(0);
}

async function main() {
  // Initialize world before starting scheduler
  await initWorld();

  // Subscribe to ticks
  bus.subscribe('turn', onTurnTick);
  bus.subscribe('hour', onHourTick);
  bus.subscribe('day', onDayTick);

  // Check for batch mode
  if (config.batchDays !== null && config.batchDays > 0) {
    await runBatchMode(config.batchDays);
    return;
  }

  // Catch up any missed time from previous session
  await catchUpMissedTime();

  // Seed initial travel
  const initialTravel = maybeStartTravel(world, rng, config.startWorldTime);
  for (const entry of initialTravel) await log(entry);
  await saveWorld(world);

  const turnMs = config.msPerWorldMinute * config.turnMinutes;
  const pad = (s: string) => `║  ${s.padEnd(62)}║`;
  const activeStories = storyThreads.filter((s) => !s.resolved).length;
  const statsLine = `Settlements: ${world.settlements.length}   Parties: ${world.parties.length}   Antagonists: ${antagonists.length}`;
  
  process.stdout.write(
    `\n╔${'═'.repeat(64)}╗\n` +
    pad('BECMI Real-Time Simulator') + '\n' +
    pad(formatDate(calendar)) + '\n' +
    `╠${'═'.repeat(64)}╣\n` +
    pad(`Seed: ${config.seed}`) + '\n' +
    pad(`Time Scale: ${config.timeScale}x (turn every ${turnMs}ms)`) + '\n' +
    pad(statsLine) + '\n' +
    pad(`Active Stories: ${activeStories}`) + '\n' +
    `╚${'═'.repeat(64)}╝\n\n`,
  );

  // Start the scheduler (now synchronized with real time)
  const scheduler = new Scheduler(bus, config);
  scheduler.start();
}

main();
