import * as fs from "node:fs";
import * as path from "node:path";
import { PDFDocument } from "pdf-lib";
import { type BrowserProvider } from "../browser/interface.js";
import { ensureLoggedIn } from "../auth.js";
import {
  OUTPUT_DIR,
  readDirSafe,
  makeItemFilename,
  navigateWithRetry,
} from "./helpers.js";

/**
 * Drill into every lab/test-result panel and save each one as a PDF.
 * Also merges all PDFs into output/labs.pdf for Claude.ai upload.
 *
 * Output: output/labs/{slug}.pdf — one file per panel, output/labs.pdf — merged.
 * Skip: if output/labs/ already has .pdf files (set FORCE_LABS=1 to re-run).
 */
export async function extractLabsDocs(browser: BrowserProvider, mychartUrl: string): Promise<void> {
  const labsDir = path.join(OUTPUT_DIR, "labs");
  fs.mkdirSync(labsDir, { recursive: true });

  const existingPdfs = readDirSafe(labsDir).filter((f) => f.endsWith(".pdf"));
  if (existingPdfs.length > 0 && process.env.FORCE_LABS !== "1") {
    console.log(
      `Step 6b: Labs docs already extracted (${existingPdfs.length} .pdf files) — skipping (FORCE_LABS=1 to re-run).`,
    );
    return;
  }

  console.log("Step 6b: Navigating to lab/test results for full-document extraction...");
  await ensureLoggedIn(browser, mychartUrl);
  await browser.act(
    'Navigate to the Test Results or Lab Results section. Look for links or menu items ' +
    'labeled "Test Results", "Labs", "Lab Results", or similar.',
  );
  await new Promise((r) => setTimeout(r, 3000));

  const panelLinks = await browser.observe(
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
  const index: Array<{ filename: string; title: string; url: string }> = [];
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

      const docUrl = await browser.url();
      const cleanDesc = link.description
        .replace(/^Lab\/test result entry:\s*/i, "")
        .replace(/\s*\((Lab|Imaging|Radiology|Pathology)\)/gi, "");
      const filename = makeItemFilename(i, cleanDesc || link.description, ".pdf");
      if (browser.pdf) {
        const pdfBuf = await browser.pdf();
        fs.writeFileSync(path.join(labsDir, filename), pdfBuf);
      }

      index.push({ filename, title: cleanDesc || link.description, url: docUrl });
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

  fs.writeFileSync(path.join(labsDir, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`   Labs docs saved to ${labsDir} (${index.length} documents)`);

  // Merge all individual PDFs into a single output/labs.pdf for Claude.ai upload
  const pdfFiles = readDirSafe(labsDir).filter((f) => f.endsWith(".pdf")).sort();
  if (pdfFiles.length > 0) {
    console.log(`   Merging ${pdfFiles.length} PDFs → output/labs.pdf...`);
    const merged = await PDFDocument.create();
    for (const pdfFile of pdfFiles) {
      try {
        const bytes = fs.readFileSync(path.join(labsDir, pdfFile));
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      } catch (err: any) {
        console.log(`      → skipping ${pdfFile}: ${err?.message}`);
      }
    }
    const mergedBytes = await merged.save();
    fs.writeFileSync(path.join(OUTPUT_DIR, "labs.pdf"), mergedBytes);
    console.log(`   ✓ output/labs.pdf (${pdfFiles.length} labs, ${(mergedBytes.length / 1024).toFixed(0)} KB)`);
  }
}

