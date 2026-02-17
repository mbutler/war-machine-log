export interface EncounterDefinition {
  roll: number | number[];
  name: string;
  qty: string;
  hd: number;
  ac: number;
  dmg: string;
  morale: number;
  treasure: string;
  special?: string; // For special abilities like paralysis, poison, etc.
}

type EncounterTable = EncounterDefinition[];

// BECMI Rules Cyclopedia Dungeon Encounter Tables (pp. 95-96)
export const DUNGEON_ENCOUNTERS: Record<string, EncounterTable> = {
  level1: [
    { roll: 1, name: "Bandit", qty: "1d6", hd: 1, ac: 6, dmg: "1d6", morale: 8, treasure: "A" },
    { roll: 2, name: "Beetle, Fire", qty: "1d6", hd: 1, ac: 4, dmg: "2d4", morale: 7, treasure: "U" },
    { roll: 3, name: "Cave Locust", qty: "1d6", hd: 2, ac: 4, dmg: "1d2", morale: 5, treasure: "U" },
    { roll: 4, name: "Centipede, Giant", qty: "1d6", hd: 0.5, ac: 9, dmg: "0", morale: 7, treasure: "U", special: "poison" },
    { roll: 5, name: "Ghoul", qty: "1d2", hd: 2, ac: 6, dmg: "1d3", morale: 9, treasure: "B", special: "paralysis" },
    { roll: 6, name: "Goblin", qty: "1d6", hd: 0.5, ac: 6, dmg: "1d6", morale: 7, treasure: "R" },
    { roll: [7, 8, 9, 10], name: "Human", qty: "1d3", hd: 1, ac: 9, dmg: "1d6", morale: 8, treasure: "A" },
    { roll: 11, name: "Kobold", qty: "2d6", hd: 0.5, ac: 7, dmg: "1d4", morale: 6, treasure: "J" },
    { roll: 12, name: "Lizard, Gecko", qty: "1d2", hd: 1, ac: 5, dmg: "1d8", morale: 7, treasure: "U" },
    { roll: 13, name: "NPC Party", qty: "1d4", hd: 1, ac: 9, dmg: "1d6", morale: 8, treasure: "A" },
    { roll: 14, name: "Orc", qty: "1d6", hd: 1, ac: 6, dmg: "1d6", morale: 8, treasure: "D" },
    { roll: 15, name: "Skeleton", qty: "1d10", hd: 1, ac: 7, dmg: "1d6", morale: 12, treasure: "U" },
    { roll: 16, name: "Snake, Racer", qty: "1d2", hd: 1, ac: 9, dmg: "1d3", morale: 5, treasure: "U" },
    { roll: 17, name: "Spider, Crab", qty: "1d2", hd: 1, ac: 7, dmg: "1d4", morale: 7, treasure: "U", special: "poison" },
    { roll: 18, name: "Stirge", qty: "1d8", hd: 1, ac: 7, dmg: "1d3", morale: 9, treasure: "L", special: "blood drain" },
    { roll: 19, name: "Troglodyte", qty: "1d3", hd: 2, ac: 5, dmg: "1d6", morale: 9, treasure: "A", special: "stench" },
    { roll: 20, name: "Zombie", qty: "1d3", hd: 2, ac: 8, dmg: "1d8", morale: 12, treasure: "U" },
  ],
  level2: [
    { roll: 1, name: "Beetle, Oil", qty: "1d6", hd: 2, ac: 4, dmg: "2d4", morale: 8, treasure: "U", special: "oil spray" },
    { roll: 2, name: "Carrion Crawler", qty: "1", hd: 3, ac: 7, dmg: "0", morale: 9, treasure: "B", special: "paralysis (8 attacks)" },
    { roll: 3, name: "Ghoul", qty: "1d4", hd: 2, ac: 6, dmg: "1d3", morale: 9, treasure: "B", special: "paralysis" },
    { roll: 4, name: "Gnoll", qty: "1d4", hd: 2, ac: 5, dmg: "1d8", morale: 8, treasure: "D" },
    { roll: 5, name: "Goblin", qty: "2d4", hd: 0.5, ac: 6, dmg: "1d6", morale: 7, treasure: "R" },
    { roll: 6, name: "Gray Ooze", qty: "1", hd: 3, ac: 8, dmg: "2d8", morale: 12, treasure: "U", special: "acid" },
    { roll: 7, name: "Hobgoblin", qty: "1d6", hd: 1, ac: 6, dmg: "1d8", morale: 9, treasure: "D" },
    { roll: [8, 9, 10], name: "Human", qty: "1d3", hd: 2, ac: 4, dmg: "1d8", morale: 9, treasure: "C" },
    { roll: 11, name: "Lizard, Draco", qty: "1", hd: 2, ac: 5, dmg: "1d8", morale: 7, treasure: "U", special: "glide" },
    { roll: 12, name: "Lizard Man", qty: "1d6", hd: 2, ac: 5, dmg: "1d6+1", morale: 8, treasure: "D" },
    { roll: 13, name: "Neanderthal", qty: "2d4", hd: 2, ac: 8, dmg: "1d6", morale: 7, treasure: "C" },
    { roll: 14, name: "NPC Party", qty: "1d4", hd: 2, ac: 6, dmg: "1d8", morale: 9, treasure: "C" },
    { roll: 15, name: "Orc", qty: "1d10", hd: 1, ac: 6, dmg: "1d6", morale: 8, treasure: "D" },
    { roll: 16, name: "Skeleton", qty: "2d6", hd: 1, ac: 7, dmg: "1d6", morale: 12, treasure: "U" },
    { roll: 17, name: "Snake, Pit Viper", qty: "1d6", hd: 2, ac: 6, dmg: "1d4", morale: 7, treasure: "U", special: "poison" },
    { roll: 18, name: "Spider, Black Widow", qty: "1", hd: 3, ac: 6, dmg: "2d6", morale: 8, treasure: "U", special: "poison, web" },
    { roll: 19, name: "Troglodyte", qty: "1d6", hd: 2, ac: 5, dmg: "1d6", morale: 9, treasure: "A", special: "stench" },
    { roll: 20, name: "Zombie", qty: "1d6", hd: 2, ac: 8, dmg: "1d8", morale: 12, treasure: "U" },
  ],
  level3: [
    { roll: 1, name: "Ape, White", qty: "1d4", hd: 4, ac: 6, dmg: "1d4", morale: 7, treasure: "U" },
    { roll: 2, name: "Beetle, Tiger", qty: "1d4", hd: 3, ac: 3, dmg: "2d6", morale: 9, treasure: "U" },
    { roll: 3, name: "Bugbear", qty: "1d6", hd: 3, ac: 5, dmg: "2d4", morale: 9, treasure: "B" },
    { roll: 4, name: "Carrion Crawler", qty: "1d3", hd: 3, ac: 7, dmg: "0", morale: 9, treasure: "B", special: "paralysis" },
    { roll: 5, name: "Doppleganger", qty: "1d2", hd: 4, ac: 5, dmg: "1d12", morale: 10, treasure: "E", special: "shapeshift" },
    { roll: 6, name: "Gargoyle", qty: "1d3", hd: 4, ac: 5, dmg: "1d4", morale: 11, treasure: "C", special: "+1 weapon to hit" },
    { roll: 7, name: "Gelatinous Cube", qty: "1", hd: 4, ac: 8, dmg: "2d4", morale: 12, treasure: "V", special: "paralysis, engulf" },
    { roll: 8, name: "Harpy", qty: "1d3", hd: 3, ac: 7, dmg: "1d4", morale: 7, treasure: "C", special: "charm song" },
    { roll: [9, 10], name: "Human", qty: "1d3", hd: 3, ac: 4, dmg: "1d8", morale: 9, treasure: "C" },
    { roll: 11, name: "Living Statue, Crystal", qty: "1d4", hd: 3, ac: 4, dmg: "1d6", morale: 11, treasure: "U" },
    { roll: 12, name: "Lycanthrope, Wererat", qty: "1d6", hd: 3, ac: 7, dmg: "1d4", morale: 8, treasure: "C", special: "lycanthropy" },
    { roll: 13, name: "Medusa", qty: "1", hd: 4, ac: 8, dmg: "1d6", morale: 8, treasure: "F", special: "petrify gaze, poison snakes" },
    { roll: 14, name: "NPC Party", qty: "1d4", hd: 3, ac: 5, dmg: "1d8", morale: 9, treasure: "C" },
    { roll: 15, name: "Ochre Jelly", qty: "1", hd: 5, ac: 8, dmg: "2d6", morale: 12, treasure: "U", special: "acid, splits" },
    { roll: 16, name: "Ogre", qty: "1d3", hd: 4, ac: 5, dmg: "1d10", morale: 10, treasure: "C" },
    { roll: 17, name: "Shadow", qty: "1d4", hd: 2, ac: 7, dmg: "1d4", morale: 12, treasure: "F", special: "str drain, immune to normal weapons" },
    { roll: 18, name: "Spider, Tarantella", qty: "1", hd: 4, ac: 5, dmg: "1d8", morale: 8, treasure: "U", special: "poison (dance)" },
    { roll: 19, name: "Thoul", qty: "1d4", hd: 3, ac: 6, dmg: "1d4", morale: 10, treasure: "C", special: "paralysis, regenerate" },
    { roll: 20, name: "Wight", qty: "1d3", hd: 3, ac: 5, dmg: "energy drain", morale: 12, treasure: "B", special: "energy drain" },
  ],
  level45: [
    { roll: 1, name: "Blink Dog", qty: "1d4", hd: 4, ac: 5, dmg: "1d6", morale: 6, treasure: "C", special: "teleport" },
    { roll: 2, name: "Bugbear", qty: "1d6+4", hd: 3, ac: 5, dmg: "2d4", morale: 9, treasure: "B" },
    { roll: 3, name: "Caecilia", qty: "1", hd: 6, ac: 6, dmg: "1d8", morale: 9, treasure: "B", special: "swallow whole" },
    { roll: 4, name: "Cockatrice", qty: "1d2", hd: 5, ac: 6, dmg: "1d6", morale: 7, treasure: "D", special: "petrify" },
    { roll: 5, name: "Displacer Beast", qty: "1", hd: 6, ac: 4, dmg: "2d4", morale: 8, treasure: "D", special: "displacement (-2 to hit)" },
    { roll: 6, name: "Gargoyle", qty: "1d4+1", hd: 4, ac: 5, dmg: "1d4", morale: 11, treasure: "C", special: "+1 weapon to hit" },
    { roll: 7, name: "Giant, Hill", qty: "1", hd: 8, ac: 4, dmg: "2d8", morale: 8, treasure: "E" },
    { roll: 8, name: "Harpy", qty: "1d4+1", hd: 3, ac: 7, dmg: "1d4", morale: 7, treasure: "C", special: "charm song" },
    { roll: 9, name: "Hellhound", qty: "1d4", hd: 4, ac: 4, dmg: "1d6", morale: 9, treasure: "C", special: "breathe fire" },
    { roll: 10, name: "Hydra", qty: "1", hd: 5, ac: 5, dmg: "1d10", morale: 9, treasure: "B", special: "5 heads" },
    { roll: 11, name: "Lycanthrope, Werewolf", qty: "1d4", hd: 4, ac: 5, dmg: "2d4", morale: 8, treasure: "C", special: "lycanthropy" },
    { roll: 12, name: "Medusa", qty: "1d2", hd: 4, ac: 8, dmg: "1d6", morale: 8, treasure: "F", special: "petrify gaze" },
    { roll: 13, name: "Mummy", qty: "1d3", hd: 5, ac: 3, dmg: "1d12", morale: 12, treasure: "D", special: "disease, fear" },
    { roll: 14, name: "NPC Party", qty: "1d4", hd: 4, ac: 4, dmg: "1d8", morale: 9, treasure: "D" },
    { roll: 15, name: "Ochre Jelly", qty: "1", hd: 5, ac: 8, dmg: "2d6", morale: 12, treasure: "U", special: "acid" },
    { roll: 16, name: "Rhagodessa", qty: "1d3", hd: 4, ac: 5, dmg: "2d8", morale: 9, treasure: "U", special: "sticky legs" },
    { roll: 17, name: "Rust Monster", qty: "1d2", hd: 5, ac: 2, dmg: "0", morale: 7, treasure: "U", special: "rusts metal" },
    { roll: 18, name: "Scorpion, Giant", qty: "1d3", hd: 4, ac: 2, dmg: "1d10", morale: 11, treasure: "V", special: "poison" },
    { roll: 19, name: "Troll", qty: "1d2", hd: 6, ac: 4, dmg: "1d6", morale: 10, treasure: "D", special: "regenerate" },
    { roll: 20, name: "Wraith", qty: "1d2", hd: 4, ac: 3, dmg: "1d6", morale: 11, treasure: "E", special: "energy drain" },
  ],
  level67: [
    { roll: 1, name: "Basilisk", qty: "1d3", hd: 6, ac: 4, dmg: "1d10", morale: 9, treasure: "F", special: "petrify gaze" },
    { roll: 2, name: "Caecilia", qty: "1d4", hd: 6, ac: 6, dmg: "1d8", morale: 9, treasure: "B", special: "swallow whole" },
    { roll: 3, name: "Cockatrice", qty: "1d3", hd: 5, ac: 6, dmg: "1d6", morale: 7, treasure: "D", special: "petrify" },
    { roll: 4, name: "Giant, Hill", qty: "1d2", hd: 8, ac: 4, dmg: "2d8", morale: 8, treasure: "E" },
    { roll: 5, name: "Giant, Stone", qty: "1d2", hd: 9, ac: 4, dmg: "3d6", morale: 9, treasure: "E" },
    { roll: 6, name: "Hellhound", qty: "1d4", hd: 6, ac: 4, dmg: "1d6", morale: 9, treasure: "C", special: "breathe fire 6HD" },
    { roll: 7, name: "Hydra", qty: "1", hd: 7, ac: 5, dmg: "1d10", morale: 9, treasure: "B", special: "7 heads" },
    { roll: 8, name: "Lycanthrope, Weretiger", qty: "1d3", hd: 5, ac: 3, dmg: "1d6", morale: 9, treasure: "C", special: "lycanthropy" },
    { roll: 9, name: "Manticore", qty: "1", hd: 6, ac: 4, dmg: "1d4", morale: 9, treasure: "D", special: "tail spikes" },
    { roll: 10, name: "Minotaur", qty: "1d4", hd: 6, ac: 6, dmg: "1d6", morale: 12, treasure: "C" },
    { roll: 11, name: "Mummy", qty: "1d4", hd: 5, ac: 3, dmg: "1d12", morale: 12, treasure: "D", special: "disease, fear" },
    { roll: 12, name: "NPC Party", qty: "1d4", hd: 6, ac: 3, dmg: "1d8", morale: 9, treasure: "E" },
    { roll: 13, name: "Ochre Jelly", qty: "1", hd: 5, ac: 8, dmg: "2d6", morale: 12, treasure: "U", special: "acid" },
    { roll: 14, name: "Ogre", qty: "2d4", hd: 4, ac: 5, dmg: "1d10", morale: 10, treasure: "C" },
    { roll: 15, name: "Rust Monster", qty: "1d3+1", hd: 5, ac: 2, dmg: "0", morale: 7, treasure: "U", special: "rusts metal" },
    { roll: 16, name: "Spectre", qty: "1d3", hd: 6, ac: 2, dmg: "1d8", morale: 11, treasure: "E", special: "energy drain x2" },
    { roll: 17, name: "Spider, Tarantella", qty: "1d3", hd: 4, ac: 5, dmg: "1d8", morale: 8, treasure: "U", special: "poison" },
    { roll: 18, name: "Salamander, Flame", qty: "1d2", hd: 8, ac: 2, dmg: "1d8", morale: 8, treasure: "F", special: "fire aura, immune to fire" },
    { roll: 19, name: "Troll", qty: "1d4+1", hd: 6, ac: 4, dmg: "1d6", morale: 10, treasure: "D", special: "regenerate" },
    { roll: 20, name: "Vampire", qty: "1", hd: 8, ac: 2, dmg: "1d10", morale: 11, treasure: "F", special: "energy drain, charm, gaseous form" },
  ],
  level810: [
    { roll: 1, name: "Basilisk", qty: "1d6", hd: 6, ac: 4, dmg: "1d10", morale: 9, treasure: "F", special: "petrify" },
    { roll: 2, name: "Black Pudding", qty: "1", hd: 10, ac: 6, dmg: "3d8", morale: 12, treasure: "U", special: "acid, dissolves" },
    { roll: 3, name: "Chimera", qty: "1", hd: 9, ac: 4, dmg: "2d4", morale: 9, treasure: "F", special: "breath fire, fly" },
    { roll: 4, name: "Devil Swine", qty: "1d2", hd: 9, ac: 3, dmg: "2d6", morale: 10, treasure: "C", special: "charm, shapeshift" },
    { roll: 5, name: "Dragon", qty: "1d2", hd: 9, ac: 2, dmg: "2d8", morale: 9, treasure: "H", special: "breath weapon" },
    { roll: [6, 7], name: "Giant", qty: "1d6", hd: 10, ac: 4, dmg: "3d6", morale: 9, treasure: "E", special: "varies by type" },
    { roll: 8, name: "Golem", qty: "1", hd: 10, ac: 3, dmg: "2d8", morale: 12, treasure: "U", special: "immune to most magic" },
    { roll: 9, name: "Hydra", qty: "1", hd: 10, ac: 5, dmg: "1d10", morale: 9, treasure: "B", special: "10 heads" },
    { roll: 10, name: "Living Statue, Iron", qty: "1d4+1", hd: 4, ac: 2, dmg: "1d8", morale: 11, treasure: "U", special: "immune to normal weapons" },
    { roll: [11, 12], name: "Lycanthrope, Werebear", qty: "1d6+1", hd: 6, ac: 2, dmg: "2d4", morale: 10, treasure: "C", special: "lycanthropy" },
    { roll: 13, name: "NPC Party", qty: "1d4", hd: 8, ac: 2, dmg: "1d8+2", morale: 10, treasure: "F" },
    { roll: 14, name: "Purple Worm", qty: "1", hd: 15, ac: 6, dmg: "2d8", morale: 10, treasure: "D", special: "swallow whole, poison tail" },
    { roll: 15, name: "Rust Monster", qty: "1d4+1", hd: 5, ac: 2, dmg: "0", morale: 7, treasure: "U", special: "rusts metal" },
    { roll: 16, name: "Salamander, Frost", qty: "1d4", hd: 12, ac: 3, dmg: "1d6", morale: 8, treasure: "E", special: "cold aura, immune to cold" },
    { roll: 17, name: "Snake, Giant Python", qty: "1d4+1", hd: 5, ac: 6, dmg: "1d4", morale: 8, treasure: "U", special: "constrict" },
    { roll: 18, name: "Spectre", qty: "1d3", hd: 6, ac: 2, dmg: "1d8", morale: 11, treasure: "E", special: "energy drain x2" },
    { roll: 19, name: "Spider, Giant", qty: "1d4+1", hd: 4, ac: 6, dmg: "2d6", morale: 8, treasure: "U", special: "poison, web" },
    { roll: 20, name: "Vampire", qty: "1d2", hd: 9, ac: 2, dmg: "1d10", morale: 11, treasure: "F", special: "energy drain, charm" },
  ],
};

// Get table for a dungeon level
function getTableForLevel(level: number): EncounterTable {
  if (level <= 1) return DUNGEON_ENCOUNTERS.level1;
  if (level === 2) return DUNGEON_ENCOUNTERS.level2;
  if (level === 3) return DUNGEON_ENCOUNTERS.level3;
  if (level <= 5) return DUNGEON_ENCOUNTERS.level45;
  if (level <= 7) return DUNGEON_ENCOUNTERS.level67;
  return DUNGEON_ENCOUNTERS.level810;
}

export function pickEncounter(level: number, roll: number): EncounterDefinition | null {
  const table = getTableForLevel(level);
  for (const entry of table) {
    if (Array.isArray(entry.roll)) {
      if (entry.roll.includes(roll)) return entry;
    } else if (entry.roll === roll) {
      return entry;
    }
  }
  return null;
}

// BECMI Monster Reactions Table (p. 93)
// Roll 2d6:
// 2-3: Attack immediately
// 4-6: Aggressive (growls, threatens) - roll again with -4 penalty
// 7-9: Cautious - roll again
// 10-11: Neutral - roll again with +4 bonus
// 12: Friendly
export type ReactionResult = "hostile" | "aggressive" | "cautious" | "neutral" | "friendly";

export interface ReactionRollResult {
  roll: number;
  modifier: number;
  total: number;
  result: ReactionResult;
  needsReroll: boolean;
  nextModifier: number; // For subsequent rolls
}

export function rollReaction(modifier: number = 0): ReactionRollResult {
  const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  const total = roll + modifier;
  
  let result: ReactionResult;
  let needsReroll = false;
  let nextModifier = modifier;
  
  if (total <= 3) {
    result = "hostile";
    needsReroll = false;
  } else if (total <= 6) {
    result = "aggressive";
    needsReroll = true;
    nextModifier = modifier - 4; // Roll again with -4 penalty
  } else if (total <= 9) {
    result = "cautious";
    needsReroll = true;
    nextModifier = modifier; // Roll again with no change
  } else if (total <= 11) {
    result = "neutral";
    needsReroll = true;
    nextModifier = modifier + 4; // Roll again with +4 bonus
  } else {
    result = "friendly";
    needsReroll = false;
  }
  
  return { roll, modifier, total, result, needsReroll, nextModifier };
}

// Final reaction after up to 3 rolls
export function resolveReaction(charismaModifier: number = 0): { 
  finalResult: ReactionResult; 
  rolls: ReactionRollResult[];
} {
  const rolls: ReactionRollResult[] = [];
  let currentModifier = 0; // First roll has no Charisma adjustment per BECMI
  
  for (let i = 0; i < 3; i++) {
    const result = rollReaction(currentModifier);
    rolls.push(result);
    
    if (!result.needsReroll) {
      return { finalResult: result.result, rolls };
    }
    
    // After first roll, apply Charisma modifier
    if (i === 0) {
      currentModifier = result.nextModifier + charismaModifier;
    } else {
      currentModifier = result.nextModifier;
    }
  }
  
  // After 3 rolls without resolution, if not at 10+, monster attacks or leaves
  const lastRoll = rolls[rolls.length - 1];
  const finalResult = lastRoll.total >= 10 ? "neutral" : "hostile";
  return { finalResult, rolls };
}

// BECMI Surprise Rules (p. 92)
// Both sides roll 1d6, surprised on 1-2
export interface SurpriseResult {
  partyRoll: number;
  monsterRoll: number;
  partySurprised: boolean;
  monsterSurprised: boolean;
  description: string;
}

export function rollSurprise(partyModifier: number = 0, monsterModifier: number = 0): SurpriseResult {
  const partyRoll = Math.floor(Math.random() * 6) + 1;
  const monsterRoll = Math.floor(Math.random() * 6) + 1;
  
  // Surprised on 1-2 (modifiers adjust the threshold)
  const partySurprised = partyRoll + partyModifier <= 2;
  const monsterSurprised = monsterRoll + monsterModifier <= 2;
  
  let description: string;
  if (partySurprised && monsterSurprised) {
    description = "Both sides are surprised! A moment of confusion ensues.";
  } else if (partySurprised) {
    description = "The party is surprised! The monsters get a free action.";
  } else if (monsterSurprised) {
    description = "The monsters are surprised! The party may act freely or evade.";
  } else {
    description = "Neither side is surprised. Both are on guard.";
  }
  
  return { partyRoll, monsterRoll, partySurprised, monsterSurprised, description };
}

// BECMI Encounter Distance (p. 92)
// Varies by lighting conditions
export type LightingCondition = "bright" | "dim" | "dark";

export function rollEncounterDistance(lighting: LightingCondition = "dim", isDungeon: boolean = true): number {
  let baseDice: number;
  let multiplier: number;
  
  switch (lighting) {
    case "bright": // Very good light
      baseDice = Math.floor(Math.random() * 6) + 1 +
                 Math.floor(Math.random() * 6) + 1 +
                 Math.floor(Math.random() * 6) + 1 +
                 Math.floor(Math.random() * 6) + 1; // 4d6
      break;
    case "dim": // Dim light or infravision
      baseDice = Math.floor(Math.random() * 6) + 1 +
                 Math.floor(Math.random() * 6) + 1; // 2d6
      break;
    case "dark": // No light
      baseDice = Math.floor(Math.random() * 4) + 1; // 1d4
      break;
  }
  
  // Dungeon: multiply by 10 (feet), Wilderness: multiply by 10 (yards)
  multiplier = 10;
  
  return baseDice * multiplier;
}

// Wandering monster distance is always 2d6 × 10' per BECMI
export function rollWanderingMonsterDistance(): number {
  const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
  return roll * 10;
}
