import { config } from './config.ts';
import { EventBus } from './events.ts';
import { Logger } from './logging.ts';
import { makeRandom } from './rng.ts';
import { Scheduler } from './scheduler.ts';
import { LogEntry, TickEvent } from './types.ts';
import { createInitialWorld } from './world.ts';
import { updateTravel, maybeStartTravel } from './travel.ts';
import { loadWorld, saveWorld } from './persistence.ts';

const bus = new EventBus();
const rng = makeRandom(config.seed);
const logger = new Logger(config.logDir);
const worldPromise = (async () => {
  const loaded = await loadWorld();
  if (loaded) return loaded;
  const fresh = createInitialWorld(rng, config.seed, config.startWorldTime);
  await saveWorld(fresh);
  return fresh;
})();
const scheduler = new Scheduler(bus, config);

async function log(entry: Omit<LogEntry, 'realTime'>) {
  await logger.log({ ...entry, realTime: new Date() });
}

function onTick(event: TickEvent): void {
  // onTick now async-aware via void calls.
  if (event.kind === 'turn') {
    // Keep turn-level noise minimal; travel/encounter handled hourly.
  }

  if (event.kind === 'hour') {
    void (async () => {
      const world = await worldPromise;
      const travelLogs = updateTravel(world, rng, event.worldTime);
      for (const entry of travelLogs) void log(entry);
      await saveWorld(world);
    })();

    // Light town beat, but not every hour.
    if (rng.chance(0.2)) {
      void (async () => {
        const world = await worldPromise;
        const settlement = rng.pick(world.settlements);
        await log({
          category: 'town',
          summary: `${settlement.name} market murmurs`,
          details: rng.chance(0.5)
            ? 'Caravans arrive with modest goods.'
            : 'Merchants grumble about thin traffic.',
          location: settlement.name,
          worldTime: event.worldTime,
          seed: config.seed,
        });
      })();
    }
  }

  if (event.kind === 'day') {
    void (async () => {
      const world = await worldPromise;
      // Chance to kick off new travel plans each day.
      const startLogs = maybeStartTravel(world, rng, event.worldTime);
      for (const entry of startLogs) void log(entry);
      await saveWorld(world);
    })();

    void (async () => {
      const world = await worldPromise;
      const settlement = rng.pick(world.settlements);
      await log({
        category: 'weather',
        summary: `Skies over ${settlement.name}`,
        details: rng.chance(0.5) ? 'Clear and calm.' : 'Clouds threaten rain.',
        location: settlement.name,
        worldTime: event.worldTime,
        seed: config.seed,
      });
    })();
  }
}

function main() {
  bus.subscribe('turn', onTick);
  bus.subscribe('hour', onTick);
  bus.subscribe('day', onTick);

  // Seed initial travel so early ticks have motion (after world is ready).
  void (async () => {
    const world = await worldPromise;
    const initialTravel = maybeStartTravel(world, rng, config.startWorldTime);
    for (const entry of initialTravel) void log(entry);
    await saveWorld(world);
  })();

  const turnMs = config.msPerWorldMinute * config.turnMinutes;
  process.stdout.write(
    `Starting sim at ${config.startWorldTime.toISOString()} with seed="${config.seed}" (timeScale=${config.timeScale}, turn every ${turnMs} ms)\n`,
  );
  scheduler.start();
}

main();

