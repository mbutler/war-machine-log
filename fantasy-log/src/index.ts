/**
 * BECMI Real-Time Simulator - Main Entry Point
 * 
 * A rich emergent narrative engine that simulates a fantasy world
 * in real-time, generating story logs from deep simulation systems.
 * 
 * Time Model:
 * - World time advances in 10-minute ticks (BECMI turn)
 * - In real-time mode: 1 tick per 10 real minutes (1:1 time)
 * - On startup: catches up any missed time since lastTickAt
 * - In batch mode: simulates N days at max speed, then exits
 * 
 * All simulation is deterministic given the same seed and start time.
 */

import { config } from './config.ts';
import { Logger } from './logging.ts';
import { makeRandom } from './rng.ts';
import { Scheduler, SchedulerCallbacks, SchedulerState } from './scheduler.ts';
import { LogEntry, TickEvent, EnhancedWorldState } from './types.ts';
import { createInitialWorld, isCoastalHex } from './world.ts';
import { updateTravel, maybeStartTravel } from './travel.ts';
import { loadWorld, saveWorld } from './persistence.ts';
import { stat } from 'fs/promises';
import { dailyTownTick } from './town.ts';
import { advanceCaravans } from './trade.ts';

// Enhanced systems
import { processConsequences, setConsequenceQueue, getConsequenceQueue, analyzeEventForConsequences } from './consequences.ts';
import { CalendarState, getCalendarFromDate, dailyCalendarTick, generateWeather, getSeason, formatDate } from './calendar.ts';
import { Antagonist, seedAntagonists, antagonistAct, introduceAntagonist } from './antagonists.ts';
import { enhancedEncounter, encounterSign } from './encounters-enhanced.ts';
import { StoryThread, tickStories, checkForStorySpawn } from './stories.ts';
import { DeepNPC, deepenNPC, seedRelationships, relationshipEvent } from './character.ts';
import { settlementScene, marketBeat } from './prose.ts';

// Deep causality systems
import { tickNPCAgency, tickPartyAgency, tickFactionOperations, tickSpellcasting, tickLevelUps, tickArmyRaising, tickNexuses } from './agency.ts';
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

// ============================================================================
// GLOBAL STATE
// ============================================================================

let rng = makeRandom(config.seed);
const logger = new Logger(config.logDir);

// World and subsystem state
let world: EnhancedWorldState;
let calendar: CalendarState;
let antagonists: Antagonist[] = [];
let storyThreads: StoryThread[] = [];
let legendaryState: LegendaryState = createLegendaryState();
let retainerRoster: RetainerRoster = createRetainerRoster();
let guildState: GuildState = createGuildState();
let ecologyState: EcologyState = createEcologyState();
let dynastyState: DynastyState = createDynastyState();
let treasureState: TreasureState = createTreasureState();
let navalState: NavalState = { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };

let worldFileModTime: number | null = null;
let initialized = false;

// ============================================================================
// PROCESS HANDLERS (graceful shutdown)
// ============================================================================

process.on('uncaughtException', async (error) => {
  console.error('🚨 UNCAUGHT EXCEPTION:', error);
  console.error('Stack trace:', error.stack);
  if (world) {
    try {
      await saveWorld(world);
      console.log('💾 World saved before exit');
    } catch (saveError) {
      console.error('Failed to save world on crash:', saveError);
    }
  }
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 UNHANDLED REJECTION at:', promise, 'reason:', reason);
  // Don't exit - let the process continue
});

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`📡 Received ${signal}, shutting down gracefully...`);
  if (world) {
    try {
      await saveWorld(world);
      console.log('💾 World saved successfully');
    } catch (error) {
      console.error('Failed to save world on shutdown:', error);
    }
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================================================
// LOGGING HELPER
// ============================================================================

async function log(entry: Omit<LogEntry, 'realTime'>): Promise<void> {
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
        seed: world.seed ?? config.seed,
      });
    }

    // Queue consequences for significant events
    analyzeEventForConsequences(fullEntry, world, rng);
  }
}

// ============================================================================
// WORLD FILE MONITORING
// ============================================================================

async function checkWorldFileModified(): Promise<boolean> {
  if (worldFileModTime === null) return false;
  try {
    const stats = await stat('world.json');
    return stats.mtime.getTime() > worldFileModTime;
  } catch {
    return false;
  }
}

async function reloadWorldIfModified(): Promise<boolean> {
  if (await checkWorldFileModified()) {
    console.log('🔄 World.json modified externally, reloading...');
    const loaded = await loadWorld();
    if (loaded) {
      world = loaded as EnhancedWorldState;
      try {
        const stats = await stat('world.json');
        worldFileModTime = stats.mtime.getTime();
      } catch { /* ignore */ }
      
      // Reinitialize systems from loaded world
      calendar = getCalendarFromDate(world.lastTickAt || config.startWorldTime);
      antagonists = world.antagonists || [];
      storyThreads = world.storyThreads || [];
      legendaryState = (world as any).legendaryState || createLegendaryState();
      retainerRoster = world.retainerRoster || createRetainerRoster();
      guildState = world.guildState || createGuildState();
      ecologyState = world.ecologyState || createEcologyState();
      dynastyState = world.dynastyState || createDynastyState();
      treasureState = world.treasureState || createTreasureState();
      navalState = world.navalState || { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };
      
      console.log('✅ World reloaded successfully');
      return true;
    }
  }
  return false;
}

// ============================================================================
// WORLD INITIALIZATION
// ============================================================================

async function initWorld(): Promise<void> {
  const loaded = await loadWorld();
  
  if (loaded) {
    world = loaded as EnhancedWorldState;
    
    // Track file mod time for external change detection
    try {
      const stats = await stat('world.json');
      worldFileModTime = stats.mtime.getTime();
    } catch { /* ignore */ }

    // Handle seed
    const forceSeed = process.env.FORCE_SEED;
    if (forceSeed && forceSeed !== world.seed) {
      console.log(`🔄 FORCE SEED: Overriding world seed "${world.seed}" with "${forceSeed}"`);
      world.seed = forceSeed;
      rng = makeRandom(forceSeed);
    } else if (world.seed) {
      if (world.seed !== config.seed) {
        console.log(`🔄 Using world seed: "${world.seed}" (config had: "${config.seed}")`);
      }
      rng = makeRandom(world.seed);
      (config as any).seed = world.seed;
    } else {
      console.log(`⚠️  World missing seed, setting to: "${config.seed}"`);
      world.seed = config.seed;
      rng = makeRandom(config.seed);
    }

    // Restore enhanced state
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

    // Initialize calendar from last tick time
    const lastTime = world.lastTickAt || config.startWorldTime;
    calendar = getCalendarFromDate(lastTime, world.calendar?.weather);
    if (world.calendar) {
      calendar = { ...calendar, ...world.calendar };
    }

    // Restore all subsystem state
    antagonists = (world.antagonists as Antagonist[]) ?? [];
    storyThreads = (world.storyThreads as StoryThread[]) ?? [];
    legendaryState = (world as any).legendaryState ?? createLegendaryState();
    retainerRoster = world.retainerRoster ?? createRetainerRoster();
    guildState = world.guildState ?? createGuildState();
    ecologyState = world.ecologyState ?? createEcologyState();
    dynastyState = world.dynastyState ?? createDynastyState();
    treasureState = world.treasureState ?? createTreasureState();
    navalState = world.navalState ?? { ships: [], seaRoutes: [], pirates: [], recentShipwrecks: [], portActivity: {}, distantLands: [], distantFigures: [] };
    
  } else {
    // Create fresh world
    world = createInitialWorld(rng, config.seed, config.startWorldTime) as EnhancedWorldState;
    if (!world.seed) world.seed = config.seed;

    // Deepen all NPCs
    world.npcs = world.npcs.map((npc) => deepenNPC(rng, npc));
    seedRelationships(rng, world.npcs as DeepNPC[], world);

    // Initialize calendar
    calendar = getCalendarFromDate(config.startWorldTime);
    calendar.weather = generateWeather(rng, getSeason(config.startWorldTime.getUTCMonth()));

    // Seed antagonists and systems
    antagonists = seedAntagonists(rng, world);
    guildState = seedGuilds(rng, world, config.startWorldTime);
    ecologyState = seedEcology(rng, world, config.startWorldTime);
    dynastyState = seedDynasty(rng, world, config.startWorldTime);
    
    // Mark coastal settlements as ports
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
      details: `${formatDate(config.startWorldTime)}. The simulation awakens in an era known as the ${world.archetype}.`,
      worldTime: config.startWorldTime,
      seed: world.seed ?? config.seed,
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
        seed: world.seed ?? config.seed,
      });
    }

    // Introduce antagonists
    for (const ant of antagonists) {
      const introLogs = introduceAntagonist(ant, world, rng, config.startWorldTime);
      for (const l of introLogs) await log(l);
    }

    // Set initial lastTickAt
    world.lastTickAt = config.startWorldTime;
    await saveWorld(world);
  }

  initialized = true;
}

// ============================================================================
// TICK HANDLERS (all async, properly awaited)
// ============================================================================

/**
 * Turn tick - runs every 10 minutes world time
 * Handles dungeon exploration at BECMI turn granularity
 */
async function onTurnTick(event: TickEvent): Promise<void> {
  if (!initialized) return;

  // Dungeon exploration
  for (const party of world.parties) {
    if (party.status === 'idle') {
      const dungeon = world.dungeons.find((d) => d.name === party.location);
      if (dungeon && dungeon.rooms && dungeon.rooms.length > 0) {
        const delveLogs = exploreDungeonTick(rng, dungeon, [party.name], event.worldTime, world.seed, world, treasureState);
        for (const entry of delveLogs) await log(entry);
      }
    }
  }
}

/**
 * Hour tick - runs every hour world time (every 6 turns)
 * Handles travel, encounters, caravans, and most simulation systems
 */
async function onHourTick(event: TickEvent): Promise<void> {
  if (!initialized) return;

  // Check for external world modifications
  await reloadWorldIfModified();

  const hour = event.worldTime.getUTCHours();

  // Heartbeat log every 6 hours
  if (hour % 6 === 0) {
    const activeParties = world.parties.filter(p => p.status === 'travel').length;
    const idleParties = world.parties.filter(p => p.status === 'idle').length;
    await logger.log({
      category: 'system',
      summary: `The world turns (${formatDate(event.worldTime)})`,
      details: `${activeParties} parties traveling, ${idleParties} resting. ${antagonists.filter(a => a.alive).length} threats lurk.`,
      worldTime: event.worldTime,
      realTime: new Date(),
      seed: world.seed ?? config.seed,
    });
  }

  // Travel encounters
  for (const party of world.parties) {
    if (party.status === 'travel' && party.travel) {
      // Chance for sign/track encounter
      const sign = encounterSign(rng, party.travel.terrain, event.worldTime, party.location, party.name, world.seed);
      if (sign) await log(sign);

      // Full encounter check
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
      
      // Legendary encounters
      const legendaryEncs = checkLegendaryEncounter(rng, party, party.location, legendaryState, event.worldTime, world.seed, world, antagonists, storyThreads);
      for (const lEnc of legendaryEncs) {
        await log(lEnc);
        party.fame = (party.fame ?? 0) + 5;
      }
    }
  }

  // Standard travel updates
  const travelLogs = updateTravel(world, rng, event.worldTime);
  for (const entry of travelLogs) await log(entry);

  // Caravan advancement
  const caravanLogs = advanceCaravans(world, rng, event.worldTime);
  for (const entry of caravanLogs) await log(entry);

  // Process pending consequences
  const conseqLogs = processConsequences(world, rng, event.worldTime);
  for (const entry of conseqLogs) await log(entry);

  // NPC relationship events
  if (rng.chance(0.05)) {
    const npc = rng.pick(world.npcs) as DeepNPC;
    if (npc.depth && npc.alive !== false) {
      const relEvent = relationshipEvent(rng, npc, world, event.worldTime);
      if (relEvent) await log(relEvent);
    }
  }

  // Antagonist activity
  if (rng.chance(0.03)) {
    const activeAntagonists = antagonists.filter((a) => a.alive);
    if (activeAntagonists.length) {
      const ant = rng.pick(activeAntagonists);
      const antLogs = antagonistAct(ant, world, rng, event.worldTime);
      for (const l of antLogs) await log(l);
    }
  }

  // Story thread progression
  if (rng.chance(0.1)) {
    const storyLogs = tickStories(rng, storyThreads, world, event.worldTime);
    for (const l of storyLogs) await log(l);
  }

  // Agency systems
  const npcAgencyLogs = tickNPCAgency(world, rng, event.worldTime, antagonists, storyThreads);
  for (const l of npcAgencyLogs) await log(l);
  
  const partyAgencyLogs = tickPartyAgency(world, rng, event.worldTime, antagonists, storyThreads);
  for (const l of partyAgencyLogs) await log(l);
  
  const factionOpLogs = tickFactionOperations(world, rng, event.worldTime, antagonists, storyThreads);
  for (const l of factionOpLogs) await log(l);

  const spellLogs = tickSpellcasting(world, rng, event.worldTime);
  for (const l of spellLogs) await log(l);

  const nexusLogs = tickNexuses(world, rng, event.worldTime);
  for (const l of nexusLogs) await log(l);

  const levelLogs = tickLevelUps(world, rng, event.worldTime);
  for (const l of levelLogs) await log(l);

  const raisingLogs = tickArmyRaising(world, rng, event.worldTime);
  for (const l of raisingLogs) await log(l);

  // Ruins, armies, logistics
  const ruinLogs = tickRuins(world, rng, event.worldTime);
  for (const entry of ruinLogs) await log(entry);

  const armyLogs = tickArmies(world, rng, event.worldTime);
  for (const l of armyLogs) await log(l);

  const diseaseLogs = tickDisease(world, rng, event.worldTime);
  for (const l of diseaseLogs) await log(l);

  const mercLogs = tickMercenaries(world, rng, event.worldTime);
  for (const l of mercLogs) await log(l);

  const diplomacyLogs = tickDiplomacy(world, rng, event.worldTime);
  for (const l of diplomacyLogs) await log(l);

  // New systems
  const retainerLogs = tickRetainers(rng, retainerRoster, world, event.worldTime);
  for (const l of retainerLogs) await log(l);
  
  const guildLogs = tickGuilds(rng, guildState, world, event.worldTime);
  for (const l of guildLogs) await log(l);
  
  const ecologyLogs = tickEcology(rng, ecologyState, world, antagonists, event.worldTime);
  for (const l of ecologyLogs) await log(l);
  
  const dynastyLogs = tickDynasty(rng, dynastyState, world, event.worldTime);
  for (const l of dynastyLogs) await log(l);
  
  const treasureLogs = tickTreasure(rng, treasureState, world, event.worldTime);
  for (const l of treasureLogs) await log(l);
  
  const navalHourlyLogs = tickNavalHourly(navalState, world, rng, event.worldTime, calendar.weather);
  for (const l of navalHourlyLogs) await log(l);
}

/**
 * Day tick - runs once per day world time (every 144 turns)
 * Handles weather, town events, calendar progression
 */
async function onDayTick(event: TickEvent): Promise<void> {
  if (!initialized) return;

  // Prune old data
  pruneOldData(event.worldTime);

  // Daily calendar update
  const { logs: calendarLogs, newCalendar } = dailyCalendarTick(world, rng, event.worldTime, calendar);
  calendar = newCalendar;
  for (const entry of calendarLogs) await log(entry);

  // Maybe start new travel
  const startLogs = maybeStartTravel(world, rng, event.worldTime);
  for (const entry of startLogs) await log(entry);

  // Town events with prose
  for (const settlement of world.settlements) {
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
        seed: world.seed ?? config.seed,
      });
    }
  }

  // Standard town tick
  const townLogs = dailyTownTick(world, rng, event.worldTime);
  for (const entry of townLogs) await log(entry);

  // Domain management
  const domainLogs = tickDomains(world, rng, event.worldTime);
  for (const entry of domainLogs) await log(entry);

  // Legendary spikes
  const legendaryLogs = maybeLegendarySpike(rng, world, event.worldTime, legendaryState);
  for (const entry of legendaryLogs) await log(entry);
  
  // Naval daily
  const navalDailyLogs = tickNavalDaily(navalState, world, rng, event.worldTime, calendar.weather, getSeason(event.worldTime.getUTCMonth()));
  for (const l of navalDailyLogs) await log(l);
}

/**
 * Save world state after each tick completes
 */
async function onTickComplete(worldTime: Date): Promise<void> {
  // Update all subsystem state in world
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
  world.lastTickAt = worldTime;
  (world as any).legendaryState = legendaryState;
  
  await saveWorld(world);
  
  // Update our tracking of file mod time to prevent false "external modification" detection
  try {
    const stats = await stat('world.json');
    worldFileModTime = stats.mtime.getTime();
  } catch { /* ignore */ }
}

// ============================================================================
// DATA CLEANUP
// ============================================================================

function pruneOldData(worldTime: Date): void {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
  const now = worldTime.getTime();
  
  // Prune resolved stories older than 30 days
  storyThreads = storyThreads.filter(s => {
    if (!s.resolved) return true;
    const resolvedTime = s.lastUpdated?.getTime() ?? s.startedAt.getTime();
    return now - resolvedTime < THIRTY_DAYS_MS;
  });
  
  // Prune dead antagonists older than 90 days
  antagonists = antagonists.filter(a => {
    if (a.alive) return true;
    const lastSeen = a.lastSeen?.getTime() ?? 0;
    return now - lastSeen < NINETY_DAYS_MS;
  });
  
  // Prune dead NPCs without significant history
  world.npcs = world.npcs.filter(n => {
    if (n.alive !== false) return true;
    const npcAny = n as any;
    const hasMeaningfulHistory = (npcAny.memories?.length > 5) || (n.fame ?? 0) > 10;
    if (hasMeaningfulHistory) return true;
    const deathTime = npcAny.diedAt?.getTime() ?? 0;
    return now - deathTime < NINETY_DAYS_MS;
  });
  
  // Cap distant lands/figures
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

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

async function main(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                  BECMI Real-Time Simulator                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Initialize world
  await initWorld();

  const schedulerState: SchedulerState = {
    lastTickAt: world.lastTickAt || config.startWorldTime,
    startWorldTime: new Date(world.startedAt),
  };

  const callbacks: SchedulerCallbacks = {
    onTurn: onTurnTick,
    onHour: onHourTick,
    onDay: onDayTick,
    onTickComplete,
  };

  const scheduler = new Scheduler(callbacks, config, schedulerState);

  // Determine target time
  const now = new Date();
  let targetTime: Date;
  let isBatchMode = false;

  if (config.batchDays !== null && config.batchDays > 0) {
    // Batch mode: simulate N days from start
    targetTime = new Date(config.startWorldTime.getTime() + config.batchDays * 24 * 60 * 60 * 1000);
    isBatchMode = true;
    console.log(`📦 Batch mode: Simulating ${config.batchDays} days`);
  } else {
    // Real-time mode: catch up to now, then run real-time
    targetTime = now;
  }

  const lastTickAt = schedulerState.lastTickAt;
  const turnMs = 10 * 60 * 1000;
  const turnsNeeded = Math.floor((targetTime.getTime() - lastTickAt.getTime()) / turnMs);

  console.log(`🌍 World: ${world.archetype}`);
  console.log(`🎲 Seed: ${world.seed}`);
  console.log(`📅 World started: ${formatDate(new Date(world.startedAt))}`);
  console.log(`⏰ Last tick: ${formatDate(lastTickAt)}`);
  console.log(`🎯 Target time: ${formatDate(targetTime)}`);
  
  if (turnsNeeded > 0) {
    const days = Math.floor(turnsNeeded / 144);
    const hours = Math.floor((turnsNeeded % 144) / 6);
    console.log(`\n⏳ Catching up: ${turnsNeeded} turns (${days}d ${hours}h)`);

    await scheduler.catchUpTo(targetTime, config.catchUpSpeed, (current, target, done, total) => {
      const pct = Math.floor((done / total) * 100);
      process.stdout.write(`\r   Progress: ${pct}% (${done}/${total} turns) - ${formatDate(current)}`);
    });

    console.log('\n✅ Catch-up complete!');
  } else {
    console.log('\n✅ World is current, no catch-up needed');
  }

  if (isBatchMode) {
    console.log(`\n📦 Batch simulation complete.`);
    console.log(`   World time: ${formatDate(scheduler.currentWorldTime)}`);
    console.log(`   Output: ${config.logDir}/events.log`);
    process.exit(0);
  }

  // Real-time mode
  console.log('\n🚀 Starting real-time simulation (1 tick per 10 minutes)');
  console.log('   Press Ctrl+C to stop gracefully\n');

  await scheduler.runRealTime();
}

main().catch((error) => {
  console.error('Fatal error in main:', error);
  process.exit(1);
});
