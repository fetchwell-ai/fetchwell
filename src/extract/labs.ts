import { makeItemFilename } from "./helpers.js";
import { type ExtractionContext } from "./context.js";
import { type BrowserProvider } from "../browser/interface.js";
import { LABS_PROMPTS } from "../prompts.js";
import { extractListSection, probeListSection, type SectionSpec } from "./list-section.js";

// ---------------------------------------------------------------------------
// Labs SectionSpec
// ---------------------------------------------------------------------------

export const LABS_SPEC: SectionSpec = {
  name: "Labs",
  sectionKey: "labs",
  subDir: "labs",
  mergedName: "labs",
  forceEnvVar: "FORCE_LABS",
  fallbackAct: LABS_PROMPTS.fallbackAct,
  defaultObserve: LABS_PROMPTS.defaultObserve,
  makeFilename: (index, description, _pageTitle, providerId) => {
    // Strip section qualifiers from the label (e.g. "(Lab)", "(Imaging)")
    const label = description
      .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
    return makeItemFilename(index, label, ".pdf", providerId);
  },
  itemLabel: (description, pageTitle, _index) => {
    let label = description
      .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
    if (!label || label.toLowerCase().includes("shadow dom")) {
      label = pageTitle || "lab-result";
    }
    return label;
  },
  clickOrder: "selector-first",
};

// ---------------------------------------------------------------------------
// Probe mode
// ---------------------------------------------------------------------------

/**
 * Probe mode: navigate to labs list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeLabsDocs(
  browser: BrowserProvider,
  portalUrl: string,
  probeDir: string,
  navNotes = "",
  credentials?: { username?: string; password?: string },
  providerId?: string,
  authenticatedSelectors?: string[],
): Promise<void> {
  await probeListSection(
    LABS_SPEC,
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
 * Drill into every lab/test-result panel and save each one as a PDF.
 * Merges all into <outputDir>/labs.pdf for Claude.ai upload.
 *
 * Skip (incremental mode only): if <outputDir>/labs/ already has .pdf files
 * (set FORCE_LABS=1 to re-run).
 *
 * Returns the number of PDFs written in this run (0 if none extracted).
 * The caller should only record a timestamp in last-extracted.json when count > 0.
 */
export async function extractLabsDocs(ctx: ExtractionContext): Promise<number> {
  return extractListSection(LABS_SPEC, ctx);
}
