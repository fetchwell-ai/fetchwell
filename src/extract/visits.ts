import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { Visit } from "../schemas.js";
import { ensureLoggedIn } from "../auth.js";
import {
  OUTPUT_DIR,
  readDirSafe,
  slugify,
  makeItemFilename,
  savePageAsHtml,
  navigateWithRetry,
} from "./helpers.js";

export async function extractVisits(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const visitsDir = path.join(OUTPUT_DIR, "visits");
  fs.mkdirSync(visitsDir, { recursive: true });

  const existingHtml = readDirSafe(visitsDir).filter((f) => f.endsWith(".html"));
  if (existingHtml.length > 0 && process.env.FORCE_VISITS !== "1") {
    console.log(
      `Step 9: Visits already extracted (${existingHtml.length} .html files) — skipping (FORCE_VISITS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 9: Navigating to visits...");
  await ensureLoggedIn(browser, mychartUrl);
  await browser.act(
    'Click the Visits link in the navigation menu. It may be labeled "Visits", ' +
    '"Past Visits", or "Appointments". It is usually in the top navigation bar or sidebar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const visitLinks = await browser.observe(
    "Find all clickable past visit or appointment entries on this page. " +
    "Each entry is a row or link for a specific visit with a date and provider. " +
    "Return each one separately.",
  );
  console.log(`   Found ${visitLinks.length} visit link(s).`);

  if (visitLinks.length === 0) {
    console.log("   No visits found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(visitsDir, "visits-list.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const errors: string[] = [];
  const maxVisits = Math.min(visitLinks.length, 20);
  const savedFiles = readDirSafe(visitsDir);

  for (let i = 0; i < maxVisits; i++) {
    const link = visitLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".html"))) {
      console.log(`   Visit ${i + 1}/${maxVisits}: already saved — skipping`);
      continue;
    }

    console.log(`   Visit ${i + 1}/${maxVisits}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 2500));

      const pageTitle = await browser.title();
      const htmlFilename = makeItemFilename(i, pageTitle || link.description);
      await savePageAsHtml(browser, visitsDir, htmlFilename);

      // Also save structured JSON (secondary, for downstream processing)
      try {
        const VisitSchema = z.object({ visit: Visit });
        const result = await browser.extract(
          VisitSchema,
          "Extract all details about this visit: date, visit type, provider name, " +
          "department, location, reason for visit, diagnoses, and any notes or instructions.",
        );
        const v = result.visit;
        const jsonFilename = `${String(i + 1).padStart(3, "0")}_${slugify(v.date || pageTitle)}_${slugify(v.visitType)}.json`;
        fs.writeFileSync(path.join(visitsDir, jsonFilename), JSON.stringify(v, null, 2));
      } catch {
        // JSON extraction is best-effort; HTML is the primary output
      }

      console.log(`      → saved ${htmlFilename}`);
    } catch (err: any) {
      const msg = `Visit ${i + 1} (${link.description}): ${err?.message ?? String(err)}`;
      console.log(`      → error: ${err?.message ?? err}`);
      errors.push(msg);
      try {
        const ss = await browser.screenshot();
        fs.writeFileSync(path.join(visitsDir, `visit-${i + 1}-error.png`), Buffer.from(ss, "base64"));
      } catch {}
    }
    await navigateWithRetry(browser, listUrl);
    await new Promise((r) => setTimeout(r, 1500));
  }

  if (errors.length > 0) {
    fs.writeFileSync(path.join(visitsDir, "errors.json"), JSON.stringify(errors, null, 2));
  }
  console.log(`   Visits saved to ${visitsDir}`);
}
