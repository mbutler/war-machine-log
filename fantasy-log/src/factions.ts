import { Random } from './rng.ts';
import { LogEntry, WorldState } from './types.ts';
import { createRumor, logRumor } from './rumors.ts';

export function adjustAttitudes(world: WorldState, actorId: string, delta: number) {
  for (const f of world.factions) {
    if (!f.attitude[actorId]) f.attitude[actorId] = 0;
    f.attitude[actorId] = Math.max(-3, Math.min(3, f.attitude[actorId] + delta));
  }
}

export function factionRumorOnEvent(
  world: WorldState,
  rng: Random,
  town: string,
  factionId: string,
  text: string,
  worldTime: Date,
): LogEntry {
  const rumor = createRumor(world, rng, town, town, 'feud', text);
  world.activeRumors.push(rumor);
  return logRumor(rumor, worldTime, world.seed);
}

export function factionTownBeat(world: WorldState, rng: Random, town: string, worldTime: Date): LogEntry[] {
  const logs: LogEntry[] = [];
  for (const faction of world.factions) {
    if (!faction.lastNoted || rng.chance(0.2)) {
      const attitude = faction.attitude[town] ?? 0;
      const flavor =
        attitude >= 2
          ? 'offers protection for caravans'
          : attitude <= -2
          ? 'demands tariffs and patrols the roads heavily'
          : 'watches the markets quietly';
      const rumor = createRumor(
        world,
        rng,
        town,
        town,
        'feud',
        `${faction.name} ${flavor}.`,
      );
      world.activeRumors.push(rumor);
      logs.push(logRumor(rumor, worldTime, world.seed));
      faction.lastNoted = town;
    }
  }
  return logs;
}

