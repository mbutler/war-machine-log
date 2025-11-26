/**
 * BECMI Equipment Database
 * Prices and weights from Rules Cyclopedia
 */

export type EquipmentCategory =
  | "weapons_melee"
  | "weapons_missile"
  | "ammunition"
  | "armor"
  | "shields"
  | "clothing"
  | "containers"
  | "provisions"
  | "light_sources"
  | "tools"
  | "transport"
  | "animals"
  | "services"
  | "lodging";

export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  cost: number;           // Cost in gold pieces
  weight: number;         // Weight in coins (10 coins = 1 pound)
  description?: string;
  damage?: string;        // For weapons
  range?: string;         // For missile weapons
  ac?: number;            // For armor/shields
  notes?: string;
}

// ============================================================================
// WEAPONS - MELEE
// ============================================================================

export const MELEE_WEAPONS: EquipmentItem[] = [
  { id: "battle_axe", name: "Battle Axe", category: "weapons_melee", cost: 7, weight: 50, damage: "1d8" },
  { id: "hand_axe", name: "Hand Axe", category: "weapons_melee", cost: 4, weight: 30, damage: "1d6", notes: "Can be thrown" },
  { id: "club", name: "Club", category: "weapons_melee", cost: 3, weight: 50, damage: "1d4" },
  { id: "dagger", name: "Dagger", category: "weapons_melee", cost: 3, weight: 10, damage: "1d4", notes: "Can be thrown" },
  { id: "silver_dagger", name: "Silver Dagger", category: "weapons_melee", cost: 30, weight: 10, damage: "1d4", notes: "Effective vs lycanthropes" },
  { id: "flail", name: "Flail", category: "weapons_melee", cost: 5, weight: 50, damage: "1d6" },
  { id: "war_hammer", name: "War Hammer", category: "weapons_melee", cost: 5, weight: 50, damage: "1d6" },
  { id: "javelin", name: "Javelin", category: "weapons_melee", cost: 1, weight: 20, damage: "1d6", notes: "Primarily thrown" },
  { id: "lance", name: "Lance", category: "weapons_melee", cost: 5, weight: 100, damage: "1d6", notes: "Mounted use, double damage on charge" },
  { id: "mace", name: "Mace", category: "weapons_melee", cost: 5, weight: 50, damage: "1d6" },
  { id: "morning_star", name: "Morning Star", category: "weapons_melee", cost: 5, weight: 50, damage: "1d6" },
  { id: "polearm", name: "Polearm", category: "weapons_melee", cost: 7, weight: 150, damage: "1d10", notes: "Two-handed" },
  { id: "spear", name: "Spear", category: "weapons_melee", cost: 3, weight: 30, damage: "1d6", notes: "Can be thrown or set vs charge" },
  { id: "staff", name: "Staff", category: "weapons_melee", cost: 2, weight: 40, damage: "1d6", notes: "Two-handed" },
  { id: "short_sword", name: "Short Sword", category: "weapons_melee", cost: 7, weight: 30, damage: "1d6" },
  { id: "sword", name: "Sword (Normal)", category: "weapons_melee", cost: 10, weight: 60, damage: "1d8" },
  { id: "two_handed_sword", name: "Two-Handed Sword", category: "weapons_melee", cost: 15, weight: 150, damage: "1d10", notes: "Two-handed" },
  { id: "trident", name: "Trident", category: "weapons_melee", cost: 5, weight: 50, damage: "1d6", notes: "Can be thrown" },
  { id: "whip", name: "Whip", category: "weapons_melee", cost: 5, weight: 20, damage: "1d2", notes: "Can entangle" },
];

// ============================================================================
// WEAPONS - MISSILE
// ============================================================================

export const MISSILE_WEAPONS: EquipmentItem[] = [
  { id: "shortbow", name: "Short Bow", category: "weapons_missile", cost: 25, weight: 30, damage: "1d6", range: "50/100/150" },
  { id: "longbow", name: "Long Bow", category: "weapons_missile", cost: 40, weight: 30, damage: "1d6", range: "70/140/210" },
  { id: "crossbow", name: "Crossbow", category: "weapons_missile", cost: 30, weight: 50, damage: "1d6", range: "80/160/240", notes: "Fires every other round" },
  { id: "sling", name: "Sling", category: "weapons_missile", cost: 2, weight: 0, damage: "1d4", range: "40/80/160" },
  { id: "blowgun", name: "Blowgun", category: "weapons_missile", cost: 6, weight: 10, damage: "1", range: "10/20/30", notes: "Often used with poison" },
  { id: "bola", name: "Bola", category: "weapons_missile", cost: 5, weight: 10, damage: "1d2", range: "20/40/60", notes: "Can entangle" },
  { id: "net", name: "Net", category: "weapons_missile", cost: 5, weight: 30, range: "10/20/30", notes: "Entangles target" },
];

// ============================================================================
// AMMUNITION
// ============================================================================

export const AMMUNITION: EquipmentItem[] = [
  { id: "arrows_20", name: "Arrows (20)", category: "ammunition", cost: 5, weight: 20 },
  { id: "quarrels_30", name: "Crossbow Quarrels (30)", category: "ammunition", cost: 10, weight: 30 },
  { id: "sling_stones_30", name: "Sling Stones (30)", category: "ammunition", cost: 0, weight: 10, notes: "Free if gathered" },
  { id: "silver_arrow", name: "Silver-Tipped Arrow (1)", category: "ammunition", cost: 5, weight: 1 },
  { id: "blowgun_darts_10", name: "Blowgun Darts (10)", category: "ammunition", cost: 5, weight: 5 },
  { id: "quiver", name: "Quiver/Bolt Case", category: "ammunition", cost: 5, weight: 5 },
];

// ============================================================================
// ARMOR
// ============================================================================

export const ARMOR: EquipmentItem[] = [
  { id: "leather_armor", name: "Leather Armor", category: "armor", cost: 20, weight: 200, ac: 7 },
  { id: "scale_mail", name: "Scale Mail", category: "armor", cost: 30, weight: 400, ac: 6 },
  { id: "chain_mail", name: "Chain Mail", category: "armor", cost: 40, weight: 400, ac: 5 },
  { id: "banded_mail", name: "Banded Mail", category: "armor", cost: 50, weight: 450, ac: 4 },
  { id: "plate_mail", name: "Plate Mail", category: "armor", cost: 60, weight: 500, ac: 3 },
  { id: "suit_armor", name: "Suit Armor (Full Plate)", category: "armor", cost: 250, weight: 750, ac: 0, notes: "Requires assistance to don" },
  { id: "barding_leather", name: "Horse Barding (Leather)", category: "armor", cost: 40, weight: 400, ac: 7, notes: "Horse armor" },
  { id: "barding_chain", name: "Horse Barding (Chain)", category: "armor", cost: 100, weight: 600, ac: 5, notes: "Horse armor" },
  { id: "barding_plate", name: "Horse Barding (Plate)", category: "armor", cost: 250, weight: 1200, ac: 3, notes: "Horse armor" },
];

// ============================================================================
// SHIELDS
// ============================================================================

export const SHIELDS: EquipmentItem[] = [
  { id: "shield", name: "Shield", category: "shields", cost: 10, weight: 100, ac: -1, notes: "-1 to AC" },
  { id: "horned_shield", name: "Horned Shield", category: "shields", cost: 25, weight: 150, ac: -1, notes: "Can be used as weapon (1d2)" },
  { id: "knife_shield", name: "Knife Shield", category: "shields", cost: 30, weight: 120, ac: -1, notes: "Built-in blade (1d4)" },
  { id: "sword_shield", name: "Sword Shield", category: "shields", cost: 50, weight: 150, ac: -1, notes: "Built-in sword (1d6)" },
  { id: "tusked_shield", name: "Tusked Shield", category: "shields", cost: 30, weight: 150, ac: -1, notes: "Built-in tusk (1d4)" },
];

// ============================================================================
// CLOTHING & PERSONAL ITEMS
// ============================================================================

export const CLOTHING: EquipmentItem[] = [
  { id: "belt", name: "Belt", category: "clothing", cost: 3, weight: 0 },
  { id: "boots_low", name: "Boots (Low, Soft)", category: "clothing", cost: 6, weight: 20 },
  { id: "boots_high", name: "Boots (High, Hard)", category: "clothing", cost: 3, weight: 30 },
  { id: "cloak", name: "Cloak", category: "clothing", cost: 2, weight: 10 },
  { id: "clothes_common", name: "Clothing (Common)", category: "clothing", cost: 5, weight: 20 },
  { id: "clothes_fine", name: "Clothing (Fine)", category: "clothing", cost: 20, weight: 20 },
  { id: "clothes_noble", name: "Clothing (Noble)", category: "clothing", cost: 200, weight: 30 },
  { id: "gloves", name: "Gloves", category: "clothing", cost: 4, weight: 0 },
  { id: "hat", name: "Hat", category: "clothing", cost: 1, weight: 0 },
  { id: "robe", name: "Robe", category: "clothing", cost: 6, weight: 10 },
  { id: "holy_symbol_wood", name: "Holy Symbol (Wooden)", category: "clothing", cost: 1, weight: 0 },
  { id: "holy_symbol_silver", name: "Holy Symbol (Silver)", category: "clothing", cost: 25, weight: 0 },
  { id: "thieves_tools", name: "Thieves' Tools", category: "clothing", cost: 25, weight: 10 },
  { id: "mirror_small_steel", name: "Mirror (Small, Steel)", category: "clothing", cost: 5, weight: 5 },
];

// ============================================================================
// CONTAINERS
// ============================================================================

export const CONTAINERS: EquipmentItem[] = [
  { id: "backpack", name: "Backpack", category: "containers", cost: 5, weight: 20, notes: "Holds 400 coins" },
  { id: "barrel", name: "Barrel", category: "containers", cost: 2, weight: 80, notes: "Holds 360 coins" },
  { id: "belt_pouch_small", name: "Belt Pouch (Small)", category: "containers", cost: 1, weight: 5, notes: "Holds 25 coins" },
  { id: "belt_pouch_large", name: "Belt Pouch (Large)", category: "containers", cost: 2, weight: 10, notes: "Holds 50 coins" },
  { id: "chest_small", name: "Chest (Small)", category: "containers", cost: 5, weight: 20, notes: "Holds 200 coins" },
  { id: "chest_large", name: "Chest (Large)", category: "containers", cost: 10, weight: 100, notes: "Holds 500 coins" },
  { id: "sack_small", name: "Sack (Small)", category: "containers", cost: 1, weight: 5, notes: "Holds 200 coins" },
  { id: "sack_large", name: "Sack (Large)", category: "containers", cost: 2, weight: 10, notes: "Holds 600 coins" },
  { id: "saddle_bags", name: "Saddle Bags", category: "containers", cost: 5, weight: 100, notes: "Holds 300 coins" },
  { id: "waterskin", name: "Waterskin", category: "containers", cost: 1, weight: 50, notes: "Holds 1 quart" },
  { id: "wineskin", name: "Wineskin", category: "containers", cost: 1, weight: 50, notes: "Holds 1 quart" },
];

// ============================================================================
// PROVISIONS
// ============================================================================

export const PROVISIONS: EquipmentItem[] = [
  { id: "rations_standard_1", name: "Rations (Standard, 1 day)", category: "provisions", cost: 0.5, weight: 20 },
  { id: "rations_standard_7", name: "Rations (Standard, 7 days)", category: "provisions", cost: 3, weight: 140 },
  { id: "rations_iron_1", name: "Rations (Iron, 1 day)", category: "provisions", cost: 1, weight: 10, notes: "Preserved, lighter" },
  { id: "rations_iron_7", name: "Rations (Iron, 7 days)", category: "provisions", cost: 7, weight: 70 },
  { id: "water_1_day", name: "Water (1 day supply)", category: "provisions", cost: 0, weight: 40 },
  { id: "ale_pint", name: "Ale (Pint)", category: "provisions", cost: 0.05, weight: 10 },
  { id: "wine_pint", name: "Wine (Pint)", category: "provisions", cost: 1, weight: 10 },
  { id: "mead_pint", name: "Mead (Pint)", category: "provisions", cost: 0.5, weight: 10 },
  { id: "grain_horse_1_day", name: "Grain (Horse, 1 day)", category: "provisions", cost: 0.1, weight: 100 },
];

// ============================================================================
// LIGHT SOURCES
// ============================================================================

export const LIGHT_SOURCES: EquipmentItem[] = [
  { id: "torch_1", name: "Torch (1)", category: "light_sources", cost: 0.1, weight: 20, notes: "Burns 1 hour, 30' radius" },
  { id: "torch_6", name: "Torches (6)", category: "light_sources", cost: 0.5, weight: 120 },
  { id: "lantern", name: "Lantern", category: "light_sources", cost: 10, weight: 30, notes: "30' radius, burns 4 hours per pint oil" },
  { id: "bullseye_lantern", name: "Lantern (Bullseye)", category: "light_sources", cost: 14, weight: 40, notes: "60' beam" },
  { id: "oil_flask", name: "Oil (Flask)", category: "light_sources", cost: 2, weight: 10, notes: "4 hours lantern fuel, or thrown weapon" },
  { id: "candles_12", name: "Candles (12)", category: "light_sources", cost: 1, weight: 10, notes: "5' radius each" },
  { id: "tinderbox", name: "Tinderbox", category: "light_sources", cost: 3, weight: 5 },
];

// ============================================================================
// TOOLS & EQUIPMENT
// ============================================================================

export const TOOLS: EquipmentItem[] = [
  { id: "crowbar", name: "Crowbar", category: "tools", cost: 10, weight: 50, notes: "+1 to force doors" },
  { id: "grappling_hook", name: "Grappling Hook", category: "tools", cost: 25, weight: 40 },
  { id: "hammer_small", name: "Hammer (Small)", category: "tools", cost: 2, weight: 10 },
  { id: "iron_spikes_12", name: "Iron Spikes (12)", category: "tools", cost: 1, weight: 60 },
  { id: "rope_50ft", name: "Rope (50')", category: "tools", cost: 1, weight: 50 },
  { id: "rope_silk_50ft", name: "Rope, Silk (50')", category: "tools", cost: 10, weight: 25 },
  { id: "pole_10ft", name: "Pole (10')", category: "tools", cost: 1, weight: 80 },
  { id: "chain_10ft", name: "Chain (10')", category: "tools", cost: 30, weight: 100 },
  { id: "manacles", name: "Manacles", category: "tools", cost: 15, weight: 40 },
  { id: "lock_simple", name: "Lock (Simple)", category: "tools", cost: 20, weight: 10 },
  { id: "lock_good", name: "Lock (Good)", category: "tools", cost: 40, weight: 10 },
  { id: "stakes_3", name: "Wooden Stakes (3)", category: "tools", cost: 1, weight: 15 },
  { id: "wolfsbane", name: "Wolfsbane (Sprig)", category: "tools", cost: 10, weight: 0 },
  { id: "garlic", name: "Garlic (Head)", category: "tools", cost: 5, weight: 0 },
  { id: "holy_water_vial", name: "Holy Water (Vial)", category: "tools", cost: 25, weight: 10, notes: "1d8 vs undead" },
  { id: "spellbook_blank", name: "Spellbook (Blank)", category: "tools", cost: 25, weight: 200 },
  { id: "parchment_1", name: "Parchment (1 sheet)", category: "tools", cost: 0.2, weight: 0 },
  { id: "ink_quill", name: "Ink & Quill", category: "tools", cost: 2, weight: 0 },
  { id: "scroll_case", name: "Scroll Case (Bone)", category: "tools", cost: 3, weight: 5 },
  { id: "map_case", name: "Map/Scroll Case (Leather)", category: "tools", cost: 1, weight: 5 },
  { id: "musical_instrument", name: "Musical Instrument", category: "tools", cost: 25, weight: 30 },
];

// ============================================================================
// TRANSPORT
// ============================================================================

export const TRANSPORT: EquipmentItem[] = [
  { id: "cart", name: "Cart", category: "transport", cost: 100, weight: 0, notes: "Holds 4000 coins, requires draft animal" },
  { id: "wagon", name: "Wagon", category: "transport", cost: 200, weight: 0, notes: "Holds 15000 coins, requires 2 draft animals" },
  { id: "raft", name: "Raft", category: "transport", cost: 40, weight: 0, notes: "Holds 30000 coins" },
  { id: "rowboat", name: "Rowboat", category: "transport", cost: 60, weight: 0, notes: "Holds 60000 coins" },
  { id: "canoe", name: "Canoe", category: "transport", cost: 40, weight: 0, notes: "Holds 10000 coins" },
  { id: "small_boat", name: "Small Boat (Sailing)", category: "transport", cost: 100, weight: 0, notes: "Holds 100000 coins" },
  { id: "lifeboat", name: "Lifeboat", category: "transport", cost: 500, weight: 0, notes: "Holds 150000 coins" },
  { id: "longship", name: "Longship", category: "transport", cost: 15000, weight: 0, notes: "40000 coin cargo, 60 rowers" },
  { id: "sailing_ship_small", name: "Sailing Ship (Small)", category: "transport", cost: 5000, weight: 0, notes: "100000 coin cargo" },
  { id: "sailing_ship_large", name: "Sailing Ship (Large)", category: "transport", cost: 20000, weight: 0, notes: "300000 coin cargo" },
  { id: "warship", name: "Warship", category: "transport", cost: 25000, weight: 0, notes: "100 marines" },
  { id: "galley_large", name: "Galley (Large)", category: "transport", cost: 30000, weight: 0, notes: "40000 coin cargo, 180 rowers" },
  { id: "troop_transport", name: "Troop Transport", category: "transport", cost: 26500, weight: 0, notes: "100 soldiers" },
  { id: "saddle_riding", name: "Saddle (Riding)", category: "transport", cost: 25, weight: 250 },
  { id: "saddle_war", name: "Saddle (War)", category: "transport", cost: 50, weight: 350 },
];

// ============================================================================
// ANIMALS
// ============================================================================

export const ANIMALS: EquipmentItem[] = [
  { id: "dog_guard", name: "Dog (Guard)", category: "animals", cost: 25, weight: 0 },
  { id: "dog_hunting", name: "Dog (Hunting)", category: "animals", cost: 17, weight: 0 },
  { id: "dog_war", name: "Dog (War)", category: "animals", cost: 75, weight: 0 },
  { id: "mule", name: "Mule", category: "animals", cost: 25, weight: 0, notes: "Carries 3000 coins" },
  { id: "horse_draft", name: "Horse (Draft)", category: "animals", cost: 40, weight: 0, notes: "Carries 4500 coins" },
  { id: "horse_riding", name: "Horse (Riding)", category: "animals", cost: 75, weight: 0, notes: "Carries 3000 coins" },
  { id: "horse_war", name: "Horse (War)", category: "animals", cost: 250, weight: 0, notes: "Trained for combat" },
  { id: "camel", name: "Camel", category: "animals", cost: 100, weight: 0, notes: "Carries 4000 coins, desert adapted" },
  { id: "elephant", name: "Elephant", category: "animals", cost: 500, weight: 0, notes: "Carries 10000 coins" },
  { id: "ox", name: "Ox", category: "animals", cost: 25, weight: 0, notes: "Draft animal" },
  { id: "donkey", name: "Donkey", category: "animals", cost: 8, weight: 0, notes: "Carries 2000 coins" },
  { id: "pony", name: "Pony", category: "animals", cost: 30, weight: 0, notes: "Small horse" },
  { id: "carrier_pigeon", name: "Carrier Pigeon", category: "animals", cost: 100, weight: 0 },
  { id: "falcon", name: "Falcon (Trained)", category: "animals", cost: 1000, weight: 0 },
];

// ============================================================================
// SERVICES & LODGING
// ============================================================================

export const SERVICES: EquipmentItem[] = [
  { id: "hireling_porter", name: "Hireling (Porter, per day)", category: "services", cost: 1, weight: 0 },
  { id: "hireling_skilled", name: "Hireling (Skilled, per day)", category: "services", cost: 3, weight: 0 },
  { id: "mercenary_infantry", name: "Mercenary (Infantry, per month)", category: "services", cost: 2, weight: 0 },
  { id: "mercenary_archer", name: "Mercenary (Archer, per month)", category: "services", cost: 5, weight: 0 },
  { id: "mercenary_cavalry", name: "Mercenary (Cavalry, per month)", category: "services", cost: 10, weight: 0 },
  { id: "armorer", name: "Armorer (per month)", category: "services", cost: 100, weight: 0 },
  { id: "blacksmith", name: "Blacksmith (per month)", category: "services", cost: 25, weight: 0 },
  { id: "animal_trainer", name: "Animal Trainer (per month)", category: "services", cost: 500, weight: 0 },
  { id: "spy", name: "Spy (per month)", category: "services", cost: 500, weight: 0 },
  { id: "sage", name: "Sage (per question)", category: "services", cost: 1000, weight: 0 },
];

export const LODGING: EquipmentItem[] = [
  { id: "inn_poor", name: "Inn (Poor, per night)", category: "lodging", cost: 1, weight: 0 },
  { id: "inn_average", name: "Inn (Average, per night)", category: "lodging", cost: 5, weight: 0 },
  { id: "inn_good", name: "Inn (Good, per night)", category: "lodging", cost: 10, weight: 0 },
  { id: "inn_wealthy", name: "Inn (Wealthy, per night)", category: "lodging", cost: 40, weight: 0 },
  { id: "meal_poor", name: "Meal (Poor)", category: "lodging", cost: 0.1, weight: 0 },
  { id: "meal_average", name: "Meal (Average)", category: "lodging", cost: 0.5, weight: 0 },
  { id: "meal_good", name: "Meal (Good)", category: "lodging", cost: 1, weight: 0 },
  { id: "meal_feast", name: "Meal (Feast)", category: "lodging", cost: 5, weight: 0 },
  { id: "stabling", name: "Stabling (per night)", category: "lodging", cost: 0.5, weight: 0 },
];

// ============================================================================
// COMBINED LISTS & UTILITIES
// ============================================================================

export const ALL_EQUIPMENT: EquipmentItem[] = [
  ...MELEE_WEAPONS,
  ...MISSILE_WEAPONS,
  ...AMMUNITION,
  ...ARMOR,
  ...SHIELDS,
  ...CLOTHING,
  ...CONTAINERS,
  ...PROVISIONS,
  ...LIGHT_SOURCES,
  ...TOOLS,
  ...TRANSPORT,
  ...ANIMALS,
  ...SERVICES,
  ...LODGING,
];

const EQUIPMENT_MAP = new Map(ALL_EQUIPMENT.map((item) => [item.id, item]));

export function getEquipmentById(id: string): EquipmentItem | undefined {
  return EQUIPMENT_MAP.get(id);
}

export function getEquipmentByCategory(category: EquipmentCategory): EquipmentItem[] {
  return ALL_EQUIPMENT.filter((item) => item.category === category);
}

export function searchEquipment(query: string): EquipmentItem[] {
  const lowerQuery = query.toLowerCase();
  return ALL_EQUIPMENT.filter(
    (item) =>
      item.name.toLowerCase().includes(lowerQuery) ||
      item.category.toLowerCase().includes(lowerQuery) ||
      (item.description?.toLowerCase().includes(lowerQuery) ?? false),
  );
}

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  weapons_melee: "Melee Weapons",
  weapons_missile: "Missile Weapons",
  ammunition: "Ammunition",
  armor: "Armor",
  shields: "Shields",
  clothing: "Clothing & Personal",
  containers: "Containers",
  provisions: "Provisions",
  light_sources: "Light Sources",
  tools: "Tools & Equipment",
  transport: "Transport",
  animals: "Animals",
  services: "Services",
  lodging: "Lodging",
};

/**
 * Calculate sale value (typically 50% of purchase price)
 */
export function getSaleValue(item: EquipmentItem, condition: "good" | "fair" | "poor" = "good"): number {
  const multiplier = condition === "good" ? 0.5 : condition === "fair" ? 0.25 : 0.1;
  return Math.floor(item.cost * multiplier * 100) / 100; // Round to 2 decimal places
}

