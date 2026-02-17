import { STATE_VERSION, type WarMachineState } from "../state/schema";

/**
 * Standard module names that match the keys in WarMachineState
 */
export type ModuleName =
  | "party"
  | "dominion"
  | "wilderness"
  | "calendar"
  | "siege"
  | "merchant"
  | "stronghold"
  | "treasure"
  | "lab"
  | "dungeon"
  | "ledger";

/**
 * Standard export payload format for individual modules.
 * This format is designed to be:
 * 1. Self-describing (includes module name and version)
 * 2. Compatible with the full campaign state structure
 * 3. Easy to merge back into an existing campaign
 */
export interface ModuleExportPayload<T> {
  exportedAt: string;
  module: ModuleName;
  schemaVersion: string;
  data: T;
}

/**
 * Creates a standardized export payload for a module.
 * The data should be the exact state slice from WarMachineState[module].
 */
export function createModuleExport<T>(module: ModuleName, data: T): ModuleExportPayload<T> {
  return {
    exportedAt: new Date().toISOString(),
    module,
    schemaVersion: STATE_VERSION,
    data,
  };
}

/**
 * Serializes a module export to a JSON string (pretty-printed).
 */
export function serializeModuleExport<T>(module: ModuleName, data: T): string {
  return JSON.stringify(createModuleExport(module, data), null, 2);
}

/**
 * Result of parsing an import file - either a full campaign or a single module.
 */
export type ParsedImport =
  | { type: "campaign"; state: WarMachineState }
  | { type: "module"; module: ModuleName; data: unknown };

/**
 * Parses a JSON import and determines if it's a full campaign or single module.
 * Returns a discriminated union so the caller can handle each case appropriately.
 */
export function parseImportPayload(raw: string): ParsedImport {
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON: ${(error as Error).message}`);
  }

  if (typeof payload !== "object" || payload === null) {
    throw new Error("Import payload must be an object");
  }

  const obj = payload as Record<string, unknown>;

  // Check if this is a full campaign export (has 'state' property with nested modules)
  if (obj.state && typeof obj.state === "object") {
    const state = obj.state as Record<string, unknown>;
    // Validate it has the meta property that all campaign exports have
    if (state.meta && typeof state.meta === "object") {
      return { type: "campaign", state: state as unknown as WarMachineState };
    }
  }

  // Check if this is a module export (has 'module' and 'data' properties)
  if (typeof obj.module === "string" && obj.data !== undefined) {
    const moduleName = obj.module as ModuleName;
    const validModules: ModuleName[] = [
      "party",
      "dominion",
      "wilderness",
      "calendar",
      "siege",
      "merchant",
      "stronghold",
      "treasure",
      "lab",
      "dungeon",
      "ledger",
    ];

    if (!validModules.includes(moduleName)) {
      throw new Error(`Unknown module type: ${moduleName}`);
    }

    return { type: "module", module: moduleName, data: obj.data };
  }

  throw new Error(
    "Unrecognized import format. Expected either a full campaign export or a module export."
  );
}

/**
 * Helper to generate a download filename for module exports.
 */
export function getModuleExportFilename(module: ModuleName): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `war-machine-${module}-${timestamp}.json`;
}

/**
 * Triggers a file download in the browser.
 */
export function triggerDownload(filename: string, payload: string) {
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

