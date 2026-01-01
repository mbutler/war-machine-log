/**
 * SIMULATION STRESS TEST
 * 
 * Runs the simulation loop as fast as possible for a simulated month
 * to ensure no runtime errors occur during long-term play.
 */

import { makeRandom } from './rng.ts';
import { createInitialWorld } from './world.ts';
import { EventBus } from './events.ts';
import { TickEvent, EnhancedWorldState } from './types.ts';
import { updateTravel, maybeStartTravel } from './travel.ts';
import { advanceCaravans } from './trade.ts';
import { dailyTownTick } from './town.ts';
import { tickNPCAgency, tickPartyAgency, tickFactionOperations, tickSpellcasting, tickLevelUps, tickArmyRaising, tickNexuses } from './agency.ts';
import { processConsequences, setConsequenceQueue, getConsequenceQueue } from './consequences.ts';
import { dailyCalendarTick, generateWeather, getSeason, getCalendarFromDate } from './calendar.ts';
import { seedAntagonists, antagonistAct, introduceAntagonist, Antagonist } from './antagonists.ts';
import { tickStories, checkForStorySpawn, StoryThread } from './stories.ts';
import { deepenNPC, seedRelationships, relationshipEvent, DeepNPC } from './character.ts';
import { tickDomains } from './domain.ts';
import { tickArmies } from './war-machine.ts';
import { tickRuins } from './ruins.ts';
import { tickDisease, tickMercenaries } from './logistics.ts';
import { tickDiplomacy } from './diplomacy.ts';
import { maybeLegendarySpike, createLegendaryState, checkLegendaryEncounter } from './legendary.ts';
import { encounterSign, enhancedEncounter } from './encounters-enhanced.ts';
import { exploreDungeonTick } from './dungeon.ts';

// New systems
import { createRetainerRoster, tickRetainers, startHiringSearch, generateRetainer, hireRetainer } from './retainers.ts';
import { createGuildState, seedGuilds, tickGuilds, planHeist } from './guilds.ts';
import { createEcologyState, seedEcology, tickEcology } from './ecology.ts';
import { createDynastyState, seedDynasty, tickDynasty } from './dynasty.ts';
import { createTreasureState, tickTreasure, TreasureState } from './treasure.ts';
import { NavalState, seedNavalState, tickNavalHourly, tickNavalDaily, markSettlementAsPort } from './naval.ts';

async function runStressTest() {
  const seed = 'test-seed-' + Date.now();
  const rng = makeRandom(seed);
  const startWorldTime = new Date();
  
  console.log(`Starting Stress Test [Seed: ${seed}]`);
  
  // 1. INIT
  let world = createInitialWorld(rng, seed, startWorldTime) as EnhancedWorldState;
  world.npcs = world.npcs.map((npc) => deepenNPC(rng, npc));
  seedRelationships(rng, world.npcs as DeepNPC[], world);
  let calendar = getCalendarFromDate(startWorldTime);
  calendar.weather = generateWeather(rng, getSeason(calendar.month));
  let antagonists = seedAntagonists(rng, world);
  let storyThreads: StoryThread[] = [];
  let legendaryState = createLegendaryState();

  // Initialize new systems
  let retainerRoster = createRetainerRoster();
  let guildState = seedGuilds(rng, world, startWorldTime);
  let ecologyState = seedEcology(rng, world, startWorldTime);
  let dynastyState = seedDynasty(rng, world, startWorldTime);
  let treasureState = createTreasureState();
  
  // Mark some settlements as ports and seed naval state
  // Ensure at least one port exists for testing
  let hasPort = false;
  for (const settlement of world.settlements) {
    if (rng.chance(0.35) || (!hasPort && settlement === world.settlements[world.settlements.length - 1])) {
      markSettlementAsPort(settlement, rng);
      hasPort = true;
    }
  }
  let navalState = seedNavalState(world, rng);

  const portCount = world.settlements.filter(s => s.isPort).length;
  console.log(`New Systems Seeded:
    - Thieves' Guilds: ${guildState.guilds.length}
    - Monster Populations: ${ecologyState.populations.length}
    - Noble Bloodlines: ${dynastyState.bloodlines.length}
    - Existing Marriages: ${dynastyState.marriages.length}
    - Port Towns: ${portCount}
    - Ships: ${navalState.ships.length}
    - Sea Routes: ${navalState.seaRoutes.length}
    - Pirate Fleets: ${navalState.pirates.length}
  `);

  // Trigger some initial retainer hiring for testing
  if (world.parties.length > 0 && world.settlements.length > 0) {
    const party = world.parties[0];
    const settlement = world.settlements.find(s => s.name === party.location) ?? world.settlements[0];
    startHiringSearch(rng, 'man-at-arms', settlement.name, party.id, startWorldTime, retainerRoster);
    startHiringSearch(rng, 'sage', settlement.name, party.id, startWorldTime, retainerRoster);
    console.log(`Started hiring searches for ${party.name} in ${settlement.name}`);
  }

  // Trigger an initial heist plan for testing
  if (guildState.guilds.length > 0 && world.settlements.length > 0) {
    const guild = guildState.guilds[0];
    const settlement = world.settlements.find(s => s.name === guild.headquarters);
    if (settlement) {
      planHeist(rng, guild, 'merchant', 'test-merchant', 'a wealthy merchant', settlement.name, 150, guildState, startWorldTime);
      console.log(`${guild.name} is planning a heist in ${settlement.name}`);
    }
  }

  const SIMULATED_DAYS = 90;
  const TICKS_PER_DAY = 24 * 6; // 10 minute turns
  const TOTAL_TICKS = SIMULATED_DAYS * TICKS_PER_DAY;

  console.log(`Simulating ${SIMULATED_DAYS} days (${TOTAL_TICKS} turns)...`);

  let currentWorldTime = new Date(startWorldTime);

  for (let t = 0; t <= TOTAL_TICKS; t++) {
    currentWorldTime = new Date(startWorldTime.getTime() + t * 10 * 60_000);
    const event: TickEvent = { kind: 'turn', worldTime: currentWorldTime, turnIndex: t };

    // TURN TICK
    for (const party of world.parties) {
      if (party.status === 'idle') {
        const dungeon = world.dungeons.find((d) => d.name === party.location);
        if (dungeon && dungeon.rooms && dungeon.rooms.length > 0) {
          exploreDungeonTick(rng, dungeon, [party.name], event.worldTime, world.seed, world, treasureState);
        }
      }
    }

    // HOURLY TICK
    if (t % 6 === 0) {
      for (const party of world.parties) {
        if (party.status === 'travel' && party.travel) {
          encounterSign(rng, party.travel.terrain, event.worldTime, party.location, party.name, world.seed);
          enhancedEncounter(rng, party.travel.terrain, event.worldTime, party.location, party, world, calendar);
          checkLegendaryEncounter(rng, party, party.location, legendaryState, event.worldTime, world.seed, world, antagonists, storyThreads);
        }
      }
      updateTravel(world, rng, event.worldTime);
      advanceCaravans(world, rng, event.worldTime);
      processConsequences(world, rng, event.worldTime);
      
      if (rng.chance(0.05)) {
        const npc = rng.pick(world.npcs) as DeepNPC;
        if (npc.depth && npc.alive !== false) relationshipEvent(rng, npc, world, event.worldTime);
      }

      tickNPCAgency(world, rng, event.worldTime, antagonists, storyThreads);
      tickPartyAgency(world, rng, event.worldTime, antagonists, storyThreads);
      tickFactionOperations(world, rng, event.worldTime, antagonists, storyThreads);
      tickSpellcasting(world, rng, event.worldTime);
      tickNexuses(world, rng, event.worldTime);
      tickLevelUps(world, rng, event.worldTime);
      tickArmyRaising(world, rng, event.worldTime);
      tickRuins(world, rng, event.worldTime);
      tickArmies(world, rng, event.worldTime);
      tickDisease(world, rng, event.worldTime);
      tickMercenaries(world, rng, event.worldTime);
      tickDiplomacy(world, rng, event.worldTime);

      // New systems
      tickRetainers(rng, retainerRoster, world, event.worldTime);
      tickGuilds(rng, guildState, world, event.worldTime);
      tickEcology(rng, ecologyState, world, antagonists, event.worldTime);
      tickDynasty(rng, dynastyState, world, event.worldTime);
      tickTreasure(rng, treasureState, world, event.worldTime);
      tickNavalHourly(navalState, world, rng, event.worldTime, calendar.weather);
    }

    // DAILY TICK
    if (t % (24 * 6) === 0) {
      const { logs: calLogs, newCalendar } = dailyCalendarTick(world, rng, event.worldTime, calendar);
      calendar = newCalendar;
      maybeStartTravel(world, rng, event.worldTime);
      dailyTownTick(world, rng, event.worldTime);
      tickDomains(world, rng, event.worldTime);
      maybeLegendarySpike(rng, world, event.worldTime, legendaryState);
      tickNavalDaily(navalState, world, rng, event.worldTime, calendar.weather, getSeason(calendar.month));
      
      process.stdout.write('.'); // Progress indicator
    }
  }

  console.log('\nStress Test Completed Successfully!');
  console.log(`Final World State:
    - Settlements: ${world.settlements.length}
    - Persistent NPCs: ${world.npcs.length}
    - Active Armies: ${world.armies.length}
    - Strongholds (Finished): ${world.strongholds.filter(s => s.constructionFinished).length}
    - Strongholds (In Progress): ${world.npcs.filter(n => (n as any).agendas?.some((a: any) => a.type === 'stronghold')).length}
    - Cleared Ruins: ${world.ruins?.filter(r => r.cleared).length ?? 0}
    - Diseased Settlements: ${Object.values(world.settlementStates || {}).filter(s => s.disease).length}
    - Ransomed Prisoners: ${world.eventHistory?.filter(e => e.type === 'ransom').length ?? 0}
  
  New Systems:
    - Active Retainers: ${retainerRoster.retainers.filter(r => r.alive).length}
    - Pending Hires: ${retainerRoster.pendingHires.length}
    - Desertions: ${retainerRoster.desertions.length}
    - Thieves' Guilds: ${guildState.guilds.filter(g => g.active).length}
    - Completed Heists: ${guildState.operations.filter(o => o.status === 'completed').length}
    - Failed Heists: ${guildState.operations.filter(o => o.status === 'failed').length}
    - Hot Goods Pending: ${guildState.hotGoods.length}
    - Guild Wars: ${guildState.guilds.reduce((sum, g) => sum + g.enemies.length, 0) / 2}
    - Monster Populations: ${ecologyState.populations.length}
    - Extinctions: ${ecologyState.extinctions.length}
    - Active Migrations: ${ecologyState.migrations.length}
    - Territorial Disputes: ${ecologyState.territorialDisputes.length}
    - Noble Bloodlines: ${dynastyState.bloodlines.length}
    - Active Marriages: ${dynastyState.marriages.filter(m => !m.dissolved).length}
    - Pregnancies: ${dynastyState.pregnancies.length}
    - Succession Crises: ${dynastyState.successionCrises.filter(c => !c.resolved).length}
    - Courtships: ${dynastyState.courtships.filter(c => c.stage !== 'rejected' && c.stage !== 'married').length}
    - Burials: ${dynastyState.burials.length}
    - Discovered Hoards: ${treasureState.discoveredHoards.length}
    - Total Treasure Found: ${treasureState.discoveredHoards.reduce((sum, h) => sum + h.totalValue, 0).toLocaleString()} gp
    - Active Extractions: ${treasureState.activeExtractions.filter(e => !e.completed && !e.abandoned).length}
    - Completed Extractions: ${treasureState.activeExtractions.filter(e => e.completed).length}
    - Abandoned Extractions: ${treasureState.activeExtractions.filter(e => e.abandoned).length}
    - Magic Items in Circulation: ${treasureState.circulatingMagicItems.length}
    - Magic Items Owned: ${treasureState.circulatingMagicItems.filter(m => m.ownerId).length}
    - Legendary Items: ${treasureState.circulatingMagicItems.filter(m => m.rarity === 'legendary' || m.rarity === 'very-rare').length}

  Naval:
    - Port Towns: ${world.settlements.filter(s => s.isPort).length}
    - Ships (Active): ${navalState.ships.filter(s => s.status !== 'shipwrecked').length}
    - Ships (Shipwrecked): ${navalState.ships.filter(s => s.status === 'shipwrecked').length}
    - Ships At Sea: ${navalState.ships.filter(s => s.status === 'at-sea').length}
    - Sea Routes: ${navalState.seaRoutes.length}
    - Pirate Fleets: ${navalState.pirates.length}
    - Total Pirate Crew: ${navalState.pirates.reduce((sum, p) => sum + p.crew, 0)}
    - Total Bounties: ${navalState.pirates.reduce((sum, p) => sum + p.bounty, 0).toLocaleString()} gp
    - Shipwrecks: ${navalState.recentShipwrecks.length}
    - Salvaged Wrecks: ${navalState.recentShipwrecks.filter(w => w.salvaged).length}
    - Distant Lands Known: ${navalState.distantLands.length}
    - Distant Figures Known: ${navalState.distantFigures.length}
  `);
  
  // Show some of the discovered distant lands
  if (navalState.distantLands.length > 0) {
    console.log('  Discovered Distant Lands:');
    for (const land of navalState.distantLands.slice(0, 5)) {
      console.log(`    - ${land.name} (${land.culture}): known for ${land.knownFor.join(', ')}`);
    }
  }
  
  if (navalState.distantFigures.length > 0) {
    console.log('  Known Distant Figures:');
    for (const figure of navalState.distantFigures.slice(0, 5)) {
      const land = navalState.distantLands.find(l => l.id === figure.landId);
      console.log(`    - ${figure.title} (${figure.role} of ${land?.name ?? 'unknown'}): ${figure.reputation}`);
    }
  }
}

runStressTest().catch(err => {
  console.error('\n!!! Stress Test Failed !!!');
  console.error(err);
  process.exit(1);
});

