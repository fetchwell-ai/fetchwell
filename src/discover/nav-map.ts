import * as fs from "node:fs";
import * as path from "node:path";
import { OUTPUT_BASE } from "../extract/helpers.js";

export interface NavMapSection {
  steps: string[];           // act() instructions to navigate to this section
  url?: string;              // URL of the section page (for direct navigation on re-run)
  listInstruction?: string;  // observe() instruction to find items on the list page
  itemInstruction?: string;  // observe() instruction for drilling into individual items
}

export interface NavMap {
  discoveredAt: string;      // ISO timestamp
  portalName: string;        // e.g. "Stanford MyHealth"
  /** Login form strategy detected during first discovery run. */
  detectedLoginForm?: "two-step" | "single-page";
  sections: {
    labs?: NavMapSection;
    visits?: NavMapSection;
    medications?: NavMapSection;
    messages?: NavMapSection;
  };
}

/**
 * Return the nav-map.json path for a given provider.
 *
 * If `basePath` is provided it is used as the parent output directory;
 * otherwise falls back to the dirname-relative OUTPUT_BASE default.
 */
function navMapPath(providerId: string, basePath?: string): string {
  const base = basePath ?? OUTPUT_BASE;
  return path.join(base, providerId, "nav-map.json");
}

/**
 * Load a previously saved nav-map for the given provider, or null if none exists.
 *
 * If `basePath` is provided, nav-map.json is looked up under `<basePath>/<providerId>/`.
 */
export function loadNavMap(providerId: string, basePath?: string): NavMap | null {
  try {
    const data = JSON.parse(fs.readFileSync(navMapPath(providerId, basePath), "utf8")) as NavMap;
    return data;
  } catch {
    return null;
  }
}

/**
 * Save a nav-map to <basePath>/<providerId>/nav-map.json.
 *
 * If `basePath` is omitted, falls back to the default OUTPUT_BASE.
 */
export function saveNavMap(navMap: NavMap, providerId: string, basePath?: string): void {
  const filePath = navMapPath(providerId, basePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(navMap, null, 2));
}
