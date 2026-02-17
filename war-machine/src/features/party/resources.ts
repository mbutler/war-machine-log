import type { Character } from "../../state/schema";

export interface PartyResourceSummary {
  loot: number;
  torches: number;
  rations: number;
  potions: number;
  scrolls: number;
}

export interface PartyEncumbrance {
  current: number;
  max: number;
  // Slowest movement rates in the party, derived from BECMI encumbrance bands
  slowestNormalSpeed: number; // feet per turn
  slowestEncounterSpeed: number; // feet per round
  slowestRunningSpeed: number; // feet per round
}

export function calculatePartySnapshot(roster: Character[]): {
  summary: PartyResourceSummary;
  encumbrance: PartyEncumbrance;
} {
  let torches = 0;
  let rations = 0;
  let current = 0;
  let carriers = 0;

  // Track slowest movement rates across all effective carriers
  let slowestNormalSpeed = 120;
  let slowestEncounterSpeed = 40;
  let slowestRunningSpeed = 120;

  roster.forEach((character) => {
    const isAlive = character.status !== "dead" && character.derivedStats.hp.current > 0;
    if (isAlive) {
      torches += 6;
      rations += 7;
      carriers += 1;

      const load = calculateCharacterLoad(character);
      current += load;

      const mv = getMovementRatesForEncumbrance(load);
      if (mv.normal < slowestNormalSpeed) {
        slowestNormalSpeed = mv.normal;
        slowestEncounterSpeed = mv.encounter;
        slowestRunningSpeed = mv.running;
      }
    }

    character.retainers.forEach((retainer) => {
      torches += 6;
      rations += 7;
      carriers += 1;
      if (retainer.class === "Porter") {
        current += 50;
      } else if (retainer.class === "Mercenary") {
        current += 400 + 60 + 100 + 60 + 140;
      } else {
        current += 10 + 60 + 140;
      }
    });
  });

  // If there are no effective carriers (empty or all dead), keep defaults but avoid divide-by-zero
  if (carriers === 0) {
    return {
      summary: {
        loot: 0,
        torches: 0,
        rations: 0,
        potions: 0,
        scrolls: 0,
      },
      encumbrance: {
        current: 0,
        max: 0,
        slowestNormalSpeed,
        slowestEncounterSpeed,
        slowestRunningSpeed,
      },
    };
  }

  // BECMI: characters can technically carry more than this, but at 2,401+ cn they cannot move.
  // We treat 2,400 cn per carrier as the "practical maximum before immobility".
  const max = carriers * 2400;

  return {
    summary: {
      loot: 0,
      torches,
      rations,
      potions: 0,
      scrolls: 0,
    },
    encumbrance: {
      current,
      max,
      slowestNormalSpeed,
      slowestEncounterSpeed,
      slowestRunningSpeed,
    },
  };
}

function calculateCharacterLoad(character: Character): number {
  let enc = 0;

  // Armor, weapon, and shield
  enc += getEquipmentWeightByName(character.equipment.armor);
  enc += getEquipmentWeightByName(character.equipment.weapon);
  if (character.equipment.shield) {
    enc += getEquipmentWeightByName(character.equipment.shield);
  }

  // Pack contents
  for (const itemName of character.equipment.pack) {
    enc += getEquipmentWeightByName(itemName);
  }

  // Coins carried (assume 1 coin = 1 cn)
  if (typeof character.equipment.gold === "number") {
    enc += character.equipment.gold;
  }

  return enc;
}

// ---------------------------------------------------------------------------
// BECMI Encumbrance Helpers
// ---------------------------------------------------------------------------

// Character Movement Rates and Encumbrance Table (RC):
// Enc (cn)     Normal  Encounter  Running
// 0–400        120     40         120
// 401–800      90      30         90
// 801–1,200    60      20         60
// 1,201–1,600  30      10         30
// 1,601–2,400  15      5          15
// 2,401+       0       0          0

function getMovementRatesForEncumbrance(encumbranceCn: number): {
  normal: number;
  encounter: number;
  running: number;
} {
  if (encumbranceCn <= 400) {
    return { normal: 120, encounter: 40, running: 120 };
  }
  if (encumbranceCn <= 800) {
    return { normal: 90, encounter: 30, running: 90 };
  }
  if (encumbranceCn <= 1200) {
    return { normal: 60, encounter: 20, running: 60 };
  }
  if (encumbranceCn <= 1600) {
    return { normal: 30, encounter: 10, running: 30 };
  }
  if (encumbranceCn <= 2400) {
    return { normal: 15, encounter: 5, running: 15 };
  }

  return { normal: 0, encounter: 0, running: 0 };
}

// ---------------------------------------------------------------------------
// Name-based equipment weight lookup
// ---------------------------------------------------------------------------

import { ALL_EQUIPMENT } from "../../rules/tables/equipment";

function getEquipmentWeightByName(name: string | null | undefined): number {
  if (!name || name === "None") return 0;

  // First, try exact name match
  const direct = ALL_EQUIPMENT.find((item) => item.name === name);
  if (direct) {
    return direct.weight ?? 0;
  }

  const lower = name.toLowerCase();

  // Case-insensitive match
  const ci = ALL_EQUIPMENT.find((item) => item.name.toLowerCase() === lower);
  if (ci) {
    return ci.weight ?? 0;
  }

  // Common aliases between generator names and equipment table names
  const aliasMap: Record<string, string> = {
    leather: "Leather Armor",
    "rations (7 days)": "Rations (Standard, 1 week)",
    "rations (standard, 1 week)": "Rations (Standard, 1 week)",
    "rations (iron, 1 week)": "Rations (Iron, 1 week)",
    spellbook: "Spellbook (Blank)",
    backpack: "Backpack",
    waterskin: "Waterskin",
    "torch (6)": "Torches (6)",
    "torches (6)": "Torches (6)",
    "holy symbol": "Holy Symbol",
    "thieves' tools": "Thieves' Tools",
  };

  const aliasTarget = aliasMap[lower];
  if (aliasTarget) {
    const aliasItem = ALL_EQUIPMENT.find((item) => item.name === aliasTarget);
    if (aliasItem) {
      return aliasItem.weight ?? 0;
    }
  }

  // Fallback: unknown items are treated as negligible encumbrance
  return 0;
}

