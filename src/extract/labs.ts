import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  readDirSafe,
  makeItemFilename,
  mergePdfs,
  navigateWithRetry,
  logDepth,
} from "./helpers.js";

/**
 * Probe mode: navigate to labs list, observe items, log count + titles,
 * take a screenshot. Does NOT extract any PDFs.
 */
export async function probeLabsDocs(browser: BrowserProvider, mychartUrl: string, probeDir: string, navNotes = "", credentials?: { username?: string; password?: string }, providerId?: string): Promise<void> {
  console.log("[probe] Labs: navigating...");
  await ensureLoggedIn(browser, mychartUrl, credentials, providerId);
  await browser.act(
    'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "labs");

  const panelLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") +
    "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Return each one as a separate result.",
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
 * Skip: if <outputDir>/labs/ already has .pdf files (set FORCE_LABS=1 to re-run).
 */
export async function extractLabsDocs(browser: BrowserProvider, mychartUrl: string, navNotes = "", credentials?: { username?: string; password?: string }, outputDir?: string, providerId?: string): Promise<void> {
  const baseDir = outputDir ?? process.cwd();
  const labsDir = path.join(baseDir, "labs");
  fs.mkdirSync(labsDir, { recursive: true });

  const existingPdfs = readDirSafe(labsDir).filter((f) => f.endsWith(".pdf"));
  if (existingPdfs.length > 0 && process.env.FORCE_LABS !== "1") {
    console.log(
      `Step 6: Labs already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_LABS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 6: Navigating to lab/test results...");
  await ensureLoggedIn(browser, mychartUrl, credentials, providerId);
  await browser.act(
    'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  await logDepth(browser, "labs");
  const panelLinks = await browser.observe(
    (navNotes ? navNotes + "\n\n" : "") +
    "Find all clickable lab result or test result entries on this page. " +
    "Each entry is a row or link representing a specific lab panel or test result (e.g. CBC, MRI, Lipid Panel). " +
    "Return each one as a separate result.",
  );
  console.log(`   Found ${panelLinks.length} panel link(s).`);

  if (panelLinks.length === 0) {
    console.log("   No panels found — saving screenshot.");
    const ss = await browser.screenshot();
    fs.writeFileSync(path.join(labsDir, "labs-list.png"), Buffer.from(ss, "base64"));
    return;
  }

  const listUrl = await browser.url();
  const maxPanels = Math.min(panelLinks.length, 50);
  const savedFiles = readDirSafe(labsDir);

  for (let i = 0; i < maxPanels; i++) {
    const link = panelLinks[i];
    const prefix = String(i + 1).padStart(3, "0") + "_";
    if (savedFiles.some((f) => f.startsWith(prefix) && f.endsWith(".pdf"))) {
      console.log(`   Doc ${i + 1}/${maxPanels}: already saved — skipping`);
      continue;
    }

    console.log(`   Doc ${i + 1}/${maxPanels}: ${link.description}`);
    try {
      await browser.act(`Click the element: ${link.description}`);
      await new Promise((r) => setTimeout(r, 1000));
      // Wait for async content (imaging reports load via AJAX after page ready)
      try { await browser.waitFor({ type: "networkIdle" }); } catch {}

      const cleanDesc = link.description
        .replace(/^Lab\/test result entry:\s*/i, "")
        .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
      const filename = makeItemFilename(i, cleanDesc || link.description);
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        fs.writeFileSync(path.join(labsDir, filename), pdfBuf);
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

  await mergePdfs(labsDir, path.join(baseDir, "labs.pdf"), "labs");
}
