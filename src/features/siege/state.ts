import type { SiegeForce, SiegeState, SiegeTactic } from "../../state/schema";
import { createDefaultSiegeState } from "../../state/schema";
import { getState, subscribe, updateState } from "../../state/store";
import { resolveBattle } from "./logic";
import { startTimedAction, cancelTimedAction } from "../calendar/actions";
import { onCalendarEvent } from "../calendar/state";
import { serializeModuleExport } from "../../utils/moduleExport";

const LOG_LIMIT = 15;

export type SiegeListener = (state: SiegeState) => void;

type ForceKey = "attacker" | "defender";
type EngineKey = keyof SiegeForce["siegeEngines"];
type ModifierSide = "attacker" | "defender";
type AttackerModifierKey = keyof SiegeState["modifiers"]["attacker"];
type DefenderModifierKey = keyof SiegeState["modifiers"]["defender"];

export function getSiegeState(): SiegeState {
  return getState().siege;
}

export function subscribeToSiege(listener: SiegeListener): () => void {
  return subscribe((state) => listener(state.siege));
}

function mutateSiege(mutator: (draft: SiegeState) => void) {
  updateState((state) => {
    mutator(state.siege);
  });
}

export function updateForceField<K extends keyof SiegeForce>(force: ForceKey, field: K, value: SiegeForce[K]) {
  mutateSiege((draft) => {
    (draft[force][field] as SiegeForce[K]) = value;
  });
}

export function updateSiegeEngine(force: ForceKey, engine: EngineKey, value: number) {
  mutateSiege((draft) => {
    draft[force].siegeEngines[engine] = Math.max(0, value);
  });
}

export function updateTactic(role: ForceKey, tactic: SiegeTactic) {
  mutateSiege((draft) => {
    draft.tactics[role] = tactic;
  });
}

export function updateModifier(side: ModifierSide, key: AttackerModifierKey | DefenderModifierKey, value: boolean) {
  mutateSiege((draft) => {
    (draft.modifiers[side] as any)[key] = value;
  });
}

export function rollBattle() {
  const current = getSiegeState();
  const { logEntry } = resolveBattle(current);
  const recoveryDays = calculateRecoveryDays(logEntry.attackerLosses, logEntry.defenderLosses);
  if (recoveryDays > 0) {
    const trackerUnit = recoveryDays >= 14 ? "week" : "day";
    const duration = trackerUnit === "week" ? Math.max(1, Math.ceil(recoveryDays / 7)) : recoveryDays;
    const tracker = startTimedAction({
      name: `Siege Recovery: ${logEntry.winner}`,
      duration,
      unit: trackerUnit,
      kind: "siege",
      blocking: false,
    });
    if (tracker) {
      logEntry.recoveryTrackerId = tracker.trackerId;
      logEntry.recoveryReady = false;
      logEntry.recoveryDays = recoveryDays;
    }
  }
  mutateSiege((draft) => {
    draft.log.unshift(logEntry);
    draft.log = draft.log.slice(0, LOG_LIMIT);
  });
  return logEntry;
}

export function clearSiegeLog() {
  const state = getSiegeState();
  state.log.forEach((entry) => {
    if (entry.recoveryTrackerId) {
      cancelTimedAction(entry.recoveryTrackerId);
    }
  });
  mutateSiege((draft) => {
    draft.log = [];
  });
}

export function applySiegeCasualties(entryId: string) {
  mutateSiege((draft) => {
    const entry = draft.log.find((log) => log.id === entryId);
    if (!entry || entry.applied) {
      return;
    }
    if (entry.recoveryTrackerId && entry.recoveryReady === false) {
      return;
    }
    draft.attacker.troops = Math.max(0, draft.attacker.troops - entry.attackerLosses);
    draft.defender.troops = Math.max(0, draft.defender.troops - entry.defenderLosses);
    entry.applied = true;
  });
}

function calculateRecoveryDays(attackerLosses: number, defenderLosses: number): number {
  const total = attackerLosses + defenderLosses;
  if (total <= 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(total / 200));
}

onCalendarEvent((event) => {
  if (event.type !== "timers-expired") {
    return;
  }
  const trackerIds = new Set(event.trackers.filter((tracker) => tracker.kind === "siege").map((tracker) => tracker.id));
  if (!trackerIds.size) {
    return;
  }
  mutateSiege((draft) => {
    draft.log.forEach((entry) => {
      if (entry.recoveryTrackerId && trackerIds.has(entry.recoveryTrackerId)) {
        entry.recoveryTrackerId = null;
        entry.recoveryReady = true;
      }
    });
  });
});

// ============================================================================
// Data Export/Import
// ============================================================================

/**
 * Exports the siege state in the standardized module format.
 */
export function exportSiegeData(): string {
  const state = getSiegeState();
  return serializeModuleExport("siege", state);
}

/**
 * Imports siege data from JSON. Supports the standardized module format.
 */
export function importSiegeData(raw: string) {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid siege import file.");
  }

  if (payload.module === "siege" && payload.data) {
    const siegeData = payload.data as SiegeState;
    // Cancel any active recovery timers before importing
    const current = getSiegeState();
    current.log.forEach((entry) => {
      if (entry.recoveryTrackerId) {
        cancelTimedAction(entry.recoveryTrackerId);
      }
    });
    updateState((state) => {
      state.siege = normalizeSiegeState(siegeData);
    });
    return;
  }

  throw new Error("Unrecognized siege file format. Use the module export format.");
}

function normalizeSiegeState(data: Partial<SiegeState>): SiegeState {
  const defaults = createDefaultSiegeState();
  return {
    attacker: data.attacker ?? defaults.attacker,
    defender: data.defender ?? defaults.defender,
    tactics: data.tactics ?? defaults.tactics,
    modifiers: data.modifiers ?? defaults.modifiers,
    log: Array.isArray(data.log)
      ? data.log.slice(0, LOG_LIMIT).map((entry) => ({
          ...entry,
          recoveryTrackerId: null, // Reset tracker on import
        }))
      : [],
  };
}

