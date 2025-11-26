import type { StrongholdState } from "../../state/schema";
import { createDefaultStrongholdState } from "../../state/schema";
import { getState, subscribe, updateState } from "../../state/store";
import { getComponentById } from "./components";
import { buildStrongholdExportPayload, calculateStrongholdSummary, normalizeSelection } from "./logic";
import { startTimedAction, cancelTimedAction } from "../calendar/actions";
import { onCalendarEvent } from "../calendar/state";
import { createId } from "../../utils/id";

export type StrongholdListener = (state: StrongholdState) => void;

export function getStrongholdState(): StrongholdState {
  return getState().stronghold;
}

export function subscribeToStronghold(listener: StrongholdListener): () => void {
  return subscribe((state) => listener(state.stronghold));
}

function mutateStronghold(mutator: (draft: StrongholdState) => void) {
  updateState((state) => {
    mutator(state.stronghold);
  });
}

export function setStrongholdName(name: string) {
  mutateStronghold((draft) => {
    draft.projectName = name.trimStart();
  });
}

export function setTerrainModifier(modifier: number) {
  const safeValue = Number.isFinite(modifier) && modifier > 0 ? Number(modifier.toFixed(2)) : 1;
  mutateStronghold((draft) => {
    draft.terrainMod = safeValue;
  });
}

export function addComponent(componentId: string, quantity: number): boolean {
  const component = getComponentById(componentId);
  if (!component) {
    return false;
  }
  const normalizedQty = Math.max(1, Math.floor(quantity));
  mutateStronghold((draft) => {
    const existing = draft.components.find((entry) => entry.id === componentId);
    if (existing) {
      existing.qty = Math.max(1, existing.qty + normalizedQty);
    } else {
      draft.components.push(normalizeSelection({ id: componentId, qty: normalizedQty }));
    }
  });
  return true;
}

export function updateComponentQuantity(componentId: string, quantity: number) {
  mutateStronghold((draft) => {
    const selection = draft.components.find((entry) => entry.id === componentId);
    if (!selection) return;
    const normalizedQty = Math.max(0, Math.floor(quantity));
    if (normalizedQty <= 0) {
      draft.components = draft.components.filter((entry) => entry.id !== componentId);
      return;
    }
    selection.qty = normalizedQty;
  });
}

export function removeComponent(componentId: string) {
  mutateStronghold((draft) => {
    draft.components = draft.components.filter((entry) => entry.id !== componentId);
  });
}

export function resetStrongholdState() {
  const defaults = createDefaultStrongholdState();
  const current = getStrongholdState();
  if (current.activeTrackerId) {
    cancelTimedAction(current.activeTrackerId);
  }
  mutateStronghold((draft) => {
    draft.projectName = defaults.projectName;
    draft.terrainMod = defaults.terrainMod;
    draft.components = defaults.components;
    draft.projects = defaults.projects;
    draft.activeProjectId = defaults.activeProjectId;
    draft.activeTrackerId = defaults.activeTrackerId;
  });
}

export function exportStrongholdPlan(): string {
  const payload = buildStrongholdExportPayload(getStrongholdState());
  return JSON.stringify(payload, null, 2);
}

export function startStrongholdConstruction(): { success: boolean; error?: string } {
  const state = getStrongholdState();
  if (state.activeTrackerId) {
    return { success: false, error: "A construction project is already underway." };
  }
  const summary = calculateStrongholdSummary(state);
  if (!summary.items.length || summary.buildDays <= 0) {
    return { success: false, error: "Add at least one component before starting construction." };
  }
  const projectName = state.projectName?.trim() || "Stronghold Project";
  const durationDays = Math.max(1, summary.buildDays);
  const useWeeks = durationDays >= 14;
  const unit = useWeeks ? "week" : "day";
  const duration = useWeeks ? Math.max(1, Math.ceil(durationDays / 7)) : durationDays;
  const tracker = startTimedAction({
    name: `Stronghold: ${projectName}`,
    duration,
    unit,
    kind: "stronghold",
    blocking: true,
  });
  if (!tracker) {
    return { success: false, error: "Unable to attach construction timer to the calendar." };
  }
  const projectId = createId();
  mutateStronghold((draft) => {
    draft.activeTrackerId = tracker.trackerId;
    draft.activeProjectId = projectId;
    draft.projects.unshift({
      id: projectId,
      name: projectName,
      cost: summary.totalCost,
      status: "active",
      buildDays: summary.buildDays,
      startedAt: Date.now(),
      completedAt: null,
      trackerId: tracker.trackerId,
    });
    draft.components = [];
  });
  return { success: true };
}

export function cancelStrongholdConstruction(): boolean {
  const state = getStrongholdState();
  if (!state.activeTrackerId) {
    return false;
  }
  cancelTimedAction(state.activeTrackerId);
  mutateStronghold((draft) => {
    draft.projects.forEach((project) => {
      if (project.id === draft.activeProjectId) {
        project.status = "planned";
        project.trackerId = null;
        project.completedAt = null;
      }
    });
    draft.activeTrackerId = null;
    draft.activeProjectId = null;
  });
  return true;
}

onCalendarEvent((event) => {
  if (event.type !== "timers-expired") {
    return;
  }
  const completed = event.trackers.filter((tracker) => tracker.kind === "stronghold");
  if (!completed.length) {
    return;
  }
  const trackerIds = new Set(completed.map((tracker) => tracker.id));
  mutateStronghold((draft) => {
    if (draft.activeTrackerId && trackerIds.has(draft.activeTrackerId)) {
      draft.activeTrackerId = null;
      draft.activeProjectId = null;
    }
    draft.projects.forEach((project) => {
      if (project.trackerId && trackerIds.has(project.trackerId)) {
        project.status = "complete";
        project.completedAt = Date.now();
        project.trackerId = null;
      }
    });
  });
});

