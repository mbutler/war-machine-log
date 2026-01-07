/**
 * BECMI TREASURE TYPE SYSTEM
 * 
 * Implements the classic treasure types A-V with proper coin distributions,
 * gem chances, jewelry, and magic items. When hoards are found:
 * - Wealth enters the world economy
 * - Large influxes cause local price inflation
 * - Magic items become tracked world elements
 * - Notable items attract attention (thieves, collectors, dragons)
 * 
 * REAL-TIME PACING:
 * - Spending a hoard: 1-4 weeks to liquidate without crashing prices
 * - Magic item identification: 1-7 days
 * - Rumors of treasure: spread over 1-2 weeks
 * - Price inflation from gold influx: peaks in 1 week, normalizes over 1-2 months
 */

import { Random } from './rng.ts';
import { WorldState, LogEntry, Settlement, Good, PriceTrend } from './types.ts';
import { MonsterSpecies } from './ecology.ts';
import { queueConsequence } from './consequences.ts';
import { getSettlementState } from './causality.ts';
import { createTreasureRumor, spreadTreasureRumor, TreasureRumor, logRumor } from './rumors.ts';

// ============================================================================
// TREASURE TYPES (A-V from BECMI)
// ============================================================================

export type TreasureType = 
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V'
  | 'Nil';  // No treasure

// Coin types and their relative values
export type CoinType = 'cp' | 'sp' | 'ep' | 'gp' | 'pp';
const COIN_VALUE: Record<CoinType, number> = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 5 };

export interface TreasureTypeConfig {
  // Coin chances and amounts (multiply by 1000 for lair, or use as-is for individual)
  coins: {
    cp?: { chance: number; dice: string };
    sp?: { chance: number; dice: string };
    ep?: { chance: number; dice: string };
    gp?: { chance: number; dice: string };
    pp?: { chance: number; dice: string };
  };
  // Gems and jewelry
  gems?: { chance: number; count: string };
  jewelry?: { chance: number; count: string };
  // Magic items
  magic?: { chance: number; count: number; types?: MagicItemCategory[] };
  // Is this an individual or lair treasure?
  isLair: boolean;
  // Typical gold value range for quick generation
  typicalValue: { min: number; max: number };
}

// ============================================================================
// TREASURE TYPE DEFINITIONS (Simplified from BECMI tables)
// ============================================================================

const TREASURE_TYPES: Record<TreasureType, TreasureTypeConfig> = {
  'A': { // Dragon's hoard - massive
    coins: { 
      cp: { chance: 0.25, dice: '1d6*1000' },
      sp: { chance: 0.30, dice: '1d6*1000' },
      ep: { chance: 0.20, dice: '1d4*1000' },
      gp: { chance: 0.35, dice: '2d6*1000' },
      pp: { chance: 0.25, dice: '1d2*1000' },
    },
    gems: { chance: 0.50, count: '6d6' },
    jewelry: { chance: 0.50, count: '6d6' },
    magic: { chance: 0.30, count: 3 },
    isLair: true,
    typicalValue: { min: 10000, max: 50000 },
  },
  'B': { // Large humanoid lair
    coins: {
      cp: { chance: 0.50, dice: '1d8*1000' },
      sp: { chance: 0.25, dice: '1d6*1000' },
      ep: { chance: 0.25, dice: '1d4*1000' },
      gp: { chance: 0.25, dice: '1d3*1000' },
    },
    gems: { chance: 0.25, count: '1d6' },
    jewelry: { chance: 0.25, count: '1d6' },
    magic: { chance: 0.10, count: 1, types: ['weapon', 'armor'] },
    isLair: true,
    typicalValue: { min: 2000, max: 10000 },
  },
  'C': { // Average humanoid lair
    coins: {
      cp: { chance: 0.20, dice: '1d12*1000' },
      sp: { chance: 0.30, dice: '1d4*1000' },
      ep: { chance: 0.10, dice: '1d4*1000' },
    },
    gems: { chance: 0.25, count: '1d4' },
    jewelry: { chance: 0.25, count: '1d4' },
    magic: { chance: 0.10, count: 2 },
    isLair: true,
    typicalValue: { min: 1000, max: 5000 },
  },
  'D': { // Dungeon treasure room
    coins: {
      cp: { chance: 0.10, dice: '1d8*1000' },
      sp: { chance: 0.15, dice: '1d12*1000' },
      gp: { chance: 0.60, dice: '1d6*1000' },
    },
    gems: { chance: 0.30, count: '1d8' },
    jewelry: { chance: 0.30, count: '1d8' },
    magic: { chance: 0.15, count: 2, types: ['potion', 'scroll'] },
    isLair: true,
    typicalValue: { min: 2000, max: 8000 },
  },
  'E': { // Undead lair
    coins: {
      cp: { chance: 0.05, dice: '1d10*1000' },
      sp: { chance: 0.30, dice: '1d12*1000' },
      ep: { chance: 0.25, dice: '1d4*1000' },
      gp: { chance: 0.25, dice: '1d8*1000' },
    },
    gems: { chance: 0.10, count: '1d10' },
    jewelry: { chance: 0.10, count: '1d10' },
    magic: { chance: 0.25, count: 3, types: ['scroll', 'ring', 'wand'] },
    isLair: true,
    typicalValue: { min: 3000, max: 12000 },
  },
  'F': { // Dragon treasure
    coins: {
      sp: { chance: 0.10, dice: '2d10*1000' },
      ep: { chance: 0.20, dice: '1d8*1000' },
      gp: { chance: 0.45, dice: '1d12*1000' },
      pp: { chance: 0.30, dice: '1d3*1000' },
    },
    gems: { chance: 0.20, count: '2d12' },
    jewelry: { chance: 0.10, count: '1d12' },
    magic: { chance: 0.30, count: 3, types: ['potion', 'scroll', 'weapon'] },
    isLair: true,
    typicalValue: { min: 5000, max: 25000 },
  },
  'G': { // Dwarf/gnome treasure
    coins: {
      gp: { chance: 0.75, dice: '10d4*1000' },
      pp: { chance: 0.50, dice: '1d6*1000' },
    },
    gems: { chance: 0.25, count: '3d6' },
    jewelry: { chance: 0.25, count: '1d10' },
    magic: { chance: 0.35, count: 4, types: ['weapon', 'armor', 'misc'] },
    isLair: true,
    typicalValue: { min: 8000, max: 40000 },
  },
  'H': { // Huge dragon hoard
    coins: {
      cp: { chance: 0.25, dice: '3d8*1000' },
      sp: { chance: 0.50, dice: '1d100*1000' },
      ep: { chance: 0.50, dice: '10d4*1000' },
      gp: { chance: 0.50, dice: '10d6*1000' },
      pp: { chance: 0.25, dice: '5d4*1000' },
    },
    gems: { chance: 0.50, count: '1d100' },
    jewelry: { chance: 0.50, count: '10d4' },
    magic: { chance: 0.15, count: 4 },
    isLair: true,
    typicalValue: { min: 25000, max: 100000 },
  },
  'I': { // Gems only
    gems: { chance: 0.50, count: '2d6' },
    jewelry: { chance: 0.50, count: '2d6' },
    magic: { chance: 0.15, count: 1 },
    coins: {},
    isLair: true,
    typicalValue: { min: 1000, max: 5000 },
  },
  'J': { // Copper individual
    coins: { cp: { chance: 1.0, dice: '3d8' } },
    isLair: false,
    typicalValue: { min: 1, max: 3 },
  },
  'K': { // Silver individual
    coins: { sp: { chance: 1.0, dice: '3d6' } },
    isLair: false,
    typicalValue: { min: 1, max: 5 },
  },
  'L': { // Electrum individual
    coins: { ep: { chance: 1.0, dice: '2d6' } },
    isLair: false,
    typicalValue: { min: 3, max: 10 },
  },
  'M': { // Gold individual
    coins: { gp: { chance: 1.0, dice: '2d4' } },
    isLair: false,
    typicalValue: { min: 2, max: 10 },
  },
  'N': { // Platinum individual
    coins: { pp: { chance: 1.0, dice: '1d6' } },
    isLair: false,
    typicalValue: { min: 5, max: 30 },
  },
  'O': { // Mixed individual
    coins: { 
      cp: { chance: 0.25, dice: '1d4*10' },
      sp: { chance: 0.25, dice: '1d3*10' },
    },
    isLair: false,
    typicalValue: { min: 5, max: 20 },
  },
  'P': { // Mixed individual
    coins: { 
      cp: { chance: 0.30, dice: '4d6' },
      sp: { chance: 0.30, dice: '3d6' },
      ep: { chance: 0.10, dice: '2d6' },
    },
    isLair: false,
    typicalValue: { min: 5, max: 25 },
  },
  'Q': { // Gems individual
    gems: { chance: 0.50, count: '1d4' },
    coins: {},
    isLair: false,
    typicalValue: { min: 50, max: 200 },
  },
  'R': { // Mixed valuables individual
    coins: { gp: { chance: 0.40, dice: '2d6' } },
    gems: { chance: 0.40, count: '1d4' },
    jewelry: { chance: 0.50, count: '1d4' },
    isLair: false,
    typicalValue: { min: 100, max: 500 },
  },
  'S': { // Potion
    coins: {},
    magic: { chance: 0.40, count: 1, types: ['potion'] },
    isLair: false,
    typicalValue: { min: 100, max: 300 },
  },
  'T': { // Scroll
    coins: {},
    magic: { chance: 0.50, count: 1, types: ['scroll'] },
    isLair: false,
    typicalValue: { min: 100, max: 500 },
  },
  'U': { // Magic item
    coins: {},
    gems: { chance: 0.10, count: '1d4' },
    jewelry: { chance: 0.10, count: '1d4' },
    magic: { chance: 0.70, count: 1 },
    isLair: false,
    typicalValue: { min: 500, max: 2000 },
  },
  'V': { // Major magic
    coins: {},
    magic: { chance: 0.85, count: 2 },
    isLair: false,
    typicalValue: { min: 1000, max: 5000 },
  },
  'Nil': {
    coins: {},
    isLair: false,
    typicalValue: { min: 0, max: 0 },
  },
};

// ============================================================================
// MAGIC ITEM TYPES
// ============================================================================

export type MagicItemCategory = 
  | 'weapon' | 'armor' | 'potion' | 'scroll' | 'ring' | 'wand' 
  | 'staff' | 'rod' | 'misc' | 'artifact';

export type MagicItemRarity = 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary' | 'artifact';

export interface MagicItem {
  id: string;
  name: string;
  category: MagicItemCategory;
  rarity: MagicItemRarity;
  bonus?: number;              // +1, +2, etc.
  cursed: boolean;
  identified: boolean;
  identifiedAt?: Date;
  value: number;               // Gold piece value
  properties: string[];        // Special abilities
  history?: string;            // Notable history
  ownerId?: string;            // Current owner (NPC, party, or settlement)
  location: string;            // Where it currently is
  discoveredAt?: Date;
  discoveredBy?: string;
}

// ============================================================================
// MAGIC ITEM TABLES
// ============================================================================

const WEAPON_NAMES = [
  'Longsword', 'Shortsword', 'Greatsword', 'Battleaxe', 'Warhammer',
  'Mace', 'Flail', 'Spear', 'Dagger', 'Bow', 'Crossbow', 'Halberd',
];

const WEAPON_PREFIXES = [
  'Flaming', 'Frost', 'Lightning', 'Venomous', 'Holy', 'Unholy',
  'Keen', 'Vorpal', 'Dancing', 'Defending', 'Disrupting', 'Seeking',
  'Giant-Slaying', 'Dragon-Slaying', 'Undead-Bane', 'Orc-Cleaver',
];

const ARMOR_NAMES = [
  'Chain Mail', 'Plate Mail', 'Shield', 'Leather Armor', 'Scale Mail',
  'Banded Mail', 'Splint Mail', 'Helm', 'Gauntlets', 'Boots',
];

const ARMOR_PREFIXES = [
  'Elven', 'Dwarven', 'Mithral', 'Adamantine', 'Ethereal', 'Reflecting',
  'Resistance', 'Fortification', 'Shadow', 'Silent', 'Flying',
];

const POTION_TYPES = [
  'Healing', 'Greater Healing', 'Supreme Healing', 'Giant Strength',
  'Flying', 'Invisibility', 'Speed', 'Fire Resistance', 'Cold Resistance',
  'Water Breathing', 'Gaseous Form', 'Diminution', 'Growth', 'Heroism',
  'Clairvoyance', 'ESP', 'Longevity', 'Poison', 'Delusion',
];

const SCROLL_TYPES = [
  'Fireball', 'Lightning Bolt', 'Dispel Magic', 'Protection from Evil',
  'Invisibility', 'Fly', 'Haste', 'Slow', 'Polymorph', 'Teleport',
  'Raise Dead', 'Remove Curse', 'Disintegrate', 'Meteor Swarm', 'Wish',
];

const RING_TYPES = [
  'Protection', 'Invisibility', 'Fire Resistance', 'Spell Storing',
  'Regeneration', 'Three Wishes', 'Telekinesis', 'X-Ray Vision',
  'Water Walking', 'Feather Falling', 'Spell Turning', 'Free Action',
  'Weakness', 'Contrariness', // Cursed
];

const WAND_TYPES = [
  'Magic Missiles', 'Lightning', 'Fire', 'Cold', 'Polymorph',
  'Paralysis', 'Fear', 'Illusion', 'Enemy Detection', 'Secret Door Detection',
  'Negation', 'Wonder',
];

const MISC_ITEMS = [
  'Bag of Holding', 'Boots of Speed', 'Boots of Elvenkind', 'Cloak of Elvenkind',
  'Cloak of Protection', 'Gauntlets of Ogre Power', 'Girdle of Giant Strength',
  'Helm of Telepathy', 'Rope of Climbing', 'Portable Hole', 'Decanter of Endless Water',
  'Eversmoking Bottle', 'Crystal Ball', 'Mirror of Life Trapping',
  'Carpet of Flying', 'Broom of Flying', 'Figurine of Wondrous Power',
  'Amulet of Proof Against Detection', 'Periapt of Health', 'Ioun Stone',
  'Horn of Blasting', 'Drums of Panic', 'Pipes of the Sewers',
  'Scarab of Protection', 'Medallion of ESP', 'Necklace of Fireballs',
  'Cube of Force', 'Sphere of Annihilation', 'Deck of Many Things',
];

// ============================================================================
// TREASURE GENERATION
// ============================================================================

export interface GeneratedTreasure {
  coins: Record<CoinType, number>;
  totalGoldValue: number;
  gems: GemJewel[];
  jewelry: GemJewel[];
  magicItems: MagicItem[];
  isHoard: boolean;
  treasureType: TreasureType;
}

export interface GemJewel {
  id: string;
  type: 'gem' | 'jewelry';
  description: string;
  value: number;
}

// Parse dice notation like "2d6*1000" or "3d8"
function rollDice(rng: Random, notation: string): number {
  const match = notation.match(/(\d+)d(\d+)(?:\*(\d+))?/);
  if (!match) return 0;
  
  const count = parseInt(match[1]);
  const sides = parseInt(match[2]);
  const multiplier = match[3] ? parseInt(match[3]) : 1;
  
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += 1 + rng.int(sides);
  }
  
  return total * multiplier;
}

// Generate a single gem or piece of jewelry
function generateGemJewel(rng: Random, type: 'gem' | 'jewelry'): GemJewel {
  const GEM_TYPES = [
    { name: 'agate', value: 10 }, { name: 'quartz', value: 10 },
    { name: 'turquoise', value: 10 }, { name: 'onyx', value: 50 },
    { name: 'amethyst', value: 100 }, { name: 'garnet', value: 100 },
    { name: 'pearl', value: 100 }, { name: 'jade', value: 100 },
    { name: 'aquamarine', value: 500 }, { name: 'topaz', value: 500 },
    { name: 'opal', value: 1000 }, { name: 'sapphire', value: 1000 },
    { name: 'emerald', value: 1000 }, { name: 'ruby', value: 5000 },
    { name: 'diamond', value: 5000 }, { name: 'star ruby', value: 10000 },
  ];
  
  const JEWELRY_TYPES = [
    { name: 'silver ring', value: 100 }, { name: 'gold ring', value: 200 },
    { name: 'silver bracelet', value: 200 }, { name: 'gold bracelet', value: 500 },
    { name: 'silver necklace', value: 300 }, { name: 'gold necklace', value: 1000 },
    { name: 'jeweled brooch', value: 500 }, { name: 'platinum tiara', value: 2000 },
    { name: 'gem-encrusted crown', value: 5000 }, { name: 'royal scepter', value: 10000 },
  ];
  
  const choices = type === 'gem' ? GEM_TYPES : JEWELRY_TYPES;
  const choice = rng.pick(choices);
  
  // Value variance ±50%
  const variance = 0.5 + rng.next();
  const value = Math.floor(choice.value * variance);
  
  return {
    id: rng.uid(type),
    type,
    description: type === 'gem' ? `a ${choice.name}` : `a ${choice.name}`,
    value,
  };
}

// Generate a magic item
export function generateMagicItem(
  rng: Random,
  category?: MagicItemCategory,
  worldTime?: Date,
  location?: string,
): MagicItem {
  // Random category if not specified
  if (!category) {
    const categories: MagicItemCategory[] = ['weapon', 'armor', 'potion', 'scroll', 'ring', 'wand', 'misc'];
    category = rng.pick(categories);
  }
  
  let name: string;
  let bonus: number | undefined;
  let value: number;
  let rarity: MagicItemRarity;
  let properties: string[] = [];
  const cursed = rng.chance(0.05);
  
  switch (category) {
    case 'weapon':
      const weaponBase = rng.pick(WEAPON_NAMES);
      bonus = rng.chance(0.5) ? 1 : rng.chance(0.7) ? 2 : rng.chance(0.85) ? 3 : rng.chance(0.95) ? 4 : 5;
      if (rng.chance(0.3)) {
        const prefix = rng.pick(WEAPON_PREFIXES);
        name = `${prefix} ${weaponBase} +${bonus}`;
        properties.push(prefix.toLowerCase());
      } else {
        name = `${weaponBase} +${bonus}`;
      }
      value = bonus * 1000 + (properties.length > 0 ? 2000 : 0);
      rarity = bonus >= 4 ? 'very-rare' : bonus >= 3 ? 'rare' : bonus >= 2 ? 'uncommon' : 'common';
      break;
      
    case 'armor':
      const armorBase = rng.pick(ARMOR_NAMES);
      bonus = rng.chance(0.6) ? 1 : rng.chance(0.8) ? 2 : rng.chance(0.95) ? 3 : 4;
      if (rng.chance(0.25)) {
        const prefix = rng.pick(ARMOR_PREFIXES);
        name = `${prefix} ${armorBase} +${bonus}`;
        properties.push(prefix.toLowerCase());
      } else {
        name = `${armorBase} +${bonus}`;
      }
      value = bonus * 1500 + (properties.length > 0 ? 3000 : 0);
      rarity = bonus >= 3 ? 'very-rare' : bonus >= 2 ? 'rare' : 'uncommon';
      break;
      
    case 'potion':
      const potionType = rng.pick(POTION_TYPES);
      name = `Potion of ${potionType}`;
      value = potionType.includes('Healing') ? 50 : potionType.includes('Greater') ? 150 : 300;
      rarity = 'common';
      break;
      
    case 'scroll':
      const scrollType = rng.pick(SCROLL_TYPES);
      name = `Scroll of ${scrollType}`;
      value = scrollType === 'Wish' ? 25000 : scrollType === 'Meteor Swarm' ? 5000 : 
              scrollType === 'Raise Dead' ? 3000 : 500;
      rarity = scrollType === 'Wish' ? 'legendary' : scrollType.includes('Meteor') ? 'very-rare' : 'uncommon';
      break;
      
    case 'ring':
      const ringType = rng.pick(RING_TYPES);
      name = `Ring of ${ringType}`;
      value = ringType === 'Three Wishes' ? 50000 : ringType === 'Regeneration' ? 25000 :
              ringType === 'Spell Turning' ? 15000 : 5000;
      rarity = ringType === 'Three Wishes' ? 'legendary' : ringType === 'Regeneration' ? 'very-rare' : 'rare';
      break;
      
    case 'wand':
      const wandType = rng.pick(WAND_TYPES);
      name = `Wand of ${wandType}`;
      value = 5000 + rng.int(5000);
      rarity = 'rare';
      properties.push(`${10 + rng.int(20)} charges`);
      break;
      
    case 'staff':
      name = `Staff of ${rng.pick(['Power', 'the Magi', 'Healing', 'Fire', 'Frost', 'Thunder'])}`;
      value = 15000 + rng.int(15000);
      rarity = 'very-rare';
      break;
      
    case 'rod':
      name = `Rod of ${rng.pick(['Absorption', 'Lordly Might', 'Rulership', 'Cancellation'])}`;
      value = 20000 + rng.int(20000);
      rarity = 'very-rare';
      break;
      
    case 'misc':
    default:
      name = rng.pick(MISC_ITEMS);
      value = name.includes('Sphere') ? 50000 : name.includes('Deck') ? 30000 :
              name.includes('Crystal') ? 10000 : 2000 + rng.int(3000);
      rarity = name.includes('Sphere') || name.includes('Deck') ? 'legendary' : 
               name.includes('Crystal') ? 'very-rare' : 'rare';
      break;
  }
  
  if (cursed) {
    name = name.replace(/\+\d/, '-1');
    properties.push('cursed');
  }
  
  return {
    id: rng.uid('magic'),
    name,
    category,
    rarity,
    bonus,
    cursed,
    identified: false,
    value,
    properties,
    location: location ?? 'unknown',
    discoveredAt: worldTime,
  };
}

// Generate complete treasure from a treasure type
export function generateTreasure(
  rng: Random,
  treasureType: TreasureType,
  worldTime: Date,
  location: string,
): GeneratedTreasure {
  const config = TREASURE_TYPES[treasureType];
  const coins: Record<CoinType, number> = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const gems: GemJewel[] = [];
  const jewelry: GemJewel[] = [];
  const magicItems: MagicItem[] = [];
  
  // Generate coins
  for (const [coinType, coinConfig] of Object.entries(config.coins)) {
    if (coinConfig && rng.chance(coinConfig.chance)) {
      coins[coinType as CoinType] = rollDice(rng, coinConfig.dice);
    }
  }
  
  // Generate gems
  if (config.gems && rng.chance(config.gems.chance)) {
    const count = rollDice(rng, config.gems.count);
    for (let i = 0; i < count; i++) {
      gems.push(generateGemJewel(rng, 'gem'));
    }
  }
  
  // Generate jewelry
  if (config.jewelry && rng.chance(config.jewelry.chance)) {
    const count = rollDice(rng, config.jewelry.count);
    for (let i = 0; i < count; i++) {
      jewelry.push(generateGemJewel(rng, 'jewelry'));
    }
  }
  
  // Generate magic items
  if (config.magic && rng.chance(config.magic.chance)) {
    for (let i = 0; i < config.magic.count; i++) {
      const category = config.magic.types ? rng.pick(config.magic.types) : undefined;
      magicItems.push(generateMagicItem(rng, category, worldTime, location));
    }
  }
  
  // Calculate total gold value
  let totalGoldValue = 0;
  for (const [coinType, count] of Object.entries(coins)) {
    totalGoldValue += count * COIN_VALUE[coinType as CoinType];
  }
  totalGoldValue += gems.reduce((sum, g) => sum + g.value, 0);
  totalGoldValue += jewelry.reduce((sum, j) => sum + j.value, 0);
  totalGoldValue += magicItems.reduce((sum, m) => sum + m.value, 0);
  
  return {
    coins,
    totalGoldValue: Math.floor(totalGoldValue),
    gems,
    jewelry,
    magicItems,
    isHoard: config.isLair,
    treasureType,
  };
}

// ============================================================================
// MONSTER TREASURE TYPE MAPPING
// ============================================================================

export function getMonsterTreasureType(species: MonsterSpecies): TreasureType {
  const name = species.toLowerCase();
  
  // Dragons get the best treasure
  if (/dragon/.test(name)) {
    if (/young|drake|pseudo|faerie/.test(name)) return 'F';
    if (/white|black|green/.test(name)) return 'H';
    if (/blue|red|gold|silver/.test(name)) return 'H';
    return 'A';
  }
  
  // Giants
  if (/giant|titan|cyclops|ettin/.test(name)) return 'E';
  if (/ogre|troll/.test(name)) return 'D';
  
  // Humanoids
  if (/orc|hobgoblin|gnoll/.test(name)) return 'B';
  if (/goblin|kobold/.test(name)) return 'C';
  if (/bugbear|lizardfolk/.test(name)) return 'B';
  if (/drow|duergar|derro/.test(name)) return 'G';
  if (/yuan-ti|naga/.test(name)) return 'D';
  
  // Undead
  if (/lich|vampire|death-knight/.test(name)) return 'F';
  if (/mummy|wight|wraith/.test(name)) return 'E';
  if (/skeleton|zombie|ghoul/.test(name)) return 'C';
  
  // Aberrations
  if (/mind-flayer|aboleth|beholder/.test(name)) return 'F';
  if (/umber|hook|roper/.test(name)) return 'D';
  
  // Fiends
  if (/demon|devil/.test(name)) return 'E';
  if (/hag|nightmare/.test(name)) return 'D';
  
  // Beasts typically have less treasure
  if (/wolf|bear|spider|rat|snake|beetle|ant/.test(name)) return 'Nil';
  if (/worg|dire/.test(name)) return 'C';
  
  // Constructs
  if (/golem|gargoyle/.test(name)) return 'Nil';
  
  // Elementals
  if (/elemental|mephit/.test(name)) return 'Nil';
  if (/djinni|efreeti|dao|marid/.test(name)) return 'F';
  
  // Fey
  if (/pixie|sprite|dryad/.test(name)) return 'Q';
  
  // Default
  return 'C';
}

// ============================================================================
// TREASURE STATE & WORLD EFFECTS
// ============================================================================

export interface TreasureState {
  discoveredHoards: DiscoveredHoard[];
  circulatingMagicItems: MagicItem[];
  recentInfluxes: TreasureInflux[];
  activeExtractions: TreasureExtraction[];
}

// ============================================================================
// ENCUMBRANCE & EXTRACTION
// ============================================================================

/**
 * BECMI Encumbrance Rules:
 * - 10 coins = 1 cn (coin weight)
 * - Average adventurer can carry 400-600 cn before slowing
 * - Maximum load ~1600 cn (barely moving)
 * - Gems: 1 cn each
 * - Jewelry: 10 cn each
 * - Magic items: 10-50 cn depending on type
 * 
 * Extraction time depends on:
 * - Dungeon depth (more rooms = longer trips)
 * - Total weight to extract
 * - Party size (more carriers = fewer trips)
 * - Terrain (swamp/mountain = slower)
 */

export interface TreasureExtraction {
  id: string;
  hoardId: string;
  location: string;              // Dungeon name
  extractingParty: string;       // Party name
  
  // What's left to extract
  remainingCoins: Record<CoinType, number>;
  remainingGems: number;
  remainingJewelry: number;
  remainingMagicItems: string[]; // Item IDs
  
  // Extraction progress
  totalWeight: number;           // Total cn to extract
  extractedWeight: number;       // cn already removed
  tripsCompleted: number;
  estimatedTripsRemaining: number;
  
  // Timing
  startedAt: Date;
  lastTripAt?: Date;
  nextTripCompletes?: Date;     // When the current trip finishes
  
  // What they're carrying this trip
  currentLoad: {
    coins: Record<CoinType, number>;
    gems: number;
    jewelry: number;
    magicItems: string[];
    weight: number;
  };
  
  // Risks
  interruptedBy?: string;        // What stopped them
  abandoned: boolean;
  completed: boolean;
}

// Weight constants (in cn - coin weight units)
const COIN_WEIGHT = 0.1;         // 10 coins = 1 cn
const GEM_WEIGHT = 1;            // 1 cn per gem
const JEWELRY_WEIGHT = 10;       // 10 cn per piece
const MAGIC_ITEM_WEIGHT: Record<MagicItemCategory, number> = {
  'potion': 5,
  'scroll': 1,
  'ring': 1,
  'wand': 5,
  'staff': 40,
  'rod': 20,
  'weapon': 50,
  'armor': 100,
  'misc': 20,
  'artifact': 30,
};

// Carrying capacity per party member (average)
const CARRY_CAPACITY_PER_MEMBER = 500; // cn
const SLOW_THRESHOLD = 300;            // cn before movement penalty
const MAX_CAPACITY_PER_MEMBER = 800;   // absolute max

// Time per trip (hours) based on dungeon depth
function getTripTime(dungeonRooms: number, terrain: string): number {
  // Base: 1 hour per 4 rooms of depth, minimum 1 hour
  const baseHours = Math.max(1, Math.ceil(dungeonRooms / 4));
  
  // Terrain modifier
  const terrainMod = 
    terrain === 'swamp' ? 1.5 :
    terrain === 'mountains' ? 1.3 :
    terrain === 'forest' ? 1.1 :
    1.0;
  
  // Round trip (in and out)
  return Math.ceil(baseHours * 2 * terrainMod);
}

// Calculate total weight of a treasure hoard
export function calculateHoardWeight(treasure: GeneratedTreasure): number {
  let weight = 0;
  
  // Coins
  for (const [coinType, count] of Object.entries(treasure.coins)) {
    weight += count * COIN_WEIGHT;
  }
  
  // Gems and jewelry
  weight += treasure.gems.length * GEM_WEIGHT;
  weight += treasure.jewelry.length * JEWELRY_WEIGHT;
  
  // Magic items
  for (const item of treasure.magicItems) {
    weight += MAGIC_ITEM_WEIGHT[item.category] ?? 20;
  }
  
  return weight;
}

// Value per weight unit (for prioritization)
function getValuePerWeight(coinType: CoinType): number {
  return COIN_VALUE[coinType] / COIN_WEIGHT;
}

// Prioritize what to take: highest value-to-weight ratio first
// Order: magic items (priceless) > platinum > gems > gold > jewelry > electrum > silver > copper
function prioritizeLoad(
  extraction: TreasureExtraction,
  magicItems: MagicItem[],
  capacity: number,
): TreasureExtraction['currentLoad'] {
  const load: TreasureExtraction['currentLoad'] = {
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    gems: 0,
    jewelry: 0,
    magicItems: [],
    weight: 0,
  };
  
  // 1. Magic items first (always take these - they're irreplaceable)
  for (const itemId of extraction.remainingMagicItems) {
    const item = magicItems.find(m => m.id === itemId);
    if (!item) continue;
    
    const itemWeight = MAGIC_ITEM_WEIGHT[item.category] ?? 20;
    if (load.weight + itemWeight <= capacity) {
      load.magicItems.push(itemId);
      load.weight += itemWeight;
    }
  }
  
  // 2. Platinum (50 gp per cn)
  const ppCanTake = Math.min(
    extraction.remainingCoins.pp,
    Math.floor((capacity - load.weight) / COIN_WEIGHT)
  );
  if (ppCanTake > 0) {
    load.coins.pp = ppCanTake;
    load.weight += ppCanTake * COIN_WEIGHT;
  }
  
  // 3. Gems (~100-1000 gp per cn)
  const gemsCanTake = Math.min(
    extraction.remainingGems,
    Math.floor((capacity - load.weight) / GEM_WEIGHT)
  );
  if (gemsCanTake > 0) {
    load.gems = gemsCanTake;
    load.weight += gemsCanTake * GEM_WEIGHT;
  }
  
  // 4. Gold (10 gp per cn)
  const gpCanTake = Math.min(
    extraction.remainingCoins.gp,
    Math.floor((capacity - load.weight) / COIN_WEIGHT)
  );
  if (gpCanTake > 0) {
    load.coins.gp = gpCanTake;
    load.weight += gpCanTake * COIN_WEIGHT;
  }
  
  // 5. Jewelry (~50-500 gp per 10 cn)
  const jewelryCanTake = Math.min(
    extraction.remainingJewelry,
    Math.floor((capacity - load.weight) / JEWELRY_WEIGHT)
  );
  if (jewelryCanTake > 0) {
    load.jewelry = jewelryCanTake;
    load.weight += jewelryCanTake * JEWELRY_WEIGHT;
  }
  
  // 6. Electrum (5 gp per cn)
  const epCanTake = Math.min(
    extraction.remainingCoins.ep,
    Math.floor((capacity - load.weight) / COIN_WEIGHT)
  );
  if (epCanTake > 0) {
    load.coins.ep = epCanTake;
    load.weight += epCanTake * COIN_WEIGHT;
  }
  
  // 7. Silver (1 gp per cn)
  const spCanTake = Math.min(
    extraction.remainingCoins.sp,
    Math.floor((capacity - load.weight) / COIN_WEIGHT)
  );
  if (spCanTake > 0) {
    load.coins.sp = spCanTake;
    load.weight += spCanTake * COIN_WEIGHT;
  }
  
  // 8. Copper (0.1 gp per cn) - usually left behind!
  const cpCanTake = Math.min(
    extraction.remainingCoins.cp,
    Math.floor((capacity - load.weight) / COIN_WEIGHT)
  );
  if (cpCanTake > 0) {
    load.coins.cp = cpCanTake;
    load.weight += cpCanTake * COIN_WEIGHT;
  }
  
  return load;
}

export interface DiscoveredHoard {
  id: string;
  location: string;
  discoveredBy: string;
  discoveredAt: Date;
  totalValue: number;
  magicItems: string[];  // Magic item IDs
  liquidated: boolean;
  liquidatedAt?: Date;
  percentSpent: number;
}

export interface TreasureInflux {
  settlementId: string;
  amount: number;
  arrivedAt: Date;
  source: string;
}

export function createTreasureState(): TreasureState {
  return {
    discoveredHoards: [],
    circulatingMagicItems: [],
    recentInfluxes: [],
    activeExtractions: [],
  };
}

// ============================================================================
// TREASURE DISCOVERY & WORLD EFFECTS
// ============================================================================

export function discoverTreasure(
  rng: Random,
  treasureType: TreasureType,
  location: string,
  discoveredBy: string,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  const treasure = generateTreasure(rng, treasureType, worldTime, location);
  
  if (treasure.totalGoldValue === 0 && treasure.magicItems.length === 0) {
    return logs; // Nothing found
  }
  
  // Calculate total weight
  const totalWeight = calculateHoardWeight(treasure);
  
  // Get party info for capacity calculation
  const party = world.parties.find(p => p.name === discoveredBy);
  const partySize = party?.members?.length ?? 4;
  const carryCapacity = partySize * CARRY_CAPACITY_PER_MEMBER;
  
  // Record the hoard
  const hoard: DiscoveredHoard = {
    id: rng.uid('hoard'),
    location,
    discoveredBy,
    discoveredAt: worldTime,
    totalValue: treasure.totalGoldValue,
    magicItems: treasure.magicItems.map(m => m.id),
    liquidated: false,
    percentSpent: 0,
  };
  treasureState.discoveredHoards.push(hoard);
  
  // Track magic items (but they're not "owned" until extracted)
  for (const item of treasure.magicItems) {
    item.discoveredBy = discoveredBy;
    item.location = location;
    treasureState.circulatingMagicItems.push(item);
  }
  
  // Build description
  let details = '';
  if (treasure.coins.gp > 0 || treasure.coins.pp > 0) {
    const gpDesc = treasure.coins.gp > 0 ? `${treasure.coins.gp.toLocaleString()} gold` : '';
    const ppDesc = treasure.coins.pp > 0 ? `${treasure.coins.pp.toLocaleString()} platinum` : '';
    details += [gpDesc, ppDesc].filter(Boolean).join(' and ') + '. ';
  }
  if (treasure.gems.length > 0) {
    details += `${treasure.gems.length} gems. `;
  }
  if (treasure.jewelry.length > 0) {
    details += `${treasure.jewelry.length} pieces of jewelry. `;
  }
  
  // Calculate extraction requirements
  const tripsNeeded = Math.ceil(totalWeight / carryCapacity);
  const dungeon = world.dungeons.find(d => d.name === location);
  const dungeonDepth = dungeon?.rooms?.length ?? 12;
  const tripHours = getTripTime(dungeonDepth, 'hills'); // Default terrain
  
  // Small caches can be carried in one trip - no extraction needed
  if (tripsNeeded <= 1 && totalWeight <= carryCapacity) {
    // Immediate extraction
    logs.push({
      category: 'dungeon',
      summary: `${discoveredBy} discovers and claims a cache worth ${treasure.totalGoldValue.toLocaleString()} gold`,
      details: `${details.trim()} Light enough to carry out immediately.`,
      location,
      actors: [discoveredBy],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
    // Mark magic items as owned
    for (const item of treasure.magicItems) {
      item.ownerId = discoveredBy;
    }
    
    // Queue economic effects for even small amounts
    if (treasure.totalGoldValue >= 500) {
      queueConsequence({
        type: 'treasure-influx',
        triggerEvent: `${discoveredBy} brings treasure to market`,
        turnsUntilResolution: 24 + rng.int(72),
        data: { amount: treasure.totalGoldValue, hoardId: hoard.id, location, discoveredBy },
        priority: 3,
      });
    }
  } else {
    // Large hoard - start extraction process
    const extraction: TreasureExtraction = {
      id: rng.uid('extraction'),
      hoardId: hoard.id,
      location,
      extractingParty: discoveredBy,
      remainingCoins: { ...treasure.coins },
      remainingGems: treasure.gems.length,
      remainingJewelry: treasure.jewelry.length,
      remainingMagicItems: treasure.magicItems.map(m => m.id),
      totalWeight,
      extractedWeight: 0,
      tripsCompleted: 0,
      estimatedTripsRemaining: tripsNeeded,
      startedAt: worldTime,
      currentLoad: { coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 }, gems: 0, jewelry: 0, magicItems: [], weight: 0 },
      abandoned: false,
      completed: false,
    };
    
    // Start first trip
    extraction.currentLoad = prioritizeLoad(extraction, treasureState.circulatingMagicItems, carryCapacity);
    extraction.nextTripCompletes = new Date(worldTime.getTime() + tripHours * 60 * 60 * 1000);
    
    treasureState.activeExtractions.push(extraction);
    
    const hoursTotal = tripsNeeded * tripHours;
    const daysApprox = Math.round(hoursTotal / 24 * 10) / 10;
    
    logs.push({
      category: 'dungeon',
      summary: `${discoveredBy} discovers a massive hoard worth ${treasure.totalGoldValue.toLocaleString()} gold!`,
      details: `${details.trim()} The hoard weighs ${Math.floor(totalWeight).toLocaleString()} cn. It will take approximately ${tripsNeeded} trips over ${daysApprox} days to extract.`,
      location,
      actors: [discoveredBy],
      worldTime,
      realTime: new Date(),
      seed: world.seed,
    });
    
    // Copper often gets left behind
    if (treasure.coins.cp > 1000) {
      logs.push({
        category: 'dungeon',
        summary: `${discoveredBy} prioritizes valuable items`,
        details: `The ${treasure.coins.cp.toLocaleString()} copper pieces may be left for later... or never. Platinum, gems, and magic items go first.`,
        location,
        actors: [discoveredBy],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
    }
  }
  
  // Log notable magic items and create rumors
  for (const item of treasure.magicItems) {
    if (item.rarity === 'rare' || item.rarity === 'very-rare' || item.rarity === 'legendary') {
      logs.push({
        category: 'dungeon',
        summary: `${discoveredBy} finds ${item.name}`,
        details: item.rarity === 'legendary' 
          ? `A legendary item of incredible power! Word of this will spread far.`
          : `A ${item.rarity} magic item worth approximately ${item.value.toLocaleString()} gold.`,
        location,
        actors: [discoveredBy],
        worldTime,
        realTime: new Date(),
        seed: world.seed,
      });
      
      // Create rumors for valuable items (chance based on rarity)
      const rumorChance = item.rarity === 'legendary' ? 0.9 :
                         item.rarity === 'very-rare' ? 0.6 :
                         item.rarity === 'rare' ? 0.3 : 0;
      
      if (rng.chance(rumorChance)) {
        const rumorType = item.rarity === 'legendary' ? 'legendary-item' :
                         item.category === 'weapon' || item.category === 'armor' ? 'magic-weapon' :
                         'rare-item';
        
        const baseRumor = createTreasureRumor(
          rng, world, rumorType, item.name, location, discoveredBy, item.value, item.id
        );
        
        // Spread rumors to multiple settlements
        const allRumors = spreadTreasureRumor(rng, world, baseRumor);
        for (const rumor of allRumors) {
          world.activeRumors.push(rumor);
          logs.push(logRumor(rumor, worldTime, world.seed));
        }
        
        // Queue second-order effects based on what the rumor attracts
        for (const attractType of baseRumor.attractsTypes) {
          const effectChance = item.rarity === 'legendary' ? 0.4 :
                              item.rarity === 'very-rare' ? 0.25 : 0.15;
          
          if (rng.chance(effectChance)) {
            queueConsequence({
              type: `treasure-${attractType}`,
              triggerEvent: `${attractType} learns of ${item.name}`,
              turnsUntilResolution: 72 + rng.int(336), // 3 days to 2 weeks
              data: { 
                itemId: item.id, 
                itemName: item.name, 
                location, 
                discoveredBy,
                rumorId: baseRumor.id,
                attractType,
              },
              priority: attractType === 'dragon' || attractType === 'antagonist' ? 5 : 3,
            });
          }
        }
      }
    }
  }
  
  // Create rumor for massive hoards
  if (treasure.isHoard && treasure.totalGoldValue >= 5000) {
    if (rng.chance(0.5)) {
      const baseRumor = createTreasureRumor(
        rng, world, 'massive-hoard', undefined, location, discoveredBy, treasure.totalGoldValue
      );
      
      const allRumors = spreadTreasureRumor(rng, world, baseRumor);
      for (const rumor of allRumors) {
        world.activeRumors.push(rumor);
        logs.push(logRumor(rumor, worldTime, world.seed));
      }
    }
  }
  
  return logs;
}

// ============================================================================
// EXTRACTION TICK - Process ongoing treasure extractions
// ============================================================================

export function tickExtractions(
  rng: Random,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const extraction of treasureState.activeExtractions) {
    if (extraction.completed || extraction.abandoned) continue;
    
    // Check if current trip is complete
    if (extraction.nextTripCompletes && new Date(extraction.nextTripCompletes) <= worldTime) {
      const party = world.parties.find(p => p.name === extraction.extractingParty);
      
      // Wandering monster check during extraction (10% per trip)
      if (rng.chance(0.1)) {
        const EXTRACTION_ENCOUNTERS = [
          'wandering monsters attack the laden party',
          'rival adventurers ambush them on the way out',
          'the dungeon denizens have reinforced',
          'a cave-in blocks the exit temporarily',
          'thieves were waiting outside',
        ];
        const encounter = rng.pick(EXTRACTION_ENCOUNTERS);
        
        // 30% chance encounter causes problems
        if (rng.chance(0.3)) {
          // Lose some of the load
          const lostPercent = 0.1 + rng.next() * 0.3; // 10-40% of current load
          
          logs.push({
            category: 'dungeon',
            summary: `${extraction.extractingParty} ambushed during extraction!`,
            details: `${encounter.charAt(0).toUpperCase() + encounter.slice(1)}. Some treasure is lost in the chaos.`,
            location: extraction.location,
            actors: [extraction.extractingParty],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          // Reduce what they're carrying
          extraction.currentLoad.coins.gp = Math.floor(extraction.currentLoad.coins.gp * (1 - lostPercent));
          extraction.currentLoad.coins.pp = Math.floor(extraction.currentLoad.coins.pp * (1 - lostPercent));
          extraction.currentLoad.gems = Math.floor(extraction.currentLoad.gems * (1 - lostPercent));
          
          // Party might get injured
          if (party && rng.chance(0.4)) {
            party.wounded = true;
            party.restHoursRemaining = Math.max(party.restHoursRemaining ?? 0, 12);
          }
        } else {
          logs.push({
            category: 'dungeon',
            summary: `${extraction.extractingParty} fights off attackers during extraction`,
            details: `${encounter.charAt(0).toUpperCase() + encounter.slice(1)}, but the party prevails and continues.`,
            location: extraction.location,
            actors: [extraction.extractingParty],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
      
      // Complete the trip - transfer the load
      extraction.tripsCompleted++;
      extraction.lastTripAt = worldTime;
      extraction.extractedWeight += extraction.currentLoad.weight;
      
      // Remove extracted items from remaining
      for (const coinType of Object.keys(extraction.currentLoad.coins) as CoinType[]) {
        extraction.remainingCoins[coinType] -= extraction.currentLoad.coins[coinType];
      }
      extraction.remainingGems -= extraction.currentLoad.gems;
      extraction.remainingJewelry -= extraction.currentLoad.jewelry;
      
      // Transfer magic items to party ownership
      for (const itemId of extraction.currentLoad.magicItems) {
        const item = treasureState.circulatingMagicItems.find(m => m.id === itemId);
        if (item) {
          item.ownerId = extraction.extractingParty;
          item.location = party?.location ?? extraction.location;
        }
        extraction.remainingMagicItems = extraction.remainingMagicItems.filter(id => id !== itemId);
      }
      
      // Log progress for significant trips
      if (extraction.tripsCompleted === 1 || extraction.tripsCompleted % 3 === 0) {
        const percentComplete = Math.round((extraction.extractedWeight / extraction.totalWeight) * 100);
        logs.push({
          category: 'dungeon',
          summary: `${extraction.extractingParty} completes extraction trip #${extraction.tripsCompleted}`,
          details: `${percentComplete}% of the hoard extracted. ${extraction.estimatedTripsRemaining - extraction.tripsCompleted} trips remaining.`,
          location: extraction.location,
          actors: [extraction.extractingParty],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
      }
      
      // Check if extraction is complete
      const remainingWeight = 
        Object.values(extraction.remainingCoins).reduce((sum, c) => sum + c * COIN_WEIGHT, 0) +
        extraction.remainingGems * GEM_WEIGHT +
        extraction.remainingJewelry * JEWELRY_WEIGHT +
        extraction.remainingMagicItems.length * 20; // Approximate
      
      if (remainingWeight <= 0 || (
        extraction.remainingCoins.pp === 0 &&
        extraction.remainingCoins.gp === 0 &&
        extraction.remainingGems === 0 &&
        extraction.remainingJewelry === 0 &&
        extraction.remainingMagicItems.length === 0
      )) {
        extraction.completed = true;
        
        // What's left behind?
        const leftBehind = extraction.remainingCoins.cp + extraction.remainingCoins.sp + extraction.remainingCoins.ep;
        
        logs.push({
          category: 'dungeon',
          summary: `${extraction.extractingParty} finishes extracting the hoard!`,
          details: leftBehind > 100 
            ? `After ${extraction.tripsCompleted} trips, the valuable items are secured. ${leftBehind.toLocaleString()} lesser coins were left behind.`
            : `After ${extraction.tripsCompleted} trips, the hoard is fully claimed.`,
          location: extraction.location,
          actors: [extraction.extractingParty],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        // Now queue economic effects
        const hoard = treasureState.discoveredHoards.find(h => h.id === extraction.hoardId);
        if (hoard && hoard.totalValue >= 1000) {
          queueConsequence({
            type: 'treasure-influx',
            triggerEvent: `${extraction.extractingParty} brings treasure to market`,
            turnsUntilResolution: 72 + rng.int(168),
            data: { amount: hoard.totalValue, hoardId: hoard.id, location: extraction.location, discoveredBy: extraction.extractingParty },
            priority: 3,
          });
        }
      } else {
        // Start next trip
        const partySize = party?.members?.length ?? 4;
        const carryCapacity = partySize * CARRY_CAPACITY_PER_MEMBER;
        extraction.currentLoad = prioritizeLoad(extraction, treasureState.circulatingMagicItems, carryCapacity);
        extraction.estimatedTripsRemaining = Math.ceil(remainingWeight / carryCapacity);
        
        const dungeon = world.dungeons.find(d => d.name === extraction.location);
        const tripHours = getTripTime(dungeon?.rooms?.length ?? 12, 'hills');
        extraction.nextTripCompletes = new Date(worldTime.getTime() + tripHours * 60 * 60 * 1000);
        
        // Only low-value items left? Party might abandon
        const remainingValue = 
          extraction.remainingCoins.cp * 0.01 +
          extraction.remainingCoins.sp * 0.1 +
          extraction.remainingCoins.ep * 0.5;
        
        if (remainingValue < 50 && extraction.remainingGems === 0 && extraction.remainingMagicItems.length === 0) {
          if (rng.chance(0.5)) {
            extraction.abandoned = true;
            logs.push({
              category: 'dungeon',
              summary: `${extraction.extractingParty} abandons remaining copper and silver`,
              details: `The remaining ${Math.floor(remainingValue)} gold worth of base coins isn't worth the danger. They move on.`,
              location: extraction.location,
              actors: [extraction.extractingParty],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
          }
        }
      }
    }
    
    // Check for interruptions - other factions learn about the hoard
    if (!extraction.completed && !extraction.abandoned && extraction.tripsCompleted > 0) {
      // Create rumors about ongoing extraction (once per extraction, around trip 2-3)
      if (extraction.tripsCompleted === 2 && rng.chance(0.4)) {
        const hoard = treasureState.discoveredHoards.find(h => h.id === extraction.hoardId);
        const baseRumor = createTreasureRumor(
          rng, world, 'ongoing-extraction', undefined, extraction.location, 
          extraction.extractingParty, hoard?.totalValue ?? extraction.totalWeight * 10
        );
        
        const allRumors = spreadTreasureRumor(rng, world, baseRumor);
        for (const rumor of allRumors) {
          world.activeRumors.push(rumor);
          logs.push(logRumor(rumor, worldTime, world.seed));
        }
        
        logs.push({
          category: 'faction',
          summary: `Word spreads of ${extraction.extractingParty}'s treasure haul`,
          details: `Thieves and rivals take note. The extraction may become more dangerous.`,
          location: extraction.location,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        // Queue multiple interested parties
        for (const attractType of baseRumor.attractsTypes) {
          if (rng.chance(0.25)) {
            queueConsequence({
              type: `treasure-${attractType}`,
              triggerEvent: `${attractType} learns of ${extraction.extractingParty}'s extraction`,
              turnsUntilResolution: 24 + rng.int(120), // 1-6 days
              data: { 
                extractionId: extraction.id, 
                partyName: extraction.extractingParty, 
                location: extraction.location,
                attractType,
              },
              priority: attractType === 'bandit' || attractType === 'monster' ? 4 : 3,
            });
          }
        }
      }
    }
  }
  
  // Clean up completed/abandoned extractions older than 7 days
  const weekAgo = new Date(worldTime.getTime() - 7 * 24 * 60 * 60 * 1000);
  treasureState.activeExtractions = treasureState.activeExtractions.filter(e =>
    (!e.completed && !e.abandoned) || new Date(e.startedAt) > weekAgo
  );
  
  return logs;
}

// ============================================================================
// TREASURE ECONOMIC EFFECTS
// ============================================================================

export function processTreasureInflux(
  rng: Random,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Process influxes - large amounts of gold cause price inflation
  for (const influx of treasureState.recentInfluxes) {
    const settlement = world.settlements.find(s => s.id === influx.settlementId || s.name === influx.settlementId);
    if (!settlement) continue;
    
    const daysSinceInflux = (worldTime.getTime() - new Date(influx.arrivedAt).getTime()) / (24 * 60 * 60 * 1000);
    
    // Inflation peaks around day 7, then normalizes over 1-2 months
    if (daysSinceInflux <= 7) {
      // Still inflating
      const inflationFactor = influx.amount / (settlement.population * 10);
      
      if (inflationFactor >= 0.5) {
        // Significant inflation
        for (const good of Object.keys(settlement.priceTrends ?? {}) as Good[]) {
          if (!settlement.priceTrends) settlement.priceTrends = {} as Record<Good, PriceTrend>;
          settlement.priceTrends[good] = 'high';
        }
        
        if (daysSinceInflux === 1) {
          logs.push({
            category: 'town',
            summary: `Prices rise in ${settlement.name}`,
            details: `A flood of gold from ${influx.source} drives up prices. Merchants smile; common folk grumble.`,
            location: settlement.name,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    } else if (daysSinceInflux >= 60) {
      // Mark for removal - prices have normalized
      influx.amount = 0;
    }
  }
  
  // Clean up old influxes
  treasureState.recentInfluxes = treasureState.recentInfluxes.filter(i => i.amount > 0);
  
  // Process hoard liquidation
  for (const hoard of treasureState.discoveredHoards) {
    if (hoard.liquidated || hoard.percentSpent >= 100) continue;
    
    const daysSinceDiscovery = (worldTime.getTime() - new Date(hoard.discoveredAt).getTime()) / (24 * 60 * 60 * 1000);
    
    // Gradual spending over 2-4 weeks
    if (daysSinceDiscovery >= 1 && hoard.percentSpent < 100) {
      const spendRate = 100 / (14 + rng.int(14)); // 14-28 days to spend
      hoard.percentSpent = Math.min(100, hoard.percentSpent + spendRate);
      
      if (hoard.percentSpent >= 100) {
        hoard.liquidated = true;
        hoard.liquidatedAt = worldTime;
        
        // Log completion for large hoards
        if (hoard.totalValue >= 5000) {
          logs.push({
            category: 'town',
            summary: `${hoard.discoveredBy} finishes spending their fortune`,
            details: `The ${hoard.totalValue.toLocaleString()} gold hoard has been distributed throughout the region. The economy absorbs the wealth.`,
            location: hoard.location,
            actors: [hoard.discoveredBy],
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
// MAGIC ITEM TRACKING
// ============================================================================

export function tickMagicItems(
  rng: Random,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  for (const item of treasureState.circulatingMagicItems) {
    // Identification over time (1-7 days)
    if (!item.identified && item.discoveredAt) {
      const daysSinceDiscovery = (worldTime.getTime() - new Date(item.discoveredAt).getTime()) / (24 * 60 * 60 * 1000);
      
      if (daysSinceDiscovery >= 1 && rng.chance(0.15)) {
        item.identified = true;
        item.identifiedAt = worldTime;
        
        if (item.rarity !== 'common') {
          logs.push({
            category: 'town',
            summary: `${item.name} identified`,
            details: item.cursed 
              ? `A curse is revealed! The item is not what it seemed.`
              : `The item's true nature is discovered: ${item.properties.join(', ') || 'a fine magical item'}.`,
            location: item.location,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
        }
      }
    }
    
    // Rare items attract thieves (handled via consequences)
    // Legendary items create story hooks (handled via consequences)
  }
  
  return logs;
}

// ============================================================================
// MAIN TICK FUNCTION
// ============================================================================

// ============================================================================
// TREASURE RUMOR REACTIONS - Second-order effects from treasure rumors
// ============================================================================

export function tickTreasureRumorReactions(
  rng: Random,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Find treasure-related rumors
  const treasureRumors = world.activeRumors.filter(r => 
    (r as TreasureRumor).treasureType !== undefined
  ) as TreasureRumor[];
  
  for (const rumor of treasureRumors) {
    // Each tick, there's a small chance someone acts on the rumor
    if (!rng.chance(0.01)) continue;
    
    const reactor = rng.pick(rumor.attractsTypes);
    
    switch (reactor) {
      case 'thieves-guild':
        // Guild plans a heist on the item holder
        logs.push({
          category: 'faction',
          summary: `The underworld takes interest in ${rumor.itemName ?? 'the treasure'}`,
          details: `Thieves discuss the ${rumor.treasureType.replace('-', ' ')} discovered by ${rumor.discoveredBy}. Plans are being made.`,
          location: rumor.origin,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        queueConsequence({
          type: 'guild-heist-target',
          triggerEvent: `Guild targets ${rumor.discoveredBy}'s treasure`,
          turnsUntilResolution: 168 + rng.int(336), // 1-3 weeks to plan
          data: { targetParty: rumor.discoveredBy, itemName: rumor.itemName, itemId: rumor.itemId },
          priority: 3,
        });
        break;
        
      case 'rival-party':
        // Another adventuring party challenges or races them
        const rivalName = `The ${rng.pick(['Iron', 'Black', 'Silver', 'Red', 'Golden'])} ${rng.pick(['Blades', 'Company', 'Brotherhood', 'Hand', 'Wolves'])}`;
        logs.push({
          category: 'road',
          summary: `${rivalName} hear of ${rumor.discoveredBy}'s fortune`,
          details: `Jealousy and ambition stir. A rival party considers their options.`,
          location: rumor.origin,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        queueConsequence({
          type: 'rival-party-conflict',
          triggerEvent: `${rivalName} confronts ${rumor.discoveredBy}`,
          turnsUntilResolution: 48 + rng.int(168), // 2-9 days
          data: { rivalName, targetParty: rumor.discoveredBy, reason: rumor.treasureType },
          priority: 4,
        });
        break;
        
      case 'collector':
        // A wealthy collector offers to buy the item
        const collectorName = `Lord ${rng.pick(['Blackwood', 'Silverton', 'Goldmane', 'Ravenholm', 'Thornwood'])}`;
        const offerAmount = Math.floor((rumor.estimatedValue ?? 1000) * (1.2 + rng.next() * 0.8));
        
        logs.push({
          category: 'town',
          summary: `${collectorName} seeks to acquire ${rumor.itemName ?? 'the treasure'}`,
          details: `Word reaches ${rumor.discoveredBy} of a collector offering ${offerAmount.toLocaleString()} gold. A legitimate offer, or a trap?`,
          location: rumor.origin,
          actors: [collectorName, rumor.discoveredBy ?? 'unknown'],
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        break;
        
      case 'dragon':
        // A dragon takes interest in the hoard
        if (rumor.treasureType === 'legendary-item' || rumor.treasureType === 'massive-hoard') {
          logs.push({
            category: 'road',
            summary: `A dragon stirs at rumors of treasure`,
            details: `Ancient instincts awaken. A wyrm has heard of ${rumor.itemName ?? 'gold'} in ${rumor.target}.`,
            location: rumor.target,
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          queueConsequence({
            type: 'dragon-seeks-treasure',
            triggerEvent: 'Dragon seeks the treasure',
            turnsUntilResolution: 336 + rng.int(336), // 2-4 weeks
            data: { 
              target: rumor.target, 
              itemName: rumor.itemName, 
              discoveredBy: rumor.discoveredBy,
              value: rumor.estimatedValue,
            },
            priority: 5,
          });
        }
        break;
        
      case 'antagonist':
        // An existing antagonist wants the item
        if (world.antagonists && (world.antagonists as any[]).length > 0) {
          const antagonist = rng.pick(world.antagonists as any[]);
          if (antagonist.alive) {
            logs.push({
              category: 'faction',
              summary: `${antagonist.name} covets ${rumor.itemName ?? 'the treasure'}`,
              details: `The villain's agents are dispatched. ${rumor.discoveredBy} has drawn dangerous attention.`,
              location: antagonist.territory,
              actors: [antagonist.name, rumor.discoveredBy ?? 'unknown'],
              worldTime,
              realTime: new Date(),
              seed: world.seed,
            });
            
            queueConsequence({
              type: 'antagonist-seeks-item',
              triggerEvent: `${antagonist.name} hunts for ${rumor.itemName}`,
              turnsUntilResolution: 168 + rng.int(504), // 1-4 weeks
              data: { 
                antagonistId: antagonist.id, 
                antagonistName: antagonist.name,
                itemName: rumor.itemName, 
                targetParty: rumor.discoveredBy,
              },
              priority: 5,
            });
          }
        }
        break;
        
      case 'faction':
        // A faction wants the item for their war effort
        if (world.factions.length > 0) {
          const faction = rng.pick(world.factions);
          logs.push({
            category: 'faction',
            summary: `${faction.name} take interest in ${rumor.itemName ?? 'the treasure'}`,
            details: `The ${faction.focus} faction considers how ${rumor.itemName ?? 'this treasure'} might serve their goals.`,
            location: rumor.origin,
            actors: [faction.name],
            worldTime,
            realTime: new Date(),
            seed: world.seed,
          });
          
          if (rng.chance(0.3)) {
            queueConsequence({
              type: 'faction-acquires-item',
              triggerEvent: `${faction.name} moves to acquire ${rumor.itemName}`,
              turnsUntilResolution: 72 + rng.int(168),
              data: { factionId: faction.id, itemName: rumor.itemName, targetParty: rumor.discoveredBy },
              priority: 3,
            });
          }
        }
        break;
        
      case 'bandit':
        // Bandits set an ambush
        logs.push({
          category: 'road',
          summary: `Bandits learn of ${rumor.discoveredBy}'s wealth`,
          details: `Cutthroats gather on the roads near ${rumor.target}. An ambush is being planned.`,
          location: rumor.target,
          worldTime,
          realTime: new Date(),
          seed: world.seed,
        });
        
        queueConsequence({
          type: 'bandit-ambush',
          triggerEvent: 'Bandits ambush treasure-laden party',
          turnsUntilResolution: 24 + rng.int(72), // 1-4 days
          data: { targetParty: rumor.discoveredBy, location: rumor.target },
          priority: 4,
        });
        break;
    }
    
    // Reduce rumor freshness faster when acted upon
    rumor.freshness = Math.max(0, rumor.freshness - 2);
  }
  
  return logs;
}

export function tickTreasure(
  rng: Random,
  treasureState: TreasureState,
  world: WorldState,
  worldTime: Date,
): LogEntry[] {
  const logs: LogEntry[] = [];
  
  // Process ongoing treasure extractions
  logs.push(...tickExtractions(rng, treasureState, world, worldTime));
  
  // Process reactions to treasure rumors
  logs.push(...tickTreasureRumorReactions(rng, treasureState, world, worldTime));
  
  // Economic effects from treasure entering the market
  logs.push(...processTreasureInflux(rng, treasureState, world, worldTime));
  
  // Magic item identification and tracking
  logs.push(...tickMagicItems(rng, treasureState, world, worldTime));
  
  return logs;
}

