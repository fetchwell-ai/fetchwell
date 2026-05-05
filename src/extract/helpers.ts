import * as fs from "node:fs";
import * as path from "node:path";
import { PDFDocument } from "pdf-lib";
import { type BrowserProvider } from "../browser/interface.js";
import { loadNavMap } from "../discover/nav-map.js";

/** Base output directory (parent of all provider-scoped dirs). */
export const OUTPUT_BASE = path.resolve(import.meta.dirname, "..", "..", "output");

/**
 * @deprecated Use getOutputDir(providerId) for provider-scoped output.
 * Kept temporarily so any transient callers still compile.
 */
export const OUTPUT_DIR = OUTPUT_BASE;

/** Return the provider-scoped output directory: output/<providerId>/ */
export function getOutputDir(providerId: string): string {
  return path.join(OUTPUT_BASE, providerId);
}

export function readNavNotes(outputDir?: string): string {
  const dir = outputDir ?? OUTPUT_BASE;
  const navNotesPath = path.join(dir, "nav-notes.md");
  try {
    const contents = fs.readFileSync(navNotesPath, "utf8");
    console.log(`   Nav notes loaded from ${navNotesPath}`);
    return contents;
  } catch {
    return "";
  }
}

export function readDirSafe(dir: string): string[] {
  try { return fs.readdirSync(dir); } catch { return []; }
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "unknown";
}

export function makeItemFilename(index: number, label: string, ext = ".pdf", providerId?: string): string {
  const suffix = providerId ? `-${providerId}` : "";
  return `${String(index + 1).padStart(3, "0")}_${slugify(label)}${suffix}${ext}`;
}

/** Merge all .pdf files in pdfDir into a single PDF at outputPath. */
export async function mergePdfs(pdfDir: string, outputPath: string, label: string): Promise<void> {
  const pdfFiles = readDirSafe(pdfDir).filter((f) => f.endsWith(".pdf")).sort();
  if (pdfFiles.length === 0) return;
  console.log(`   Merging ${pdfFiles.length} PDFs → ${path.basename(outputPath)}...`);
  const merged = await PDFDocument.create();
  for (const pdfFile of pdfFiles) {
    try {
      const bytes = fs.readFileSync(path.join(pdfDir, pdfFile));
      const doc = await PDFDocument.load(bytes);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((page) => merged.addPage(page));
    } catch (err: any) {
      console.log(`      → skipping ${pdfFile}: ${err?.message}`);
    }
  }
  const mergedBytes = await merged.save();
  fs.writeFileSync(outputPath, mergedBytes);
  console.log(`   ✓ ${path.basename(outputPath)} (${pdfFiles.length} ${label}, ${(mergedBytes.length / 1024).toFixed(0)} KB)`);
}

export async function logDepth(browser: BrowserProvider, section: string): Promise<void> {
  const url = await browser.url();
  const title = await browser.title();
  console.log(`[probe] ${section} | ${url} | ${title}`);
}

export async function navigateWithRetry(browser: BrowserProvider, url: string): Promise<void> {
  try {
    await browser.navigate(url);
  } catch (err: any) {
    const isNetworkError = /ERR_TIMED_OUT|ERR_CONNECTION|net::ERR/i.test(err?.message ?? "");
    if (!isNetworkError) throw err;
    console.log(`   Navigation failed (${err.message?.slice(0, 60)}...) — retrying in 5s`);
    await new Promise((r) => setTimeout(r, 5000));
    await browser.navigate(url);
  }
}

export function buildIndex(outputDir?: string, providerId?: string): void {
  const dir = outputDir ?? OUTPUT_BASE;
  const suffix = providerId ? `-${providerId}` : "";
  const sections: Array<{ name: string; pdf: string }> = [
    { name: "Lab Results", pdf: `labs${suffix}.pdf` },
    { name: "Visits", pdf: `visits${suffix}.pdf` },
    { name: "Medications", pdf: `medications${suffix}.pdf` },
    { name: "Messages", pdf: `messages${suffix}.pdf` },
  ];

  let body = `<h1>MyChart Health Records</h1>\n`;
  body += `<p class="meta">Generated: ${new Date().toISOString()}</p>\n`;
  body += `<p>Upload these PDF files to Claude.ai to analyze your records.</p>\n<ul>\n`;

  for (const { name, pdf } of sections) {
    const pdfPath = path.join(dir, pdf);
    if (fs.existsSync(pdfPath)) {
      const size = (fs.statSync(pdfPath).size / 1024).toFixed(0);
      body += `  <li><a href="${pdf}">${name}</a> — ${size} KB</li>\n`;
    }
  }
  body += `</ul>\n`;

  const css = `body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
       max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1 { color: #0056b3; }
  .meta { font-size: 0.8em; color: #666; margin-bottom: 16px; }
  a { color: #0056b3; }
  li { margin: 10px 0; font-size: 1.1em; }`.trim();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyChart Health Records</title>
<style>${css}</style>
</head>
<body>
${body}
</body>
</html>`;
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
  const relPath = path.relative(OUTPUT_BASE, dir);
  console.log(`   Index saved to output/${relPath}/index.html`);
}

type SectionName = "labs" | "visits" | "medications" | "messages";

/**
 * Navigate to a section using nav-map steps if available, otherwise fall back
 * to the hardcoded act() instruction.
 *
 * Returns { listInstruction } from the nav-map if present, so callers can use
 * it for observe() instead of their hardcoded observe instruction.
 */
export async function navigateToSection(
  browser: BrowserProvider,
  providerId: string | undefined,
  section: SectionName,
  fallback: { act: string; observe?: string },
): Promise<{ listInstruction?: string }> {
  const navMap = providerId ? loadNavMap(providerId) : null;
  const entry = navMap?.sections?.[section];

  if (entry && entry.steps.length > 0) {
    console.log(`   Using nav-map for ${section} navigation (${entry.steps.length} step(s))`);
    for (const step of entry.steps) {
      await browser.act(step);
    }
    return { listInstruction: entry.listInstruction };
  }

  // No nav-map or no entry for this section — use hardcoded fallback
  await browser.act(fallback.act);
  return {};
}
