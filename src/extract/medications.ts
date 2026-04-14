import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import { OUTPUT_DIR } from "./helpers.js";

export async function extractMedications(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const medsDir = path.join(OUTPUT_DIR, "medications");
  fs.mkdirSync(medsDir, { recursive: true });

  const pdfPath = path.join(OUTPUT_DIR, "medications.pdf");
  if (fs.existsSync(pdfPath) && process.env.FORCE_MEDS !== "1") {
    console.log("Step 8: Medications already extracted — skipping (FORCE_MEDS=1 to re-run).");
    return;
  }

  console.log("Step 8: Navigating to medications...");
  await ensureLoggedIn(browser, mychartUrl);
  await browser.act(
    'Click the Medications link in the navigation menu or on the home page. ' +
    'Look for text that says "Medications", "My Medications", or "Medication List".',
  );
  await new Promise((r) => setTimeout(r, 3000));
  try { await browser.waitFor({ type: "networkIdle" }); } catch {}

  if (browser.pdf) {
    const pdfBuf = await browser.pdf();
    fs.writeFileSync(pdfPath, pdfBuf);
    console.log(`   ✓ medications.pdf (${(pdfBuf.length / 1024).toFixed(0)} KB)`);
  }
}
