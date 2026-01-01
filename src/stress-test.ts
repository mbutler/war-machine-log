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
          exploreDungeonTick(rng, dungeon, [party.name], event.worldTime, world.seed, world);
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
    }

    // DAILY TICK
    if (t % (24 * 6) === 0) {
      const { logs: calLogs, newCalendar } = dailyCalendarTick(world, rng, event.worldTime, calendar);
      calendar = newCalendar;
      maybeStartTravel(world, rng, event.worldTime);
      dailyTownTick(world, rng, event.worldTime);
      tickDomains(world, rng, event.worldTime);
      maybeLegendarySpike(rng, world, event.worldTime, legendaryState);
      
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
  `);
}

runStressTest().catch(err => {
  console.error('\n!!! Stress Test Failed !!!');
  console.error(err);
  process.exit(1);
});

