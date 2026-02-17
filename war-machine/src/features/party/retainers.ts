import type { Retainer } from "../../state/schema";
import { getAbilityMod } from "../../rules/tables/abilityMods";
import { rollDie, pickRandom } from "../../rules/dice";
import { getRandomName } from "./nameBag";
import { createId } from "../../utils/id";

export type RetainerTier = 
  | "normal" 
  | "torchbearer" 
  | "porter" 
  | "lightfoot" 
  | "heavyfoot" 
  | "crossbow" 
  | "archer" 
  | "longbow"
  | "horseman"
  | "mediumhorse"
  | "spy"
  | "guide"
  | "armorer";

export type RetainerCategory = "hirelings" | "mercenaries" | "specialists";

export interface RetainerTypeDefinition {
  id: RetainerTier;
  label: string;
  description: string;
  category: RetainerCategory;
  ac: number;
  hd: number;
  hpBonus: number;
  thac0: number;
  wage: number;
  wageNote?: string; // e.g. "per mission" vs default "per month"
  equipment: string;
}

// BECMI Rules Cyclopedia Chapter 11 - Mercenaries & Specialists Tables
// All mercenaries are 1st level, come with minimum equipment indicated
// Double pay rates for wartime
export const RETAINER_TYPES: RetainerTypeDefinition[] = [
  // === HIRELINGS (non-combat support) ===
  {
    id: "normal",
    label: "Normal Man",
    description: "0-level peasant willing to do odd jobs",
    category: "hirelings",
    ac: 9,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 1,
    equipment: "Clothes, spear",
  },
  {
    id: "torchbearer",
    label: "Torch Bearer",
    description: "Carries light sources and stays close to the party",
    category: "hirelings",
    ac: 9,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 2,
    equipment: "Torches, dagger",
  },
  {
    id: "porter",
    label: "Porter",
    description: "Carries treasure and supplies, hauls heavy loads",
    category: "hirelings",
    ac: 9,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 2,
    equipment: "Backpack, staff",
  },
  // === MERCENARIES (combat troops) ===
  {
    id: "lightfoot",
    label: "Light Footman",
    description: "Lightly armored infantry with sword and shield",
    category: "mercenaries",
    ac: 6,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 2,
    equipment: "Leather armor, shield, sword",
  },
  {
    id: "heavyfoot",
    label: "Heavy Footman",
    description: "Well-armored infantry with chain mail",
    category: "mercenaries",
    ac: 4,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 3,
    equipment: "Chain mail, shield, sword",
  },
  {
    id: "crossbow",
    label: "Crossbowman",
    description: "Armored soldier with heavy crossbow",
    category: "mercenaries",
    ac: 5,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 4,
    equipment: "Chain mail, heavy crossbow, dagger",
  },
  {
    id: "archer",
    label: "Archer",
    description: "Light infantry with short bow for ranged attacks",
    category: "mercenaries",
    ac: 7,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 5,
    equipment: "Leather armor, short bow, sword",
  },
  {
    id: "longbow",
    label: "Longbowman",
    description: "Elite archer with powerful longbow",
    category: "mercenaries",
    ac: 5,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 10,
    equipment: "Chain mail, longbow, sword",
  },
  {
    id: "horseman",
    label: "Light Horseman",
    description: "Mounted warrior with lance and shield",
    category: "mercenaries",
    ac: 6,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 10,
    equipment: "Leather armor, shield, lance, riding horse",
  },
  {
    id: "mediumhorse",
    label: "Medium Horseman",
    description: "Armored cavalry with lance, sword and chain mail",
    category: "mercenaries",
    ac: 4,
    hd: 6,
    hpBonus: 1,
    thac0: 20,
    wage: 15,
    equipment: "Chain mail, shield, lance, sword, war horse",
  },
  // === SPECIALISTS (skilled professionals) ===
  {
    id: "spy",
    label: "Spy",
    description: "Gathers intelligence on targets. Usually a thief.",
    category: "specialists",
    ac: 8,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 500,
    wageNote: "per mission",
    equipment: "Disguise kit, dagger, dark clothes",
  },
  {
    id: "guide",
    label: "Guide",
    description: "Expert navigator for wilderness or dungeon travel",
    category: "specialists",
    ac: 8,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 25,
    equipment: "Maps, compass, lantern, rope",
  },
  {
    id: "armorer",
    label: "Armorer",
    description: "Repairs and maintains armor and weapons in the field",
    category: "specialists",
    ac: 9,
    hd: 6,
    hpBonus: 0,
    thac0: 20,
    wage: 100,
    equipment: "Smith tools, repair kit",
  },
];

export function generateRetainer(type: RetainerTypeDefinition): Retainer {
  const hp = Math.max(1, rollDie(type.hd) + type.hpBonus);
  const name = getRandomName();

  return {
    id: createId(),
    name,
    class: type.label,
    level: 0,
    hp: { current: hp, max: hp },
    morale: rollDie(6) + rollDie(6) + 6,
    wage: type.wage,
    ac: type.ac,
    thac0: type.thac0,
    equipment: type.equipment,
  };
}

export function canRecruitRetainer(currentCount: number, maxCount: number): boolean {
  return currentCount < maxCount;
}

