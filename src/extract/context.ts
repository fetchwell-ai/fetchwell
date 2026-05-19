import { type BrowserProvider } from "../browser/interface.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events. */
export type ProgressEmitter = (event: StructuredProgressEvent) => void;

/**
 * Shared context object passed to all extraction functions.
 * Replaces the long positional parameter lists on extractLabsDocs,
 * extractVisits, extractMedications, and extractMessages.
 */
export interface ExtractionContext {
  /** The browser session to use for all page interactions. */
  browser: BrowserProvider;

  /** The authenticated portal home URL (post-login dashboard, not the login page). */
  portalUrl: string;

  /** Free-form navigation notes read from nav-notes.md; empty string if absent. */
  navNotes?: string;

  /** Portal credentials (username/password). Optional — some portals use SSO. */
  credentials?: { username?: string; password?: string };

  /** Base output directory for this provider (e.g. output/<providerId>/). */
  outputDir?: string;

  /** Provider identifier used for PDF filenames and session scoping. */
  providerId?: string;

  /**
   * Incremental cutoff date — items on or before this date will be skipped.
   * Null / undefined means no cutoff (full run).
   */
  cutoff?: Date | null;

  /** When true, skip sections that already have extracted PDFs (unless FORCE_* is set). */
  incremental?: boolean;

  /**
   * CSS selectors that indicate an authenticated page.
   * Used by ensureLoggedIn to decide whether a fresh login is required.
   */
  authenticatedSelectors?: string[];

  /** Optional callback for structured progress events (Electron mode only). */
  emitProgress?: ProgressEmitter;
}
