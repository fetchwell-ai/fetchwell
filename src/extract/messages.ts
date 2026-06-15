import { makeItemFilename } from "./helpers.js";
import { type ExtractionContext } from "./context.js";
import { type BrowserProvider } from "../browser/interface.js";
import { MESSAGES_PROMPTS } from "../prompts.js";
import { extractListSection, probeListSection, type SectionSpec } from "./list-section.js";

// ---------------------------------------------------------------------------
// Messages SectionSpec
// ---------------------------------------------------------------------------

export const MESSAGES_SPEC: SectionSpec = {
  name: "Messages",
  sectionKey: "messages",
  subDir: "messages",
  mergedName: "messages",
  // FORCE_MSGS previously also deleted the messages directory before re-extracting.
  // That behavior has been removed to match FORCE_LABS/FORCE_VISITS (bypass-only).
  forceEnvVar: "FORCE_MSGS",
  fallbackAct: MESSAGES_PROMPTS.fallbackAct,
  defaultObserve: MESSAGES_PROMPTS.defaultObserve,
  makeFilename: (index, _description, pageTitle, providerId) => {
    // Use page title as the label for messages (consistent with prior behavior)
    return makeItemFilename(index, pageTitle || _description, ".pdf", providerId);
  },
  itemLabel: (_description, pageTitle, index) => {
    return pageTitle || _description || `message-${index + 1}`;
  },
  // Messages use act-first: try act() first, then fall back to clickSelector.
  // This matches the prior behavior where act() was the primary click mechanism.
  clickOrder: "act-first",
};

// ---------------------------------------------------------------------------
// Probe mode
// ---------------------------------------------------------------------------

/**
 * Probe mode: navigate to messages inbox, observe threads, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeMessages(
  browser: BrowserProvider,
  portalUrl: string,
  probeDir: string,
  navNotes = "",
  credentials?: { username?: string; password?: string },
  providerId?: string,
  authenticatedSelectors?: string[],
): Promise<void> {
  await probeListSection(
    MESSAGES_SPEC,
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
 *
 * Incremental skip: if <outputDir>/messages/ already has .pdf files and
 * incremental=true, the section is skipped unless FORCE_MSGS=1.
 * (This skip was missing in prior versions — messages now behaves like labs/visits.)
 */
export async function extractMessages(ctx: ExtractionContext): Promise<number> {
  return extractListSection(MESSAGES_SPEC, ctx);
}
