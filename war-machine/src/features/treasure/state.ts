import type { TreasureHoard, TreasureState } from "../../state/schema";
import { getState, subscribe, updateState } from "../../state/store";
import type { TreasureTypeKey } from "./data";
import { TREASURE_TYPES } from "./data";
import { formatHoardPlainText, generateTreasureHoard } from "./logic";
import { serializeModuleExport } from "../../utils/moduleExport";

export type TreasureListener = (state: TreasureState) => void;

const HISTORY_LIMIT = 10;

export function getTreasureState(): TreasureState {
  return getState().treasure;
}

export function subscribeToTreasure(listener: TreasureListener): () => void {
  return subscribe((state) => listener(state.treasure));
}

export function setTreasureType(type: TreasureTypeKey) {
  updateState((state) => {
    state.treasure.selectedType = type;
  });
}

export function rollTreasureHoard(): TreasureHoard {
  const state = getState().treasure;
  const type = (TREASURE_TYPES[state.selectedType as TreasureTypeKey] ? state.selectedType : "A") as TreasureTypeKey;
  const hoard = generateTreasureHoard(type);

  updateState((draft) => {
    draft.treasure.hoards.unshift(hoard);
    draft.treasure.hoards = draft.treasure.hoards.slice(0, HISTORY_LIMIT);
  });

  return hoard;
}

export function removeTreasureHoard(id: string) {
  updateState((state) => {
    state.treasure.hoards = state.treasure.hoards.filter((hoard) => hoard.id !== id);
  });
}

export function clearTreasureHistory() {
  updateState((state) => {
    state.treasure.hoards = [];
  });
}

export function copyHoardToClipboard(hoard: TreasureHoard) {
  if (typeof navigator === "undefined" || !navigator.clipboard) {
    return Promise.reject(new Error("Clipboard API unavailable"));
  }
  return navigator.clipboard.writeText(formatHoardPlainText(hoard));
}

// ============================================================================
// Data Export/Import
// ============================================================================

/**
 * Exports the treasure state in the standardized module format.
 */
export function exportTreasureData(): string {
  const state = getTreasureState();
  return serializeModuleExport("treasure", state);
}

/**
 * Imports treasure data from JSON. Supports the standardized module format.
 */
export function importTreasureData(raw: string) {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid treasure import file.");
  }

  if (payload.module === "treasure" && payload.data) {
    const treasureData = payload.data as TreasureState;
    updateState((state) => {
      state.treasure = normalizeTreasureState(treasureData);
    });
    return;
  }

  throw new Error("Unrecognized treasure file format. Use the module export format.");
}

function normalizeTreasureState(data: Partial<TreasureState>): TreasureState {
  return {
    selectedType: typeof data.selectedType === "string" ? data.selectedType : "A",
    hoards: Array.isArray(data.hoards) ? data.hoards.slice(0, HISTORY_LIMIT) : [],
  };
}

