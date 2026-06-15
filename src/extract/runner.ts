/**
 * Extraction Runner — Programmatic Entry Point
 *
 * Exports `extractProvider` as a pure function that throws on error
 * rather than calling `process.exit()`. Used by src/electron-runner.ts
 * (spawned as a subprocess by the Electron pipeline bridge).
 */

import * as fs from "node:fs";
import { createBrowserProvider } from "../browser/index.js";
import { getAuthModule } from "../auth.js";
import { type ProviderConfig } from "../config.js";
import { loginOrRestoreSession } from "../auth/login-session.js";
import {
  getOutputDir,
  buildIndex,
  readNavNotes,
  getLastExtractedDate,
  setLastExtractedDate,
  type IncrementalSection,
} from "./helpers.js";
import { extractLabsDocs } from "./labs.js";
import { extractVisits } from "./visits.js";
import { extractMedications } from "./medications.js";
import { extractMessages } from "./messages.js";
import { type ExtractionContext } from "./context.js";
import { type StructuredProgressEvent, type ProgressCategory } from "../progress-events.js";

/** Optional callback for emitting structured progress events to the Electron parent. */
export type ProgressEmitter = (event: StructuredProgressEvent) => void;

// ---------------------------------------------------------------------------
// Per-section descriptor table
// ---------------------------------------------------------------------------

interface SectionEntry {
  /** Matches IncrementalSection and ProgressCategory. */
  key: IncrementalSection;
  /** Opening status message shown in the UI. */
  openMsg: string;
  /** Completion status message (receives the final count). */
  completeMsg: (count: number) => string;
  /** The extraction function for this section. */
  extractor: (ctx: ExtractionContext) => Promise<number>;
}

const SECTION_TABLE: SectionEntry[] = [
  {
    key: "labs",
    openMsg: "Opening lab results...",
    completeMsg: (n) => `Labs complete — ${n} records fetched`,
    extractor: extractLabsDocs,
  },
  {
    key: "visits",
    openMsg: "Opening visits...",
    completeMsg: (n) => `Visits complete — ${n} records fetched`,
    extractor: extractVisits,
  },
  {
    key: "medications",
    openMsg: "Opening medications...",
    completeMsg: (n) => `Medications complete — ${n} records fetched`,
    extractor: extractMedications,
  },
  {
    key: "messages",
    openMsg: "Opening messages...",
    completeMsg: (n) => `Messages complete — ${n} records fetched`,
    extractor: extractMessages,
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Run the full extraction pipeline for a single provider.
 * Throws on failure (does not call process.exit).
 *
 * @param provider        - Provider configuration
 * @param incremental     - Only fetch items newer than the last run
 * @param basePath        - Optional base output directory (Electron download folder).
 *                          Defaults to OUTPUT_BASE (CLI mode) when omitted.
 * @param emitProgress    - Optional callback for structured progress events (Electron mode only).
 */
export async function extractProvider(
  provider: ProviderConfig,
  incremental = false,
  basePath?: string,
  emitProgress?: ProgressEmitter,
): Promise<void> {
  const portalUrl = provider.url;
  const providerCredentials = provider.username || provider.password
    ? { username: provider.username, password: provider.password }
    : undefined;
  const authModule = getAuthModule(provider.auth, provider.id);

  // Helper: emit if we have a progress emitter (Electron mode)
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };

  console.log("=".repeat(60));
  console.log("  Fetchwell — Record Extraction");
  console.log(`  Provider: ${provider.name} (${provider.id})`);
  console.log("  Mode: stagehand-local");
  if (incremental) {
    console.log("  Incremental: ON (skipping items already extracted)");
  }
  console.log("=".repeat(60));
  console.log();

  const outputDir = getOutputDir(provider.id, basePath);
  fs.mkdirSync(outputDir, { recursive: true });

  console.log("[pipeline] Creating browser session...");
  const browser = await createBrowserProvider(undefined, process.env.ANTHROPIC_API_KEY);
  console.log("[pipeline] Browser session created!");

  const debugUrl = await browser.getDebugUrl();
  if (debugUrl) {
    console.log();
    console.log("+---------------------------------------------------------+");
    console.log("|  DEBUG URL — open this in your browser:                  |");
    console.log(`|  ${debugUrl}`);
    console.log("+---------------------------------------------------------+");
  } else if (process.env.HEADLESS !== 'true') {
    console.log("[pipeline] A browser window should have opened on your screen.");
  }
  console.log();

  try {
    // ── Phase: login ──────────────────────────────────────────────────────
    emit({ type: 'phase-change', phase: 'login', status: 'running', message: 'Logging in...' });
    emit({ type: 'status-message', phase: 'login', message: 'Getting ready to fetch records...' });

    // Step 3: Login or restore session
    // homeUrl = the authenticated dashboard URL (NOT the login page).
    // This is passed to extractors for agentic navigation fallback.
    // IMPORTANT: Do NOT navigate to portalUrl (the login URL) before checking
    // for a saved session — MyChart triggers ?action=logout when you visit the
    // login URL while already authenticated, destroying the session.
    const homeUrl = await loginOrRestoreSession(browser, {
      portalUrl,
      providerId: provider.id,
      basePath,
      authModule,
      credentials: providerCredentials,
      authenticatedSelectors: provider.authenticatedSelectors,
      emitProgress,
    });
    console.log(`[pipeline] Dashboard URL: ${homeUrl}`);
    console.log();

    emit({ type: 'phase-change', phase: 'login', status: 'complete', message: 'Logged in' });

    const navNotes = readNavNotes(outputDir);

    if (incremental) {
      const sections: IncrementalSection[] = ["labs", "visits", "medications", "messages"];
      console.log("[extract] Incremental cutoffs (items on/before these dates will be skipped):");
      for (const sec of sections) {
        const cutoff = getLastExtractedDate(outputDir, sec);
        console.log(`[extract]   ${sec.padEnd(12)}: ${cutoff?.toISOString() ?? "none (full run)"}`);
      }
      console.log();
    }

    // ── Phase: extract ────────────────────────────────────────────────────
    emit({ type: 'phase-change', phase: 'extract', status: 'running', message: 'Extracting records...' });

    for (const section of SECTION_TABLE) {
      const category = section.key as ProgressCategory;

      emit({ type: 'status-message', phase: 'extract', message: section.openMsg });
      emit({ type: 'item-progress', phase: 'extract', category, current: 0, message: `Extracting ${section.key}...` });

      const cutoff = incremental ? getLastExtractedDate(outputDir, section.key) : null;
      let count = 0;

      try {
        count = await section.extractor({
          browser,
          portalUrl: homeUrl,
          navNotes,
          credentials: providerCredentials,
          outputDir,
          providerId: provider.id,
          cutoff,
          incremental,
          authenticatedSelectors: provider.authenticatedSelectors,
          emitProgress,
        });
        if (count > 0) setLastExtractedDate(outputDir, section.key);
        emit({ type: 'status-message', phase: 'extract', message: section.completeMsg(count) });
        emit({ type: 'category-complete', phase: 'extract', category, count, status: 'complete' });
      } catch (err) {
        console.error(`[extract] ${section.key.charAt(0).toUpperCase() + section.key.slice(1)} section failed: ${err instanceof Error ? err.message : String(err)}`);
        emit({ type: 'status-message', phase: 'extract', message: `${section.key.charAt(0).toUpperCase() + section.key.slice(1)} section failed — continuing` });
        emit({ type: 'category-complete', phase: 'extract', category, count: 0, status: 'error' });
      }

      console.log();
    }

    buildIndex(outputDir, provider.id);

    emit({ type: 'status-message', phase: 'extract', message: 'All records fetched' });
    emit({ type: 'phase-change', phase: 'extract', status: 'complete', message: 'All records extracted' });

    console.log("=".repeat(60));
    console.log("  EXTRACTION COMPLETE");
    console.log("=".repeat(60));
    console.log();
    console.log(`  [ok] output/${provider.id}/labs-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/visits-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/medications-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/messages-${provider.id}.pdf`);
    console.log(`  [ok] output/${provider.id}/index.html  (upload PDFs to Claude.ai)`);
    console.log();
  } finally {
    console.log("[pipeline] Cleaning up session...");
    await browser.close();
    console.log("[pipeline] Done.");
  }
}
