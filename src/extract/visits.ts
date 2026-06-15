import { makeVisitFilename } from "./helpers.js";
import { type ExtractionContext } from "./context.js";
import { type BrowserProvider } from "../browser/interface.js";
import { VISITS_PROMPTS } from "../prompts.js";
import { extractListSection, probeListSection, type SectionSpec } from "./list-section.js";

// ---------------------------------------------------------------------------
// Visits SectionSpec
// ---------------------------------------------------------------------------

export const VISITS_SPEC: SectionSpec = {
  name: "Visits",
  sectionKey: "visits",
  subDir: "visits",
  mergedName: "visits",
  forceEnvVar: "FORCE_VISITS",
  fallbackAct: VISITS_PROMPTS.fallbackAct,
  defaultObserve: VISITS_PROMPTS.defaultObserve,
  makeFilename: (index, description, pageTitle, providerId) => {
    // Use description if non-empty; fall back to pageTitle
    const desc = description.toLowerCase().includes("shadow dom")
      ? (pageTitle || description)
      : description;
    return makeVisitFilename(index, desc, pageTitle || desc, ".pdf", providerId);
  },
  itemLabel: (description, pageTitle, _index) => {
    return description.toLowerCase().includes("shadow dom")
      ? (pageTitle || description)
      : description;
  },
  clickOrder: "selector-first",
};

// ---------------------------------------------------------------------------
// Probe mode
// ---------------------------------------------------------------------------

/**
 * Probe mode: navigate to visits list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeVisits(
  browser: BrowserProvider,
  portalUrl: string,
  probeDir: string,
  navNotes = "",
  credentials?: { username?: string; password?: string },
  providerId?: string,
  authenticatedSelectors?: string[],
): Promise<void> {
  await probeListSection(
    VISITS_SPEC,
    browser,
    portalUrl,
    probeDir,
    navNotes,
    credentials,
    providerId,
    authenticatedSelectors,
  );
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Returns the number of PDFs written in this run (0 if none extracted).
 * The caller should only record a timestamp in last-extracted.json when count > 0.
 */
export async function extractVisits(ctx: ExtractionContext): Promise<number> {
  return extractListSection(VISITS_SPEC, ctx);
}
