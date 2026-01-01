/**
 * MONSTER ECOLOGY & MIGRATION
 * 
 * Monsters are part of the living world, not just random encounters:
 * - Territories with carrying capacity
 * - Breeding seasons (more aggressive, more young)
 * - Migration patterns (winter drives orcs south)
 * - Apex predators suppress weaker creatures
 * - Dungeons slowly repopulate
 * - Monster-faction alliances
 * 
 * REAL-TIME PACING:
 * - Breeding cycle: Spring (March-May)
 * - Migration: Seasonal (takes 1-4 weeks)
 * - Population growth: ~2-5% per month during good conditions
 * - Dungeon repopulation: 2-8 weeks after clearing
 * - Territorial disputes: Weekly checks
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, HexCoord, Terrain, Dungeon } from './types.ts';
import { Antagonist } from './antagonists.ts';
import { queueConsequence } from './consequences.ts';
import { getSettlementState } from './causality.ts';

// ============================================================================
// MONSTER TYPES & CLASSIFICATION
// ============================================================================

export type MonsterCategory = 
  | 'humanoid'    // Orcs, goblins, kobolds, gnolls
  | 'undead'      // Skeletons, zombies, wights, wraiths
  | 'beast'       // Wolves, bears, giant animals
  | 'dragon'      // Dragons, drakes, wyverns
  | 'giant'       // Giants, ogres, trolls
  | 'demon'       // Demons, devils, fiends
  | 'fey'         // Pixies, dryads, satyrs
  | 'aberration'  // Mind flayers, beholders
  | 'construct'   // Golems, animated objects
  | 'elemental'   // Fire, water, earth, air elementals
  | 'aquatic';    // Sea monsters, merfolk, sahuagin

export type MonsterSpecies = 
  // === HUMANOIDS (tribal, organized) ===
  | 'orc' | 'goblin' | 'kobold' | 'gnoll' | 'hobgoblin' | 'bugbear' | 'lizardfolk'
  | 'troglodyte' | 'gnome' | 'duergar' | 'derro' | 'kuo-toa' | 'sahuagin' | 'locathah'
  | 'bullywug' | 'grippli' | 'kenku' | 'tengu' | 'jackalwere' | 'wererat' | 'werebear'
  | 'werewolf' | 'wereboar' | 'weretiger' | 'rakshasa' | 'yuan-ti' | 'naga-guardian'
  | 'centaur' | 'satyr' | 'sprite' | 'pixie' | 'nixie' | 'dryad' | 'nereid' | 'sylph'
  
  // === UNDEAD (fearsome, territorial) ===
  | 'skeleton' | 'zombie' | 'ghoul' | 'wight' | 'wraith' | 'vampire-spawn'
  | 'shadow' | 'specter' | 'banshee' | 'ghost' | 'poltergeist' | 'haunt' | 'phantom'
  | 'mummy' | 'lich-spawn' | 'death-knight' | 'revenant' | 'draugr' | 'barrow-wight'
  | 'bone-golem' | 'corpse-crawler' | 'rot-grub-swarm' | 'will-o-wisp' | 'groaning-spirit'
  
  // === BEASTS (natural predators) ===
  | 'wolf' | 'dire-wolf' | 'bear' | 'giant-spider' | 'giant-rat' | 'worg'
  | 'giant-ant' | 'giant-beetle' | 'giant-centipede' | 'giant-scorpion' | 'giant-wasp'
  | 'giant-snake' | 'giant-constrictor' | 'giant-lizard' | 'giant-toad' | 'giant-frog'
  | 'giant-crab' | 'giant-octopus' | 'giant-eel' | 'giant-pike' | 'giant-shark'
  | 'giant-eagle' | 'giant-owl' | 'giant-hawk' | 'giant-raven' | 'giant-bat'
  | 'giant-boar' | 'giant-elk' | 'giant-weasel' | 'giant-badger' | 'giant-wolverine'
  | 'dire-bear' | 'dire-boar' | 'dire-lion' | 'dire-tiger' | 'saber-tooth'
  | 'cave-bear' | 'cave-lion' | 'mammoth' | 'mastodon' | 'woolly-rhino'
  | 'crocodile' | 'giant-crocodile' | 'python' | 'viper' | 'cobra' | 'asp'
  | 'swarm-of-bats' | 'swarm-of-rats' | 'swarm-of-insects' | 'swarm-of-spiders'
  
  // === DRAGONS & DRAKES ===
  | 'young-dragon' | 'drake' | 'wyvern'
  | 'white-dragon' | 'black-dragon' | 'green-dragon' | 'blue-dragon' | 'red-dragon'
  | 'brass-dragon' | 'bronze-dragon' | 'copper-dragon' | 'silver-dragon' | 'gold-dragon'
  | 'fire-drake' | 'ice-drake' | 'swamp-drake' | 'forest-drake' | 'sea-drake'
  | 'pseudodragon' | 'faerie-dragon' | 'dragon-turtle' | 'hydra' | 'pyrohydra'
  
  // === GIANTS & GIANTKIN ===
  | 'ogre' | 'troll' | 'hill-giant' | 'frost-giant' | 'fire-giant'
  | 'stone-giant' | 'cloud-giant' | 'storm-giant' | 'mountain-giant' | 'sea-giant'
  | 'cyclops' | 'ettin' | 'fomorian' | 'athach' | 'verbeeg'
  | 'ogre-mage' | 'oni' | 'troll-ice' | 'troll-rock' | 'troll-war'
  
  // === GOBLINOIDS & ORC-KIN ===
  | 'orc-warchief' | 'orc-shaman' | 'orc-berserker' | 'half-orc-bandit'
  | 'goblin-worg-rider' | 'goblin-shaman' | 'goblin-king'
  | 'hobgoblin-captain' | 'hobgoblin-warlord' | 'hobgoblin-devastator'
  | 'bugbear-chief' | 'bugbear-stalker'
  
  // === ABERRATIONS (alien horrors) ===
  | 'carrion-crawler' | 'rust-monster' | 'otyugh' | 'neo-otyugh' | 'grell'
  | 'hook-horror' | 'umber-hulk' | 'xorn' | 'roper' | 'piercer' | 'lurker-above'
  | 'trapper' | 'cloaker' | 'darkmantle' | 'choker' | 'grick' | 'intellect-devourer'
  | 'mind-flayer' | 'aboleth' | 'beholder' | 'beholder-kin' | 'eye-of-the-deep'
  | 'gibbering-mouther' | 'chaos-beast' | 'phasm' | 'mimic' | 'doppelganger'
  
  // === OOZES & SLIMES ===
  | 'gray-ooze' | 'ochre-jelly' | 'black-pudding' | 'gelatinous-cube' | 'green-slime'
  | 'mustard-jelly' | 'olive-slime' | 'crystal-ooze' | 'slithering-tracker' | 'id-ooze'
  
  // === CONSTRUCTS ===
  | 'animated-armor' | 'flying-sword' | 'golem-flesh' | 'golem-clay' | 'golem-stone'
  | 'golem-iron' | 'golem-bronze' | 'golem-wood' | 'scarecrow' | 'gargoyle'
  | 'shield-guardian' | 'helmed-horror' | 'homunculus' | 'marionette' | 'living-statue'
  
  // === ELEMENTALS ===
  | 'fire-elemental' | 'water-elemental' | 'earth-elemental' | 'air-elemental'
  | 'magma-elemental' | 'ice-elemental' | 'mud-elemental' | 'smoke-elemental'
  | 'fire-mephit' | 'ice-mephit' | 'dust-mephit' | 'steam-mephit' | 'salt-mephit'
  | 'salamander' | 'azer' | 'magmin' | 'thoqqua' | 'galeb-duhr' | 'dao' | 'djinni' | 'efreeti' | 'marid'
  
  // === FIENDS (demons, devils) ===
  | 'imp' | 'quasit' | 'dretch' | 'manes' | 'lemure' | 'nupperibo'
  | 'hell-hound' | 'nightmare' | 'barghest' | 'shadow-demon' | 'vrock' | 'hezrou'
  | 'glabrezu' | 'nalfeshnee' | 'succubus' | 'incubus' | 'cambion'
  | 'bearded-devil' | 'chain-devil' | 'bone-devil' | 'horned-devil' | 'ice-devil'
  | 'night-hag' | 'green-hag' | 'sea-hag' | 'annis-hag' | 'coven-hag'
  
  // === CELESTIALS ===
  | 'lantern-archon' | 'hound-archon' | 'astral-deva' | 'planetar' | 'solar'
  | 'pegasus' | 'unicorn' | 'ki-rin' | 'couatl' | 'shedu' | 'lammasu' | 'sphinx'
  
  // === FLYING CREATURES ===
  | 'harpy' | 'manticore' | 'griffon' | 'hippogriff' | 'chimera' | 'peryton'
  | 'cockatrice' | 'stymphalian-bird' | 'roc' | 'thunderbird' | 'giant-vulture'
  | 'stirge' | 'dire-bat' | 'mobat' | 'giant-mosquito' | 'blood-hawk'
  
  // === REPTILIAN & SERPENTINE ===
  | 'basilisk' | 'cockatrice' | 'gorgon' | 'catoblepas' | 'medusa'
  | 'giant-basilisk' | 'dracolisk' | 'pyrolisk' | 'sea-serpent' | 'linnorm'
  | 'amphisbaena' | 'jormungandr-spawn' | 'couatl' | 'quetzalcoatl-spawn'
  
  // === SUBTERRANEAN ===
  | 'cave-fisher' | 'cloaker' | 'darkmantle' | 'myconid' | 'shrieker' | 'violet-fungus'
  | 'gas-spore' | 'vegepygmy' | 'phantom-fungus' | 'ascomoid' | 'basidirond'
  | 'drow' | 'drow-priestess' | 'drow-mage' | 'drider' | 'deep-gnome'
  
  // === AQUATIC ===
  | 'merfolk' | 'triton' | 'sea-elf' | 'siren' | 'selkie' | 'merrow'
  | 'scrag' | 'kapoacinth' | 'sea-hag' | 'kelpie' | 'vodyanoi'
  | 'kraken-spawn' | 'aboleth-spawn' | 'chuul' | 'kopru' | 'ixitxachitl'
  
  // === CLASSIC DUNGEON DENIZENS ===
  | 'minotaur' | 'owlbear' | 'displacer-beast' | 'blink-dog' | 'phase-spider'
  | 'rust-monster' | 'bulette' | 'ankheg' | 'purple-worm' | 'remorhaz'
  | 'leucrotta' | 'caterwaul' | 'su-monster' | 'thoul' | 'thoqqua'
  | 'shambling-mound' | 'treant' | 'tendriculos' | 'assassin-vine' | 'blood-tree'
  | 'phantom-warrior' | 'death-dog' | 'bonesnapper' | 'osquip' | 'jermlaine'
  
  // === RARE & LEGENDARY ===
  | 'tarrasque' | 'purple-worm' | 'elder-brain' | 'kraken' | 'leviathan'
  | 'phoenix' | 'titan' | 'empyrean' | 'astral-dreadnought' | 'nightwalker';

// Complete list of all monster species for random selection
const ALL_SPECIES: MonsterSpecies[] = [
  // Humanoids
  'orc', 'goblin', 'kobold', 'gnoll', 'hobgoblin', 'bugbear', 'lizardfolk',
  'troglodyte', 'gnome', 'duergar', 'derro', 'kuo-toa', 'sahuagin', 'locathah',
  'bullywug', 'grippli', 'kenku', 'tengu', 'jackalwere', 'wererat', 'werebear',
  'werewolf', 'wereboar', 'weretiger', 'rakshasa', 'yuan-ti', 'naga-guardian',
  'centaur', 'satyr', 'sprite', 'pixie', 'nixie', 'dryad', 'nereid', 'sylph',
  // Undead
  'skeleton', 'zombie', 'ghoul', 'wight', 'wraith', 'vampire-spawn',
  'shadow', 'specter', 'banshee', 'ghost', 'poltergeist', 'haunt', 'phantom',
  'mummy', 'lich-spawn', 'death-knight', 'revenant', 'draugr', 'barrow-wight',
  'bone-golem', 'corpse-crawler', 'rot-grub-swarm', 'will-o-wisp', 'groaning-spirit',
  // Beasts
  'wolf', 'dire-wolf', 'bear', 'giant-spider', 'giant-rat', 'worg',
  'giant-ant', 'giant-beetle', 'giant-centipede', 'giant-scorpion', 'giant-wasp',
  'giant-snake', 'giant-constrictor', 'giant-lizard', 'giant-toad', 'giant-frog',
  'giant-crab', 'giant-octopus', 'giant-eel', 'giant-pike', 'giant-shark',
  'giant-eagle', 'giant-owl', 'giant-hawk', 'giant-raven', 'giant-bat',
  'giant-boar', 'giant-elk', 'giant-weasel', 'giant-badger', 'giant-wolverine',
  'dire-bear', 'dire-boar', 'dire-lion', 'dire-tiger', 'saber-tooth',
  'cave-bear', 'cave-lion', 'mammoth', 'mastodon', 'woolly-rhino',
  'crocodile', 'giant-crocodile', 'python', 'viper', 'cobra', 'asp',
  'swarm-of-bats', 'swarm-of-rats', 'swarm-of-insects', 'swarm-of-spiders',
  // Dragons
  'young-dragon', 'drake', 'wyvern',
  'white-dragon', 'black-dragon', 'green-dragon', 'blue-dragon', 'red-dragon',
  'brass-dragon', 'bronze-dragon', 'copper-dragon', 'silver-dragon', 'gold-dragon',
  'fire-drake', 'ice-drake', 'swamp-drake', 'forest-drake', 'sea-drake',
  'pseudodragon', 'faerie-dragon', 'dragon-turtle', 'hydra', 'pyrohydra',
  // Giants
  'ogre', 'troll', 'hill-giant', 'frost-giant', 'fire-giant',
  'stone-giant', 'cloud-giant', 'storm-giant', 'mountain-giant', 'sea-giant',
  'cyclops', 'ettin', 'fomorian', 'athach', 'verbeeg',
  'ogre-mage', 'oni', 'troll-ice', 'troll-rock', 'troll-war',
  // Goblinoids variants
  'orc-warchief', 'orc-shaman', 'orc-berserker', 'half-orc-bandit',
  'goblin-worg-rider', 'goblin-shaman', 'goblin-king',
  'hobgoblin-captain', 'hobgoblin-warlord', 'hobgoblin-devastator',
  'bugbear-chief', 'bugbear-stalker',
  // Aberrations
  'carrion-crawler', 'rust-monster', 'otyugh', 'neo-otyugh', 'grell',
  'hook-horror', 'umber-hulk', 'xorn', 'roper', 'piercer', 'lurker-above',
  'trapper', 'cloaker', 'darkmantle', 'choker', 'grick', 'intellect-devourer',
  'mind-flayer', 'aboleth', 'beholder', 'beholder-kin', 'eye-of-the-deep',
  'gibbering-mouther', 'chaos-beast', 'phasm', 'mimic', 'doppelganger',
  // Oozes
  'gray-ooze', 'ochre-jelly', 'black-pudding', 'gelatinous-cube', 'green-slime',
  'mustard-jelly', 'olive-slime', 'crystal-ooze', 'slithering-tracker', 'id-ooze',
  // Constructs
  'animated-armor', 'flying-sword', 'golem-flesh', 'golem-clay', 'golem-stone',
  'golem-iron', 'golem-bronze', 'golem-wood', 'scarecrow', 'gargoyle',
  'shield-guardian', 'helmed-horror', 'homunculus', 'marionette', 'living-statue',
  // Elementals
  'fire-elemental', 'water-elemental', 'earth-elemental', 'air-elemental',
  'magma-elemental', 'ice-elemental', 'mud-elemental', 'smoke-elemental',
  'fire-mephit', 'ice-mephit', 'dust-mephit', 'steam-mephit', 'salt-mephit',
  'salamander', 'azer', 'magmin', 'thoqqua', 'galeb-duhr', 'dao', 'djinni', 'efreeti', 'marid',
  // Fiends
  'imp', 'quasit', 'dretch', 'manes', 'lemure', 'nupperibo',
  'hell-hound', 'nightmare', 'barghest', 'shadow-demon', 'vrock', 'hezrou',
  'glabrezu', 'nalfeshnee', 'succubus', 'incubus', 'cambion',
  'bearded-devil', 'chain-devil', 'bone-devil', 'horned-devil', 'ice-devil',
  'night-hag', 'green-hag', 'sea-hag', 'annis-hag', 'coven-hag',
  // Celestials
  'lantern-archon', 'hound-archon', 'astral-deva', 'planetar', 'solar',
  'pegasus', 'unicorn', 'ki-rin', 'couatl', 'shedu', 'lammasu', 'sphinx',
  // Flying
  'harpy', 'manticore', 'griffon', 'hippogriff', 'chimera', 'peryton',
  'cockatrice', 'stymphalian-bird', 'roc', 'thunderbird', 'giant-vulture',
  'stirge', 'dire-bat', 'mobat', 'giant-mosquito', 'blood-hawk',
  // Reptilian
  'basilisk', 'gorgon', 'catoblepas', 'medusa',
  'giant-basilisk', 'dracolisk', 'pyrolisk', 'sea-serpent', 'linnorm',
  'amphisbaena', 'jormungandr-spawn', 'quetzalcoatl-spawn',
  // Subterranean
  'cave-fisher', 'myconid', 'shrieker', 'violet-fungus',
  'gas-spore', 'vegepygmy', 'phantom-fungus', 'ascomoid', 'basidirond',
  'drow', 'drow-priestess', 'drow-mage', 'drider', 'deep-gnome',
  // Aquatic
  'merfolk', 'triton', 'sea-elf', 'siren', 'selkie', 'merrow',
  'scrag', 'kapoacinth', 'kelpie', 'vodyanoi',
  'kraken-spawn', 'aboleth-spawn', 'chuul', 'kopru', 'ixitxachitl',
  // Classic dungeon
  'minotaur', 'owlbear', 'displacer-beast', 'blink-dog', 'phase-spider',
  'bulette', 'ankheg', 'purple-worm', 'remorhaz',
  'leucrotta', 'caterwaul', 'su-monster', 'thoul',
  'shambling-mound', 'treant', 'tendriculos', 'assassin-vine', 'blood-tree',
  'phantom-warrior', 'death-dog', 'bonesnapper', 'osquip', 'jermlaine',
  // Legendary
  'tarrasque', 'elder-brain', 'kraken', 'leviathan',
  'phoenix', 'titan', 'empyrean', 'astral-dreadnought', 'nightwalker',
];

export interface MonsterPopulation {
  id: string;
  species: MonsterSpecies;
  category: MonsterCategory;
  
  // Location
  hexCoord: HexCoord;
  territoryName: string;     // Human-readable location
  preferredTerrain: Terrain[];
  
  // Population
  population: number;
  maxPopulation: number;     // Carrying capacity
  growthRate: number;        // Monthly growth % (affected by conditions)
  
  // Behavior
  aggression: number;        // 0-10, affects encounter rate
  territorialRadius: number; // Hexes they consider "theirs"
  nomadic: boolean;          // Do they migrate?
  
  // Hierarchy
  leaderId?: string;         // Antagonist ID if led by a named villain
  tributeTo?: string;        // Stronger population they serve
  
  // Seasonal
  breedingSeason: number[];  // Months (1-12)
  migrationSeason?: number[]; // Months when they migrate
  migrationDestination?: HexCoord;
  
  // State
  lastBreeding: Date;
  lastMigration?: Date;
  recentLosses: number;      // Deaths in recent encounters
  recentHunting: number;     // Food gathered
  morale: number;            // -10 to 10
  
  // Dungeon specific
  dungeonId?: string;        // If they lair in a dungeon
  roomsClaimed: number;      // How much of dungeon they control
}

export interface EcologyState {
  populations: MonsterPopulation[];
  extinctions: ExtinctionRecord[];
  migrations: MigrationEvent[];
  territorialDisputes: TerritorialDispute[];
}

export interface ExtinctionRecord {
  species: MonsterSpecies;
  location: string;
  timestamp: Date;
  cause: string;
}

export interface MigrationEvent {
  populationId: string;
  fromHex: HexCoord;
  toHex: HexCoord;
  startedAt: Date;
  arrivesAt: Date;
  reason: string;
}

export interface TerritorialDispute {
  id: string;
  population1Id: string;
  population2Id: string;
  contestedHex: HexCoord;
  startedAt: Date;
  intensity: number;         // 1-10
}

// ============================================================================
// SPECIES CONFIGURATION
// ============================================================================

interface SpeciesConfig {
  category: MonsterCategory;
  basePop: { min: number; max: number };
  growthRate: number;
  aggression: number;
  preferredTerrain: Terrain[];
  breedingSeason: number[];
  migratory: boolean;
  migrationMonths?: number[];
  foodChain: number;         // 1-10, higher = apex predator
  socialStructure: 'pack' | 'horde' | 'solitary' | 'hive' | 'tribe';
}

// Infer species config from naming patterns rather than defining 200+ individually
function inferSpeciesConfig(species: MonsterSpecies): SpeciesConfig {
  const name = species.toLowerCase();
  
  // === CATEGORY INFERENCE ===
  let category: MonsterCategory = 'beast';
  if (/orc|goblin|kobold|gnoll|hobgoblin|bugbear|lizard|trog|gnome|duergar|derro|kuo|sahuagin|locathah|bully|gripp|kenku|tengu|were|yuan|naga|centaur|satyr|sprite|pixie|nixie|dryad|nereid|sylph|merfolk|triton|elf|drow|deep-gnome/.test(name)) category = 'humanoid';
  if (/skeleton|zombie|ghoul|wight|wraith|vampire|shadow|specter|banshee|ghost|poltergeist|haunt|phantom|mummy|lich|death-knight|revenant|draugr|barrow|bone-golem|corpse|rot-grub|will-o|groaning/.test(name)) category = 'undead';
  if (/dragon|drake|wyvern|hydra|pyro/.test(name)) category = 'dragon';
  if (/giant|cyclops|ettin|fomorian|athach|verbeeg|ogre|troll|oni/.test(name)) category = 'giant';
  if (/demon|devil|imp|quasit|dretch|manes|lemure|hell-hound|nightmare|barghest|vrock|hezrou|glabrezu|nalfeshnee|succubus|incubus|cambion|chain-devil|bone-devil|horned|ice-devil|hag|fiend/.test(name)) category = 'demon';
  if (/archon|deva|planetar|solar|pegasus|unicorn|ki-rin|couatl|shedu|lammasu|sphinx|phoenix/.test(name)) category = 'fey';
  if (/elemental|mephit|salamander|azer|magmin|thoqqua|galeb|dao|djinni|efreeti|marid/.test(name)) category = 'elemental';
  if (/golem|animated|flying-sword|scarecrow|gargoyle|shield-guardian|helmed|homunculus|marionette|living-statue/.test(name)) category = 'construct';
  if (/ooze|jelly|pudding|cube|slime|slither|id-ooze|carrion|rust|otyugh|grell|hook|umber|xorn|roper|piercer|lurker|trapper|cloaker|darkmantle|choker|grick|intellect|mind-flayer|aboleth|beholder|gibbering|chaos|phasm|mimic|doppel/.test(name)) category = 'aberration';
  
  // === POPULATION SIZE ===
  let basePop = { min: 5, max: 20 };
  if (/swarm|horde|colony/.test(name)) basePop = { min: 30, max: 100 };
  if (/giant|dire|dragon|hydra|titan|tarrasque|kraken|leviathan|roc|purple-worm|elder/.test(name)) basePop = { min: 1, max: 3 };
  if (/kobold|goblin|rat|ant|beetle/.test(name)) basePop = { min: 20, max: 80 };
  if (/orc|gnoll|hobgoblin|lizardfolk/.test(name)) basePop = { min: 15, max: 50 };
  if (/lich|beholder|mind-flayer|aboleth|medusa|sphinx/.test(name)) basePop = { min: 1, max: 1 };
  
  // === GROWTH RATE ===
  let growthRate = 0.03;
  if (category === 'undead' || category === 'construct') growthRate = 0;
  if (/rat|ant|beetle|swarm|kobold|goblin/.test(name)) growthRate = 0.06;
  if (/dragon|giant|titan|tarrasque|lich|beholder/.test(name)) growthRate = 0.005;
  if (/orc|gnoll|hobgoblin/.test(name)) growthRate = 0.04;
  
  // === AGGRESSION ===
  let aggression = 5;
  if (/demon|devil|undead|shadow|wraith|vampire/.test(name)) aggression = 8;
  if (/dragon|giant|tarrasque|kraken|beholder/.test(name)) aggression = 9;
  if (/goblin|kobold|rat/.test(name)) aggression = 3;
  if (/orc|gnoll|bugbear|troll/.test(name)) aggression = 7;
  if (/sprite|pixie|pegasus|unicorn/.test(name)) aggression = 2;
  if (category === 'aberration') aggression = 7;
  
  // === TERRAIN ===
  let preferredTerrain: Terrain[] = ['forest', 'hills'];
  if (/ice|frost|snow|white-dragon|winter|mammoth|woolly|polar/.test(name)) preferredTerrain = ['mountains'];
  if (/fire|magma|flame|red-dragon|salamander|azer|efreeti/.test(name)) preferredTerrain = ['mountains', 'desert'];
  if (/swamp|marsh|black-dragon|toad|frog|crocodile|lizard|bullywug|hag/.test(name)) preferredTerrain = ['swamp'];
  if (/desert|sand|blue-dragon|scorpion|asp|cobra/.test(name)) preferredTerrain = ['desert'];
  if (/forest|wood|green|treant|dryad|owl|hawk|boar|elk/.test(name)) preferredTerrain = ['forest'];
  if (/mountain|stone|hill|cliff|cave|giant|dwarf|rock/.test(name)) preferredTerrain = ['mountains', 'hills'];
  if (/road|bandit|brigand/.test(name)) preferredTerrain = ['road', 'clear'];
  if (/underground|cave|deep|drow|duergar|hook|umber|mind-flayer|aboleth|purple-worm/.test(name)) preferredTerrain = ['mountains', 'hills'];
  // Aquatic creatures - coastal and ocean terrain
  if (/sea|ocean|aquatic|fish|shark|kraken|merfolk|triton|sahuagin|crab|octopus|eel|squid|whale|dolphin|sea-serpent|dragon-turtle|morkoth|laceddon|nixie|nereid|water-elemental|kelpie|sea-hag|sea-giant|giant-shark|giant-crab|giant-octopus/.test(name)) {
    preferredTerrain = ['coastal', 'ocean', 'reef'];
    category = 'aquatic';
  }
  // River creatures
  if (/river|pike|otter|beaver|crocodile|hippopotamus|nixie/.test(name)) preferredTerrain = ['river', 'swamp', 'coastal'];
  
  // === BREEDING SEASON ===
  let breedingSeason = [3, 4, 5]; // Spring
  if (category === 'undead' || category === 'construct' || category === 'elemental') breedingSeason = [];
  if (/rat|ant|beetle|roach/.test(name)) breedingSeason = [1,2,3,4,5,6,7,8,9,10,11,12]; // Year round
  if (/frost|ice|winter|white/.test(name)) breedingSeason = [1, 2]; // Winter
  if (/fire|flame|summer/.test(name)) breedingSeason = [6, 7, 8]; // Summer
  
  // === MIGRATORY ===
  let migratory = false;
  let migrationMonths: number[] | undefined;
  if (/orc|gnoll|wolf|dire-wolf|wyvern|harpy|bird|eagle|hawk/.test(name)) {
    migratory = true;
    migrationMonths = [10, 11];
  }
  
  // === FOOD CHAIN ===
  let foodChain = 5;
  if (/tarrasque|kraken|leviathan|elder-brain|titan/.test(name)) foodChain = 10;
  if (/dragon|beholder|mind-flayer|aboleth|giant|lich|nightwalker/.test(name)) foodChain = 9;
  if (/troll|ogre|wyvern|hydra|manticore|chimera/.test(name)) foodChain = 8;
  if (/orc|gnoll|bugbear|dire/.test(name)) foodChain = 6;
  if (/goblin|kobold|skeleton|zombie/.test(name)) foodChain = 3;
  if (/rat|ant|beetle/.test(name)) foodChain = 2;
  
  // === SOCIAL STRUCTURE ===
  let socialStructure: SpeciesConfig['socialStructure'] = 'pack';
  if (/horde|swarm|zombie|skeleton|rat|ant|beetle/.test(name)) socialStructure = 'horde';
  if (/dragon|lich|beholder|medusa|sphinx|titan|tarrasque/.test(name)) socialStructure = 'solitary';
  if (/ant|bee|wasp|spider|kobold/.test(name)) socialStructure = 'hive';
  if (/orc|goblin|hobgoblin|gnoll|lizardfolk|merfolk|drow|yuan-ti/.test(name)) socialStructure = 'tribe';
  
  return {
    category,
    basePop,
    growthRate,
    aggression,
    preferredTerrain,
    breedingSeason,
    migratory,
    migrationMonths,
    foodChain,
    socialStructure,
  };
}

// Get config - use specific if available, otherwise infer
function getSpeciesConfig(species: MonsterSpecies): SpeciesConfig {
  if (SPECIES_CONFIG[species]) {
    return SPECIES_CONFIG[species];
  }
  return inferSpeciesConfig(species);
}

const SPECIES_CONFIG: Record<MonsterSpecies, SpeciesConfig> = {
  // Humanoids - social, territorial
  'orc': {
    category: 'humanoid', basePop: { min: 20, max: 80 }, growthRate: 0.04,
    aggression: 7, preferredTerrain: ['hills', 'mountains', 'forest'],
    breedingSeason: [3, 4, 5], migratory: true, migrationMonths: [10, 11],
    foodChain: 6, socialStructure: 'tribe',
  },
  'goblin': {
    category: 'humanoid', basePop: { min: 30, max: 100 }, growthRate: 0.06,
    aggression: 4, preferredTerrain: ['forest', 'hills', 'swamp'],
    breedingSeason: [2, 3, 4, 5, 6], migratory: false,
    foodChain: 3, socialStructure: 'horde',
  },
  'kobold': {
    category: 'humanoid', basePop: { min: 40, max: 150 }, growthRate: 0.08,
    aggression: 3, preferredTerrain: ['hills', 'mountains'],
    breedingSeason: [1, 2, 3, 4, 5, 6], migratory: false,
    foodChain: 2, socialStructure: 'hive',
  },
  'gnoll': {
    category: 'humanoid', basePop: { min: 15, max: 50 }, growthRate: 0.03,
    aggression: 8, preferredTerrain: ['desert', 'clear'],
    breedingSeason: [4, 5], migratory: true, migrationMonths: [11, 12, 1],
    foodChain: 7, socialStructure: 'pack',
  },
  'hobgoblin': {
    category: 'humanoid', basePop: { min: 15, max: 60 }, growthRate: 0.03,
    aggression: 6, preferredTerrain: ['hills', 'forest'],
    breedingSeason: [3, 4, 5], migratory: false,
    foodChain: 6, socialStructure: 'tribe',
  },
  'bugbear': {
    category: 'humanoid', basePop: { min: 5, max: 20 }, growthRate: 0.02,
    aggression: 7, preferredTerrain: ['forest', 'hills'],
    breedingSeason: [4, 5], migratory: false,
    foodChain: 6, socialStructure: 'pack',
  },
  'lizardfolk': {
    category: 'humanoid', basePop: { min: 20, max: 70 }, growthRate: 0.03,
    aggression: 5, preferredTerrain: ['swamp'],
    breedingSeason: [5, 6, 7], migratory: false,
    foodChain: 5, socialStructure: 'tribe',
  },
  
  // Undead - don't breed, grow through death
  'skeleton': {
    category: 'undead', basePop: { min: 10, max: 50 }, growthRate: 0,
    aggression: 8, preferredTerrain: ['swamp', 'mountains', 'hills'],
    breedingSeason: [], migratory: false,
    foodChain: 4, socialStructure: 'horde',
  },
  'zombie': {
    category: 'undead', basePop: { min: 5, max: 30 }, growthRate: 0,
    aggression: 9, preferredTerrain: ['swamp', 'forest'],
    breedingSeason: [], migratory: false,
    foodChain: 3, socialStructure: 'horde',
  },
  'ghoul': {
    category: 'undead', basePop: { min: 3, max: 15 }, growthRate: 0.01,
    aggression: 9, preferredTerrain: ['swamp', 'forest'],
    breedingSeason: [], migratory: false,
    foodChain: 5, socialStructure: 'pack',
  },
  'wight': {
    category: 'undead', basePop: { min: 1, max: 5 }, growthRate: 0,
    aggression: 8, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [], migratory: false,
    foodChain: 7, socialStructure: 'solitary',
  },
  'wraith': {
    category: 'undead', basePop: { min: 1, max: 3 }, growthRate: 0,
    aggression: 9, preferredTerrain: ['mountains', 'swamp'],
    breedingSeason: [], migratory: false,
    foodChain: 8, socialStructure: 'solitary',
  },
  'vampire-spawn': {
    category: 'undead', basePop: { min: 1, max: 5 }, growthRate: 0.005,
    aggression: 7, preferredTerrain: ['forest', 'hills'],
    breedingSeason: [], migratory: false,
    foodChain: 8, socialStructure: 'pack',
  },
  
  // Beasts - natural ecology
  'wolf': {
    category: 'beast', basePop: { min: 5, max: 20 }, growthRate: 0.04,
    aggression: 5, preferredTerrain: ['forest', 'hills', 'clear'],
    breedingSeason: [2, 3], migratory: true, migrationMonths: [11, 12],
    foodChain: 5, socialStructure: 'pack',
  },
  'dire-wolf': {
    category: 'beast', basePop: { min: 3, max: 12 }, growthRate: 0.03,
    aggression: 7, preferredTerrain: ['forest', 'mountains'],
    breedingSeason: [2, 3], migratory: true, migrationMonths: [11, 12],
    foodChain: 7, socialStructure: 'pack',
  },
  'bear': {
    category: 'beast', basePop: { min: 2, max: 8 }, growthRate: 0.02,
    aggression: 4, preferredTerrain: ['forest', 'mountains'],
    breedingSeason: [5, 6], migratory: false,
    foodChain: 7, socialStructure: 'solitary',
  },
  'giant-spider': {
    category: 'beast', basePop: { min: 10, max: 40 }, growthRate: 0.05,
    aggression: 6, preferredTerrain: ['forest', 'swamp'],
    breedingSeason: [4, 5, 6], migratory: false,
    foodChain: 5, socialStructure: 'hive',
  },
  'giant-rat': {
    category: 'beast', basePop: { min: 20, max: 100 }, growthRate: 0.1,
    aggression: 3, preferredTerrain: ['swamp', 'forest'],
    breedingSeason: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], migratory: false,
    foodChain: 2, socialStructure: 'horde',
  },
  'worg': {
    category: 'beast', basePop: { min: 5, max: 15 }, growthRate: 0.03,
    aggression: 7, preferredTerrain: ['forest', 'hills'],
    breedingSeason: [3, 4], migratory: false,
    foodChain: 6, socialStructure: 'pack',
  },
  
  // Dragons - apex, solitary
  'young-dragon': {
    category: 'dragon', basePop: { min: 1, max: 1 }, growthRate: 0,
    aggression: 8, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [], migratory: false,
    foodChain: 10, socialStructure: 'solitary',
  },
  'drake': {
    category: 'dragon', basePop: { min: 1, max: 3 }, growthRate: 0.01,
    aggression: 7, preferredTerrain: ['mountains', 'desert'],
    breedingSeason: [6, 7], migratory: false,
    foodChain: 8, socialStructure: 'solitary',
  },
  'wyvern': {
    category: 'dragon', basePop: { min: 1, max: 4 }, growthRate: 0.01,
    aggression: 8, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [5, 6], migratory: true, migrationMonths: [10, 11],
    foodChain: 8, socialStructure: 'solitary',
  },
  
  // Giants
  'ogre': {
    category: 'giant', basePop: { min: 2, max: 8 }, growthRate: 0.02,
    aggression: 7, preferredTerrain: ['hills', 'forest', 'mountains'],
    breedingSeason: [4, 5], migratory: false,
    foodChain: 7, socialStructure: 'pack',
  },
  'troll': {
    category: 'giant', basePop: { min: 1, max: 4 }, growthRate: 0.015,
    aggression: 8, preferredTerrain: ['swamp', 'forest'],
    breedingSeason: [3, 4], migratory: false,
    foodChain: 8, socialStructure: 'solitary',
  },
  'hill-giant': {
    category: 'giant', basePop: { min: 1, max: 3 }, growthRate: 0.01,
    aggression: 6, preferredTerrain: ['hills'],
    breedingSeason: [5, 6], migratory: false,
    foodChain: 8, socialStructure: 'pack',
  },
  'frost-giant': {
    category: 'giant', basePop: { min: 1, max: 2 }, growthRate: 0.005,
    aggression: 7, preferredTerrain: ['mountains'],
    breedingSeason: [1, 2], migratory: false,
    foodChain: 9, socialStructure: 'tribe',
  },
  'fire-giant': {
    category: 'giant', basePop: { min: 1, max: 2 }, growthRate: 0.005,
    aggression: 8, preferredTerrain: ['mountains'],
    breedingSeason: [7, 8], migratory: false,
    foodChain: 9, socialStructure: 'tribe',
  },
  
  // Others
  'harpy': {
    category: 'beast', basePop: { min: 3, max: 12 }, growthRate: 0.03,
    aggression: 6, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [4, 5], migratory: true, migrationMonths: [10, 11],
    foodChain: 5, socialStructure: 'pack',
  },
  'manticore': {
    category: 'beast', basePop: { min: 1, max: 2 }, growthRate: 0.01,
    aggression: 9, preferredTerrain: ['mountains', 'desert'],
    breedingSeason: [6], migratory: false,
    foodChain: 8, socialStructure: 'solitary',
  },
  'griffon': {
    category: 'beast', basePop: { min: 2, max: 6 }, growthRate: 0.02,
    aggression: 5, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [4, 5], migratory: false,
    foodChain: 7, socialStructure: 'pack',
  },
  'basilisk': {
    category: 'beast', basePop: { min: 1, max: 2 }, growthRate: 0.005,
    aggression: 7, preferredTerrain: ['desert', 'hills'],
    breedingSeason: [7, 8], migratory: false,
    foodChain: 7, socialStructure: 'solitary',
  },
  'medusa': {
    category: 'aberration', basePop: { min: 1, max: 1 }, growthRate: 0,
    aggression: 6, preferredTerrain: ['mountains', 'hills'],
    breedingSeason: [], migratory: false,
    foodChain: 7, socialStructure: 'solitary',
  },
  'minotaur': {
    category: 'beast', basePop: { min: 1, max: 3 }, growthRate: 0.01,
    aggression: 8, preferredTerrain: ['hills', 'mountains'],
    breedingSeason: [5, 6], migratory: false,
    foodChain: 7, socialStructure: 'solitary',
  },
};

// ============================================================================
// POPULATION GENERATION
// ============================================================================

export function generatePopulation(
  rng: Random,
  species: MonsterSpecies,
  hexCoord: HexCoord,
  terrain: Terrain,
  worldTime: Date,
): MonsterPopulation {
  const config = getSpeciesConfig(species);
  const basePop = config.basePop.min + rng.int(config.basePop.max - config.basePop.min);
  
  return {
    id: `pop-${species}-${Date.now()}-${rng.int(10000)}`,
    species,
    category: config.category,
    hexCoord,
    territoryName: `hex:${hexCoord.q},${hexCoord.r}`,
    preferredTerrain: config.preferredTerrain,
    population: basePop,
    maxPopulation: Math.floor(basePop * (1.5 + rng.next())), // 150-250% of starting
    growthRate: config.growthRate,
    aggression: config.aggression + rng.int(3) - 1, // ±1 variance
    territorialRadius: config.socialStructure === 'solitary' ? 1 : 
                       config.socialStructure === 'pack' ? 2 : 3,
    nomadic: config.migratory,
    breedingSeason: config.breedingSeason,
    migrationSeason: config.migrationMonths,
    lastBreeding: worldTime,
    recentLosses: 0,
    recentHunting: 0,
    morale: 0,
    roomsClaimed: 0,
  };
}

// ============================================================================
// BREEDING & POPULATION GROWTH
// ============================================================================

export function tickBreeding(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  const currentMonth = worldTime.getUTCMonth() + 1; // 1-12
  
  for (const pop of ecology.populations) {
    if (pop.population <= 0) continue;
    
    // Check if it's breeding season
    if (!pop.breedingSeason.includes(currentMonth)) continue;
    
    // Only breed once per month
    const lastBreedMonth = new Date(pop.lastBreeding).getUTCMonth() + 1;
    const lastBreedYear = new Date(pop.lastBreeding).getUTCFullYear();
    if (lastBreedMonth === currentMonth && lastBreedYear === worldTime.getUTCFullYear()) continue;
    
    // Calculate growth
    let growth = pop.growthRate;
    
    // Modifiers
    if (pop.morale > 0) growth += pop.morale / 100; // Better morale = more breeding
    if (pop.recentLosses > pop.population * 0.2) growth -= 0.02; // Heavy losses reduce breeding
    if (pop.population >= pop.maxPopulation * 0.9) growth *= 0.5; // Near capacity slows growth
    
    // Apex predators suppress prey breeding
    const predators = ecology.populations.filter(p => 
      p.id !== pop.id &&
      getSpeciesConfig(p.species).foodChain > getSpeciesConfig(pop.species).foodChain &&
      hexDistance(p.hexCoord, pop.hexCoord) <= 2
    );
    if (predators.length > 0) growth *= 0.7;
    
    // Apply growth
    const offspring = Math.max(0, Math.floor(pop.population * growth));
    if (offspring > 0) {
      pop.population = Math.min(pop.maxPopulation, pop.population + offspring);
      pop.lastBreeding = worldTime;
      
      // Only log significant breeding events
      if (offspring >= 5 || pop.species === 'young-dragon') {
        const config = getSpeciesConfig(pop.species);
        logs.push({
          category: 'road',
          summary: `${pop.species} population swells near ${pop.territoryName}`,
          details: `${offspring} new ${pop.species}s emerge. The ${config.socialStructure} grows stronger. Travelers beware.`,
          location: pop.territoryName,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
  }
  
  return logs;
}

// ============================================================================
// MIGRATION
// ============================================================================

export function tickMigration(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  const currentMonth = worldTime.getUTCMonth() + 1;
  
  // Process ongoing migrations
  for (const migration of ecology.migrations) {
    if (new Date(migration.arrivesAt) <= worldTime) {
      const pop = ecology.populations.find(p => p.id === migration.populationId);
      if (pop) {
        pop.hexCoord = migration.toHex;
        pop.territoryName = `hex:${migration.toHex.q},${migration.toHex.r}`;
        pop.lastMigration = worldTime;
        
        // Find nearest settlement
        const nearestSettlement = findNearestSettlement(migration.toHex, world);
        
        logs.push({
          category: 'road',
          summary: `${pop.species} arrive in new territory`,
          details: `A ${getSpeciesConfig(pop.species).socialStructure} of ${pop.population} ${pop.species}s completes their migration. ${nearestSettlement ? `The people of ${nearestSettlement.name} grow uneasy.` : ''}`,
          location: pop.territoryName,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        // Affect nearest settlement mood
        if (nearestSettlement) {
          const sState = getSettlementState(world, nearestSettlement.name);
          sState.safety = Math.max(-10, sState.safety - 2);
          nearestSettlement.mood = Math.max(-5, nearestSettlement.mood - 1);
        }
      }
    }
  }
  
  // Remove completed migrations
  ecology.migrations = ecology.migrations.filter(m => new Date(m.arrivesAt) > worldTime);
  
  // Check for new migrations
  for (const pop of ecology.populations) {
    if (!pop.nomadic || pop.population <= 0) continue;
    if (!pop.migrationSeason?.includes(currentMonth)) continue;
    
    // Already migrating?
    if (ecology.migrations.some(m => m.populationId === pop.id)) continue;
    
    // Recently migrated?
    if (pop.lastMigration) {
      const monthsSinceMigration = (worldTime.getTime() - new Date(pop.lastMigration).getTime()) / (30 * 24 * 60 * 60 * 1000);
      if (monthsSinceMigration < 6) continue;
    }
    
    // Decide on migration
    let shouldMigrate = false;
    let reason = '';
    
    // Winter migration (orcs, gnolls go south)
    if (currentMonth >= 10 || currentMonth <= 2) {
      shouldMigrate = true;
      reason = 'seeking warmer territories for winter';
    }
    
    // Overpopulation migration
    if (pop.population >= pop.maxPopulation * 0.9) {
      shouldMigrate = true;
      reason = 'seeking new hunting grounds';
    }
    
    // Pressure from apex predators
    const threats = ecology.populations.filter(p =>
      p.id !== pop.id &&
      getSpeciesConfig(p.species).foodChain > getSpeciesConfig(pop.species).foodChain + 2 &&
      hexDistance(p.hexCoord, pop.hexCoord) <= 2
    );
    if (threats.length > 0) {
      shouldMigrate = true;
      reason = `fleeing from ${threats[0].species}`;
    }
    
    if (shouldMigrate && rng.chance(0.3)) {
      // Find destination (1-3 hexes away)
      const destQ = pop.hexCoord.q + rng.int(7) - 3;
      const destR = pop.hexCoord.r + rng.int(7) - 3;
      const destination: HexCoord = {
        q: Math.max(0, Math.min(world.width - 1, destQ)),
        r: Math.max(0, Math.min(world.height - 1, destR)),
      };
      
      if (destination.q === pop.hexCoord.q && destination.r === pop.hexCoord.r) continue;
      
      // Migration takes 1-4 weeks (168-672 hours)
      const migrationHours = 168 + rng.int(504);
      
      ecology.migrations.push({
        populationId: pop.id,
        fromHex: { ...pop.hexCoord },
        toHex: destination,
        startedAt: worldTime,
        arrivesAt: new Date(worldTime.getTime() + migrationHours * 60 * 60 * 1000),
        reason,
      });
      
      const daysApprox = Math.round(migrationHours / 24);
      logs.push({
        category: 'road',
        summary: `${pop.species} begin migration`,
        details: `A ${getSpeciesConfig(pop.species).socialStructure} of ${pop.population} ${pop.species}s departs, ${reason}. They will travel for approximately ${daysApprox} days.`,
        location: pop.territoryName,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  return logs;
}

// ============================================================================
// APEX PREDATOR EFFECTS
// ============================================================================

export function tickApexPredators(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  antagonists: Antagonist[],
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Find apex predators (food chain 8+)
  const apexPredators = ecology.populations.filter(p => 
    getSpeciesConfig(p.species).foodChain >= 8 && p.population > 0
  );
  
  for (const apex of apexPredators) {
    // Apex predators hunt other populations
    const prey = ecology.populations.filter(p =>
      p.id !== apex.id &&
      getSpeciesConfig(p.species).foodChain < getSpeciesConfig(apex.species).foodChain - 1 &&
      hexDistance(p.hexCoord, apex.hexCoord) <= apex.territorialRadius &&
      p.population > 0
    );
    
    if (prey.length > 0 && rng.chance(0.1)) {
      const target = rng.pick(prey);
      const kills = Math.min(target.population, 1 + rng.int(Math.ceil(apex.population / 2)));
      
      target.population -= kills;
      target.recentLosses += kills;
      target.morale = Math.max(-10, target.morale - 2);
      apex.recentHunting += kills;
      apex.morale = Math.min(10, apex.morale + 1);
      
      if (kills >= 5) {
        logs.push({
          category: 'road',
          summary: `${apex.species} hunts ${target.species}`,
          details: `The ${apex.species} of ${apex.territoryName} feast on ${kills} ${target.species}s. The balance of power is maintained.`,
          location: apex.territoryName,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    }
    
    // Link to antagonists
    const nearbyAntagonist = antagonists.find(a =>
      a.alive &&
      a.type === 'dragon' &&
      a.territory === findNearestSettlement(apex.hexCoord, world)?.name
    );
    
    if (nearbyAntagonist && !apex.leaderId && apex.species.includes('dragon')) {
      apex.leaderId = nearbyAntagonist.id;
    }
  }
  
  return logs;
}

// ============================================================================
// TERRITORIAL DISPUTES
// ============================================================================

export function tickTerritorialDisputes(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Find overlapping territories
  for (let i = 0; i < ecology.populations.length; i++) {
    const pop1 = ecology.populations[i];
    if (pop1.population <= 0) continue;
    
    for (let j = i + 1; j < ecology.populations.length; j++) {
      const pop2 = ecology.populations[j];
      if (pop2.population <= 0) continue;
      
      // Same species don't fight each other (usually)
      if (pop1.species === pop2.species) continue;
      
      // Check for territorial overlap
      const distance = hexDistance(pop1.hexCoord, pop2.hexCoord);
      const overlap = Math.max(pop1.territorialRadius, pop2.territorialRadius) - distance;
      
      if (overlap <= 0) continue;
      
      // One serves the other?
      if (pop1.tributeTo === pop2.id || pop2.tributeTo === pop1.id) continue;
      
      // Check for existing dispute
      const existingDispute = ecology.territorialDisputes.find(d =>
        (d.population1Id === pop1.id && d.population2Id === pop2.id) ||
        (d.population1Id === pop2.id && d.population2Id === pop1.id)
      );
      
      if (existingDispute) {
        // Escalate or resolve
        if (rng.chance(0.2)) {
          existingDispute.intensity++;
          
          if (existingDispute.intensity >= 5) {
            // Battle!
            const pop1Strength = pop1.population * (getSpeciesConfig(pop1.species).foodChain + pop1.morale);
            const pop2Strength = pop2.population * (getSpeciesConfig(pop2.species).foodChain + pop2.morale);
            
            const pop1Wins = (pop1Strength + rng.int(50)) > (pop2Strength + rng.int(50));
            const winner = pop1Wins ? pop1 : pop2;
            const loser = pop1Wins ? pop2 : pop1;
            
            // Casualties
            const loserLosses = Math.floor(loser.population * (0.2 + rng.next() * 0.3));
            const winnerLosses = Math.floor(winner.population * (0.05 + rng.next() * 0.15));
            
            loser.population -= loserLosses;
            loser.recentLosses += loserLosses;
            loser.morale -= 3;
            
            winner.population -= winnerLosses;
            winner.recentLosses += winnerLosses;
            winner.morale += 2;
            
            logs.push({
              category: 'road',
              summary: `${pop1.species} and ${pop2.species} clash`,
              details: `Territorial war erupts! The ${winner.species} triumph, but ${winnerLosses} fall. The ${loser.species} lose ${loserLosses} and retreat.`,
              location: `hex:${existingDispute.contestedHex.q},${existingDispute.contestedHex.r}`,
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
            
            // Loser might become tributary or flee
            if (loser.population < winner.population * 0.5 && rng.chance(0.4)) {
              loser.tributeTo = winner.id;
              logs.push({
                category: 'road',
                summary: `${loser.species} submit to ${winner.species}`,
                details: `The beaten ${loser.species} now serve their conquerors.`,
                location: loser.territoryName,
                worldTime,
                realTime: new Date(),
                seed: world.seed,
              });
            }
            
            // Remove dispute
            ecology.territorialDisputes = ecology.territorialDisputes.filter(d => d.id !== existingDispute.id);
          }
        }
      } else if (rng.chance(0.05)) {
        // New dispute
        ecology.territorialDisputes.push({
          id: `dispute-${Date.now()}`,
          population1Id: pop1.id,
          population2Id: pop2.id,
          contestedHex: pop1.hexCoord,
          startedAt: worldTime,
          intensity: 1,
        });
        
        if (rng.chance(0.3)) {
          logs.push({
            category: 'road',
            summary: `${pop1.species} and ${pop2.species} tensions rise`,
            details: `Two populations eye the same territory. Conflict seems inevitable.`,
            location: pop1.territoryName,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// DUNGEON REPOPULATION
// ============================================================================

export function tickDungeonEcology(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const dungeon of world.dungeons) {
    if (!dungeon.rooms || dungeon.rooms.length === 0) continue;
    
    // Count empty/cleared rooms
    const emptyRooms = dungeon.rooms.filter(r => r.type === 'empty').length;
    const totalRooms = dungeon.rooms.length;
    const exploredPct = (dungeon.explored ?? 0) / totalRooms;
    
    // Find existing population in this dungeon
    let dungeonPop = ecology.populations.find(p => p.dungeonId === dungeon.id);
    
    if (!dungeonPop && exploredPct > 0.5 && emptyRooms > 0) {
      // Dungeon is being cleared - new monsters might move in
      // Real-time: 2-8 weeks to repopulate
      if (rng.chance(0.01)) {
        const species = rng.pick(['goblin', 'kobold', 'orc', 'skeleton', 'giant-spider', 'giant-rat'] as MonsterSpecies[]);
        const newPop = generatePopulation(rng, species, dungeon.coord, 'hills', worldTime);
        newPop.dungeonId = dungeon.id;
        newPop.territoryName = dungeon.name;
        newPop.roomsClaimed = 1;
        
        ecology.populations.push(newPop);
        
        logs.push({
          category: 'dungeon',
          summary: `${species} move into ${dungeon.name}`,
          details: `The empty halls of ${dungeon.name} attract new inhabitants. The ${species} begin to claim the depths.`,
          location: dungeon.name,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
    } else if (dungeonPop && dungeonPop.population > 0) {
      // Existing population expands
      // Real-time: ~1 room per week if conditions are good
      if (dungeonPop.roomsClaimed < emptyRooms && rng.chance(0.006)) {
        dungeonPop.roomsClaimed++;
        
        // Mark a room as lair
        const emptyRoom = dungeon.rooms.find(r => r.type === 'empty');
        if (emptyRoom) {
          emptyRoom.type = 'lair';
        }
        
        if (rng.chance(0.3)) {
          logs.push({
            category: 'dungeon',
            summary: `${dungeonPop.species} spread deeper into ${dungeon.name}`,
            details: `Another chamber falls under their control. The dungeon grows more dangerous.`,
            location: dungeon.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
  }
  
  return logs;
}

// ============================================================================
// MONSTER-FACTION ALLIANCES
// ============================================================================

export function tickMonsterAlliances(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  antagonists: Antagonist[],
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Check for powerful antagonists seeking monster allies
  for (const antagonist of antagonists) {
    if (!antagonist.alive) continue;
    
    // Only certain types recruit monsters
    if (!['orc-warlord', 'dark-wizard', 'necromancer', 'dragon', 'demon-bound'].includes(antagonist.type)) continue;
    
    // Find nearby compatible populations
    const nearbyPops = ecology.populations.filter(p => {
      if (p.population <= 0 || p.leaderId) return false;
      
      // Check if in same territory
      const nearestSettlement = findNearestSettlement(p.hexCoord, world);
      if (nearestSettlement?.name !== antagonist.territory) return false;
      
      // Species compatibility
      if (antagonist.type === 'orc-warlord' && !['orc', 'goblin', 'hobgoblin', 'worg'].includes(p.species)) return false;
      if (antagonist.type === 'necromancer' && p.category !== 'undead') return false;
      if (antagonist.type === 'dragon' && !['kobold', 'drake', 'wyvern'].includes(p.species)) return false;
      
      return true;
    });
    
    for (const pop of nearbyPops) {
      if (rng.chance(0.02)) {
        pop.leaderId = antagonist.id;
        
        logs.push({
          category: 'faction',
          summary: `${pop.species} rally to ${antagonist.name}`,
          details: `The ${pop.species} of ${pop.territoryName} swear allegiance to ${antagonist.name} ${antagonist.epithet}. Their numbers swell the villain's forces.`,
          location: antagonist.territory,
          actors: [antagonist.name],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        antagonist.followers = (antagonist.followers ?? 0) + pop.population;
      }
    }
  }
  
  return logs;
}

// ============================================================================
// EXTINCTION & POPULATION COLLAPSE
// ============================================================================

export function tickPopulationHealth(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const pop of ecology.populations) {
    // Natural attrition
    if (pop.recentLosses > pop.population * 0.3) {
      // Heavy losses cause morale collapse
      pop.morale = Math.max(-10, pop.morale - 2);
    }
    
    // Starvation (if hunting was poor)
    if (pop.category !== 'undead' && pop.category !== 'construct') {
      if (pop.recentHunting < pop.population * 0.1 && rng.chance(0.1)) {
        const starvation = Math.floor(pop.population * 0.05);
        pop.population -= starvation;
        pop.morale -= 1;
      }
    }
    
    // Reset monthly counters (on the 1st)
    if (worldTime.getUTCDate() === 1) {
      pop.recentLosses = 0;
      pop.recentHunting = 0;
    }
    
    // Check for extinction
    if (pop.population <= 0) {
      ecology.extinctions.push({
        species: pop.species,
        location: pop.territoryName,
        timestamp: worldTime,
        cause: pop.recentLosses > 0 ? 'combat losses' : 'starvation or disease',
      });
      
      logs.push({
        category: 'road',
        summary: `${pop.species} wiped out in ${pop.territoryName}`,
        details: `The last of the ${pop.species} have fallen. The region grows quieter—for now.`,
        location: pop.territoryName,
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // Remove extinct populations
  ecology.populations = ecology.populations.filter(p => p.population > 0);
  
  return logs;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function hexDistance(a: HexCoord, b: HexCoord): number {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

function findNearestSettlement(hex: HexCoord, world: WorldState): Settlement | undefined {
  let nearest: Settlement | undefined;
  let nearestDist = Infinity;
  
  for (const settlement of world.settlements) {
    const dist = hexDistance(hex, settlement.coord);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = settlement;
    }
  }
  
  return nearest;
}

// ============================================================================
// MAIN TICK FUNCTION
// ============================================================================

export function tickEcology(
  rng: Random,
  ecology: EcologyState,
  world: WorldState,
  antagonists: Antagonist[],
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Breeding (seasonal)
  logs.push(...tickBreeding(rng, ecology, world, worldTime));
  
  // Migration (seasonal)
  logs.push(...tickMigration(rng, ecology, world, worldTime));
  
  // Apex predator hunting
  logs.push(...tickApexPredators(rng, ecology, world, antagonists, worldTime));
  
  // Territorial disputes
  logs.push(...tickTerritorialDisputes(rng, ecology, world, worldTime));
  
  // Dungeon repopulation
  logs.push(...tickDungeonEcology(rng, ecology, world, worldTime));
  
  // Monster-antagonist alliances
  logs.push(...tickMonsterAlliances(rng, ecology, world, antagonists, worldTime));
  
  // Population health and extinction
  logs.push(...tickPopulationHealth(rng, ecology, world, worldTime));
  
  return logs;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function createEcologyState(): EcologyState {
  return {
    populations: [],
    extinctions: [],
    migrations: [],
    territorialDisputes: [],
  };
}

export function seedEcology(
  rng: Random,
  world: WorldState,
  worldTime: Date,
): EcologyState {
  const ecology = createEcologyState();
  
  // Seed populations based on terrain
  for (const hex of world.hexes) {
    // Skip settlements
    const hasSettlement = world.settlements.some(s => 
      s.coord.q === hex.coord.q && s.coord.r === hex.coord.r
    );
    if (hasSettlement) continue;
    
    // Species appropriate for this terrain
    const suitableSpecies = ALL_SPECIES.filter(species => 
      getSpeciesConfig(species).preferredTerrain.includes(hex.terrain)
    );
    
    if (suitableSpecies.length === 0) continue;
    
    // 30% chance of a population per hex
    if (rng.chance(0.3)) {
      const species = rng.pick(suitableSpecies);
      const pop = generatePopulation(rng, species, hex.coord, hex.terrain, worldTime);
      ecology.populations.push(pop);
    }
    
    // Small chance of second population (ecological competition)
    if (rng.chance(0.1)) {
      const species = rng.pick(suitableSpecies);
      const pop = generatePopulation(rng, species, hex.coord, hex.terrain, worldTime);
      pop.population = Math.floor(pop.population * 0.5); // Smaller secondary population
      ecology.populations.push(pop);
    }
  }
  
  // Seed dungeon populations
  for (const dungeon of world.dungeons) {
    const species = rng.pick(['goblin', 'orc', 'skeleton', 'kobold', 'giant-rat'] as MonsterSpecies[]);
    const pop = generatePopulation(rng, species, dungeon.coord, 'hills', worldTime);
    pop.dungeonId = dungeon.id;
    pop.territoryName = dungeon.name;
    pop.roomsClaimed = Math.min(dungeon.rooms?.length ?? 1, 3 + rng.int(5));
    ecology.populations.push(pop);
  }
  
  return ecology;
}

