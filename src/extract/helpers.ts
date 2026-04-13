import * as fs from "node:fs";
import * as path from "node:path";
import { type BrowserProvider } from "../browser/interface.js";

export const OUTPUT_DIR = path.resolve(import.meta.dirname, "..", "..", "output");

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

export function makeItemFilename(index: number, label: string, ext = ".html"): string {
  return `${String(index + 1).padStart(3, "0")}_${slugify(label)}${ext}`;
}

export const DOC_CSS = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; }
  h1,h2,h3 { color: #0056b3; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; font-size: 0.9em; }
  th { background: #f0f4f8; }
  .meta { font-size: 0.8em; color: #666; border-bottom: 1px solid #eee;
          padding-bottom: 8px; margin-bottom: 16px; }
  a { color: #0056b3; }
  img { max-width: 100%; }
`.trim();

export async function savePageAsHtml(
  browser: BrowserProvider,
  dir: string,
  filename: string,
): Promise<void> {
  const [title, url, content] = await Promise.all([
    browser.title(),
    browser.url(),
    browser.pageHtml(),
  ]);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/</g, "&lt;")}</title>
<style>${DOC_CSS}</style>
</head>
<body>
<div class="meta">
  <strong>Source:</strong> <a href="${url}">${url}</a><br>
  <strong>Extracted:</strong> ${new Date().toISOString()}
</div>
${content}
</body>
</html>`;
  fs.writeFileSync(path.join(dir, filename), html, "utf8");
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

export function buildIndex(): void {
  const sections: Array<{ name: string; subdir: string; ext: string }> = [
    { name: "Lab Results", subdir: "labs", ext: ".html" },
    { name: "Visits", subdir: "visits", ext: ".html" },
    { name: "Medications", subdir: "medications", ext: ".html" },
    { name: "Messages", subdir: "messages", ext: ".html" },
  ];

  let body = `<h1>MyChart Health Records</h1>\n<p class="meta">Generated: ${new Date().toISOString()}</p>\n`;

  for (const { name, subdir, ext } of sections) {
    const dir = path.join(OUTPUT_DIR, subdir);
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(ext)).sort();
    } catch {
      continue;
    }
    if (files.length === 0) continue;
    body += `<h2>${name} (${files.length})</h2>\n<ul>\n`;
    for (const f of files) {
      const label = f.replace(ext, "").replace(/^\d+_/, "").replace(/-/g, " ");
      body += `  <li><a href="${subdir}/${f}">${label}</a></li>\n`;
    }
    body += `</ul>\n`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MyChart Health Records</title>
<style>${DOC_CSS}</style>
</head>
<body>
${body}
</body>
</html>`;
  fs.writeFileSync(path.join(OUTPUT_DIR, "index.html"), html, "utf8");
  console.log(`   Index saved to output/index.html`);
}
