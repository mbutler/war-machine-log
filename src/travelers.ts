import { Random } from './rng.ts';
import { WorldState, NPC } from './types.ts';

export function chooseNPCEscort(world: WorldState, rng: Random): NPC | null {
  const candidates = world.npcs.filter((n) => ['guard', 'scout'].includes(n.role));
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

export function chooseNPCMerchant(world: WorldState, rng: Random): NPC | null {
  const candidates = world.npcs.filter((n) => ['merchant', 'bard'].includes(n.role));
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

