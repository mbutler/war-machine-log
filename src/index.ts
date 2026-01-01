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
import { createInitialWorld } from './world.ts';
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
    
    // Mark coastal settlements as ports and seed naval state
    for (const settlement of world.settlements) {
      const hex = world.hexes.find(h => h.coord.q === settlement.coord.q && h.coord.r === settlement.coord.r);
      if (hex && (hex.terrain === 'coastal' || rng.chance(0.25))) {
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
    await saveWorld(world);
  })();
}

// Daily tick - weather, town events, calendar progression
function onDayTick(event: TickEvent): void {
  if (!initialized) return;

  void (async () => {
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

async function main() {
  // Initialize world before starting scheduler
  await initWorld();

  // Subscribe to ticks
  bus.subscribe('turn', onTurnTick);
  bus.subscribe('hour', onHourTick);
  bus.subscribe('day', onDayTick);

  // Seed initial travel
  const initialTravel = maybeStartTravel(world, rng, config.startWorldTime);
  for (const entry of initialTravel) await log(entry);
  await saveWorld(world);

  const turnMs = config.msPerWorldMinute * config.turnMinutes;
  process.stdout.write(
    `\n╔════════════════════════════════════════════════════════════════╗\n` +
    `║  BECMI Real-Time Simulator                                     ║\n` +
    `║  ${formatDate(calendar).padEnd(48)}       ║\n` +
    `╠════════════════════════════════════════════════════════════════╣\n` +
    `║  Seed: ${config.seed.padEnd(54)}  ║\n` +
    `║  Time Scale: ${config.timeScale}x (turn every ${turnMs}ms)${' '.repeat(Math.max(0, 30 - String(turnMs).length))}║\n` +
    `║  Settlements: ${world.settlements.length}   Parties: ${world.parties.length}   Antagonists: ${antagonists.length}${' '.repeat(Math.max(0, 15 - String(antagonists.length).length))}║\n` +
    `║  Active Stories: ${storyThreads.filter((s) => !s.resolved).length}${' '.repeat(45)}║\n` +
    `╚════════════════════════════════════════════════════════════════╝\n\n`,
  );

  // Start the scheduler
  const scheduler = new Scheduler(bus, config);
  scheduler.start();
}

main();
