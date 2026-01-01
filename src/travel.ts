import { maybeEncounter } from './encounters.ts';
import { Random } from './rng.ts';
import { LogEntry, Terrain, WorldState } from './types.ts';
import { randomPlace, randomName } from './naming.ts';
import { pathTerrain, distanceMiles } from './world.ts';
import { chooseRumorGoal } from './town.ts';
import { dungeonWanders, exploreDungeonTick } from './dungeon.ts';
import { npcArrivalLogs } from './npc.ts';

function isDay(worldTime: Date): boolean {
  const hour = worldTime.getUTCHours();
  return hour >= 6 && hour < 18;
}

function pickDestination(world: WorldState, rng: Random, origin: string, partyGoal?: string): string {
  if (partyGoal) return partyGoal;
  
  // Build list of possible destinations: settlements + dungeons
  const settlementNames = world.settlements.map((s) => s.name);
  const dungeonNames = world.dungeons.map((d) => d.name);
  
  // Weight destinations: settlements are safer, dungeons are for adventurers
  const allDestinations = [
    ...settlementNames,
    ...settlementNames, // Double-weight settlements (more likely)
    ...dungeonNames,    // Dungeons are options too!
  ].filter((name) => name !== origin);
  
  if (!allDestinations.length) return origin;
  
  // Adventuring parties (with goal or high fame) prefer dungeons
  const party = world.parties.find(p => p.location === origin);
  if (party && (party.fame ?? 0) >= 3 && rng.chance(0.4)) {
    // Famous parties seek glory in dungeons
    const unexploredDungeons = world.dungeons.filter(d => 
      d.name !== origin && d.rooms && d.rooms.length > 0
    );
    if (unexploredDungeons.length > 0) {
      return rng.pick(unexploredDungeons).name;
    }
  }
  
  return rng.pick(allDestinations);
}

const TERRAIN_MILES_PER_DAY: Record<Terrain, number> = {
  road: 36, // 1.5x clear
  clear: 24,
  forest: 16,
  hills: 16,
  mountains: 12,
  swamp: 12,
  desert: 16,
  coastal: 20, // Easy coastal travel
  river: 8,    // Must ford or find crossing
  ocean: 0,    // Can't walk on ocean
  reef: 0,     // Can't walk on reef
};

function milesPerHour(terrain: Terrain): number {
  const perDay = TERRAIN_MILES_PER_DAY[terrain] ?? 12;
  return perDay / 24; // BECMI daily divided into 24 hours
}

export function applyFatigueSpeed(baseMph: number, fatigue: number | undefined): number {
  if (!fatigue || fatigue <= 0) return baseMph;
  const factor = 1 / (1 + 0.3 * fatigue);
  return baseMph * factor;
}

function travelDistanceMiles(rng: Random): number {
  // Regional hops: 12–48 miles
  return 12 + rng.int(37);
}

function ensureTravel(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  let started = false;
  for (const party of world.parties) {
    if (party.restHoursRemaining && party.restHoursRemaining > 0) continue;
    if (party.status === 'idle' && rng.chance(0.8)) {
      // Grab rumor goal if any.
      if (!party.goal) {
        const rumor = chooseRumorGoal(world, rng, party.id);
        if (rumor) {
          party.goal = { kind: 'travel-to', target: rumor.target, sourceRumorId: rumor.id };
        }
      }
      const destination = pickDestination(world, rng, party.location, party.goal?.target);
      if (destination === party.location) continue;
      const distance = distanceMiles(world, party.location, destination);
      if (!distance || distance <= 0) continue;
      const terrain = pathTerrain(world, party.location, destination);
      const mph = applyFatigueSpeed(milesPerHour(terrain), party.fatigue);
      party.status = 'travel';
      party.travel = {
        destination,
        terrain,
        milesRemaining: distance,
        milesPerHour: mph,
      };
      logs.push({
        category: 'road',
        summary: `${party.name} departs ${party.location}`,
        details: `Bound for ${destination} across ${terrain} (~${distance} miles).`,
        location: party.location,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      started = true;
    }
  }

  if (!started) {
    const party = world.parties.find((p) => p.status === 'idle');
    if (party) {
      if (party.restHoursRemaining && party.restHoursRemaining > 0) {
        return logs;
      }
      if (!party.goal) {
        const rumor = chooseRumorGoal(world, rng, party.id);
        if (rumor) {
          party.goal = { kind: 'travel-to', target: rumor.target, sourceRumorId: rumor.id };
        }
      }
      const destination = pickDestination(world, rng, party.location, party.goal?.target);
      if (destination !== party.location) {
        const distance = distanceMiles(world, party.location, destination);
        if (distance && distance > 0) {
          const terrain = pathTerrain(world, party.location, destination);
          const mph = applyFatigueSpeed(milesPerHour(terrain), party.fatigue);
          party.status = 'travel';
          party.travel = {
            destination,
            terrain,
            milesRemaining: distance,
            milesPerHour: mph,
          };
          logs.push({
            category: 'road',
            summary: `${party.name} departs ${party.location}`,
            details: `Bound for ${destination} across ${terrain} (~${distance} miles).`,
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

export function updateTravel(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];

  // Rest recovery tick
  for (const party of world.parties) {
    if (party.restHoursRemaining && party.restHoursRemaining > 0) {
      party.restHoursRemaining -= 1;
      if (party.restHoursRemaining <= 0) {
        party.restHoursRemaining = 0;
        party.wounded = false;
        logs.push({
          category: 'road',
          summary: `${party.name} completes rest`,
          details: 'Ready to travel again.',
          location: party.location,
          actors: [party.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }

  // Occasionally spawn a new roaming band to keep the world lively.
  // ~0.2% per hour = ~15 new bands per year (about 1-2 per month)
  if (rng.chance(0.002)) {
    const id = `band-${world.parties.length}`;
    const name = `${randomName(rng)}'s Band`;
    world.parties.push({
      id,
      name,
      members: [randomName(rng), randomName(rng)],
      location: rng.pick(world.settlements).name,
      status: 'idle',
    });
    logs.push({
      category: 'faction',
      summary: `A new band appears near ${world.parties.at(-1)?.location ?? 'the road'}`,
      details: `${name} takes to the byways.`,
      location: world.parties.at(-1)?.location,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }

  // Update active travel.
  for (const party of world.parties) {
    if (party.status !== 'travel' || !party.travel) continue;

    // Encounter checks while on the move (throttled).
    if (rng.chance(0.25)) {
      const encounter = maybeEncounter(
        rng,
        party.travel.terrain,
        worldTime,
        party.location,
        [party.name],
        world.seed,
      );
      if (encounter) {
        if (encounter.delayMiles && encounter.delayMiles > 0) {
          party.travel.milesRemaining += encounter.delayMiles;
        }
        if (encounter.fatigueDelta && encounter.fatigueDelta > 0) {
          party.fatigue = (party.fatigue ?? 0) + encounter.fatigueDelta;
          // Slow them down after the fatigue hit.
          party.travel.milesPerHour = applyFatigueSpeed(
            milesPerHour(party.travel.terrain),
            party.fatigue,
          );
        }
        if (encounter.injured) {
          party.wounded = true;
          party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 24);
        }
        if (encounter.death) {
          party.fame = Math.max(0, (party.fame ?? 0) - 1);
          logs.push({
            category: 'road',
            summary: `${party.name} suffers losses`,
            details: 'A grim tally after the fight.',
            actors: [party.name],
            location: party.location,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        } else {
          party.fame = (party.fame ?? 0) + 1;
        }
        logs.push(encounter);
      }
    }

    // If destination is a dungeon, simulate wandering checks as they draw near.
    const destinationIsDungeon = world.dungeons.some((d) => d.name === party.travel.destination);
    if (destinationIsDungeon && rng.chance(0.3)) {
      const dungeon = world.dungeons.find((d) => d.name === party.travel.destination)!;
      const wand = dungeonWanders(rng, dungeon, [party.name], worldTime, world.seed, world);
      if (wand) logs.push(wand);
    }

    // Advance time for this leg.
    party.travel.milesRemaining -= party.travel.milesPerHour;

    if (party.travel.milesRemaining <= 0) {
      party.location = party.travel.destination;
      const arrivedAt = party.location;
      party.status = 'idle';
      party.travel = undefined;
      // Clear goal if reached
      if (party.goal && party.goal.target === arrivedAt) {
        party.goal = undefined;
      }
      // Recover a bit of fatigue on arrival.
      if (party.fatigue && party.fatigue > 0) {
        party.fatigue = Math.max(0, party.fatigue - 1);
      }
      logs.push({
        category: 'road',
        summary: `${party.name} arrives at ${arrivedAt}`,
        details: isDay(worldTime)
          ? 'They find an inn and stable their mounts.'
          : 'They slip through the gates as lanterns are lit.',
        location: arrivedAt,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      const dungeon = world.dungeons.find((d) => d.name === arrivedAt);
      if (dungeon) {
        // Now handled by onTurnTick for real-time turn granularity
        // const delveLogs = exploreDungeonTick(rng, dungeon, [party.name], worldTime, world.seed, world);
        // logs.push(...delveLogs);
      }
      // Fame spotlight
      if ((party.fame ?? 0) >= 5 && rng.chance(0.3)) {
        logs.push({
          category: 'town',
          summary: `${party.name} gain renown`,
          details: 'Locals share tales of their exploits.',
          location: arrivedAt,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }

  return logs;
}

export function maybeStartTravel(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  return ensureTravel(world, rng, worldTime);
}

