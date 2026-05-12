import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";
import { PDFDocument } from "pdf-lib";
import { type BrowserProvider } from "../browser/interface.js";
import { loadNavMap, saveNavMap } from "../discover/nav-map.js";
import { loadSavedSession } from "../session.js";
import { SECTION_INSTRUCTIONS, VERIFY_INSTRUCTIONS } from "../discover/index.js";

/** Default base output directory (parent of all provider-scoped dirs). */
export const OUTPUT_BASE = path.resolve(import.meta.dirname, "..", "..", "output");

/**
 * @deprecated Use getOutputDir(providerId) for provider-scoped output.
 * Kept temporarily so any transient callers still compile.
 */
export const OUTPUT_DIR = OUTPUT_BASE;

/**
 * Return the provider-scoped output directory: <basePath>/<providerId>/
 *
 * If `basePath` is omitted, falls back to the default `OUTPUT_BASE`
 * (dirname-relative), preserving backward compatibility for CLI mode.
 */
export function getOutputDir(providerId: string, basePath?: string): string {
  const base = basePath ?? OUTPUT_BASE;
  return path.join(base, providerId);
}

export function readNavNotes(outputDir?: string): string {
  const dir = outputDir ?? OUTPUT_BASE;
  const navNotesPath = path.join(dir, "nav-notes.md");
  try {
    const contents = fs.readFileSync(navNotesPath, "utf8");
    console.log(`   Nav notes loaded from ${navNotesPath}`);
    return contents;
  } catch {
    return "";
  }
}

export function readDirSafe(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

export function makeItemFilename(index: number, label: string, ext = ".pdf", providerId?: string): string {
  const suffix = providerId ? `-${providerId}` : "";
  return `${String(index + 1).padStart(3, "0")}_${slugify(label)}${suffix}${ext}`;
}

/**
 * Format a Date as a short slug like "aug-02-2024".
 * Used to embed human-readable dates into PDF filenames.
 */
export function formatDateSlug(date: Date): string {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Build a visit PDF filename that includes the visit description and date.
 *
 * Uses `description` (from the observe result) to extract date and visit info.
 * Falls back to `makeItemFilename(index, fallbackLabel, ext, providerId)` when
 * neither a date nor useful description can be extracted.
 *
 * Example output: `001_office-visit-dr-smith-aug-02-2024-stanford.pdf`
 */
export function makeVisitFilename(
  index: number,
  description: string,
  fallbackLabel: string,
  ext = ".pdf",
  providerId?: string,
): string {
  const suffix = providerId ? `-${providerId}` : "";
  const prefix = String(index + 1).padStart(3, "0") + "_";

  // Try to parse a date from the description
  const date = parseItemDate(description);

  // Use description if non-empty and more informative than the fallback
  const labelSource = description.trim() || fallbackLabel;

  if (!date) {
    // No date found — just use the description as label (same as makeItemFilename)
    return `${prefix}${slugify(labelSource)}${suffix}${ext}`;
  }

  const dateSlug = formatDateSlug(date);

  // Remove the raw date patterns from the label to avoid duplication
  const cleanedLabel = labelSource
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g, "")   // MM/DD/YYYY
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, "")           // YYYY-MM-DD
    .replace(/\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}[,\s]+\d{4}\b/gi, "")
    .replace(/\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/gi, "")
    .trim();

  const labelSlug = slugify(cleanedLabel || fallbackLabel);
  return `${prefix}${labelSlug}-${dateSlug}${suffix}${ext}`;
}

/** Merge all .pdf files in pdfDir into a single PDF at outputPath. */
export async function mergePdfs(pdfDir: string, outputPath: string, label: string): Promise<void> {
  const pdfFiles = readDirSafe(pdfDir).filter((f) => f.endsWith(".pdf")).sort();
  if (pdfFiles.length === 0) return;
  console.log(`   Merging ${pdfFiles.length} PDFs → ${path.basename(outputPath)}...`);
  const merged = await PDFDocument.create();
  for (const pdfFile of pdfFiles) {
    try {
      const bytes = fs.readFileSync(path.join(pdfDir, pdfFile));
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch (err: any) {
      console.log(`      → skipping ${pdfFile}: ${err?.message}`);
    }
  }
  const mergedBytes = await merged.save();
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`   ✓ ${path.basename(outputPath)} (${pdfFiles.length} ${label}, ${(mergedBytes.length / 1024).toFixed(0)} KB)`);
}

export async function logDepth(browser: BrowserProvider, section: string): Promise<void> {
  const url = await browser.url();
  const title = await browser.title();
  console.log(`[probe] ${section} | ${url} | ${title}`);
}

export async function navigateWithRetry(browser: BrowserProvider, url: string): Promise<void> {
  try {
    await browser.navigate(url);
  } catch (err: any) {
    const isNetworkError = /ERR_TIMED_OUT|ERR_CONNECTION|net::ERR/i.test(err?.message ?? "");
    if (!isNetworkError) throw err;
    console.log(`   Navigation failed (${err.message?.slice(0, 60)}...) — retrying in 5s`);
    await new Promise((r) => setTimeout(r, 5000));
    await browser.navigate(url);
  }
}

export function buildIndex(outputDir?: string, providerId?: string): void {
  const dir = outputDir ?? OUTPUT_BASE;
  const suffix = providerId ? `-${providerId}` : "";
  const sections: Array<{ name: string; pdf: string }> = [
    { name: "Lab Results", pdf: `labs${suffix}.pdf` },
    { name: "Visits", pdf: `visits${suffix}.pdf` },
    { name: "Medications", pdf: `medications${suffix}.pdf` },
    { name: "Messages", pdf: `messages${suffix}.pdf` },
  ];

  let body = `<h1>Health Records</h1>\n`;
  body += `<p class="meta">Generated: ${new Date().toISOString()}</p>\n`;
  body += `<p>Upload these PDF files to Claude.ai to analyze your records.</p>\n<ul>\n`;

  for (const { name, pdf } of sections) {
    const pdfPath = path.join(dir, pdf);
    if (fs.existsSync(pdfPath)) {
      const size = (fs.statSync(pdfPath).size / 1024).toFixed(0);
      body += `  <li><a href="${pdf}">${name}</a> — ${size} KB</li>\n`;
    }
  }
  body += `</ul>\n`;

  const css = `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1 { color: #0056b3; }
  .meta { font-size: 0.8em; color: #666; margin-bottom: 16px; }
  a { color: #0056b3; }
  li { margin: 10px 0; font-size: 1.1em; }`.trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Health Records</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  const relPath = path.relative(OUTPUT_BASE, dir);
  console.log(`   Index saved to output/${relPath}/index.html`);
}

type SectionName = "labs" | "visits" | "medications" | "messages";

/** Zod schema for page verification during resilient section navigation. */
const VerifySchema = z.object({ isCorrectPage: z.boolean(), description: z.string() });

/**
 * Verify that the browser is currently on the expected section page.
 * Uses browser.extract() with the same instructions as the discovery engine.
 */
async function verifySectionPage(
  browser: BrowserProvider,
  section: SectionName,
): Promise<boolean> {
  try {
    const result = await browser.extract(VerifySchema, VERIFY_INSTRUCTIONS[section]);
    console.log(`   Page verification: ${result.isCorrectPage} — ${result.description.slice(0, 100)}`);
    return result.isCorrectPage;
  } catch (err: any) {
    console.log(`   Page verification failed (extract error): ${err?.message?.slice(0, 80)}`);
    return false;
  }
}

/**
 * Navigate to a section using a three-tier resilient strategy:
 *
 * 1. Try the cached URL from the nav-map (fast path, skips act() calls).
 *    Verify with browser.extract() that the page is correct.
 * 2. If URL is stale/missing: replay the nav-map steps (act() instructions).
 *    Verify again.
 * 3. If steps also fail: do a fresh agentic search from homeUrl using the
 *    same SECTION_INSTRUCTIONS as the discovery engine.
 *    On success, update the nav-map with the new URL/steps for next time.
 * 4. If all three approaches fail: log a clear error and return
 *    { listInstruction: undefined, navigationFailed: true } — caller skips the section.
 *
 * Returns { listInstruction?, navigationFailed? } from the nav-map if present.
 */
export async function navigateToSection(
  browser: BrowserProvider,
  providerId: string | undefined,
  section: SectionName,
  fallback: { act: string; observe?: string },
  homeUrl?: string,
  basePath?: string,
): Promise<{ listInstruction?: string; navigationFailed?: boolean }> {
  const navMap = providerId ? loadNavMap(providerId, basePath) : null;
  const entry = navMap?.sections?.[section];

  // Resolve the authenticated dashboard URL for agentic navigation.
  // The caller may pass the portal login URL, which would log us out if navigated to.
  // Always prefer the session's saved homeUrl (the post-login dashboard).
  const session = providerId ? loadSavedSession(providerId, basePath) : null;
  if (session?.homeUrl) {
    homeUrl = session.homeUrl;
  }

  // ── Tier 1: Try cached URL ──────────────────────────────────────────────
  if (entry?.url) {
    console.log(`   [nav] ${section}: trying cached URL ${entry.url}`);
    try {
      await browser.navigate(entry.url);
      await new Promise((r) => setTimeout(r, 2000));
      const isCorrect = await verifySectionPage(browser, section);
      if (isCorrect) {
        console.log(`   [nav] ${section}: cached URL valid`);
        return { listInstruction: entry.listInstruction };
      }
      console.log(`   [nav] ${section}: cached URL stale, falling back to nav-map steps`);
    } catch (err: any) {
      console.log(`   [nav] ${section}: cached URL navigation error: ${err?.message?.slice(0, 80)}`);
    }
  }

  // ── Tier 2: Replay nav-map steps ────────────────────────────────────────
  if (entry && entry.steps.length > 0) {
    console.log(`   [nav] ${section}: replaying ${entry.steps.length} nav-map step(s)`);
    try {
      // Navigate home before replaying steps so we start from a known state
      if (homeUrl) {
        await browser.navigate(homeUrl);
        await new Promise((r) => setTimeout(r, 2000));
      }
      for (const step of entry.steps) {
        await browser.act(step);
      }
      await new Promise((r) => setTimeout(r, 2000));
      const isCorrect = await verifySectionPage(browser, section);
      if (isCorrect) {
        // Steps worked — update the URL in the nav-map so the fast path works next time
        const newUrl = await browser.url();
        console.log(`   [nav] ${section}: steps succeeded, updating nav-map URL to ${newUrl}`);
        if (providerId && navMap) {
          const updatedNavMap = {
            ...navMap,
            sections: {
              ...navMap.sections,
              [section]: { ...entry, url: newUrl },
            },
          };
          try { saveNavMap(updatedNavMap, providerId, basePath); } catch { /* non-fatal */ }
        }
        return { listInstruction: entry.listInstruction };
      }
      console.log(`   [nav] ${section}: steps did not reach the correct page, trying agentic search`);
    } catch (err: any) {
      console.log(`   [nav] ${section}: steps replay error: ${err?.message?.slice(0, 80)}`);
    }
  } else if (!entry) {
    // No nav-map entry at all — fall through to agentic search or hardcoded fallback
    console.log(`   [nav] ${section}: no nav-map entry, trying agentic search`);
  }

  // ── Tier 3: Agentic search from home ────────────────────────────────────
  const searchHomeUrl = homeUrl;
  if (searchHomeUrl) {
    console.log(`   [nav] ${section}: starting agentic search from ${searchHomeUrl}`);
    const instructions = SECTION_INSTRUCTIONS[section];
    for (let attempt = 0; attempt < instructions.length; attempt++) {
      const actInstruction = instructions[attempt];
      try {
        await browser.navigate(searchHomeUrl);
        await new Promise((r) => setTimeout(r, 2000));
        await browser.act(actInstruction);
        await new Promise((r) => setTimeout(r, 3000));
        const isCorrect = await verifySectionPage(browser, section);
        if (isCorrect) {
          const newUrl = await browser.url();
          console.log(`   [nav] ${section}: agentic search found section at ${newUrl}`);
          // Update nav-map with new URL and instruction
          if (providerId && navMap) {
            const existingEntry = navMap.sections?.[section];
            const updatedNavMap = {
              ...navMap,
              sections: {
                ...navMap.sections,
                [section]: {
                  ...(existingEntry ?? {}),
                  steps: [actInstruction],
                  url: newUrl,
                  listInstruction: existingEntry?.listInstruction,
                  itemInstruction: existingEntry?.itemInstruction,
                },
              },
            };
            try {
              saveNavMap(updatedNavMap, providerId, basePath);
              console.log(`   [nav] ${section}: nav-map updated with new URL`);
            } catch { /* non-fatal */ }
          }
          return { listInstruction: entry?.listInstruction };
        }
      } catch (err: any) {
        console.log(`   [nav] ${section}: agentic attempt ${attempt + 1} error: ${err?.message?.slice(0, 80)}`);
      }
    }
    console.log(`   [nav] ${section}: agentic search exhausted all attempts`);
  } else {
    // No homeUrl available — try the hardcoded fallback act() as a last resort
    console.log(`   [nav] ${section}: no homeUrl for agentic search, trying hardcoded fallback`);
    try {
      await browser.act(fallback.act);
      return {};
    } catch (err: any) {
      console.log(`   [nav] ${section}: hardcoded fallback error: ${err?.message?.slice(0, 80)}`);
    }
  }

  // ── All tiers failed ────────────────────────────────────────────────────
  console.error(`   [nav] ERROR: Could not navigate to ${section} — all strategies exhausted. Skipping section.`);
  return { navigationFailed: true };
}

// ---------------------------------------------------------------------------
// Incremental extraction helpers
// ---------------------------------------------------------------------------

/** Section names that support incremental extraction. */
export type IncrementalSection = "labs" | "visits" | "medications" | "messages";

interface LastExtractedData {
  [section: string]: string; // ISO 8601 timestamp
}

/** Path to the last-extracted.json file for a given provider output directory. */
function lastExtractedPath(outputDir: string): string {
  return path.join(outputDir, "last-extracted.json");
}

/**
 * Read the last extraction date for a section from last-extracted.json.
 * Returns a Date if a previous extraction timestamp exists, or null if not.
 */
export function getLastExtractedDate(outputDir: string, section: IncrementalSection): Date | null {
  try {
    const raw = fs.readFileSync(lastExtractedPath(outputDir), "utf8");
    const data: LastExtractedData = JSON.parse(raw);
    const ts = data[section];
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Record the current time as the last extraction timestamp for a section.
 * Writes (or updates) last-extracted.json in the provider output directory.
 */
export function setLastExtractedDate(outputDir: string, section: IncrementalSection): void {
  let data: LastExtractedData = {};
  try {
    const raw = fs.readFileSync(lastExtractedPath(outputDir), "utf8");
    data = JSON.parse(raw);
  } catch {
    // File doesn't exist or is malformed — start fresh
  }
  data[section] = new Date().toISOString();
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(lastExtractedPath(outputDir), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Attempt to parse a date from a portal item description string.
 * Portal descriptions typically include dates like "CBC 04/28/2026" or
 * "Annual Physical 2026-01-15". Returns a Date if a date is found, or null
 * if no recognisable date pattern is present.
 *
 * This helper is intentionally permissive: if date parsing fails we return
 * null so the caller falls back to extracting the item rather than skipping.
 */
export function parseItemDate(description: string): Date | null {
  if (!description) return null;

  // MM/DD/YYYY  or  M/D/YYYY
  const slashMatch = description.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const d = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[1]) - 1,
      Number(slashMatch[2]),
    );
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD
  const isoMatch = description.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const d = new Date(
      Number(isoMatch[1]),
      Number(isoMatch[2]) - 1,
      Number(isoMatch[3]),
    );
    if (!isNaN(d.getTime())) return d;
  }

  // Month name: "Jan 15, 2026", "January 15 2026", "15 Jan 2026"
  const monthNames =
    "january|february|march|april|may|june|july|august|september|october|november|december|" +
    "jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";
  const longMatch = description.match(
    new RegExp(
      `\\b(\\d{1,2})\\s+(?:${monthNames})\\s+(\\d{4})\\b|\\b(?:${monthNames})\\s+(\\d{1,2})[,\\s]+(\\d{4})\\b`,
      "i",
    ),
  );
  if (longMatch) {
    const d = new Date(longMatch[0]);
    if (!isNaN(d.getTime())) return d;
  }

  return null;
}

/**
 * Return true if the item described by `description` should be skipped
 * because its date is on or before the incremental cutoff.
 *
 * Always returns false (extract the item) when:
 *   - `cutoff` is null (no previous extraction / full run)
 *   - the item date cannot be parsed from `description`
 */
export function shouldSkipIncremental(description: string, cutoff: Date | null): boolean {
  if (!cutoff) return false;
  const itemDate = parseItemDate(description);
  if (!itemDate) return false; // cannot determine date — extract to be safe
  // Normalise both dates to midnight for day-level comparison
  const itemDay = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime();
  const cutoffDay = new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate()).getTime();
  return itemDay <= cutoffDay;
}
