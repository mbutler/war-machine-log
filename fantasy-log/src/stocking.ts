import { Random } from './rng.ts';
import { Dungeon, RareFind, StockedRoom } from './types.ts';

const ROOM_TYPES = ['lair', 'trap', 'treasure', 'empty', 'shrine', 'laboratory'] as const;

export function stockDungeon(rng: Random, dungeon: Dungeon, rooms = 12): StockedRoom[] {
  const stocked: StockedRoom[] = [];
  for (let i = 0; i < rooms; i += 1) {
    const type = rng.pick(ROOM_TYPES);
    const threat = Math.max(1, Math.min(5, dungeon.danger + rng.int(3) - 1));
    const loot = rng.chance(0.35);
    const rare = loot && rng.chance(0.1) ? rng.pick<RareFind>(['artifact', 'relic', 'ancient-map']) : undefined;
    stocked.push({ type, threat, loot, rare });
  }
  return stocked;
}

