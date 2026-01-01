import { FEMALE_NAMES, MALE_NAMES } from '../data/names.ts';
import { PLACES } from '../data/places.ts';
import { Random } from './rng.ts';

export type Gender = 'female' | 'male' | 'any';

export function randomName(rng: Random, gender: Gender = 'any'): string {
  if (gender === 'female') return rng.pick(FEMALE_NAMES);
  if (gender === 'male') return rng.pick(MALE_NAMES);
  return rng.pick(rng.chance(0.5) ? FEMALE_NAMES : MALE_NAMES);
}

export function randomPlace(rng: Random): string {
  return rng.pick(PLACES);
}

// ============================================================================
// PROCEDURAL FACTION NAMES
// ============================================================================

const FACTION_STRUCTURES = [
  'The %ADJ% %NOUN%',
  '%NOUN% of the %SYMBOL%',
  'The %SYMBOL% %NOUN%',
  '%ADJ% %NOUN% of %PLACE%',
  'Order of the %SYMBOL%',
  'Brotherhood of the %SYMBOL%',
  'Sisterhood of the %SYMBOL%',
  'Guild of %PLURAL%',
  'The %SYMBOL% Compact',
  'House of the %SYMBOL%',
  'Sons of the %SYMBOL%',
  'Daughters of the %SYMBOL%',
  'Keepers of the %SYMBOL%',
  'The %SYMBOL% Hand',
  'The %ADJ% Covenant',
];

const FACTION_ADJECTIVES = [
  'Silent', 'Hidden', 'Crimson', 'Golden', 'Silver', 'Iron', 'Shadowed',
  'Burning', 'Frozen', 'Ancient', 'Eternal', 'Vigilant', 'Faithful',
  'Merciful', 'Vengeful', 'Watchful', 'Steadfast', 'Wandering', 'Blessed',
  'Forsaken', 'Twilight', 'Dawn', 'Midnight', 'Storm', 'Thunder',
];

const FACTION_NOUNS = [
  'Brotherhood', 'Sisterhood', 'Order', 'Guild', 'Company', 'Lodge',
  'Circle', 'Council', 'Covenant', 'Fellowship', 'League', 'Society',
  'Cabal', 'Congregation', 'Assembly', 'Conclave', 'Syndicate', 'Union',
];

const FACTION_SYMBOLS = [
  'Flame', 'Star', 'Moon', 'Sun', 'Serpent', 'Wolf', 'Raven', 'Lion',
  'Rose', 'Thorn', 'Oak', 'Iron', 'Gold', 'Silver', 'Crown', 'Sword',
  'Shield', 'Coin', 'Scale', 'Compass', 'Anchor', 'Key', 'Chalice',
  'Eye', 'Hand', 'Heart', 'Skull', 'Tower', 'Gate', 'Bridge', 'Path',
  'Chain', 'Ring', 'Wheel', 'Hammer', 'Anvil', 'Quill', 'Scroll',
  'Ash', 'Storm', 'Bone', 'Blood', 'Shadow', 'Frost', 'Dawn', 'Dusk',
  'Wyrm', 'Phoenix', 'Griffin', 'Stag', 'Bear', 'Hawk', 'Spider', 'Viper',
];

const FACTION_PLURALS = [
  'Shadows', 'Flames', 'Whispers', 'Secrets', 'Blades', 'Coins',
  'Stars', 'Storms', 'Thorns', 'Ravens', 'Wolves', 'Lions',
];

export type FactionFocus = 'trade' | 'martial' | 'pious' | 'arcane';

export function generateFactionName(rng: Random, focus?: FactionFocus): string {
  // Bias certain patterns toward certain focuses
  let structure: string;
  
  if (focus === 'trade') {
    structure = rng.pick([
      'Guild of %PLURAL%',
      'The %SYMBOL% Compact',
      '%ADJ% %NOUN% of %PLACE%',
      'The %ADJ% %NOUN%',
    ]);
  } else if (focus === 'martial') {
    structure = rng.pick([
      'Brotherhood of the %SYMBOL%',
      'Order of the %SYMBOL%',
      'The %SYMBOL% %NOUN%',
      'Sons of the %SYMBOL%',
      'The %ADJ% %NOUN%',
    ]);
  } else if (focus === 'pious') {
    structure = rng.pick([
      'Order of the %SYMBOL%',
      'Keepers of the %SYMBOL%',
      'The %ADJ% Covenant',
      'Sisterhood of the %SYMBOL%',
      'House of the %SYMBOL%',
    ]);
  } else if (focus === 'arcane') {
    structure = rng.pick([
      'The %ADJ% %NOUN%',
      'Keepers of the %SYMBOL%',
      'Order of the %SYMBOL%',
      'The %SYMBOL% Compact',
      'Circle of the %SYMBOL%',
    ]);
  } else {
    structure = rng.pick(FACTION_STRUCTURES);
  }
  
  return structure
    .replace('%ADJ%', rng.pick(FACTION_ADJECTIVES))
    .replace('%NOUN%', rng.pick(FACTION_NOUNS))
    .replace('%SYMBOL%', rng.pick(FACTION_SYMBOLS))
    .replace('%PLURAL%', rng.pick(FACTION_PLURALS))
    .replace('%PLACE%', randomPlace(rng));
}

// ============================================================================
// PROCEDURAL PARTY/BAND NAMES
// ============================================================================

const PARTY_STRUCTURES = [
  '%NAME%\'s Company',
  '%NAME%\'s Band',
  'The %ADJ% %PLURAL%',
  '%NAME%\'s Wolves',
  'The %PLACE% %PLURAL%',
  '%NAME%\'s Blades',
  'The %ADJ% Company',
  '%NAME% and Company',
  'The Wayward %PLURAL%',
  '%NAME%\'s Oath',
];

const PARTY_ADJECTIVES = [
  'Bold', 'Brave', 'Free', 'Wild', 'Wandering', 'Lucky', 'Merry',
  'Grim', 'Iron', 'Steel', 'Silver', 'Golden', 'Red', 'Black', 'White',
];

const PARTY_PLURALS = [
  'Companions', 'Blades', 'Swords', 'Shields', 'Brothers', 'Sisters',
  'Wolves', 'Hawks', 'Ravens', 'Lions', 'Foxes', 'Hounds', 'Fists',
];

export function generatePartyName(rng: Random): string {
  const structure = rng.pick(PARTY_STRUCTURES);
  
  return structure
    .replace('%NAME%', randomName(rng))
    .replace('%ADJ%', rng.pick(PARTY_ADJECTIVES))
    .replace('%PLURAL%', rng.pick(PARTY_PLURALS))
    .replace('%PLACE%', randomPlace(rng));
}

// ============================================================================
// PROCEDURAL CARAVAN NAMES
// ============================================================================

const CARAVAN_STRUCTURES = [
  '%PLACE% Traders',
  'The %ADJ% Caravan',
  '%NAME%\'s Wagons',
  '%PLACE% Merchants',
  'The %SYMBOL% Trading Company',
  '%NAME% & Sons',
  '%PLACE% Provisioners',
  'The Wandering %PLURAL%',
];

const CARAVAN_ADJECTIVES = [
  'Northern', 'Southern', 'Eastern', 'Western', 'Far', 'Old', 'New',
  'Great', 'Swift', 'Honest', 'Lucky', 'Prosperous', 'Wandering',
];

const CARAVAN_PLURALS = ['Merchants', 'Traders', 'Peddlers', 'Provisioners'];

export function generateCaravanName(rng: Random): string {
  const structure = rng.pick(CARAVAN_STRUCTURES);
  
  return structure
    .replace('%NAME%', randomName(rng))
    .replace('%ADJ%', rng.pick(CARAVAN_ADJECTIVES))
    .replace('%PLURAL%', rng.pick(CARAVAN_PLURALS))
    .replace('%SYMBOL%', rng.pick(FACTION_SYMBOLS))
    .replace('%PLACE%', randomPlace(rng));
}

// ============================================================================
// PROCEDURAL DUNGEON NAMES
// ============================================================================

const DUNGEON_STRUCTURES = [
  'The %ADJ% %PLACE_TYPE%',
  '%PLACE_TYPE% of %NOUN%',
  'The %NOUN% %PLACE_TYPE%',
  '%NAME%\'s %PLACE_TYPE%',
  '%PLACE% %PLACE_TYPE%',
  'The %PLACE_TYPE% of %ADJ% %NOUN%',
  '%ADJ% %PLACE_TYPE% of %PLACE%',
];

const DUNGEON_PLACE_TYPES = [
  'Ruins', 'Crypt', 'Tomb', 'Lair', 'Caverns', 'Depths', 'Dungeon',
  'Fortress', 'Tower', 'Barrow', 'Pit', 'Maze', 'Sanctum', 'Vault',
  'Catacombs', 'Warren', 'Hold', 'Keep', 'Citadel', 'Halls',
];

const DUNGEON_ADJECTIVES = [
  'Forgotten', 'Ruined', 'Sunken', 'Haunted', 'Cursed', 'Burning',
  'Frozen', 'Ancient', 'Lost', 'Hidden', 'Forsaken', 'Shadowed',
  'Blighted', 'Flooded', 'Crumbling', 'Eternal', 'Silent', 'Screaming',
];

const DUNGEON_NOUNS = [
  'Shadows', 'Bones', 'Sorrow', 'Madness', 'Despair', 'Whispers',
  'Echoes', 'Chains', 'Thorns', 'Flame', 'Ice', 'Blood', 'Death',
  'Secrets', 'Doom', 'Wrath', 'Silence', 'Darkness', 'Dreams',
];

export function generateDungeonName(rng: Random): string {
  const structure = rng.pick(DUNGEON_STRUCTURES);
  
  return structure
    .replace('%NAME%', randomName(rng))
    .replace('%ADJ%', rng.pick(DUNGEON_ADJECTIVES))
    .replace('%NOUN%', rng.pick(DUNGEON_NOUNS))
    .replace('%PLACE_TYPE%', rng.pick(DUNGEON_PLACE_TYPES))
    .replace('%PLACE%', randomPlace(rng));
}

// ============================================================================
// PROCEDURAL CREATURE NAMES (for named beasts/monsters)
// ============================================================================

const CREATURE_EPITHETS = [
  'the Terrible', 'the Dread', 'the Cruel', 'the Ancient', 'the Vast',
  'the Hungry', 'the Relentless', 'the Deathless', 'the Unsleeping',
  'Devourer', 'Bane', 'Slayer', 'Terror', 'Scourge', 'Nightmare',
  'the Pale', 'the Black', 'the Red', 'the White', 'Shadowbane',
  'Bonecrusher', 'Fleshrender', 'Soulripper', 'Doombringer',
];

const CREATURE_NAME_PARTS = [
  'Grim', 'Dread', 'Blood', 'Bone', 'Shadow', 'Night', 'Death',
  'Storm', 'Thunder', 'Iron', 'Stone', 'Frost', 'Flame', 'Ash',
  'Gore', 'Skull', 'Claw', 'Fang', 'Wing', 'Scale', 'Horn',
];

const CREATURE_NAME_SUFFIXES = [
  'fang', 'claw', 'maw', 'wing', 'scale', 'hide', 'bone',
  'bane', 'doom', 'death', 'fury', 'rage', 'wrath', 'terror',
];

export function generateCreatureName(rng: Random): { name: string; epithet: string } {
  // Generate a portmanteau-style name
  const part1 = rng.pick(CREATURE_NAME_PARTS);
  const part2 = rng.pick(CREATURE_NAME_SUFFIXES);
  const name = part1 + part2;
  const epithet = rng.pick(CREATURE_EPITHETS);
  
  return { name, epithet };
}

// ============================================================================
// PROCEDURAL ANTAGONIST NAMES
// ============================================================================

const ANTAGONIST_EPITHETS_BY_TYPE: Record<string, string[]> = {
  bandit: [
    'the Cutthroat', 'the Ruthless', 'the Grinning', 'Red-Handed',
    'the Shadow', 'Quick-Blade', 'the Viper', 'Gold-Tooth',
    'the Merciless', 'Three-Fingers', 'One-Eye', 'the Silent',
  ],
  cultist: [
    'the Prophet', 'the Whisperer', 'the Devoted', 'the Enlightened',
    'Voice of the Deep', 'the Anointed', 'the Seer', 'the Touched',
    'Herald of Doom', 'the Dreamer', 'the Awakened', 'the Chosen',
  ],
  necromancer: [
    'the Pale', 'the Deathless', 'Bone-Master', 'the Undying',
    'Lord of Graves', 'the Lich', 'the Hollow', 'Death\'s Hand',
    'the Withered', 'Soul-Binder', 'the Carrion Lord', 'Grave-Walker',
  ],
  warlord: [
    'the Conqueror', 'the Bloody', 'Iron-Fist', 'the Destroyer',
    'the Tyrant', 'Skull-Taker', 'the Dread', 'War-Bringer',
    'the Scourge', 'Battle-Born', 'the Undefeated', 'the Warlord',
  ],
  dragon: [
    'the Ancient', 'the Eternal', 'Fire-Born', 'the Desolator',
    'World-Ender', 'the Magnificent', 'Flame-Tongue', 'the Dread',
    'Sky-Terror', 'the Insatiable', 'Gold-Hoarder', 'the Terrible',
  ],
  vampire: [
    'the Immortal', 'the Thirsty', 'Nightwalker', 'Blood-Lord',
    'the Crimson', 'Shadow-Born', 'the Eternal', 'the Pale Count',
    'Night\'s Child', 'the Undying', 'the Forsaken', 'Blood-Drinker',
  ],
  demon: [
    'the Corruptor', 'the Deceiver', 'Soul-Trader', 'the Tempter',
    'Hell-Spawn', 'the Unbound', 'Pain-Bringer', 'the Despoiler',
    'Oath-Breaker', 'the Burning', 'the Accursed', 'Doom-Speaker',
  ],
  giant: [
    'the Colossal', 'Mountain-Crusher', 'Earth-Shaker', 'the Massive',
    'World-Breaker', 'Stone-Skin', 'the Unstoppable', 'Hill-Walker',
    'the Titan', 'Boulder-Fist', 'the Enormous', 'Ground-Pounder',
  ],
};

export function generateAntagonistEpithet(rng: Random, type: string): string {
  const epithets = ANTAGONIST_EPITHETS_BY_TYPE[type] ?? ANTAGONIST_EPITHETS_BY_TYPE['bandit'];
  return rng.pick(epithets);
}

// ============================================================================
// PROCEDURAL LEGENDARY WEAPON NAMES
// ============================================================================

const WEAPON_NAME_PARTS = [
  'Dawn', 'Dusk', 'Night', 'Storm', 'Thunder', 'Lightning', 'Frost',
  'Flame', 'Shadow', 'Light', 'Star', 'Moon', 'Sun', 'Blood', 'Soul',
  'Death', 'Life', 'Hope', 'Doom', 'Wrath', 'Mercy', 'Justice', 'Fury',
];

const WEAPON_NAME_SUFFIXES: Record<string, string[]> = {
  sword: ['bringer', 'blade', 'edge', 'cleaver', 'slayer', 'keeper', 'fall', 'song'],
  axe: ['splitter', 'cleaver', 'crusher', 'breaker', 'render', 'biter', 'roar'],
  spear: ['pierce', 'seeker', 'tongue', 'strike', 'thrust', 'lance', 'reach'],
  bow: ['string', 'shot', 'flight', 'whisper', 'eye', 'wind', 'hawk'],
  mace: ['hammer', 'crusher', 'breaker', 'fall', 'strike', 'judgment'],
  dagger: ['fang', 'sting', 'whisper', 'kiss', 'bite', 'shadow', 'blade'],
  staff: ['caller', 'weaver', 'binder', 'speaker', 'light', 'fire'],
  hammer: ['fall', 'strike', 'thunder', 'breaker', 'forge', 'might'],
};

export function generateWeaponName(rng: Random, type: string): string {
  const part = rng.pick(WEAPON_NAME_PARTS);
  const suffixes = WEAPON_NAME_SUFFIXES[type] ?? WEAPON_NAME_SUFFIXES['sword'];
  const suffix = rng.pick(suffixes);
  return part + suffix;
}

