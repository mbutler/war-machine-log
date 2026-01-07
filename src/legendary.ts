/**
 * LEGENDARY SPIKES SYSTEM
 * 
 * Injects rare, unique, memorable elements into the world:
 * - Legendary weapons with names and histories
 * - Mythic armor and relics
 * - Unique monsters (one-of-a-kind terrors)
 * - Prophecies and omens
 * - Ancient curses and blessings
 * - Lost treasures and hidden vaults
 * - Celestial events and portents
 * 
 * These "spikes" are rare (1-5% chance per day) but create
 * major story hooks and memorable moments.
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Party, NPC, Settlement, WorldEvent } from './types.ts';
import { Antagonist } from './antagonists.ts';
import { StoryThread } from './stories.ts';
import { queueConsequence } from './consequences.ts';
import { randomName } from './naming.ts';
import { processWorldEvent } from './causality.ts';

// ============================================================================
// LEGENDARY WEAPONS
// ============================================================================

export interface LegendaryWeapon {
  id: string;
  name: string;
  epithet: string;       // "the Orc-Cleaver", "Bane of Dragons"
  type: WeaponType;
  material: string;      // "star-metal", "dragon-bone", "shadow-forged"
  power: number;         // 1-10
  curse?: string;        // Optional curse
  history: string;       // Brief legend
  location?: string;     // Where it currently is
  owner?: string;        // Who has it (party/NPC/antagonist)
  discovered: boolean;
  sightings: number;     // How many times rumored
}

type WeaponType = 'sword' | 'axe' | 'spear' | 'bow' | 'mace' | 'dagger' | 'staff' | 'hammer';

const WEAPON_NAMES: Record<WeaponType, string[]> = {
  sword: ['Dawnbringer', 'Nightfall', 'Oathkeeper', 'Widowmaker', 'Soulreaver', 'Frostbite', 'Hellfire', 'Starfall', 'Griefbringer', 'Peacemaker'],
  axe: ['Skullsplitter', 'Worldbreaker', 'Headswoman', 'Thunderclap', 'Blooddrinker', 'Giantsbane', 'Treefeller', 'Bonecruncher'],
  spear: ['Godspear', 'Serpent-Tongue', 'Skypierce', 'Heartseeker', 'Stormcaller', 'Orc-Prod', 'Dragonlance', 'Soulspear'],
  bow: ['Whisperwind', 'Deadeye', 'Starshot', 'Nighthawk', 'Doomstring', 'Farseeker', 'Moonbow', 'Sunfire'],
  mace: ['Doomhammer', 'Bonecrusher', 'Judgement', 'Penitence', 'Stonebreaker', 'Lawbringer', 'Mercy', 'Wrath'],
  dagger: ['Whisper', 'Backstab', 'Heartsting', 'Shadowfang', 'Venom', 'Silencer', 'Kingslayer', 'Nightblade'],
  staff: ['Worldtree', 'Stormcaller', 'Lifegiver', 'Deathshead', 'Starfire', 'Moonbeam', 'Sunray', 'Shadowstaff'],
  hammer: ['Earthshaker', 'Thunderstrike', 'Godsforge', 'Titanhammer', 'Giantmaker', 'Worldforger', 'Doomfall', 'Mountainbreaker'],
};

const WEAPON_EPITHETS = [
  'the Orc-Cleaver', 'Bane of Dragons', 'the Kingmaker', 'Doom of the Undead',
  'the Godslayer', 'Hope of the Faithful', 'Terror of the North', 'the Liberator',
  'Scourge of Demons', 'the Peacekeeper', 'Destroyer of Armies', 'the Last Word',
  'Friend of Heroes', 'the Betrayer', 'Light in Darkness', 'the Final Mercy',
];

const WEAPON_MATERIALS = [
  'star-metal', 'dragon-bone', 'shadow-forged', 'sky-iron', 'mithril', 
  'adamantine', 'crystal', 'obsidian', 'blessed silver', 'demon-steel',
  'phoenix-feather', 'elf-wrought', 'dwarf-forged', 'giant-bone', 'god-touched',
];

const WEAPON_HISTORIES = [
  'Forged in the First Age by the Smith-God himself.',
  'Carried by the Last King into the Battle of Broken Crowns.',
  'Pulled from the heart of a dying star by heroes of legend.',
  'Cursed by a dying witch-queen, blessed by a saint.',
  'Lost for a thousand years beneath the Sunken Temple.',
  'Won from a dragon\'s hoard by trickery and courage.',
  'The only weapon ever to wound the Immortal Tyrant.',
  'Passed down through twelve generations of heroes, each dying gloriously.',
  'Forged from the chains that bound an ancient god.',
  'Created to slay a specific demon; that demon still lives.',
];

const WEAPON_CURSES = [
  'Cannot be sheathed once drawn until it tastes blood.',
  'Whispers the names of all it has slain.',
  'Burns the unworthy who dare wield it.',
  'Brings doom to all who love its bearer.',
  'Thirsts for the blood of innocents.',
  'Will one day betray its wielder at the worst moment.',
  'Slowly corrupts the soul of its bearer.',
  'Attracts the attention of dark powers.',
];

// ============================================================================
// LEGENDARY ARMOR
// ============================================================================

export interface LegendaryArmor {
  id: string;
  name: string;
  epithet: string;
  type: ArmorType;
  material: string;
  power: number;
  curse?: string;
  history: string;
  location?: string;
  owner?: string;
  discovered: boolean;
}

type ArmorType = 'plate' | 'mail' | 'leather' | 'shield' | 'helm' | 'cloak' | 'ring' | 'amulet';

const ARMOR_NAMES: Record<ArmorType, string[]> = {
  plate: ['Invictus', 'Fortress', 'Dragonscale', 'Sunplate', 'Shadowmail', 'Godskin', 'Titanplate'],
  mail: ['Whispermail', 'Starweave', 'Dragonlinks', 'Moonsilver', 'Shadowchain', 'Blessedlinks'],
  leather: ['Nightskin', 'Shadowhide', 'Dragonleather', 'Ghostwalk', 'Silentfoot', 'Windhide'],
  shield: ['Aegis', 'Bulwark', 'Defender', 'Rampart', 'Bastion', 'Protector', 'Sunshield'],
  helm: ['Crown of Kings', 'Dragonhelm', 'Warmaster', 'Ironbrow', 'Deathshead', 'Sunhelm'],
  cloak: ['Shadowmantle', 'Starcloak', 'Invisibility', 'Flameward', 'Nightwing', 'Windwalker'],
  ring: ['Soulkeeper', 'Lifebinder', 'Powerstone', 'Wishring', 'Deathward', 'Truthseer'],
  amulet: ['Heartstone', 'Lifeward', 'Soulguard', 'Demonbane', 'Dragonheart', 'Starblessed'],
};

const ARMOR_EPITHETS = [
  'the Unbreakable', 'Warden of Heroes', 'the Deathless', 'Shield of Nations',
  'the Unbowed', 'Last Defense', 'the Inviolate', 'Savior of Armies',
];

// ============================================================================
// UNIQUE MONSTERS
// ============================================================================

export interface UniqueMonster {
  id: string;
  name: string;
  epithet: string;
  species: string;         // Base creature type
  description: string;     // What makes it unique
  threat: number;          // 1-10 (most are 8-10)
  territory: string;
  weakness?: string;       // How to defeat it
  treasure?: string;       // What it guards
  history: string;
  alive: boolean;
  sightings: number;
  lastSeen?: Date;
}

const UNIQUE_MONSTER_TEMPLATES = [
  {
    species: 'dragon',
    names: ['Vermithrax', 'Smaug-spawn', 'Ancalagon the Lesser', 'Glaurung-kin', 'Fafnir-blood'],
    epithets: ['the Desolator', 'Bane of Kingdoms', 'the Eternal', 'Father of Ash', 'the Unconquered'],
    descriptions: [
      'Scales like black iron, eyes like dying suns.',
      'So ancient even other dragons fear to speak its name.',
      'Three heads, each with its own cruel cunning.',
      'Wingspan blots out the sun for a mile.',
    ],
  },
  {
    species: 'giant',
    names: ['Ymir-spawn', 'Gogmagog', 'Typhon', 'Atlas-kin', 'Kronos-blood'],
    epithets: ['the Mountain-Walker', 'World-Shaker', 'the Undying', 'Breaker of Cities'],
    descriptions: [
      'Taller than castle walls, older than kingdoms.',
      'Stone for flesh, magma for blood.',
      'Last of a race of world-builders.',
      'Carries a club that was once a great oak.',
    ],
  },
  {
    species: 'demon',
    names: ['Azmodeth', 'Bael-spawn', 'Mephistar', 'Abraxon', 'Demonlord'],
    epithets: ['the Corruptor', 'Prince of Lies', 'the Bargainer', 'Soultrader'],
    descriptions: [
      'Beauty and horror wed in impossible form.',
      'Speaks every language ever uttered.',
      'Bound here by ancient pact, seeking freedom.',
      'Collects souls like others collect coins.',
    ],
  },
  {
    species: 'undead',
    names: ['the Nameless King', 'Dust-Lord', 'He-Who-Was', 'the Unremembered', 'Bone-Emperor'],
    epithets: ['the Deathless', 'Lord of Ashes', 'the Eternal Hunger', 'King of Graves'],
    descriptions: [
      'Once a great king, now animated by vengeance alone.',
      'Commands legions of the restless dead.',
      'Death itself fears to claim this one.',
      'Seeks the living to remember its forgotten name.',
    ],
  },
  {
    species: 'beast',
    names: ['the Nemean', 'Fenrir-spawn', 'Cerberus-kin', 'Chimera Prime', 'Behemoth'],
    epithets: ['the Untameable', 'Eater of Heroes', 'the Unstoppable', 'Apex Predator'],
    descriptions: [
      'Hide that turns aside any blade.',
      'Hunts for sport, not hunger.',
      'Three times the size of any natural beast.',
      'Intelligence gleams in ancient eyes.',
    ],
  },
  {
    species: 'aberration',
    names: ['the Thing Below', 'Star-Spawn', 'the Unnameable', 'That Which Waits', 'the Dreamer'],
    epithets: ['from Beyond the Stars', 'the Incomprehensible', 'Madness-Bringer', 'Reality-Render'],
    descriptions: [
      'Geometry that hurts to perceive.',
      'Existed before the gods were born.',
      'To look upon it is to forget sanity.',
      'Communicates in nightmares.',
    ],
  },
];

// ============================================================================
// PROPHECIES & OMENS
// ============================================================================

export interface Prophecy {
  id: string;
  text: string;
  interpretation: string;
  subjects: string[];      // Who/what it's about
  deadline?: Date;         // When it must be fulfilled
  fulfilled: boolean;
  announced: boolean;
}

const PROPHECY_TEMPLATES = [
  {
    template: 'When %ACTOR% stands at the crossroads of %LOCATION%, the world shall tremble.',
    interpretation: 'A great decision awaits.',
  },
  {
    template: 'Three signs herald the doom: %SIGN1%, %SIGN2%, and %SIGN3%. Then %ACTOR% shall rise.',
    interpretation: 'Watch for the portents.',
  },
  {
    template: '%WEAPON% shall be found again, and in the hands of %ACTOR%, kingdoms fall.',
    interpretation: 'A legendary weapon seeks a wielder.',
  },
  {
    template: 'The blood of %ACTOR% shall water the fields of %LOCATION%, and from that sacrifice, hope blooms.',
    interpretation: 'A hero must fall for others to rise.',
  },
  {
    template: 'When %MONSTER% wakes from its long slumber, only %ACTOR% can stand against it.',
    interpretation: 'An ancient evil stirs.',
  },
  {
    template: 'The stars align once in a thousand years. At that hour, %LOCATION% shall burn or be reborn.',
    interpretation: 'Celestial forces at work.',
  },
  {
    template: '%ACTOR% shall betray %ACTOR2%, and in that betrayal, find either damnation or redemption.',
    interpretation: 'Trust will be tested.',
  },
  {
    template: 'The child of %LOCATION% shall wear the crown of thorns, and weep for what they must become.',
    interpretation: 'A reluctant hero emerges.',
  },
];

const OMEN_SIGNS = [
  'a comet streaks across the sky',
  'the moon bleeds red',
  'birds fall dead from the sky',
  'fish swim upstream',
  'wolves howl at midday',
  'flowers bloom in winter',
  'snow falls in summer',
  'the dead walk briefly',
  'children speak in tongues',
  'statues weep blood',
  'wells run dry',
  'crops grow overnight',
  'animals speak prophecy',
  'the sun rises in the west',
  'shadows move against the light',
];

// ============================================================================
// LOST TREASURES & HIDDEN VAULTS
// ============================================================================

export interface LostTreasure {
  id: string;
  name: string;
  type: 'vault' | 'hoard' | 'tomb' | 'shrine' | 'library' | 'armory';
  description: string;
  location: string;        // General area
  exactLocation?: string;  // Specific place (once discovered)
  contents: string[];      // What's inside
  guardian?: string;       // What protects it
  discovered: boolean;
  looted: boolean;
  clues: string[];         // Hints about its location
}

const TREASURE_TEMPLATES = [
  {
    type: 'vault' as const,
    names: ['The Vault of Kings', 'The Emperor\'s Treasury', 'The Dragon\'s Hoard', 'The Forgotten Cache'],
    descriptions: [
      'Sealed for a thousand years, waiting for a worthy finder.',
      'The combined wealth of a dozen conquered kingdoms.',
      'Said to bankrupt empires with its contents.',
    ],
  },
  {
    type: 'tomb' as const,
    names: ['The Tomb of the Nameless Pharaoh', 'The Barrow of Heroes', 'The Crypt of the Last King'],
    descriptions: [
      'Buried with treasures to shame the living.',
      'The dead king clutches his crown still.',
      'Grave goods worth more than cities.',
    ],
  },
  {
    type: 'library' as const,
    names: ['The Library of Shadows', 'The Arcane Archives', 'The Forbidden Collection'],
    descriptions: [
      'Knowledge that could remake the world.',
      'Spells lost since the Age of Wonders.',
      'The collected wisdom of a dead civilization.',
    ],
  },
  {
    type: 'armory' as const,
    names: ['The Armory of the Gods', 'The Arsenal of Heroes', 'The Weapon-Vault of Legend'],
    descriptions: [
      'Weapons forged for wars that ended the world.',
      'Every blade has slain a king.',
      'Armor worn by demigods.',
    ],
  },
];

// ============================================================================
// SPIKE GENERATION FUNCTIONS
// ============================================================================

export function generateLegendaryWeapon(rng: Random, world: WorldState): LegendaryWeapon {
  const type = rng.pick(['sword', 'axe', 'spear', 'bow', 'mace', 'dagger', 'staff', 'hammer'] as WeaponType[]);
  const name = rng.pick(WEAPON_NAMES[type]);
  
  return {
    id: rng.uid('weapon'),
    name,
    epithet: rng.pick(WEAPON_EPITHETS),
    type,
    material: rng.pick(WEAPON_MATERIALS),
    power: 7 + rng.int(4), // 7-10
    curse: rng.chance(0.3) ? rng.pick(WEAPON_CURSES) : undefined,
    history: rng.pick(WEAPON_HISTORIES),
    discovered: false,
    sightings: 0,
  };
}

export function generateUniqueMonster(rng: Random, world: WorldState): UniqueMonster {
  const template = rng.pick(UNIQUE_MONSTER_TEMPLATES);
  const territory = rng.pick(world.settlements).name;
  
  return {
    id: rng.uid('monster'),
    name: rng.pick(template.names),
    epithet: rng.pick(template.epithets),
    species: template.species,
    description: rng.pick(template.descriptions),
    threat: 8 + rng.int(3), // 8-10
    territory,
    weakness: rng.chance(0.5) ? rng.pick([
      'Only vulnerable to silver.',
      'Cannot cross running water.',
      'Blinded by sunlight.',
      'Must be killed by the same weapon thrice.',
      'A specific ancient song weakens it.',
      'Only a sacrifice of love can end it.',
    ]) : undefined,
    treasure: rng.chance(0.7) ? rng.pick([
      'guards a legendary weapon',
      'hoards the wealth of a fallen kingdom',
      'protects ancient knowledge',
      'sleeps upon a dragon\'s hoard',
    ]) : undefined,
    history: `Legends speak of ${template.names[0]} for as long as there have been storytellers.`,
    alive: true,
    sightings: 0,
  };
}

export function generateProphecy(rng: Random, world: WorldState, actors: string[]): Prophecy {
  const template = rng.pick(PROPHECY_TEMPLATES);
  const actor1 = actors.length > 0 ? rng.pick(actors) : randomName(rng);
  const actor2 = actors.length > 1 ? rng.pick(actors.filter(a => a !== actor1)) : randomName(rng);
  const location = rng.pick(world.settlements).name;
  
  let text = template.template
    .replace('%ACTOR%', actor1)
    .replace('%ACTOR2%', actor2)
    .replace('%LOCATION%', location)
    .replace('%WEAPON%', rng.pick(WEAPON_NAMES.sword))
    .replace('%MONSTER%', rng.pick(UNIQUE_MONSTER_TEMPLATES).names[0])
    .replace('%SIGN1%', rng.pick(OMEN_SIGNS))
    .replace('%SIGN2%', rng.pick(OMEN_SIGNS))
    .replace('%SIGN3%', rng.pick(OMEN_SIGNS));
  
  return {
    id: rng.uid('prophecy'),
    text,
    interpretation: template.interpretation,
    subjects: [actor1, actor2].filter(Boolean),
    fulfilled: false,
    announced: false,
  };
}

export function generateLostTreasure(rng: Random, world: WorldState): LostTreasure {
  const template = rng.pick(TREASURE_TEMPLATES);
  const location = rng.pick(world.settlements).name;
  
  return {
    id: rng.uid('treasure'),
    name: rng.pick(template.names),
    type: template.type,
    description: rng.pick(template.descriptions),
    location,
    contents: [
      rng.pick(['gold beyond counting', 'jewels by the bushel', 'ancient coins', 'silver ingots']),
      rng.pick(['a legendary weapon', 'priceless artifacts', 'magical items', 'relics of power']),
      rng.pick(['forbidden knowledge', 'lost spells', 'ancient maps', 'historical records']),
    ],
    guardian: rng.chance(0.7) ? rng.pick([
      'an ancient golem',
      'the restless dead',
      'a bound demon',
      'deadly traps',
      'a dragon',
      'a curse that kills intruders',
    ]) : undefined,
    discovered: false,
    looted: false,
    clues: [
      `An old map mentions ruins near ${location}.`,
      `A dying explorer spoke of treasures beyond imagining.`,
      `Ancient texts reference the ${template.names[0]}.`,
    ],
  };
}

// ============================================================================
// SPIKE INJECTION - Called periodically to add legendary elements
// ============================================================================

export function maybeLegendarySpike(
  rng: Random,
  world: WorldState,
  worldTime: Date,
  legendaryState: LegendaryState,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Rare spikes: 5-15% chance per day for each type (tunable)
  // These are the memorable moments players will talk about
  
  // LEGENDARY WEAPON RUMOR
  if (rng.chance(0.08)) {
    const weapon = legendaryState.weapons.find(w => !w.discovered) ?? generateLegendaryWeapon(rng, world);
    if (!legendaryState.weapons.includes(weapon)) {
      legendaryState.weapons.push(weapon);
    }
    
    weapon.sightings++;
    const settlement = rng.pick(world.settlements);
    
    logs.push({
      category: 'town',
      summary: `Whispers of ${weapon.name} ${weapon.epithet}`,
      details: `A traveler speaks of a legendary ${weapon.type} of ${weapon.material}. ${weapon.history} ${weapon.curse ? `But beware: ${weapon.curse}` : ''}`,
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
    // Queue story spawn
    // Real-time: ~2-3 days for rumors to settle (288-432 turns)
    queueConsequence({
      type: 'spawn-rumor',
      triggerEvent: `Legendary weapon: ${weapon.name}`,
      turnsUntilResolution: 288 + rng.int(144),
      data: {
        origin: settlement.name,
        target: settlement.name,
        kind: 'mystery',
        text: `Treasure-seekers speak of ${weapon.name}. Some say it lies in a forgotten ruin. Others claim a monster guards it.`,
      },
      priority: 5,
    });
  }
  
  // UNIQUE MONSTER SIGHTING
  if (rng.chance(0.06)) {
    const monster = legendaryState.monsters.find(m => m.alive && m.sightings < 5) ?? generateUniqueMonster(rng, world);
    if (!legendaryState.monsters.includes(monster)) {
      legendaryState.monsters.push(monster);
    }
    
    monster.sightings++;
    monster.lastSeen = worldTime;
    
    logs.push({
      category: 'road',
      summary: `${monster.name} ${monster.epithet} spotted near ${monster.territory}`,
      details: `${monster.description} Travelers flee in terror. ${monster.weakness ? `Ancient lore suggests: ${monster.weakness}` : 'None know how to defeat such a creature.'}`,
      location: monster.territory,
      actors: [monster.name],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
    // Affect settlement mood
    const settlement = world.settlements.find(s => s.name === monster.territory);
    if (settlement) {
      settlement.mood = Math.max(-5, settlement.mood - 2);
    }
  }
  
  // PROPHECY SPOKEN
  if (rng.chance(0.05)) {
    const actors = [
      ...world.parties.map(p => p.name),
      ...world.npcs.filter(n => n.alive !== false && (n.fame ?? 0) >= 2).map(n => n.name),
    ];
    
    if (actors.length > 0) {
      const prophecy = generateProphecy(rng, world, actors);
      legendaryState.prophecies.push(prophecy);
      prophecy.announced = true;
      
      const prophet = rng.pick(['an old hermit', 'a dying oracle', 'a child in a trance', 'flames in a temple brazier', 'a voice from the sky']);
      const settlement = rng.pick(world.settlements);
      
      logs.push({
        category: 'town',
        summary: `A prophecy is spoken in ${settlement.name}`,
        details: `${prophet.charAt(0).toUpperCase() + prophet.slice(1)} declares: "${prophecy.text}" ${prophecy.interpretation}`,
        location: settlement.name,
        actors: prophecy.subjects,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // LOST TREASURE CLUE
  if (rng.chance(0.08)) {
    const treasure = legendaryState.treasures.find(t => !t.discovered) ?? generateLostTreasure(rng, world);
    if (!legendaryState.treasures.includes(treasure)) {
      legendaryState.treasures.push(treasure);
    }
    
    const settlement = rng.pick(world.settlements);
    const clue = rng.pick(treasure.clues);
    
    logs.push({
      category: 'town',
      summary: `Tales of ${treasure.name} surface in ${settlement.name}`,
      details: `${treasure.description} ${clue} ${treasure.guardian ? `Legends warn that ${treasure.guardian} protects it.` : ''}`,
      location: settlement.name,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
  }
  
  // CELESTIAL OMEN
  if (rng.chance(0.04)) {
    const omen = rng.pick(OMEN_SIGNS);
    const interpretation = rng.pick([
      'The priests are divided on what this means.',
      'The old tales speak of such signs before great change.',
      'Some weep with joy; others weep with terror.',
      'The wise prepare for what comes next.',
    ]);
    
    logs.push({
      category: 'weather',
      summary: `A great omen: ${omen}`,
      details: `Across the land, ${omen}. ${interpretation}`,
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
    // Affect all settlements
    for (const settlement of world.settlements) {
      settlement.mood += rng.chance(0.5) ? 1 : -1;
      settlement.mood = Math.max(-5, Math.min(5, settlement.mood));
    }
  }
  
  return logs;
}

// ============================================================================
// LEGENDARY STATE - Persisted with world
// ============================================================================

export interface LegendaryState {
  weapons: LegendaryWeapon[];
  armor: LegendaryArmor[];
  monsters: UniqueMonster[];
  prophecies: Prophecy[];
  treasures: LostTreasure[];
}

export function createLegendaryState(): LegendaryState {
  return {
    weapons: [],
    armor: [],
    monsters: [],
    prophecies: [],
    treasures: [],
  };
}

// ============================================================================
// LEGENDARY INTERACTIONS - When parties encounter legendary elements
// ============================================================================

export function checkLegendaryEncounter(
  rng: Random,
  party: Party,
  location: string,
  legendaryState: LegendaryState,
  worldTime: Date,
  seed: string,
  world: WorldState,
  antagonists: Antagonist[],
  storyThreads: StoryThread[],
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Check for unique monster encounter
  const monstersHere = legendaryState.monsters.filter(m => m.alive && m.territory === location);
  
  for (const monster of monstersHere) {
    if (rng.chance(0.05)) { // 5% chance to encounter
      const partyStrength = (party.fame ?? 0) + (party.members.length * 2);
      const victory = partyStrength > monster.threat + rng.int(5);
      
      if (victory) {
        monster.alive = false;
        
        const deathEvent: WorldEvent = {
          id: rng.uid('slayer'),
          type: 'death',
          timestamp: worldTime,
          location,
          actors: [party.name],
          victims: [monster.name],
          magnitude: 10,
          witnessed: true,
          data: { cause: 'legendary battle', legendary: true },
        };
        logs.push(...processWorldEvent(deathEvent, world, rng, antagonists, storyThreads));

        logs.push({
          category: 'road',
          summary: `${party.name} SLAYS ${monster.name} ${monster.epithet}!`,
          details: `Against all odds, they defeat the legendary ${monster.species}! ${monster.treasure ? `In its lair, they find ${monster.treasure}.` : ''} Songs will be sung for generations!`,
          location,
          actors: [party.name, monster.name],
          worldTime,
          realTime: new Date(),
          seed,
        });
        return logs;
      } else {
        party.wounded = true;
        party.restHoursRemaining = 48;
        logs.push({
          category: 'road',
          summary: `${party.name} flees ${monster.name} ${monster.epithet}`,
          details: `The legendary ${monster.species} proves too powerful. They escape with their lives—barely.`,
          location,
          actors: [party.name, monster.name],
          worldTime,
          realTime: new Date(),
          seed,
        });
        return logs;
      }
    }
  }
  
  // Check for weapon discovery
  const undiscoveredWeapons = legendaryState.weapons.filter(w => !w.discovered && w.sightings >= 3);
  
  for (const weapon of undiscoveredWeapons) {
    if (rng.chance(0.03)) { // 3% chance to find
      weapon.discovered = true;
      weapon.owner = party.name;
      weapon.location = location;
      
      const discoveryEvent: WorldEvent = {
        id: rng.uid('discovery'),
        type: 'discovery',
        timestamp: worldTime,
        location,
        actors: [party.name],
        magnitude: 8,
        witnessed: true,
        data: { item: weapon.name, type: 'legendary weapon' },
      };
      logs.push(...processWorldEvent(discoveryEvent, world, rng, antagonists, storyThreads));

      logs.push({
        category: 'road',
        summary: `${party.name} discovers ${weapon.name} ${weapon.epithet}!`,
        details: `In a forgotten place, they find the legendary ${weapon.type} of ${weapon.material}. ${weapon.history} ${weapon.curse ? `But a dark truth emerges: ${weapon.curse}` : 'A new chapter begins.'}`,
        location,
        actors: [party.name],
        worldTime,
        realTime: new Date(),
        seed,
      });
      return logs;
    }
  }
  
  return logs;
}

