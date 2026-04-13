/**
 * MyChart Agent — Zip Packager
 *
 * Bundles extracted health records from output/ into a dated zip file:
 *
 *   mychart-2026-04-13.zip
 *   ├── metadata.json    — run timestamp, record counts
 *   ├── labs/
 *   ├── visits/
 *   ├── medications/
 *   └── messages/
 *
 * Usage:
 *   pnpm package
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import * as fs from "node:fs";
import * as path from "node:path";
import archiver from "archiver";

const OUTPUT_DIR = path.join(import.meta.dirname, "..", "output");
const ROOT_DIR = path.join(import.meta.dirname, "..");

const SECTIONS = ["labs", "visits", "medications", "messages"] as const;

interface RecordCounts {
  labs: number;
  visits: number;
  medications: number;
  messages: number;
}

function countHtmlFiles(subdir: string): number {
  const dir = path.join(OUTPUT_DIR, subdir);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".html")).length;
  } catch {
    return 0;
  }
}

async function packageRecords(): Promise<void> {
  // Verify output exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    console.error("No output/ directory found. Run `pnpm extract` first.");
    process.exit(1);
  }

  const counts: RecordCounts = {
    labs: countHtmlFiles("labs"),
    visits: countHtmlFiles("visits"),
    medications: countHtmlFiles("medications"),
    messages: countHtmlFiles("messages"),
  };

  const totalRecords = Object.values(counts).reduce((s, n) => s + n, 0);
  if (totalRecords === 0) {
    console.error("No extracted records found in output/. Run `pnpm extract` first.");
    process.exit(1);
  }

  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const zipName = `mychart-${dateStr}.zip`;
  const zipPath = path.join(ROOT_DIR, zipName);

  const metadata = {
    exportedAt: new Date().toISOString(),
    mychartUrl: process.env.MYCHART_URL ?? "(not set)",
    recordCounts: counts,
  };

  console.log(`Packaging ${totalRecords} records into ${zipName}...`);
  console.log(`  Labs:        ${counts.labs} documents`);
  console.log(`  Visits:      ${counts.visits} documents`);
  console.log(`  Medications: ${counts.medications} documents`);
  console.log(`  Messages:    ${counts.messages} documents`);

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    out.on("close", resolve);
    archive.on("error", reject);
    archive.pipe(out);

    // metadata.json at root of zip
    archive.append(JSON.stringify(metadata, null, 2), { name: "metadata.json" });

    // index.html at root of zip
    const indexPath = path.join(OUTPUT_DIR, "index.html");
    if (fs.existsSync(indexPath)) {
      archive.file(indexPath, { name: "index.html" });
    }

    // Each section directory
    for (const section of SECTIONS) {
      const sectionDir = path.join(OUTPUT_DIR, section);
      if (fs.existsSync(sectionDir)) {
        archive.directory(sectionDir, section);
      }
    }

    archive.finalize();
  });

  const stats = fs.statSync(zipPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(1);
  console.log(`\nPackage saved: ${zipName} (${sizeMb} MB)`);
}

packageRecords().catch((err) => {
  console.error("Packaging failed:", err);
  process.exit(1);
});
