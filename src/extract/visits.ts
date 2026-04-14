import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  OUTPUT_DIR,
  readDirSafe,
  makeItemFilename,
  mergePdfs,
  navigateWithRetry,
} from "./helpers.js";

export async function extractVisits(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const visitsDir = path.join(OUTPUT_DIR, "visits");
  fs.mkdirSync(visitsDir, { recursive: true });

  const existingPdfs = readDirSafe(visitsDir).filter((f) => f.endsWith(".pdf"));
  if (existingPdfs.length > 0 && process.env.FORCE_VISITS !== "1") {
    console.log(
      `Step 7: Visits already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_VISITS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 7: Navigating to visits...");
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
  const maxVisits = Math.min(visitLinks.length, 20);
  const savedFiles = readDirSafe(visitsDir);

  for (let i = 0; i < maxVisits; i++) {
    const link = visitLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Visit ${i + 1}/${maxVisits}: already saved — skipping`);
      continue;
    }

    console.log(`   Visit ${i + 1}/${maxVisits}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const pageTitle = await browser.title();
      const filename = makeItemFilename(i, pageTitle || link.description);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        fs.writeFileSync(path.join(visitsDir, filename), pdfBuf);
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
  await mergePdfs(visitsDir, path.join(OUTPUT_DIR, "visits.pdf"), "visits");
}
