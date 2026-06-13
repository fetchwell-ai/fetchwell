import * as fs from "node:fs";
import * as path from "node:path";
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
import { type ExtractionContext } from "./context.js";
import { type BrowserProvider } from "../browser/interface.js";
import { type StructuredProgressEvent } from "../progress-events.js";

/**
 * Probe mode: navigate to visits list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeVisits(browser: BrowserProvider, portalUrl: string, probeDir: string, navNotes = "", credentials?: { username?: string; password?: string }, providerId?: string, authenticatedSelectors?: string[]): Promise<void> {
  console.log("[probe] Visits: navigating...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Visits or Past Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". If you land on a page showing Upcoming appointments, click the Past tab. ' +
    'It is usually in the top navigation bar or sidebar. ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.';
  const defaultObserve = "Find all clickable past visit rows on this page. " +
    "Each entry is a row or link representing a specific past visit or after-visit summary. " +
    "Include the visit date exactly as shown. Return each one as a separate result.";
  const { listInstruction } = await navigateToSection(browser, providerId, "visits", { act: fallbackAct }, portalUrl);
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
export async function extractVisits(ctx: ExtractionContext): Promise<number> {
  const { browser, portalUrl, navNotes = "", credentials, outputDir, providerId, cutoff, incremental = false, authenticatedSelectors, emitProgress } = ctx;
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const baseDir = outputDir ?? process.cwd();
  const visitsDir = path.join(baseDir, "visits");
  fs.mkdirSync(visitsDir, { recursive: true });

  const existingPdfs = readDirSafe(visitsDir).filter((f) => f.endsWith(".pdf"));
  if (incremental && existingPdfs.length > 0 && process.env.FORCE_VISITS !== "1") {
    console.log(
      `[extract] Visits already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_VISITS=1 to re-run).`,
    );
    return 0;
  }

  console.log("[extract] Navigating to visits...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Click the Visits or Past Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". If you land on a page showing Upcoming appointments, click the Past tab. ' +
    'It is usually in the top navigation bar or sidebar. ' +
    'NEVER click Log Out, Sign Out, account settings, security settings, Compose Message, Send Message, ' +
    'Request Refill, Schedule Appointment, or any button that submits a form or sends data — ' +
    'only navigate to view existing records.';
  const defaultObserve = "Find all clickable past visit rows on this page. " +
    "Each entry is a row or link representing a specific past visit or after-visit summary. " +
    "Include the visit date exactly as shown. Return each one as a separate result.";
  const { listInstruction, navigationFailed } = await navigateToSection(browser, providerId, "visits", { act: fallbackAct }, portalUrl);
  if (navigationFailed) {
    console.log("[extract] Visits: navigation failed — skipping section.");
    return 0;
  }
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "visits");
  const observeInstruction = listInstruction ?? defaultObserve;
  let visitLinks: Awaited<ReturnType<typeof browser.observe>>;
  try {
    visitLinks = await browser.observe(
      (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
    );
  } catch (err) {
    console.error(`[extract] Visits: observe() failed: ${err instanceof Error ? err.message : String(err)}`);
    try {
      const ss = await browser.screenshot();
      fs.writeFileSync(path.join(visitsDir, "visits-observe-error.png"), Buffer.from(ss, "base64"));
    } catch {}
    return 0;
  }
  console.log(`[extract] Found ${visitLinks.length} visit document link(s).`);
  if (visitLinks.length > 0) {
    emit({ type: 'status-message', phase: 'extract', message: `Found ${visitLinks.length} visits to fetch...` });
  }

  if (visitLinks.length === 0) {
    console.log("[extract] No visits found — saving screenshot.");
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
      console.log(`[extract] Visit ${i + 1}/${maxVisits}: already saved — skipping`);
      continue;
    }
    if (shouldSkipIncremental(link.description, cutoff ?? null)) {
      console.log(`[extract] Visit ${i + 1}/${maxVisits}: before cutoff — skipping (${link.description})`);
      continue;
    }

    emit({ type: 'status-message', phase: 'extract', message: `Downloading visit ${i + 1} of ${maxVisits}...` });
    console.log(`[extract] Visit ${i + 1}/${maxVisits}: ${link.description}`);
    try {
      const urlBefore = await browser.url();
      // Selector-first: direct CSS/XPath click avoids redundant LLM calls and prompt-injection risk
      if (browser.clickSelector && link.selector) {
        await browser.clickSelector(link.selector);
        await new Promise((r) => setTimeout(r, 1000));
      }
      // Fall back to act() if selector click didn't navigate (or no selector available)
      if ((await browser.url()) === urlBefore) {
        await browser.act(`Click the element: ${link.description}`);
        await new Promise((r) => setTimeout(r, 1000));
      }
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      // Verify we actually navigated — skip PDF if still on the list page
      if ((await browser.url()) === urlBefore) {
        console.log(`[extract]   Navigation failed — skipping PDF, saving screenshot`);
        try {
          const ss = await browser.screenshot();
          fs.writeFileSync(path.join(visitsDir, `visit-${i + 1}-nav-failed.png`), Buffer.from(ss, "base64"));
        } catch {}
        await navigateWithRetry(browser, listUrl);
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }

      const pageTitle = await browser.title();
      const desc = link.description.toLowerCase().includes("shadow dom")
        ? (pageTitle || `visit-${i + 1}`)
        : link.description;
      const filename = makeVisitFilename(i, desc, pageTitle || desc, ".pdf", providerId);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        emit({ type: 'status-message', phase: 'extract', message: `Downloading ${desc.slice(0, 60)}...` });
        fs.writeFileSync(path.join(visitsDir, filename), pdfBuf);
        extracted++;
        console.log(`[extract]   Saved ${filename}`);
      }
    } catch (err: unknown) {
      console.log(`[extract]   Error: ${err instanceof Error ? err.message : String(err)}`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(visitsDir, `visit-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`[extract] Visits saved to ${visitsDir}`);
  const mergedFilename = providerId ? `visits-${providerId}.pdf` : "visits.pdf";
  await mergePdfs(visitsDir, path.join(baseDir, mergedFilename), "visits");
  return extracted;
}
