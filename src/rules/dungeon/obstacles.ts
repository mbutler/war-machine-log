import { rollDie } from "../dice";

export type ObstacleType = "door" | "trap" | "hazard" | "feature";

export interface ObstacleDefinition {
  id: string;
  name: string;
  description: string;
  type: ObstacleType;
  
  // Resolution mechanics
  resolution: {
    // For doors: Open Doors roll (1d6, success 5-6 + Str mod)
    // For traps: Find/Remove Traps percentage or save
    // For hazards: varies
    method: "open_doors" | "thief_skill" | "save" | "automatic" | "custom";
    
    // Time cost in turns (BECMI: 1 turn = 10 minutes)
    turnCost: number;
    
    // Does attempting alert monsters? (failed door = lose surprise)
    alertsMonsters: boolean;
    
    // Damage on failure/trigger (dice formula or 0)
    damage?: string;
    
    // Save type if applicable
    saveType?: "death" | "wands" | "paralysis" | "breath" | "spells";
    
    // Thief skill if applicable
    thiefSkill?: "findTraps" | "removeTraps" | "openLocks";
  };
}

// BECMI Obstacles and Traps
export const OBSTACLES: ObstacleDefinition[] = [
  // DOORS (BECMI p.147)
  {
    id: "stuck-door",
    name: "Stuck Door",
    description: "This heavy door resists your efforts. Roll 1d6 - success on 5 or 6, modified by Strength. A natural 6 always succeeds.",
    type: "door",
    resolution: {
      method: "open_doors",
      turnCost: 0, // Rounds, not turns
      alertsMonsters: true, // Failed attempts lose surprise
    },
  },
  {
    id: "locked-door",
    name: "Locked Door",
    description: "The door is locked. A thief can attempt to pick it, or it can be forced with difficulty.",
    type: "door",
    resolution: {
      method: "thief_skill",
      thiefSkill: "openLocks",
      turnCost: 1,
      alertsMonsters: true,
    },
  },
  {
    id: "secret-door",
    name: "Secret Door",
    description: "A section of wall that might hide a passage. Roll 1d6 - found on 1 (elves find on 1-2). Searching takes one turn.",
    type: "door",
    resolution: {
      method: "custom",
      turnCost: 1, // Per 10x10 area per BECMI
      alertsMonsters: false,
    },
  },
  
  // TRAPS (BECMI p.261)
  {
    id: "pit-trap",
    name: "Pit Trap",
    description: "A concealed pit yawns open beneath you! Victims may attempt to grab the edge to avoid falling.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "wands",
      turnCost: 0,
      alertsMonsters: true,
      damage: "1d6", // Basic pit, can be deeper
    },
  },
  {
    id: "spiked-pit",
    name: "Spiked Pit Trap",
    description: "The pit floor is lined with cruel iron spikes! Victims may attempt to avoid the spikes during the fall.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "wands",
      turnCost: 0,
      alertsMonsters: true,
      damage: "2d6", // Fall + spikes
    },
  },
  {
    id: "poison-dart-trap",
    name: "Poison Dart Trap",
    description: "Pressure plates trigger darts from the walls! A thief can disarm it. Failure triggers the trap - save vs. Poison.",
    type: "trap",
    resolution: {
      method: "thief_skill",
      thiefSkill: "removeTraps",
      turnCost: 1,
      alertsMonsters: true,
      damage: "1d4",
      saveType: "death", // Poison save
    },
  },
  {
    id: "poison-needle",
    name: "Poison Needle Trap",
    description: "A tiny needle springs out when the object is touched! Nearly impossible to see. The needle may be coated with poison.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "death",
      turnCost: 0,
      alertsMonsters: false,
      damage: "0", // Poison effect, not HP damage
    },
  },
  {
    id: "falling-block",
    name: "Falling Block Trap",
    description: "A massive stone block drops from the ceiling! Victims may attempt to dodge the falling stone.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "wands",
      turnCost: 0,
      alertsMonsters: true,
      damage: "2d6",
    },
  },
  {
    id: "blade-trap",
    name: "Swinging Blade Trap",
    description: "A razor-sharp blade sweeps across the passage! Victims may attempt to duck or dodge the blade.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "wands",
      turnCost: 0,
      alertsMonsters: true,
      damage: "1d8",
    },
  },
  {
    id: "gas-trap",
    name: "Poison Gas Trap",
    description: "Noxious vapors fill the area when the trap triggers! Victims may attempt to resist the poisonous effects.",
    type: "trap",
    resolution: {
      method: "save",
      saveType: "death",
      turnCost: 0,
      alertsMonsters: true,
      damage: "1d6",
    },
  },
  
  // HAZARDS (Environmental - no specific BECMI duration rules)
  {
    id: "chasm",
    name: "Underground Chasm",
    description: "A wide fissure blocks your path, dropping into darkness. Jump, use rope, or find another route.",
    type: "hazard",
    resolution: {
      method: "custom",
      turnCost: 1, // Time to set up rope, etc.
      alertsMonsters: false,
      damage: "3d6", // If fall
    },
  },
  {
    id: "flooded-passage",
    name: "Flooded Passage",
    description: "Knee-deep water fills this corridor. Movement is slowed and torches risk extinction.",
    type: "hazard",
    resolution: {
      method: "automatic",
      turnCost: 1, // Slowed movement
      alertsMonsters: false,
    },
  },
  {
    id: "collapsed-passage",
    name: "Cave-In / Rubble",
    description: "Fallen rubble blocks the passage. Careful clearing may take considerable time and risks further collapse.",
    type: "hazard",
    resolution: {
      method: "custom",
      turnCost: 3, // Significant time investment (no BECMI rule, reasonable estimate)
      alertsMonsters: true, // Noise from clearing
    },
  },
  {
    id: "slippery-surface",
    name: "Slippery Surface",
    description: "The floor is treacherously slick with water, ice, or moss. Movement risks falling.",
    type: "hazard",
    resolution: {
      method: "save",
      saveType: "paralysis", // Dex-based save
      turnCost: 0,
      alertsMonsters: false,
      damage: "1d4",
    },
  },
  
  // FEATURES (Dungeon specials - no specific damage)
  {
    id: "echoing-chamber",
    name: "Echoing Chamber",
    description: "Strange acoustics amplify all sounds. Stealth is impossible, but you might hear distant noises.",
    type: "feature",
    resolution: {
      method: "automatic",
      turnCost: 0,
      alertsMonsters: true, // Sound carries
    },
  },
  {
    id: "fungus-garden",
    name: "Fungus Garden",
    description: "Strange glowing mushrooms cover the floor. Some may be edible, others poisonous or hallucinogenic.",
    type: "feature",
    resolution: {
      method: "custom",
      turnCost: 1, // If harvesting/investigating
      alertsMonsters: false,
    },
  },
  {
    id: "illusion-wall",
    name: "Illusory Wall",
    description: "This section of wall shimmers unnaturally. It may be an illusion hiding a passage - probing reveals the truth.",
    type: "feature",
    resolution: {
      method: "automatic",
      turnCost: 0,
      alertsMonsters: false,
    },
  },
  {
    id: "magical-darkness",
    name: "Magical Darkness",
    description: "An area of supernatural darkness that torches cannot penetrate. Only magical light can dispel it.",
    type: "feature",
    resolution: {
      method: "custom",
      turnCost: 0,
      alertsMonsters: false,
    },
  },
];

// Get a random obstacle weighted by type
export function randomObstacle(preferType?: ObstacleType): ObstacleDefinition {
  let candidates = OBSTACLES;
  
  if (preferType) {
    const filtered = OBSTACLES.filter(o => o.type === preferType);
    if (filtered.length > 0) candidates = filtered;
  }
  
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Get random trap specifically
export function randomTrap(): ObstacleDefinition {
  return randomObstacle("trap");
}

// Get random door obstacle
export function randomDoorObstacle(): ObstacleDefinition {
  return randomObstacle("door");
}

// BECMI Open Doors check (p. 147)
// Roll 1d6, success on 5-6, modified by Strength
// Natural 6 always succeeds
export interface OpenDoorsResult {
  roll: number;
  modifier: number;
  total: number;
  success: boolean;
  natural6: boolean;
}

export function rollOpenDoors(strengthModifier: number = 0): OpenDoorsResult {
  const roll = rollDie(6);
  const total = roll + strengthModifier;
  const natural6 = roll === 6;
  
  // Success on 5-6 (after modifier), or natural 6
  const success = natural6 || total >= 5;
  
  return { roll, modifier: strengthModifier, total, success, natural6 };
}

// BECMI Secret Door check (p. 147)
// Roll 1d6, found on 1 (elves on 1-2)
export interface SecretDoorResult {
  roll: number;
  success: boolean;
  isElf: boolean;
}

export function rollFindSecretDoor(isElf: boolean = false): SecretDoorResult {
  const roll = rollDie(6);
  const success = isElf ? roll <= 2 : roll === 1;
  
  return { roll, success, isElf };
}

// Trap trigger - returns damage if applicable
export interface TrapTriggerResult {
  triggered: boolean;
  savedAgainst: boolean;
  saveType?: string;
  damage: number;
  description: string;
}

export function triggerTrap(
  obstacle: ObstacleDefinition, 
  savingThrow: number, // Character's saving throw value for the appropriate type
  saveRoll?: number // If not provided, we'll roll
): TrapTriggerResult {
  if (obstacle.type !== "trap" || !obstacle.resolution.damage) {
    return { triggered: false, savedAgainst: false, damage: 0, description: "No trap to trigger." };
  }
  
  // Roll save if not provided
  const roll = saveRoll ?? rollDie(20);
  const savedAgainst = roll >= savingThrow;
  
  // Parse damage formula
  let damage = 0;
  if (obstacle.resolution.damage && obstacle.resolution.damage !== "0") {
    const match = obstacle.resolution.damage.match(/(\d+)d(\d+)/);
    if (match) {
      const numDice = parseInt(match[1]);
      const dieSize = parseInt(match[2]);
      for (let i = 0; i < numDice; i++) {
        damage += rollDie(dieSize);
      }
    }
  }
  
  // If saved, usually half damage or avoid entirely depending on trap
  if (savedAgainst) {
    if (obstacle.id.includes("pit") || obstacle.id.includes("block") || obstacle.id.includes("blade")) {
      damage = 0; // Dodged entirely
    } else {
      damage = Math.floor(damage / 2); // Half damage
    }
  }
  
  const description = savedAgainst 
    ? `Saved against ${obstacle.name}! ${damage > 0 ? `Took ${damage} damage.` : 'Avoided all damage.'}`
    : `Failed save vs. ${obstacle.name}! Took ${damage} damage.`;
  
  return {
    triggered: true,
    savedAgainst,
    saveType: obstacle.resolution.saveType,
    damage,
    description,
  };
}
