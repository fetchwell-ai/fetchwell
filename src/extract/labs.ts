import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  readDirSafe,
  makeItemFilename,
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
 * Probe mode: navigate to labs list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeLabsDocs(browser: BrowserProvider, portalUrl: string, probeDir: string, navNotes = "", credentials?: { username?: string; password?: string }, providerId?: string, authenticatedSelectors?: string[]): Promise<void> {
  console.log("[probe] Labs: navigating...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.';
  const defaultObserve = "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Return each one as a separate result.";
  const { listInstruction } = await navigateToSection(browser, providerId, "labs", { act: fallbackAct });
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "labs");

  const observeInstruction = listInstruction ?? defaultObserve;
  const panelLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );

  console.log(`[probe] Labs: ${panelLinks.length} item(s) found`);
  panelLinks.slice(0, 5).forEach((link, i) => {
    console.log(`[probe]   ${i + 1}. ${link.description}`);
  });
  if (panelLinks.length > 5) {
    console.log(`[probe]   ... and ${panelLinks.length - 5} more`);
  }

  const ss = await browser.screenshot();
  fs.writeFileSync(path.join(probeDir, "labs.png"), Buffer.from(ss, "base64"));
  console.log(`[probe] Labs: screenshot saved to ${probeDir}/labs.png`);
}

/**
 * Drill into every lab/test-result panel and save each one as a PDF.
 * Merges all into <outputDir>/labs.pdf for Claude.ai upload.
 *
 * Skip (incremental mode only): if <outputDir>/labs/ already has .pdf files (set FORCE_LABS=1 to re-run).
 *
 * Returns the number of PDFs written in this run (0 if none extracted).
 * The caller should only record a timestamp in last-extracted.json when the count is > 0.
 */
export async function extractLabsDocs(browser: BrowserProvider, portalUrl: string, navNotes = "", credentials?: { username?: string; password?: string }, outputDir?: string, providerId?: string, cutoff?: Date | null, incremental = false, authenticatedSelectors?: string[], emitProgress?: ProgressEmitter): Promise<number> {
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const baseDir = outputDir ?? process.cwd();
  const labsDir = path.join(baseDir, "labs");
  fs.mkdirSync(labsDir, { recursive: true });

  const existingPdfs = readDirSafe(labsDir).filter((f) => f.endsWith(".pdf"));
  if (incremental && existingPdfs.length > 0 && process.env.FORCE_LABS !== "1") {
    console.log(
      `Step 6: Labs already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_LABS=1 to re-run).`,
    );
    return 0;
  }

  console.log("Step 6: Navigating to lab/test results...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const fallbackAct = 'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.';
  const defaultObserve = "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Return each one as a separate result.";
  const { listInstruction } = await navigateToSection(browser, providerId, "labs", { act: fallbackAct });
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "labs");
  const observeInstruction = listInstruction ?? defaultObserve;
  const panelLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") + observeInstruction,
  );
  console.log(`   Found ${panelLinks.length} panel link(s).`);
  if (panelLinks.length > 0) {
    emit({ type: 'status-message', phase: 'extract', message: `Found ${panelLinks.length} lab results to fetch...` });
  }

  if (panelLinks.length === 0) {
    console.log("   No panels found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(labsDir, "labs-list.png"), Buffer.from(ss, "base64"));
    return 0;
  }

  const listUrl = await browser.url();
  const maxPanels = Math.min(panelLinks.length, 50);
  const savedFiles = readDirSafe(labsDir);
  let extracted = 0;

  for (let i = 0; i < maxPanels; i++) {
    const link = panelLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (incremental && savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Doc ${i + 1}/${maxPanels}: already saved — skipping`);
      continue;
    }
    if (shouldSkipIncremental(link.description, cutoff ?? null)) {
      console.log(`   Doc ${i + 1}/${maxPanels}: before cutoff — skipping (${link.description})`);
      continue;
    }

    const shortDesc = link.description.replace(/^Lab\/test result entry:\s*/i, "").slice(0, 60);
    emit({ type: 'status-message', phase: 'extract', message: `Fetching ${shortDesc}...` });
    console.log(`   Doc ${i + 1}/${maxPanels}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      // Wait for async content (imaging reports load via AJAX after page ready)
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const cleanDesc = link.description
        .replace(/^Lab\/test result entry:\s*/i, "")
        .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
      const filename = makeItemFilename(i, cleanDesc || link.description, ".pdf", providerId);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        emit({ type: 'status-message', phase: 'extract', message: `Saving ${filename}...` });
        fs.writeFileSync(path.join(labsDir, filename), pdfBuf);
        extracted++;
      }
      console.log(`      → saved ${filename}`);
    } catch (err: any) {
      console.log(`      → error: ${err?.message ?? err}`);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(
          path.join(labsDir, `${String(i + 1).padStart(3, "0")}_error.png`),
          Buffer.from(ss, "base64"),
        );
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  const mergedFilename = providerId ? `labs-${providerId}.pdf` : "labs.pdf";
  await mergePdfs(labsDir, path.join(baseDir, mergedFilename), "labs");
  return extracted;
}
