import { Random } from './rng.ts';
import { WorldState, NPC } from './types.ts';

export function chooseNPCEscort(world: WorldState, rng: Random): NPC | null {
  // Exclude guards/scouts who are already assigned to caravans
  const assignedEscortIds = new Set(world.caravans.flatMap(c => c.escorts || []));
  const candidates = world.npcs.filter((n) =>
    ['guard', 'scout'].includes(n.role) && !assignedEscortIds.has(n.id)
  );
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

export function chooseNPCMerchant(world: WorldState, rng: Random): NPC | null {
  // Exclude merchants/bards who are already assigned to caravans
  const assignedMerchantIds = new Set(world.caravans.map(c => c.merchantId).filter(Boolean));
  const candidates = world.npcs.filter((n) =>
    ['merchant', 'bard'].includes(n.role) && !assignedMerchantIds.has(n.id)
  );
  if (!candidates.length) return null;
  return rng.pick(candidates);
}

