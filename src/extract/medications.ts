import * as fs from "node:fs";
import * as path from "node:path";
import { ensureLoggedIn } from "../auth.js";
import { logDepth, navigateToSection } from "./helpers.js";
import { type ExtractionContext } from "./context.js";
import { type BrowserProvider } from "../browser/interface.js";
import { type StructuredProgressEvent } from "../progress-events.js";
import { MEDICATIONS_PROMPTS } from "../prompts.js";

/**
 * Probe mode: navigate to medications page, log URL, take a screenshot.
 * Does NOT extract any PDFs.
 */
export async function probeMedications(browser: BrowserProvider, portalUrl: string, probeDir: string, credentials?: { username?: string; password?: string }, providerId?: string, authenticatedSelectors?: string[]): Promise<void> {
  console.log("[probe] Medications: navigating...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  await navigateToSection(browser, providerId, "medications", { act: MEDICATIONS_PROMPTS.fallbackAct }, portalUrl);
  await new Promise((r) => setTimeout(r, 3000));
  try { await browser.waitFor({ type: "networkIdle" }); } catch {}

  await logDepth(browser, "medications");

  const ss = await browser.screenshot();
  fs.writeFileSync(path.join(probeDir, "medications.png"), Buffer.from(ss, "base64"));
  console.log(`[probe] Medications: screenshot saved to ${probeDir}/medications.png`);
}

/**
 * Returns 1 if the medications PDF was written, 0 otherwise.
 * The caller should only record a timestamp in last-extracted.json when the count is > 0.
 */
export async function extractMedications(ctx: ExtractionContext): Promise<number> {
  const { browser, portalUrl, credentials, outputDir, providerId, incremental = false, authenticatedSelectors, emitProgress } = ctx;
  const emit = (event: StructuredProgressEvent) => {
    if (emitProgress) emitProgress(event);
  };
  const baseDir = outputDir ?? process.cwd();
  const medsDir = path.join(baseDir, "medications");
  fs.mkdirSync(medsDir, { recursive: true });

  const medsFilename = providerId ? `medications-${providerId}.pdf` : "medications.pdf";
  const pdfPath = path.join(baseDir, medsFilename);
  if (incremental && fs.existsSync(pdfPath) && process.env.FORCE_MEDS !== "1") {
    console.log("[extract] Medications already extracted — skipping (FORCE_MEDS=1 to re-run).");
    return 0;
  }

  console.log("[extract] Navigating to medications...");
  await ensureLoggedIn(browser, portalUrl, credentials, providerId, authenticatedSelectors);

  const { navigationFailed } = await navigateToSection(browser, providerId, "medications", { act: MEDICATIONS_PROMPTS.fallbackAct }, portalUrl);
  if (navigationFailed) {
    console.log("[extract] Medications: navigation failed — skipping section.");
    return 0;
  }
  await new Promise((r) => setTimeout(r, 3000));
  try { await browser.waitFor({ type: "networkIdle" }); } catch {}

  if (browser.pdf) {
    emit({ type: 'status-message', phase: 'extract', message: 'Fetching medication list...' });
    const pdfBuf = await browser.pdf();
    emit({ type: 'status-message', phase: 'extract', message: `Saving ${medsFilename}...` });
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log(`[extract] ${medsFilename} (${(pdfBuf.length / 1024).toFixed(0)} KB)`);
    return 1;
  }
  return 0;
}
