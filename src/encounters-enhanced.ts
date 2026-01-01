/**
 * ENHANCED ENCOUNTER SYSTEM
 * 
 * Replaces the basic encounter system with one that:
 * - Uses rich prose from the prose engine
 * - Creates memorable, named creatures for significant encounters
 * - Respects time of day, weather, and terrain atmosphere
 * - Generates consequences that ripple through the world
 * - Can escalate ordinary encounters into story hooks
 */

import { Random } from './rng.ts';
import { LogEntry, Terrain, WorldState, Party, Landmark } from './types.ts';
import { encounterFlavorText, atmosphericOpening, getTimeOfDayPhase } from './prose.ts';
import { queueConsequence, analyzeEventForConsequences } from './consequences.ts';
import { WeatherCondition, getWeatherEffects, terrainWeatherDescription, CalendarState } from './calendar.ts';
import { Antagonist, generateAntagonist, AntagonistType } from './antagonists.ts';
import { randomName } from './naming.ts';

// Encounter creature with more personality
interface EncounterCreature {
  name: string; // Generic or proper name
  type: string; // "goblins", "wolves", etc.
  isNamed: boolean; // Memorable encounter?
  numbers: 'lone' | 'few' | 'band' | 'horde';
  descriptor: string; // "ragged", "well-armed", etc.
  behavior: string; // Additional flavor
}

// Enhanced encounter result
interface EnhancedEncounterResult {
  creature: EncounterCreature;
  reaction: 'friendly' | 'cautious' | 'hostile';
  outcome: 'victory' | 'defeat' | 'negotiation' | 'flight';
  summary: string;
  details: string;
  delayMiles?: number;
  fatigueDelta?: number;
  injured?: boolean;
  death?: boolean;
  treasure?: number;
  storyEscalation?: boolean; // Does this become a story thread?
  antagonistSpawned?: Partial<Antagonist>;
}

// Terrain-specific creature tables with more variety
const CREATURES_BY_TERRAIN: Record<Terrain, { creatures: string[]; weights: number[] }> = {
  road: {
    creatures: ['bandits', 'merchants', 'pilgrims', 'patrol guards', 'beggars', 'deserters', 'traveling entertainers', 'tax collectors'],
    weights: [3, 2, 2, 2, 1, 1, 1, 1],
  },
  clear: {
    creatures: ['bandits', 'wolves', 'goblins', 'wild dogs', 'cattle rustlers', 'patrol guards', 'wandering knights', 'peasant militia'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1],
  },
  forest: {
    creatures: ['wolves', 'goblins', 'brigands', 'giant spiders', 'wood elves', 'bears', 'outlaws', 'druids', 'owlbears'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1, 1],
  },
  hills: {
    creatures: ['orc raiders', 'goblins', 'brigands', 'ogres', 'hill giants', 'mountain lions', 'goatherds', 'prospectors'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1],
  },
  mountains: {
    creatures: ['orc raiders', 'giant eagles', 'goblins', 'ogres', 'trolls', 'dwarven patrols', 'yeti', 'wyverns'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1],
  },
  swamp: {
    creatures: ['lizardfolk', 'giant leeches', 'goblins', 'will-o-wisps', 'crocodiles', 'bullywugs', 'hags', 'shambling mounds'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1],
  },
  desert: {
    creatures: ['bandits', 'giant scorpions', 'gnolls', 'nomads', 'giant snakes', 'sand wurms', 'dust devils', 'mummies'],
    weights: [2, 2, 2, 1, 1, 1, 1, 1],
  },
};

// Creature descriptors for flavor
const CREATURE_DESCRIPTORS: Record<string, string[]> = {
  bandits: ['ragged', 'well-armed', 'desperate', 'cocky', 'scarred', 'masked'],
  goblins: ['mangy', 'sneaky', 'cowardly', 'cunning', 'tribal', 'feral'],
  wolves: ['gaunt', 'massive', 'winter-hungry', 'shadowy', 'patient', 'silver-furred'],
  'orc raiders': ['battle-scarred', 'tribal', 'disciplined', 'frenzied', 'mounted', 'war-painted'],
  brigands: ['former soldiers', 'ruthless', 'organized', 'poorly equipped', 'seasoned', 'cruel'],
  ogres: ['dim-witted', 'hungry', 'massive', 'armored', 'solitary', 'kin to giants'],
  'giant spiders': ['web-spinning', 'venomous', 'patient', 'ancient', 'bloated', 'intelligent'],
  lizardfolk: ['scaled warriors', 'primitive', 'territorial', 'shaman-led', 'hunting party', 'traders'],
  default: ['dangerous', 'wary', 'aggressive', 'territorial', 'numerous', 'scarce'],
};

// Behaviors that add story flavor
const CREATURE_BEHAVIORS: Record<string, string[]> = {
  bandits: [
    'demanding toll',
    'setting an ambush',
    'fleeing from the law',
    'recruiting',
    'celebrating a recent score',
  ],
  goblins: [
    'arguing among themselves',
    'tracking something',
    'carrying plunder',
    'setting crude traps',
    'worshipping a crude idol',
  ],
  wolves: [
    'hunting in formation',
    'circling warily',
    'following the scent of blood',
    'protecting young',
    'starving and desperate',
  ],
  'orc raiders': [
    'returning from a raid',
    'scouting for targets',
    'performing war rituals',
    'dragging captives',
    'quarreling over spoils',
  ],
  default: [
    'watching warily',
    'moving with purpose',
    'apparently startled',
    'blocking the path',
    'emerging from concealment',
  ],
};

// Number descriptions
const NUMBERS_DESCRIPTORS: Record<EncounterCreature['numbers'], string[]> = {
  lone: ['a solitary', 'a single', 'one', 'a lone'],
  few: ['a handful of', 'several', 'a few', 'two or three'],
  band: ['a band of', 'a group of', 'many', 'a company of'],
  horde: ['a horde of', 'countless', 'a swarm of', 'an army of'],
};

function weightedPick<T>(rng: Random, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function generateCreature(rng: Random, terrain: Terrain, isNight: boolean): EncounterCreature {
  const table = CREATURES_BY_TERRAIN[terrain] ?? CREATURES_BY_TERRAIN.clear;
  const type = weightedPick(rng, table.creatures, table.weights);

  // Named encounters are rare but memorable
  const isNamed = rng.chance(0.08);

  // Number depends on creature type and luck
  const numbersRoll = rng.next();
  let numbers: EncounterCreature['numbers'];
  if (numbersRoll < 0.2) numbers = 'lone';
  else if (numbersRoll < 0.6) numbers = 'few';
  else if (numbersRoll < 0.9) numbers = 'band';
  else numbers = 'horde';

  // Some creatures are usually alone
  const loners = ['ogres', 'trolls', 'bears', 'yeti', 'hags'];
  if (loners.includes(type) && numbers !== 'horde') {
    numbers = rng.chance(0.7) ? 'lone' : 'few';
  }

  const descriptors = CREATURE_DESCRIPTORS[type] ?? CREATURE_DESCRIPTORS.default;
  const behaviors = CREATURE_BEHAVIORS[type] ?? CREATURE_BEHAVIORS.default;

  let name = type;
  if (isNamed) {
    const properName = randomName(rng);
    const NAMED_FORMATS = [
      `${properName}'s ${type}`,
      `${properName} the ${rng.pick(descriptors)}`,
      `the ${type} called ${properName}`,
    ];
    name = rng.pick(NAMED_FORMATS);
  }

  // Night modifiers
  if (isNight) {
    descriptors.push('shadow-cloaked', 'night-hunting', 'red-eyed in the dark');
  }

  return {
    name,
    type,
    isNamed,
    numbers,
    descriptor: rng.pick(descriptors),
    behavior: rng.pick(behaviors),
  };
}

import { generateProceduralRuin } from './ruins.ts';

// Component pools for procedural exploration beats
const BEAT_STRUCTURES = [
  { name: 'Monolith', types: ['forest', 'hills', 'mountains', 'desert'] },
  { name: 'Obelisk', types: ['swamp', 'desert', 'clear'] },
  { name: 'Statue', types: ['clear', 'hills', 'road'] },
  { name: 'Grove', types: ['forest', 'swamp'] },
  { name: 'Cave', types: ['hills', 'mountains', 'forest'] },
  { name: 'Spring', types: ['forest', 'mountains', 'clear'] },
  { name: 'Altar', types: ['mountains', 'swamp', 'desert'] },
  { name: 'Cairn', types: ['hills', 'mountains', 'road'] },
  { name: 'Ruin', types: ['clear', 'forest', 'swamp', 'desert'] },
  { name: 'Pillar', types: ['desert', 'mountains'] },
  { name: 'Tree', types: ['forest', 'swamp', 'clear'] },
  { name: 'Pool', types: ['swamp', 'forest', 'clear'] },
];

const BEAT_DESCRIPTORS = [
  'obsidian', 'glowing', 'ancient', 'weeping', 'moss-covered', 'cracked', 
  'sun-bleached', 'overgrown', 'floating', 'shadowy', 'silver', 'eerie',
  'blood-stained', 'weather-worn', 'perfectly smooth', 'crystalline', 'petrified'
];

const BEAT_ACTIVITIES = [
  'pulsing with a faint, rhythmic light',
  'whispering in an unknown, melodic tongue',
  'dripping with a thick, dark sap',
  'swarming with spectral, blue butterflies',
  'humming a low, vibrating note',
  'surrounded by a thin, unnerving mist',
  'etched with shifting, golden runes',
  'home to a silent, white-haired hermit',
  'bearing the marks of a thousand years',
  'smelling of summer rain and ozone',
  'vibrating when approached',
  'swallowing all sound around it'
];

const BEAT_EFFECTS = [
  { name: 'arcane-insight', text: 'The party feels a surge of mental clarity.', fatigue: -1 },
  { name: 'historical-knowledge', text: 'They uncover a fragment of lost history.', rumorKind: 'mystery' },
  { name: 'prophetic-hint', text: 'A sudden vision of what is to come flashes before them.', rumorKind: 'omen' },
  { name: 'fey-blessing', text: 'A light heart and swift feet follow them.', fatigue: -2 },
  { name: 'treasure-clue', text: 'They find a marking pointing toward a hidden cache.', rumorKind: 'dungeon' },
];

function generateProceduralBeat(rng: Random, terrain: Terrain, party: Party, worldTime: Date, world: WorldState): Landmark {
  const structurePool = BEAT_STRUCTURES.filter(s => s.types.includes(terrain));
  const structure = (structurePool.length > 0 ? rng.pick(structurePool) : BEAT_STRUCTURES[0]).name;
  const descriptor = rng.pick(BEAT_DESCRIPTORS);
  const activity = rng.pick(BEAT_ACTIVITIES);
  const effect = rng.pick(BEAT_EFFECTS);

  const beatName = `The ${capitalize(descriptor)} ${structure}`;
  
  // Find current hex location
  const settlement = world.settlements.find(s => s.name === party.location);
  const location = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };

  return {
    id: `landmark-${Date.now()}-${rng.int(1000)}`,
    name: beatName,
    description: `A ${descriptor} ${structure.toLowerCase()}, ${activity}.`,
    location: location,
    terrain: terrain,
    discoveryDate: worldTime,
    discoveredBy: party.name,
    effect: effect.name,
    knownBy: [party.name],
  };
}

// Main encounter check and resolution
export function enhancedEncounter(
  rng: Random,
  terrain: Terrain,
  worldTime: Date,
  location: string,
  party: Party,
  world: WorldState,
  calendar?: CalendarState,
): (LogEntry & { delayMiles?: number; fatigueDelta?: number; injured?: boolean; death?: boolean }) | undefined {
  const hour = worldTime.getUTCHours();
  const isNight = hour < 6 || hour >= 18;
  const phase = getTimeOfDayPhase(hour);

  // Base encounter odds by terrain
  const BASE_ODDS: Record<Terrain, number> = {
    road: 1 / 12,
    clear: 1 / 8,
    forest: 1 / 6,
    hills: 1 / 6,
    mountains: 1 / 5,
    swamp: 1 / 5,
    desert: 1 / 6,
  };

  let odds = BASE_ODDS[terrain] ?? 1 / 8;

  // Night increases danger (except on roads with patrols)
  if (isNight && terrain !== 'road') {
    odds *= 1.5;
  }

  // Weather modifiers
  if (calendar) {
    const effects = getWeatherEffects(calendar.weather);
    odds *= effects.encounterChanceMod;
  }

  // Full moon increases supernatural encounters
  if (calendar?.moonPhase === 'full') {
    odds *= 1.2;
  }

  if (!rng.chance(odds)) {
    // Small chance for a unique non-combat discovery if no combat encounter
    if (rng.chance(0.05)) {
      // 1. Check for Ruins discovery (more significant)
      if (rng.chance(0.2)) {
        const settlement = world.settlements.find(s => s.name === party.location);
        const coord = settlement ? settlement.coord : { q: rng.int(world.width), r: rng.int(world.height) };
        
        // Is there an existing unknown ruin?
        let ruin = world.ruins?.find(r => r.location.q === coord.q && r.location.r === coord.r);
        
        if (!ruin) {
          ruin = generateProceduralRuin(rng, coord, terrain, world);
          if (!world.ruins) world.ruins = [];
          world.ruins.push(ruin);
        }

        return {
          category: 'dungeon',
          summary: `${party.name} discovers ${ruin.name}`,
          details: `${atmosphericOpening(rng, worldTime, terrain)} They have found ${ruin.description} ${ruin.history}`,
          location,
          actors: [party.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        };
      }

      // 2. Check for existing landmarks...

      // Generate a brand new persistent landmark
      const landmark = generateProceduralBeat(rng, terrain, party, worldTime, world);
      world.landmarks.push(landmark);
      
      const effect = BEAT_EFFECTS.find(e => e.name === landmark.effect);
      
      // If the beat provides a rumor, queue it
      if (effect?.rumorKind && world) {
        queueConsequence({
          type: 'spawn-rumor',
          triggerEvent: `Discovery of ${landmark.name}`,
          turnsUntilResolution: 12 + rng.int(24),
          data: {
            origin: location,
            target: location,
            kind: effect.rumorKind,
            text: `Explorers speak of a strange discovery near ${location}.`,
          },
          priority: 3,
        });
      }

      return {
        category: 'road',
        summary: `${party.name} discovers ${landmark.name}`,
        details: `${atmosphericOpening(rng, worldTime, terrain)} ${landmark.description} ${effect?.text ?? ''}`,
        location,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
        fatigueDelta: effect?.fatigue ?? 0,
      };
    }
    return undefined;
  }

  // Generate the encounter
  const creature = generateCreature(rng, terrain, isNight);

  // Reaction roll (2d6 style)
  const reactionRoll = 2 + rng.int(6) + rng.int(6);
  let reaction: 'friendly' | 'cautious' | 'hostile';
  if (reactionRoll >= 10) reaction = 'friendly';
  else if (reactionRoll >= 6) reaction = 'cautious';
  else reaction = 'hostile';

  // Party fame might affect reaction
  if ((party.fame ?? 0) >= 5 && reaction === 'cautious') {
    reaction = rng.chance(0.3) ? 'friendly' : 'cautious';
  }

  // Some creatures are always hostile
  const alwaysHostile = ['giant spiders', 'giant leeches', 'giant scorpions', 'trolls', 'mummies', 'shambling mounds'];
  if (alwaysHostile.includes(creature.type)) {
    reaction = 'hostile';
  }

  // Resolve the encounter
  let outcome: 'victory' | 'defeat' | 'negotiation' | 'flight';
  let injured = false;
  let death = false;
  let delayMiles = 0;
  let fatigueDelta = 0;
  let treasure = 0;
  let storyEscalation = false;

  // Class-based capabilities
  const hasArcane = party.members.some(m => m.class === 'Magic-User' || m.class === 'Elf');
  const hasDivine = party.members.some(m => m.class === 'Cleric');
  const hasThief = party.members.some(m => m.class === 'Thief' || m.class === 'Halfling');

  if (reaction === 'friendly') {
    outcome = 'negotiation';
    // Friendly encounters might share information
    if (rng.chance(0.3)) {
      storyEscalation = true; // They share a rumor or warning
    }
  } else if (reaction === 'cautious') {
    if (rng.chance(0.5)) {
      outcome = 'negotiation';
      delayMiles = rng.chance(0.3) ? 2 + rng.int(4) : 0;
    } else {
      outcome = 'flight';
      delayMiles = 3 + rng.int(3);
      fatigueDelta = rng.chance(0.3) ? 1 : 0;
    }
  } else {
    // Hostile - combat
    const combatRoll = rng.next();
    
    // Party strength factors
    let partyStrength = 0.6;
    partyStrength += (party.fame ?? 0) * 0.02; // Fame/experience bonus
    
    if (hasArcane) partyStrength += 0.1; // Magic-Users/Elves provide powerful support
    if (hasDivine) partyStrength += 0.05; // Clerics provide healing/buffs
    if (hasThief) partyStrength += 0.05; // Thieves/Halflings provide tactical advantages
    
    // Level-based bonuses
    const averageLevel = party.members.reduce((sum, m) => sum + m.level, 0) / party.members.length;
    partyStrength += (averageLevel - 1) * 0.05;

    if (combatRoll < partyStrength) {
      outcome = 'victory';
      injured = rng.chance(0.2);
      treasure = rng.chance(0.4) ? 10 + rng.int(50) : 0;
      fatigueDelta = rng.chance(0.3) ? 1 : 0;
      
      // Award XP for victory
      party.xp += 100 + rng.int(500);

      // Named or large encounters become story hooks
      if (creature.isNamed || creature.numbers === 'horde') {
        storyEscalation = true;
      }
    } else if (combatRoll < partyStrength + 0.25) {
      outcome = 'defeat';
      injured = true;
      delayMiles = 6 + rng.int(6);
      fatigueDelta = 1 + rng.int(2);
      death = rng.chance(0.15);
      storyEscalation = true; // Defeats often spawn revenge arcs
    } else {
      outcome = 'flight';
      delayMiles = 4 + rng.int(4);
      fatigueDelta = 1;
      injured = rng.chance(0.25);
    }
  }

  // Generate prose
  const flavorText = encounterFlavorText(rng, creature.name, reaction, outcome, terrain, [party.name]);

  // Build the full narrative
  const atmosOpening = atmosphericOpening(rng, worldTime, terrain, reaction === 'hostile' ? 'tense' : undefined);
  const weatherDetail = calendar ? terrainWeatherDescription(terrain, calendar.weather, rng) : '';
  const numberDesc = rng.pick(NUMBERS_DESCRIPTORS[creature.numbers]);

  let fullDetails = `${atmosOpening} `;
  if (weatherDetail && rng.chance(0.4)) {
    fullDetails += `${weatherDetail} `;
  }
  fullDetails += `${capitalize(numberDesc)} ${creature.descriptor} ${creature.type}, ${creature.behavior}. `;
  fullDetails += flavorText.details;

  // Add spellcasting flavor to victory
  if (outcome === 'victory') {
    if (hasArcane && rng.chance(0.4)) {
      fullDetails += ` A well-timed spell from their caster turned the tide.`;
    } else if (hasDivine && rng.chance(0.4)) {
      fullDetails += ` Divine favor shielded them from the worst of the blows.`;
    }
  }

  // Treasure mention
  if (treasure > 0) {
    fullDetails += ` The victors claim ${treasure} coin worth of plunder.`;
  }

  // Create the log entry
  const entry: LogEntry & { delayMiles?: number; fatigueDelta?: number; injured?: boolean; death?: boolean } = {
    category: 'road',
    summary: flavorText.summary,
    details: fullDetails,
    location,
    actors: [party.name, creature.name],
    worldTime,
    realTime: new Date(),
    seed: world.seed,
    delayMiles,
    fatigueDelta,
    injured,
    death,
  };

  // Analyze for consequences
  analyzeEventForConsequences(entry, world, rng);

  // Story escalation - might spawn antagonist or quest
  if (storyEscalation && creature.isNamed && outcome !== 'victory') {
    // Surviving named foe becomes recurring antagonist
    queueConsequence({
      type: 'spawn-antagonist',
      triggerEvent: entry.summary,
      turnsUntilResolution: 24 + rng.int(72), // 1-3 days later
      data: {
        location: location,
        threat: `${creature.name} gathers strength and swears revenge`,
        origin: `defeat at the hands of ${party.name}`,
      },
      priority: 3,
    });
  }

  return entry;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Sign/track encounters - hints of danger without actual combat
export function encounterSign(
  rng: Random,
  terrain: Terrain,
  worldTime: Date,
  location: string,
  partyName: string,
  seed: string,
): LogEntry | undefined {
  if (!rng.chance(0.15)) return undefined;

  const SIGNS: Record<Terrain, string[]> = {
    road: [
      'Fresh hoofprints diverge from the road, as if riders left in haste.',
      'A broken wagon wheel lies by the verge. No sign of the wagon.',
      'Crows gather ahead. They scatter at your approach.',
      'A weathered signpost has been defaced with crude warnings.',
    ],
    clear: [
      'Trampled grass marks the passage of many feet.',
      'Smoke rises from beyond the next hill.',
      'Livestock have fled into the open, masterless and panicked.',
      'A campfire, still warm, but hastily abandoned.',
    ],
    forest: [
      'Claw marks on the trees, head-height or higher.',
      'Webs span the path ahead, freshly spun.',
      'A hunter\'s blind, recently occupied. Arrow nocks in the bark.',
      'The birds have gone silent. Something is wrong.',
    ],
    hills: [
      'Caves in the hillside show signs of habitation.',
      'Bones litter a rock shelf. Not all are animal bones.',
      'Crude totems mark a boundary. You have been warned.',
      'Rockfall has blocked the easy path. An ambush site, perhaps.',
    ],
    mountains: [
      'Giant footprints in the snow, each as long as a man is tall.',
      'The ruins of a dwarven waystation, recently looted.',
      'Eagle cries echo, but no birds are visible.',
      'A cairn of skulls marks a territorial boundary.',
    ],
    swamp: [
      'Ripples in the water. Something large is moving.',
      'A boat, half-sunken. Its passengers are nowhere to be seen.',
      'Strange lights dance over the water. Will-o-wisps?',
      'Fetish dolls hang from the dead trees. Warnings or invitations?',
    ],
    desert: [
      'Bleached bones half-buried in the sand.',
      'An oasis—but no birds sing there, and the water is too still.',
      'Tracks in the sand, leading toward you. Many feet. Clawed.',
      'A buried structure protrudes from a dune. Something ancient stirs.',
    ],
  };

  const signs = SIGNS[terrain] ?? SIGNS.clear;
  const sign = rng.pick(signs);

  return {
    category: 'road',
    summary: `${partyName} spot signs of danger`,
    details: sign,
    location,
    actors: [partyName],
    worldTime,
    realTime: new Date(),
    seed,
  };
}

