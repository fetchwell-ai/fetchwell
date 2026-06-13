import * as fs from "node:fs";
import * as path from "node:path";
import { getOutputBase } from "../paths.js";

/**
 * Increment this constant whenever prompt text changes that would make
 * cached nav-map entries stale (e.g. verifier instructions, act instructions,
 * or list/item instructions stored in nav-map sections).
 *
 * On load, if the stored version doesn't match NAV_MAP_VERSION, the nav-map
 * is treated as stale and cached URLs/steps are ignored — forcing fresh discovery.
 */
export const NAV_MAP_VERSION = 2;

export interface NavMapSection {
  steps: string[];           // act() instructions to navigate to this section
  url?: string;              // URL of the section page (for direct navigation on re-run)
  listInstruction?: string;  // observe() instruction to find items on the list page
  itemInstruction?: string;  // observe() instruction for drilling into individual items
}

export interface NavMap {
  version?: number;          // nav-map schema/prompt version (see NAV_MAP_VERSION)
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
  return path.join(getOutputBase(basePath), providerId, "nav-map.json");
}

/**
 * Load a previously saved nav-map for the given provider, or null if none exists.
 *
 * If `basePath` is provided, nav-map.json is looked up under `<basePath>/<providerId>/`.
 *
 * Version check: if the stored `version` field does not match `NAV_MAP_VERSION`,
 * the nav-map is treated as stale. The cached section URLs and steps are cleared
 * so extraction falls through to fresh agentic discovery, but non-prompt fields
 * (detectedLoginForm, portalName) are preserved.
 */
export function loadNavMap(providerId: string, basePath?: string): NavMap | null {
  try {
    const data = JSON.parse(fs.readFileSync(navMapPath(providerId, basePath), "utf8")) as NavMap;
    if (data.version !== NAV_MAP_VERSION) {
      console.log(
        `[nav-map] Version mismatch (stored=${data.version ?? "none"}, current=${NAV_MAP_VERSION}) — invalidating cached sections`,
      );
      return {
        ...data,
        version: NAV_MAP_VERSION,
        sections: {},
      };
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Save a nav-map to <basePath>/<providerId>/nav-map.json.
 *
 * Always stamps the current NAV_MAP_VERSION into the written file.
 * If `basePath` is omitted, falls back to the default OUTPUT_BASE.
 */
export function saveNavMap(navMap: NavMap, providerId: string, basePath?: string): void {
  const filePath = navMapPath(providerId, basePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify({ ...navMap, version: NAV_MAP_VERSION }, null, 2));
}
