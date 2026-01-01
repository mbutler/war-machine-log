import { Random } from './rng.ts';
import { LogEntry, WorldState } from './types.ts';
import { pathTerrain, distanceMiles, settlementById } from './world.ts';
import { applyFatigueSpeed } from './travel.ts';
import { applyCaravanTrade } from './town.ts';
import { chooseNPCEscort, chooseNPCMerchant } from './travelers.ts';
import { moveEscortsIntoTown, npcArrivalLogs } from './npc.ts';
import { updateFactionWealth, updateFactionAttitude } from './world.ts';
import { createRumor, logRumor } from './rumors.ts';
import { factionRumorOnEvent } from './factions.ts';
import { randomName } from './naming.ts';

// Helper to get faction name from ID
function getFactionName(world: WorldState, factionId: string): string {
  const faction = world.factions.find((f) => f.id === factionId);
  return faction?.name ?? factionId;
}

export function advanceCaravans(world: WorldState, rng: Random, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const caravan of world.caravans) {
    const [fromId, toId] =
      caravan.direction === 'outbound'
        ? caravan.route
        : ([caravan.route[1], caravan.route[0]] as [string, string]);
    const from = settlementById(world, fromId);
    const to = settlementById(world, toId);
    if (!from || !to) continue;

    // If no escort, sometimes attach one.
    if (!caravan.escorts || caravan.escorts.length === 0) {
      const escort = chooseNPCEscort(world, rng);
      if (escort) {
        caravan.escorts = [escort.id];
      }
    }
    // If no merchant assigned, attach one.
    if (!caravan.merchantId) {
      const merch = chooseNPCMerchant(world, rng);
      if (merch) {
        caravan.merchantId = merch.id;
      }
    }

    const distance = distanceMiles(world, from.name, to.name) ?? 12;
    const terrain = pathTerrain(world, from.name, to.name);
    const mph = applyFatigueSpeed(
      // caravans are slower: 75% of party speed
      (distance / 24) * 0.75,
      0,
    );
    caravan.progressHours += 1;
    const milesCovered = caravan.progressHours * mph;
    if (milesCovered >= distance) {
      caravan.location = to.name;
      caravan.direction = caravan.direction === 'outbound' ? 'inbound' : 'outbound';
      caravan.progressHours = 0;
      applyCaravanTrade(world, to.name, caravan.goods);
      if (caravan.factionId) {
        updateFactionWealth(world, caravan.factionId, 3);
        updateFactionAttitude(world, caravan.factionId, to.name, 1);
      }
      const escorts = caravan.escorts ? moveEscortsIntoTown(world, caravan.escorts, to.name) : [];
      const merchants = caravan.merchantId ? moveEscortsIntoTown(world, [caravan.merchantId], to.name) : [];
      const factionBanner = caravan.factionId ? getFactionName(world, caravan.factionId) : null;
      logs.push({
        category: 'town',
        summary: `${caravan.name} arrives at ${to.name}`,
        details: `Bringing ${caravan.goods.join('/')} from ${from.name}${
          caravan.escorts?.length ? ' with escorts' : ''
        }${factionBanner ? ` under banner of ${factionBanner}` : ''}.`,
        location: to.name,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      logs.push(...npcArrivalLogs(escorts, to.name, worldTime, world.seed, world));
      logs.push(...npcArrivalLogs(merchants, to.name, worldTime, world.seed, world));
      // Rumor of safe passage aids faction reputation
      if (caravan.factionId && rng.chance(0.4)) {
        const text = `Word spreads that ${caravan.name} of ${factionBanner} reached ${to.name} with ${caravan.goods.join(
          '/',
        )}.`;
        logs.push(factionRumorOnEvent(world, rng, to.name, caravan.factionId, text, worldTime));
      }
    } else if (rng.chance(0.05)) {
      const escort = caravan.escorts?.length ? ` under escort` : '';
      logs.push({
        category: 'road',
        summary: `${caravan.name} makes camp${escort}`,
        details: `Road to ${to.name} (${terrain}) quiet tonight.`,
        location: caravan.location,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      if (caravan.factionId && rng.chance(0.1)) {
        updateFactionWealth(world, caravan.factionId, -2);
        updateFactionAttitude(world, caravan.factionId, to.name, -1);
        // Possible escort/merchant harm
        const lossedFactionName = caravan.factionId ? getFactionName(world, caravan.factionId) : 'the caravan';
        if (caravan.escorts?.length && rng.chance(0.3)) {
          const wounded = moveEscortsIntoTown(world, caravan.escorts, caravan.location);
          for (const npc of wounded) {
            if (rng.chance(0.2)) {
              npc.alive = false;
              npc.wounded = true;
              logs.push({
                category: 'road',
                summary: `${npc.name} falls defending the caravan`,
                details: `Loss shakes ${lossedFactionName}.`,
                location: caravan.location,
                worldTime,
                realTime: new Date(),
                seed: world.seed,
              });
            } else {
              npc.wounded = true;
              npc.fame = (npc.fame ?? 0) + 1;
            }
          }
          logs.push(...npcArrivalLogs(wounded.filter((n) => n.alive !== false), caravan.location, worldTime, world.seed, world));
        } else {
          logs.push({
            category: 'road',
            summary: `${caravan.name} reports losses`,
            details: `Supplies spoiled en route; banners of ${lossedFactionName} tarnished.`,
            location: caravan.location,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
        const text = `${caravan.name} of ${lossedFactionName} lost goods on the road; prices may shift.`;
        logs.push(factionRumorOnEvent(world, rng, caravan.location, caravan.factionId, text, worldTime));
      }
    }
  }
  return logs;
}

