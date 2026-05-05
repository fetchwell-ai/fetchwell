import * as fs from "node:fs";
import * as path from "node:path";
import { OUTPUT_BASE } from "../extract/helpers.js";

export interface NavMapSection {
  steps: string[];           // act() instructions to navigate to this section
  listInstruction?: string;  // observe() instruction to find items on the list page
  itemInstruction?: string;  // observe() instruction for drilling into individual items
}

export interface NavMap {
  discoveredAt: string;      // ISO timestamp
  portalName: string;        // e.g. "Stanford MyHealth"
  sections: {
    labs?: NavMapSection;
    visits?: NavMapSection;
    medications?: NavMapSection;
    messages?: NavMapSection;
  };
}

/** Return the nav-map.json path for a given provider. */
function navMapPath(providerId: string): string {
  return path.join(OUTPUT_BASE, providerId, "nav-map.json");
}

/** Load a previously saved nav-map for the given provider, or null if none exists. */
export function loadNavMap(providerId: string): NavMap | null {
  try {
    const data = JSON.parse(fs.readFileSync(navMapPath(providerId), "utf8")) as NavMap;
    return data;
  } catch {
    return null;
  }
}

/** Save a nav-map to output/<providerId>/nav-map.json. */
export function saveNavMap(navMap: NavMap, providerId: string): void {
  const filePath = navMapPath(providerId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(navMap, null, 2));
}
