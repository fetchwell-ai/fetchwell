import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { Medication } from "../schemas.js";
import { ensureLoggedIn } from "../auth.js";
import { OUTPUT_DIR, savePageAsHtml } from "./helpers.js";

export async function extractMedications(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const medsDir = path.join(OUTPUT_DIR, "medications");
  fs.mkdirSync(medsDir, { recursive: true });

  const htmlPath = path.join(medsDir, "medications.html");
  if (fs.existsSync(htmlPath) && process.env.FORCE_MEDS !== "1") {
    console.log("Step 10: Medications already extracted — skipping (FORCE_MEDS=1 to re-run).");
    return;
  }

  console.log("Step 10: Navigating to medications...");
  await ensureLoggedIn(browser, mychartUrl);
  await browser.act(
    'Click the Medications link in the navigation menu or on the home page. ' +
    'Look for text that says "Medications", "My Medications", or "Medication List".',
  );
  await new Promise((r) => setTimeout(r, 3000));

  await savePageAsHtml(browser, medsDir, "medications.html");
  console.log("   Saved medications.html");

  // Also attempt structured extraction
  const MedListSchema = z.object({ medications: z.array(Medication) });
  try {
    const result = await browser.extract(
      MedListSchema,
      "Extract all medications listed on this page. For each medication include: " +
      "full name with strength, dosing instructions, status (active/discontinued), " +
      "prescribing provider, refills remaining, last filled date, and pharmacy.",
    );
    if (result.medications.length > 0) {
      console.log(`   Extracted ${result.medications.length} medication(s).`);
      fs.writeFileSync(
        path.join(medsDir, "medications.json"),
        JSON.stringify(result.medications, null, 2),
      );
    } else {
      console.log("   Structured extraction returned 0 medications (HTML file still saved).");
    }
  } catch (err: any) {
    console.log(`   Structured extraction failed: ${err?.message ?? err} (HTML file still saved).`);
  }
  console.log(`   Medications saved to ${medsDir}`);
}
