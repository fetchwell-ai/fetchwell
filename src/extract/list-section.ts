/**
 * Shared extraction engine for list-based portal sections (labs, visits, messages).
 *
 * All three sections follow the same pattern:
 *   1. Incremental skip check (bypass with FORCE_*)
 *   2. Login / session restore
 *   3. Navigate to section (3-tier: cached URL → steps → agentic search)
 *   4. observe() to find all item links
 *   5. For each item: click → wait → PDF → return to list
 *   6. mergePdfs into a single output PDF
 *
 * Callers supply a SectionSpec that describes the per-section differences
 * (name, filenames, prompts, click order, label extraction).
 *
 * Probe mode (probe: true) stops after observe() — logs item count + first 5
 * titles and saves a screenshot. No PDFs are written.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { ensureLoggedIn } from "../auth.js";
import {
  readDirSafe,
  mergePdfs,
  navigateWithRetry,
  navigateToSection,
  logDepth,
  shouldSkipIncremental,
  sleep,
} from "./helpers.js";
import { type ExtractionContext } from "./context.js";
import { type StructuredProgressEvent } from "../progress-events.js";

// ---------------------------------------------------------------------------
// Named constant for the per-section item cap
// ---------------------------------------------------------------------------

/**
 * Maximum number of items fetched per list section per run.
 * Items beyond this cap are silently ignored. The cap exists to prevent
 * runaway extraction on portals with very large histories.
 */
export const MAX_ITEMS_PER_SECTION = 50;

// ---------------------------------------------------------------------------
// SectionSpec type
// ---------------------------------------------------------------------------

/**
 * Per-section configuration for the shared extractListSection engine.
 *
 * Fields:
 *   name           — human-readable section name (used in log messages, filenames)
 *   sectionKey     — nav-map key ("labs" | "visits" | "messages")
 *   subDir         — subdirectory name under outputDir (e.g. "labs", "visits", "messages")
 *   mergedName     — base name for the merged PDF (e.g. "labs", "messages")
 *   forceEnvVar    — env var that bypasses the incremental skip (e.g. "FORCE_LABS")
 *   fallbackAct    — act() instruction used when no nav-map entry is available
 *   defaultObserve — observe() instruction used when no listInstruction in the nav-map
 *   makeFilename   — returns the PDF filename for a given item index, description, page title, and providerId
 *   itemLabel      — extract the human-readable label from description + page title (for logging/filename)
 *   clickOrder     — "selector-first" (labs/visits) or "act-first" (messages)
 */
export interface SectionSpec {
  name: string;
  sectionKey: "labs" | "visits" | "messages";
  subDir: string;
  mergedName: string;
  forceEnvVar: string;
  fallbackAct: string;
  defaultObserve: string;
  makeFilename: (index: number, description: string, pageTitle: string, providerId?: string) => string;
  itemLabel: (description: string, pageTitle: string, index: number) => string;
  /**
   * Click order for navigating to an item detail page.
   *
   * "selector-first" (labs, visits):
   *   Try clickSelector() → if URL unchanged, fall back to act().
   *   If URL still unchanged after both: log nav-failed, save screenshot, skip item.
   *
   * "act-first" (messages):
   *   Try act() → if URL unchanged and selector available, fall back to clickSelector().
   *   No nav-failed check — proceed even if URL hasn't changed (legacy behavior preserved).
   */
  clickOrder: "selector-first" | "act-first";
  /**
   * Override the per-run item cap. Defaults to MAX_ITEMS_PER_SECTION.
   * Intended for tests only — do not set in production SectionSpec tables.
   */
  maxItems?: number;
}

// ---------------------------------------------------------------------------
// Probe mode
// ---------------------------------------------------------------------------

/**
 * Navigate to the section, observe items, log count + first 5 titles,
 * save a screenshot. Does NOT extract any PDFs.
 */
export async function probeListSection(
  spec: SectionSpec,
  browser: ExtractionContext["browser"],
  portalUrl: string,
  probeDir: string,
  navNotes = "",
  credentials?: { username?: string; password?: string },
  providerId?: string,
  authenticatedSelectors?: string[],
): Promise<void> {
  console.log(`[probe] ${spec.name}: navigating...`);
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const { listInstruction } = await navigateToSection(
    browser,
    providerId,
    spec.sectionKey,
    { act: spec.fallbackAct },
    portalUrl,
  );
  await sleep(3000);

  await logDepth(browser, spec.name.toLowerCase());

  const observeInstruction = listInstruction ?? spec.defaultObserve;
  const items = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );

  console.log(`[probe] ${spec.name}: ${items.length} item(s) found`);
  items.slice(0, 5).forEach((link, i) => {
    console.log(`[probe]   ${i + 1}. ${link.description}`);
  });
  if (items.length > 5) {
    console.log(`[probe]   ... and ${items.length - 5} more`);
  }

  const ss = await browser.screenshot();
  fs.writeFileSync(
    path.join(probeDir, `${spec.subDir}.png`),
    Buffer.from(ss, "base64"),
  );
  console.log(`[probe] ${spec.name}: screenshot saved to ${probeDir}/${spec.subDir}.png`);
}

// ---------------------------------------------------------------------------
// Extraction engine
// ---------------------------------------------------------------------------

/**
 * Extract all items in a list section and merge them into a single PDF.
 *
 * Returns the number of PDFs written in this run (0 if skipped or nothing found).
 * The caller should only record a timestamp in last-extracted.json when count > 0.
 *
 * Incremental skip behavior (unified across all sections):
 *   When incremental=true and the section's sub-directory already contains .pdf files,
 *   the entire section is skipped unless the FORCE_* env var is set to "1".
 *
 *   FORCE_LABS / FORCE_VISITS / FORCE_MSGS all bypass the skip identically.
 *   (Previously FORCE_MSGS also deleted the directory; that behavior has been removed
 *   to match the bypass-only behavior of FORCE_LABS/FORCE_VISITS.)
 */
export async function extractListSection(
  spec: SectionSpec,
  ctx: ExtractionContext,
): Promise<number> {
  const {
    browser,
    portalUrl,
    navNotes = "",
    credentials,
    outputDir,
    providerId,
    cutoff,
    incremental = false,
    authenticatedSelectors,
    emitProgress,
  } = ctx;

  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };

  const baseDir = outputDir ?? process.cwd();
  const sectionDir = path.join(baseDir, spec.subDir);
  fs.mkdirSync(sectionDir, { recursive: true });

  // ── Incremental skip ──────────────────────────────────────────────────────
  const existingPdfs = readDirSafe(sectionDir).filter((f) => f.endsWith(".pdf"));
  if (incremental && existingPdfs.length > 0 && process.env[spec.forceEnvVar] !== "1") {
    console.log(
      `[extract] ${spec.name} already extracted (${existingPdfs.length} .pdf files) — skipping (${spec.forceEnvVar}=1 to re-run).`,
    );
    return 0;
  }

  // ── Navigate to section ───────────────────────────────────────────────────
  console.log(`[extract] Navigating to ${spec.name.toLowerCase()}...`);
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const { listInstruction, navigationFailed } = await navigateToSection(
    browser,
    providerId,
    spec.sectionKey,
    { act: spec.fallbackAct },
    portalUrl,
  );
  if (navigationFailed) {
    console.log(`[extract] ${spec.name}: navigation failed — skipping section.`);
    return 0;
  }
  await sleep(3000);

  // ── Observe items ─────────────────────────────────────────────────────────
  await logDepth(browser, spec.sectionKey);
  const observeInstruction = listInstruction ?? spec.defaultObserve;
  let items: Awaited<ReturnType<typeof browser.observe>>;
  try {
    items = await browser.observe(
      (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
    );
  } catch (err) {
    console.error(
      `[extract] ${spec.name}: observe() failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    try {
      const ss = await browser.screenshot();
      fs.writeFileSync(
        path.join(sectionDir, `${spec.subDir}-observe-error.png`),
        Buffer.from(ss, "base64"),
      );
    } catch { /* non-fatal */ }
    return 0;
  }

  console.log(`[extract] Found ${items.length} ${spec.name.toLowerCase()} item(s).`);
  if (items.length > 0) {
    emit({
      type: "status-message",
      phase: "extract",
      message: `Found ${items.length} ${spec.name.toLowerCase()} to fetch...`,
    });
  }

  if (items.length === 0) {
    console.log(`[extract] No ${spec.name.toLowerCase()} found — saving screenshot.`);
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(sectionDir, `${spec.subDir}-list.png`), Buffer.from(ss, "base64"));
    return 0;
  }

  // ── Item cap ──────────────────────────────────────────────────────────────
  const cap = spec.maxItems ?? MAX_ITEMS_PER_SECTION;
  const maxItems = Math.min(items.length, cap);
  if (items.length > cap) {
    console.log(
      `[extract] ${spec.name}: capping at ${cap} items (found ${items.length}; MAX_ITEMS_PER_SECTION=${MAX_ITEMS_PER_SECTION}).`,
    );
  }

  const listUrl = await browser.url();
  const savedFiles = readDirSafe(sectionDir);
  let extracted = 0;

  // ── Per-item loop ─────────────────────────────────────────────────────────
  for (let i = 0; i < maxItems; i++) {
    const link = items[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";

    // Skip already-saved items in incremental mode
    if (incremental && savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`[extract] ${spec.name} item ${i + 1}/${maxItems}: already saved — skipping`);
      continue;
    }

    // Skip items before the incremental cutoff date
    if (shouldSkipIncremental(link.description, cutoff ?? null)) {
      console.log(
        `[extract] ${spec.name} item ${i + 1}/${maxItems}: before cutoff — skipping (${link.description})`,
      );
      continue;
    }

    emit({
      type: "status-message",
      phase: "extract",
      message: `Downloading ${spec.name.toLowerCase()} item ${i + 1} of ${maxItems}...`,
    });
    console.log(`[extract] ${spec.name} item ${i + 1}/${maxItems}: ${link.description}`);

    try {
      const urlBefore = await browser.url();

      if (spec.clickOrder === "selector-first") {
        // ── Selector-first click (labs, visits) ────────────────────────────
        // Direct CSS/XPath click avoids redundant LLM calls and prompt-injection risk.
        if (browser.clickSelector && link.selector) {
          await browser.clickSelector(link.selector);
          await sleep(1000);
        }
        // Fall back to act() if selector click didn't navigate (or no selector available)
        if ((await browser.url()) === urlBefore) {
          await browser.act(`Click the element: ${link.description}`);
          await sleep(1000);
        }
        try { await browser.waitFor({ type: "networkIdle" }); } catch { /* non-fatal */ }

        // Verify navigation — skip PDF if still on the list page
        if ((await browser.url()) === urlBefore) {
          console.log(`[extract]   → navigation failed — skipping PDF, saving screenshot`);
          try {
            const ss = await browser.screenshot();
            fs.writeFileSync(
              path.join(sectionDir, `${String(i + 1).padStart(3, "0")}_nav-failed.png`),
              Buffer.from(ss, "base64"),
            );
          } catch { /* non-fatal */ }
          await navigateWithRetry(browser, listUrl);
          await sleep(1500);
          continue;
        }
      } else {
        // ── Act-first click (messages) ──────────────────────────────────────
        // act() first; fall back to clickSelector if it silently failed.
        await browser.act(`Click the element: ${link.description}`);
        await sleep(1000);
        // If act() silently failed (e.g. shadow DOM element), try direct selector click
        if ((await browser.url()) === urlBefore && browser.clickSelector && link.selector) {
          console.log(`[extract]   (act() didn't navigate — trying direct selector click)`);
          await browser.clickSelector(link.selector);
          await sleep(1000);
        }
        try { await browser.waitFor({ type: "networkIdle" }); } catch { /* non-fatal */ }
      }

      // ── Save PDF ──────────────────────────────────────────────────────────
      const pageTitle = await browser.title();
      const label = spec.itemLabel(link.description, pageTitle, i);
      const filename = spec.makeFilename(i, link.description, pageTitle, providerId);

      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        emit({
          type: "status-message",
          phase: "extract",
          message: `Downloading ${label.slice(0, 60)}...`,
        });
        fs.writeFileSync(path.join(sectionDir, filename), pdfBuf);
        extracted++;
        console.log(`[extract]   → saved ${filename}`);
      }
    } catch (err: unknown) {
      console.log(
        `[extract]   → error: ${err instanceof Error ? err.message : String(err)}`,
      );
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(
          path.join(sectionDir, `${String(i + 1).padStart(3, "0")}_error.png`),
          Buffer.from(ss, "base64"),
        );
      } catch { /* non-fatal */ }
    }

    await navigateWithRetry(browser, listUrl);
    await sleep(1500);
  }

  // ── Merge PDFs ────────────────────────────────────────────────────────────
  const mergedFilename = providerId
    ? `${spec.mergedName}-${providerId}.pdf`
    : `${spec.mergedName}.pdf`;
  await mergePdfs(sectionDir, path.join(baseDir, mergedFilename), spec.name.toLowerCase());
  return extracted;
}
