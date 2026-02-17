import { createId } from "../../utils/id";
import type { LabState } from "../../state/schema";
import { createDefaultLabState } from "../../state/schema";
import { getState, subscribe, updateState } from "../../state/store";
import { calculateLabExperiment, getLabItemLabel } from "./logic";
import { startTimedAction, cancelTimedAction } from "../calendar/actions";
import { onCalendarEvent } from "../calendar/state";
import { serializeModuleExport } from "../../utils/moduleExport";

const LAB_LOG_LIMIT = 30;

export type LabListener = (state: LabState) => void;

export interface ExperimentResult {
  success: boolean;
  roll?: number;
  chance?: number;
  error?: string;
}

export function getLabState(): LabState {
  return getState().lab;
}

export function subscribeToLab(listener: LabListener): () => void {
  return subscribe((state) => listener(state.lab));
}

function mutateLab(mutator: (draft: LabState) => void) {
  updateState((state) => {
    mutator(state.lab);
  });
}

export function updateLabCaster<K extends keyof LabState["caster"]>(field: K, value: LabState["caster"][K]) {
  mutateLab((draft) => {
    draft.caster[field] = value;
  });
}

export function updateLabResources<K extends keyof LabState["resources"]>(
  field: K,
  value: LabState["resources"][K],
) {
  mutateLab((draft) => {
    draft.resources[field] = value;
  });
}

export function updateLabWorkbench<K extends keyof LabState["workbench"]>(
  field: K,
  value: LabState["workbench"][K],
) {
  mutateLab((draft) => {
    draft.workbench[field] = value;
  });
}

export function acquireComponents(): { success: boolean; error?: string } {
  // In a real implementation, this might cost gold or require an adventure
  // For now, it's a simple toggle
  mutateLab((draft) => {
    draft.workbench.hasComponents = true;
  });
  return { success: true };
}

export function investInLibrary(amount = 1000): { success: boolean; error?: string } {
  const state = getLabState();
  if (amount <= 0) {
    return { success: false, error: "Invalid investment amount." };
  }
  if (state.resources.gold < amount) {
    return { success: false, error: "Insufficient gold for investment." };
  }
  mutateLab((draft) => {
    draft.resources.gold -= amount;
    draft.resources.libraryValue += amount;
  });
  return { success: true };
}

export function attemptExperiment(): ExperimentResult {
  const state = getLabState();
  if (state.activeTrackerId) {
    return { success: false, error: "Research already in progress via calendar timer." };
  }
  const calc = calculateLabExperiment(state);

  if (state.resources.gold < calc.cost) {
    return { success: false, error: "Insufficient gold for this experiment." };
  }
  if (!calc.componentsOk && calc.componentsRequired) {
    return { success: false, error: "Rare spell components required but not acquired." };
  }
  // No additional validation needed for spell research - requirements are checked in chance calculation

  const roll = Math.floor(Math.random() * 100) + 1;
  const success = roll <= calc.chance;
  const outcome: "success" | "fail" = success ? "success" : "fail";

  const entry = buildLogEntry({
    state,
    calc,
    roll,
    outcome,
  });

  mutateLab((draft) => {
    draft.resources.gold -= calc.cost;
    draft.log.unshift(entry);
    draft.log = draft.log.slice(0, LAB_LOG_LIMIT);
  });

  const trackerLabel =
    calc.mode === "spell"
      ? `Lab: Spell Research (${calc.timeWeeks} wk)`
      : `Lab: ${getLabItemLabel(state.workbench.itemType)} (${calc.timeWeeks} wk)`;
  const tracker = startTimedAction({
    name: trackerLabel,
    duration: Math.max(1, calc.timeWeeks),
    unit: "week",
    kind: "lab",
  });
  if (tracker) {
    mutateLab((draft) => {
      draft.activeTrackerId = tracker.trackerId;
    });
  }

  return { success, roll, chance: calc.chance };
}

function buildLogEntry({
  state,
  calc,
  roll,
  outcome,
}: {
  state: LabState;
  calc: ReturnType<typeof calculateLabExperiment>;
  roll: number;
  outcome: "success" | "fail";
}) {
  const itemLabel = getLabItemLabel(state.workbench.itemType);
  const action = calc.mode === "spell" ? "Spell Research" : itemLabel;
  const title =
    outcome === "success"
      ? calc.mode === "spell"
        ? "Spell Researched"
        : `${itemLabel} Created`
      : calc.mode === "spell"
        ? "Spell Research Failed"
        : `${itemLabel} Failed`;

  let description = `${action} attempt used ${calc.timeWeeks} week(s) and ${calc.cost.toLocaleString()} gp.`;
  description += ` Roll ${roll}/${calc.chance}% — ${outcome === "success" ? "success" : "failure"}.`;
  if (outcome === "fail" && roll >= 95) {
    description += " Catastrophic backlash rattles the lab!";
  }

  return {
    id: createId(),
    timestamp: Date.now(),
    title,
    description,
    itemType: state.workbench.itemType,
    outcome,
    roll,
    chance: calc.chance,
    weeks: calc.timeWeeks,
    cost: calc.cost,
  };
}

export function clearLabLog() {
  mutateLab((draft) => {
    draft.log = [];
  });
}

export function resetLabState() {
  mutateLab((draft) => {
    const defaults = createDefaultLabState();
    draft.caster = defaults.caster;
    draft.resources = defaults.resources;
    draft.workbench = defaults.workbench;
    draft.log = defaults.log;
    draft.activeTrackerId = defaults.activeTrackerId;
  });
}

onCalendarEvent((event) => {
  if (event.type !== "timers-expired") {
    return;
  }
  const expiredIds = new Set(event.trackers.filter((tracker) => tracker.kind === "lab").map((tracker) => tracker.id));
  if (!expiredIds.size) {
    return;
  }
  mutateLab((draft) => {
    if (draft.activeTrackerId && expiredIds.has(draft.activeTrackerId)) {
      draft.activeTrackerId = null;
    }
  });
});

// ============================================================================
// Data Export/Import
// ============================================================================

/**
 * Exports the lab state in the standardized module format.
 */
export function exportLabData(): string {
  const state = getLabState();
  return serializeModuleExport("lab", state);
}

/**
 * Imports lab data from JSON. Supports the standardized module format.
 */
export function importLabData(raw: string) {
  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid lab import file.");
  }

  if (payload.module === "lab" && payload.data) {
    const labData = payload.data as LabState;
    // Cancel any active timer before importing
    const current = getLabState();
    if (current.activeTrackerId) {
      cancelTimedAction(current.activeTrackerId);
    }
    updateState((state) => {
      state.lab = normalizeLabState(labData);
    });
    return;
  }

  throw new Error("Unrecognized lab file format. Use the module export format.");
}

function normalizeLabState(data: Partial<LabState>): LabState {
  const defaults = createDefaultLabState();
  return {
    caster: {
      name: data.caster?.name ?? defaults.caster.name,
      level: typeof data.caster?.level === "number" ? data.caster.level : defaults.caster.level,
      class: data.caster?.class === "cleric" ? "cleric" : "mu",
      mentalStat: typeof data.caster?.mentalStat === "number" ? data.caster.mentalStat : defaults.caster.mentalStat,
    },
    resources: {
      gold: typeof data.resources?.gold === "number" ? data.resources.gold : defaults.resources.gold,
      libraryValue: typeof data.resources?.libraryValue === "number" ? data.resources.libraryValue : defaults.resources.libraryValue,
    },
    workbench: data.workbench ?? defaults.workbench,
    log: Array.isArray(data.log) ? data.log.slice(0, LAB_LOG_LIMIT) : [],
    activeTrackerId: null, // Always reset tracker on import
  };
}

