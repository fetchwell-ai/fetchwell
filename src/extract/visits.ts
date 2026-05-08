import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  readDirSafe,
  makeVisitFilename,
  mergePdfs,
  navigateWithRetry,
  navigateToSection,
  logDepth,
  shouldSkipIncremental,
} from "./helpers.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/** Optional callback for emitting structured progress events. */
type ProgressEmitter = (event: StructuredProgressEvent) => void;

/**
 * Probe mode: navigate to visits list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeVisits(browser: BrowserProvider, portalUrl: string, probeDir: string, navNotes = "", credentials?: { username?: string; password?: string }, providerId?: string, authenticatedSelectors?: string[]): Promise<void> {
  console.log("[probe] Visits: navigating...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". It is usually in the top navigation bar or sidebar.';
  const defaultObserve = "Find all document links within past visit entries on this page. " +
    "Return links labeled 'After Visit Summary', 'Clinical notes', 'View notes', or similar document types. " +
    "Do NOT return the visit row or header entries themselves — only the document links inside each visit. " +
    "Return each link separately.";
  const { listInstruction } = await navigateToSection(browser, providerId, "visits", { act: fallbackAct });
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "visits");

  const observeInstruction = listInstruction ?? defaultObserve;
  const visitLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );

  console.log(`[probe] Visits: ${visitLinks.length} item(s) found`);
  visitLinks.slice(0, 5).forEach((link, i) => {
    console.log(`[probe]   ${i + 1}. ${link.description}`);
  });
  if (visitLinks.length > 5) {
    console.log(`[probe]   ... and ${visitLinks.length - 5} more`);
  }

  const ss = await browser.screenshot();
  fs.writeFileSync(path.join(probeDir, "visits.png"), Buffer.from(ss, "base64"));
  console.log(`[probe] Visits: screenshot saved to ${probeDir}/visits.png`);
}

/**
 * Returns the number of PDFs written in this run (0 if none extracted).
 * The caller should only record a timestamp in last-extracted.json when the count is > 0.
 */
export async function extractVisits(browser: BrowserProvider, portalUrl: string, navNotes = "", credentials?: { username?: string; password?: string }, outputDir?: string, providerId?: string, cutoff?: Date | null, incremental = false, authenticatedSelectors?: string[], emitProgress?: ProgressEmitter): Promise<number> {
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const baseDir = outputDir ?? process.cwd();
  const visitsDir = path.join(baseDir, "visits");
  fs.mkdirSync(visitsDir, { recursive: true });

  const existingPdfs = readDirSafe(visitsDir).filter((f) => f.endsWith(".pdf"));
  if (incremental && existingPdfs.length > 0 && process.env.FORCE_VISITS !== "1") {
    console.log(
      `Step 7: Visits already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_VISITS=1 to re-run).`,
    );
    return 0;
  }

  console.log("Step 7: Navigating to visits...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". It is usually in the top navigation bar or sidebar.';
  const defaultObserve = "Find all document links within past visit entries on this page. " +
    "Return links labeled 'After Visit Summary', 'Clinical notes', 'View notes', or similar document types. " +
    "Do NOT return the visit row or header entries themselves — only the document links inside each visit. " +
    "Return each link separately.";
  const { listInstruction } = await navigateToSection(browser, providerId, "visits", { act: fallbackAct });
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "visits");
  const observeInstruction = listInstruction ?? defaultObserve;
  const visitLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );
  console.log(`   Found ${visitLinks.length} visit document link(s).`);
  if (visitLinks.length > 0) {
    emit({ type: 'status-message', phase: 'extract', message: `Found ${visitLinks.length} visits to fetch...` });
  }

  if (visitLinks.length === 0) {
    console.log("   No visits found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(visitsDir, "visits-list.png"), Buffer.from(ss, "base64"));
    return 0;
  }

  const listUrl = await browser.url();
  const maxVisits = Math.min(visitLinks.length, 50);
  const savedFiles = readDirSafe(visitsDir);
  let extracted = 0;

  for (let i = 0; i < maxVisits; i++) {
    const link = visitLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (incremental && savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Visit ${i + 1}/${maxVisits}: already saved — skipping`);
      continue;
    }
    if (shouldSkipIncremental(link.description, cutoff ?? null)) {
      console.log(`   Visit ${i + 1}/${maxVisits}: before cutoff — skipping (${link.description})`);
      continue;
    }

    emit({ type: 'status-message', phase: 'extract', message: `Fetching ${link.description.slice(0, 60)}...` });
    console.log(`   Visit ${i + 1}/${maxVisits}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const pageTitle = await browser.title();
      const filename = makeVisitFilename(i, link.description, pageTitle || link.description, ".pdf", providerId);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        emit({ type: 'status-message', phase: 'extract', message: `Saving ${filename}...` });
        fs.writeFileSync(path.join(visitsDir, filename), pdfBuf);
        extracted++;
      }
      console.log(`      → saved ${filename}`);
    } catch (err: any) {
      console.log(`      → error: ${err?.message ?? err}`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(visitsDir, `visit-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`   Visits saved to ${visitsDir}`);
  const mergedFilename = providerId ? `visits-${providerId}.pdf` : "visits.pdf";
  await mergePdfs(visitsDir, path.join(baseDir, mergedFilename), "visits");
  return extracted;
}
