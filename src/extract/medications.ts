import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import { logDepth, navigateToSection } from "./helpers.js";

/**
 * Probe mode: navigate to medications page, log URL, take a screenshot.
 * Does NOT extract any PDFs.
 */
export async function probeMedications(browser: BrowserProvider, mychartUrl: string, probeDir: string, credentials?: { username?: string; password?: string }, providerId?: string): Promise<void> {
  console.log("[probe] Medications: navigating...");
  await ensureLoggedIn(browser, mychartUrl, credentials, providerId);

  const fallbackAct = 'Click the Medications or Medicines link in the navigation menu, sidebar, or home page. ' +
    'Look for text that says "Medications", "Medicines", "My Medications", or "Medication List". ' +
    'It may be in a left sidebar under a Medical Record section.';
  await navigateToSection(browser, providerId, "medications", { act: fallbackAct });
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
export async function extractMedications(browser: BrowserProvider, mychartUrl: string, credentials?: { username?: string; password?: string }, outputDir?: string, providerId?: string, incremental = false): Promise<number> {
  const baseDir = outputDir ?? process.cwd();
  const medsDir = path.join(baseDir, "medications");
  fs.mkdirSync(medsDir, { recursive: true });

  const medsFilename = providerId ? `medications-${providerId}.pdf` : "medications.pdf";
  const pdfPath = path.join(baseDir, medsFilename);
  if (incremental && fs.existsSync(pdfPath) && process.env.FORCE_MEDS !== "1") {
    console.log("Step 8: Medications already extracted — skipping (FORCE_MEDS=1 to re-run).");
    return 0;
  }

  console.log("Step 8: Navigating to medications...");
  await ensureLoggedIn(browser, mychartUrl, credentials, providerId);

  const fallbackAct = 'Click the Medications or Medicines link in the navigation menu, sidebar, or home page. ' +
    'Look for text that says "Medications", "Medicines", "My Medications", or "Medication List". ' +
    'It may be in a left sidebar under a Medical Record section.';
  await navigateToSection(browser, providerId, "medications", { act: fallbackAct });
  await new Promise((r) => setTimeout(r, 3000));
  try { await browser.waitFor({ type: "networkIdle" }); } catch {}

  if (browser.pdf) {
    const pdfBuf = await browser.pdf();
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log(`   ✓ ${medsFilename} (${(pdfBuf.length / 1024).toFixed(0)} KB)`);
    return 1;
  }
  return 0;
}
